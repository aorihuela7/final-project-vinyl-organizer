/**
 * Reads and writes the signed-in user's shelf in Supabase. Every call goes
 * through RLS with the Clerk session token; writes that touch several tables
 * use the save_setup / apply_placements functions so they're atomic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordInput } from "@/lib/discogs/map";
import type { Move, Placement, ShelfMedia } from "@/lib/layout";
import type { CompartmentConfig, FurnitureConfig, ShelfConfig, StoredRecord } from "@/lib/shelf/model";
import { DEFAULT_SETTINGS } from "@/lib/shelf/model";
import type { TemplateId } from "@/lib/shelf/templates";

export type CollectionRow = {
  id: string;
  source: "discogs" | "demo" | "manual";
  discogs_username: string | null;
  last_synced_at: string | null;
};

export type JobRow = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  source: "discogs" | "demo";
  discogs_username: string;
  next_page: number;
  total_pages: number | null;
  items_total: number | null;
  items_done: number;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type RemoteState = {
  records: StoredRecord[];
  config: ShelfConfig | null;
  placement: Placement;
  collection: CollectionRow | null;
  activeJob: JobRow | null;
  lastJob: JobRow | null;
  /** When the current map was generated (last initial or relayout event). */
  layoutAt: string | null;
};

const RECORD_COLUMNS =
  "id, discogs_release_id, discogs_instance_id, artist, title, year, label, genre, styles, format_name, format_qty, format_descriptions, media, size_inches, format_group, cover_url, thumb_url, discogs_url, date_added, origin, synced_at";

async function fetchAll<T>(supabase: SupabaseClient, table: string, columns: string, orderBy: string): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(columns).order(orderBy).range(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

type FurnitureRow = {
  id: string;
  name: string;
  template: TemplateId;
  /** In the database 'vinyl' means LPs (12" and 10"); see the v2 format groups migration. */
  media: "vinyl" | "single" | "cd";
  rows: number;
  cols: number;
  traversal: "rows" | "columns";
  default_capacity: number;
  sort_index: number;
};
/** furniture.media in the database ↔ the format group in the app. */
export function mediaFromDb(media: FurnitureRow["media"]): ShelfMedia {
  return media === "vinyl" ? "lp" : media;
}
export function mediaToDb(media: ShelfMedia): FurnitureRow["media"] {
  return media === "lp" ? "vinyl" : media;
}

type CompartmentRow = { id: string; furniture_id: string; row: number; col: number; status: "available" | "blocked"; capacity: number | null };

export async function loadRemote(supabase: SupabaseClient): Promise<RemoteState> {
  const [records, furnitureRes, compartments, settingsRes, placements, collectionRes, jobsRes, eventRes] = await Promise.all([
    fetchAll<StoredRecord>(supabase, "records", RECORD_COLUMNS, "id"),
    supabase.from("furniture").select("id, name, template, media, rows, cols, traversal, default_capacity, sort_index").order("sort_index"),
    fetchAll<CompartmentRow>(supabase, "compartments", "id, furniture_id, row, col, status, capacity", "id"),
    supabase.from("shelf_settings").select("sort_levels, ignore_articles, slack_pct").maybeSingle(),
    fetchAll<{ record_id: string; compartment_id: string }>(supabase, "placements", "record_id, compartment_id", "record_id"),
    supabase.from("collections").select("id, source, discogs_username, last_synced_at").maybeSingle(),
    supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(5),
    supabase.from("layout_events").select("created_at").in("kind", ["initial", "relayout"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const res of [furnitureRes, settingsRes, collectionRes, jobsRes, eventRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const byFurniture = new Map<string, CompartmentConfig[]>();
  for (const c of compartments) {
    const list = byFurniture.get(c.furniture_id) ?? [];
    list.push({ id: c.id, row: c.row, col: c.col, status: c.status, capacity: c.capacity });
    byFurniture.set(c.furniture_id, list);
  }
  const furniture: FurnitureConfig[] = ((furnitureRes.data ?? []) as FurnitureRow[]).map((f) => ({
    key: f.id,
    name: f.name,
    template: f.template,
    media: mediaFromDb(f.media),
    rows: f.rows,
    cols: f.cols,
    traversal: f.traversal,
    defaultCapacity: f.default_capacity,
    sortIndex: f.sort_index,
    compartments: (byFurniture.get(f.id) ?? []).sort((a, b) => a.row - b.row || a.col - b.col),
  }));

  const s = settingsRes.data as { sort_levels: string[]; ignore_articles: boolean; slack_pct: number } | null;
  const settings = s
    ? { sortLevels: s.sort_levels as ShelfConfig["settings"]["sortLevels"], ignoreArticles: s.ignore_articles, slackPct: Number(s.slack_pct) }
    : DEFAULT_SETTINGS;

  const jobs = (jobsRes.data ?? []) as JobRow[];
  return {
    records,
    config: furniture.length > 0 ? { furniture, settings } : null,
    placement: new Map(placements.map((p) => [p.record_id, p.compartment_id])),
    collection: (collectionRes.data as CollectionRow | null) ?? null,
    activeJob: jobs.find((j) => j.status === "queued" || j.status === "running") ?? null,
    lastJob: jobs[0] ?? null,
    layoutAt: (eventRes.data as { created_at: string } | null)?.created_at ?? null,
  };
}

export type LayoutEvent = { kind: "initial" | "insert" | "calibrate" | "relayout" | "format_split"; moves: Move[]; movedCount: number };

function parsePosition(position: string) {
  const [sortIndex, row, col] = position.split(":").map(Number);
  return { sort_index: sortIndex, row, col };
}

/** Replaces shelves, settings, and placements in one transaction. Placements are keyed by position. */
export async function saveSetupRemote(
  supabase: SupabaseClient,
  config: ShelfConfig,
  byPosition: Map<string, string>,
  event: LayoutEvent,
) {
  const { error } = await supabase.rpc("save_setup", {
    p_furniture: config.furniture.map((f) => ({
      name: f.name,
      template: f.template,
      media: mediaToDb(f.media),
      rows: f.rows,
      cols: f.cols,
      traversal: f.traversal,
      default_capacity: f.defaultCapacity,
      sort_index: f.sortIndex,
      compartments: f.compartments.map((c) => ({ row: c.row, col: c.col, status: c.status, capacity: c.capacity })),
    })),
    p_settings: {
      sort_levels: config.settings.sortLevels,
      ignore_articles: config.settings.ignoreArticles,
      slack_pct: config.settings.slackPct,
    },
    p_placements: [...byPosition].map(([recordId, position]) => ({ record_id: recordId, ...parsePosition(position) })),
    p_event: { kind: event.kind, moves: event.moves, moved_count: event.movedCount },
  });
  if (error) throw new Error(error.message);
}

/** Upserts or removes some placements and records the event, in one transaction. */
export async function applyPlacementsRemote(supabase: SupabaseClient, placement: Placement, moves: Move[], event: LayoutEvent) {
  // One row per record, taken from the final placement (a record can appear in several moves).
  const touched = [...new Set(moves.map((m) => m.recordId))];
  const updates = touched.filter((id) => placement.has(id)).map((id) => ({ record_id: id, compartment_id: placement.get(id)! }));
  const removals = touched.filter((id) => !placement.has(id));
  const { error } = await supabase.rpc("apply_placements", {
    p_placements: updates,
    p_event: { kind: event.kind, moves: event.moves, moved_count: event.movedCount },
    p_remove: removals,
  });
  if (error) throw new Error(error.message);
}

export async function addRecordRemote(supabase: SupabaseClient, userId: string, record: RecordInput): Promise<StoredRecord> {
  const { data, error } = await supabase
    .from("records")
    .insert({ ...record, discogs_instance_id: null, user_id: userId, origin: "added", synced_at: new Date().toISOString() })
    .select(RECORD_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StoredRecord;
}

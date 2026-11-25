/**
 * Reads and writes the signed-in user's shelf in Supabase. Every call goes
 * through RLS with the Clerk session token; writes that touch several tables
 * use the save_setup / apply_placements functions so they're atomic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordInput } from "@/lib/discogs/map";
import type { Move, Placement, ShelfMedia } from "@/lib/layout";
import { withoutOtherFormats, withoutRemovedOptions, type CompartmentConfig, type FurnitureConfig, type ShelfConfig, type StoredRecord, type TempLocation } from "@/lib/shelf/model";
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
  locations: TempLocation[];
};

const RECORD_COLUMNS =
  "id, discogs_release_id, discogs_instance_id, artist, title, year, label, genre, styles, format_name, format_qty, format_descriptions, media, size_inches, format_group, cover_url, thumb_url, discogs_url, date_added, origin, synced_at, temp_location_id, taken_out_at";

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
  section: string | null;
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
  const [records, furnitureRes, compartments, settingsRes, placements, collectionRes, jobsRes, eventRes, locationsRes] = await Promise.all([
    fetchAll<StoredRecord>(supabase, "records", RECORD_COLUMNS, "id"),
    supabase.from("furniture").select("id, name, template, media, rows, cols, traversal, default_capacity, sort_index, section").order("sort_index"),
    fetchAll<CompartmentRow>(supabase, "compartments", "id, furniture_id, row, col, status, capacity", "id"),
    supabase.from("shelf_settings").select("sort_levels, ignore_articles, slack_pct, thickness_by_format").maybeSingle(),
    fetchAll<{ record_id: string; compartment_id: string }>(supabase, "placements", "record_id, compartment_id", "record_id"),
    supabase.from("collections").select("id, source, discogs_username, last_synced_at").maybeSingle(),
    supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(5),
    supabase.from("layout_events").select("created_at").in("kind", ["initial", "relayout"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("temporary_locations").select("id, name").order("created_at"),
  ]);
  for (const res of [furnitureRes, settingsRes, collectionRes, jobsRes, eventRes, locationsRes]) {
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
    section: f.section ?? null,
  }));

  const s = settingsRes.data as { sort_levels: string[]; ignore_articles: boolean; slack_pct: number; thickness_by_format?: boolean } | null;
  const settings = s
    ? {
        sortLevels: s.sort_levels as ShelfConfig["settings"]["sortLevels"],
        ignoreArticles: s.ignore_articles,
        slackPct: Number(s.slack_pct),
        thicknessByFormat: !!s.thickness_by_format,
      }
    : DEFAULT_SETTINGS;

  const jobs = (jobsRes.data ?? []) as JobRow[];
  return {
    records: withoutOtherFormats(records),
    config: furniture.length > 0 ? withoutRemovedOptions({ furniture, settings }) : null,
    placement: new Map(placements.map((p) => [p.record_id, p.compartment_id])),
    collection: (collectionRes.data as CollectionRow | null) ?? null,
    activeJob: jobs.find((j) => j.status === "queued" || j.status === "running") ?? null,
    lastJob: jobs[0] ?? null,
    layoutAt: (eventRes.data as { created_at: string } | null)?.created_at ?? null,
    locations: (locationsRes.data ?? []) as TempLocation[],
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
      section: f.section ?? null,
      compartments: f.compartments.map((c) => ({ row: c.row, col: c.col, status: c.status, capacity: c.capacity })),
    })),
    p_settings: {
      sort_levels: config.settings.sortLevels,
      ignore_articles: config.settings.ignoreArticles,
      slack_pct: config.settings.slackPct,
      thickness_by_format: !!config.settings.thicknessByFormat,
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
  // Only the columns of a record from Discogs (callers may pass objects with extra, derived fields).
  const row = {
    discogs_release_id: record.discogs_release_id,
    artist: record.artist,
    title: record.title,
    year: record.year,
    label: record.label,
    genre: record.genre,
    styles: record.styles,
    format_name: record.format_name,
    format_qty: record.format_qty,
    format_descriptions: record.format_descriptions,
    media: record.media,
    size_inches: record.size_inches,
    format_group: record.format_group,
    cover_url: record.cover_url,
    thumb_url: record.thumb_url,
    discogs_url: record.discogs_url,
    date_added: record.date_added,
  };
  const { data, error } = await supabase
    .from("records")
    .insert({ ...row, discogs_instance_id: null, user_id: userId, origin: "added", synced_at: new Date().toISOString() })
    .select(RECORD_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StoredRecord;
}

/** A temporary location by name, created if it doesn't exist yet. */
export async function ensureLocationRemote(supabase: SupabaseClient, userId: string, name: string): Promise<TempLocation> {
  const { data, error } = await supabase
    .from("temporary_locations")
    .upsert({ user_id: userId, name }, { onConflict: "user_id,name" })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data as TempLocation;
}

/** Takes a record out to a location, or puts it back (null). Its placement doesn't change. */
export async function setRecordLocationRemote(supabase: SupabaseClient, recordId: string, locationId: string | null) {
  const { error } = await supabase
    .from("records")
    .update({ temp_location_id: locationId, taken_out_at: locationId ? new Date().toISOString() : null })
    .eq("id", recordId);
  if (error) throw new Error(error.message);
}

export async function deleteLocationRemote(supabase: SupabaseClient, locationId: string) {
  const { error } = await supabase.from("temporary_locations").delete().eq("id", locationId);
  if (error) throw new Error(error.message);
}

/** A random, unguessable token (16 bytes, base64url). */
function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The owner's active guest link, if any. */
export async function activeShareTokenRemote(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("share_links").select("token").is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { token: string } | null)?.token ?? null;
}

/** Turns off every active guest link. */
export async function revokeShareLinksRemote(supabase: SupabaseClient) {
  const { error } = await supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
  if (error) throw new Error(error.message);
}

/** A new guest link; the previous ones stop working and are deleted (an account can keep at most 20). */
export async function createShareLinkRemote(supabase: SupabaseClient, userId: string): Promise<string> {
  const { error: deleteError } = await supabase.from("share_links").delete().eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);
  const token = newToken();
  const { error } = await supabase.from("share_links").insert({ token, user_id: userId });
  if (error) throw new Error(error.message);
  return token;
}

/**
 * The shelf behind a guest link, read without an account through the
 * shared_shelf() database function (it returns only that shelf, or null). When
 * the owner's Discogs data is more than 6 hours old, the function returns no
 * data at all, only that it's stale.
 */
import { createClient } from "@supabase/supabase-js";
import type { Placement } from "@/lib/layout";
import { withoutRemovedOptions, type FurnitureConfig, type ShelfConfig, type StoredRecord, type TempLocation } from "@/lib/shelf/model";
import { DEFAULT_SETTINGS } from "@/lib/shelf/model";
import { mediaFromDb } from "./remote";
import type { TemplateId } from "@/lib/shelf/templates";

export type SharedShelf = {
  records: StoredRecord[];
  config: ShelfConfig | null;
  placement: Placement;
  locations: TempLocation[];
  lastSyncedAt: string | null;
  stale: boolean;
};

type Row = {
  stale?: boolean;
  last_synced_at: string | null;
  settings: { sort_levels: string[]; ignore_articles: boolean; slack_pct: number; thickness_by_format: boolean } | null;
  furniture: Array<{
    id: string;
    name: string;
    template: TemplateId;
    media: "vinyl" | "single" | "cd";
    rows: number;
    cols: number;
    traversal: "rows" | "columns";
    default_capacity: number;
    sort_index: number;
    section: string | null;
    compartments: Array<{ id: string; row: number; col: number; status: "available" | "blocked"; capacity: number | null }>;
  }>;
  placements: Array<[string, string]>;
  records: StoredRecord[];
  locations: TempLocation[];
};

export async function loadSharedShelf(token: string): Promise<SharedShelf | null> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("shared_shelf", { p_token: token });
  if (error) throw new Error(error.message);
  const row = data as Row | null;
  if (!row) return null;
  if (row.stale !== false) {
    return { records: [], config: null, placement: new Map(), locations: [], lastSyncedAt: row.last_synced_at, stale: true };
  }
  const furniture: FurnitureConfig[] = row.furniture.map((f) => ({
    key: f.id,
    name: f.name,
    template: f.template,
    media: mediaFromDb(f.media),
    rows: f.rows,
    cols: f.cols,
    traversal: f.traversal,
    defaultCapacity: f.default_capacity,
    sortIndex: f.sort_index,
    section: f.section,
    compartments: [...f.compartments].sort((a, b) => a.row - b.row || a.col - b.col),
  }));
  const settings = row.settings
    ? {
        sortLevels: row.settings.sort_levels as ShelfConfig["settings"]["sortLevels"],
        ignoreArticles: row.settings.ignore_articles,
        slackPct: Number(row.settings.slack_pct),
        thicknessByFormat: row.settings.thickness_by_format,
      }
    : DEFAULT_SETTINGS;
  return {
    records: row.records,
    config: furniture.length ? withoutRemovedOptions({ furniture, settings }) : null,
    placement: new Map(row.placements),
    locations: row.locations,
    lastSyncedAt: row.last_synced_at,
    stale: false,
  };
}

/**
 * The app's state, shared by the browser-only demo (localStorage) and the
 * signed-in app (Supabase), plus the glue to the layout algorithm.
 */
import type { RecordInput } from "@/lib/discogs/map";
import {
  buildIndex,
  initialLayout,
  positionKey,
  traverse,
  type LayoutRecord,
  type Placement,
  type ShelfIndex,
  type ShelfMedia,
  type ShelfSpec,
  type SortLevel,
  type SortSettings,
} from "@/lib/layout";
import { DEFAULT_SLACK_PCT } from "@/lib/config";
import { defaultCapacity, template, type TemplateId } from "./templates";

export type StoredRecord = RecordInput & {
  id: string;
  origin: "import" | "added";
  synced_at?: string | null;
};

export type CompartmentConfig = {
  row: number;
  col: number;
  status: "available" | "blocked";
  capacity: number | null;
  /** Database id, when saved. */
  id?: string;
};

export type FurnitureConfig = {
  /** Database id when saved, otherwise a local key. */
  key: string;
  name: string;
  template: TemplateId;
  media: ShelfMedia;
  rows: number;
  cols: number;
  traversal: "rows" | "columns";
  defaultCapacity: number;
  sortIndex: number;
  compartments: CompartmentConfig[];
};

export type SettingsConfig = {
  sortLevels: SortLevel[];
  ignoreArticles: boolean;
  slackPct: number;
};

export type ShelfConfig = { furniture: FurnitureConfig[]; settings: SettingsConfig };

export const DEFAULT_SETTINGS: SettingsConfig = { sortLevels: ["artist"], ignoreArticles: true, slackPct: DEFAULT_SLACK_PCT };

export function toSortSettings(settings: SettingsConfig): SortSettings {
  return { levels: settings.sortLevels, ignoreArticles: settings.ignoreArticles };
}

export function toShelfSpecs(furniture: readonly FurnitureConfig[]): ShelfSpec[] {
  return furniture.map((f) => ({
    key: f.key,
    name: f.name,
    media: f.media,
    rows: f.rows,
    cols: f.cols,
    traversal: f.traversal,
    defaultCapacity: f.defaultCapacity,
    sortIndex: f.sortIndex,
    compartments: f.compartments.map((c) => ({ row: c.row, col: c.col, status: c.status, capacity: c.capacity, id: c.id })),
  }));
}

export function toLayoutRecord(r: StoredRecord): LayoutRecord {
  return { id: r.id, artist: r.artist, title: r.title, year: r.year, label: r.label, genre: r.genre, media: r.media };
}

let localCounter = 0;
export function localKey(prefix: string): string {
  localCounter++;
  return `${prefix}-${Date.now().toString(36)}-${localCounter}`;
}

/** A new shelf from a template, with every compartment listed. */
export function newFurniture(id: TemplateId, sortIndex: number, media: ShelfMedia = "vinyl", name?: string): FurnitureConfig {
  const t = template(id);
  return resizeFurniture(
    {
      key: localKey("shelf"),
      name: name ?? (media === "cd" ? `${t.label} (CDs)` : t.label),
      template: id,
      media,
      rows: t.rows,
      cols: t.cols,
      traversal: t.traversal,
      defaultCapacity: defaultCapacity(id, media),
      sortIndex,
      compartments: [],
    },
    t.rows,
    t.cols,
  );
}

/** Changes the grid size, keeping the settings of compartments that still exist. */
export function resizeFurniture(f: FurnitureConfig, rows: number, cols: number): FurnitureConfig {
  const old = new Map(f.compartments.map((c) => [`${c.row}:${c.col}`, c]));
  const compartments: CompartmentConfig[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const prev = old.get(`${row}:${col}`);
      compartments.push(prev ? { ...prev } : { row, col, status: "available", capacity: null });
    }
  }
  return { ...f, rows, cols, compartments };
}

/** The demo's prebuilt shelves (CLAUDE.md): "Living room" Kallax 4×4 with two blocked cubes, "Studio" tower 1×5. */
export function demoConfig(): ShelfConfig {
  const living = newFurniture("kallax_4x4", 0, "vinyl", "Living room");
  living.compartments = living.compartments.map((c) =>
    c.row === 1 && (c.col === 1 || c.col === 2) ? { ...c, status: "blocked" } : c,
  );
  const studio = newFurniture("tower_1x5", 1, "cd", "Studio");
  return { furniture: [living, studio], settings: { sortLevels: ["genre", "artist"], ignoreArticles: true, slackPct: DEFAULT_SLACK_PCT } };
}

/** A first suggestion for an imported collection: enough Kallax 4×4 for the vinyl, and one for CDs if there are any. */
export function suggestedConfig(records: readonly StoredRecord[]): ShelfConfig {
  const vinyl = records.filter((r) => r.media === "vinyl").length;
  const cds = records.filter((r) => r.media === "cd").length;
  const perShelf = 16 * Math.floor(80 * (1 - DEFAULT_SLACK_PCT / 100));
  const furniture: FurnitureConfig[] = [];
  const vinylShelves = Math.max(1, Math.ceil(vinyl / perShelf));
  for (let i = 0; i < vinylShelves; i++) {
    furniture.push(newFurniture("kallax_4x4", furniture.length, "vinyl", vinylShelves > 1 ? `Kallax ${i + 1}` : "Kallax"));
  }
  if (cds > 0) furniture.push(newFurniture("kallax_4x4", furniture.length, "cd", "CD shelf"));
  return { furniture, settings: DEFAULT_SETTINGS };
}

/** Position key (sortIndex:row:col) of each slot id, for comparing placements across saves. */
export function positionsBySlotId(furniture: readonly FurnitureConfig[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const media of ["vinyl", "cd"] as const) {
    for (const s of traverse(toShelfSpecs(furniture), media)) map.set(s.id, s.position);
  }
  return map;
}

/** Placement keyed by position instead of compartment id. */
export function placementByPosition(placement: Placement, furniture: readonly FurnitureConfig[]): Map<string, string> {
  const positions = positionsBySlotId(furniture);
  const out = new Map<string, string>();
  for (const [recordId, slotId] of placement) {
    const pos = positions.get(slotId);
    if (pos) out.set(recordId, pos);
  }
  return out;
}

export type Computed = {
  layout: ReturnType<typeof initialLayout>;
  /** recordId → position key. */
  byPosition: Map<string, string>;
};

/** Runs the initial layout for a config, keyed by position so it can be saved before compartments have ids. */
export function computeInitial(records: readonly StoredRecord[], config: ShelfConfig): Computed {
  const specs = toShelfSpecs(config.furniture).map((s) => ({
    ...s,
    compartments: s.compartments.map((c) => ({ ...c, id: undefined })),
  }));
  const layout = initialLayout(records.map(toLayoutRecord), specs, toSortSettings(config.settings), config.settings.slackPct);
  return { layout, byPosition: new Map(layout.placement) };
}

export type MediaView = {
  media: ShelfMedia;
  index: ShelfIndex;
  /** Records of this media without a placement while shelves of this media exist. */
  unplaced: StoredRecord[];
};

/** Indexes the stored placement for each media group. */
export function buildViews(records: readonly StoredRecord[], config: ShelfConfig, placement: Placement): MediaView[] {
  const specs = toShelfSpecs(config.furniture);
  const settings = toSortSettings(config.settings);
  return (["vinyl", "cd"] as const).map((media) => {
    const slots = traverse(specs, media);
    const group = records.filter((r) => r.media === media);
    const index = buildIndex(group.map(toLayoutRecord), placement, slots, settings);
    const unplaced = slots.length > 0 ? group.filter((r) => !index.positionOf.has(r.id)) : [];
    return { media, index, unplaced };
  });
}

export { positionKey };

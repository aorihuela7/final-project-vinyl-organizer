/**
 * The app's state, shared by the browser-only demo (localStorage) and the
 * signed-in app (Supabase), plus the glue to the layout algorithm.
 */
import type { RecordInput } from "@/lib/discogs/map";
import { groupOfRecord, sizeOfRecord } from "@/lib/discogs/format";
import {
  SHELF_MEDIA,
  SORT_LEVELS,
  buildIndex,
  initialLayout,
  parseSection,
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
import { defaultCapacity, maxRows, rowsPerCube, template, type TemplateId } from "./templates";
import type { RecordSize } from "@/lib/visual/lean";

/** Records saved before v2 may lack the format group columns: they're classified on read. */
export type StoredRecord = Omit<RecordInput, "size_inches" | "format_group"> & Partial<Pick<RecordInput, "size_inches" | "format_group">> & {
  id: string;
  origin: "import" | "added";
  synced_at?: string | null;
  /** Taken out to a temporary location (its placement stays: that's its home spot). */
  temp_location_id?: string | null;
  taken_out_at?: string | null;
};

/** A place outside the sort order: next to the turntable, the gig bag, the discards box… */
export type TempLocation = { id: string; name: string };

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
  /** A genre pinned to this shelf: "genre:Jazz". */
  section?: string | null;
};

export type SettingsConfig = {
  sortLevels: SortLevel[];
  ignoreArticles: boolean;
  slackPct: number;
  /** Count double albums and box sets by their number of discs (capacity in places). */
  thicknessByFormat?: boolean;
};

export type ShelfConfig = { furniture: FurnitureConfig[]; settings: SettingsConfig };

export const DEFAULT_SETTINGS: SettingsConfig = { sortLevels: ["artist"], ignoreArticles: false, slackPct: DEFAULT_SLACK_PCT };

/**
 * Drops options that no longer exist: the "tag" sort level and tag sections
 * (tags were removed during v2). A browser demo saved before then still loads.
 */
export function withoutRemovedOptions(config: ShelfConfig): ShelfConfig {
  const levels = (config.settings.sortLevels as string[]).filter((l): l is SortLevel => (SORT_LEVELS as readonly string[]).includes(l));
  const sections = config.furniture.some((f) => f.section && parseSection(f.section) === null);
  if (levels.length === config.settings.sortLevels.length && !sections) return config;
  return {
    settings: { ...config.settings, sortLevels: levels.length > 0 ? levels : [...DEFAULT_SETTINGS.sortLevels] },
    furniture: config.furniture.map((f) => (f.section && parseSection(f.section) === null ? { ...f, section: null } : f)),
  };
}

export function toSortSettings(settings: SettingsConfig): SortSettings {
  return { levels: settings.sortLevels, ignoreArticles: settings.ignoreArticles, thicknessByFormat: !!settings.thicknessByFormat };
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
    section: f.section ?? null,
  }));
}

/** The record's format group: lp, single, cd, or other. */
export function groupOf(r: StoredRecord) {
  return groupOfRecord(r);
}

/**
 * Cassettes, files, and every other format that doesn't go on a shelf are
 * ignored everywhere in the app: not counted, not searchable, never mentioned.
 * They're still imported (a sync compares its count with Discogs'), just never shown.
 */
export function withoutOtherFormats<T extends StoredRecord>(records: readonly T[]): T[] {
  return records.filter((r) => groupOf(r) !== "other");
}

/** 12, 10, or 7 inches for vinyl (drawings use it for heights); null otherwise. */
export function sizeOf(r: StoredRecord) {
  return sizeOfRecord(r);
}

/** How a record is drawn on a shelf of this format group: CDs as CDs; vinyl by size, 12″ when unknown (7″ on a singles shelf). */
export function drawingSize(r: StoredRecord | undefined, media: ShelfMedia): RecordSize {
  if (media === "cd") return "cd";
  return (r ? sizeOf(r) : null) ?? (media === "single" ? 7 : 12);
}

/** How many discs a record has (its places with thickness by format): 2 for a double album, up to 12 for a box set. */
export function discsOf(r: Pick<StoredRecord, "format_qty" | "media">): number {
  if (r.media === "other") return 1;
  const qty = r.format_qty ?? 1;
  return Math.min(12, Math.max(1, Math.round(qty)));
}

export function toLayoutRecord(r: StoredRecord): LayoutRecord {
  return {
    id: r.id,
    artist: r.artist,
    title: r.title,
    year: r.year,
    label: r.label,
    genre: r.genre,
    media: groupOfRecord(r),
    weight: discsOf(r),
  };
}

let localCounter = 0;
export function localKey(prefix: string): string {
  localCounter++;
  return `${prefix}-${Date.now().toString(36)}-${localCounter}`;
}

/** English names for new shelves; the UI passes translated ones. */
export const DEFAULT_TEMPLATE_NAMES: Record<TemplateId, string> = {
  kallax_4x4: "Cube shelf 4×4",
  kallax_5x5: "Cube shelf 5×5",
  low_2x4: "Low unit 4×2",
  tower_1x5: "Tower 1×5",
  crates: "Crates in a row",
  record_box: "Record box",
  custom: "Custom shelf 3×3",
};

/**
 * The size a shelf's name carries, width × height like furniture: columns ×
 * rows of cubes ("1×5" for a tower, "4×2" for a low unit), also on CD
 * shelves, where each cube holds two rows of CDs.
 */
export function sizeLabel(f: Pick<FurnitureConfig, "rows" | "cols" | "template" | "media">): string {
  return `${f.cols}×${Math.ceil(f.rows / rowsPerCube(f.template, f.media))}`;
}

/** The size of a template as written in its name ("1×5" for a tower). */
export function templateSizeLabel(id: TemplateId): string {
  const t = template(id);
  return `${t.cols}×${t.rows}`;
}

/**
 * Keeps a shelf's name in step with its size: a name with the old size in it
 * ("Tower 1×5", or "Tower 1x5" typed by hand) gets the new one ("Tower 3×5").
 * A name without a size stays as it is.
 */
export function renameForSize(name: string, oldSize: string, newSize: string): string {
  if (oldSize === newSize) return name;
  const [width, height] = oldSize.split("×");
  const pattern = new RegExp(`(^|\\s)${width}\\s?[×xX]\\s?${height}(?=$|[\\s,)])`);
  return name.replace(pattern, `$1${newSize}`);
}

/** Resizes a shelf and keeps its name in step with the new size. */
export function resizeAndRename(f: FurnitureConfig, rows: number, cols: number): FurnitureConfig {
  const next = resizeFurniture(f, rows, cols);
  return { ...next, name: renameForSize(f.name, sizeLabel(f), sizeLabel(next)) };
}

/** "Kallax" is a brand: shelves still named after it (saved before) get the common name. */
export function withoutBrandNames(config: ShelfConfig, cubeShelf: string): ShelfConfig {
  if (!config.furniture.some((f) => /^Kallax(\s|$)/.test(f.name))) return config;
  return { ...config, furniture: config.furniture.map((f) => ({ ...f, name: f.name.replace(/^Kallax(?=\s|$)/, cubeShelf) })) };
}

/** A new shelf from a template, with every compartment listed. */
export function newFurniture(id: TemplateId, sortIndex: number, media: ShelfMedia = "lp", name?: string): FurnitureConfig {
  const t = template(id);
  return resizeFurniture(
    {
      key: localKey("shelf"),
      name: name ?? DEFAULT_TEMPLATE_NAMES[id],
      template: id,
      media,
      rows: t.rows * rowsPerCube(id, media),
      cols: t.cols,
      traversal: t.traversal,
      defaultCapacity: defaultCapacity(id, media),
      sortIndex,
      compartments: [],
    },
    t.rows * rowsPerCube(id, media),
    t.cols,
  );
}

/** A different template for a shelf: its grid and traversal, at the template's size for the shelf's format group. */
export function changeTemplate(f: FurnitureConfig, id: TemplateId): FurnitureConfig {
  const t = template(id);
  return resizeFurniture({ ...f, template: id, traversal: t.traversal, defaultCapacity: defaultCapacity(id, f.media) }, t.rows * rowsPerCube(id, f.media), t.cols);
}

/**
 * A different format group for a shelf. The capacity follows the new group's
 * default unless it was changed by hand. On cube templates CDs stand in two
 * rows per cube, so going to CDs splits every row in two (a blocked cube
 * blocks both of its rows) and coming back joins them (blocked only if both
 * were); per-compartment capacities were counted for the other format, so
 * they're cleared then.
 */
export function changeMedia(f: FurnitureConfig, media: ShelfMedia): FurnitureConfig {
  const capacity = f.defaultCapacity === defaultCapacity(f.template, f.media) ? defaultCapacity(f.template, media) : f.defaultCapacity;
  const from = rowsPerCube(f.template, f.media);
  const to = rowsPerCube(f.template, media);
  if (from === to) return { ...f, media, defaultCapacity: capacity };
  const status = new Map(f.compartments.map((c) => [`${c.row}:${c.col}`, c.status]));
  const rows = to > from ? Math.min(maxRows(f.template, media), f.rows * 2) : Math.ceil(f.rows / 2);
  const compartments: CompartmentConfig[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < f.cols; col++) {
      const blocked =
        to > from
          ? status.get(`${Math.floor(row / 2)}:${col}`) === "blocked"
          : [2 * row, 2 * row + 1].filter((r) => r < f.rows).every((r) => status.get(`${r}:${col}`) === "blocked");
      compartments.push({ row, col, status: blocked ? "blocked" : "available", capacity: null });
    }
  }
  return { ...f, media, defaultCapacity: capacity, rows, compartments };
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

export type DemoNames = { living: string; studio: string; singles: string };
const DEMO_NAMES: DemoNames = { living: "Living room", studio: "Studio", singles: "Singles box" };

/**
 * The demo's prebuilt shelves (CLAUDE.md): "Living room" Kallax 4×4 for LPs with
 * two blocked cubes (the turntable), "Studio" tower 1×5 for CDs, and a
 * "Singles box" record box 1×3 when the collection has singles. Sorted by
 * artist, then album title.
 */
export function demoConfig(records: readonly StoredRecord[] = [], names: DemoNames = DEMO_NAMES): ShelfConfig {
  const living = newFurniture("kallax_4x4", 0, "lp", names.living);
  living.compartments = living.compartments.map((c) =>
    c.row === 1 && (c.col === 1 || c.col === 2) ? { ...c, status: "blocked" } : c,
  );
  const studio = newFurniture("tower_1x5", 1, "cd", names.studio);
  const furniture = [living, studio];
  if (records.some((r) => groupOf(r) === "single")) furniture.push(newFurniture("record_box", 2, "single", names.singles));
  return { furniture, settings: { sortLevels: ["artist", "title"], ignoreArticles: false, slackPct: DEFAULT_SLACK_PCT } };
}

export type SuggestedNames = { lp: (n: number | null) => string; single: string; cd: string };
const SUGGESTED_NAMES: SuggestedNames = { lp: (n) => (n === null ? "Kallax" : `Kallax ${n}`), single: "Singles", cd: "CD shelf" };

/**
 * A first suggestion for an imported collection: enough Kallax 4×4 for the LPs,
 * a record box (or a Kallax, if they don't fit in one) for the singles, and a
 * Kallax for CDs if there are any.
 */
export function suggestedConfig(records: readonly StoredRecord[], names: SuggestedNames = SUGGESTED_NAMES): ShelfConfig {
  const count = (g: string) => records.filter((r) => groupOf(r) === g).length;
  const lps = count("lp");
  const singles = count("single");
  const cds = count("cd");
  const usable = (capacity: number, compartments: number) => compartments * Math.floor(capacity * (1 - DEFAULT_SLACK_PCT / 100));
  const furniture: FurnitureConfig[] = [];
  const lpShelves = Math.max(1, Math.ceil(lps / usable(defaultCapacity("kallax_4x4", "lp"), 16)));
  for (let i = 0; i < lpShelves; i++) {
    furniture.push(newFurniture("kallax_4x4", furniture.length, "lp", names.lp(lpShelves > 1 ? i + 1 : null)));
  }
  if (singles > 0) {
    const fitsInBox = singles <= usable(defaultCapacity("record_box", "single"), 3);
    furniture.push(newFurniture(fitsInBox ? "record_box" : "kallax_4x4", furniture.length, "single", names.single));
  }
  if (cds > 0) furniture.push(newFurniture("kallax_4x4", furniture.length, "cd", names.cd));
  return { furniture, settings: DEFAULT_SETTINGS };
}

/** Position key (sortIndex:row:col) of each slot id, for comparing placements across saves. */
export function positionsBySlotId(furniture: readonly FurnitureConfig[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const media of SHELF_MEDIA) {
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
  return SHELF_MEDIA.map((media) => {
    const slots = traverse(specs, media);
    const group = records.filter((r) => groupOf(r) === media);
    const index = buildIndex(group.map(toLayoutRecord), placement, slots, settings);
    const unplaced = slots.length > 0 ? group.filter((r) => !index.positionOf.has(r.id)) : [];
    return { media, index, unplaced };
  });
}

export { positionKey };

/** Records placed in a compartment of another format group (e.g. a single on an LP shelf). */
export function misplacedRecords(records: readonly StoredRecord[], config: ShelfConfig, placement: Placement): string[] {
  const specs = toShelfSpecs(config.furniture);
  const mediaOfSlot = new Map<string, ShelfMedia>();
  for (const media of SHELF_MEDIA) for (const s of traverse(specs, media)) mediaOfSlot.set(s.id, media);
  const out: string[] = [];
  for (const r of records) {
    const slot = placement.get(r.id);
    if (!slot) continue;
    const media = mediaOfSlot.get(slot);
    if (media && media !== groupOf(r)) out.push(r.id);
  }
  return out;
}

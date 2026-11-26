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
import { MAX_COLS, defaultCapacity, maxRows, rowsPerCube, template, type TemplateId } from "./templates";
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

/**
 * A name no other shelf has: "CD shelf 1×1" becomes "CD shelf 1×1 (2)" when
 * one already exists, so a record's location ("CD shelf 1×1, row 2") is never ambiguous.
 */
export function uniqueShelfName(name: string, others: readonly string[]): string {
  const taken = new Set(others.map((n) => n.trim().toLocaleLowerCase()));
  if (!taken.has(name.trim().toLocaleLowerCase())) return name;
  const base = name.replace(/ \(\d+\)$/, "");
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/**
 * Room for `n` records of a format group whose shelves are full: the group's
 * last shelf gets wider (columns added, up to 20) until the group holds n plus
 * about 20%; past 20 columns, a new shelf is added for the rest. Names follow
 * the size and stay unique. Returns the shelves and the key of the one to show.
 */
export function growForRecords(
  furniture: readonly FurnitureConfig[],
  media: ShelfMedia,
  n: number,
  names: SuggestedNames = SUGGESTED_NAMES,
): { furniture: FurnitureConfig[]; key: string } | null {
  const group = furniture.filter((f) => f.media === media).sort((a, b) => a.sortIndex - b.sortIndex);
  const last = group[group.length - 1];
  if (!last) return null;
  const capacityOf = (f: FurnitureConfig) => f.compartments.filter((c) => c.status === "available").reduce((sum, c) => sum + (c.capacity ?? f.defaultCapacity), 0);
  const missing = Math.ceil(n * SUGGESTED_ROOM) - group.reduce((sum, f) => sum + capacityOf(f), 0);
  const perColumn = Math.max(1, last.rows * last.defaultCapacity);
  const cols = last.cols + Math.max(1, Math.ceil(missing / perColumn));
  const others = (key: string) => furniture.filter((f) => f.key !== key).map((f) => f.name);
  if (cols <= MAX_COLS) {
    const grown = resizeAndRename(last, last.rows, cols);
    grown.name = uniqueShelfName(grown.name, others(last.key));
    return { furniture: furniture.map((f) => (f.key === last.key ? grown : f)), key: last.key };
  }
  // Wider than 20 columns: a new shelf for what doesn't fit, sized like a suggestion.
  const grown = resizeAndRename(last, last.rows, MAX_COLS);
  grown.name = uniqueShelfName(grown.name, others(last.key));
  const left = Math.max(1, Math.ceil((missing - (MAX_COLS - last.cols) * perColumn) / SUGGESTED_ROOM));
  const added = suggestedShelves(media, left, furniture.length, names);
  const result = furniture.map((f) => (f.key === last.key ? grown : f));
  for (const f of added) {
    f.name = uniqueShelfName(f.name, result.map((x) => x.name));
    result.push(f);
  }
  return { furniture: result, key: added[0]!.key };
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

/** Base names for suggested shelves ("Cube shelf", "Singles", "CD shelf"); the size is added to them. */
export type SuggestedNames = { cube: string; single: string; cd: string };
const SUGGESTED_NAMES: SuggestedNames = { cube: "Cube shelf", single: "Singles", cd: "CD shelf" };

/** Suggested shelves hold the collection plus about 20% free. */
export const SUGGESTED_ROOM = 1.2;
/** The largest suggested shelf is 5×5; a bigger collection gets several. */
const MAX_SIDE = 5;

/**
 * The smallest rectangle of cubes, at most 5×5, with at least `cubes` cubes
 * (the squarer one on ties, then the wider): [columns, rows].
 */
export function cubeShape(cubes: number): [number, number] {
  let best: [number, number] = [MAX_SIDE, MAX_SIDE];
  for (let rows = 1; rows <= MAX_SIDE; rows++) {
    for (let cols = rows; cols <= MAX_SIDE; cols++) {
      if (cols * rows < cubes) continue;
      const area = cols * rows;
      const bestArea = best[0] * best[1];
      if (area < bestArea || (area === bestArea && cols - rows < best[0] - best[1])) best = [cols, rows];
    }
  }
  return best;
}

/** Shelves for `cubes` cubes: as many 5×5 as it takes, and the smallest rectangle for the rest. */
export function cubeShelves(cubes: number): Array<[number, number]> {
  const shapes: Array<[number, number]> = [];
  let left = Math.max(1, cubes);
  while (left > MAX_SIDE * MAX_SIDE) {
    shapes.push([MAX_SIDE, MAX_SIDE]);
    left -= MAX_SIDE * MAX_SIDE;
  }
  shapes.push(cubeShape(left));
  return shapes;
}

/** The template a shelf of cubes of this shape matches (the cube presets, or custom). */
function cubeTemplate([cols, rows]: [number, number]): TemplateId {
  if (cols === 4 && rows === 4) return "kallax_4x4";
  if (cols === 5 && rows === 5) return "kallax_5x5";
  if (cols === 4 && rows === 2) return "low_2x4";
  return "custom";
}

/** A shelf of cubes of a given shape for a format group (CDs stand in two rows per cube). */
function cubeShelf(shape: [number, number], sortIndex: number, media: ShelfMedia, name: string): FurnitureConfig {
  const id = cubeTemplate(shape);
  const f = newFurniture(id, sortIndex, media, name);
  return { ...resizeFurniture(f, shape[1] * rowsPerCube(id, media), shape[0]), traversal: "rows" };
}

/**
 * A first suggestion for an imported collection, sized to it: room for every
 * record plus about 20% free (SUGGESTED_ROOM), at least one compartment, and
 * never so little that a record doesn't fit. LPs get the smallest rectangle
 * of cubes that holds them (several shelves past 5×5), singles a record box
 * with as many compartments as they need (or cubes, past three boxes' worth),
 * and CDs cubes of two rows each. An empty collection (started from scratch)
 * gets one cube for LPs.
 */
export function suggestedConfig(records: readonly StoredRecord[], names: SuggestedNames = SUGGESTED_NAMES): ShelfConfig {
  const count = (g: string) => records.filter((r) => groupOf(r) === g).length;
  const lps = count("lp");
  const singles = count("single");
  const cds = count("cd");
  const furniture: FurnitureConfig[] = [];
  const add = (media: ShelfMedia, n: number) => furniture.push(...suggestedShelves(media, n, furniture.length, names));
  if (lps > 0 || singles + cds === 0) add("lp", lps);
  if (singles > 0) add("single", singles);
  if (cds > 0) add("cd", cds);
  return { furniture, settings: DEFAULT_SETTINGS };
}

/**
 * The shelves suggested for n records of one format group, from sort index
 * `start` on (also used to add a missing shelf for a format from "Add a new record").
 */
export function suggestedShelves(media: ShelfMedia, n: number, start: number, names: SuggestedNames = SUGGESTED_NAMES): FurnitureConfig[] {
  const needed = (perCompartment: number) => Math.max(1, Math.ceil((n * SUGGESTED_ROOM) / perCompartment));
  // "Cube shelf 3×2", or "Cube shelf 5×5 (1)", "(2)"… when a group needs several.
  const cubes = (count: number, base: string) => {
    const shapes = cubeShelves(count);
    return shapes.map((shape, i) => cubeShelf(shape, start + i, media, `${base} ${shape[0]}×${shape[1]}${shapes.length > 1 ? ` (${i + 1})` : ""}`));
  };
  if (media === "single") {
    const boxes = needed(defaultCapacity("record_box", "single"));
    if (boxes <= template("record_box").cols) return [resizeFurniture(newFurniture("record_box", start, "single", names.single), 1, boxes)];
    return cubes(needed(defaultCapacity("kallax_4x4", "single")), names.single);
  }
  // A cube holds two rows of CDs.
  if (media === "cd") return cubes(needed(defaultCapacity("kallax_4x4", "cd") * rowsPerCube("kallax_4x4", "cd")), names.cd);
  return cubes(needed(defaultCapacity("kallax_4x4", "lp")), names.cube);
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

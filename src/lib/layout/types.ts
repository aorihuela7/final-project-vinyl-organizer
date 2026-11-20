/** Types for the layout algorithm. Pure TypeScript: no Next or Supabase imports. */

export type SortLevel = "genre" | "artist" | "year" | "label" | "title";
export const SORT_LEVELS: readonly SortLevel[] = ["genre", "artist", "year", "label", "title"];

/**
 * Format groups (v2). Each group is laid out on its own shelves with the same
 * sort settings: LPs (12" and 10") only on LP shelves, singles (7") only on
 * singles shelves, CDs only on CD shelves. "other" (cassettes, files…) is never placed.
 */
export type ShelfMedia = "lp" | "single" | "cd";
export type RecordMedia = ShelfMedia | "other";
export const SHELF_MEDIA: readonly ShelfMedia[] = ["lp", "single", "cd"];

/** The fields of a record the algorithm reads. */
export type LayoutRecord = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  genre: string | null;
  /** The record's format group: which shelves it can go on. */
  media: RecordMedia;
};

export type SortSettings = {
  /** One to three levels, e.g. ["genre", "artist"]. Fixed tiebreakers follow: artist → year → title → id. */
  levels: SortLevel[];
  ignoreArticles: boolean;
  /** Leading articles to ignore. Defaults to DEFAULT_ARTICLES. */
  articles?: readonly string[];
};

export type CompartmentSpec = {
  row: number;
  col: number;
  status: "available" | "blocked";
  /** Overrides the shelf's default capacity. */
  capacity?: number | null;
  /** Database id when the compartment is saved. */
  id?: string;
};

export type ShelfSpec = {
  key: string;
  name: string;
  media: ShelfMedia;
  rows: number;
  cols: number;
  traversal: "rows" | "columns";
  defaultCapacity: number;
  sortIndex: number;
  /** Missing positions are available with the default capacity. */
  compartments: CompartmentSpec[];
};

/** An available compartment, in traversal order within its media group. */
export type Slot = {
  /** The compartment's database id, or its position key when unsaved. */
  id: string;
  /** Stable across saves: `${sortIndex}:${row}:${col}`. */
  position: string;
  shelfKey: string;
  shelfName: string;
  sortIndex: number;
  row: number;
  col: number;
  capacity: number;
  media: ShelfMedia;
  /** Traversal index within the media group (0, 1, 2…). */
  index: number;
};

/** recordId → slot id. */
export type Placement = Map<string, string>;

export type Move = {
  recordId: string;
  /** null = the record wasn't on the shelf (a new record). */
  from: string | null;
  /** null = the record no longer fits anywhere. */
  to: string | null;
};

/** Small builders shared by the layout tests. */
import type { LayoutRecord, ShelfSpec } from "./types";

let counter = 0;

export function rec(artist: string, extra: Partial<LayoutRecord> = {}): LayoutRecord {
  counter++;
  return {
    id: extra.id ?? `r${String(counter).padStart(5, "0")}`,
    artist,
    title: extra.title ?? `Album ${counter}`,
    year: extra.year ?? null,
    label: extra.label ?? null,
    genre: "genre" in extra ? (extra.genre ?? null) : "Rock",
    media: extra.media ?? "lp",
    ...(extra.weight !== undefined ? { weight: extra.weight } : {}),
  };
}

export function shelf(partial: Partial<ShelfSpec> & { rows: number; cols: number }): ShelfSpec {
  return {
    key: partial.key ?? `s${partial.sortIndex ?? 0}`,
    name: partial.name ?? "Shelf",
    media: partial.media ?? "lp",
    traversal: partial.traversal ?? "rows",
    defaultCapacity: partial.defaultCapacity ?? 10,
    sortIndex: partial.sortIndex ?? 0,
    compartments: partial.compartments ?? [],
    rows: partial.rows,
    cols: partial.cols,
  };
}

/** Artists "A000", "A001", … so the order is obvious. */
export function numbered(n: number, prefix = "A"): LayoutRecord[] {
  return Array.from({ length: n }, (_, i) => rec(`${prefix}${String(i).padStart(4, "0")}`, { id: `${prefix}-${i}` }));
}

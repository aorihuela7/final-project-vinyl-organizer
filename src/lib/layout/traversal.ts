/**
 * Traversal: the order in which a sorted list "flows" through the compartments.
 * Shelves go by sort_index; inside a shelf, by rows (left to right, top to
 * bottom) or by columns (top to bottom, then the next column). Blocked
 * compartments are skipped. Vinyl and CD shelves are separate groups.
 */
import type { ShelfMedia, ShelfSpec, Slot } from "./types";

export function positionKey(sortIndex: number, row: number, col: number): string {
  return `${sortIndex}:${row}:${col}`;
}

export function traverse(shelves: readonly ShelfSpec[], media: ShelfMedia): Slot[] {
  const slots: Slot[] = [];
  const ordered = shelves.filter((s) => s.media === media).sort((a, b) => a.sortIndex - b.sortIndex);
  for (const shelf of ordered) {
    const byPosition = new Map(shelf.compartments.map((c) => [`${c.row}:${c.col}`, c]));
    const visit = (row: number, col: number) => {
      const c = byPosition.get(`${row}:${col}`);
      if (c?.status === "blocked") return;
      const position = positionKey(shelf.sortIndex, row, col);
      slots.push({
        id: c?.id ?? position,
        position,
        shelfKey: shelf.key,
        shelfName: shelf.name,
        sortIndex: shelf.sortIndex,
        row,
        col,
        capacity: Math.max(0, c?.capacity ?? shelf.defaultCapacity),
        media,
        index: slots.length,
      });
    };
    if (shelf.traversal === "columns") {
      for (let col = 0; col < shelf.cols; col++) for (let row = 0; row < shelf.rows; row++) visit(row, col);
    } else {
      for (let row = 0; row < shelf.rows; row++) for (let col = 0; col < shelf.cols; col++) visit(row, col);
    }
  }
  return slots;
}

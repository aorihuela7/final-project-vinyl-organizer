/** Furniture templates. Each one is only a set of defaults; everything stays editable. */
import type { ShelfMedia } from "@/lib/layout";

export type TemplateId = "kallax_4x4" | "kallax_5x5" | "low_2x4" | "tower_1x5" | "crates" | "record_box" | "custom";

export type Template = {
  id: TemplateId;
  rows: number;
  cols: number;
  traversal: "rows" | "columns";
  /** Boxes and crates hold fewer records than a cube. */
  kind: "cube" | "box";
};

/**
 * Unmeasured defaults (see the Decisions log in CLAUDE.md), per compartment:
 * LPs 80 per cube and 70 per crate or box; singles (7″) 150 per cube, one row
 * deep, and 100 per box; CDs 60 per cube.
 */
export const CAPACITY = {
  lp: { cube: 80, box: 70 },
  single: { cube: 150, box: 100 },
  cd: { cube: 60, box: 60 },
} as const satisfies Record<ShelfMedia, { cube: number; box: number }>;

export const TEMPLATES: readonly Template[] = [
  { id: "kallax_4x4", rows: 4, cols: 4, traversal: "rows", kind: "cube" },
  { id: "kallax_5x5", rows: 5, cols: 5, traversal: "rows", kind: "cube" },
  { id: "low_2x4", rows: 2, cols: 4, traversal: "rows", kind: "cube" },
  { id: "tower_1x5", rows: 5, cols: 1, traversal: "columns", kind: "cube" },
  { id: "crates", rows: 1, cols: 4, traversal: "rows", kind: "box" },
  { id: "record_box", rows: 1, cols: 3, traversal: "rows", kind: "box" },
  { id: "custom", rows: 3, cols: 3, traversal: "rows", kind: "cube" },
];

export function template(id: TemplateId): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]!;
}

export function defaultCapacity(id: TemplateId, media: ShelfMedia): number {
  return CAPACITY[media][template(id).kind];
}

/** Whether a template's compartments are square cubes (Kallax-like) or wider boxes, for drawing them. */
export function isBoxTemplate(id: TemplateId): boolean {
  return template(id).kind === "box";
}

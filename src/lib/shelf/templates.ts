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
 * deep, and 100 per box; CDs 30 per row of CDs (a Kallax cube with a CD insert
 * holds two rows, so 60 per cube, as in v1).
 */
export const CAPACITY = {
  lp: { cube: 80, box: 70 },
  single: { cube: 150, box: 100 },
  cd: { cube: 30, box: 30 },
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

/**
 * Compartment rows per row of cubes. A CD is about 12.5 cm tall, so a 33 cm
 * Kallax cube with a CD insert holds two rows of CDs with a board between
 * them: on CD shelves each row of CDs is its own compartment (a continuous
 * range, with its own plate), so a Kallax 4×4 for CDs has 8 rows.
 */
export function rowsPerCube(id: TemplateId, media: ShelfMedia): 1 | 2 {
  return media === "cd" && template(id).kind === "cube" ? 2 : 1;
}

/** The builder's limits: up to 20 rows of cubes and 20 columns (on CD shelves, 40 rows of CDs). */
export const MAX_CUBE_ROWS = 20;
export const MAX_COLS = 20;

/** Most compartment rows a shelf can have: 20, or 40 rows of CDs on cube templates. */
export function maxRows(id: TemplateId, media: ShelfMedia): number {
  return MAX_CUBE_ROWS * rowsPerCube(id, media);
}

/** Width ÷ height of one row of CDs: a 33 cm cube split by a board into two rows about 15.7 cm high. */
export const CD_ROW_ASPECT = 2.1;

/** Width ÷ height of a compartment's interior, for drawing it: square cubes, wider boxes, low rows of CDs. */
export function compartmentAspect(id: TemplateId, media: ShelfMedia): number {
  if (media === "cd") return CD_ROW_ASPECT;
  return isBoxTemplate(id) ? 1.25 : 1;
}

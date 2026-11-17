/** Furniture templates. Each one is only a set of defaults; everything stays editable. */
import type { ShelfMedia } from "@/lib/layout";

export type TemplateId = "kallax_4x4" | "kallax_5x5" | "low_2x4" | "tower_1x5" | "crates" | "custom";

export type Template = {
  id: TemplateId;
  label: string;
  description: string;
  rows: number;
  cols: number;
  traversal: "rows" | "columns";
  capacity: number;
};

/** Unmeasured defaults (see the Decisions log in CLAUDE.md). */
export const CAPACITY = { cube: 80, crate: 70, cdCube: 60 } as const;

export const TEMPLATES: readonly Template[] = [
  { id: "kallax_4x4", label: "Kallax 4×4", description: "16 cubes, the classic record shelf", rows: 4, cols: 4, traversal: "rows", capacity: CAPACITY.cube },
  { id: "kallax_5x5", label: "Kallax 5×5", description: "A full wall of 25 cubes", rows: 5, cols: 5, traversal: "rows", capacity: CAPACITY.cube },
  { id: "low_2x4", label: "Low unit 2×4", description: "Low sideboard or TV unit", rows: 2, cols: 4, traversal: "rows", capacity: CAPACITY.cube },
  { id: "tower_1x5", label: "Tower 1×5", description: "Read top to bottom", rows: 5, cols: 1, traversal: "columns", capacity: CAPACITY.cube },
  { id: "crates", label: "Crates in a row", description: "Each crate is a compartment", rows: 1, cols: 4, traversal: "rows", capacity: CAPACITY.crate },
  { id: "custom", label: "Custom", description: "Any grid", rows: 3, cols: 3, traversal: "rows", capacity: CAPACITY.cube },
];

export function template(id: TemplateId): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]!;
}

export function defaultCapacity(id: TemplateId, media: ShelfMedia): number {
  if (media === "cd") return CAPACITY.cdCube;
  return template(id).capacity;
}

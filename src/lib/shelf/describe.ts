import type { Slot } from "@/lib/layout";
import type { Translator } from "@/i18n/core";
import type { FurnitureConfig } from "./model";

type T = Translator["t"];

/** "row 2, column 3" (1-based), dropping the part that doesn't apply to towers, single rows, crates, and boxes. */
export function slotPlace(
  slot: Pick<Slot, "row" | "col">,
  furniture: Pick<FurnitureConfig, "rows" | "cols" | "template"> | undefined,
  t: T,
): string {
  const rows = furniture?.rows ?? 2;
  const cols = furniture?.cols ?? 2;
  if (furniture?.template === "crates" && rows === 1) return t("place.crate", { n: slot.col + 1 });
  if (furniture?.template === "record_box" && rows === 1) return t("place.box", { n: slot.col + 1 });
  if (rows === 1) return t("place.column", { n: slot.col + 1 });
  if (cols === 1) return t("place.fromTop", { n: slot.row + 1 });
  return t("place.rowCol", { row: slot.row + 1, col: slot.col + 1 });
}

/** "Cube shelf 4×4, row 2, column 3"; just the shelf's name when it has a single compartment. */
export function slotTitle(slot: Slot, furniture: FurnitureConfig | undefined, t: T): string {
  if (furniture && furniture.rows * furniture.cols === 1) return slot.shelfName;
  return t("place.title", { shelf: slot.shelfName, place: slotPlace(slot, furniture, t) });
}

/** "2 × Vinyl, LP, Album": the format as Discogs describes it, joined with commas. */
export function formatLine(r: { format_name: string | null; format_qty: number | null; format_descriptions: string[] }): string {
  const parts: string[] = [];
  if (r.format_name) parts.push(r.format_qty && r.format_qty > 1 ? `${r.format_qty} × ${r.format_name}` : r.format_name);
  for (const d of r.format_descriptions ?? []) if (d && !parts.includes(d)) parts.push(d);
  return parts.join(", ");
}

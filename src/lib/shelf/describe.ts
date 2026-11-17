import type { Slot } from "@/lib/layout";
import type { FurnitureConfig } from "./model";

/** "row 2, column 3" (1-based), dropping the part that doesn't apply to towers and single rows. */
export function slotPlace(slot: Pick<Slot, "row" | "col">, furniture: Pick<FurnitureConfig, "rows" | "cols" | "template"> | undefined): string {
  const rows = furniture?.rows ?? 2;
  const cols = furniture?.cols ?? 2;
  if (furniture?.template === "crates" && rows === 1) return `crate ${slot.col + 1}`;
  if (rows === 1) return `column ${slot.col + 1}`;
  if (cols === 1) return `shelf ${slot.row + 1} from the top`;
  return `row ${slot.row + 1}, column ${slot.col + 1}`;
}

export function slotTitle(slot: Slot, furniture: FurnitureConfig | undefined): string {
  return `${slot.shelfName} · ${slotPlace(slot, furniture)}`;
}

export function formatLine(r: { format_name: string | null; format_qty: number | null; format_descriptions: string[] }): string {
  const parts: string[] = [];
  if (r.format_name) parts.push(r.format_qty && r.format_qty > 1 ? `${r.format_qty} × ${r.format_name}` : r.format_name);
  for (const d of r.format_descriptions ?? []) if (d && !parts.includes(d)) parts.push(d);
  return parts.join(", ");
}

/**
 * Live capacity for the shelf builder: how many records a shelf holds, and how
 * full each format group would be with the shelves being edited. Pure.
 */
import { SHELF_MEDIA, type ShelfMedia } from "@/lib/layout";
import type { FurnitureConfig } from "./model";

export type ShelfHolds = {
  /** Records the shelf holds (available compartments, honoring per-compartment capacity). */
  places: number;
  open: number;
  blocked: number;
  /** Compartments with their own capacity. */
  overrides: number;
};

export function shelfHolds(f: Pick<FurnitureConfig, "compartments" | "defaultCapacity">): ShelfHolds {
  let places = 0;
  let open = 0;
  let blocked = 0;
  let overrides = 0;
  for (const c of f.compartments) {
    if (c.status === "blocked") {
      blocked++;
      continue;
    }
    open++;
    if (c.capacity !== null && c.capacity !== undefined) overrides++;
    places += c.capacity ?? f.defaultCapacity;
  }
  return { places, open, blocked, overrides };
}

export type GroupFill = {
  media: ShelfMedia;
  records: number;
  places: number;
  /** Records ÷ places, as a whole percent (0 when there are no places). */
  pct: number;
  /** Places minus the free space to leave. */
  usable: number;
  /** Records that won't fit with the free space (0 when they fit). */
  wontFit: number;
};

/**
 * One row per format group that has records or places. Usable places are
 * rounded down per compartment, as the layout does (capacity × (1 − slack)).
 */
export function groupFills(furniture: readonly FurnitureConfig[], counts: Record<ShelfMedia, number>, slackPct: number): GroupFill[] {
  const slack = Math.min(Math.max(slackPct, 0), 90) / 100;
  return SHELF_MEDIA.map((media) => {
    let places = 0;
    let usable = 0;
    for (const f of furniture.filter((x) => x.media === media)) {
      for (const c of f.compartments) {
        if (c.status === "blocked") continue;
        const cap = c.capacity ?? f.defaultCapacity;
        places += cap;
        usable += cap * (1 - slack);
      }
    }
    usable = Math.floor(usable + 1e-9);
    const records = counts[media] ?? 0;
    return {
      media,
      records,
      places,
      pct: places > 0 ? Math.round((records / places) * 100) : 0,
      usable,
      wontFit: Math.max(0, records - usable),
    };
  }).filter((g) => g.records > 0 || g.places > 0);
}

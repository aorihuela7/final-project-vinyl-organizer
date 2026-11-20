/**
 * Purchase simulator: how many records each insertion method moves.
 *
 * Take a real collection, hold out some records as "purchases" (picked at
 * random with a seed), lay out the rest with the initial layout, then insert
 * the purchases one by one, in a random order, with the naive method (v1) and
 * with minimum moves (v2), each on its own copy of the shelf. Moves are
 * counted the same way the app logs them in layout_events.
 */
import { initialLayout } from "./initial";
import { insertRecord, type InsertStrategy } from "./insert";
import { restrictToSection } from "./sections";
import { traverse } from "./traversal";
import { SHELF_MEDIA, type LayoutRecord, type Placement, type ShelfMedia, type ShelfSpec, type SortSettings } from "./types";

export type SimulationOptions = {
  purchases: number;
  seed: number;
  slackPct: number;
  /**
   * How full the shelves will be once every purchase is in (0–1). When set,
   * every compartment of a group gets the same capacity, chosen so the whole
   * collection fills that share, and the layout keeps no extra free space.
   * Without it, the shelves and free space are used as they are.
   */
  fill?: number;
};

export type MethodResult = {
  /** Every move, including putting each new record on the shelf (what layout_events records). */
  moves: number;
  /** Existing records that had to change compartment. */
  recordsMoved: number;
  /** Purchases that went straight in (1 move). */
  direct: number;
  /** The most moves a single purchase needed. */
  worst: number;
  /** Records pushed off the end of the shelves. */
  overflow: number;
};

export type SimulationResult = {
  purchases: number;
  naive: MethodResult;
  minimum: MethodResult;
};

/** Mulberry32, so the same seed gives the same purchases in the same order. */
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function emptyResult(): MethodResult {
  return { moves: 0, recordsMoved: 0, direct: 0, worst: 0, overflow: 0 };
}

/** Shelves resized so each group's records fill `fill` of its compartments. */
function fillTo(records: readonly LayoutRecord[], shelves: readonly ShelfSpec[], fill: number): ShelfSpec[] {
  const capacityOf = new Map<ShelfMedia, number>();
  for (const media of SHELF_MEDIA) {
    const open = traverse(shelves, media).length;
    const count = records.filter((r) => r.media === media).length;
    if (open > 0) capacityOf.set(media, Math.max(1, Math.ceil(count / (open * Math.min(Math.max(fill, 0.05), 1)))));
  }
  return shelves.map((s) => ({
    ...s,
    defaultCapacity: capacityOf.get(s.media) ?? s.defaultCapacity,
    compartments: s.compartments.map((c) => ({ ...c, capacity: null })),
  }));
}

export function simulatePurchases(records: readonly LayoutRecord[], inputShelves: readonly ShelfSpec[], settings: SortSettings, options: SimulationOptions): SimulationResult {
  let shelves = inputShelves;
  const random = rng(options.seed);
  // Only records that have shelves of their format group can be bought onto the shelf.
  const placeable = records.filter((r) => r.media !== "other" && traverse(shelves, r.media).length > 0);
  const purchases = shuffle(placeable, random).slice(0, Math.min(options.purchases, placeable.length));
  const bought = new Set(purchases.map((r) => r.id));
  const before = records.filter((r) => !bought.has(r.id));
  if (options.fill !== undefined) shelves = fillTo(records, shelves, options.fill);
  const slackPct = options.fill !== undefined ? 0 : options.slackPct;
  const { placement } = initialLayout(before, shelves, settings, slackPct);
  const slotsOf = new Map(SHELF_MEDIA.map((m) => [m, traverse(shelves, m)]));

  const run = (strategy: InsertStrategy): MethodResult => {
    const result = emptyResult();
    let current: Placement = new Map(placement);
    const onShelf = new Map(SHELF_MEDIA.map((m) => [m, before.filter((r) => r.media === m && current.has(r.id))]));
    for (const record of purchases) {
      const media = record.media as ShelfMedia;
      const group = onShelf.get(media)!;
      const section = restrictToSection(slotsOf.get(media)!, group, record);
      const step = insertRecord({ ...section, placement: current, settings }, record, strategy);
      current = step.placement;
      group.push(record);
      for (const id of step.overflow) {
        const i = group.findIndex((r) => r.id === id);
        if (i >= 0) group.splice(i, 1);
      }
      result.moves += step.movedCount;
      result.recordsMoved += step.moves.filter((m) => m.recordId !== record.id).length;
      if (step.movedCount <= 1) result.direct++;
      result.worst = Math.max(result.worst, step.movedCount);
      result.overflow += step.overflow.length;
    }
    return result;
  };

  return { purchases: purchases.length, naive: run("naive"), minimum: run("minimum") };
}

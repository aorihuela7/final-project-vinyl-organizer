/**
 * Reading the stored state: which records are in each compartment, in order,
 * where one record is ("40% from the left"), and its neighbors.
 */
import { aliasesFor, compareKeys, sortKeyOf, type ArtistAliases, type SortKey } from "./sort";
import type { LayoutRecord, Placement, Slot, SortSettings } from "./types";

export type ShelfIndex = {
  slots: Slot[];
  slotById: Map<string, Slot>;
  /** Placed records of this group in global order (slot order, then sort key). */
  sorted: LayoutRecord[];
  keys: Map<string, SortKey>;
  bySlot: Map<string, LayoutRecord[]>;
  positionOf: Map<string, number>;
  slotOf: Map<string, Slot>;
};

/**
 * Orders by compartment first and by sort key inside each compartment. With
 * contiguity this equals the plain sort order; after a calibration that left
 * a compartment overfull it still reflects the physical shelf.
 */
export function buildIndex(
  records: readonly LayoutRecord[],
  placement: Placement,
  slots: Slot[],
  settings: SortSettings,
  aliases: ArtistAliases | undefined = aliasesFor(records, settings),
): ShelfIndex {
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const keys = new Map<string, SortKey>();
  const placed: LayoutRecord[] = [];
  for (const r of records) {
    const slotId = placement.get(r.id);
    if (slotId && slotById.has(slotId)) {
      placed.push(r);
      keys.set(r.id, sortKeyOf(r, settings, aliases));
    }
  }
  placed.sort((a, b) => {
    const sa = slotById.get(placement.get(a.id)!)!.index;
    const sb = slotById.get(placement.get(b.id)!)!.index;
    return sa - sb || compareKeys(keys.get(a.id)!, keys.get(b.id)!, settings.levels);
  });
  const bySlot = new Map<string, LayoutRecord[]>();
  const positionOf = new Map<string, number>();
  const slotOf = new Map<string, Slot>();
  placed.forEach((r, i) => {
    const slot = slotById.get(placement.get(r.id)!)!;
    positionOf.set(r.id, i);
    slotOf.set(r.id, slot);
    const list = bySlot.get(slot.id);
    if (list) list.push(r);
    else bySlot.set(slot.id, [r]);
  });
  return { slots, slotById, sorted: placed, keys, bySlot, positionOf, slotOf };
}

/** Position within the compartment, from 0 (left) to 1 (right): (index + 0.5) / total. */
export function positionInCompartment(indexInSlot: number, totalInSlot: number): number {
  return totalInSlot > 0 ? (indexInSlot + 0.5) / totalInSlot : 0;
}

export type Neighbor = { record: LayoutRecord; slot: Slot };

export type Location = {
  record: LayoutRecord;
  slot: Slot;
  indexInSlot: number;
  totalInSlot: number;
  fraction: number;
  /** Up to two records before, in global order (the nearest last). */
  before: Neighbor[];
  /** Up to two records after, in global order (the nearest first). */
  after: Neighbor[];
};

export function locate(index: ShelfIndex, recordId: string, neighbors = 2): Location | null {
  const position = index.positionOf.get(recordId);
  if (position === undefined) return null;
  const record = index.sorted[position]!;
  const slot = index.slotOf.get(recordId)!;
  const inSlot = index.bySlot.get(slot.id)!;
  const indexInSlot = inSlot.indexOf(record);
  const toNeighbor = (r: LayoutRecord): Neighbor => ({ record: r, slot: index.slotOf.get(r.id)! });
  return {
    record,
    slot,
    indexInSlot,
    totalInSlot: inSlot.length,
    fraction: positionInCompartment(indexInSlot, inSlot.length),
    before: index.sorted.slice(Math.max(0, position - neighbors), position).map(toNeighbor),
    after: index.sorted.slice(position + 1, position + 1 + neighbors).map(toNeighbor),
  };
}

/** Number of records whose compartment differs between two placements (keyed by position, so it works across saves). */
export function countChanges(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): number {
  let changed = 0;
  for (const [id, pos] of after) if (before.get(id) !== pos) changed++;
  for (const id of before.keys()) if (!after.has(id)) changed++;
  return changed;
}

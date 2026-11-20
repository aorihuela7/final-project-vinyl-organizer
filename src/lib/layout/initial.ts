/**
 * Initial layout. The sorted collection is cut into consecutive runs, one per
 * compartment in traversal order (so each compartment holds a continuous
 * range). Run sizes are proportional to each compartment's effective capacity,
 * capacity × (1 − slack), so the free space is spread over the whole shelf
 * instead of piling up at the end: the "library sort" idea, where gaps left
 * everywhere make later insertions cheap.
 */
import { sortRecords } from "./sort";
import { traverse } from "./traversal";
import { SHELF_MEDIA, type LayoutRecord, type Placement, type ShelfMedia, type ShelfSpec, type Slot, type SortSettings } from "./types";

export type Distribution = {
  /** Records per slot, in traversal order. */
  counts: number[];
  /** Records that don't fit anywhere. */
  leftover: number;
  /** True when the collection only fits by eating into the slack. */
  slackReduced: boolean;
};

/**
 * How many of n sorted records go in each slot.
 *
 * - n ≤ effective total: proportional to effective capacity (the slack is kept).
 * - effective total < n ≤ capacity total: proportional to raw capacity (less slack).
 * - n > capacity total: every slot full; the rest are left over and reported.
 *
 * Boundaries are rounded cumulatively (boundary k = round(m × W_k / W)), so the
 * counts add up exactly and no slot ever exceeds its capacity.
 */
export function distribute(n: number, slots: readonly Slot[], slackPct: number): Distribution {
  const slack = Math.min(Math.max(slackPct, 0), 90) / 100;
  const caps = slots.map((s) => Math.max(0, Math.floor(s.capacity)));
  const capacityTotal = caps.reduce((a, b) => a + b, 0);
  const effective = caps.map((c) => c * (1 - slack));
  const effectiveTotal = effective.reduce((a, b) => a + b, 0);

  if (n === 0 || capacityTotal === 0) {
    return { counts: caps.map(() => 0), leftover: n, slackReduced: false };
  }

  let weights: number[];
  let m: number;
  let slackReduced = false;
  if (n <= effectiveTotal) {
    weights = effective;
    m = n;
  } else {
    weights = caps;
    m = Math.min(n, capacityTotal);
    slackReduced = slack > 0;
  }
  const weightTotal = weights.reduce((a, b) => a + b, 0);

  const counts: number[] = [];
  let cumulative = 0;
  let previousBoundary = 0;
  weights.forEach((w, i) => {
    cumulative += w;
    const boundary = i === weights.length - 1 ? m : Math.round((m * cumulative) / weightTotal);
    counts.push(boundary - previousBoundary);
    previousBoundary = boundary;
  });

  // Safety net: rounding can't exceed a capacity, but never trust it blindly.
  let carry = 0;
  for (let i = 0; i < counts.length; i++) {
    counts[i]! += carry;
    carry = Math.max(0, counts[i]! - caps[i]!);
    counts[i]! -= carry;
  }

  return { counts, leftover: n - m + carry, slackReduced };
}

export type GroupLayout = {
  slots: Slot[];
  /** Record ids in sort order (placed first, then leftovers). */
  sortedIds: string[];
  leftover: string[];
  slackReduced: boolean;
  counts: Map<string, number>;
};

export type LayoutResult = {
  placement: Placement;
  groups: Record<ShelfMedia, GroupLayout>;
  /** Records whose format has no shelf (cassettes, files…). */
  notPlaced: string[];
};

export function layoutGroup(records: readonly LayoutRecord[], slots: Slot[], settings: SortSettings, slackPct: number, placement: Placement): GroupLayout {
  const sorted = sortRecords(records, settings);
  const { counts, slackReduced } = distribute(sorted.length, slots, slackPct);
  let next = 0;
  const countMap = new Map<string, number>();
  slots.forEach((slot, i) => {
    const count = counts[i] ?? 0;
    for (let k = 0; k < count; k++) placement.set(sorted[next++]!.id, slot.id);
    countMap.set(slot.id, count);
  });
  return {
    slots,
    sortedIds: sorted.map((r) => r.id),
    leftover: sorted.slice(next).map((r) => r.id),
    slackReduced,
    counts: countMap,
  };
}

export function initialLayout(
  records: readonly LayoutRecord[],
  shelves: readonly ShelfSpec[],
  settings: SortSettings,
  slackPct: number,
): LayoutResult {
  const placement: Placement = new Map();
  const groups = {} as Record<ShelfMedia, GroupLayout>;
  // Each format group flows only through shelves of its own group.
  for (const media of SHELF_MEDIA) {
    groups[media] = layoutGroup(
      records.filter((r) => r.media === media),
      traverse(shelves, media),
      settings,
      slackPct,
      placement,
    );
  }
  return { placement, groups, notPlaced: records.filter((r) => r.media === "other").map((r) => r.id) };
}

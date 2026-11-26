/**
 * Initial layout. The sorted collection is cut into consecutive runs, one per
 * compartment in traversal order (so each compartment holds a continuous
 * range). It uses the fewest compartments, in traversal order, whose effective
 * capacity, capacity × (1 − slack), holds the collection, and spreads the
 * records over those in proportion to their effective capacity. The free space
 * is spread among the records instead of piling up at the end (the "library
 * sort" idea: gaps everywhere make later insertions cheap), and a small
 * collection stays together instead of scattering across empty furniture;
 * the compartments it doesn't need stay empty, at the end.
 */
import { sortRecords } from "./sort";
import { sectionKeyOf, sectionSlots, sectionsOf } from "./sections";
import { traverse } from "./traversal";
import { SHELF_MEDIA, placesOf, type LayoutRecord, type Placement, type ShelfMedia, type ShelfSpec, type Slot, type SortSettings } from "./types";

export type Distribution = {
  /** Records per slot, in traversal order. */
  counts: number[];
  /** Records that don't fit anywhere. */
  leftover: number;
  /** True when the collection only fits by eating into the slack. */
  slackReduced: boolean;
};

/**
 * The fewest slots, in traversal order, whose effective capacity adds up to at
 * least `amount` (all of them if even the total falls short).
 */
export function slotsNeeded(effective: readonly number[], amount: number): number {
  let sum = 0;
  for (let i = 0; i < effective.length; i++) {
    sum += effective[i]!;
    if (sum >= amount - 1e-9) return i + 1;
  }
  return effective.length;
}

/**
 * How many of n sorted records go in each slot.
 *
 * - n ≤ effective total: only the fewest slots that hold n at effective
 *   capacity are used, proportional to their effective capacity (the slack
 *   is kept); the slots after them stay empty.
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
    const used = slotsNeeded(effective, n);
    weights = effective.map((e, i) => (i < used ? e : 0));
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

/**
 * Thickness by format: the same idea with weights. The fewest compartments
 * whose effective capacity holds the collection's places are used, and each
 * one's share of the places is proportional to its effective capacity; records
 * are walked in order and a record goes in the current compartment while its
 * midpoint stays within that compartment's cumulative share and it fits.
 * A record thicker than a whole compartment goes alone in an empty one (flagged
 * by the map as over capacity) instead of blocking the rest.
 */
export function distributeWeighted(weights: readonly number[], slots: readonly Slot[], slackPct: number): Distribution {
  const slack = Math.min(Math.max(slackPct, 0), 90) / 100;
  const caps = slots.map((s) => Math.max(0, Math.floor(s.capacity)));
  const total = weights.reduce((a, b) => a + b, 0);
  const effective = caps.map((c) => c * (1 - slack));
  const effectiveTotal = effective.reduce((a, b) => a + b, 0);
  const capacityTotal = caps.reduce((a, b) => a + b, 0);
  const counts = caps.map(() => 0);
  if (weights.length === 0 || capacityTotal === 0) return { counts, leftover: weights.length, slackReduced: false };
  const useEffective = total <= effectiveTotal;
  const used = useEffective ? slotsNeeded(effective, total) : caps.length;
  const shares = (useEffective ? effective : caps).map((s, i) => (i < used ? s : 0));
  const shareTotal = shares.reduce((a, b) => a + b, 0);
  const placeable = Math.min(total, capacityTotal);
  const cumulative: number[] = [];
  let acc = 0;
  for (const share of shares) {
    acc += share;
    cumulative.push((placeable * acc) / shareTotal);
  }
  let slot = 0;
  let load = 0;
  let assigned = 0;
  let placed = 0;
  for (const w of weights) {
    while (slot < slots.length) {
      const fits = load + w <= caps[slot]! || (load === 0 && w > caps[slot]! && caps[slot]! > 0);
      const withinShare = assigned + w / 2 <= cumulative[slot]! + 1e-9;
      if (fits && (withinShare || slot === slots.length - 1)) break;
      slot++;
      load = 0;
    }
    if (slot >= slots.length) break;
    counts[slot]!++;
    load += w;
    assigned += w;
    placed++;
  }
  return { counts, leftover: weights.length - placed, slackReduced: !useEffective && slack > 0 };
}

export function layoutGroup(records: readonly LayoutRecord[], slots: Slot[], settings: SortSettings, slackPct: number, placement: Placement): GroupLayout {
  const sorted = sortRecords(records, settings);
  const weighted = !!settings.thicknessByFormat && sorted.some((r) => placesOf(r, settings) !== 1);
  const { counts, slackReduced } = weighted ? distributeWeighted(sorted.map((r) => placesOf(r, settings)), slots, slackPct) : distribute(sorted.length, slots, slackPct);
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
    const slots = traverse(shelves, media);
    const group = records.filter((r) => r.media === media);
    const sections = sectionsOf(slots);
    if (sections.length === 0) {
      groups[media] = layoutGroup(group, slots, settings, slackPct, placement);
      continue;
    }
    // Each section on its own shelves; the rest on the shelves without a section.
    const parts = [...sections, null].map((key) =>
      layoutGroup(
        group.filter((r) => sectionKeyOf(r, sections) === key),
        sectionSlots(slots, key),
        settings,
        slackPct,
        placement,
      ),
    );
    groups[media] = {
      slots,
      sortedIds: parts.flatMap((p) => p.sortedIds),
      leftover: parts.flatMap((p) => p.leftover),
      slackReduced: parts.some((p) => p.slackReduced),
      counts: new Map(parts.flatMap((p) => [...p.counts])),
    };
  }
  return { placement, groups, notPlaced: records.filter((r) => r.media === "other").map((r) => r.id) };
}

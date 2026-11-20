import { describe, expect, it } from "vitest";
import { insertRecord, type InsertStrategy } from "./insert";
import { buildIndex } from "./query";
import { sortRecords } from "./sort";
import { simulatePurchases } from "./simulate";
import { traverse } from "./traversal";
import { initialLayout } from "./initial";
import { rec, shelf } from "./test-helpers";
import type { LayoutRecord, Placement, Slot, SortSettings } from "./types";

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: false };

/** A shelf with the given capacities and counts: compartment i holds counts[i] records, in sort order. */
function setup(capacities: number[], counts: number[]) {
  const s = shelf({ rows: 1, cols: capacities.length, defaultCapacity: 1, compartments: capacities.map((capacity, col) => ({ row: 0, col, status: "available" as const, capacity })) });
  const slots = traverse([s], "lp");
  const total = counts.reduce((a, b) => a + b, 0);
  // Artists A00, A02, A04… leave odd numbers free for new records anywhere in the order.
  const records = Array.from({ length: total }, (_, i) => rec(`A${String(i * 2).padStart(3, "0")}`, { id: `r${i}` }));
  const placement: Placement = new Map();
  let k = 0;
  counts.forEach((c, i) => {
    for (let j = 0; j < c; j++) placement.set(records[k++]!.id, slots[i]!.id);
  });
  return { slots, records, placement };
}

/** Every contiguous layout of the sorted records that respects capacity: the fewest records that change compartment, plus 1 for the new one. */
function bruteForceMinimum(slots: Slot[], records: LayoutRecord[], placement: Placement, added: LayoutRecord): number {
  const sorted = sortRecords([...records, added], byArtist);
  let best = Infinity;
  const caps = slots.map((s) => s.capacity);
  const counts: number[] = [];
  const walk = (i: number, left: number) => {
    if (i === slots.length) {
      if (left !== 0) return;
      let moved = 0;
      let k = 0;
      counts.forEach((c, slot) => {
        for (let j = 0; j < c; j++) {
          const r = sorted[k++]!;
          if (r.id === added.id || placement.get(r.id) !== slots[slot]!.id) moved++;
        }
      });
      best = Math.min(best, moved);
      return;
    }
    for (let c = 0; c <= Math.min(caps[i]!, left); c++) {
      counts.push(c);
      walk(i + 1, left - c);
      counts.pop();
    }
  };
  walk(0, sorted.length);
  return best;
}

function assertValid(slots: Slot[], records: LayoutRecord[], placement: Placement) {
  const index = buildIndex(records, placement, slots, byArtist);
  let last = -1;
  for (const r of sortRecords(records.filter((x) => placement.has(x.id)), byArtist)) {
    const i = slots.findIndex((s) => s.id === placement.get(r.id));
    expect(i).toBeGreaterThanOrEqual(last);
    last = i;
  }
  for (const s of slots) expect(index.bySlot.get(s.id)?.length ?? 0).toBeLessThanOrEqual(s.capacity);
}

const insert = (strategy: InsertStrategy, slots: Slot[], records: LayoutRecord[], placement: Placement, r: LayoutRecord) =>
  insertRecord({ slots, records, placement, settings: byArtist }, r, strategy);

describe("minimum-move insertion", () => {
  it("goes straight in when the compartment has room", () => {
    const { slots, records, placement } = setup([3, 3, 3], [2, 2, 2]);
    const result = insert("minimum", slots, records, placement, rec("A001", { id: "new" }));
    expect(result.movedCount).toBe(1);
    expect(result.target).toBe(slots[0]!.id);
  });

  it("shifts backward when the nearest room is behind, where the naive method cascades forward", () => {
    // [2/3] [3/3] [3/3] [3/3] [0/3]: a record that sorts inside the second compartment.
    const { slots, records, placement } = setup([3, 3, 3, 3, 3], [2, 3, 3, 3, 0]);
    const added = rec("A007", { id: "new" }); // between r3 and r4, both in the second compartment
    const naive = insert("naive", slots, records, placement, added);
    const minimum = insert("minimum", slots, records, placement, added);
    expect(naive.movedCount).toBe(4); // the new record + one push across each of three boundaries
    expect(minimum.movedCount).toBe(2); // the new record + the second compartment's first record goes back
    assertValid(slots, [...records, added], minimum.placement);
  });

  it("matches a brute-force search on every small shelf", () => {
    const capacitySets = [
      [2, 2, 2],
      [1, 3, 2],
      [3, 1, 1, 3],
      [2, 2, 2, 2],
    ];
    let cases = 0;
    for (const capacities of capacitySets) {
      // Every way to fill the shelf, leaving at least one free place somewhere.
      const fills: number[][] = [];
      const walk = (i: number, acc: number[]) => {
        if (i === capacities.length) {
          if (acc.reduce((a, b) => a + b, 0) < capacities.reduce((a, b) => a + b, 0)) fills.push([...acc]);
          return;
        }
        for (let c = 0; c <= capacities[i]!; c++) walk(i + 1, [...acc, c]);
      };
      walk(0, []);
      for (const counts of fills) {
        const { slots, records, placement } = setup(capacities, counts);
        // A new record in every possible gap of the sort order.
        for (let g = 0; g <= records.length; g++) {
          const added = rec(g === 0 ? "A" : `A${String(g * 2 - 1).padStart(3, "0")}`, { id: "new" });
          const minimum = insert("minimum", slots, records, placement, added);
          const naive = insert("naive", slots, records, placement, added);
          expect(minimum.overflow).toEqual([]);
          expect(minimum.movedCount).toBe(bruteForceMinimum(slots, records, placement, added));
          // The naive method only cascades forward: when there's no room ahead it pushes a record off the shelf.
          if (naive.overflow.length === 0) expect(minimum.movedCount).toBeLessThanOrEqual(naive.movedCount);
          assertValid(slots, [...records, added], minimum.placement);
          cases++;
        }
      }
    }
    expect(cases).toBeGreaterThan(100);
  });

  it("keeps both invariants over 300 random insertions and never moves more than the naive method", () => {
    const shelves = [shelf({ rows: 2, cols: 4, defaultCapacity: 12, compartments: [{ row: 0, col: 2, status: "blocked" }] })];
    const slots = traverse(shelves, "lp");
    const start = Array.from({ length: 60 }, (_, i) => rec(`Artist ${String((i * 37) % 997).padStart(3, "0")}`, { id: `s${i}` }));
    const { placement } = initialLayout(start, shelves, byArtist, 10);
    let records = [...start];
    let current = placement;
    let naiveTotal = 0;
    let minimumTotal = 0;
    for (let i = 0; i < 300 && records.length < 84; i++) {
      const added = rec(`Artist ${String((i * 7919) % 997).padStart(3, "0")}`, { id: `n${i}` });
      const minimum = insert("minimum", slots, records, current, added);
      const naive = insert("naive", slots, records, current, added);
      // Totals only count the steps where the naive method kept every record on the shelf.
      if (naive.overflow.length === 0) {
        minimumTotal += minimum.movedCount;
        naiveTotal += naive.movedCount;
      }
      expect(minimum.overflow).toEqual([]);
      if (naive.overflow.length === 0) expect(minimum.movedCount).toBeLessThanOrEqual(naive.movedCount);
      current = minimum.placement;
      records = [...records, added].filter((r) => current.has(r.id));
      assertValid(slots, records, current);
    }
    expect(minimumTotal).toBeLessThanOrEqual(naiveTotal);
  });
});

describe("purchase simulator", () => {
  it("replays purchases with both methods and is deterministic", () => {
    const shelves = [shelf({ rows: 4, cols: 4, defaultCapacity: 20 }), shelf({ key: "b", rows: 1, cols: 3, defaultCapacity: 20, media: "single", sortIndex: 1 })];
    const records = Array.from({ length: 300 }, (_, i) => rec(`Artist ${String((i * 7919) % 1009).padStart(4, "0")}`, { id: `c${i}`, media: i % 10 === 0 ? "single" : "lp" }));
    const a = simulatePurchases(records, shelves, byArtist, { purchases: 100, seed: 42, slackPct: 0 });
    const b = simulatePurchases(records, shelves, byArtist, { purchases: 100, seed: 42, slackPct: 0 });
    expect(a).toEqual(b);
    expect(a.purchases).toBe(100);
    expect(a.minimum.moves).toBeLessThanOrEqual(a.naive.moves);
    expect(a.minimum.recordsMoved).toBeLessThanOrEqual(a.naive.recordsMoved);
    expect(a.naive.moves).toBeGreaterThanOrEqual(100);
  });

  it("on nearly full shelves, minimum moves move fewer records than the naive method", () => {
    const shelves = [shelf({ rows: 4, cols: 4, defaultCapacity: 20 })];
    const records = Array.from({ length: 500 }, (_, i) => rec(`Artist ${String((i * 7919) % 1009).padStart(4, "0")}`, { id: `f${i}` }));
    const r = simulatePurchases(records, shelves, byArtist, { purchases: 100, seed: 7, slackPct: 10, fill: 0.97 });
    expect(r.minimum.overflow).toBe(0);
    expect(r.minimum.recordsMoved).toBeLessThan(r.naive.recordsMoved);
  });
});

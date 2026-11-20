import { describe, expect, it } from "vitest";
import { distributeWeighted, initialLayout } from "./initial";
import { insertRecord } from "./insert";
import { buildIndex } from "./query";
import { sortRecords } from "./sort";
import { traverse } from "./traversal";
import { rec, shelf } from "./test-helpers";
import { weightOf, type LayoutRecord, type Placement, type ShelfSpec, type Slot, type SortSettings } from "./types";

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: false, thicknessByFormat: true };

/** Records where every fourth is a double album and every tenth a 4-disc box. */
function mixed(n: number): LayoutRecord[] {
  return Array.from({ length: n }, (_, i) => rec(`Artist ${String(i).padStart(4, "0")}`, { id: `w${i}`, weight: i % 10 === 9 ? 4 : i % 4 === 3 ? 2 : 1 }));
}

function loads(records: LayoutRecord[], placement: Placement, slots: Slot[]) {
  const index = buildIndex(records, placement, slots, byArtist);
  return slots.map((s) => (index.bySlot.get(s.id) ?? []).reduce((n, r) => n + weightOf(r), 0));
}

function countsOf(records: LayoutRecord[], placement: Placement, slots: Slot[]) {
  const index = buildIndex(records, placement, slots, byArtist);
  return slots.map((s) => index.bySlot.get(s.id)?.length ?? 0);
}

function assertContiguous(records: LayoutRecord[], placement: Placement, slots: Slot[]) {
  let last = -1;
  for (const r of sortRecords(records.filter((x) => placement.has(x.id)), byArtist)) {
    const i = slots.findIndex((s) => s.id === placement.get(r.id));
    expect(i).toBeGreaterThanOrEqual(last);
    last = i;
  }
}

describe("thickness by format", () => {
  it("spreads places, not records, in proportion to effective capacity, never over capacity", () => {
    const shelves: ShelfSpec[] = [shelf({ rows: 2, cols: 4, defaultCapacity: 40 })];
    const slots = traverse(shelves, "lp");
    for (const n of [0, 1, 37, 120, 160, 200]) {
      const records = mixed(n);
      const result = initialLayout(records, shelves, byArtist, 10);
      const placed = records.filter((r) => result.placement.has(r.id));
      assertContiguous(placed, result.placement, slots);
      for (const load of loads(placed, result.placement, slots)) expect(load).toBeLessThanOrEqual(40);
      expect(result.placement.size + result.groups.lp.leftover.length).toBe(n);
    }
    // 120 records weigh 180 places: with 10% free space (288 places), each compartment gets about 180 / 8.
    const records = mixed(120);
    const spread = loads(records, initialLayout(records, shelves, byArtist, 10).placement, slots);
    for (const load of spread) expect(Math.abs(load - 180 / 8)).toBeLessThanOrEqual(2);
  });

  it("ignores weights when the setting is off (v1: one place per record)", () => {
    const shelves: ShelfSpec[] = [shelf({ rows: 1, cols: 4, defaultCapacity: 10 })];
    const slots = traverse(shelves, "lp");
    const records = mixed(36);
    const off = initialLayout(records, shelves, { ...byArtist, thicknessByFormat: false }, 10);
    expect(countsOf(records, off.placement, slots)).toEqual([9, 9, 9, 9]);
  });

  it("reports what doesn't fit, counted in records", () => {
    const { counts, leftover } = distributeWeighted([2, 2, 2, 2, 2, 2], traverse([shelf({ rows: 1, cols: 2, defaultCapacity: 4 })], "lp"), 0);
    expect(counts).toEqual([2, 2]);
    expect(leftover).toBe(2);
  });

  it("puts a record thicker than a compartment alone in an empty one instead of blocking the rest", () => {
    const { counts, leftover } = distributeWeighted([1, 12, 1], traverse([shelf({ rows: 1, cols: 3, defaultCapacity: 6 })], "lp"), 0);
    expect(counts.reduce((a, b) => a + b, 0) + leftover).toBe(3);
    expect(counts.filter((c) => c > 0).length).toBeGreaterThanOrEqual(2);
  });

  it("inserts a double album where there's room for two, cascading by places", () => {
    const slots = traverse([shelf({ rows: 1, cols: 3, defaultCapacity: 4 })], "lp");
    const records = [rec("A1", { id: "a" }), rec("A2", { id: "b" }), rec("A3", { id: "c" }), rec("C1", { id: "d" }), rec("C2", { id: "e" })];
    const placement: Placement = new Map([
      ["a", slots[0]!.id],
      ["b", slots[0]!.id],
      ["c", slots[0]!.id],
      ["d", slots[1]!.id],
      ["e", slots[1]!.id],
    ]);
    // The first compartment has 1 free place; a double album needs 2.
    const double = rec("A25", { id: "new", weight: 2 });
    for (const strategy of ["naive", "minimum"] as const) {
      const result = insertRecord({ slots, records, placement, settings: byArtist }, double, strategy);
      const all = [...records, double];
      for (const load of loads(all, result.placement, slots)) expect(load).toBeLessThanOrEqual(4);
      assertContiguous(all, result.placement, slots);
      expect(result.target).not.toBeNull();
    }
  });
});

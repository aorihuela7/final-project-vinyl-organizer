import { describe, expect, it } from "vitest";
import { calibrateCount } from "./calibrate";
import { buildIndex } from "./query";
import { traverse } from "./traversal";
import { numbered, shelf } from "./test-helpers";
import type { Placement, SortSettings } from "./types";

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: false };

function setup(counts: number[], capacity = 10) {
  const slots = traverse([shelf({ rows: 1, cols: counts.length, defaultCapacity: capacity })], "lp");
  const records = numbered(counts.reduce((a, b) => a + b, 0));
  const placement: Placement = new Map();
  let k = 0;
  counts.forEach((c, i) => {
    for (let j = 0; j < c; j++) placement.set(records[k++]!.id, slots[i]!.id);
  });
  return { slots, records, placement };
}

const sizes = (slots: ReturnType<typeof setup>["slots"], records: ReturnType<typeof setup>["records"], placement: Placement) => {
  const index = buildIndex(records, placement, slots, byArtist);
  return slots.map((s) => index.bySlot.get(s.id)?.length ?? 0);
};

describe("calibration by count", () => {
  it("moves the last records forward when there are fewer than the map says", () => {
    const { slots, records, placement } = setup([8, 8, 8]);
    const result = calibrateCount({ slots, records, placement, settings: byArtist }, slots[1]!.id, 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.movedCount).toBe(2);
    expect(sizes(slots, records, result.placement)).toEqual([8, 6, 10]);
    // Only the boundary between the compartment and the next one moved.
    expect(result.moves.every((m) => m.from === slots[1]!.id && m.to === slots[2]!.id)).toBe(true);
  });

  it("pulls records back from the next compartment when there are more, and flags over capacity", () => {
    const { slots, records, placement } = setup([8, 8, 8]);
    const result = calibrateCount({ slots, records, placement, settings: byArtist }, slots[0]!.id, 11);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sizes(slots, records, result.placement)).toEqual([11, 5, 8]);
    expect(result.overCapacity).toEqual([slots[0]!.id]);
  });

  it("does nothing when the count already matches", () => {
    const { slots, records, placement } = setup([8, 8]);
    const result = calibrateCount({ slots, records, placement, settings: byArtist }, slots[0]!.id, 8);
    expect(result.ok && result.movedCount).toBe(0);
  });

  it("refuses what would need another boundary", () => {
    const { slots, records, placement } = setup([8, 3]);
    const last = calibrateCount({ slots, records, placement, settings: byArtist }, slots[1]!.id, 1);
    expect(!last.ok && last.code).toBe("lastCompartment");
    const short = calibrateCount({ slots, records, placement, settings: byArtist }, slots[0]!.id, 12);
    expect(!short.ok && short.code).toBe("notEnough");
    const bad = calibrateCount({ slots, records, placement, settings: byArtist }, slots[0]!.id, -2);
    expect(!bad.ok && bad.code).toBe("badCount");
  });
});

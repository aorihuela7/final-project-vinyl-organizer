import { describe, expect, it } from "vitest";
import { groupFills, shelfHolds } from "./capacity";
import { newFurniture } from "./model";

describe("shelfHolds", () => {
  it("counts available compartments, blocked ones, and per-compartment capacity", () => {
    const f = newFurniture("kallax_4x4", 0, "lp");
    expect(shelfHolds(f)).toEqual({ places: 1280, open: 16, blocked: 0, overrides: 0 });
    f.compartments[5] = { ...f.compartments[5]!, status: "blocked" };
    f.compartments[6] = { ...f.compartments[6]!, status: "blocked" };
    f.compartments[0] = { ...f.compartments[0]!, capacity: 60 };
    expect(shelfHolds(f)).toEqual({ places: 14 * 80 - 20, open: 14, blocked: 2, overrides: 1 });
  });
});

describe("groupFills", () => {
  it("reports how full each format group would be, and how many won't fit with the free space", () => {
    const lp = newFurniture("kallax_4x4", 0, "lp");
    const singles = newFurniture("record_box", 1, "single");
    const fills = groupFills([lp, singles], { lp: 1392, single: 157, cd: 0 }, 10);
    expect(fills).toEqual([
      { media: "lp", records: 1392, places: 1280, pct: 109, usable: 1152, wontFit: 240 },
      { media: "single", records: 157, places: 300, pct: 52, usable: 270, wontFit: 0 },
    ]);
  });

  it("shows a group with records but no shelf, and hides groups with neither", () => {
    const fills = groupFills([newFurniture("kallax_4x4", 0, "lp")], { lp: 100, single: 12, cd: 0 }, 10);
    expect(fills.map((f) => f.media)).toEqual(["lp", "single"]);
    expect(fills[1]).toMatchObject({ places: 0, pct: 0, wontFit: 12 });
  });
});

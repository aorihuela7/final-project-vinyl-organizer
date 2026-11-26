import { describe, expect, it } from "vitest";
import { computeInitial, cubeShape, cubeShelves, sizeLabel, suggestedConfig, type StoredRecord } from "./model";

const records = (n: number, group: "lp" | "single" | "cd", from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `${group}${from + i}`, media: group === "cd" ? "cd" : "vinyl", format_group: group, artist: `Artist ${String(from + i).padStart(5, "0")}`, title: "T" }) as unknown as StoredRecord);

describe("suggested shelves", () => {
  it("picks the smallest rectangle of cubes, squarer first, then wider", () => {
    expect(cubeShape(1)).toEqual([1, 1]);
    expect(cubeShape(3)).toEqual([3, 1]);
    expect(cubeShape(4)).toEqual([2, 2]);
    expect(cubeShape(7)).toEqual([4, 2]);
    expect(cubeShape(11)).toEqual([4, 3]);
    expect(cubeShape(16)).toEqual([4, 4]);
    expect(cubeShape(25)).toEqual([5, 5]);
    expect(cubeShelves(30)).toEqual([[5, 5], [5, 1]]);
  });

  it("gives 50 LPs one cube, not a 5×5, and an empty collection one cube too", () => {
    for (const [n, shape] of [[0, "1×1"], [5, "1×1"], [50, "1×1"], [66, "1×1"], [67, "2×1"], [200, "3×1"], [1272, "5×4"]] as const) {
      const { furniture } = suggestedConfig(records(n, "lp"));
      expect(furniture).toHaveLength(1);
      expect(sizeLabel(furniture[0]!)).toBe(shape);
      expect(furniture[0]!.name).toBe(`Cube shelf ${shape}`);
    }
  });

  it("holds the collection plus about 20%, and every record always fits with the default free space", () => {
    for (const lp of [1, 20, 66, 67, 150, 500, 999, 2100, 4000]) {
      for (const [single, cd] of [[0, 0], [12, 40], [300, 61], [450, 700]] as const) {
        const collection = [...records(lp, "lp"), ...records(single, "single"), ...records(cd, "cd")];
        const config = suggestedConfig(collection);
        const { layout } = computeInitial(collection, config);
        for (const media of ["lp", "single", "cd"] as const) {
          expect(layout.groups[media].leftover).toEqual([]);
          expect(layout.groups[media].slackReduced).toBe(false);
        }
        const room = (media: string) =>
          config.furniture.filter((f) => f.media === media).reduce((n, f) => n + f.compartments.filter((c) => c.status === "available").length * f.defaultCapacity, 0);
        expect(room("lp")).toBeGreaterThanOrEqual(lp * 1.2);
      }
    }
  });

  it("puts singles in a record box with as many compartments as they need, and CDs in cubes of two rows", () => {
    const small = suggestedConfig([...records(10, "lp"), ...records(12, "single")]).furniture.find((f) => f.media === "single")!;
    expect(small.template).toBe("record_box");
    expect([small.rows, small.cols]).toEqual([1, 1]);
    const box = suggestedConfig([...records(10, "lp"), ...records(240, "single")]).furniture.find((f) => f.media === "single")!;
    expect([box.rows, box.cols]).toEqual([1, 3]);
    const cds = suggestedConfig(records(100, "cd")).furniture;
    // A CD-only collection gets no LP shelf; 100 CDs + 20% need 2 cubes, each two rows of CDs.
    expect(cds.map((f) => f.media)).toEqual(["cd"]);
    expect([cds[0]!.cols, cds[0]!.rows]).toEqual([2, 2]);
    expect(cds[0]!.name).toBe("CD shelf 2×1");
  });
});

import { describe, expect, it } from "vitest";
import { changeMedia, changeTemplate, demoConfig, drawingSize, newFurniture, withoutRemovedOptions, type ShelfConfig, type StoredRecord } from "./model";
import { CD_ROW_ASPECT, compartmentAspect, rowsPerCube } from "./templates";
import { shelfHolds } from "./capacity";

const blockedCells = (f: ReturnType<typeof newFurniture>) =>
  f.compartments.filter((c) => c.status === "blocked").map((c) => `${c.row}:${c.col}`).sort();

describe("CD shelves: two rows of CDs per cube", () => {
  it("gives a Kallax for CDs two compartment rows per cube, 30 CDs each (60 per cube, as before)", () => {
    const f = newFurniture("kallax_4x4", 0, "cd");
    expect(f.rows).toBe(8);
    expect(f.cols).toBe(4);
    expect(f.compartments).toHaveLength(32);
    expect(f.defaultCapacity).toBe(30);
    expect(shelfHolds(f).places).toBe(16 * 60);
  });

  it("keeps one row per cube for LPs and singles, and one row per box for CDs", () => {
    expect(newFurniture("kallax_4x4", 0, "lp").rows).toBe(4);
    expect(newFurniture("kallax_4x4", 0, "single").rows).toBe(4);
    expect(rowsPerCube("crates", "cd")).toBe(1);
    expect(newFurniture("crates", 0, "cd").rows).toBe(1);
  });

  it("draws rows of CDs low and wide; cubes square; boxes a bit wider", () => {
    expect(compartmentAspect("kallax_4x4", "cd")).toBe(CD_ROW_ASPECT);
    expect(compartmentAspect("crates", "cd")).toBe(CD_ROW_ASPECT);
    expect(compartmentAspect("kallax_4x4", "lp")).toBe(1);
    expect(compartmentAspect("record_box", "single")).toBe(1.25);
  });

  it("splits every row in two when a shelf switches to CDs, and a blocked cube blocks both of its rows", () => {
    const lp = newFurniture("kallax_4x4", 0, "lp");
    lp.compartments = lp.compartments.map((c) => (c.row === 1 && c.col === 2 ? { ...c, status: "blocked" } : c.row === 0 && c.col === 0 ? { ...c, capacity: 75 } : c));
    const cd = changeMedia(lp, "cd");
    expect(cd.media).toBe("cd");
    expect(cd.rows).toBe(8);
    expect(cd.defaultCapacity).toBe(30);
    expect(blockedCells(cd)).toEqual(["2:2", "3:2"]);
    // A capacity counted in LPs means nothing for CDs.
    expect(cd.compartments.every((c) => c.capacity === null)).toBe(true);
  });

  it("joins the rows back when a CD shelf switches to LPs: a cube is blocked only if both rows were", () => {
    const cd = newFurniture("kallax_4x4", 0, "cd");
    cd.compartments = cd.compartments.map((c) =>
      (c.row === 2 || c.row === 3) && c.col === 1 ? { ...c, status: "blocked" } : c.row === 4 && c.col === 3 ? { ...c, status: "blocked" } : c,
    );
    const lp = changeMedia(cd, "lp");
    expect(lp.rows).toBe(4);
    expect(lp.defaultCapacity).toBe(80);
    expect(blockedCells(lp)).toEqual(["1:1"]);
  });

  it("keeps a capacity changed by hand when switching between LPs and singles", () => {
    const lp = { ...newFurniture("kallax_4x4", 0, "lp"), defaultCapacity: 72 };
    expect(changeMedia(lp, "single")).toMatchObject({ media: "single", rows: 4, defaultCapacity: 72 });
    expect(changeMedia(newFurniture("kallax_4x4", 0, "lp"), "single").defaultCapacity).toBe(150);
  });

  it("never goes past 12 rows", () => {
    const tall = { ...newFurniture("custom", 0, "lp"), rows: 7 };
    expect(changeMedia(tall, "cd").rows).toBe(12);
  });

  it("sizes a new template for the shelf's format group", () => {
    const cd = changeTemplate(newFurniture("kallax_4x4", 0, "cd"), "tower_1x5");
    expect(cd).toMatchObject({ rows: 10, cols: 1, traversal: "columns", defaultCapacity: 30 });
    expect(changeTemplate(newFurniture("kallax_4x4", 0, "lp"), "kallax_5x5")).toMatchObject({ rows: 5, cols: 5, defaultCapacity: 80 });
  });

  it("builds the demo's CD tower with ten rows of CDs", () => {
    const studio = demoConfig().furniture.find((f) => f.media === "cd")!;
    expect(studio).toMatchObject({ template: "tower_1x5", rows: 10, cols: 1, defaultCapacity: 30 });
  });
});

describe("drawingSize", () => {
  const vinyl = (size: 7 | 10 | 12 | null) => ({ media: "vinyl", size_inches: size, format_descriptions: [] }) as unknown as StoredRecord;
  it("draws CDs as CDs and vinyl by size, 12″ when unknown and 7″ on a singles shelf", () => {
    expect(drawingSize({ media: "cd" } as unknown as StoredRecord, "cd")).toBe("cd");
    expect(drawingSize(undefined, "cd")).toBe("cd");
    expect(drawingSize(vinyl(10), "lp")).toBe(10);
    expect(drawingSize(vinyl(null), "lp")).toBe(12);
    expect(drawingSize(undefined, "single")).toBe(7);
  });
});

describe("withoutRemovedOptions", () => {
  it("drops the tag sort level and tag sections from a config saved while tags existed", () => {
    const shelf = newFurniture("kallax_4x4", 0, "lp");
    const old = {
      furniture: [{ ...shelf, section: "tag:Sunday morning" }, { ...newFurniture("tower_1x5", 1, "lp"), section: "genre:Jazz" }],
      settings: { sortLevels: ["tag", "artist"], ignoreArticles: false, slackPct: 10 },
    } as unknown as ShelfConfig;
    const clean = withoutRemovedOptions(old);
    expect(clean.settings.sortLevels).toEqual(["artist"]);
    expect(clean.furniture.map((f) => f.section)).toEqual([null, "genre:Jazz"]);
  });

  it("falls back to artist when tag was the only level, and leaves a clean config untouched", () => {
    const onlyTag = { furniture: [], settings: { sortLevels: ["tag"], ignoreArticles: false, slackPct: 10 } } as unknown as ShelfConfig;
    expect(withoutRemovedOptions(onlyTag).settings.sortLevels).toEqual(["artist"]);
    const clean = demoConfig();
    expect(withoutRemovedOptions(clean)).toBe(clean);
  });
});

import { describe, expect, it } from "vitest";
import { changeMedia, newFurniture, renameForSize, resizeAndRename, sizeLabel, withoutBrandNames, type ShelfConfig } from "./model";
import { MAX_COLS, MAX_CUBE_ROWS, maxRows } from "./templates";

describe("shelf names follow their size", () => {
  it("updates the size in the name when rows or columns change", () => {
    const tower = newFurniture("tower_1x5", 0, "lp", "Tower 1×5");
    // Two more columns: "Tower 1×5" becomes "Tower 3×5" (width × height).
    expect(resizeAndRename(tower, 5, 3).name).toBe("Tower 3×5");
    expect(resizeAndRename(resizeAndRename(tower, 5, 3), 2, 3).name).toBe("Tower 3×2");
    const low = newFurniture("low_2x4", 0, "lp", "Low unit 4×2");
    expect(resizeAndRename(low, 2, 5).name).toBe("Low unit 5×2");
  });

  it("writes the size in rows of cubes on CD shelves, where each cube holds two rows of CDs", () => {
    const cds = newFurniture("kallax_4x4", 0, "cd", "Cube shelf 4×4");
    expect(cds.rows).toBe(8);
    expect(sizeLabel(cds)).toBe("4×4");
    expect(resizeAndRename(cds, 10, 4).name).toBe("Cube shelf 4×5");
    expect(sizeLabel(changeMedia(cds, "lp"))).toBe("4×4");
  });

  it("accepts a size typed with an x, keeps the rest of the name, and leaves names without a size alone", () => {
    expect(renameForSize("Tower 1x5", "1×5", "3×5")).toBe("Tower 3×5");
    expect(renameForSize("Studio 1 × 5 by the door", "1×5", "1×6")).toBe("Studio 1×6 by the door");
    expect(renameForSize("Cube shelf 4×4 (2)", "4×4", "4×5")).toBe("Cube shelf 4×5 (2)");
    expect(renameForSize("Living room", "4×4", "5×5")).toBe("Living room");
    // Another number that only looks like the size isn't touched.
    expect(renameForSize("Shelf 14×45", "4×4", "5×5")).toBe("Shelf 14×45");
  });

  it("renames shelves still called Kallax, and nothing else", () => {
    const config: ShelfConfig = {
      furniture: [newFurniture("kallax_4x4", 0, "lp", "Kallax 4×4 (2)"), newFurniture("kallax_4x4", 1, "lp", "Kallaxian"), newFurniture("tower_1x5", 2, "cd", "Kallax")],
      settings: { sortLevels: ["artist"], ignoreArticles: false, slackPct: 10 },
    };
    expect(withoutBrandNames(config, "Cube shelf").furniture.map((f) => f.name)).toEqual(["Cube shelf 4×4 (2)", "Kallaxian", "Cube shelf"]);
  });
});

describe("shelf size limits", () => {
  it("go up to 20 rows of cubes and 20 columns; 40 rows of CDs on cube shelves", () => {
    expect(MAX_CUBE_ROWS).toBe(20);
    expect(MAX_COLS).toBe(20);
    expect(maxRows("custom", "lp")).toBe(20);
    expect(maxRows("kallax_5x5", "cd")).toBe(40);
    expect(maxRows("crates", "cd")).toBe(20);
  });

  it("splits a 20-row shelf into 40 rows when it switches to CDs", () => {
    expect(changeMedia(newFurniture("custom", 0, "lp", "x"), "lp").rows).toBe(3);
    const big = resizeAndRename(newFurniture("custom", 0, "lp", "Custom shelf 3×3"), 20, 20);
    expect(big.name).toBe("Custom shelf 20×20");
    expect(changeMedia(big, "cd").rows).toBe(40);
  });
});

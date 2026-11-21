import { describe, expect, it } from "vitest";
import { parseTracklist, sideOf } from "./tracklist";

describe("sideOf", () => {
  it("reads vinyl sides, discs, and plain numbers", () => {
    expect(sideOf("A1")).toBe("A");
    expect(sideOf("B12")).toBe("B");
    expect(sideOf("A")).toBe("A");
    expect(sideOf("AA1")).toBe("AA");
    expect(sideOf("C3a")).toBe("C");
    expect(sideOf("1")).toBeNull();
    expect(sideOf("12")).toBeNull();
    expect(sideOf("CD1-1")).toBe("medium:CD 1");
    expect(sideOf("CD-1")).toBe("medium:CD");
    expect(sideOf("CD12")).toBe("medium:CD");
    expect(sideOf("DVD-2")).toBe("medium:DVD");
    expect(sideOf("2-03")).toBe("disc:2");
    expect(sideOf("")).toBeNull();
  });
});

describe("parseTracklist", () => {
  it("groups tracks by side, keeping a second disc's sides apart", () => {
    const sections = parseTracklist([
      { position: "A1", type_: "track", title: "One", duration: "4:05" },
      { position: "A2", type_: "track", title: "Two", duration: "3:38" },
      { position: "B1", type_: "track", title: "Three", duration: "4:21" },
      { position: "C1", type_: "track", title: "Four", duration: "" },
    ]);
    expect(sections.map((s) => s.side)).toEqual(["A", "B", "C"]);
    expect(sections[0]!.items).toHaveLength(2);
    expect(sections[2]!.items[0]).toEqual({ kind: "track", position: "C1", title: "Four", duration: null });
  });

  it("keeps headings as subheadings and index tracks with their parts", () => {
    const sections = parseTracklist([
      { position: "", type_: "heading", title: "Live in Buenos Aires", duration: "" },
      { position: "A1", type_: "track", title: "Intro", duration: "1:00" },
      {
        position: "A2",
        type_: "index",
        title: "Suite",
        duration: "",
        sub_tracks: [
          { position: "A2.a", type_: "track", title: "Part One", duration: "2:00" },
          { position: "A2.b", type_: "track", title: "Part Two" },
        ],
      },
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({ side: null, items: [{ kind: "heading", title: "Live in Buenos Aires" }] });
    const suite = sections[1]!.items[1]!;
    expect(suite).toMatchObject({ kind: "track", title: "Suite", duration: null });
    expect(suite.kind === "track" && suite.parts?.map((p) => p.title)).toEqual(["Part One", "Part Two"]);
  });

  it("handles CDs numbered 1, 2, 3 and multi-disc positions", () => {
    expect(parseTracklist([{ position: "1", title: "a" }, { position: "2", title: "b" }]).map((s) => s.side)).toEqual([null]);
    const discs = parseTracklist([
      { position: "CD1-1", title: "a" },
      { position: "CD1-2", title: "b" },
      { position: "CD2-1", title: "c" },
    ]);
    expect(discs.map((s) => [s.side, s.items.length])).toEqual([
      ["medium:CD 1", 2],
      ["medium:CD 2", 1],
    ]);
    // A vinyl release with a bonus CD: the CD gets its own section after side D.
    const bonus = parseTracklist([{ position: "D3", title: "x" }, { position: "CD-1", title: "y" }, { position: "CD-2", title: "z" }]);
    expect(bonus.map((s) => s.side)).toEqual(["D", "medium:CD"]);
  });

  it("returns nothing for an empty or missing tracklist", () => {
    expect(parseTracklist(undefined)).toEqual([]);
    expect(parseTracklist([])).toEqual([]);
  });
});

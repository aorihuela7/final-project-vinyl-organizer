import { describe, expect, it } from "vitest";
import { buildIndex, initialLayout, traverse, type LayoutRecord, type SortSettings } from "@/lib/layout";
import { rec, shelf } from "@/lib/layout/test-helpers";
import { railPosition, railSegments } from "./rail";

function indexFor(records: LayoutRecord[], settings: SortSettings) {
  const shelves = [shelf({ rows: 1, cols: 4, defaultCapacity: 10 })];
  const { placement } = initialLayout(records, shelves, settings, 0);
  return buildIndex(records, placement, traverse(shelves, "lp"), settings);
}

describe("railSegments", () => {
  it("makes one letter per segment, with # for digits, sized by records", () => {
    const settings: SortSettings = { levels: ["artist"], ignoreArticles: false };
    const index = indexFor([rec("2Pac"), rec("Abba"), rec("Adele"), rec("Blondie"), rec("Álvaro")], settings);
    const segs = railSegments(index, settings);
    expect(segs.map((s) => [s.key, s.count])).toEqual([
      ["#", 1],
      ["A", 3],
      ["B", 1],
    ]);
    expect(segs[1]!.start).toBe(1);
  });

  it("uses genre names when genre comes first", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: false };
    const index = indexFor([rec("A", { genre: "Rock" }), rec("B", { genre: "Jazz" }), rec("C", { genre: "Rock" })], settings);
    expect(railSegments(index, settings).map((s) => [s.key, s.kind, s.count])).toEqual([
      ["Jazz", "genre", 1],
      ["Rock", "genre", 2],
    ]);
  });

  it("uses decades for year, with unknown years last", () => {
    const settings: SortSettings = { levels: ["year"], ignoreArticles: false };
    const index = indexFor([rec("A", { year: 1975 }), rec("B", { year: 1979 }), rec("C", { year: 1984 }), rec("D", { year: null })], settings);
    expect(railSegments(index, settings).map((s) => [s.key, s.count])).toEqual([
      ["1970", 2],
      ["1980", 1],
      ["", 1],
    ]);
  });

  it("places the marker at the record's share of its group", () => {
    const settings: SortSettings = { levels: ["artist"], ignoreArticles: false };
    const records = [rec("A"), rec("B"), rec("C"), rec("D")];
    const index = indexFor(records, settings);
    expect(railPosition(index, records[0]!.id)).toBe(0.125);
    expect(railPosition(index, records[3]!.id)).toBe(0.875);
    expect(railPosition(index, "missing")).toBeNull();
  });
});

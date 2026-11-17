import { describe, expect, it } from "vitest";
import { searchRecords } from "./search";

const records = [
  { id: "1", artist: "Miles Davis", title: "Kind of Blue", year: 1959 },
  { id: "2", artist: "Björk", title: "Homogenic", year: 1997 },
  { id: "3", artist: "Los Fabulosos Cadillacs", title: "El León", year: 1992 },
  { id: "4", artist: "Nirvana (2)", title: "Nevermind", year: 1991 },
];

describe("searchRecords", () => {
  it("ignores accents and case", () => {
    expect(searchRecords(records, "bjork").map((r) => r.id)).toEqual(["2"]);
    expect(searchRecords(records, "LEON").map((r) => r.id)).toEqual(["3"]);
  });

  it("matches every word across artist and title", () => {
    expect(searchRecords(records, "kind miles").map((r) => r.id)).toEqual(["1"]);
    expect(searchRecords(records, "kind nevermind")).toEqual([]);
  });

  it("doesn't match the Discogs suffix and returns nothing for an empty query", () => {
    expect(searchRecords(records, "(2)")).toEqual([]);
    expect(searchRecords(records, "  ")).toEqual([]);
  });
});

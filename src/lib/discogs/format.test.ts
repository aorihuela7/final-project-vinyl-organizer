import { describe, expect, it } from "vitest";
import { classifyFormats, groupOfRecord, sizeFromDescription, vinylFormatSize } from "./format";
import { mapSearchResult } from "./map";

// Description arrays as Discogs returns them (from the spike on Ale's collection, docs/discogs-notes.md).
const LP_ALBUM = { name: "Vinyl", qty: "1", descriptions: ["LP", "Album"] };
const DOUBLE_LP = { name: "Vinyl", qty: "2", descriptions: ["LP", "Album", "Reissue", "Gatefold"] };
const SEVEN_SINGLE = { name: "Vinyl", qty: "1", descriptions: ['7"', "45 RPM", "Single"] };
const TEN_INCH = { name: "Vinyl", qty: "1", descriptions: ['10"', "33 ⅓ RPM", "Mini-Album"] };
const TWELVE_MAXI = { name: "Vinyl", qty: "1", descriptions: ['12"', "45 RPM", "Maxi-Single"] };
const EP_NO_SIZE = { name: "Vinyl", qty: "1", descriptions: ["EP"] };
const SINGLE_NO_SIZE = { name: "Vinyl", qty: "1", descriptions: ["Single", "Promo"] };
const MAXI_NO_SIZE = { name: "Vinyl", qty: "1", descriptions: ["Maxi-Single"] };
const SEVEN_EP = { name: "Vinyl", qty: "1", descriptions: ['7"', "EP"] };
const TWELVE_EP = { name: "Vinyl", qty: "1", descriptions: ['12"', "EP"] };

describe("vinyl size rules", () => {
  it("rule 1: an explicit size wins", () => {
    expect(classifyFormats([SEVEN_SINGLE])).toMatchObject({ group: "single", sizeInches: 7 });
    expect(classifyFormats([TEN_INCH])).toMatchObject({ group: "lp", sizeInches: 10 });
    expect(classifyFormats([TWELVE_MAXI])).toMatchObject({ group: "lp", sizeInches: 12 });
    expect(classifyFormats([SEVEN_EP])).toMatchObject({ group: "single", sizeInches: 7 });
    expect(classifyFormats([TWELVE_EP])).toMatchObject({ group: "lp", sizeInches: 12 });
  });

  it("rule 2: with no size, exactly Single or EP means a 7″ single", () => {
    expect(classifyFormats([EP_NO_SIZE])).toMatchObject({ group: "single", sizeInches: 7 });
    expect(classifyFormats([SINGLE_NO_SIZE])).toMatchObject({ group: "single", sizeInches: 7 });
  });

  it("rule 3: everything else on vinyl is a 12″ LP", () => {
    expect(classifyFormats([LP_ALBUM])).toMatchObject({ group: "lp", sizeInches: 12 });
    expect(classifyFormats([DOUBLE_LP])).toMatchObject({ group: "lp", sizeInches: 12 });
    expect(classifyFormats([MAXI_NO_SIZE])).toMatchObject({ group: "lp", sizeInches: 12 });
    expect(classifyFormats([{ name: "Vinyl", qty: "1" }])).toMatchObject({ group: "lp", sizeInches: 12 });
    expect(classifyFormats([{ name: "Vinyl", qty: "1", descriptions: [] }])).toMatchObject({ group: "lp", sizeInches: 12 });
  });

  it("rule 4: with several formats, the largest size wins", () => {
    // A box with an LP and a 7″ bonus single.
    expect(classifyFormats([{ name: "Box Set", qty: "1" }, LP_ALBUM, SEVEN_SINGLE])).toMatchObject({ group: "lp", sizeInches: 12 });
    expect(classifyFormats([SEVEN_SINGLE, TEN_INCH])).toMatchObject({ group: "lp", sizeInches: 10 });
    expect(classifyFormats([SEVEN_SINGLE, { name: "Vinyl", qty: "1", descriptions: ['7"', "Single"] }])).toMatchObject({ group: "single", sizeInches: 7 });
  });

  it("keeps v1's media rule: the first vinyl or CD format decides the shelf type", () => {
    expect(classifyFormats([{ name: "CD", qty: "1", descriptions: ["Album"] }, LP_ALBUM])).toMatchObject({ media: "cd", group: "cd", sizeInches: null });
    expect(classifyFormats([LP_ALBUM, { name: "CD", qty: "1" }])).toMatchObject({ media: "vinyl", group: "lp" });
    expect(classifyFormats([{ name: "Cassette", qty: "1", descriptions: ["Album"] }])).toMatchObject({ group: "other", sizeInches: null });
    expect(classifyFormats([])).toMatchObject({ group: "other" });
  });

  it("puts shellac and flexi-discs on the shelf for their size", () => {
    expect(classifyFormats([{ name: "Shellac", qty: "1", descriptions: ['10"', "78 RPM"] }])).toMatchObject({ group: "lp", sizeInches: 10 });
    expect(classifyFormats([{ name: "Flexi-disc", qty: "1", descriptions: ['7"', "33 ⅓ RPM"] }])).toMatchObject({ group: "single", sizeInches: 7 });
  });

  it("rounds odd sizes to the nearest shelf", () => {
    expect(vinylFormatSize(['8"']).size).toBe(7);
    expect(vinylFormatSize(['9"']).size).toBe(10);
    expect(vinylFormatSize(['11"']).size).toBe(10);
    expect(vinylFormatSize(['16"']).size).toBe(12);
  });

  it("reads sizes written with straight quotes, double primes, or two apostrophes", () => {
    expect(sizeFromDescription('7"')).toBe(7);
    expect(sizeFromDescription("12″")).toBe(12);
    expect(sizeFromDescription("10''")).toBe(10);
    expect(sizeFromDescription("LP")).toBeNull();
    expect(sizeFromDescription("45 RPM")).toBeNull();
  });
});

describe("groupOfRecord", () => {
  it("uses the stored group, or classifies records written before v2", () => {
    expect(groupOfRecord({ media: "vinyl", format_group: "single", format_descriptions: ["LP"] })).toBe("single");
    expect(groupOfRecord({ media: "vinyl", format_descriptions: ['7"', "Single"] })).toBe("single");
    expect(groupOfRecord({ media: "vinyl", format_descriptions: ["LP", "Album"] })).toBe("lp");
    expect(groupOfRecord({ media: "cd", format_descriptions: ["Album"] })).toBe("cd");
    expect(groupOfRecord({ media: "other" })).toBe("other");
  });
});

describe("search results", () => {
  it("classifies the flat format list", () => {
    const r = mapSearchResult({ id: 1, title: "A-ha - Take On Me", format: ["Vinyl", '7"', "45 RPM", "Single"] });
    expect(r).toMatchObject({ media: "vinyl", format_group: "single", size_inches: 7 });
    const lp = mapSearchResult({ id: 2, title: "Miles Davis - Kind Of Blue", format: ["Vinyl", "LP", "Album", "Reissue"] });
    expect(lp).toMatchObject({ format_group: "lp", size_inches: 12 });
  });
});

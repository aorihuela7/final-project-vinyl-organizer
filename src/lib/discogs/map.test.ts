import { describe, expect, it } from "vitest";
import { cleanImageUrl, mapCollectionItem, mapSearchResult, mediaOf } from "./map";

describe("mediaOf", () => {
  it("classifies vinyl, CDs, and other formats", () => {
    expect(mediaOf([{ name: "Vinyl" }]).media).toBe("vinyl");
    expect(mediaOf([{ name: "CD" }]).media).toBe("cd");
    expect(mediaOf([{ name: "Cassette" }]).media).toBe("other");
    expect(mediaOf([]).media).toBe("other");
  });

  it("walks formats in order, so a box set with vinyl inside is vinyl", () => {
    const r = mediaOf([{ name: "Box Set", qty: "1" }, { name: "Vinyl", qty: "4" }, { name: "CD", qty: "1" }]);
    expect(r.media).toBe("vinyl");
    expect(r.format?.qty).toBe("4");
  });

  it("treats shellac and flexi-discs as vinyl-shelf records", () => {
    expect(mediaOf([{ name: "Shellac" }]).media).toBe("vinyl");
    expect(mediaOf([{ name: "Flexi-disc" }]).media).toBe("vinyl");
  });
});

describe("cleanImageUrl", () => {
  it("drops empty, spacer, and non-https URLs", () => {
    expect(cleanImageUrl("")).toBeNull();
    expect(cleanImageUrl("https://s.discogs.com/images/spacer.gif")).toBeNull();
    expect(cleanImageUrl("http://i.discogs.com/x.jpg")).toBeNull();
    expect(cleanImageUrl("javascript:alert(1)")).toBeNull();
    expect(cleanImageUrl("https://i.discogs.com/x.jpeg")).toBe("https://i.discogs.com/x.jpeg");
  });
});

describe("mapCollectionItem", () => {
  it("maps the fields we store", () => {
    const row = mapCollectionItem({
      id: 404532,
      instance_id: 1937271993,
      date_added: "2025-02-17T20:12:01-08:00",
      basic_information: {
        id: 404532,
        title: "Faith ",
        year: 1987,
        artists: [{ name: "George Michael" }],
        labels: [{ name: "Columbia" }, { name: "Columbia" }],
        genres: ["Rock", "Funk / Soul"],
        styles: ["Soft Rock"],
        formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album"] }],
        cover_image: "https://i.discogs.com/cover.jpeg",
        thumb: "https://i.discogs.com/thumb.jpeg",
      },
    });
    expect(row).toMatchObject({
      discogs_release_id: 404532,
      discogs_instance_id: 1937271993,
      artist: "George Michael",
      title: "Faith",
      year: 1987,
      label: "Columbia",
      genre: "Rock",
      styles: ["Soft Rock"],
      format_name: "Vinyl",
      format_qty: 1,
      format_descriptions: ["LP", "Album"],
      media: "vinyl",
      discogs_url: "https://www.discogs.com/release/404532",
    });
  });

  it("keeps the first artist, stores year 0 as null, and survives missing fields", () => {
    const row = mapCollectionItem({
      id: 1,
      instance_id: 2,
      basic_information: {
        id: 3,
        title: "",
        year: 0,
        artists: [{ name: "Peter Cetera", join: "And" }, { name: "Symphony Orchestra" }],
        formats: [{ name: "Cassette" }],
      },
    });
    expect(row.artist).toBe("Peter Cetera");
    expect(row.year).toBeNull();
    expect(row.title).toBe("Untitled");
    expect(row.genre).toBeNull();
    expect(row.label).toBeNull();
    expect(row.cover_url).toBeNull();
    expect(row.media).toBe("other");
  });
});

describe("mapSearchResult", () => {
  it("splits 'Artist - Title' and reads the flat format list", () => {
    const row = mapSearchResult({
      id: 2772432,
      title: "Miles Davis - Kind Of Blue",
      year: "2010",
      format: ["Vinyl", "LP", "Album"],
      genre: ["Jazz"],
      label: ["Columbia"],
      cover_image: "https://i.discogs.com/kob.jpeg",
    });
    expect(row).toMatchObject({ artist: "Miles Davis", title: "Kind Of Blue", year: 2010, media: "vinyl", genre: "Jazz" });
  });
});

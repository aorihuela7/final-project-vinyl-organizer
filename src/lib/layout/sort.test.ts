import { describe, expect, it } from "vitest";
import { mapCollectionItem } from "@/lib/discogs/map";
import { artistAliases, artistIdentity, displayArtist, normalizeArtist, stripArticle, stripDisambiguation } from "./normalize";
import { compareRecords, sortRecords } from "./sort";
import { rec } from "./test-helpers";
import type { SortSettings } from "./types";

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: true };
const byArtistKeepArticles: SortSettings = { levels: ["artist"], ignoreArticles: false };
const names = (records: { artist: string }[]) => records.map((r) => r.artist);

describe("normalization", () => {
  it("strips Discogs' disambiguation suffix: 'Nirvana (2)' → 'Nirvana'", () => {
    expect(stripDisambiguation("Nirvana (2)")).toBe("Nirvana");
    expect(stripDisambiguation("Asia (12)")).toBe("Asia");
    expect(stripDisambiguation("Sunn O)))")).toBe("Sunn O)))");
    expect(displayArtist("Nirvana (2)")).toBe("Nirvana");
  });

  it("strips leading articles in English, Spanish, and French", () => {
    expect(stripArticle("The Beatles")).toBe("Beatles");
    expect(stripArticle("Los Diplomáticos")).toBe("Diplomáticos");
    expect(stripArticle("Les Rita Mitsouko")).toBe("Rita Mitsouko");
    expect(stripArticle("L'Impératrice")).toBe("Impératrice");
    expect(stripArticle("A Tribe Called Quest")).toBe("Tribe Called Quest");
  });

  it("doesn't strip an article that is the whole name or part of a word", () => {
    expect(stripArticle("The The")).toBe("The");
    expect(stripArticle("The")).toBe("The");
    expect(stripArticle("Theo Parrish")).toBe("Theo Parrish");
    expect(stripArticle("Lana Del Rey")).toBe("Lana Del Rey");
    expect(stripArticle("ABBA")).toBe("ABBA");
  });

  it("uses a configurable article list", () => {
    expect(stripArticle("Die Antwoord", ["Die"])).toBe("Antwoord");
    expect(stripArticle("The Beatles", ["Die"])).toBe("The Beatles");
  });

  it("ignores leading punctuation for sorting", () => {
    expect(normalizeArtist('"Weird Al" Yankovic', true)).toBe('Weird Al" Yankovic');
    expect(normalizeArtist("...And You Will Know Us", false)).toBe("And You Will Know Us");
  });
});

describe("sort key", () => {
  it("files 'The Beatles' under B when ignoring articles, and under T when not", () => {
    const records = [rec("Talking Heads"), rec("The Beatles"), rec("Blondie"), rec("Bob Dylan")];
    expect(names(sortRecords(records, byArtist))).toEqual(["The Beatles", "Blondie", "Bob Dylan", "Talking Heads"]);
    expect(names(sortRecords(records, byArtistKeepArticles))).toEqual(["Blondie", "Bob Dylan", "Talking Heads", "The Beatles"]);
  });

  it("treats 'The Beatles' and 'Beatles' as one artist, filed under 'The Beatles', when articles are kept", () => {
    const records = [rec("Beatles"), rec("Blondie"), rec("The Beatles"), rec("Talking Heads"), rec("The Clash")];
    expect(names(sortRecords(records, byArtistKeepArticles))).toEqual(["Blondie", "Talking Heads", "Beatles", "The Beatles", "The Clash"]);
  });

  it("keeps 'The Beatles' and 'Beatles' together under B when articles are ignored", () => {
    const records = [rec("Beatles"), rec("Blondie"), rec("The Beatles"), rec("Talking Heads"), rec("The Clash")];
    expect(names(sortRecords(records, byArtist))).toEqual(["Beatles", "The Beatles", "Blondie", "The Clash", "Talking Heads"]);
  });

  it("only aliases names that appear both with and without the article", () => {
    expect(artistAliases(["The Beatles", "Blondie", "The Clash"]).size).toBe(0);
    expect([...artistAliases(["Beatles", "the beatles", "The Beatles", "Blondie"])]).toEqual([["beatles", "The Beatles"]]);
    expect(artistIdentity("The Beatles")).toBe(artistIdentity("beatles"));
    expect(artistIdentity("Los Lobos")).toBe(artistIdentity("Lobos"));
    expect(artistIdentity("Theo Parrish")).not.toBe(artistIdentity("Parrish"));
  });

  it("sorts 'Nirvana (2)' as 'Nirvana'", () => {
    const records = [rec("Nirvana (2)", { title: "Nevermind", year: 1991 }), rec("Nina Simone"), rec("Nirvana", { title: "Bleach", year: 1989 }), rec("Nitzer Ebb")];
    expect(names(sortRecords(records, byArtist))).toEqual(["Nina Simone", "Nirvana", "Nirvana (2)", "Nitzer Ebb"]);
  });

  it("uses the first artist of a record with two artists", () => {
    const row = mapCollectionItem({
      id: 1,
      instance_id: 1,
      basic_information: {
        id: 1,
        title: "Live",
        artists: [{ name: "Zucchero", join: "&" }, { name: "Andrea Bocelli" }],
        formats: [{ name: "Vinyl" }],
      },
    });
    const two = { ...rec(row.artist), artist: row.artist };
    const sorted = sortRecords([two, rec("Andrea Bocelli"), rec("Yes")], byArtist);
    expect(names(sorted)).toEqual(["Andrea Bocelli", "Yes", "Zucchero"]);
  });

  it("puts records with no genre under 'No genre'", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: true };
    const records = [rec("A", { genre: "Pop" }), rec("B", { genre: null }), rec("C", { genre: "Latin" }), rec("D", { genre: "" })];
    expect(names(sortRecords(records, settings))).toEqual(["C", "B", "D", "A"]); // Latin < No genre < Pop
  });

  it("is case- and accent-insensitive and compares numbers numerically", () => {
    const records = [rec("Vol 10"), rec("élan"), rec("Vol 2"), rec("Elan"), rec("ezra")];
    const sorted = names(sortRecords(records, byArtist));
    expect(sorted.indexOf("Vol 2")).toBeLessThan(sorted.indexOf("Vol 10"));
    expect(Math.abs(sorted.indexOf("élan") - sorted.indexOf("Elan"))).toBe(1);
  });

  it("breaks ties with artist → year → title → id, so the order is total and stable", () => {
    const settings: SortSettings = { levels: ["genre"], ignoreArticles: true };
    const a = rec("Miles Davis", { id: "x2", genre: "Jazz", year: 1959, title: "Kind of Blue" });
    const b = rec("Miles Davis", { id: "x1", genre: "Jazz", year: 1959, title: "Kind of Blue" }); // a second copy
    const c = rec("Miles Davis", { id: "x3", genre: "Jazz", year: 1970, title: "Bitches Brew" });
    const d = rec("John Coltrane", { id: "x4", genre: "Jazz", year: 1957, title: "Blue Train" });
    const e = rec("Miles Davis", { id: "x5", genre: "Jazz", year: null, title: "Unknown" });
    const expected = ["x4", "x1", "x2", "x3", "x5"]; // Coltrane; Davis 1959 (copies by id); Davis 1970; Davis, no year last
    expect(sortRecords([a, b, c, d, e], settings).map((r) => r.id)).toEqual(expected);
    expect(sortRecords([e, d, c, b, a], settings).map((r) => r.id)).toEqual(expected);
    expect(compareRecords(a, a, settings)).toBe(0);
  });

  it("sorts by year numerically, with unknown years last", () => {
    const settings: SortSettings = { levels: ["year"], ignoreArticles: true };
    const records = [rec("A", { year: 2001 }), rec("B", { year: null }), rec("C", { year: 1969 }), rec("D", { year: 1999 })];
    expect(names(sortRecords(records, settings))).toEqual(["C", "D", "A", "B"]);
  });

  it("supports three levels (genre → label → title)", () => {
    const settings: SortSettings = { levels: ["genre", "label", "title"], ignoreArticles: true };
    const records = [
      rec("Z", { genre: "Electronic", label: "Warp", title: "Selected Ambient Works" }),
      rec("Y", { genre: "Electronic", label: "Kompakt", title: "Pop" }),
      rec("X", { genre: "Electronic", label: "Warp", title: "Music Has the Right to Children" }),
      rec("W", { genre: "Ambient", label: "Warp", title: "A" }),
    ];
    expect(names(sortRecords(records, settings))).toEqual(["W", "Y", "X", "Z"]);
  });
});

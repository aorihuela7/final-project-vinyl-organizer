import { describe, expect, it } from "vitest";
import { buildIndex, traverse, type LayoutRecord, type Placement, type SortSettings } from "@/lib/layout";
import { rec, shelf } from "@/lib/layout/test-helpers";
import { firstLetter, letterRange, plateLabels, plateText, twoLetters, yearRange, type Plate } from "./plates";

/** Lays out compartments exactly as given (each inner array is one compartment, in order) and returns their plates as text. */
function plates(compartments: LayoutRecord[][], settings: SortSettings): string[][] {
  const s = shelf({ rows: 1, cols: compartments.length, defaultCapacity: 100 });
  const slots = traverse([s], "lp");
  const placement: Placement = new Map();
  compartments.forEach((records, i) => records.forEach((r) => placement.set(r.id, slots[i]!.id)));
  const records = compartments.flat();
  const index = buildIndex(records, placement, slots, settings);
  const labels = plateLabels(index, settings);
  return slots.map((slot) => {
    const p = labels.get(slot.id);
    return p ? plateText(p, (g) => g, (n) => `${n} genres`) : [];
  });
}

function fullOf(compartments: LayoutRecord[][], settings: SortSettings): Array<Plate | undefined> {
  const s = shelf({ rows: 1, cols: compartments.length, defaultCapacity: 100 });
  const slots = traverse([s], "lp");
  const placement: Placement = new Map();
  compartments.forEach((records, i) => records.forEach((r) => placement.set(r.id, slots[i]!.id)));
  const index = buildIndex(compartments.flat(), placement, slots, settings);
  const labels = plateLabels(index, settings);
  return slots.map((s2) => labels.get(s2.id));
}

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: false };
const artists = (...names: string[]) => names.map((n) => rec(n));

describe("letters", () => {
  it("folds accents and case, and puts digits under #", () => {
    expect(firstLetter("Álvaro")).toBe("A");
    expect(firstLetter("5 Seconds of Summer")).toBe("#");
    expect(firstLetter("¡Ay! Mamá")).toBe("A");
    expect(twoLetters("almendra")).toBe("Al");
    expect(twoLetters("ÓSCAR")).toBe("Os");
    expect(twoLetters("50 Cent")).toBe("#");
  });

  it("uses the second letter only across a shared first letter", () => {
    expect(letterRange("Almendra", "Barbra Streisand", "Almendra", "Barbra Streisand")).toBe("Al – Ba");
    expect(letterRange("Charly García", "Daniel Santos", "Boney M.", "Eddie")).toBe("C – D");
    expect(letterRange("Sanz", "Sirope", "Rosalía", "Tame Impala")).toBe("S");
    expect(letterRange("Sabina", "Sting", "Sade", "Supertramp")).toBe("Sa – St");
  });

  it("shows years whole", () => {
    expect(yearRange(1972, 1979)).toBe("1972 – 1979");
    expect(yearRange(1975, 1975)).toBe("1975");
    expect(yearRange(null, null)).toBe("No year");
  });
});

describe("plates on Ale's shelf (the plan's examples)", () => {
  it("matches every example", () => {
    const shelfPlates = plates(
      [
        artists("5 Seconds of Summer", "Aerosmith", "Almendra"),
        artists("Almendra", "B.B. King", "Barbra Streisand"),
        artists("Barbra Streisand", "Bob Marley", "Boney M."),
        artists("Bonnie Pointer", "Caifanes", "Charly García"),
        artists("Charly García", "Cream", "Daniel Santos"),
        artists("Daniel Santos", "El Gran Combo"),
      ],
      byArtist,
    );
    expect(shelfPlates.slice(0, 5)).toEqual([["# – Al"], ["Al – Ba"], ["Ba – Bo"], ["Bo – Ch"], ["Ch – Da"]]);
  });
});

describe("plates", () => {
  it("shows one letter for a compartment entirely inside it", () => {
    expect(plates([artists("Abba", "Adele"), artists("Sabina", "Sting"), artists("Tom Waits")], byArtist)[1]).toEqual(["S"]);
  });

  it("handles the first and last compartments of a group", () => {
    const p = plates([artists("Abba", "Bjork"), artists("Bob Dylan", "Zappa")], byArtist);
    expect(p[0]).toEqual(["A – Bj"]);
    expect(p[1]).toEqual(["Bo – Z"]);
  });

  it("puts digits in the # bucket, which never takes a second character", () => {
    expect(plates([artists("10cc", "2Pac"), artists("38 Special", "Abba")], byArtist)).toEqual([["#"], ["# – A"]]);
  });

  it("ignores leading articles when that option is on", () => {
    const settings: SortSettings = { levels: ["artist"], ignoreArticles: true };
    expect(plates([artists("The Beatles", "Blondie"), artists("Los Lobos", "Lou Reed")], settings)).toEqual([["B"], ["L"]]);
  });

  it("drops Discogs disambiguation suffixes", () => {
    expect(plates([artists("Nirvana (2)", "Nina Simone")], byArtist)).toEqual([["N"]]);
  });

  it("labels years in full", () => {
    const settings: SortSettings = { levels: ["year"], ignoreArticles: false };
    const p = plates(
      [
        [rec("A", { year: 1965 }), rec("B", { year: 1972 })],
        [rec("C", { year: 1975 }), rec("D", { year: 1975 })],
        [rec("E", { year: 1990 }), rec("F", { year: null })],
      ],
      settings,
    );
    expect(p).toEqual([["1965 – 1972"], ["1975"], ["1990 – No year"]]);
  });

  it("shows the genre and the second level's range inside it", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: false };
    const p = plates(
      [
        [rec("Abba", { genre: "Pop" }), rec("Madonna", { genre: "Pop" })],
        [rec("Aerosmith", { genre: "Rock" }), rec("Feist", { genre: "Rock" })],
        [rec("Fela Kuti", { genre: "Rock" }), rec("Zappa", { genre: "Rock" })],
      ],
      settings,
    );
    // P and N only count when they're in the same genre.
    expect(p[0]).toEqual(["Pop A – M"]);
    expect(p[1]).toEqual(["Rock A – Fe"]);
    expect(p[2]).toEqual(["Rock Fe – Z"]);
  });

  it("splits a compartment where one genre ends and another starts into two lines", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: false };
    const p = plates(
      [[rec("Abba", { genre: "Pop" }), rec("Lily Allen", { genre: "Pop" })], [rec("Madonna", { genre: "Pop" }), rec("Zara Larsson", { genre: "Pop" }), rec("AC/DC", { genre: "Rock" }), rec("Blondie", { genre: "Rock" })], [rec("Bob Dylan", { genre: "Rock" })]],
      settings,
    );
    expect(p[1]).toEqual(["Pop M – Z", "Rock A – Bl"]);
  });

  it("summarizes three or more genres", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: false };
    const p = plates([[rec("B.B. King", { genre: "Blues" }), rec("Miles Davis", { genre: "Jazz" }), rec("Juanes", { genre: "Latin" })]], settings);
    expect(p[0]).toEqual(["Blues – Latin", "3 genres"]);
  });

  it("uses artist as the second level when genre is the only one", () => {
    const settings: SortSettings = { levels: ["genre"], ignoreArticles: false };
    expect(plates([[rec("Abba", { genre: "Pop" }), rec("Cher", { genre: "Pop" })]], settings)[0]).toEqual(["Pop A – C"]);
  });

  it("uses years inside a genre when year is the second level", () => {
    const settings: SortSettings = { levels: ["genre", "year"], ignoreArticles: false };
    expect(plates([[rec("X", { genre: "Rock", year: 1965 }), rec("Y", { genre: "Rock", year: 1972 })]], settings)[0]).toEqual(["Rock 1965 – 1972"]);
  });

  it("keeps the full names for the tooltip and the compartment view", () => {
    const [plate] = fullOf([artists("5 Seconds of Summer", "Almendra")], byArtist);
    expect(plate?.full).toBe("5 Seconds of Summer – Almendra");
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: false };
    const [g] = fullOf([[rec("Abba", { genre: "Pop" }), rec("Blondie", { genre: "Rock" })]], settings);
    expect(g?.full).toBe("Pop, Abba – Rock, Blondie");
  });

  it("never shows more than two letters, even when two letters can't tell neighbors apart", () => {
    const p = plates([artists("Santana", "Santo & Johnny"), artists("Santos", "Sting")], byArtist);
    for (const lines of p) for (const line of lines) for (const end of line.split(" – ")) expect(end.length).toBeLessThanOrEqual(2);
  });
});

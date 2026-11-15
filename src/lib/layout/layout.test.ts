import { describe, expect, it } from "vitest";
import { distribute, initialLayout } from "./initial";
import { traverse } from "./traversal";
import { buildIndex } from "./query";
import { sortRecords } from "./sort";
import { numbered, rec, shelf } from "./test-helpers";
import type { LayoutRecord, Placement, ShelfSpec, SortSettings } from "./types";

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: true };

/** Kallax 4×4 with the two middle compartments of row 2 blocked (the turntable). */
function kallaxWithTurntable(traversal: "rows" | "columns", capacity = 10): ShelfSpec {
  return shelf({
    rows: 4,
    cols: 4,
    traversal,
    defaultCapacity: capacity,
    compartments: [
      { row: 1, col: 1, status: "blocked" },
      { row: 1, col: 2, status: "blocked" },
    ],
  });
}

/** Asserts both invariants for one media group. */
function assertInvariants(records: LayoutRecord[], placement: Placement, shelves: ShelfSpec[], settings: SortSettings) {
  const slots = traverse(shelves, "vinyl");
  const slotIndex = new Map(slots.map((s) => [s.id, s.index]));
  const index = buildIndex(records, placement, slots, settings);
  // Invariant 1, contiguity: walking the sorted collection, the traversal index never decreases.
  let last = -1;
  for (const r of sortRecords(records.filter((x) => placement.has(x.id)), settings)) {
    const i = slotIndex.get(placement.get(r.id)!)!;
    expect(i).toBeGreaterThanOrEqual(last);
    last = i;
  }
  // Invariant 2, capacity: no compartment exceeds its capacity.
  for (const s of slots) expect(index.bySlot.get(s.id)?.length ?? 0).toBeLessThanOrEqual(s.capacity);
  return { slots, index };
}

describe("traversal", () => {
  it("walks a Kallax 4×4 by rows, left to right and top to bottom, skipping blocked compartments", () => {
    const slots = traverse([kallaxWithTurntable("rows")], "vinyl");
    expect(slots).toHaveLength(14);
    expect(slots.map((s) => `${s.row}${s.col}`)).toEqual([
      "00", "01", "02", "03",
      "10", "13",
      "20", "21", "22", "23",
      "30", "31", "32", "33",
    ]);
    expect(slots.map((s) => s.index)).toEqual([...Array(14).keys()]);
  });

  it("walks the same Kallax by columns, top to bottom, then the next column", () => {
    const slots = traverse([kallaxWithTurntable("columns")], "vinyl");
    expect(slots.map((s) => `${s.row}${s.col}`)).toEqual([
      "00", "10", "20", "30",
      "01", "21", "31",
      "02", "22", "32",
      "03", "13", "23", "33",
    ]);
  });

  it("walks several shelves in sort_index order and keeps vinyl and CD shelves apart", () => {
    const shelves = [
      shelf({ key: "studio", rows: 5, cols: 1, sortIndex: 2, traversal: "columns" }),
      shelf({ key: "cds", rows: 1, cols: 2, sortIndex: 1, media: "cd" }),
      shelf({ key: "living", rows: 1, cols: 2, sortIndex: 0 }),
    ];
    const vinyl = traverse(shelves, "vinyl");
    expect(vinyl.map((s) => s.shelfKey)).toEqual(["living", "living", "studio", "studio", "studio", "studio", "studio"]);
    expect(vinyl.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(traverse(shelves, "cd").map((s) => s.shelfKey)).toEqual(["cds", "cds"]);
  });

  it("uses the per-compartment capacity override", () => {
    const s = shelf({ rows: 1, cols: 3, defaultCapacity: 80, compartments: [{ row: 0, col: 1, status: "available", capacity: 40 }] });
    expect(traverse([s], "vinyl").map((x) => x.capacity)).toEqual([80, 40, 80]);
  });
});

describe("initial layout", () => {
  it("distributes proportionally to effective capacity, spreading the gaps (library sort)", () => {
    // 3 compartments of 100 with 10% slack hold 270; 135 records fill each to 45.
    const slots = traverse([shelf({ rows: 1, cols: 3, defaultCapacity: 100 })], "vinyl");
    expect(distribute(135, slots, 10)).toEqual({ counts: [45, 45, 45], leftover: 0, slackReduced: false });
    // Uneven capacities: proportional, not first-fit.
    const uneven = traverse(
      [shelf({ rows: 1, cols: 3, defaultCapacity: 100, compartments: [{ row: 0, col: 1, status: "available", capacity: 50 }] })],
      "vinyl",
    );
    expect(distribute(100, uneven, 10).counts).toEqual([40, 20, 40]);
  });

  it("keeps both invariants on a Kallax with blocked compartments, by rows and by columns", () => {
    const records = numbered(120);
    for (const traversal of ["rows", "columns"] as const) {
      const shelves = [kallaxWithTurntable(traversal)];
      const result = initialLayout(records, shelves, byArtist, 10);
      expect(result.groups.vinyl.leftover).toEqual([]);
      const { slots, index } = assertInvariants(records, result.placement, shelves, byArtist);
      // 120 records over 14 compartments of 10 (9 effective): 8 or 9 each, never in a blocked one.
      for (const s of slots) expect([8, 9]).toContain(index.bySlot.get(s.id)?.length ?? 0);
      expect(slots.some((s) => s.row === 1 && (s.col === 1 || s.col === 2))).toBe(false);
    }
  });

  it("holds the capacity invariant for many collection sizes", () => {
    const shelves = [
      shelf({ rows: 2, cols: 3, defaultCapacity: 7, compartments: [{ row: 0, col: 2, status: "available", capacity: 3 }] }),
      shelf({ key: "b", rows: 1, cols: 2, defaultCapacity: 5, sortIndex: 1 }),
    ];
    for (let n = 0; n <= 60; n++) {
      const records = numbered(n);
      const result = initialLayout(records, shelves, byArtist, 15);
      assertInvariants(records.filter((r) => result.placement.has(r.id)), result.placement, shelves, byArtist);
      expect(result.placement.size + result.groups.vinyl.leftover.length).toBe(n);
    }
  });

  it("uses the slack when the collection doesn't fit in effective capacity, and says so", () => {
    const shelves = [shelf({ rows: 1, cols: 2, defaultCapacity: 10 })];
    const result = initialLayout(numbered(19), shelves, byArtist, 20); // effective 16, raw 20
    expect(result.groups.vinyl.leftover).toEqual([]);
    expect(result.groups.vinyl.slackReduced).toBe(true);
    expect([...result.groups.vinyl.counts.values()]).toEqual([10, 9]);
  });

  it("reports the records left over when the collection doesn't fit, never dropping them silently", () => {
    const shelves = [shelf({ rows: 1, cols: 3, defaultCapacity: 10 })];
    const records = numbered(35);
    const result = initialLayout(records, shelves, byArtist, 10);
    expect(result.groups.vinyl.leftover).toHaveLength(5);
    // The leftovers are the last five in sort order, and every compartment is full.
    expect(result.groups.vinyl.leftover).toEqual(records.slice(30).map((r) => r.id));
    expect([...result.groups.vinyl.counts.values()]).toEqual([10, 10, 10]);
  });

  it("puts vinyl on vinyl shelves, CDs on CD shelves, and leaves other formats off the shelf", () => {
    const shelves = [shelf({ key: "v", rows: 1, cols: 2 }), shelf({ key: "c", rows: 1, cols: 1, media: "cd", sortIndex: 1 })];
    const records = [rec("A"), rec("B", { media: "cd" }), rec("C", { media: "other" }), rec("D")];
    const result = initialLayout(records, shelves, byArtist, 10);
    const shelfOf = (id: string) => result.groups.vinyl.slots.concat(result.groups.cd.slots).find((s) => s.id === result.placement.get(id))?.shelfKey;
    expect(shelfOf(records[0]!.id)).toBe("v");
    expect(shelfOf(records[1]!.id)).toBe("c");
    expect(result.placement.has(records[2]!.id)).toBe(false);
    expect(result.notPlaced).toEqual([records[2]!.id]);
    expect(shelfOf(records[3]!.id)).toBe("v");
  });

  it("handles an empty collection and a shelf with no available compartments", () => {
    expect(initialLayout([], [kallaxWithTurntable("rows")], byArtist, 10).placement.size).toBe(0);
    const allBlocked = shelf({ rows: 1, cols: 1, compartments: [{ row: 0, col: 0, status: "blocked" }] });
    const result = initialLayout(numbered(3), [allBlocked], byArtist, 10);
    expect(result.groups.vinyl.leftover).toHaveLength(3);
  });

  it("lays out 3,000 records in 40 compartments in under 100 ms", () => {
    const genres = ["Rock", "Jazz", "Latin", "Electronic", "Pop", "Classical"];
    const records: LayoutRecord[] = Array.from({ length: 3000 }, (_, i) =>
      rec(`${["The ", "Los ", "", ""][i % 4]}Artist ${(i * 7919) % 3001} (${i % 3})`, {
        id: `t${i}`,
        genre: genres[i % genres.length]!,
        year: 1950 + (i % 70),
        title: `Title ${i % 97}`,
      }),
    );
    const shelves = [
      shelf({ key: "a", rows: 5, cols: 5, defaultCapacity: 80 }),
      shelf({ key: "b", rows: 3, cols: 5, defaultCapacity: 80, sortIndex: 1 }),
    ];
    const settings: SortSettings = { levels: ["genre", "artist", "year"], ignoreArticles: true };
    initialLayout(records.slice(0, 50), shelves, settings, 10); // warm up the collator
    const started = performance.now();
    const result = initialLayout(records, shelves, settings, 10);
    const elapsed = performance.now() - started;
    expect(result.placement.size).toBe(3000);
    expect(elapsed).toBeLessThan(100);
  });
});

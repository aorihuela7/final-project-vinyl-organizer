import { describe, expect, it } from "vitest";
import { initialLayout } from "./initial";
import { insertRecord } from "./insert";
import { buildIndex } from "./query";
import { restrictToSection, sectionKeyOf, sectionsOf } from "./sections";
import { sortRecords } from "./sort";
import { traverse } from "./traversal";
import { rec, shelf } from "./test-helpers";
import type { LayoutRecord, Placement, ShelfSpec, Slot, SortSettings } from "./types";

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: false };

function assertSectionInvariants(records: LayoutRecord[], placement: Placement, slots: Slot[], settings: SortSettings) {
  const index = buildIndex(records, placement, slots, settings);
  for (const s of slots) expect(index.bySlot.get(s.id)?.length ?? 0).toBeLessThanOrEqual(s.capacity);
  const sections = sectionsOf(slots);
  for (const key of [...sections, null]) {
    const own = slots.filter((s) => (s.section ?? null) === key);
    const ownIds = new Set(own.map((s) => s.id));
    const members = records.filter((r) => placement.has(r.id) && sectionKeyOf(r, sections) === key);
    // Every member is on its section's shelves…
    for (const r of members) expect(ownIds.has(placement.get(r.id)!)).toBe(true);
    // …and each section is contiguous on its own.
    let last = -1;
    for (const r of sortRecords(members, settings)) {
      const i = own.findIndex((s) => s.id === placement.get(r.id));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  }
}

describe("sections pinned to shelves", () => {
  const shelves: ShelfSpec[] = [
    shelf({ key: "main", rows: 1, cols: 3, defaultCapacity: 10 }),
    shelf({ key: "tower", rows: 2, cols: 1, defaultCapacity: 10, sortIndex: 1, section: "genre:Jazz" }),
  ];
  const records: LayoutRecord[] = Array.from({ length: 36 }, (_, i) =>
    rec(`Artist ${String(i).padStart(2, "0")}`, { id: `s${i}`, genre: i % 3 === 0 ? "Jazz" : i % 3 === 1 ? "Rock" : "Pop" }),
  );

  it("puts jazz only in the jazz tower and everything else on the other shelves, sorted inside each", () => {
    const slots = traverse(shelves, "lp");
    const result = initialLayout(records, shelves, byArtist, 10);
    assertSectionInvariants(records, result.placement, slots, byArtist);
    const towerIds = new Set(slots.filter((s) => s.shelfKey === "tower").map((s) => s.id));
    for (const r of records) expect(towerIds.has(result.placement.get(r.id)!)).toBe(r.genre === "Jazz");
    expect(result.groups.lp.leftover).toEqual([]);
  });

  it("inserts a new record inside its own section", () => {
    const slots = traverse(shelves, "lp");
    const { placement } = initialLayout(records, shelves, byArtist, 10);
    const added = rec("Artist 05b", { id: "new", genre: "Jazz" });
    const state = restrictToSection(slots, records, added);
    const result = insertRecord({ ...state, placement, settings: byArtist }, added, "minimum");
    const towerIds = new Set(slots.filter((s) => s.shelfKey === "tower").map((s) => s.id));
    expect(towerIds.has(result.target!)).toBe(true);
    assertSectionInvariants([...records, added], result.placement, slots, byArtist);
  });

  it("pins a tag the same way", () => {
    const tagged = records.map((r, i) => ({ ...r, tag: i < 6 ? "Sunday morning" : null, tagRank: i < 6 ? 0 : null }));
    const pinned = [shelves[0]!, { ...shelves[1]!, section: "tag:Sunday morning" }];
    const slots = traverse(pinned, "lp");
    const result = initialLayout(tagged, pinned, byArtist, 10);
    assertSectionInvariants(tagged, result.placement, slots, byArtist);
    const towerIds = new Set(slots.filter((s) => s.shelfKey === "tower").map((s) => s.id));
    expect(tagged.filter((r) => towerIds.has(result.placement.get(r.id)!)).every((r) => r.tag === "Sunday morning")).toBe(true);
  });
});

describe("tags as a sort level", () => {
  it("sorts by the user's tag order, untagged last, then by the next level", () => {
    const settings: SortSettings = { levels: ["tag", "artist"], ignoreArticles: false };
    const records = [
      rec("Zappa", { id: "z", tag: "House", tagRank: 1 }),
      rec("Abba", { id: "a" }),
      rec("Miles", { id: "m", tag: "Sunday morning", tagRank: 0 }),
      rec("Bowie", { id: "b", tag: "House", tagRank: 1 }),
    ];
    expect(sortRecords(records, settings).map((r) => r.id)).toEqual(["m", "b", "z", "a"]);
  });
});

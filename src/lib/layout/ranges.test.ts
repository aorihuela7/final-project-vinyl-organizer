import { describe, expect, it } from "vitest";
import { abbreviate, rangeLabels, spineColors } from "./ranges";
import { buildIndex } from "./query";
import { traverse } from "./traversal";
import { rec, shelf } from "./test-helpers";
import type { LayoutRecord, Placement, SortSettings } from "./types";

describe("range labels", () => {
  it("abbreviates to the shortest prefix that tells it apart from the neighbor", () => {
    expect(abbreviate("Beatles", "Beck")).toBe("Bea");
    expect(abbreviate("Beck", "Beatles")).toBe("Bec");
    expect(abbreviate("Abba", null)).toBe("A");
    expect(abbreviate("Blur", "Blur")).toBe("Blur");
    expect(abbreviate("Élan", "Elbow")).toBe("Éla");
  });

  it("shows 'A – Bea' style ranges for each compartment, ignoring articles and suffixes", () => {
    const settings: SortSettings = { levels: ["artist"], ignoreArticles: true };
    const slots = traverse([shelf({ rows: 1, cols: 2, defaultCapacity: 5 })], "vinyl");
    const picture = [["ABBA", "The Beatles"], ["Beck", "Nirvana (2)"]];
    const records: LayoutRecord[] = [];
    const placement: Placement = new Map();
    picture.forEach((names, i) =>
      names.forEach((n) => {
        const r = rec(n, { id: n });
        records.push(r);
        placement.set(r.id, slots[i]!.id);
      }),
    );
    const labels = rangeLabels(buildIndex(records, placement, slots, settings), settings);
    expect(labels.get(slots[0]!.id)?.label).toBe("A – Bea");
    expect(labels.get(slots[1]!.id)?.label).toBe("Bec – N");
  });

  it("prefixes the first level when a compartment stays inside one group", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: true };
    const slots = traverse([shelf({ rows: 1, cols: 2, defaultCapacity: 5 })], "vinyl");
    const records = [
      rec("Miles Davis", { id: "a", genre: "Jazz" }),
      rec("Nina Simone", { id: "b", genre: "Jazz" }),
      rec("Oasis", { id: "c", genre: "Rock" }),
      rec("Pixies", { id: "d", genre: "Rock" }),
    ];
    const placement: Placement = new Map([["a", slots[0]!.id], ["b", slots[0]!.id], ["c", slots[1]!.id], ["d", slots[1]!.id]]);
    const labels = rangeLabels(buildIndex(records, placement, slots, settings), settings);
    expect(labels.get(slots[0]!.id)?.label).toBe("Jazz · M – N");
    expect(labels.get(slots[1]!.id)?.label).toBe("Rock · O – P");
  });

  it("shows both groups when a compartment crosses from one genre into the next, and never cuts genres", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: true };
    const slots = traverse([shelf({ rows: 1, cols: 2, defaultCapacity: 5 })], "vinyl");
    const records = [
      rec("Miles Davis", { id: "a", genre: "Jazz" }),
      rec("Nina Simone", { id: "b", genre: "Jazz" }),
      rec("Oasis", { id: "c", genre: "Rock" }),
      rec("Pixies", { id: "d", genre: "Rock" }),
    ];
    const placement: Placement = new Map([["a", slots[0]!.id], ["b", slots[1]!.id], ["c", slots[1]!.id], ["d", slots[1]!.id]]);
    const labels = rangeLabels(buildIndex(records, placement, slots, settings), settings);
    expect(labels.get(slots[1]!.id)?.label).toBe("Jazz · N – Rock · P");
    const genreOnly: SortSettings = { levels: ["genre"], ignoreArticles: true };
    expect(rangeLabels(buildIndex(records, placement, slots, genreOnly), genreOnly).get(slots[1]!.id)?.label).toBe("Jazz – Rock");
  });

  it("colors spines by the first sort level, from a fixed palette", () => {
    const settings: SortSettings = { levels: ["genre", "artist"], ignoreArticles: true };
    const slots = traverse([shelf({ rows: 1, cols: 1, defaultCapacity: 10 })], "vinyl");
    const records = [rec("A", { id: "1", genre: "Jazz" }), rec("B", { id: "2", genre: "Jazz" }), rec("C", { id: "3", genre: "Rock" })];
    const placement: Placement = new Map(records.map((r) => [r.id, slots[0]!.id]));
    const colors = spineColors(buildIndex(records, placement, slots, settings), settings, 12);
    expect(colors.get("1")).toBe(colors.get("2"));
    expect(colors.get("3")).not.toBe(colors.get("1"));
  });
});

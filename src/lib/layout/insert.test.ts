import { describe, expect, it } from "vitest";
import { calibrate } from "./calibrate";
import { insertRecord } from "./insert";
import { buildIndex, locate, positionInCompartment } from "./query";
import { sortRecords } from "./sort";
import { traverse } from "./traversal";
import { rec, shelf } from "./test-helpers";
import type { LayoutRecord, Placement, Slot, SortSettings } from "./types";

const byArtist: SortSettings = { levels: ["artist"], ignoreArticles: true };

/** Builds a state from a picture like [["A","B"],["C"],[]] (one array per compartment). */
function stateFrom(picture: string[][], capacity: number) {
  const slots: Slot[] = traverse([shelf({ rows: 1, cols: picture.length, defaultCapacity: capacity })], "vinyl");
  const records: LayoutRecord[] = [];
  const placement: Placement = new Map();
  picture.forEach((names, i) => {
    for (const name of names) {
      const r = rec(name, { id: name });
      records.push(r);
      placement.set(r.id, slots[i]!.id);
    }
  });
  return { slots, records, placement, settings: byArtist };
}

/** Turns a placement back into the picture, for readable assertions. */
function picture(state: ReturnType<typeof stateFrom>, placement: Placement, extra: LayoutRecord[] = []) {
  const index = buildIndex([...state.records, ...extra], placement, state.slots, byArtist);
  return state.slots.map((s) => (index.bySlot.get(s.id) ?? []).map((r) => r.id));
}

describe("insertion, v1 naive method", () => {
  it("puts the record in the previous record's compartment when it fits: 1 move", () => {
    const state = stateFrom([["Abba", "Blondie"], ["Doors", "Eagles"]], 3);
    const result = insertRecord(state, rec("Beck", { id: "Beck" }));
    expect(result.movedCount).toBe(1);
    expect(result.moves).toEqual([{ recordId: "Beck", from: null, to: state.slots[0]!.id }]);
    expect(picture(state, result.placement, [result.record])).toEqual([["Abba", "Beck", "Blondie"], ["Doors", "Eagles"]]);
  });

  it("uses the next record's compartment when the previous one is full and the next isn't", () => {
    const state = stateFrom([["Abba", "Blondie"], ["Doors"]], 2);
    const result = insertRecord(state, rec("Cream", { id: "Cream" }));
    expect(result.movedCount).toBe(1);
    expect(picture(state, result.placement, [result.record])).toEqual([["Abba", "Blondie"], ["Cream", "Doors"]]);
  });

  it("cascades an overflow across three compartments, pushing the last record forward each time", () => {
    const state = stateFrom([["Abba", "Blondie"], ["Doors", "Eagles"], ["Genesis", "Heart"], ["Kiss"]], 2);
    const result = insertRecord(state, rec("Beck", { id: "Beck" }));
    expect(picture(state, result.placement, [result.record])).toEqual([
      ["Abba", "Beck"],
      ["Blondie", "Doors"],
      ["Eagles", "Genesis"],
      ["Heart", "Kiss"],
    ]);
    expect(result.moves).toEqual([
      { recordId: "Beck", from: null, to: state.slots[0]!.id },
      { recordId: "Blondie", from: state.slots[0]!.id, to: state.slots[1]!.id },
      { recordId: "Eagles", from: state.slots[1]!.id, to: state.slots[2]!.id },
      { recordId: "Heart", from: state.slots[2]!.id, to: state.slots[3]!.id },
    ]);
    expect(result.movedCount).toBe(4);
    expect(result.overflow).toEqual([]);
  });

  it("moves the new record itself forward when it's the last one in a full compartment", () => {
    const state = stateFrom([["Abba", "Blondie"], ["Doors", "Eagles"], ["Genesis"]], 2);
    // "Cher" goes after Blondie: both its neighbors' compartments are full, so it cascades from the first.
    const result = insertRecord(state, rec("Cher", { id: "Cher" }));
    expect(picture(state, result.placement, [result.record])).toEqual([["Abba", "Blondie"], ["Cher", "Doors"], ["Eagles", "Genesis"]]);
    expect(result.movedCount).toBe(2);
  });

  it("reports the record pushed off the end when nothing has room", () => {
    const state = stateFrom([["Abba", "Blondie"], ["Doors", "Eagles"]], 2);
    const result = insertRecord(state, rec("Beck", { id: "Beck" }));
    expect(result.overflow).toEqual(["Eagles"]);
    expect(result.placement.has("Eagles")).toBe(false);
    expect(result.moves.at(-1)).toEqual({ recordId: "Eagles", from: state.slots[1]!.id, to: null });
  });

  it("uses an empty compartment between prev and next instead of cascading", () => {
    const state = stateFrom([["Abba", "Blondie"], [], ["Doors", "Eagles"]], 2);
    const result = insertRecord(state, rec("Cher", { id: "Cher" }));
    expect(result.movedCount).toBe(1);
    expect(picture(state, result.placement, [result.record])).toEqual([["Abba", "Blondie"], ["Cher"], ["Doors", "Eagles"]]);
  });

  it("never pushes a record off the shelf when an earlier compartment is empty", () => {
    const state = stateFrom([[], ["Beck", "Blondie"]], 2);
    const result = insertRecord(state, rec("Abba", { id: "Abba" }));
    expect(result.overflow).toEqual([]);
    expect(result.movedCount).toBe(1);
    expect(picture(state, result.placement, [result.record])).toEqual([["Abba"], ["Beck", "Blondie"]]);
  });

  it("puts the first record of an empty shelf in the first compartment", () => {
    const state = stateFrom([[], [], []], 2);
    const result = insertRecord(state, rec("Abba", { id: "Abba" }));
    expect(result.target).toBe(state.slots[0]!.id);
    expect(result.movedCount).toBe(1);
  });
});

describe("calibration: 'This is the first record in this compartment'", () => {
  it("moves the boundary back when the record is in the previous compartment, and flags overfull", () => {
    const state = stateFrom([["Abba", "Beck", "Blondie"], ["Doors", "Eagles"], ["Genesis"]], 3);
    const result = calibrate(state, "Beck", state.slots[1]!.id);
    if (!result.ok) throw new Error(result.reason);
    expect(picture(state, result.placement)).toEqual([["Abba"], ["Beck", "Blondie", "Doors", "Eagles"], ["Genesis"]]);
    expect(result.movedCount).toBe(2);
    // Reality beats capacity: 4 records in a compartment of 3 is flagged, not blocked.
    expect(result.overCapacity).toEqual([state.slots[1]!.id]);
  });

  it("moves the boundary forward when the record is inside the compartment", () => {
    const state = stateFrom([["Abba"], ["Beck", "Blondie", "Doors"], ["Genesis"]], 3);
    const result = calibrate(state, "Doors", state.slots[1]!.id);
    if (!result.ok) throw new Error(result.reason);
    expect(picture(state, result.placement)).toEqual([["Abba", "Beck", "Blondie"], ["Doors"], ["Genesis"]]);
    expect(result.moves.map((m) => m.recordId)).toEqual(["Beck", "Blondie"]);
    expect(result.overCapacity).toEqual([]);
  });

  it("only touches the boundary between the compartment and the previous one", () => {
    const state = stateFrom([["Abba", "Beck"], ["Blondie", "Doors"], ["Eagles", "Genesis"]], 3);
    const result = calibrate(state, "Beck", state.slots[1]!.id);
    if (!result.ok) throw new Error(result.reason);
    expect(picture(state, result.placement)[2]).toEqual(["Eagles", "Genesis"]);
  });

  it("is a no-op when the record is already first", () => {
    const state = stateFrom([["Abba"], ["Beck", "Doors"]], 3);
    const result = calibrate(state, "Beck", state.slots[1]!.id);
    expect(result.ok && result.movedCount).toBe(0);
  });

  it("refuses a record that is neither in the compartment nor in the previous one", () => {
    const state = stateFrom([["Abba"], ["Beck"], ["Doors"]], 3);
    expect(calibrate(state, "Doors", state.slots[0]!.id).ok).toBe(false);
    expect(calibrate(state, "Abba", state.slots[2]!.id).ok).toBe(false);
  });

  it("refuses to make a record first in the first compartment when others come before it", () => {
    const state = stateFrom([["Abba", "Beck"], ["Doors"]], 3);
    expect(calibrate(state, "Beck", state.slots[0]!.id).ok).toBe(false);
  });
});

describe("position and neighbors", () => {
  it("computes the position within the compartment as (index + 0.5) / total", () => {
    expect(positionInCompartment(0, 1)).toBe(0.5);
    expect(positionInCompartment(1, 5)).toBeCloseTo(0.3);
    expect(positionInCompartment(4, 5)).toBeCloseTo(0.9);
  });

  it("returns two neighbors on each side in global order, each with its compartment", () => {
    const state = stateFrom([["Abba", "Beck"], ["Blondie", "Cher"], ["Doors"]], 3);
    const index = buildIndex(state.records, state.placement, state.slots, byArtist);
    const found = locate(index, "Blondie")!;
    expect(found.slot.id).toBe(state.slots[1]!.id);
    expect(found.indexInSlot).toBe(0);
    expect(found.totalInSlot).toBe(2);
    expect(found.fraction).toBeCloseTo(0.25);
    expect(found.before.map((n) => [n.record.id, n.slot.index])).toEqual([["Abba", 0], ["Beck", 0]]);
    expect(found.after.map((n) => [n.record.id, n.slot.index])).toEqual([["Cher", 1], ["Doors", 2]]);
    const first = locate(index, "Abba")!;
    expect(first.before).toEqual([]);
    expect(first.after).toHaveLength(2);
  });
});

describe("insertion keeps the invariants", () => {
  it("stays contiguous and within capacity after 200 random insertions", async () => {
    const { initialLayout } = await import("./initial");
    let seed = 42;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const name = () => Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(random() * 26))).join("");
    const shelves = [shelf({ rows: 2, cols: 4, defaultCapacity: 30 })];
    let records: LayoutRecord[] = Array.from({ length: 150 }, (_, i) => rec(name(), { id: `base${i}` }));
    const layout = initialLayout(records, shelves, byArtist, 20);
    const slots = layout.groups.vinyl.slots;
    let placement = layout.placement;
    let overflowed = 0;
    for (let i = 0; i < 200; i++) {
      const r = rec(name(), { id: `new${i}` });
      const result = insertRecord({ slots, records, placement, settings: byArtist }, r);
      placement = result.placement;
      records = [...records, r];
      overflowed += result.overflow.length;
      const index = buildIndex(records, placement, slots, byArtist);
      let last = -1;
      for (const x of sortRecords(records.filter((y) => placement.has(y.id)), byArtist)) {
        expect(index.slotOf.get(x.id)!.index).toBeGreaterThanOrEqual(last);
        last = index.slotOf.get(x.id)!.index;
      }
      for (const s of slots) expect(index.bySlot.get(s.id)?.length ?? 0).toBeLessThanOrEqual(s.capacity);
    }
    // 8 × 30 = 240 places for 350 records: exactly 110 must be reported as not fitting.
    expect(placement.size).toBe(240);
    expect(overflowed).toBe(110);
  });
});

describe("collapseMoves", () => {
  it("keeps one move per record: its first origin and its last destination", async () => {
    const { collapseMoves } = await import("./insert");
    expect(
      collapseMoves([
        { recordId: "a", from: "s1", to: "s2" },
        { recordId: "b", from: null, to: "s1" },
        { recordId: "a", from: "s2", to: "s3" },
        { recordId: "c", from: "s3", to: "s4" },
        { recordId: "c", from: "s4", to: "s3" },
      ]),
    ).toEqual([
      { recordId: "a", from: "s1", to: "s3" },
      { recordId: "b", from: null, to: "s1" },
    ]);
  });

  it("insertMany never reports the same record twice", async () => {
    const { insertMany } = await import("./insert");
    const state = stateFrom([["Abba", "Blondie"], ["Doors", "Eagles"], ["Genesis"]], 2);
    const result = insertMany(state, [rec("Beck", { id: "Beck" }), rec("Bjork", { id: "Bjork" }), rec("Cher", { id: "Cher" })]);
    const ids = result.moves.map((m) => m.recordId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

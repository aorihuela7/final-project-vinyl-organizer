/**
 * Calibration: "X is the first record in compartment C".
 *
 * It only moves the boundary between C and the previous available
 * compartment P (in traversal order):
 * - X is in P: X and everything after it in P move to the front of C.
 * - X is in C: everything before X in C moves to the end of P.
 * Anything else is refused, because it would mean moving other boundaries.
 *
 * Reality beats capacity: if C or P ends up over capacity, it's flagged, not blocked.
 */
import { buildIndex } from "./query";
import type { ShelfState } from "./insert";
import { placesOf, type Move, type Placement } from "./types";

export type CalibrateResult =
  | { ok: true; placement: Placement; moves: Move[]; movedCount: number; overCapacity: string[] }
  | { ok: false; reason: string; code: CalibrateRefusal };

/** Why a calibration was refused, for the UI to word it (in any language). */
export type CalibrateRefusal = "unavailable" | "notOnShelf" | "firstCompartment" | "notAdjacent" | "lastCompartment" | "notEnough" | "badCount";

export function calibrate(state: ShelfState, recordId: string, slotId: string): CalibrateResult {
  const { slots, settings } = state;
  const index = buildIndex(state.records, state.placement, slots, settings);
  const c = slots.findIndex((s) => s.id === slotId);
  if (c === -1) return { ok: false, code: "unavailable", reason: "That compartment isn't available." };
  const xSlot = index.slotOf.get(recordId);
  if (!xSlot) return { ok: false, code: "notOnShelf", reason: "That record isn't on this shelf." };
  const p = c - 1;
  const inC = index.bySlot.get(slots[c]!.id) ?? [];
  const inP = p >= 0 ? (index.bySlot.get(slots[p]!.id) ?? []) : [];

  const placement: Placement = new Map(state.placement);
  const moves: Move[] = [];

  if (xSlot.index === c) {
    const before = inC.slice(0, inC.findIndex((r) => r.id === recordId));
    if (before.length > 0 && p < 0) {
      return { ok: false, code: "firstCompartment", reason: "This is the first compartment, so the records before it have nowhere to go." };
    }
    for (const r of before) {
      placement.set(r.id, slots[p]!.id);
      moves.push({ recordId: r.id, from: slots[c]!.id, to: slots[p]!.id });
    }
  } else if (xSlot.index === p) {
    const from = inP.findIndex((r) => r.id === recordId);
    for (const r of inP.slice(from)) {
      placement.set(r.id, slots[c]!.id);
      moves.push({ recordId: r.id, from: slots[p]!.id, to: slots[c]!.id });
    }
  } else {
    return {
      ok: false,
      code: "notAdjacent",
      reason: "Pick a record from this compartment or the one right before it: calibration only moves the boundary between them.",
    };
  }

  const weights = new Map(state.records.map((r) => [r.id, placesOf(r, settings)]));
  const count = (i: number) => {
    let n = 0;
    for (const [id, v] of placement) if (v === slots[i]!.id) n += weights.get(id) ?? 1;
    return n;
  };
  const overCapacity = [p, c].filter((i) => i >= 0 && count(i) > slots[i]!.capacity).map((i) => slots[i]!.id);

  return { ok: true, placement, moves, movedCount: moves.length, overCapacity };
}

/**
 * Calibration by count: "there are N records in compartment C right now".
 *
 * It only moves the boundary between C and the next available compartment Q:
 * - N is smaller than what C holds: C's last records move to the front of Q.
 * - N is larger: Q's first records move to the end of C.
 * Reality beats capacity: an over-capacity result is flagged, not blocked.
 */
export function calibrateCount(state: ShelfState, slotId: string, count: number): CalibrateResult {
  const { slots, settings } = state;
  if (!Number.isInteger(count) || count < 0) return { ok: false, code: "badCount", reason: "Type a whole number." };
  const index = buildIndex(state.records, state.placement, slots, settings);
  const c = slots.findIndex((s) => s.id === slotId);
  if (c === -1) return { ok: false, code: "unavailable", reason: "That compartment isn't available." };
  const q = c + 1;
  const inC = index.bySlot.get(slots[c]!.id) ?? [];
  const inQ = q < slots.length ? (index.bySlot.get(slots[q]!.id) ?? []) : [];
  const placement: Placement = new Map(state.placement);
  const moves: Move[] = [];

  if (count < inC.length) {
    if (q >= slots.length) {
      return { ok: false, code: "lastCompartment", reason: "This is the last compartment, so the records after it have nowhere to go." };
    }
    for (const r of inC.slice(count)) {
      placement.set(r.id, slots[q]!.id);
      moves.push({ recordId: r.id, from: slots[c]!.id, to: slots[q]!.id });
    }
  } else if (count > inC.length) {
    const needed = count - inC.length;
    if (needed > inQ.length) {
      return { ok: false, code: "notEnough", reason: "The next compartment doesn't have that many records to give." };
    }
    for (const r of inQ.slice(0, needed)) {
      placement.set(r.id, slots[c]!.id);
      moves.push({ recordId: r.id, from: slots[q]!.id, to: slots[c]!.id });
    }
  }

  const weights = new Map(state.records.map((r) => [r.id, placesOf(r, settings)]));
  const load = (i: number) => {
    let n = 0;
    for (const [id, v] of placement) if (v === slots[i]!.id) n += weights.get(id) ?? 1;
    return n;
  };
  const overCapacity = [c, q].filter((i) => i < slots.length && load(i) > slots[i]!.capacity).map((i) => slots[i]!.id);
  return { ok: true, placement, moves, movedCount: moves.length, overCapacity };
}

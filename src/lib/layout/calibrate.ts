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
import type { Move, Placement } from "./types";

export type CalibrateResult =
  | { ok: true; placement: Placement; moves: Move[]; movedCount: number; overCapacity: string[] }
  | { ok: false; reason: string };

export function calibrate(state: ShelfState, recordId: string, slotId: string): CalibrateResult {
  const { slots, settings } = state;
  const index = buildIndex(state.records, state.placement, slots, settings);
  const c = slots.findIndex((s) => s.id === slotId);
  if (c === -1) return { ok: false, reason: "That compartment isn't available." };
  const xSlot = index.slotOf.get(recordId);
  if (!xSlot) return { ok: false, reason: "That record isn't on this shelf." };
  const p = c - 1;
  const inC = index.bySlot.get(slots[c]!.id) ?? [];
  const inP = p >= 0 ? (index.bySlot.get(slots[p]!.id) ?? []) : [];

  const placement: Placement = new Map(state.placement);
  const moves: Move[] = [];

  if (xSlot.index === c) {
    const before = inC.slice(0, inC.findIndex((r) => r.id === recordId));
    if (before.length > 0 && p < 0) {
      return { ok: false, reason: "This is the first compartment, so the records before it have nowhere to go." };
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
      reason: "Pick a record from this compartment or the one right before it: calibration only moves the boundary between them.",
    };
  }

  const count = (i: number) => {
    let n = 0;
    for (const v of placement.values()) if (v === slots[i]!.id) n++;
    return n;
  };
  const overCapacity = [p, c].filter((i) => i >= 0 && count(i) > slots[i]!.capacity).map((i) => slots[i]!.id);

  return { ok: true, placement, moves, movedCount: moves.length, overCapacity };
}

/**
 * v1 insertion, the naive method (the baseline the v2 minimum-moves method
 * will be compared against):
 *
 * 1. Find where the new record goes in the global sort order: between `prev`
 *    and `next`.
 * 2. Candidate compartment = prev's compartment, or next's if prev's is full
 *    and next's isn't. (If empty compartments sit between them, the first one
 *    with room is used; if the record sorts first, an empty compartment before
 *    next's can take it.)
 * 3. If the candidate has room, that's 1 move (placing the new record).
 * 4. If not, push the last record of the candidate to the start of the next
 *    available compartment, and repeat while that one was full too. Each push
 *    is one more move. A record pushed past the last compartment no longer
 *    fits and is reported.
 *
 * Contiguity holds: every push moves the last record of a compartment to the
 * front of the next one.
 */
import { buildIndex } from "./query";
import { compareKeys, sortKeyOf } from "./sort";
import type { LayoutRecord, Move, Placement, Slot, SortSettings } from "./types";

export type ShelfState = {
  /** Available compartments of one media group, in traversal order. */
  slots: Slot[];
  /** Records of that group (placed or not; unplaced ones are ignored). */
  records: readonly LayoutRecord[];
  placement: Placement;
  settings: SortSettings;
};

export type InsertResult = {
  record: LayoutRecord;
  placement: Placement;
  /** Where the new record ended up (null if the shelf has no room at all). */
  target: string | null;
  moves: Move[];
  movedCount: number;
  /** Records pushed off the end of the shelf. */
  overflow: string[];
};

export function insertRecord(state: ShelfState, record: LayoutRecord): InsertResult {
  const { slots, settings } = state;
  const placement: Placement = new Map(state.placement);
  if (slots.length === 0) {
    return { record, placement, target: null, moves: [], movedCount: 0, overflow: [record.id] };
  }

  const index = buildIndex(state.records.filter((r) => r.id !== record.id), placement, slots, settings);
  const lists = slots.map((s) => [...(index.bySlot.get(s.id) ?? [])]);
  const originalCounts = lists.map((l) => l.length);
  const hasRoom = (i: number) => originalCounts[i]! < slots[i]!.capacity;
  const slotIndexOf = (id: string) => index.slotOf.get(id)!.index;

  // 1. Insertion point: the first placed record that sorts after the new one.
  const key = sortKeyOf(record, settings);
  let lo = 0;
  let hi = index.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareKeys(index.keys.get(index.sorted[mid]!.id)!, key, settings.levels) <= 0) lo = mid + 1;
    else hi = mid;
  }
  const prev = index.sorted[lo - 1];
  const next = index.sorted[lo];

  // 2. Candidate compartment: prev's, or, if it's full, the next one with room up
  //    to next's. Compartments strictly between prev's and next's are empty
  //    (contiguity), so any of them keeps the range continuous; with no empty
  //    ones in between this is exactly "next's compartment if it isn't full".
  let candidate = 0;
  if (prev) {
    const p = slotIndexOf(prev.id);
    const q = next ? slotIndexOf(next.id) : slots.length - 1;
    candidate = p;
    if (!hasRoom(p)) {
      for (let i = p + 1; i <= q; i++) {
        if (hasRoom(i)) {
          candidate = i;
          break;
        }
      }
    }
  } else if (next) {
    // The new record sorts first: next's compartment, or the nearest empty one before it.
    const q = slotIndexOf(next.id);
    candidate = q;
    if (!hasRoom(q)) {
      for (let i = q - 1; i >= 0; i--) {
        if (hasRoom(i)) {
          candidate = i;
          break;
        }
      }
    }
  }

  // Put the new record in the candidate, in sort order.
  const list = lists[candidate]!;
  let at = list.findIndex((r) => compareKeys(index.keys.get(r.id)!, key, settings.levels) > 0);
  if (at === -1) at = list.length;
  list.splice(at, 0, record);

  const destination = new Map<string, string | null>([[record.id, slots[candidate]!.id]]);
  const overflow: string[] = [];

  // 3–4. Cascade while the compartment we just added to was already full.
  let current = candidate;
  while (!hasRoom(current)) {
    const pushed = lists[current]!.pop()!;
    const nextSlot = current + 1;
    if (nextSlot >= slots.length) {
      destination.set(pushed.id, null);
      overflow.push(pushed.id);
      break;
    }
    lists[nextSlot]!.unshift(pushed);
    destination.set(pushed.id, slots[nextSlot]!.id);
    current = nextSlot;
  }

  const moves: Move[] = [];
  for (const [id, to] of destination) {
    const from = id === record.id ? null : (state.placement.get(id) ?? null);
    if (from === to) continue;
    moves.push({ recordId: id, from, to });
    if (to === null) placement.delete(id);
    else placement.set(id, to);
  }

  return {
    record,
    placement,
    target: placement.get(record.id) ?? null,
    moves,
    movedCount: moves.length,
    overflow,
  };
}

/** Inserts several records one after another (new records found by a re-sync). */
export function insertMany(state: ShelfState, records: readonly LayoutRecord[]) {
  let placement = state.placement;
  let all = [...state.records];
  const moves: Move[] = [];
  const overflow: string[] = [];
  for (const record of records) {
    const result = insertRecord({ ...state, records: all, placement }, record);
    placement = result.placement;
    all = [...all.filter((r) => r.id !== record.id), record];
    moves.push(...result.moves);
    for (const id of result.overflow) overflow.push(id);
  }
  // A record placed and later pushed off counts once in overflow; a record moved twice counts once.
  const collapsed = collapseMoves(moves);
  return { placement, moves: collapsed, movedCount: collapsed.length, overflow: [...new Set(overflow)].filter((id) => !placement.has(id)) };
}

/**
 * Collapses a list of moves so each record appears once: its first `from` and
 * its last `to`. Records that end where they started are dropped. Several
 * insertions in a row can move the same record twice.
 */
export function collapseMoves(moves: readonly Move[]): Move[] {
  const byRecord = new Map<string, Move>();
  for (const m of moves) {
    const previous = byRecord.get(m.recordId);
    byRecord.set(m.recordId, { recordId: m.recordId, from: previous ? previous.from : m.from, to: m.to });
  }
  return [...byRecord.values()].filter((m) => m.from !== m.to);
}

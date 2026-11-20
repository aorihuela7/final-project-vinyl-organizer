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
 *
 * v2 adds minimum moves (strategy "minimum"): a full compartment can also
 * shift backward. For one new record, any valid plan has to move one record
 * across every boundary between the insertion point and a compartment with
 * room (full compartments can't take one more, and order is kept), so the
 * cheapest plan goes to the nearest compartment with room, in either
 * direction: cost = 1 + boundaries crossed. The naive method stays as the
 * baseline for the purchase simulator.
 *
 * One special case: if the new record is "The X" and the shelf already has
 * records by "X", those records now sort as "The X" (see artistAliases). They
 * are taken off and put back with the same rule, and their moves are counted.
 */
import { buildIndex } from "./query";
import { aliasesFor, artistSortName, compareKeys, sortKeyOf, type ArtistAliases } from "./sort";
import type { LayoutRecord, Move, Placement, Slot, SortSettings } from "./types";

/** "naive": v1's forward cascade (the baseline). "minimum": the fewest records moved (v2). */
export type InsertStrategy = "naive" | "minimum";

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

export function insertRecord(state: ShelfState, record: LayoutRecord, strategy: InsertStrategy = "naive"): InsertResult {
  const { settings } = state;
  const others = state.records.filter((r) => r.id !== record.id);
  const before = aliasesFor(others, settings);
  const after = aliasesFor([...others, record], settings);
  const renamed = sameAliases(before, after)
    ? []
    : others.filter((r) => state.placement.has(r.id) && artistSortName(r.artist, settings, before) !== artistSortName(r.artist, settings, after));
  if (renamed.length === 0) return insertOne(state, record, after, strategy);

  // Take the renamed records off the shelf, insert the new one, then put each renamed record back.
  const original = state.placement;
  let placement: Placement = new Map(original);
  for (const r of renamed) placement.delete(r.id);
  const all = [...others, record];
  const moves: Move[] = [];
  const overflow: string[] = [];
  for (const r of [record, ...renamed]) {
    const result = insertOne({ ...state, records: all, placement }, r, after, strategy);
    placement = result.placement;
    for (const m of result.moves) moves.push(m.from === null && r.id !== record.id && m.recordId === r.id ? { ...m, from: original.get(r.id) ?? null } : m);
    overflow.push(...result.overflow);
  }
  const collapsed = collapseMoves(moves);
  return {
    record,
    placement,
    target: placement.get(record.id) ?? null,
    moves: collapsed,
    movedCount: collapsed.length,
    overflow: [...new Set(overflow)].filter((id) => !placement.has(id)),
  };
}

function sameAliases(a: ArtistAliases | undefined, b: ArtistAliases | undefined): boolean {
  if ((a?.size ?? 0) !== (b?.size ?? 0)) return false;
  for (const [k, v] of a ?? []) if (b?.get(k) !== v) return false;
  return true;
}

function insertOne(state: ShelfState, record: LayoutRecord, aliases: ArtistAliases | undefined, strategy: InsertStrategy): InsertResult {
  const { slots, settings } = state;
  const placement: Placement = new Map(state.placement);
  if (slots.length === 0) {
    return { record, placement, target: null, moves: [], movedCount: 0, overflow: [record.id] };
  }

  const index = buildIndex(state.records.filter((r) => r.id !== record.id), placement, slots, settings, aliases);
  const lists = slots.map((s) => [...(index.bySlot.get(s.id) ?? [])]);
  const originalCounts = lists.map((l) => l.length);
  const hasRoom = (i: number) => originalCounts[i]! < slots[i]!.capacity;
  const slotIndexOf = (id: string) => index.slotOf.get(id)!.index;

  // 1. Insertion point: the first placed record that sorts after the new one.
  const key = sortKeyOf(record, settings, aliases);
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

  // Minimum moves: the compartments the new record may go in keep the range
  // continuous (prev's through next's). If none has room, shift toward the
  // nearest compartment with room, backward or forward.
  let direction: "forward" | "backward" = "forward";
  if (strategy === "minimum") {
    const lo = prev ? slotIndexOf(prev.id) : 0;
    const hi = next ? slotIndexOf(next.id) : slots.length - 1;
    let roomy = -1;
    for (let i = lo; i <= hi; i++) {
      if (hasRoom(i)) {
        roomy = i;
        break;
      }
    }
    if (roomy >= 0) {
      candidate = roomy;
    } else {
      let forward = Infinity;
      for (let i = hi + 1; i < slots.length; i++) {
        if (hasRoom(i)) {
          forward = i - hi;
          break;
        }
      }
      let backward = Infinity;
      for (let i = lo - 1; i >= 0; i--) {
        if (hasRoom(i)) {
          backward = lo - i;
          break;
        }
      }
      if (backward < forward) {
        direction = "backward";
        candidate = lo;
      } else {
        candidate = hi;
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

  // Minimum moves, backward: the first record of each full compartment goes to the end of the one before.
  if (direction === "backward") {
    let current = candidate;
    while (!hasRoom(current)) {
      const pushed = lists[current]!.shift()!;
      const previous = current - 1;
      lists[previous]!.push(pushed);
      destination.set(pushed.id, slots[previous]!.id);
      current = previous;
    }
  }

  // 3–4. Cascade while the compartment we just added to was already full.
  let current = candidate;
  while (direction === "forward" && !hasRoom(current)) {
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

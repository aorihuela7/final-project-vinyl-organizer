/**
 * Compartment ranges for the map ("A – Bea") and spine colors.
 * Each end is abbreviated to the shortest prefix that tells it apart from the
 * neighboring compartment, like the dividers in a record store.
 */
import { collator, type SortKey } from "./sort";
import type { ShelfIndex } from "./query";
import type { SortLevel, SortSettings } from "./types";

function partOf(key: SortKey, level: SortLevel): string {
  if (level === "year") return key.year === null ? "—" : String(key.year);
  if (level === "tag") return key.tag;
  return key[level];
}

/** Shortest prefix of `value` that differs from the same prefix of `neighbor`. */
export function abbreviate(value: string, neighbor: string | null): string {
  const chars = Array.from(value);
  if (chars.length === 0) return value;
  if (!neighbor) return chars[0]!;
  const other = Array.from(neighbor);
  for (let i = 0; i < chars.length; i++) {
    if (i >= other.length || collator.compare(chars[i]!, other[i]!) !== 0) return chars.slice(0, i + 1).join("");
  }
  return value;
}

export type RangeLabel = { start: string; end: string; group: string | null; label: string };

export function rangeLabels(index: ShelfIndex, settings: SortSettings): Map<string, RangeLabel> {
  const labels = new Map<string, RangeLabel>();
  const levels = settings.levels;
  const filled = index.slots.filter((s) => (index.bySlot.get(s.id)?.length ?? 0) > 0);

  filled.forEach((slot, i) => {
    const records = index.bySlot.get(slot.id)!;
    const first = index.keys.get(records[0]!.id)!;
    const last = index.keys.get(records[records.length - 1]!.id)!;
    const prevSlot = filled[i - 1];
    const nextSlot = filled[i + 1];
    const prevLast = prevSlot ? index.keys.get(index.bySlot.get(prevSlot.id)!.at(-1)!.id)! : null;
    const nextFirst = nextSlot ? index.keys.get(index.bySlot.get(nextSlot.id)![0]!.id)! : null;

    const top = levels[0]!;
    const second = levels[1];
    const sameGroup = !!second && collator.compare(partOf(first, top), partOf(last, top)) === 0;
    // Genres and years are shown whole; names and titles are cut to the shortest distinguishing prefix.
    const short = (level: SortLevel, value: string, neighbor: string | null) =>
      level === "year" || level === "genre" || level === "tag" ? value : abbreviate(value, neighbor);
    const sameTop = (a: SortKey | null, b: SortKey) => !!a && collator.compare(partOf(a, top), partOf(b, top)) === 0;

    let start: string;
    let end: string;
    let group: string | null = null;
    let range: string;
    if (sameGroup) {
      // "Jazz · M – N": the whole compartment is inside one first-level group.
      group = partOf(first, top);
      start = short(second, partOf(first, second), sameTop(prevLast, first) ? partOf(prevLast!, second) : null);
      end = short(second, partOf(last, second), sameTop(nextFirst, last) ? partOf(nextFirst!, second) : null);
      range = records.length === 1 || start === end ? start : `${start} – ${end}`;
    } else if (second) {
      // "Pop · J – Rock · Al": the compartment crosses from one group into another.
      const s2 = short(second, partOf(first, second), sameTop(prevLast, first) ? partOf(prevLast!, second) : null);
      const e2 = short(second, partOf(last, second), sameTop(nextFirst, last) ? partOf(nextFirst!, second) : null);
      start = `${partOf(first, top)} · ${s2}`;
      end = `${partOf(last, top)} · ${e2}`;
      range = `${start} – ${end}`;
    } else {
      start = short(top, partOf(first, top), prevLast ? partOf(prevLast, top) : null);
      end = short(top, partOf(last, top), nextFirst ? partOf(nextFirst, top) : null);
      range = records.length === 1 || start === end ? start : `${start} – ${end}`;
    }
    labels.set(slot.id, { start, end, group, label: group ? `${group} · ${range}` : range });
  });
  return labels;
}

/** Spine color index per record: consecutive groups of the first sort level get consecutive palette colors. */
export function spineColors(index: ShelfIndex, settings: SortSettings, paletteSize: number): Map<string, number> {
  const top = settings.levels[0]!;
  const colors = new Map<string, number>();
  let color = -1;
  let previous: string | null = null;
  for (const r of index.sorted) {
    const value = partOf(index.keys.get(r.id)!, top);
    if (previous === null || collator.compare(value, previous) !== 0) {
      color = (color + 1) % paletteSize;
      previous = value;
    }
    colors.set(r.id, color);
  }
  return colors;
}

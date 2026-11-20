/**
 * The brass rail (the collection bar): one segment per value of the first sort
 * level, as wide as its share of the group's records. Letters for artist,
 * title, or label ("#" for digits), genre names for genre, decades for year.
 * Pure: the UI translates genre names and positions the marker.
 */
import type { ShelfIndex, SortSettings } from "@/lib/layout";
import { firstLetter } from "./plates";

export type RailSegment = {
  /** Canonical value: a letter, "#", a genre, a decade like "1970", or "" for no year. */
  key: string;
  kind: "letter" | "genre" | "decade";
  count: number;
  /** Index of the segment's first record in the group's order. */
  start: number;
  firstRecordId: string;
  firstSlotId: string;
};

export function railSegments(index: ShelfIndex, settings: SortSettings): RailSegment[] {
  const top = settings.levels[0]!;
  const segments: RailSegment[] = [];
  index.sorted.forEach((r, i) => {
    const k = index.keys.get(r.id)!;
    let key: string;
    let kind: RailSegment["kind"];
    if (top === "genre") {
      key = k.genre;
      kind = "genre";
    } else if (top === "year") {
      key = k.year === null ? "" : String(Math.floor(k.year / 10) * 10);
      kind = "decade";
    } else {
      key = firstLetter(k[top]);
      kind = "letter";
    }
    const last = segments[segments.length - 1];
    if (last && last.key === key) last.count++;
    else segments.push({ key, kind, count: 1, start: i, firstRecordId: r.id, firstSlotId: index.slotOf.get(r.id)!.id });
  });
  return segments;
}

/** Where a record falls on its group's rail, from 0 to 1 (the middle of its place). */
export function railPosition(index: ShelfIndex, recordId: string): number | null {
  const i = index.positionOf.get(recordId);
  if (i === undefined || index.sorted.length === 0) return null;
  return (i + 0.5) / index.sorted.length;
}

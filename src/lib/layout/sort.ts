/**
 * The sort key: the chosen levels (genre, artist, year, label, title), then the
 * fixed tiebreakers artist → year → title → id, so the order is total and
 * stable. Strings compare with Intl.Collator('en', { sensitivity: 'base',
 * numeric: true }): case- and accent-insensitive, and "Vol 2" < "Vol 10".
 */
import { normalizeArtist, normalizeGenre, normalizeLabel, normalizeTitle } from "./normalize";
import type { LayoutRecord, SortLevel, SortSettings } from "./types";

export const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** The normalized values of one record, computed once per sort. */
export type SortKey = {
  genre: string;
  artist: string;
  label: string;
  title: string;
  year: number | null;
  id: string;
};

export function sortKeyOf(record: LayoutRecord, settings: SortSettings): SortKey {
  return {
    genre: normalizeGenre(record.genre),
    artist: normalizeArtist(record.artist, settings.ignoreArticles, settings.articles),
    label: normalizeLabel(record.label),
    title: normalizeTitle(record.title, settings.ignoreArticles, settings.articles),
    year: record.year && record.year > 0 ? record.year : null,
    id: record.id,
  };
}

function compareYear(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1; // unknown years go last
  if (b === null) return -1;
  return a - b;
}

function compareLevel(a: SortKey, b: SortKey, level: SortLevel): number {
  if (level === "year") return compareYear(a.year, b.year);
  return collator.compare(a[level], b[level]);
}

const TIEBREAKERS: readonly SortLevel[] = ["artist", "year", "title"];

export function compareKeys(a: SortKey, b: SortKey, levels: readonly SortLevel[]): number {
  for (const level of levels) {
    const c = compareLevel(a, b, level);
    if (c !== 0) return c;
  }
  for (const level of TIEBREAKERS) {
    const c = compareLevel(a, b, level);
    if (c !== 0) return c;
  }
  // Last resort: the id, compared as plain code units so the order is total.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function compareRecords(a: LayoutRecord, b: LayoutRecord, settings: SortSettings): number {
  return compareKeys(sortKeyOf(a, settings), sortKeyOf(b, settings), settings.levels);
}

/** Returns a new array sorted by the sort key. Keys are computed once per record. */
export function sortRecords<T extends LayoutRecord>(records: readonly T[], settings: SortSettings): T[] {
  const keyed = records.map((record) => ({ record, key: sortKeyOf(record, settings) }));
  keyed.sort((x, y) => compareKeys(x.key, y.key, settings.levels));
  return keyed.map((k) => k.record);
}

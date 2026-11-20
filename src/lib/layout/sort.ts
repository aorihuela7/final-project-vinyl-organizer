/**
 * The sort key: the chosen levels (genre, artist, year, label, title), then the
 * fixed tiebreakers artist → year → title → id, so the order is total and
 * stable. Strings compare with Intl.Collator('en', { sensitivity: 'base',
 * numeric: true }): case- and accent-insensitive, and "Vol 2" < "Vol 10".
 */
import { NO_TAG, artistAliases, artistIdentity, normalizeArtist, normalizeGenre, normalizeLabel, normalizeTitle } from "./normalize";
import type { LayoutRecord, SortLevel, SortSettings } from "./types";

/** identity → the spelling every variant of that artist sorts under (see artistAliases). */
export type ArtistAliases = ReadonlyMap<string, string>;

/**
 * The aliases for a set of records. Computed from the records being laid out,
 * so a name only changes how it sorts when both spellings are in the collection.
 * With "ignore articles" on, stripping the article already unifies them.
 */
export function aliasesFor(records: readonly LayoutRecord[], settings: SortSettings): ArtistAliases | undefined {
  if (settings.ignoreArticles) return undefined;
  return artistAliases(
    records.map((r) => r.artist),
    settings.articles,
  );
}

/** The artist as it sorts: "Beatles" sorts as "The Beatles" when the collection also has "The Beatles". */
export function artistSortName(artist: string, settings: SortSettings, aliases?: ArtistAliases): string {
  if (settings.ignoreArticles) return normalizeArtist(artist, true, settings.articles);
  const name = normalizeArtist(artist, false, settings.articles);
  if (!aliases || aliases.size === 0) return name;
  return aliases.get(artistIdentity(artist, settings.articles)) ?? name;
}

export const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** The normalized values of one record, computed once per sort. */
export type SortKey = {
  genre: string;
  /** The artist's tag ("No tag" when untagged) and its place in the user's order (untagged last). */
  tag: string;
  tagRank: number;
  artist: string;
  label: string;
  title: string;
  year: number | null;
  id: string;
};

export function sortKeyOf(record: LayoutRecord, settings: SortSettings, aliases?: ArtistAliases): SortKey {
  return {
    genre: normalizeGenre(record.genre),
    tag: record.tag?.trim() || NO_TAG,
    tagRank: record.tag && record.tagRank !== null && record.tagRank !== undefined ? record.tagRank : Number.MAX_SAFE_INTEGER,
    artist: artistSortName(record.artist, settings, aliases),
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
  if (level === "tag") return a.tagRank - b.tagRank || collator.compare(a.tag, b.tag);
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

/** Compares two records on their own (no aliases: use sortRecords for a collection). */
export function compareRecords(a: LayoutRecord, b: LayoutRecord, settings: SortSettings): number {
  return compareKeys(sortKeyOf(a, settings), sortKeyOf(b, settings), settings.levels);
}

/** Returns a new array sorted by the sort key. Keys are computed once per record, with the aliases of these records. */
export function sortRecords<T extends LayoutRecord>(records: readonly T[], settings: SortSettings, aliases = aliasesFor(records, settings)): T[] {
  const keyed = records.map((record) => ({ record, key: sortKeyOf(record, settings, aliases) }));
  keyed.sort((x, y) => compareKeys(x.key, y.key, settings.levels));
  return keyed.map((k) => k.record);
}

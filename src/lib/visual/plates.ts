/**
 * Letter plates (docs/v2-design-plan.md, Part 3): each compartment on the map
 * shows a short range from the first sort level, never artist names.
 *
 * - Artist, title, or label: the first letter, and the second only when the
 *   neighboring compartment starts (or ends) with the same letter: "# – Al",
 *   "Al – Ba". Never more than two letters; "#" for digits.
 * - Year: the full years, "1972 – 1979", or "No year".
 * - Genre: the genre name plus the second level's range ("Rock A – Fe"); two
 *   lines where one genre ends and another starts; "Blues – Latin" over
 *   "3 genres" when three or more share a compartment.
 *
 * Keys are the normalized values the sort uses (Discogs "(2)" suffixes
 * removed, leading articles dropped when that option is on), with accents and
 * case folded. Pure: no React. Genre names stay canonical here; the UI
 * translates them.
 */
import { displayArtist, type LayoutRecord, type ShelfIndex, type SortLevel, type SortSettings } from "@/lib/layout";
import type { SortKey } from "@/lib/layout/sort";

export type PlateLine =
  /** A range of the level itself ("A – Al", "1972 – 1979"). */
  | { kind: "range"; text: string }
  /** A genre with the second level's range inside it ("Rock" + "A – Fe"). */
  | { kind: "genre"; genre: string; text: string }
  /** Three or more genres in one compartment: "Blues – Latin" + a count. */
  | { kind: "genres"; first: string; last: string; count: number };

export type Plate = {
  lines: PlateLine[];
  /** The full range with names, for the tooltip, the aria-label, and the compartment view. */
  full: string;
};

/** Letters and digits of a key, accents removed. */
function letters(value: string): string[] {
  return Array.from(value.normalize("NFD").replace(/\p{M}/gu, "")).filter((c) => /[\p{L}\p{N}]/u.test(c));
}

/** "#" for a key that starts with a digit, otherwise its first letter, upper case. */
export function firstLetter(value: string): string {
  const l = letters(value);
  if (l.length === 0) return "#";
  if (/\p{N}/u.test(l[0]!)) return "#";
  return l[0]!.toLocaleUpperCase("en");
}

/** The first two letters, as "Al". "#" never takes a second character. */
export function twoLetters(value: string): string {
  const first = firstLetter(value);
  if (first === "#") return "#";
  const second = letters(value)[1];
  return second ? first + second.toLocaleLowerCase("en") : first;
}

/**
 * One end of a range: the first letter, or the first two when the neighbor
 * across the boundary starts with the same letter.
 */
function endLetters(value: string, neighbor: string | null): string {
  const first = firstLetter(value);
  if (neighbor !== null && firstLetter(neighbor) === first) return twoLetters(value);
  return first;
}

export function letterRange(first: string, last: string, previous: string | null, next: string | null): string {
  const start = endLetters(first, previous);
  const end = endLetters(last, next);
  return start === end ? start : `${start} – ${end}`;
}

export function yearRange(first: number | null, last: number | null, noYear = "No year"): string {
  const a = first === null ? noYear : String(first);
  const b = last === null ? noYear : String(last);
  return a === b ? a : `${a} – ${b}`;
}

function value(key: SortKey, level: SortLevel): string {
  return level === "year" ? String(key.year ?? "") : key[level];
}

/** The range of a run of records on one level, with the neighbors across its two boundaries (null = no neighbor counted). */
function rangeOn(level: SortLevel, first: SortKey, last: SortKey, previous: SortKey | null, next: SortKey | null, noYear: string): string {
  if (level === "year") return yearRange(first.year, last.year, noYear);
  return letterRange(value(first, level), value(last, level), previous ? value(previous, level) : null, next ? value(next, level) : null);
}

/** How a record reads in the full range: the display name of the level's value. */
function describe(record: LayoutRecord, key: SortKey, level: SortLevel, noYear: string): string {
  switch (level) {
    case "artist":
      return displayArtist(record.artist);
    case "title":
      return record.title;
    case "label":
      return record.label ?? key.label;
    case "year":
      return key.year === null ? noYear : String(key.year);
    case "genre":
      return key.genre;
  }
}

export type PlateOptions = { noYear?: string; genreName?: (genre: string) => string };

/** Plates for every non-empty compartment of one format group, keyed by slot id. */
export function plateLabels(index: ShelfIndex, settings: SortSettings, options: PlateOptions = {}): Map<string, Plate> {
  const noYear = options.noYear ?? "No year";
  const genreName = options.genreName ?? ((g: string) => g);
  const top = settings.levels[0]!;
  // With genre first, the second level is the chosen one, or artist (the first tiebreaker).
  const second: SortLevel = settings.levels[1] ?? (top === "artist" ? "title" : "artist");
  const plates = new Map<string, Plate>();
  const filled = index.slots.filter((s) => (index.bySlot.get(s.id)?.length ?? 0) > 0);
  const keyOf = (r: LayoutRecord) => index.keys.get(r.id)!;

  filled.forEach((slot, i) => {
    const records = index.bySlot.get(slot.id)!;
    const firstRecord = records[0]!;
    const lastRecord = records[records.length - 1]!;
    const F = keyOf(firstRecord);
    const L = keyOf(lastRecord);
    const prevSlot = filled[i - 1];
    const nextSlot = filled[i + 1];
    const P = prevSlot ? keyOf(index.bySlot.get(prevSlot.id)!.at(-1)!) : null;
    const N = nextSlot ? keyOf(index.bySlot.get(nextSlot.id)![0]!) : null;

    let lines: PlateLine[];
    let full: string;
    if (top !== "genre") {
      lines = [{ kind: "range", text: rangeOn(top, F, L, P, N, noYear) }];
      const a = describe(firstRecord, F, top, noYear);
      const b = describe(lastRecord, L, top, noYear);
      full = a === b ? a : `${a} – ${b}`;
    } else {
      // Runs of consecutive records that share a genre.
      const runs: Array<{ genre: string; first: LayoutRecord; last: LayoutRecord }> = [];
      for (const r of records) {
        const g = keyOf(r).genre;
        const run = runs[runs.length - 1];
        if (run && run.genre === g) run.last = r;
        else runs.push({ genre: g, first: r, last: r });
      }
      const sameGenre = (k: SortKey | null, g: string) => (k && k.genre === g ? k : null);
      if (runs.length === 1) {
        const run = runs[0]!;
        lines = [{ kind: "genre", genre: run.genre, text: rangeOn(second, F, L, sameGenre(P, run.genre), sameGenre(N, run.genre), noYear) }];
      } else if (runs.length === 2) {
        const [a, b] = runs as [(typeof runs)[0], (typeof runs)[0]];
        lines = [
          { kind: "genre", genre: a.genre, text: rangeOn(second, keyOf(a.first), keyOf(a.last), sameGenre(P, a.genre), null, noYear) },
          { kind: "genre", genre: b.genre, text: rangeOn(second, keyOf(b.first), keyOf(b.last), null, sameGenre(N, b.genre), noYear) },
        ];
      } else {
        lines = [{ kind: "genres", first: runs[0]!.genre, last: runs[runs.length - 1]!.genre, count: runs.length }];
      }
      const end = (r: LayoutRecord, k: SortKey) => `${genreName(k.genre)}, ${describe(r, k, second, noYear)}`;
      const a = end(firstRecord, F);
      const b = end(lastRecord, L);
      full = a === b ? a : `${a} – ${b}`;
    }
    plates.set(slot.id, { lines, full });
  });
  return plates;
}

/** A plate as plain text (one string per line), with genre names translated. */
export function plateText(plate: Plate, genreName: (g: string) => string, genresCount: (n: number) => string): string[] {
  return plate.lines.flatMap((line) => {
    if (line.kind === "range") return [line.text];
    if (line.kind === "genre") return [`${genreName(line.genre)} ${line.text}`];
    return [`${genreName(line.first)} – ${genreName(line.last)}`, genresCount(line.count)];
  });
}

/** A plate as structured lines for display: a lead (the translated genre) and the range. */
export function plateLines(plate: Plate, genreName: (g: string) => string, genresCount: (n: number) => string): Array<{ lead?: string; text: string }> {
  return plate.lines.flatMap((line) => {
    if (line.kind === "range") return [{ text: line.text }];
    if (line.kind === "genre") return [{ lead: genreName(line.genre), text: line.text }];
    return [{ text: `${genreName(line.first)} – ${genreName(line.last)}` }, { text: genresCount(line.count) }];
  });
}

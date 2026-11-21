/**
 * Which shelf a record goes on, from its Discogs formats. Pure: no network.
 *
 * Media (unchanged from v1): walk the formats in order; the first vinyl format
 * (Vinyl, Shellac, Flexi-disc, Lathe Cut) makes it vinyl, the first CD format
 * makes it a CD, otherwise it isn't placed.
 *
 * Vinyl is split by size (Ale's rules, docs/v2-design-plan.md Part 4):
 * 1. An explicit size wins: 7" → single; 10" or 12" → LP.
 * 2. With no size, the exact description "Single" or "EP" → single (7").
 * 3. Everything else on vinyl, including LP, Maxi-Single, or no description → LP (12").
 * 4. With several vinyl formats (a box with an LP and a 7"), the largest size wins.
 *
 * Odd sizes are rounded to a shelf: up to 8" sits with singles, 9" to 11"
 * counts as 10", anything bigger as 12".
 *
 * The same rules live in SQL (public.classify_vinyl_size) for records written
 * by the deployed v1 and for the backfill.
 */
import type { DiscogsFormat } from "./types";

export type Media = "vinyl" | "cd" | "other";
export type FormatGroup = "lp" | "single" | "cd" | "other";
export type SizeInches = 7 | 10 | 12;

const VINYL_FORMATS = new Set(["vinyl", "shellac", "flexi-disc", "lathe cut"]);
const CD_FORMATS = new Set(["cd", "cdr", "sacd", "hybrid", "minidisc"]);

export function formatMedia(name: string): Media {
  const n = name.trim().toLowerCase();
  if (VINYL_FORMATS.has(n)) return "vinyl";
  if (CD_FORMATS.has(n)) return "cd";
  return "other";
}

/** The size in a description like `7"`, `12"`, or `10″`, or null. */
export function sizeFromDescription(description: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:"|″|''|inch|in)\s*$/i.exec(description);
  return m ? Number(m[1]) : null;
}

function shelfSize(inches: number): SizeInches {
  if (inches <= 8) return 7;
  if (inches < 11.5) return 10;
  return 12;
}

/** The size of one vinyl format from its descriptions (rules 1–3). */
export function vinylFormatSize(descriptions: readonly string[] | undefined): { size: SizeInches; explicit: boolean } {
  let largest: number | null = null;
  for (const d of descriptions ?? []) {
    const s = sizeFromDescription(d);
    if (s !== null && (largest === null || s > largest)) largest = s;
  }
  if (largest !== null) return { size: shelfSize(largest), explicit: true };
  if ((descriptions ?? []).some((d) => d === "Single" || d === "EP")) return { size: 7, explicit: false };
  return { size: 12, explicit: false };
}

export type Classification = { media: Media; group: FormatGroup; sizeInches: SizeInches | null; format: DiscogsFormat | null };

export function classifyFormats(formats: readonly DiscogsFormat[] | undefined): Classification {
  const list = formats ?? [];
  const first = list.find((f) => formatMedia(f.name) !== "other") ?? null;
  if (!first) return { media: "other", group: "other", sizeInches: null, format: list[0] ?? null };
  const media = formatMedia(first.name);
  if (media === "cd") return { media, group: "cd", sizeInches: null, format: first };
  // Rule 4: the largest size among all vinyl formats wins.
  let size: SizeInches = 7;
  let seen = false;
  for (const f of list) {
    if (formatMedia(f.name) !== "vinyl") continue;
    const s = vinylFormatSize(f.descriptions).size;
    if (!seen || s > size) size = s;
    seen = true;
  }
  return { media, group: size === 7 ? "single" : "lp", sizeInches: size, format: first };
}

/**
 * The group of a stored record. Records written before v2 may lack
 * format_group: classify them from the one format we stored.
 */
export function groupOfRecord(r: { media: Media; format_group?: FormatGroup | null; format_name?: string | null; format_descriptions?: readonly string[] | null }): FormatGroup {
  if (r.format_group) return r.format_group;
  if (r.media === "cd") return "cd";
  if (r.media === "other") return "other";
  return vinylFormatSize(r.format_descriptions ?? []).size === 7 ? "single" : "lp";
}

export function sizeOfRecord(r: { media: Media; size_inches?: number | null; format_descriptions?: readonly string[] | null }): SizeInches | null {
  if (r.size_inches === 7 || r.size_inches === 10 || r.size_inches === 12) return r.size_inches;
  if (r.media !== "vinyl") return null;
  return vinylFormatSize(r.format_descriptions ?? []).size;
}

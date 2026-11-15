/**
 * Normalization for sorting and display.
 * - Discogs adds " (2)" to tell apart artists with the same name: we strip it.
 * - Leading articles ("The Beatles" → "Beatles") can be ignored, from a configurable list.
 * - Leading punctuation is ignored ('"Weird Al" Yankovic' sorts under W).
 */

export const DEFAULT_ARTICLES: readonly string[] = ["The", "A", "An", "El", "La", "Los", "Las", "Le", "Les", "L'"];

export const NO_GENRE = "No genre";
export const NO_LABEL = "No label";

const SUFFIX = /\s+\(\d+\)$/u;
const LEADING_PUNCTUATION = /^[^\p{L}\p{N}]+/u;

export function stripDisambiguation(name: string): string {
  return name.replace(SUFFIX, "").trim();
}

function stripLeadingPunctuation(value: string): string {
  const stripped = value.replace(LEADING_PUNCTUATION, "");
  return stripped || value;
}

/** Removes one leading article. Never returns an empty string. */
export function stripArticle(value: string, articles: readonly string[] = DEFAULT_ARTICLES): string {
  const lower = value.toLocaleLowerCase();
  for (const article of articles) {
    const a = article.toLocaleLowerCase();
    if (a.endsWith("'") || a.endsWith("’")) {
      if (lower.startsWith(a) && value.length > a.length) return value.slice(a.length).trim();
      continue;
    }
    if (lower.startsWith(`${a} `)) {
      const rest = value.slice(a.length).trim();
      if (rest) return rest;
    }
  }
  return value;
}

export function normalizeArtist(artist: string, ignoreArticles: boolean, articles?: readonly string[]): string {
  let value = stripLeadingPunctuation(stripDisambiguation(artist.trim()));
  if (ignoreArticles) value = stripLeadingPunctuation(stripArticle(value, articles));
  return value;
}

export function normalizeTitle(title: string, ignoreArticles: boolean, articles?: readonly string[]): string {
  let value = stripLeadingPunctuation(title.trim());
  if (ignoreArticles) value = stripLeadingPunctuation(stripArticle(value, articles));
  return value;
}

export function normalizeGenre(genre: string | null): string {
  return genre?.trim() || NO_GENRE;
}

export function normalizeLabel(label: string | null): string {
  return label?.trim() || NO_LABEL;
}

/** What the UI shows as the artist: the suffix removed, articles kept. */
export function displayArtist(artist: string): string {
  return stripDisambiguation(artist.trim());
}

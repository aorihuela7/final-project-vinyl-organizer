/**
 * Normalization for sorting and display.
 * - Discogs adds " (2)" to tell apart artists with the same name: we strip it.
 * - Leading articles ("The Beatles" → "Beatles") can be ignored, from a configurable list.
 * - Either way, "The Beatles" and "Beatles" are one artist (see artistAliases).
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

const identityCache = new WeakMap<readonly string[], Map<string, string>>();

/**
 * What makes two artist names the same artist: case, accents, the Discogs
 * suffix, leading punctuation, and one leading article don't count.
 * "The Beatles", "the beatles", and "Beatles" share one identity. Cached,
 * because insertions recompute it for the whole collection.
 */
export function artistIdentity(artist: string, articles: readonly string[] = DEFAULT_ARTICLES): string {
  let cache = identityCache.get(articles);
  if (!cache) identityCache.set(articles, (cache = new Map()));
  let identity = cache.get(artist);
  if (identity === undefined) {
    const name = normalizeArtist(artist, false);
    identity = stripLeadingPunctuation(stripArticle(name, articles))
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase();
    cache.set(artist, identity);
  }
  return identity;
}

/**
 * Artists written with and without a leading article ("The Beatles" and
 * "Beatles") are one artist. Returns identity → the spelling with the article,
 * only for the names that appear both ways in `artists`, so they sort together
 * under that spelling even when articles are not ignored.
 */
export function artistAliases(artists: Iterable<string>, articles: readonly string[] = DEFAULT_ARTICLES): Map<string, string> {
  const withArticle = new Map<string, string>();
  const withoutArticle = new Set<string>();
  for (const artist of artists) {
    const name = normalizeArtist(artist, false);
    const identity = artistIdentity(artist, articles);
    if (stripArticle(name, articles) === name) {
      withoutArticle.add(identity);
    } else {
      // Several spellings with the article ("The Beatles", "THE BEATLES") compare equal; keep one, deterministically.
      const seen = withArticle.get(identity);
      if (seen === undefined || name < seen) withArticle.set(identity, name);
    }
  }
  const aliases = new Map<string, string>();
  for (const [identity, name] of withArticle) if (withoutArticle.has(identity)) aliases.set(identity, name);
  return aliases;
}

/** What the UI shows as the artist: the suffix removed, articles kept. */
export function displayArtist(artist: string): string {
  return stripDisambiguation(artist.trim());
}

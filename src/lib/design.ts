/** Small design helpers. Colors themselves live in src/styles/tokens.css. */

/** Mirrors the number of --color-spine-* tokens. */
export const SPINE_COUNT = 12;

export function spineColor(index: number): string {
  return `var(--color-spine-${((index % SPINE_COUNT) + SPINE_COUNT) % SPINE_COUNT})`;
}

/** How much of the spine ink a vertical spine mixes in (0–42%), stable per record. */
const SPINE_SHADES = 43;

/**
 * Fill of a vertical spine: the palette color of its group (the first sort
 * level), darkened by a stable, per-record amount. Records of one group stay
 * in one color family, and neighbors still look different.
 */
export function spineFill(colorIndex: number, recordId: string): string {
  const shade = hashIndex(recordId, SPINE_SHADES);
  return `color-mix(in oklab, ${spineColor(colorIndex)}, var(--color-spine-ink) ${shade}%)`;
}

/** Height of a vertical spine as a share of the compartment (94–100%), stable per record. */
export function spineHeight(recordId: string): number {
  return 94 + hashIndex(`h${recordId}`, 7);
}

/** Stable palette index for a string (used by cover placeholders). */
export function hashIndex(value: string, size = SPINE_COUNT): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h) % size;
}

export function initials(artist: string): string {
  const words = artist
    .replace(/\s+\(\d+\)$/, "")
    .replace(/^(the|los|las|la|el|les|le)\s+/i, "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters = words.slice(0, 2).map((w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ""))[0] ?? "");
  return letters.join("").toUpperCase() || "♪";
}

export function percent(fraction: number): number {
  return Math.round(fraction * 100);
}

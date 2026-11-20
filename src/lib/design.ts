/** Small design helpers. Colors themselves live in src/styles/tokens.css. */

/** Mirrors the number of --color-spine-* tokens (the Nogal record palette). */
export const SPINE_COUNT = 9;

/** Palette entries light enough to need ink text on top (the creams). */
const LIGHT_SPINES = new Set([2, 7]);

export function spineColor(index: number): string {
  return `var(--color-spine-${((index % SPINE_COUNT) + SPINE_COUNT) % SPINE_COUNT})`;
}

/** Ink on the light palette entries, paper on the dark ones. */
export function onSpineColor(index: number): string {
  const i = ((index % SPINE_COUNT) + SPINE_COUNT) % SPINE_COUNT;
  return LIGHT_SPINES.has(i) ? "var(--color-ink)" : "var(--color-paper)";
}

/** Stable palette index for a string (record IDs color the drawings; artists color cover placeholders). */
export function hashIndex(value: string, size = SPINE_COUNT): number {
  return hashUnit(value, size);
}

/** FNV-1a: a stable 32-bit hash, spread well enough for colors and small jitters. */
export function hash32(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashUnit(value: string, size: number): number {
  return hash32(value) % size;
}

/** Each record's color in a drawing: a hash of its ID into the palette. */
export function recordColor(recordId: string): string {
  return spineColor(hashIndex(recordId));
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

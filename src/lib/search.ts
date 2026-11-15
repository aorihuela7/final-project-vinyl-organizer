/** Instant search over the collection, ignoring accents and case. */
import { displayArtist } from "@/lib/layout";

export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

type Searchable = { id: string; artist: string; title: string; label?: string | null; year?: number | null };

/** Every word of the query must appear in artist, title, label, or year. Artist/title prefix matches rank first. */
export function searchRecords<T extends Searchable>(records: readonly T[], query: string, limit = 20): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<{ r: T; score: number }> = [];
  for (const r of records) {
    const artist = fold(displayArtist(r.artist));
    const title = fold(r.title);
    const haystack = `${artist} ${title} ${fold(r.label ?? "")} ${r.year ?? ""}`;
    if (!words.every((w) => haystack.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      if (artist.startsWith(w) || title.startsWith(w)) score += 3;
      else if (artist.includes(` ${w}`) || title.includes(` ${w}`)) score += 2;
      else score += 1;
    }
    scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score || a.r.artist.localeCompare(b.r.artist));
  return scored.slice(0, limit).map((s) => s.r);
}

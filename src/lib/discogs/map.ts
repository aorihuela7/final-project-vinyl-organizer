/**
 * Pure mapping from Discogs API shapes to our record rows.
 * No network, no Next or Supabase imports, so it's unit-tested.
 */
import type {
  DiscogsBasicInformation,
  DiscogsCollectionItem,
  DiscogsFormat,
  DiscogsRelease,
  DiscogsSearchResult,
} from "./types";

export type Media = "vinyl" | "cd" | "other";

/** A record as we store it (without ids and bookkeeping columns). */
export type RecordInput = {
  discogs_release_id: number;
  discogs_instance_id: number | null;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  genre: string | null;
  styles: string[];
  format_name: string | null;
  format_qty: number | null;
  format_descriptions: string[];
  media: Media;
  cover_url: string | null;
  thumb_url: string | null;
  discogs_url: string;
  date_added: string | null;
};

const VINYL_FORMATS = new Set(["vinyl", "shellac", "flexi-disc", "lathe cut"]);
const CD_FORMATS = new Set(["cd", "cdr", "sacd", "hybrid", "minidisc"]);

/**
 * Which shelf a record goes on: the first format that is a vinyl format makes
 * it vinyl, the first CD format makes it a CD, otherwise it isn't placed.
 * Formats are walked in order, so "Box Set" + "Vinyl" is vinyl.
 */
export function mediaOf(formats: DiscogsFormat[] | undefined): { media: Media; format: DiscogsFormat | null } {
  for (const f of formats ?? []) {
    const name = f.name.trim().toLowerCase();
    if (VINYL_FORMATS.has(name)) return { media: "vinyl", format: f };
    if (CD_FORMATS.has(name)) return { media: "cd", format: f };
  }
  return { media: "other", format: formats?.[0] ?? null };
}

export function releaseUrl(releaseId: number): string {
  return `https://www.discogs.com/release/${releaseId}`;
}

/** Discogs uses a spacer image when there's no cover. */
export function cleanImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes("spacer.gif")) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function firstNonEmpty(values: Array<string | undefined> | undefined): string | null {
  for (const v of values ?? []) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

function toInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function fromBasic(b: DiscogsBasicInformation, instanceId: number | null, dateAdded: string | null): RecordInput {
  const { media, format } = mediaOf(b.formats);
  return {
    discogs_release_id: b.id,
    discogs_instance_id: instanceId,
    artist: firstNonEmpty(b.artists?.map((a) => a.name)) ?? "Unknown Artist",
    title: b.title?.trim() || "Untitled",
    year: toInt(b.year),
    label: firstNonEmpty(b.labels?.map((l) => l.name)),
    genre: firstNonEmpty(b.genres),
    styles: (b.styles ?? []).map((s) => s.trim()).filter(Boolean),
    format_name: format?.name ?? null,
    format_qty: toInt(format?.qty),
    format_descriptions: format?.descriptions ?? [],
    media,
    cover_url: cleanImageUrl(b.cover_image),
    thumb_url: cleanImageUrl(b.thumb),
    discogs_url: releaseUrl(b.id),
    date_added: dateAdded,
  };
}

export function mapCollectionItem(item: DiscogsCollectionItem): RecordInput {
  return fromBasic(item.basic_information, item.instance_id, item.date_added ?? null);
}

/** Full release (GET /releases/{id}), used to add a record and to refresh added records. */
export function mapRelease(release: DiscogsRelease): RecordInput {
  const primary = release.images?.find((i) => i.type === "primary") ?? release.images?.[0];
  return fromBasic(
    {
      id: release.id,
      title: release.title,
      year: release.year,
      artists: release.artists,
      labels: release.labels,
      genres: release.genres,
      styles: release.styles,
      formats: release.formats,
      cover_image: primary?.uri,
      thumb: primary?.uri150 ?? release.thumb,
    },
    null,
    null,
  );
}

/**
 * Search results have the title as "Artist - Title" and a flat format list.
 * Only good enough to preview; adding a record fetches the full release.
 */
export function mapSearchResult(r: DiscogsSearchResult): RecordInput {
  const dash = r.title.indexOf(" - ");
  const artist = dash > 0 ? r.title.slice(0, dash).trim() : "Unknown Artist";
  const title = dash > 0 ? r.title.slice(dash + 3).trim() : r.title.trim();
  const formats: DiscogsFormat[] = (r.format ?? []).map((name) => ({ name }));
  const { media } = mediaOf(formats);
  return {
    discogs_release_id: r.id,
    discogs_instance_id: null,
    artist: artist || "Unknown Artist",
    title: title || "Untitled",
    year: toInt(r.year),
    label: firstNonEmpty(r.label),
    genre: firstNonEmpty(r.genre),
    styles: r.style ?? [],
    format_name: r.format?.[0] ?? null,
    format_qty: null,
    format_descriptions: (r.format ?? []).slice(1),
    media,
    cover_url: cleanImageUrl(r.cover_image),
    thumb_url: cleanImageUrl(r.thumb),
    discogs_url: releaseUrl(r.id),
    date_added: null,
  };
}

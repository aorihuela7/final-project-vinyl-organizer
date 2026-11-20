/**
 * A release's tracklist, shaped for the record detail: grouped by side (A1 and
 * A2 under side A, C1 under side C for a second disc, 1-3 under disc 1),
 * headings kept as subheadings, index tracks with their parts. Pure.
 */
import type { DiscogsTrack } from "./types";

export type Track = { position: string; title: string; duration: string | null; parts?: Track[] };
export type TracklistItem = { kind: "heading"; title: string } | ({ kind: "track" } & Track);
/** side: a vinyl side letter ("A", "AA"), a disc ("disc:2"), or null when positions don't say. */
export type TracklistSection = { side: string | null; items: TracklistItem[] };

/** The side or disc a position belongs to. */
export function sideOf(position: string): string | null {
  const p = position.trim();
  if (!p) return null;
  // Disc and track: "1-3", "2.04", "CD1-1", "CD2.3", "DVD-1".
  const disc = /^(?:CD|DVD|LP|Disc|BD)?\s*(\d+)\s*[-.]\s*\d+/i.exec(p);
  if (disc) return `disc:${Number(disc[1])}`;
  // A vinyl side: one or two letters, then an optional track number and sub-letter ("A", "B2", "AA1", "C3a").
  const side = /^([A-Z]{1,2})\d*[a-z]?$/.exec(p);
  if (side) return side[1]!;
  return null;
}

function toTrack(t: DiscogsTrack): Track {
  const duration = t.duration?.trim() || null;
  const track: Track = { position: t.position?.trim() ?? "", title: t.title?.trim() || "?", duration };
  const parts = (t.sub_tracks ?? []).filter((s) => (s.type_ ?? "track") === "track").map(toTrack);
  if (parts.length) track.parts = parts;
  return track;
}

export function parseTracklist(tracklist: readonly DiscogsTrack[] | undefined): TracklistSection[] {
  const sections: TracklistSection[] = [];
  let current: TracklistSection | null = null;
  for (const entry of tracklist ?? []) {
    const type = entry.type_ ?? "track";
    if (type === "heading") {
      if (!current) {
        current = { side: null, items: [] };
        sections.push(current);
      }
      current.items.push({ kind: "heading", title: entry.title?.trim() || "" });
      continue;
    }
    if (type !== "track" && type !== "index") continue;
    // An index track takes its side from its first part when it has no position of its own.
    const position = entry.position?.trim() || entry.sub_tracks?.[0]?.position?.trim() || "";
    const side = sideOf(position);
    if (!current || (side !== null && side !== current.side)) {
      current = { side, items: [] };
      sections.push(current);
    }
    current.items.push({ kind: "track", ...toTrack(entry) });
  }
  return sections.filter((s) => s.items.length > 0);
}

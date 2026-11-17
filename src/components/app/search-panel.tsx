"use client";

import { useMemo, useState } from "react";
import { displayArtist } from "@/lib/layout";
import { searchRecords } from "@/lib/search";
import { slotTitle } from "@/lib/shelf/describe";
import type { MediaView, ShelfConfig, StoredRecord } from "@/lib/shelf/model";
import { Cover } from "./cover";
import { findLocation } from "./record-details";

/** Instant search over the whole collection, ignoring accents and case. */
export function SearchPanel({
  records,
  views,
  config,
  onPick,
}: {
  records: StoredRecord[];
  views: MediaView[];
  config: ShelfConfig;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchRecords(records, query, 12), [records, query]);

  return (
    <div className="relative">
      <label htmlFor="search" className="sr-only">
        Search your records
      </label>
      <input
        id="search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search an artist or a title"
        autoComplete="off"
        className="w-full rounded-control border border-line-strong bg-surface px-4 py-3 text-base text-ink shadow-card placeholder:text-ink-faint"
      />
      {query.trim() && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60dvh] overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-sheet" aria-label="Search results">
          {results.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">No records match “{query.trim()}”.</li>}
          {results.map((r) => {
            const loc = findLocation(views, r.id);
            const furniture = loc ? config.furniture.find((f) => f.key === loc.slot.shelfKey) : undefined;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r.id);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-sunken"
                >
                  <Cover src={r.thumb_url ?? r.cover_url} artist={r.artist} title={r.title} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{displayArtist(r.artist)}</span>
                    <span className="block truncate text-sm text-ink-muted">{r.title}</span>
                    <span className="block truncate text-xs text-ink-faint">
                      {loc ? `${slotTitle(loc.slot, furniture)} · ${Math.round(loc.fraction * 100)}% from the left` : r.media === "other" ? "Not a vinyl or CD" : "Not on the shelf"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

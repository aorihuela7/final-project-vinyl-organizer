"use client";

import { useEffect, useMemo, useState } from "react";
import { releaseUrl, type RecordInput } from "@/lib/discogs/map";
import { buildIndex, displayArtist, locate } from "@/lib/layout";
import { formatLine, slotTitle } from "@/lib/shelf/describe";
import { toLayoutRecord, toSortSettings, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { Cover } from "./cover";
import { DiscogsAttribution } from "./discogs-attribution";
import { LocationSummary } from "./record-details";
import { Sheet } from "./sheet";
import type { ShelfApp } from "./use-shelf-app";

type Props = {
  app: ShelfApp;
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  onClose: () => void;
  onShowRecord: (id: string, slotId: string | null) => void;
};

/** "Where does this record go?": search Discogs, see the compartment, the neighbors, and the moves; then Add. */
export function AddRecord({ app, config, byId, onClose, onShowRecord }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecordInput[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<RecordInput | null>(null);
  const [loadingRelease, setLoadingRelease] = useState(false);

  // Debounced search through our server route (the Discogs token never reaches the browser).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || chosen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(`/api/discogs/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = (await res.json()) as { results?: RecordInput[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Search failed.");
        setResults(json.results ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, chosen]);

  async function choose(result: RecordInput) {
    setLoadingRelease(true);
    setError(null);
    try {
      const res = await fetch(`/api/discogs/release?id=${result.discogs_release_id}`);
      const json = (await res.json()) as { record?: RecordInput; error?: string };
      if (!res.ok || !json.record) throw new Error(json.error ?? "Couldn't load that release.");
      setChosen(json.record);
    } catch (err) {
      // Fall back to the search result, which has the basics.
      setChosen(result);
      setError((err as Error).message);
    } finally {
      setLoadingRelease(false);
    }
  }

  const preview = useMemo(() => (chosen ? app.previewInsert(chosen) : null), [chosen, app]);

  const location = useMemo(() => {
    if (!preview || !preview.media || !preview.target) return null;
    const view = app.views.find((v) => v.media === preview.media);
    if (!view) return null;
    const group = (app.data?.records ?? []).filter((r) => r.media === preview.media && preview.placement.has(r.id));
    const index = buildIndex([...group, preview.record].map(toLayoutRecord), preview.placement, view.index.slots, toSortSettings(config.settings));
    return locate(index, preview.record.id);
  }, [preview, app.views, app.data?.records, config.settings]);

  const byIdWithNew = useMemo(() => {
    if (!preview) return byId;
    const m = new Map(byId);
    m.set(preview.record.id, preview.record);
    return m;
  }, [byId, preview]);

  const slotName = (id: string | null) => {
    if (id === null) return "off the shelf";
    for (const v of app.views) {
      const s = v.index.slotById.get(id);
      if (s) return slotTitle(s, config.furniture.find((f) => f.key === s.shelfKey));
    }
    return "another compartment";
  };

  return (
    <Sheet title="Where does this record go?" onClose={onClose}>
      {!chosen ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="discogs-search" className="text-sm text-ink-muted">
            Search Discogs for the record you just bought.
          </label>
          <input
            id="discogs-search"
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Artist and title, e.g. Kind of Blue Miles Davis"
            className="rounded-control border border-line-strong bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint"
          />
          {searching && <p className="text-sm text-ink-muted">Searching Discogs…</p>}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <ul className="flex flex-col">
            {(query.trim().length >= 2 ? results : []).map((r) => (
              <li key={r.discogs_release_id}>
                <button
                  type="button"
                  disabled={loadingRelease}
                  onClick={() => choose(r)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-sunken disabled:opacity-50"
                >
                  <Cover src={r.thumb_url ?? r.cover_url} artist={r.artist} title={r.title} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{displayArtist(r.artist)}</span>
                    <span className="block truncate text-sm text-ink-muted">{r.title}</span>
                    <span className="block truncate text-xs text-ink-faint">{[r.year, r.format_name, r.label].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {query.trim().length >= 2 && results.length > 0 && <DiscogsAttribution />}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Cover src={chosen.cover_url ?? chosen.thumb_url} artist={chosen.artist} title={chosen.title} />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink">{displayArtist(chosen.artist)}</p>
              <p className="text-ink">{chosen.title}</p>
              <p className="text-ink-muted">{[chosen.year, formatLine(chosen), chosen.label].filter(Boolean).join(" · ")}</p>
              <DiscogsAttribution href={releaseUrl(chosen.discogs_release_id)} />
            </div>
          </div>

          {!preview?.media ? (
            <p className="rounded-card bg-warning-soft p-3 text-sm text-warning">
              {chosen.format_group === "other"
                ? `This is a ${chosen.format_name ?? "non-vinyl"} release, so it doesn't go on a shelf.`
                : `You don't have a shelf for ${chosen.format_group === "cd" ? "CDs" : chosen.format_group === "single" ? "singles (7″)" : "LPs"} yet. Add one in Shelves & order.`}
            </p>
          ) : !preview.target ? (
            <p className="rounded-card bg-warning-soft p-3 text-sm text-warning">Your shelves are full: there&apos;s no room for it anywhere.</p>
          ) : (
            <>
              {location && <LocationSummary location={location} config={config} byId={byIdWithNew} />}
              {preview.movedCount <= 1 ? (
                <p className="rounded-card bg-success-soft p-3 text-sm text-success">It fits. Just put it in: 1 move.</p>
              ) : (
                <div className="rounded-card bg-warning-soft p-3 text-sm text-warning">
                  <p className="font-semibold">That compartment is full: {preview.movedCount} moves.</p>
                  <ol className="mt-1 list-decimal pl-5 text-ink">
                    {preview.moves.map((m) => {
                      const r = byIdWithNew.get(m.recordId);
                      return (
                        <li key={m.recordId}>
                          {r ? `${displayArtist(r.artist)} – ${r.title}` : "Record"}: {m.from === null ? "put it in" : `from ${slotName(m.from)}`} → {slotName(m.to)}
                        </li>
                      );
                    })}
                  </ol>
                  {preview.overflow.length > 0 && <p className="mt-1">The last record no longer fits on your shelves.</p>}
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-ink-muted">({error} Showing the search result data.)</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={app.busy || !preview?.media}
              onClick={async () => {
                const result = await app.addRecord(chosen);
                if (result) onShowRecord(result.stored.id, result.preview?.target ?? null);
              }}
              className="flex-1 rounded-control bg-accent px-4 py-3 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {app.busy ? "Adding…" : "Add to my shelf"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChosen(null);
                setError(null);
              }}
              className="rounded-control border border-line-strong px-4 py-3 text-sm font-medium hover:bg-sunken"
            >
              Back
            </button>
          </div>
          <p className="text-xs text-ink-muted">Adding saves it here only; your Discogs collection doesn&apos;t change.</p>
        </div>
      )}
    </Sheet>
  );
}

"use client";

import { useMemo, useState } from "react";
import { displayArtist, rangeLabels, spineColors, type Slot } from "@/lib/layout";
import { SPINE_COUNT, spineColor } from "@/lib/design";
import { slotTitle } from "@/lib/shelf/describe";
import { toSortSettings, type MediaView, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { searchRecords } from "@/lib/search";
import { DiscogsAttribution } from "./discogs-attribution";
import { Sheet } from "./sheet";
import type { ShelfApp } from "./use-shelf-app";

type Props = {
  slot: Slot;
  view: MediaView;
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  app: ShelfApp;
  onClose: () => void;
  onPickRecord: (id: string) => void;
};

/** The records of one compartment, left to right, as typographic spines. */
export function CompartmentSheet({ slot, view, config, byId, app, onClose, onPickRecord }: Props) {
  const [calibrating, setCalibrating] = useState(false);
  const settings = toSortSettings(config.settings);
  const records = view.index.bySlot.get(slot.id) ?? [];
  const label = rangeLabels(view.index, settings).get(slot.id)?.label;
  const colors = spineColors(view.index, settings, SPINE_COUNT);
  const furniture = config.furniture.find((f) => f.key === slot.shelfKey);
  const over = records.length > slot.capacity;

  return (
    <Sheet title={slotTitle(slot, furniture)} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">{label ?? "Empty compartment"}</p>
          <p className={`text-sm ${over ? "font-semibold text-danger" : "text-ink-muted"}`}>
            {records.length} of {slot.capacity} records{over ? " · over capacity" : ""}
          </p>
        </div>
        {over && (
          <p className="rounded-card bg-danger-soft p-2 text-sm text-danger">
            You marked this compartment as fuller than its capacity. That&apos;s fine: the map follows your real shelf.
          </p>
        )}

        {calibrating ? (
          <Calibrate slot={slot} view={view} byId={byId} app={app} onDone={() => setCalibrating(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setCalibrating(true)}
            className="self-start rounded-control border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:bg-sunken"
          >
            The first record here is different…
          </button>
        )}

        {records.length > 0 && <p className="text-xs uppercase tracking-wide text-ink-faint">Left → right</p>}
        <ol className="flex flex-col gap-1">
          {records.map((r, i) => {
            const stored = byId.get(r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onPickRecord(r.id)}
                  className="flex w-full items-center gap-2 rounded-cell px-2 py-2 text-left text-sm text-ink hover:brightness-95"
                  style={{ background: spineColor(colors.get(r.id) ?? 0) }}
                >
                  <span className="w-7 shrink-0 text-right text-xs tabular-nums text-ink/60">{i + 1}</span>
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{displayArtist(r.artist)}</span>
                    <span className="text-ink/70"> · {r.title}</span>
                  </span>
                  {stored?.origin === "added" && <span className="ml-auto shrink-0 text-[10px] uppercase text-ink/60">added</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <DiscogsAttribution />
      </div>
    </Sheet>
  );
}

/** Calibration: "This is the first record in this compartment", choosing the record through search. */
function Calibrate({ slot, view, byId, app, onDone }: { slot: Slot; view: MediaView; byId: Map<string, StoredRecord>; app: ShelfApp; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const previous = view.index.slots[slot.index - 1];
  // Only records from this compartment and the previous one can become its first record.
  const candidates = useMemo(() => {
    const ids = [...(view.index.bySlot.get(slot.id) ?? []), ...(previous ? (view.index.bySlot.get(previous.id) ?? []) : [])].map((r) => r.id);
    return ids.map((id) => byId.get(id)).filter((r): r is StoredRecord => !!r);
  }, [view, slot.id, previous, byId]);
  const results = query.trim() ? searchRecords(candidates, query, 8) : [];

  async function choose(id: string) {
    setError(null);
    const result = await app.calibrate(id, slot.id);
    if (!result.ok) setError(result.reason);
    else onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line p-3">
      <label htmlFor="calibrate-search" className="text-sm font-medium text-ink">
        Which record is really the first one in this compartment?
      </label>
      <input
        id="calibrate-search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this compartment and the one before"
        className="rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint"
      />
      {results.length > 0 && (
        <ul className="flex flex-col">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" disabled={app.busy} onClick={() => choose(r.id)} className="w-full rounded-control px-2 py-2 text-left text-sm hover:bg-sunken disabled:opacity-50">
                <span className="font-medium text-ink">{displayArtist(r.artist)}</span> <span className="text-ink-muted">· {r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && <p className="text-sm text-ink-muted">No match in this compartment or the previous one.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-muted">Only the boundary with the previous compartment moves. Everything else stays where it is.</p>
      <button type="button" onClick={onDone} className="self-start text-sm font-medium text-ink-muted underline">
        Cancel
      </button>
    </div>
  );
}

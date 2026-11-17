"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { displayArtist, type LayoutRecord } from "@/lib/layout";
import { spineFill, spineHeight } from "@/lib/design";
import type { StoredRecord } from "@/lib/shelf/model";

type Props = {
  records: readonly LayoutRecord[];
  capacity: number;
  /** Palette index per record (the first sort level). */
  colors: Map<string, number>;
  byId: Map<string, StoredRecord>;
  /** The record the user last looked at, marked if it's in this compartment. */
  highlightId: string | null;
  onPick: (id: string) => void;
};

/**
 * The compartment seen from the front: one vertical spine per record, left to
 * right, each as wide as one record's share of the capacity, so the free space
 * shows on the right. Hovering (or focusing) a spine shows artist and title in a
 * bubble; clicking it opens the record card with the cover. Arrow keys move
 * between spines.
 */
export function SpineShelf({ records, capacity, colors, byId, highlightId, onPick }: Props) {
  const tooltipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [active, setActive] = useState(() => Math.max(0, records.findIndex((r) => r.id === highlightId)));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const width = 100 / Math.max(capacity, records.length, 1);
  const current = Math.min(active, Math.max(records.length - 1, 0));
  const shown = hover !== null ? records[hover] : undefined;
  const anchor = hover !== null ? (hover + 0.5) * width : 0;

  function onKeyDown(e: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: records.length - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = Math.min(records.length - 1, Math.max(0, moves[e.key]!));
    setActive(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="relative">
      {shown && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-64 rounded-card bg-ink px-3 py-2 text-sm text-surface shadow-tooltip"
          // The bubble's own width shifts by the same share as its anchor, so it never leaves the compartment.
          style={{ left: `${anchor}%`, transform: `translateX(-${anchor}%)` }}
        >
          <p className="font-semibold">{displayArtist(shown.artist)}</p>
          <p className="text-surface/85">{shown.title}</p>
          <p className="mt-0.5 text-xs text-surface/70">
            {hover! + 1} of {records.length}
            {byId.get(shown.id)?.origin === "added" ? " · added by you" : ""}
          </p>
          <span aria-hidden className="absolute top-full size-2.5 -translate-x-1/2 -translate-y-1.5 rotate-45 bg-ink" style={{ left: `${anchor}%` }} />
        </div>
      )}
      <div
        role="group"
        aria-label="Spines, left to right"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
        className="flex h-56 items-end gap-px overflow-hidden rounded-cell border-4 border-line-strong bg-sunken px-px pt-2"
      >
        {records.map((r, i) => (
          <button
            key={r.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            tabIndex={i === current ? 0 : -1}
            aria-label={`${i + 1}. ${displayArtist(r.artist)} – ${r.title}`}
            aria-describedby={hover === i ? tooltipId : undefined}
            onMouseEnter={() => setHover(i)}
            onFocus={() => {
              setHover(i);
              setActive(i);
            }}
            onBlur={() => setHover((h) => (h === i ? null : h))}
            onClick={() => onPick(r.id)}
            className={`shrink-0 rounded-t-[2px] shadow-spine transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
              r.id === highlightId ? "outline-2 outline-offset-1 outline-accent" : ""
            }`}
            style={{ width: `calc(${width}% - 1px)`, height: `${spineHeight(r.id)}%`, background: spineFill(colors.get(r.id) ?? 0, r.id) }}
          />
        ))}
        {records.length === 0 && <p className="m-auto text-sm text-ink-muted">Empty</p>}
      </div>
    </div>
  );
}

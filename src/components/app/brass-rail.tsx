"use client";

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { displayArtist, type SortSettings } from "@/lib/layout";
import type { MediaView } from "@/lib/shelf/model";
import { railPosition, railSegments, type RailSegment } from "@/lib/visual/rail";
import { genreName } from "@/i18n/core";
import { useI18n } from "@/i18n/client";

type Props = {
  view: MediaView;
  settings: SortSettings;
  /** The found record: the mustard marker slides to where it falls. */
  foundId: string | null;
  /** Scroll to the compartment where a segment starts. */
  onJump: (slotId: string) => void;
  /** Dragging the marker and letting go there picks the record at that spot, like a search. */
  onPick?: (recordId: string) => void;
};

/**
 * The brass rail: the whole format group from start to end, one engraved
 * segment per letter, genre, or decade, each as wide as its share of records.
 * The mustard marker hangs below the rail, so it never hides a letter. It can
 * be dragged (or moved with the arrow keys): where it's let go, that record is picked.
 */
export const BrassRail = memo(function BrassRail({ view, settings, foundId, onJump, onPick }: Props) {
  const { t, locale } = useI18n();
  const segments = useMemo(() => railSegments(view.index, settings), [view.index, settings]);
  const marker = foundId ? railPosition(view.index, foundId) : null;
  if (segments.length === 0) return null;

  const sorted = view.index.sorted;
  const recordAt = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)))]!;
  const describe = (fraction: number) => {
    const r = recordAt(fraction);
    return `${displayArtist(r.artist)}, ${r.title}`;
  };
  const drag: RailDrag | undefined = onPick
    ? {
        count: sorted.length,
        index: foundId ? (view.index.positionOf.get(foundId) ?? 0) : 0,
        describe,
        label: t("rail.marker"),
        onDrop: (fraction) => onPick(recordAt(fraction).id),
      }
    : undefined;

  const label = (s: RailSegment) => {
    if (s.kind === "genre") return genreName(locale, s.key);
    if (s.kind === "decade") return s.key ? t("rail.decade", { decade: s.key }) : t("map.noYear");
    return s.key;
  };
  const items: RailItem[] = segments.map((s) => {
    const text = label(s);
    return {
      key: `${s.key}-${s.start}`,
      label: text,
      count: s.count,
      title: t("rail.segment", { label: text, count: s.count }),
      ariaLabel: t("rail.segmentGo", { label: text, count: s.count }),
      onClick: () => onJump(s.firstSlotId),
    };
  });
  return (
    <RailBar
      items={items}
      marker={marker}
      drag={drag}
      ariaLabel={t("rail.label", { media: t(`mediaShort.${view.media}`), first: items[0]!.label, last: items[items.length - 1]!.label })}
    />
  );
});

export type RailItem = { key: string; label: string; count: number; title: string; ariaLabel: string; onClick?: () => void };

/** What a draggable marker needs: how many records, which one it's on, and what to do when it's let go. */
export type RailDrag = {
  count: number;
  index: number;
  /** The record at a spot, for the bubble and screen readers. */
  describe: (fraction: number) => string;
  label: string;
  onDrop: (fraction: number) => void;
};

/** The rail itself: segments sized by count, engraved separators, labels only where they fit, and the marker. */
export function RailBar({ items, marker, ariaLabel, drag }: { items: RailItem[]; marker: number | null; ariaLabel: string; drag?: RailDrag }) {
  const rail = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const total = items.reduce((n, s) => n + s.count, 0) || 1;
  /** A label shows only where it fits whole (at least about 16 px); the tooltip and aria-label always stay. */
  const fits = (text: string, count: number) => width === 0 || (count / total) * width >= Math.max(16, Array.from(text).length * 7.4 + 8);

  return (
    <nav aria-label={ariaLabel} className="relative mb-3.5" data-tour="rail">
      <div ref={rail} className="surface-rail relative flex h-[34px] overflow-hidden rounded-[17px] font-display text-sm">
        {items.map((s, i) => {
          const Tag = s.onClick ? "button" : "span";
          return (
            <Tag
              key={s.key}
              type={s.onClick ? "button" : undefined}
              onClick={s.onClick}
              title={s.title}
              aria-label={s.ariaLabel}
              className={`relative flex h-full min-w-0 basis-0 items-center justify-center hover:bg-white/15 focus-visible:z-10 ${
                i > 0 ? "before:absolute before:top-2 before:bottom-2 before:left-0 before:w-px before:bg-(--color-rail-line)" : ""
              }`}
              style={{ flexGrow: s.count }}
            >
              <span aria-hidden className={`block overflow-hidden px-0.5 text-center whitespace-nowrap [text-shadow:0_1px_0_rgb(255_255_255/0.45)] ${fits(s.label, s.count) ? "" : "invisible"}`}>
                {s.label}
              </span>
            </Tag>
          );
        })}
      </div>
      {marker !== null && !drag && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[25px] -bottom-3 w-3.5 -translate-x-1/2 rounded-[7px] bg-mustard shadow-[0_0_0_2px_var(--color-ink)] transition-[left] duration-1000 ease-[cubic-bezier(.3,.9,.25,1)]"
          style={{ left: `${marker * 100}%` }}
        />
      )}
      {marker !== null && drag && <DraggableMarker rail={rail} marker={marker} drag={drag} />}
    </nav>
  );
}

/**
 * The marker as a slider: drag it along the rail (a bubble names the record
 * under it) and let go to pick that record; or focus it and use the arrow
 * keys (Page Up/Down jump ten, Home and End go to the ends).
 */
function DraggableMarker({ rail, marker, drag }: { rail: RefObject<HTMLDivElement | null>; marker: number; drag: RailDrag }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const fractionAt = (clientX: number) => {
    const box = rail.current?.getBoundingClientRect();
    if (!box || box.width === 0) return marker;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  };
  // The middle of a record's place, so the bubble and the drop agree.
  const snap = (fraction: number) => (Math.min(drag.count - 1, Math.floor(fraction * drag.count)) + 0.5) / drag.count;

  const onPointerDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setDragging(fractionAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    if (dragging !== null) setDragging(fractionAt(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<HTMLSpanElement>) => {
    if (dragging === null) return;
    const at = fractionAt(e.clientX);
    setDragging(null);
    drag.onDrop(at);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
    let index: number | null = step !== undefined ? drag.index + step : null;
    if (e.key === "Home") index = 0;
    if (e.key === "End") index = drag.count - 1;
    if (index === null) return;
    e.preventDefault();
    index = Math.min(drag.count - 1, Math.max(0, index));
    if (index !== drag.index) drag.onDrop((index + 0.5) / drag.count);
  };

  const at = dragging ?? marker;
  return (
    <>
      <span
        role="slider"
        tabIndex={0}
        aria-label={drag.label}
        aria-valuemin={1}
        aria-valuemax={drag.count}
        aria-valuenow={drag.index + 1}
        aria-valuetext={drag.describe(marker)}
        data-rail-marker
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragging(null)}
        onKeyDown={onKeyDown}
        // A wider, taller hit area than the marker itself, for fingers.
        className={`absolute top-[18px] -bottom-5 z-10 flex w-9 -translate-x-1/2 touch-none justify-center rounded-[10px] outline-offset-2 select-none ${
          dragging === null ? "cursor-grab transition-[left] duration-1000 ease-[cubic-bezier(.3,.9,.25,1)]" : "cursor-grabbing"
        }`}
        style={{ left: `${at * 100}%` }}
      >
        <span aria-hidden className="mt-[7px] mb-2 w-3.5 rounded-[7px] bg-mustard shadow-[0_0_0_2px_var(--color-ink)]" />
      </span>
      {dragging !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[52px] z-20 w-max max-w-64 -translate-x-1/2 truncate rounded-card bg-ink px-3 py-1.5 text-sm text-paper shadow-tooltip"
          style={{ left: `clamp(80px, ${snap(dragging) * 100}%, calc(100% - 80px))` }}
        >
          {drag.describe(dragging)}
        </span>
      )}
    </>
  );
}

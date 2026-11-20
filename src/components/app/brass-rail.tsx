"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SortSettings } from "@/lib/layout";
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
};

/**
 * The brass rail: the whole format group from start to end, one engraved
 * segment per letter, genre, or decade, each as wide as its share of records.
 * The mustard marker hangs below the rail, so it never hides a letter.
 */
export const BrassRail = memo(function BrassRail({ view, settings, foundId, onJump }: Props) {
  const { t, locale } = useI18n();
  const segments = useMemo(() => railSegments(view.index, settings), [view.index, settings]);
  const marker = foundId ? railPosition(view.index, foundId) : null;
  if (segments.length === 0) return null;

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
      ariaLabel={t("rail.label", { media: t(`mediaShort.${view.media}`), first: items[0]!.label, last: items[items.length - 1]!.label })}
    />
  );
});

export type RailItem = { key: string; label: string; count: number; title: string; ariaLabel: string; onClick?: () => void };

/** The rail itself: segments sized by count, engraved separators, labels only where they fit, and the marker. */
export function RailBar({ items, marker, ariaLabel }: { items: RailItem[]; marker: number | null; ariaLabel: string }) {
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
      {marker !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[25px] -bottom-3 w-3.5 -translate-x-1/2 rounded-[7px] bg-mustard shadow-[0_0_0_2px_var(--color-ink)] transition-[left] duration-1000 ease-[cubic-bezier(.3,.9,.25,1)]"
          style={{ left: `${marker * 100}%` }}
        />
      )}
    </nav>
  );
}

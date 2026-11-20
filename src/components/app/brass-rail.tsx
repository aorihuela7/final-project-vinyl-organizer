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
  const rail = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [segments.length]);
  if (segments.length === 0) return null;
  const total = segments.reduce((n, s) => n + s.count, 0);
  /** A label shows only where it fits whole (at least about 16 px); the tooltip and aria-label always stay. */
  const fits = (text: string, count: number) => width === 0 || (count / total) * width >= Math.max(16, Array.from(text).length * 7.4 + 8);

  const label = (s: RailSegment) => {
    if (s.kind === "genre") return genreName(locale, s.key);
    if (s.kind === "decade") return s.key ? t("rail.decade", { decade: s.key }) : t("map.noYear");
    return s.key;
  };
  const first = label(segments[0]!);
  const last = label(segments[segments.length - 1]!);

  return (
    <nav aria-label={t("rail.label", { media: t(`mediaShort.${view.media}`), first, last })} className="relative mb-3.5" data-tour="rail">
      <div ref={rail} className="surface-rail relative flex h-[34px] overflow-hidden rounded-[17px] font-display text-sm">
        {segments.map((s, i) => {
          const text = label(s);
          return (
            <button
              key={`${s.key}-${s.start}`}
              type="button"
              onClick={() => onJump(s.firstSlotId)}
              title={t("rail.segment", { label: text, count: s.count })}
              aria-label={t("rail.segmentGo", { label: text, count: s.count })}
              className={`relative h-full min-w-0 basis-0 hover:bg-white/15 focus-visible:z-10 ${
                i > 0 ? "before:absolute before:top-2 before:bottom-2 before:left-0 before:w-px before:bg-(--color-rail-line)" : ""
              }`}
              style={{ flexGrow: s.count }}
            >
              <span aria-hidden className={`block overflow-hidden px-0.5 text-center whitespace-nowrap [text-shadow:0_1px_0_rgb(255_255_255/0.45)] ${fits(text, s.count) ? "" : "invisible"}`}>
                {text}
              </span>
            </button>
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
});

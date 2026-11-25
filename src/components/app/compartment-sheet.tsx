"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import { displayArtist, type Slot } from "@/lib/layout";
import { recordColor } from "@/lib/design";
import { slotTitle } from "@/lib/shelf/describe";
import { discsOf, drawingSize, toSortSettings, type MediaView, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { compartmentAspect } from "@/lib/shelf/templates";
import { plateLabels } from "@/lib/visual/plates";
import { genreName } from "@/i18n/core";
import { useI18n } from "@/i18n/client";
import { Banner } from "../ui";
import { CompartmentDrawing } from "./compartment-drawing";
import { DiscogsAttribution } from "./discogs-attribution";
import { CountBadge } from "./furniture";
import { Sheet } from "./sheet";

type Props = {
  slot: Slot;
  view: MediaView;
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  /** The record the user last looked at: drawn in mustard. */
  highlightId: string | null;
  onClose: () => void;
  onPickRecord: (id: string) => void;
};

/**
 * One compartment up close: a walnut frame with its full range on a brass
 * plate, the same drawing as on the map (pointing at a record shows it,
 * clicking opens its card) with its count in the corner, and the records as a list.
 */
export function CompartmentSheet({ slot, view, config, byId, highlightId, onClose, onPickRecord }: Props) {
  const { t, n, locale } = useI18n();
  const [hover, setHover] = useState<{ id: string; x: number; y: number; w: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const settings = toSortSettings(config.settings);
  const records = useMemo(() => view.index.bySlot.get(slot.id) ?? [], [view.index, slot.id]);
  const plate = useMemo(
    () => plateLabels(view.index, settings, { noYear: t("map.noYear"), genreName: (g) => genreName(locale, g) }).get(slot.id),
    [view.index, settings, slot.id, t, locale],
  );
  const furniture = config.furniture.find((f) => f.key === slot.shelfKey);
  const aspect = furniture ? compartmentAspect(furniture.template, furniture.media) : 1;
  const load = config.settings.thicknessByFormat ? records.reduce((n, r) => n + (r.weight && r.weight > 0 ? r.weight : 1), 0) : records.length;
  const over = load > slot.capacity;
  const drawing = useMemo(
    () =>
      records.map((r) => {
        const stored = byId.get(r.id);
        return {
          id: r.id,
          size: drawingSize(stored, view.media),
          out: !!stored?.temp_location_id,
          places: config.settings.thicknessByFormat && stored ? discsOf(stored) : 1,
        };
      }),
    [records, byId, view.media, config.settings.thicknessByFormat],
  );
  const shown = hover ? byId.get(hover.id) : undefined;
  const shownIndex = hover ? records.findIndex((r) => r.id === hover.id) : -1;
  // Where the pointer is inside the frame; unknown until it moves (the sheet can open under a resting pointer).
  const lastPointer = useRef<{ x: number; y: number; w: number } | null>(null);

  const onMove = (e: MouseEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    lastPointer.current = { x: e.clientX - box.left, y: e.clientY - box.top, w: box.width };
    setHover((h) => (h ? { ...h, ...lastPointer.current } : h));
  };

  const title = slotTitle(slot, furniture, t);
  return (
    <Sheet bare wide title={title} labelledBy="compartment-title" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-4">
        <header className="surface-walnut flex flex-col gap-3 px-4 pt-3 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-pill bg-on-walnut/40 sm:hidden" />
              <h2 id="compartment-title" className="font-display text-xl leading-tight">
                {title}
              </h2>
              <p className="text-sm">
                <span className={over ? "rounded-[3px] bg-mustard px-1.5 font-semibold text-ink" : "opacity-85"}>
                  {config.settings.thicknessByFormat
                    ? `${t("common.records", { count: records.length })}, ${t("compartment.places", { count: load, capacity: slot.capacity })}`
                    : t("compartment.count", { count: records.length, capacity: slot.capacity })}
                </span>
              </p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-pill border border-on-walnut/60 px-3 py-1 text-sm font-semibold text-on-walnut hover:bg-on-walnut/10">
              {t("common.close")}
            </button>
          </div>
          {plate && (
            <p className="surface-plate mx-auto max-w-full px-4 py-1 text-center font-display text-sm">{plate.full}</p>
          )}
          <div
            ref={frame}
            className="surface-interior relative mx-auto w-full max-w-[560px]"
            style={{ aspectRatio: aspect }}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <CompartmentDrawing
              records={drawing}
              capacity={slot.capacity}
              width={100 * aspect}
              height={100}
              foundId={highlightId && records.some((r) => r.id === highlightId) ? highlightId : null}
              onHover={(id) => setHover(id && lastPointer.current ? { id, ...lastPointer.current } : null)}
              onPick={onPickRecord}
            />
            {/* The same count as on the map, in the same corner. */}
            <CountBadge count={records.length} capacity={slot.capacity} long={t("map.badge", { count: records.length, capacity: slot.capacity })} short={n(records.length)} />
            {shown && hover && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 w-max max-w-64 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-card bg-ink px-3 py-2 text-sm text-paper shadow-tooltip"
                style={{ left: Math.min(Math.max(hover.x, 70), hover.w - 70), top: hover.y }}
              >
                <p className="font-semibold">{displayArtist(shown.artist)}</p>
                <p className="text-paper/85">{shown.title}</p>
                <p className="mt-0.5 text-xs text-paper/70">
                  {t("compartment.position", { index: shownIndex + 1, total: records.length })}
                  {shown.origin === "added" ? `, ${t("compartment.added")}` : ""}
                </p>
              </div>
            )}
          </div>
          {records.length > 0 && <p className="hidden text-center text-xs text-on-walnut/80 sm:block">{t("compartment.drawingHint")}</p>}
        </header>

        <div className="flex flex-col gap-3 px-4">
          {over && <Banner tone="warning">{t("compartment.over")}</Banner>}

          {records.length === 0 ? (
            <p className="text-sm text-muted">{t("compartment.empty")}</p>
          ) : (
            <section aria-labelledby="compartment-list">
              <h3 id="compartment-list" className="mb-1 text-[13px] font-semibold text-muted">
                {t("compartment.list")}
              </h3>
              <ol className="grid gap-x-4 sm:grid-cols-2">
                {records.map((r, i) => {
                  const stored = byId.get(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onPickRecord(r.id)}
                        className={`flex w-full items-center gap-2 border-b border-rule py-1.5 text-left text-sm text-ink hover:bg-mustard-soft ${r.id === highlightId ? "bg-mustard-soft" : ""}`}
                      >
                        <span aria-hidden className="h-5 w-1.5 shrink-0 rounded-[1px]" style={{ background: recordColor(r.id) }} />
                        <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                        <span className="min-w-0 truncate">
                          <span className="font-semibold">{displayArtist(r.artist)}</span>
                          <span className="text-muted">, {r.title}</span>
                        </span>
                        {stored?.origin === "added" && <span className="ml-auto shrink-0 text-2xs text-muted">{t("compartment.added")}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <DiscogsAttribution />
        </div>
      </div>
    </Sheet>
  );
}

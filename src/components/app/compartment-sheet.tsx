"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import { displayArtist, type Slot } from "@/lib/layout";
import { recordColor } from "@/lib/design";
import { slotTitle } from "@/lib/shelf/describe";
import { sizeOf, toSortSettings, type MediaView, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { isBoxTemplate } from "@/lib/shelf/templates";
import { plateLabels } from "@/lib/visual/plates";
import { searchRecords } from "@/lib/search";
import { genreName } from "@/i18n/core";
import { useI18n } from "@/i18n/client";
import { Banner, btnSecondarySm, input } from "../ui";
import { CompartmentDrawing } from "./compartment-drawing";
import { DiscogsAttribution } from "./discogs-attribution";
import { Sheet } from "./sheet";
import type { ShelfApp } from "./use-shelf-app";

type Props = {
  slot: Slot;
  view: MediaView;
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  app: ShelfApp;
  /** The record the user last looked at: drawn in mustard. */
  highlightId: string | null;
  onClose: () => void;
  onPickRecord: (id: string) => void;
};

/**
 * One compartment up close: a walnut frame with its full range on a brass
 * plate, the same drawing as on the map (pointing at a record shows it,
 * clicking opens its card), the records as a list, and calibration.
 */
export function CompartmentSheet({ slot, view, config, byId, app, highlightId, onClose, onPickRecord }: Props) {
  const { t, locale } = useI18n();
  const [calibrating, setCalibrating] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number; w: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const settings = toSortSettings(config.settings);
  const records = useMemo(() => view.index.bySlot.get(slot.id) ?? [], [view.index, slot.id]);
  const plate = useMemo(
    () => plateLabels(view.index, settings, { noYear: t("map.noYear"), genreName: (g) => genreName(locale, g) }).get(slot.id),
    [view.index, settings, slot.id, t, locale],
  );
  const furniture = config.furniture.find((f) => f.key === slot.shelfKey);
  const aspect = furniture && isBoxTemplate(furniture.template) ? 1.25 : 1;
  const over = records.length > slot.capacity;
  const drawing = useMemo(
    () => records.map((r) => ({ id: r.id, size: (byId.get(r.id) ? sizeOf(byId.get(r.id)!) : null) ?? (view.media === "single" ? 7 : 12) })),
    [records, byId, view.media],
  );
  const shown = hover ? byId.get(hover.id) : undefined;
  const shownIndex = hover ? records.findIndex((r) => r.id === hover.id) : -1;
  const lastPointer = useRef({ x: 0, y: 0, w: 300 });

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
                <span className={over ? "rounded-[3px] bg-mustard px-1.5 font-semibold text-ink" : "opacity-85"}>{t("compartment.count", { count: records.length, capacity: slot.capacity })}</span>
              </p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-pill border border-on-walnut/60 px-3 py-1 text-sm font-semibold text-on-walnut hover:bg-on-walnut/10">
              {t("common.close")}
            </button>
          </div>
          {plate && (
            <p className="surface-brass mx-auto max-w-full rounded-plate px-3 py-1 text-center font-display text-sm shadow-plate">{plate.full}</p>
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
              onHover={(id) => setHover(id ? { id, ...lastPointer.current } : null)}
              onPick={onPickRecord}
            />
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

          {calibrating ? (
            <Calibrate slot={slot} view={view} byId={byId} app={app} onDone={() => setCalibrating(false)} />
          ) : (
            <button type="button" onClick={() => setCalibrating(true)} className={`${btnSecondarySm} self-start`}>
              {t("compartment.calibrate")}
            </button>
          )}

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

/** Calibration: "This is the first record in this compartment", choosing the record through search. */
function Calibrate({ slot, view, byId, app, onDone }: { slot: Slot; view: MediaView; byId: Map<string, StoredRecord>; app: ShelfApp; onDone: () => void }) {
  const { t } = useI18n();
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
    try {
      const result = await app.calibrate(id, slot.id);
      if (!result.ok) setError(t(`compartment.refusal.${result.code}`));
      else onDone();
    } catch (err) {
      setError(err instanceof Error ? `${t("compartment.calibrateFailed")} ${err.message}` : t("compartment.calibrateFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-input-line p-3">
      <label htmlFor="calibrate-search" className="text-sm font-semibold text-ink">
        {t("compartment.calibrateLabel")}
      </label>
      <input id="calibrate-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("compartment.calibratePlaceholder")} className={input} />
      {results.length > 0 && (
        <ul className="flex flex-col">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" disabled={app.busy} onClick={() => choose(r.id)} className="w-full rounded-[3px] px-2 py-2 text-left text-sm hover:bg-mustard-soft disabled:opacity-50">
                <span className="font-semibold text-ink">{displayArtist(r.artist)}</span> <span className="text-muted">{r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && <p className="text-sm text-muted">{t("compartment.calibrateNoMatch")}</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">{t("compartment.calibrateHint")}</p>
      <button type="button" onClick={onDone} className="self-start text-sm font-semibold text-ink underline underline-offset-2">
        {t("common.cancel")}
      </button>
    </div>
  );
}

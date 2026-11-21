"use client";

import { useEffect, useMemo, useState } from "react";
import { releaseUrl, type RecordInput } from "@/lib/discogs/map";
import { buildIndex, displayArtist, locate } from "@/lib/layout";
import { formatLine, slotTitle } from "@/lib/shelf/describe";
import { drawingSize, toLayoutRecord, toSortSettings, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { compartmentAspect } from "@/lib/shelf/templates";
import { useI18n } from "@/i18n/client";
import { Banner, btnPrimary, btnSecondary, input } from "../ui";
import { CompartmentDrawing } from "./compartment-drawing";
import { Cover } from "./cover";
import { DiscogsAttribution } from "./discogs-attribution";
import { Sheet } from "./sheet";
import type { ShelfApp } from "./use-shelf-app";

type Props = {
  app: ShelfApp;
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  onClose: () => void;
  onShowRecord: (id: string, slotId: string | null) => void;
};

function Step({ n, title, children, muted = false }: { n: number; title: string; children?: React.ReactNode; muted?: boolean }) {
  return (
    <section className={`flex flex-col gap-2 ${muted ? "opacity-60" : ""}`}>
      <h3 className="flex items-baseline gap-2 font-display text-lg text-ink">
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-pill bg-ink font-sans text-xs font-semibold text-paper">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * "Add a new record": find it on Discogs, see where it goes (the compartment,
 * the records on each side, and what has to move), then add it.
 */
export function AddRecord({ app, config, byId, onClose, onShowRecord }: Props) {
  const { t } = useI18n();
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
        if (!res.ok) throw new Error(json.error ?? t("add.searchFailed"));
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
  }, [query, chosen, t]);

  async function choose(result: RecordInput) {
    setLoadingRelease(true);
    setError(null);
    try {
      const res = await fetch(`/api/discogs/release?id=${result.discogs_release_id}`);
      const json = (await res.json()) as { record?: RecordInput; error?: string };
      if (!res.ok || !json.record) throw new Error(json.error ?? t("add.releaseFailed"));
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

  const placed = useMemo(() => {
    if (!preview || !preview.media || !preview.target) return null;
    const media = preview.media;
    const view = app.views.find((v) => v.media === media);
    if (!view) return null;
    const group = (app.data?.records ?? []).filter((r) => preview.placement.has(r.id) && view.index.positionOf.has(r.id));
    const index = buildIndex([...group, preview.record].map(toLayoutRecord), preview.placement, view.index.slots, toSortSettings(config.settings));
    const location = locate(index, preview.record.id);
    if (!location) return null;
    const inSlot = index.bySlot.get(location.slot.id) ?? [];
    const sizeById = new Map([...group, preview.record].map((r) => [r.id, drawingSize(r, media)] as const));
    const drawing = inSlot.map((r) => ({ id: r.id, size: sizeById.get(r.id)! }));
    return { location, drawing };
  }, [preview, app.views, app.data?.records, config.settings]);

  const byIdWithNew = useMemo(() => {
    if (!preview) return byId;
    const m = new Map(byId);
    m.set(preview.record.id, preview.record);
    return m;
  }, [byId, preview]);

  const slotName = (id: string | null) => {
    if (id === null) return t("app.offTheShelf");
    for (const v of app.views) {
      const s = v.index.slotById.get(id);
      if (s) return slotTitle(s, config.furniture.find((f) => f.key === s.shelfKey), t);
    }
    return t("app.anotherCompartment");
  };
  const titleOf = (id: string | undefined) => (id ? (byIdWithNew.get(id)?.title ?? "") : "");

  const goesIn = (() => {
    if (!placed) return null;
    const { location } = placed;
    const place = slotName(location.slot.id);
    const left = titleOf(location.before.at(-1)?.record.id);
    const right = titleOf(location.after[0]?.record.id);
    if (left && right) return t("add.goesBetween", { place, left, right });
    if (left) return t("add.goesAfter", { place, left });
    if (right) return t("add.goesBefore", { place, right });
    return t("add.goesIn", { place });
  })();

  const furnitureOfTarget = placed ? config.furniture.find((f) => f.key === placed.location.slot.shelfKey) : undefined;
  const aspect = furnitureOfTarget ? compartmentAspect(furnitureOfTarget.template, furnitureOfTarget.media) : 1;
  const groupLabel = chosen ? t(`mediaShort.${chosen.format_group === "other" ? "lp" : chosen.format_group}`) : "";

  return (
    <Sheet title={t("add.title")} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Step n={1} title={t("add.step1")}>
          {!chosen ? (
            <>
              <label htmlFor="discogs-search" className="text-sm text-muted">
                {t("add.searchLabel")}
              </label>
              <input
                id="discogs-search"
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("add.searchPlaceholder")}
                className={input}
              />
              {searching && (
                <p className="text-sm text-muted" role="status">
                  {t("add.searching")}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm font-semibold text-danger">
                  {error}
                </p>
              )}
              {query.trim().length >= 2 && !searching && !error && results.length === 0 && <p className="text-sm text-muted">{t("add.noResults")}</p>}
              <ul className="flex flex-col">
                {(query.trim().length >= 2 ? results : []).map((r) => (
                  <li key={r.discogs_release_id}>
                    <button
                      type="button"
                      disabled={loadingRelease}
                      onClick={() => choose(r)}
                      className="flex w-full items-center gap-3 rounded-[3px] px-2 py-2 text-left hover:bg-mustard-soft disabled:opacity-50"
                    >
                      <Cover src={r.thumb_url ?? r.cover_url} artist={r.artist} title={r.title} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{displayArtist(r.artist)}</span>
                        <span className="block truncate text-sm text-ink">{r.title}</span>
                        <span className="block truncate text-xs text-muted">{[r.year, r.format_name, r.label].filter(Boolean).join(", ")}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {query.trim().length >= 2 && results.length > 0 && <DiscogsAttribution />}
            </>
          ) : (
            <div className="flex gap-3">
              <Cover src={chosen.cover_url ?? chosen.thumb_url} artist={chosen.artist} title={chosen.title} />
              <div className="min-w-0 text-sm">
                <p className="font-display text-lg leading-tight text-ink">{chosen.title}</p>
                <p className="text-muted">
                  {[displayArtist(chosen.artist), chosen.year].filter(Boolean).join(", ")}
                  <br />
                  {[formatLine(chosen), chosen.label].filter(Boolean).join(", ")}
                </p>
                <DiscogsAttribution href={releaseUrl(chosen.discogs_release_id)} />
                <button
                  type="button"
                  onClick={() => {
                    setChosen(null);
                    setError(null);
                  }}
                  className="ml-3 text-xs font-semibold text-ink underline underline-offset-2"
                >
                  {t("add.change")}
                </button>
              </div>
            </div>
          )}
        </Step>

        <Step n={2} title={goesIn ?? t("add.step2")} muted={!chosen}>
          {chosen &&
            (!preview?.media ? (
              <Banner tone="warning">
                {chosen.format_group === "other" ? t("add.notPlaced", { format: chosen.format_name ?? "?" }) : t("add.noShelf", { group: groupLabel })}
              </Banner>
            ) : !preview.target ? (
              <Banner tone="warning">{t("add.full")}</Banner>
            ) : (
              <>
                {placed && (
                  <div className="surface-interior relative w-full max-w-72 border-8 border-walnut" style={{ aspectRatio: aspect }}>
                    <CompartmentDrawing records={placed.drawing} capacity={placed.location.slot.capacity} width={100 * aspect} height={100} foundId={preview.record.id} lifted />
                  </div>
                )}
                {preview.movedCount <= 1 ? (
                  <p className="text-sm text-ink">{t("add.fits")}</p>
                ) : (
                  <div className="text-sm text-ink">
                    <p className="font-semibold">{t("add.moves", { count: preview.movedCount })}</p>
                    <ol className="mt-1 list-decimal pl-5">
                      {preview.moves.map((m) => {
                        const r = byIdWithNew.get(m.recordId);
                        return (
                          <li key={m.recordId}>
                            {t("app.moveLine", {
                              record: r ? `${displayArtist(r.artist)}, ${r.title}` : t("app.recordFallback"),
                              from: m.from === null ? t("add.putItIn") : slotName(m.from),
                              to: slotName(m.to),
                            })}
                          </li>
                        );
                      })}
                    </ol>
                    {preview.overflow.length > 0 && <p className="mt-1">{t("add.overflow")}</p>}
                  </div>
                )}
              </>
            ))}
          {error && chosen && <p className="text-xs text-muted">{t("add.fallback", { error })}</p>}
        </Step>

        <Step n={3} title={t("add.step3")} muted={!chosen}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={app.busy || !chosen || !preview?.media}
              onClick={async () => {
                if (!chosen) return;
                const result = await app.addRecord(chosen);
                if (result) onShowRecord(result.stored.id, result.preview?.target ?? null);
              }}
              className={btnPrimary}
            >
              {app.busy ? t("add.adding") : t("add.add")}
            </button>
            <button type="button" onClick={onClose} className={btnSecondary}>
              {t("common.cancel")}
            </button>
          </div>
          <p className="text-xs text-muted">{t("add.discogsUnchanged")}</p>
        </Step>
      </div>
    </Sheet>
  );
}

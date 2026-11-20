"use client";

import { useEffect, useState } from "react";
import { displayArtist, locate, type Location } from "@/lib/layout";
import { percent } from "@/lib/design";
import { formatLine, slotTitle } from "@/lib/shelf/describe";
import { releaseUrl } from "@/lib/discogs/map";
import type { TracklistSection } from "@/lib/discogs/tracklist";
import { discsOf, groupOf, sizeOf, type MediaView, type ShelfConfig, type StoredRecord, type TempLocation } from "@/lib/shelf/model";
import { OutBanner, TakeOutChooser } from "./temporary";
import { genreName } from "@/i18n/core";
import { useI18n } from "@/i18n/client";
import { btnSecondarySm, card } from "../ui";
import { CompartmentDrawing } from "./compartment-drawing";
import { Cover } from "./cover";
import { DiscogsAttribution } from "./discogs-attribution";

export function findLocation(views: MediaView[], recordId: string): Location | null {
  for (const v of views) {
    const loc = locate(v.index, recordId);
    if (loc) return loc;
  }
  return null;
}

type CardProps = {
  record: StoredRecord;
  location: Location | null;
  views: MediaView[];
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  onShowOnMap?: () => void;
  onPickRecord?: (id: string) => void;
  /** In a sheet: a close button in the walnut band, which is also the sheet's handle area. */
  onClose?: () => void;
  headingId?: string;
  /** Temporary locations: where the record is if it's out, and the places to take it to. */
  locations?: TempLocation[];
  busy?: boolean;
  onTakeOut?: (name: string) => void;
  onPutBack?: () => void;
};

/**
 * The record card: where it is (the walnut band), the record, its compartment
 * with it highlighted, the two records on each side, its tracklist, and the
 * Discogs link.
 */
export function RecordCard({
  record,
  location,
  views,
  config,
  byId,
  onShowOnMap,
  onPickRecord,
  onClose,
  headingId = "record-card-title",
  locations = [],
  busy = false,
  onTakeOut,
  onPutBack,
}: CardProps) {
  const { t, locale } = useI18n();
  const [choosing, setChoosing] = useState(false);
  const outside = record.temp_location_id ? (locations.find((l) => l.id === record.temp_location_id) ?? null) : null;
  const furniture = location ? config.furniture.find((f) => f.key === location.slot.shelfKey) : undefined;
  const group = groupOf(record);
  const hasShelf = config.furniture.some((f) => f.media === group);

  const offMapReason =
    group === "other"
      ? t("record.otherFormat", { format: record.format_name ?? "?" })
      : !hasShelf
        ? t(group === "single" ? "search.noSinglesShelf" : group === "cd" ? "search.noCdShelf" : "search.noLpShelf")
        : t("record.doesntFit");

  const genres = [record.genre ? genreName(locale, record.genre) : null, ...(record.styles ?? [])].filter(Boolean).join(", ");
  const view = location ? views.find((v) => v.index.slotById.has(location.slot.id)) : undefined;
  const drawing = location && view ? (view.index.bySlot.get(location.slot.id) ?? []).map((r) => {
          const stored = byId.get(r.id);
          return { id: r.id, size: (stored ? sizeOf(stored) : null) ?? 12, out: !!stored?.temp_location_id, places: config.settings.thicknessByFormat && stored ? discsOf(stored) : 1 };
        }) : [];

  return (
    <article className={`${card} grid gap-3.5 overflow-hidden pb-[18px]`} aria-labelledby={headingId} data-record-card>
      <header className="surface-walnut flex items-start justify-between gap-3 px-[18px] py-3">
        <div className="min-w-0">
          {onClose && <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-pill bg-on-walnut/40 sm:hidden" />}
          <h2 id={headingId} className="font-display text-xl leading-tight">
            {location ? slotTitle(location.slot, furniture, t) : t("record.offMap")}
          </h2>
          <p className="text-sm opacity-85">
            {location
              ? t("record.position", { index: location.indexInSlot + 1, total: location.totalInSlot, pct: percent(location.fraction) })
              : offMapReason}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="shrink-0 rounded-pill border border-on-walnut/60 px-3 py-1 text-sm font-semibold text-on-walnut hover:bg-on-walnut/10">
            {t("common.close")}
          </button>
        )}
      </header>

      {outside && onPutBack && <OutBanner location={outside} busy={busy} onPutBack={onPutBack} />}

      <div className="mx-[18px] grid grid-cols-[104px_1fr] items-center gap-3.5">
        <Cover src={record.cover_url ?? record.thumb_url} artist={record.artist} title={record.title} size="detail" />
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-[1.1] text-ink">{record.title}</h3>
          <p className="mt-1 text-sm text-muted">
            {displayArtist(record.artist)}, {record.year ?? t("record.yearUnknown")}
            {record.label && (
              <>
                <br />
                {record.label}
              </>
            )}
            <br />
            {formatLine(record) || t("record.formatUnknown")}
            {genres && (
              <>
                <br />
                {genres}
              </>
            )}
          </p>
        </div>
      </div>

      {location && view && (
        <>
          <div
            className="surface-interior relative mx-[18px] rounded-[3px] border-8 border-walnut"
            style={{ aspectRatio: 1.6 }}
            role="img"
            aria-label={t("record.drawingLabel", { index: location.indexInSlot + 1, total: location.totalInSlot })}
          >
            <CompartmentDrawing records={drawing} capacity={location.slot.capacity} width={160} height={100} foundId={record.id} lifted />
          </div>
          <Neighbors location={location} record={record} config={config} byId={byId} onPick={onPickRecord} />
        </>
      )}

      {record.discogs_release_id ? <Tracklist releaseId={record.discogs_release_id} /> : null}

      {choosing && onTakeOut && (
        <div className="mx-[18px]">
          <TakeOutChooser
            locations={locations}
            busy={busy}
            onChoose={(name) => {
              onTakeOut(name);
              setChoosing(false);
            }}
            onCancel={() => setChoosing(false)}
          />
        </div>
      )}

      <div className="mx-[18px] flex flex-wrap items-center justify-between gap-2.5 text-[13px]">
        <DiscogsAttribution href={releaseUrl(record.discogs_release_id)} className="text-[13px] text-ink" />
        <span className="flex flex-wrap gap-2">
          {location && !outside && onTakeOut && !choosing && (
            <button type="button" onClick={() => setChoosing(true)} className={btnSecondarySm}>
              {t("temp.takeOut")}
            </button>
          )}
          {location && onShowOnMap && (
            <button type="button" onClick={onShowOnMap} className={btnSecondarySm}>
              {t("record.showOnMap")}
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

/** Five columns in physical order: two to the left, this one, two to the right. */
function Neighbors({
  location,
  record,
  config,
  byId,
  onPick,
}: {
  location: Location;
  record: StoredRecord;
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  onPick?: (id: string) => void;
}) {
  const { t } = useI18n();
  const left = [...location.before];
  while (left.length < 2) left.unshift(null as never);
  const right = [...location.after];
  while (right.length < 2) right.push(null as never);
  const columns: Array<{ id: string; slotId: string; caption: string; me?: boolean } | null> = [
    left[0] ? { id: left[0].record.id, slotId: left[0].slot.id, caption: t("record.twoLeft") } : null,
    left[1] ? { id: left[1].record.id, slotId: left[1].slot.id, caption: t("record.justLeft") } : null,
    { id: record.id, slotId: location.slot.id, caption: t("record.thisOne"), me: true },
    right[0] ? { id: right[0].record.id, slotId: right[0].slot.id, caption: t("record.justRight") } : null,
    right[1] ? { id: right[1].record.id, slotId: right[1].slot.id, caption: t("record.twoRight") } : null,
  ];

  return (
    <div className="mx-[18px]">
      <h3 className="sr-only">{t("record.neighbors")}</h3>
      <ol className="grid grid-cols-5 items-start gap-2">
        {columns.map((c, i) => {
          if (!c) return <li key={i} aria-hidden />;
          const r = c.id === record.id ? record : byId.get(c.id);
          if (!r) return <li key={i} aria-hidden />;
          const other = c.slotId !== location.slot.id;
          const slot = other ? [...location.before, ...location.after].find((nb) => nb.record.id === c.id)?.slot : undefined;
          const elsewhere = slot ? slotTitle(slot, config.furniture.find((f) => f.key === slot.shelfKey), t) : null;
          const body = (
            <>
              <Cover src={r.thumb_url ?? r.cover_url} artist={r.artist} title={r.title} size="fill" className={c.me ? "outline-3 outline-mustard" : ""} />
              <span className="mt-1 block text-[11px] leading-tight">
                <span className="line-clamp-2 block">{r.title}</span>
                <span className="block">{c.caption}</span>
                {elsewhere && <span className="block">{t("record.inPlace", { place: elsewhere })}</span>}
              </span>
            </>
          );
          return (
            <li key={i} className={c.me ? "font-semibold text-ink" : "text-muted"} aria-current={c.me ? "true" : undefined}>
              {onPick && !c.me ? (
                <button type="button" onClick={() => onPick(c.id)} className="block w-full text-left">
                  {body}
                </button>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type TracklistResult = { key: string; sections?: TracklistSection[]; failed?: boolean };

/** The tracklist from Discogs, loaded on demand: grouped by side, with headings and index tracks. */
export function Tracklist({ releaseId }: { releaseId: number }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const key = `${releaseId}:${attempt}`;
  const [result, setResult] = useState<TracklistResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/discogs/release/${releaseId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { tracklist?: TracklistSection[] };
        setResult({ key, sections: json.tracklist ?? [] });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setResult({ key, failed: true });
      });
    return () => controller.abort();
  }, [releaseId, key]);

  const state = result?.key !== key ? { status: "loading" as const } : result.failed ? { status: "error" as const } : { status: "ready" as const, sections: result.sections ?? [] };

  const sideName = (side: string | null) => {
    if (side === null) return null;
    if (side.startsWith("disc:")) return t("record.disc", { n: Number(side.slice(5)) });
    if (side.startsWith("medium:")) return side.slice(7);
    return t("record.side", { side });
  };

  return (
    <section className="mx-[18px]" aria-labelledby={`tracklist-${releaseId}`} aria-busy={state.status === "loading"}>
      <h3 id={`tracklist-${releaseId}`} className="mb-1.5 font-display text-[17px] text-ink">
        {t("record.tracklist")}
      </h3>
      {state.status === "loading" && (
        <ul aria-label={t("common.loading")} className="grid gap-1.5">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-5 animate-pulse rounded-[3px] bg-rule" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </ul>
      )}
      {state.status === "error" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink" role="alert">
          <span>{t("record.tracklistFailed")}</span>
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className={btnSecondarySm}>
            {t("common.tryAgain")}
          </button>
        </div>
      )}
      {state.status === "ready" && state.sections.length === 0 && <p className="text-sm text-muted">{t("record.noTracklist")}</p>}
      {state.status === "ready" &&
        state.sections.map((section, i) => (
          <div key={i}>
            {sideName(section.side) && <h4 className="mt-2.5 mb-1 border-b-2 border-brass pb-0.5 text-[13px] font-semibold text-muted">{sideName(section.side)}</h4>}
            <ol className="list-none p-0">
              {section.items.map((item, j) =>
                item.kind === "heading" ? (
                  <li key={j} className="mt-2 text-[13px] font-semibold text-ink">
                    {item.title}
                  </li>
                ) : (
                  <li key={j} className="border-b border-rule py-[3px] text-sm">
                    <TrackRow track={item} />
                    {item.parts && (
                      <ol className="list-none pl-[52px]">
                        {item.parts.map((part, k) => (
                          <li key={k} className="py-[2px] text-[13px]">
                            <TrackRow track={part} />
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ),
              )}
            </ol>
          </div>
        ))}
    </section>
  );
}

function TrackRow({ track }: { track: { position: string; title: string; duration: string | null } }) {
  return (
    <span className="grid grid-cols-[44px_1fr_auto] gap-2">
      <span className="text-muted tabular-nums">{track.position}</span>
      <span className="text-ink">{track.title}</span>
      <span className="text-muted tabular-nums">{track.duration ?? ""}</span>
    </span>
  );
}

/** The detail column's resting state on larger screens, before a record is chosen. */
export function RecordCardEmpty() {
  const { t } = useI18n();
  return (
    <article className={`${card} overflow-hidden`}>
      <header className="surface-walnut px-[18px] py-3">
        <h2 className="font-display text-xl">{t("record.emptyTitle")}</h2>
      </header>
      <p className="px-[18px] py-4 text-sm text-muted">{t("record.emptyText")}</p>
    </article>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabase } from "@/lib/supabase/browser";
import { START_TOUR_EVENT, TourOffer, TourOverlay, TourWaiting, useTourState, type TourStep } from "./tour";
import { useSearchParams } from "next/navigation";
import { SignUpButton } from "@clerk/nextjs";
import { displayArtist, type Slot } from "@/lib/layout";
import { groupOf, suggestedConfig, type StoredRecord } from "@/lib/shelf/model";
import { slotTitle } from "@/lib/shelf/describe";
import { CompartmentSheet } from "./compartment-sheet";
import { ImportProgress } from "./import-progress";
import { MapView } from "./map-view";
import { BrassRail } from "./brass-rail";
import { SimulatorCard } from "./simulator-card";
import { OutOfShelfPanel } from "./temporary";
import { ShareCard } from "./share-card";
import { toSortSettings } from "@/lib/shelf/model";
import { Onboarding } from "./onboarding";
import { RecordCard, RecordCardEmpty, findLocation } from "./record-details";
import { useMediaQuery } from "./use-media-query";
import { SearchRow } from "./search-panel";
import { SetupView } from "./setup-view";
import { Sheet } from "./sheet";
import { AddRecord } from "./add-record";
import { CollectionPanel } from "./collection-panel";
import { useShelfApp, type Notice } from "./use-shelf-app";
import { useI18n } from "@/i18n/client";
import { renderMsg } from "@/i18n/core";
import { Banner, btnPrimary, btnPrimarySm, btnSecondary, btnText, card } from "../ui";
import { collectionSummary } from "./summary";

export function ShelfApp() {
  const params = useSearchParams();
  const app = useShelfApp(params.get("start"));
  const { t } = useI18n();
  // Larger screens show the record card in a column next to the shelves; phones open it as a bottom sheet.
  const wide = useMediaQuery("(min-width: 900px)");
  const [tab, setTab] = useState<"map" | "setup">("map");
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [openRecord, setOpenRecordState] = useState<string | null>(null);
  // The record the user last looked at: its spine is marked when they open its compartment.
  const [lastRecord, setLastRecord] = useState<string | null>(null);
  const setOpenRecord = (id: string | null) => {
    setOpenRecordState(id);
    if (id) setLastRecord(id);
  };
  // The found record: its compartment gets the mustard outline and the record lifts (the "found moment").
  const [found, setFound] = useState<string | null>(null);
  const [lifted, setLifted] = useState(false);
  // A compartment highlighted briefly after jumping to it from the rail.
  const [flashSlot, setFlashSlot] = useState<string | null>(null);
  const jumpTo = useCallback((slotId: string) => {
    document.querySelector(`[data-slot="${CSS.escape(slotId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashSlot(slotId);
    setTimeout(() => setFlashSlot((s) => (s === slotId ? null : s)), 1600);
  }, []);
  const showFound = useCallback((id: string | null) => {
    setFound(id);
    setLifted(false);
    if (!id) return;
    // Two frames later, so the lift and the outline animate from the resting state.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setLifted(true);
        document.querySelector('[data-map] [data-found="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
      }),
    );
  }, []);

  const [adding, setAdding] = useState(false);

  const byId = useMemo(() => new Map((app.data?.records ?? []).map((r) => [r.id, r])), [app.data?.records]);

  // ------------------------------------------------------------ guided tour
  const { userId } = useAuth();
  const supabase = useSupabase();
  const hasMap = !!app.data?.config && app.views.some((v) => v.index.sorted.length > 0);
  const tour = useTourState({
    mode: app.mode,
    userId,
    supabase,
    // The first demo visit, or right after signing up (even before there are records).
    ready: app.status.kind === "ready" || (app.mode === "remote" && app.status.kind === "onboarding"),
    hasMap,
  });
  const { start: startTour, accept: acceptTour } = tour;
  const startTourOnMap = useCallback(() => {
    // Before the first map (onboarding, an import): start as soon as the shelf is ready.
    if (!hasMap) return acceptTour();
    setTab("map");
    setOpenSlot(null);
    setAdding(false);
    startTour();
  }, [hasMap, startTour, acceptTour]);
  // "Help" in the header, or /app?tour=1 from another page.
  useEffect(() => {
    const onStart = () => startTourOnMap();
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [startTourOnMap]);
  const wantsTour = params.get("tour") === "1";
  const tourReady = app.status.kind !== "loading";
  // Once per visit with ?tour=1, not again each time the map changes.
  const tourParamHandled = useRef(false);
  useEffect(() => {
    if (!wantsTour || !tourReady || tourParamHandled.current) return;
    const timer = setTimeout(() => {
      tourParamHandled.current = true;
      startTourOnMap();
    }, 500);
    return () => clearTimeout(timer);
  }, [wantsTour, tourReady, startTourOnMap]);
  const sample = app.views.find((v) => v.index.sorted.length > 0)?.index.sorted[0]?.id ?? null;
  const tourSteps: TourStep[] = [
    { id: "search", target: '[data-tour="search"]' },
    { id: "rail", target: '[data-map] nav[data-tour="rail"]' },
    { id: "compartment", target: "[data-map] [data-slot]" },
    {
      id: "record",
      target: wide ? '[data-tour="record"]' : "[data-sheet]",
      enter: () => {
        if (sample) {
          setOpenRecord(sample);
          showFound(sample);
        }
      },
      leave: () => setOpenRecord(null),
    },
    { id: "add", target: '[data-tour="add"]' },
    { id: "setup", target: '[data-tour="setup"]' },
    { id: "done" },
  ];
  const tourOffer = tour.offer ? <TourOffer onAccept={tour.accept} onDecline={tour.decline} /> : null;
  const tourWaiting = tour.waiting ? <TourWaiting /> : null;

  if (app.status.kind === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted" role="status" aria-live="polite">
        <span className="size-8 animate-spin rounded-full border-4 border-brass-light border-t-walnut" aria-hidden />
        <p>{renderMsg(t, app.status.message)}</p>
      </div>
    );
  }
  if (app.status.kind === "onboarding")
    return (
      <div className="flex flex-col gap-4">
        {tourOffer}
        {tourWaiting}
        <Onboarding app={app} />
      </div>
    );
  if (app.status.kind === "importing")
    return (
      <div className="flex flex-col gap-4">
        {tourWaiting}
        <ImportProgress job={app.status.job} message={renderMsg(t, app.status.message)} />
      </div>
    );
  if (app.status.kind === "error" || !app.data) {
    return (
      <div className={`${card} mx-auto flex max-w-md flex-col gap-3 p-5`} role="alert">
        <h1 className="font-display text-lg text-ink">{t("app.errorTitle")}</h1>
        <p className="text-sm text-muted">{app.status.kind === "error" ? renderMsg(t, app.status.message) : t("app.nothingYet")}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.location.reload()} className={btnPrimary}>
            {t("common.tryAgain")}
          </button>
          {app.mode === "local" && (
            <button type="button" onClick={app.resetLocal} className={btnSecondary}>
              {t("app.startOver")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const data = app.data;
  const config = data.config;
  const views = app.views;
  const leftover = views.reduce((n, v) => n + v.unplaced.length, 0);
  const cdsWithoutShelf = config && !config.furniture.some((f) => f.media === "cd") ? data.records.filter((r) => groupOf(r) === "cd").length : 0;
  // Singles (7″) only go on singles shelves: without one, they stay off the map, and every count says so.
  const singlesWithoutShelf = config && !config.furniture.some((f) => f.media === "single") ? data.records.filter((r) => groupOf(r) === "single").length : 0;
  const recordInSheet = openRecord ? byId.get(openRecord) : undefined;
  const slotName = (id: string | null) => {
    if (id === null) return t("app.offTheShelf");
    for (const v of views) {
      const slot = v.index.slotById.get(id);
      if (slot) return slotTitle(slot, config?.furniture.find((f) => f.key === slot.shelfKey), t);
    }
    return t("app.anotherCompartment");
  };
  const sheetLocation = openRecord ? findLocation(views, openRecord) : null;
  const sortSettings = toSortSettings(config?.settings ?? { sortLevels: ["artist"], ignoreArticles: false, slackPct: 10 });

  return (
    <div className="flex flex-col gap-4">
      {tourOffer}
      {tourWaiting}
      {tour.active && hasMap && <TourOverlay steps={tourSteps} onEnd={tour.end} />}
      {app.mode === "local" && (
        <Banner className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("app.demoBanner")}</span>
          <SignUpButton mode="modal" forceRedirectUrl="/app">
            <button type="button" className={btnPrimarySm}>
              {t("app.signUpToSave")}
            </button>
          </SignUpButton>
        </Banner>
      )}
      {app.syncJob && (
        <Banner className="flex items-center gap-2">
          <span className="size-3 animate-spin rounded-full border-2 border-brass-light border-t-walnut" aria-hidden />
          {app.syncJob.items_total ? t("app.updatingCount", { done: app.syncJob.items_done, total: app.syncJob.items_total }) : t("app.updating")}
        </Banner>
      )}
      {app.notice && <NoticeBar notice={app.notice} byId={byId} slotName={slotName} onDismiss={app.dismissNotice} />}

      {!config ? (
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="font-display text-2xl text-ink">{t("app.buildTitle")}</h1>
            <p className="text-sm text-muted">{data.records.length === 0 ? t("app.buildTextEmpty") : t("app.buildText", { count: data.records.length })}</p>
          </div>
          <SetupView app={app} initial={suggestedConfig(data.records, { lp: (n) => (n === null ? t("builder.suggestedLp") : t("builder.suggestedLpN", { n })), single: t("builder.suggestedSingles"), cd: t("builder.suggestedCds") })} records={data.records} onDone={() => setTab("map")} />
          <CollectionPanel app={app} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-pill border border-input-line bg-paper p-1 text-sm" role="group" aria-label={t("app.views")}>
            {(
              [
                ["map", t("app.tabMap")],
                ["setup", t("app.tabSetup")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-tour={id === "setup" ? "setup" : undefined}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-pill px-4 py-1.5 font-semibold ${tab === id ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          </div>

          {tab === "setup" ? (
            <>
              <SetupView app={app} initial={config} records={data.records} onDone={() => setTab("map")} />
              <h2 className="mt-4 border-t border-input-line/60 pt-6 font-display text-2xl text-ink">{t("app.toolsTitle")}</h2>
              <p className="-mt-2 text-sm text-muted">{t("app.toolsText")}</p>
              <SimulatorCard records={data.records} config={config} />
              <ShareCard signedIn={app.mode === "remote"} />
              <CollectionPanel app={app} />
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <SearchRow
                records={data.records}
                views={views}
                config={config}
                locations={data.locations ?? []}
                onPick={(id) => {
                  setOpenRecord(id);
                  showFound(id);
                }}
                onAdd={() => setAdding(true)}
              />

              <p className="text-sm text-muted">{collectionSummary(t, data.records.length, config.settings)}</p>
              {data.records.length === 0 && (
                // Started from scratch: nothing on the shelf yet.
                <Banner className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t("app.emptyShelf")}</span>
                  <button type="button" onClick={() => setAdding(true)} className={btnPrimarySm}>
                    {t("search.addNew")}
                  </button>
                </Banner>
              )}
              {singlesWithoutShelf > 0 && (
                <Banner className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t("app.singlesOff", { count: singlesWithoutShelf })}</span>
                  <button type="button" onClick={() => setTab("setup")} className={btnPrimarySm}>
                    {t("app.addSinglesShelf")}
                  </button>
                </Banner>
              )}
              {(leftover > 0 || cdsWithoutShelf > 0) && (
                <ul className="flex flex-col gap-1 text-sm">
                  {leftover > 0 && (
                    <li>
                      <Banner tone="warning">{t("app.leftover", { count: leftover })}</Banner>
                    </li>
                  )}
                  {cdsWithoutShelf > 0 && <li className="text-muted">{t("app.cdsWithoutShelf", { count: cdsWithoutShelf })}</li>}
                </ul>
              )}

              <OutOfShelfPanel
                records={data.records}
                locations={data.locations ?? []}
                busy={app.busy}
                onPutBack={(id) => void app.putBack(id).then((ok) => ok && showFound(id))}
                onShow={(id) => {
                  setOpenRecord(id);
                  showFound(id);
                }}
              />
              <div className={wide ? "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-[22px]" : ""}>
                <MapView
                  config={config}
                  views={views}
                  byId={byId}
                  foundId={found}
                  foundSlot={found ? (findLocation(views, found)?.slot.id ?? null) : null}
                  lifted={lifted}
                  onOpen={(slot) => setOpenSlot(slot)}
                  flashSlot={flashSlot}
                  railFor={(view) => (
                    <BrassRail
                      view={view}
                      settings={sortSettings}
                      foundId={found && view.index.positionOf.has(found) ? found : null}
                      onJump={jumpTo}
                    />
                  )}
                />
                {wide && (
                  <aside className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card" aria-live="polite" data-tour="record">
                    {recordInSheet ? (
                      <RecordCard
                        key={recordInSheet.id}
                        record={recordInSheet}
                        location={sheetLocation}
                        views={views}
                        config={config}
                        byId={byId}
                        onPickRecord={(id) => {
                          setOpenRecord(id);
                          showFound(id);
                        }}
                        onShowOnMap={() => showFound(recordInSheet.id)}
                        locations={data.locations ?? []}
                        busy={app.busy}
                        onTakeOut={(name) => void app.takeOut(recordInSheet.id, name)}
                        onPutBack={() => void app.putBack(recordInSheet.id).then((ok) => ok && showFound(recordInSheet.id))}
                      />
                    ) : (
                      <RecordCardEmpty />
                    )}
                  </aside>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {openSlot && config && (
        <CompartmentSheet
          slot={openSlot}
          view={views.find((v) => v.media === openSlot.media)!}
          config={config}
          byId={byId}
          highlightId={lastRecord}
          onClose={() => setOpenSlot(null)}
          onPickRecord={(id) => {
            setOpenSlot(null);
            setOpenRecord(id);
            // Same as a search: the outline, the rail marker, and the lift follow the record.
            showFound(id);
          }}
        />
      )}

      {recordInSheet && config && !wide && (
        <Sheet bare title={recordInSheet.title} labelledBy="record-sheet-title" onClose={() => setOpenRecord(null)}>
          <RecordCard
            key={recordInSheet.id}
            headingId="record-sheet-title"
            record={recordInSheet}
            location={sheetLocation}
            views={views}
            config={config}
            byId={byId}
            onClose={() => setOpenRecord(null)}
            onPickRecord={(id) => {
              setOpenRecord(id);
              showFound(id);
            }}
            onShowOnMap={() => {
              setOpenRecord(null);
              setTab("map");
              showFound(recordInSheet.id);
            }}
            locations={data.locations ?? []}
            busy={app.busy}
            onTakeOut={(name) => void app.takeOut(recordInSheet.id, name)}
            onPutBack={() =>
              void app.putBack(recordInSheet.id).then((ok) => {
                if (!ok) return;
                setOpenRecord(null);
                setTab("map");
                showFound(recordInSheet.id);
              })
            }
          />
        </Sheet>
      )}

      {adding && config && (
        <AddRecord
          app={app}
          config={config}
          byId={byId}
          onClose={() => setAdding(false)}
          onShowRecord={(id, slotId) => {
            setAdding(false);
            void slotId;
            showFound(id);
            setOpenRecord(id);
          }}
        />
      )}
    </div>
  );
}

function NoticeBar({
  notice,
  byId,
  slotName,
  onDismiss,
}: {
  notice: Notice;
  byId: Map<string, StoredRecord>;
  slotName: (id: string | null) => string;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Banner tone={notice.tone === "warning" ? "warning" : "info"}>
      <div className="flex items-start justify-between gap-2">
        <p>{renderMsg(t, notice.msg)}</p>
        <div className="flex shrink-0 gap-1">
          {notice.moves && notice.moves.length > 0 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className={btnText}>
              {open ? t("app.hideMoves") : t("app.seeMoves")}
            </button>
          )}
          <button type="button" onClick={onDismiss} aria-label={t("common.dismiss")} className={btnText}>
            ✕
          </button>
        </div>
      </div>
      {open && notice.moves && (
        <ol className="mt-2 list-decimal pl-5 text-ink">
          {notice.moves.slice(0, 50).map((m) => {
            const r = byId.get(m.recordId);
            return (
              <li key={m.recordId}>
                {t("app.moveLine", {
                  record: r ? `${displayArtist(r.artist)}, ${r.title}` : t("app.recordFallback"),
                  from: m.from === null ? t("app.moveNew") : slotName(m.from),
                  to: slotName(m.to),
                })}
              </li>
            );
          })}
        </ol>
      )}
    </Banner>
  );
}


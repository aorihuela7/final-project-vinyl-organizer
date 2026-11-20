"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignUpButton } from "@clerk/nextjs";
import { displayArtist, type Slot } from "@/lib/layout";
import { groupOf, suggestedConfig, type StoredRecord } from "@/lib/shelf/model";
import { slotTitle } from "@/lib/shelf/describe";
import { CompartmentSheet } from "./compartment-sheet";
import { ImportProgress } from "./import-progress";
import { MapView } from "./map-view";
import { Onboarding } from "./onboarding";
import { RecordDetails, findLocation } from "./record-details";
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
  const showFound = useCallback((id: string | null) => {
    setFound(id);
    setLifted(false);
    if (!id) return;
    // Two frames later, so the lift and the outline animate from the resting state.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setLifted(true);
        document.querySelector('[data-found="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
      }),
    );
  }, []);

  const [adding, setAdding] = useState(false);

  const byId = useMemo(() => new Map((app.data?.records ?? []).map((r) => [r.id, r])), [app.data?.records]);

  if (app.status.kind === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted" role="status" aria-live="polite">
        <span className="size-8 animate-spin rounded-full border-4 border-brass-light border-t-walnut" aria-hidden />
        <p>{renderMsg(t, app.status.message)}</p>
      </div>
    );
  }
  if (app.status.kind === "onboarding") return <Onboarding app={app} />;
  if (app.status.kind === "importing") return <ImportProgress job={app.status.job} message={renderMsg(t, app.status.message)} />;
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
  const others = data.records.filter((r) => groupOf(r) === "other").length;
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

  return (
    <div className="flex flex-col gap-4">
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
            <p className="text-sm text-muted">{t("app.buildText", { count: data.records.length })}</p>
          </div>
          <SetupView app={app} initial={suggestedConfig(data.records)} records={data.records} onDone={() => setTab("map")} />
          <CollectionPanel app={app} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 self-start rounded-pill border border-input-line bg-paper p-1 text-sm" role="group" aria-label={t("app.views")}>
            {(
              [
                ["map", t("app.tabMap")],
                ["setup", t("app.tabSetup")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-pill px-4 py-1.5 font-semibold ${tab === id ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "setup" ? (
            <>
              <SetupView app={app} initial={config} records={data.records} onDone={() => setTab("map")} />
              <CollectionPanel app={app} />
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <SearchRow
                records={data.records}
                views={views}
                config={config}
                onPick={(id) => {
                  setOpenRecord(id);
                  showFound(id);
                }}
                onAdd={() => setAdding(true)}
              />

              <p className="text-sm text-muted">{collectionSummary(t, data.records.length, config.settings)}</p>
              {singlesWithoutShelf > 0 && (
                <Banner className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t("app.singlesOff", { count: singlesWithoutShelf })}</span>
                  <button type="button" onClick={() => setTab("setup")} className={btnPrimarySm}>
                    {t("app.addSinglesShelf")}
                  </button>
                </Banner>
              )}
              {(leftover > 0 || others > 0 || cdsWithoutShelf > 0) && (
                <ul className="flex flex-col gap-1 text-sm">
                  {leftover > 0 && (
                    <li>
                      <Banner tone="warning">{t("app.leftover", { count: leftover })}</Banner>
                    </li>
                  )}
                  {cdsWithoutShelf > 0 && <li className="text-muted">{t("app.cdsWithoutShelf", { count: cdsWithoutShelf })}</li>}
                  {others > 0 && <li className="text-muted">{t("app.others", { count: others })}</li>}
                </ul>
              )}

              <MapView
                config={config}
                views={views}
                byId={byId}
                foundId={found}
                foundSlot={found ? (findLocation(views, found)?.slot.id ?? null) : null}
                lifted={lifted}
                onOpen={(slot) => {
                  setOpenSlot(slot);

                }}
              />
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
          app={app}
          highlightId={lastRecord}
          onClose={() => setOpenSlot(null)}
          onPickRecord={(id) => {
            setOpenSlot(null);
            setOpenRecord(id);
          }}
        />
      )}

      {recordInSheet && config && (
        <Sheet
          title={
            <>
              {displayArtist(recordInSheet.artist)} <span className="font-normal text-ink-muted">· {recordInSheet.title}</span>
            </>
          }
          onClose={() => setOpenRecord(null)}
        >
          <RecordDetails
            record={recordInSheet}
            location={sheetLocation}
            config={config}
            byId={byId}
            onShowOnMap={() => {
              setOpenRecord(null);
              setTab("map");
              showFound(recordInSheet.id);
            }}
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

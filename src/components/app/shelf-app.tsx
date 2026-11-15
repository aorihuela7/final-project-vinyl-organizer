"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignUpButton } from "@clerk/nextjs";
import { displayArtist, type Slot } from "@/lib/layout";
import { suggestedConfig, type StoredRecord } from "@/lib/shelf/model";
import { slotTitle } from "@/lib/shelf/describe";
import { CompartmentSheet } from "./compartment-sheet";
import { ImportProgress } from "./import-progress";
import { MapView } from "./map-view";
import { Onboarding } from "./onboarding";
import { RecordDetails, findLocation } from "./record-details";
import { SearchPanel } from "./search-panel";
import { SetupView } from "./setup-view";
import { Sheet } from "./sheet";
import { AddRecord } from "./add-record";
import { CollectionPanel } from "./collection-panel";
import { useShelfApp, type Notice } from "./use-shelf-app";

export function ShelfApp() {
  const params = useSearchParams();
  const app = useShelfApp(params.get("start"));
  const [tab, setTab] = useState<"map" | "setup">("map");
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [openRecord, setOpenRecord] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const byId = useMemo(() => new Map((app.data?.records ?? []).map((r) => [r.id, r])), [app.data?.records]);

  if (app.status.kind === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-muted" role="status" aria-live="polite">
        <span className="size-8 animate-spin rounded-full border-4 border-line border-t-accent" aria-hidden />
        <p>{app.status.message}</p>
      </div>
    );
  }
  if (app.status.kind === "onboarding") return <Onboarding app={app} />;
  if (app.status.kind === "importing") return <ImportProgress job={app.status.job} message={app.status.message} />;
  if (app.status.kind === "error" || !app.data) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card" role="alert">
        <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="text-sm text-ink-muted">{app.status.kind === "error" ? app.status.message : "Nothing to show yet."}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-control bg-ink px-4 py-2 text-sm font-semibold text-surface">
            Try again
          </button>
          {app.mode === "local" && (
            <button type="button" onClick={app.resetLocal} className="rounded-control border border-line-strong px-4 py-2 text-sm font-medium">
              Start over
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
  const others = data.records.filter((r) => r.media === "other").length;
  const cdsWithoutShelf = config && !config.furniture.some((f) => f.media === "cd") ? data.records.filter((r) => r.media === "cd").length : 0;
  const recordInSheet = openRecord ? byId.get(openRecord) : undefined;
  const slotName = (id: string | null) => {
    if (id === null) return "off the shelf";
    for (const v of views) {
      const slot = v.index.slotById.get(id);
      if (slot) return slotTitle(slot, config?.furniture.find((f) => f.key === slot.shelfKey));
    }
    return "another compartment";
  };
  const sheetLocation = openRecord ? findLocation(views, openRecord) : null;

  return (
    <div className="flex flex-col gap-4">
      {app.mode === "local" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-ink">
          <span>This demo lives only in this browser. Sign up to save it and to import your own collection.</span>
          <SignUpButton mode="modal" forceRedirectUrl="/app">
            <button type="button" className="rounded-control bg-accent px-3 py-1.5 font-semibold text-on-accent hover:bg-accent-hover">
              Sign up to save
            </button>
          </SignUpButton>
        </div>
      )}
      {app.syncJob && (
        <p className="flex items-center gap-2 rounded-card bg-sunken px-3 py-2 text-sm text-ink" role="status" aria-live="polite">
          <span className="size-3 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden />
          Updating from Discogs…
          {app.syncJob.items_total ? ` ${app.syncJob.items_done} of ${app.syncJob.items_total}` : ""}
        </p>
      )}
      {app.notice && <NoticeBar notice={app.notice} byId={byId} slotName={slotName} onDismiss={app.dismissNotice} />}

      {!config ? (
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Build your shelf</h1>
            <p className="text-sm text-ink-muted">
              {data.records.length.toLocaleString("en-US")} records imported. Pick your furniture and your sort order; the app computes where every record goes.
            </p>
          </div>
          <SetupView app={app} initial={suggestedConfig(data.records)} records={data.records} onDone={() => setTab("map")} />
          <CollectionPanel app={app} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 rounded-control border border-line bg-surface p-1 text-sm" role="group" aria-label="Views">
            {(
              [
                ["map", "Map"],
                ["setup", "Shelves & order"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded px-3 py-2 font-medium ${tab === id ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"}`}
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <SearchPanel
                    records={data.records}
                    views={views}
                    config={config}
                    onPick={(id) => {
                      setOpenRecord(id);
                      setHighlight(findLocation(views, id)?.slot.id ?? null);
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="rounded-control border border-line-strong bg-surface px-4 py-3 text-sm font-semibold text-ink shadow-card hover:bg-sunken"
                >
                  Where does this record go?
                </button>
              </div>

              <p className="text-sm text-ink-muted">
                {data.records.length.toLocaleString("en-US")} records · sorted by{" "}
                {config.settings.sortLevels.map((l) => l[0]!.toUpperCase() + l.slice(1)).join(" → ")}
                {config.settings.ignoreArticles ? ", ignoring articles" : ""} · {config.settings.slackPct}% slack
              </p>
              {(leftover > 0 || others > 0 || cdsWithoutShelf > 0) && (
                <ul className="flex flex-col gap-1 text-sm">
                  {leftover > 0 && (
                    <li className="rounded-card bg-warning-soft px-3 py-2 text-warning">
                      {leftover} record{leftover === 1 ? " isn't" : "s aren't"} on the shelf because {leftover === 1 ? "it doesn't" : "they don't"} fit. Add a shelf or raise the capacity in “Shelves &amp; order”.
                    </li>
                  )}
                  {cdsWithoutShelf > 0 && <li className="text-ink-muted">{cdsWithoutShelf} CDs have no CD shelf yet.</li>}
                  {others > 0 && <li className="text-ink-muted">{others} cassette{others === 1 ? "" : "s"} or other formats stay off the shelves.</li>}
                </ul>
              )}

              <MapView
                config={config}
                views={views}
                highlight={highlight}
                onOpen={(slot) => {
                  setOpenSlot(slot);
                  setHighlight(slot.id);
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
              setHighlight(sheetLocation?.slot.id ?? null);
              requestAnimationFrame(() => document.querySelector("[class*='ring-accent']")?.scrollIntoView({ block: "center", behavior: "smooth" }));
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
            setHighlight(slotId);
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
  const [open, setOpen] = useState(false);
  const tone =
    notice.tone === "success" ? "bg-success-soft text-success" : notice.tone === "warning" ? "bg-warning-soft text-warning" : "bg-sunken text-ink";
  return (
    <div className={`rounded-card px-3 py-2 text-sm ${tone}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p>{notice.text}</p>
        <div className="flex shrink-0 gap-2">
          {notice.moves && notice.moves.length > 0 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium underline">
              {open ? "Hide moves" : "See moves"}
            </button>
          )}
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="font-medium">
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
                {r ? `${displayArtist(r.artist)} – ${r.title}` : "Record"}: {m.from === null ? "new" : slotName(m.from)} → {slotName(m.to)}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

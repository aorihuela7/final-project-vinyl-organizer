"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Slot } from "@/lib/layout";
import { buildViews, toSortSettings } from "@/lib/shelf/model";
import { loadSharedShelf, type SharedShelf } from "@/lib/store/shared";
import { FRESHNESS_MS } from "@/lib/config";
import { useI18n } from "@/i18n/client";
import { Banner, card } from "../ui";
import { BrassRail } from "../app/brass-rail";
import { CompartmentSheet } from "../app/compartment-sheet";
import { MapView } from "../app/map-view";
import { RecordCard, RecordCardEmpty, findLocation } from "../app/record-details";
import { SearchPanel } from "../app/search-panel";
import { Sheet } from "../app/sheet";
import { useMediaQuery } from "../app/use-media-query";

type State = { status: "loading" } | { status: "missing" } | { status: "stale" } | { status: "error" } | { status: "ready"; shelf: SharedShelf };

/**
 * A shelf shared by its owner, read-only and without an account: the map,
 * search, the record card (where it is, its neighbors), and the compartments.
 * Nothing can be changed from here.
 */
export function GuestShelf({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });
  const [found, setFound] = useState<string | null>(null);
  const [lifted, setLifted] = useState(false);
  const [openRecord, setOpenRecord] = useState<string | null>(null);
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const wide = useMediaQuery("(min-width: 900px)");

  useEffect(() => {
    let alive = true;
    loadSharedShelf(token)
      .then((shelf) => {
        if (!alive) return;
        if (!shelf) return setState({ status: "missing" });
        // Discogs data is shown only if it's no more than six hours old (the database checks it too).
        if (shelf.stale) return setState({ status: "stale" });
        if (!shelf.config) return setState({ status: "missing" });
        const fresh = shelf.lastSyncedAt && Date.now() - new Date(shelf.lastSyncedAt).getTime() <= FRESHNESS_MS;
        setState(fresh ? { status: "ready", shelf } : { status: "stale" });
      })
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [token]);

  const shelf = state.status === "ready" ? state.shelf : null;
  const views = useMemo(() => (shelf?.config ? buildViews(shelf.records, shelf.config, shelf.placement) : []), [shelf]);
  const byId = useMemo(() => new Map((shelf?.records ?? []).map((r) => [r.id, r])), [shelf]);

  const showFound = useCallback((id: string) => {
    setFound(id);
    setLifted(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setLifted(true);
        document.querySelector('[data-map] [data-found="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
      }),
    );
  }, []);

  if (state.status !== "ready" || !shelf?.config) {
    const message =
      state.status === "loading" ? t("guest.loading") : state.status === "missing" ? t("guest.missing") : state.status === "stale" ? t("guest.stale") : t("guest.error");
    return (
      <div className={`${card} mx-auto flex max-w-md flex-col gap-2 p-5`} role={state.status === "loading" ? "status" : "alert"}>
        <h1 className="font-display text-xl text-ink">{t("guest.title")}</h1>
        <p className="text-sm text-muted">{message}</p>
      </div>
    );
  }

  const config = shelf.config;
  const record = openRecord ? byId.get(openRecord) : undefined;
  const location = openRecord ? findLocation(views, openRecord) : null;
  const card_ = record ? (
    <RecordCard
      key={record.id}
      record={record}
      location={location}
      views={views}
      config={config}
      byId={byId}
      locations={shelf.locations}
      onClose={wide ? undefined : () => setOpenRecord(null)}
      headingId={wide ? "record-card-title" : "record-sheet-title"}
      onPickRecord={(id) => {
        setOpenRecord(id);
        showFound(id);
      }}
      onShowOnMap={() => {
        if (!wide) setOpenRecord(null);
        showFound(record.id);
      }}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl text-ink">{t("guest.title")}</h1>
        <p className="text-sm text-muted">{t("guest.intro")}</p>
      </div>
      <Banner>{t("guest.readOnly")}</Banner>
      <SearchPanel
        records={shelf.records}
        views={views}
        config={config}
        locations={shelf.locations}
        onPick={(id) => {
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
          railFor={(view) => <BrassRail view={view} settings={toSortSettings(config.settings)} foundId={found && view.index.positionOf.has(found) ? found : null} onJump={(id) => document.querySelector(`[data-slot="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })} />}
        />
        {wide && <aside className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card">{card_ ?? <RecordCardEmpty />}</aside>}
      </div>
      {!wide && card_ && (
        <Sheet bare title={record!.title} labelledBy="record-sheet-title" onClose={() => setOpenRecord(null)}>
          {card_}
        </Sheet>
      )}
      {openSlot && (
        <CompartmentSheet
          slot={openSlot}
          view={views.find((v) => v.media === openSlot.media)!}
          config={config}
          byId={byId}
          highlightId={found}
          onClose={() => setOpenSlot(null)}
          onPickRecord={(id) => {
            setOpenSlot(null);
            setOpenRecord(id);
            showFound(id);
          }}
        />
      )}
    </div>
  );
}

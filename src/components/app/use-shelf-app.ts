"use client";

/**
 * The app's state machine. Without an account everything lives in this
 * browser (the demo); signed in, it lives in Supabase. Both use the same
 * layout algorithm and the same shapes, so the screens don't care which.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO, FRESHNESS_MS, ZERO_START, isZeroStart } from "@/lib/config";
import { msg, rawMsg, type Msg } from "@/i18n/core";
import { useI18n } from "@/i18n/client";
import type { RecordInput } from "@/lib/discogs/map";
import {
  collapseMoves,
  countChanges,
  insertRecord,
  restrictToSection,
  SHELF_MEDIA,
  sortRecords,
  type Move,
  type Placement,
  type ShelfMedia,
} from "@/lib/layout";
import { clearLocal, loadLocal, loadLocalWithMigration, saveLocal, type LocalSnapshot } from "@/lib/store/local";
import { peekPendingImport, setPendingImport, takePendingImport } from "@/lib/local/pending";
import {
  addRecordRemote,
  applyPlacementsRemote,
  ensureLocationRemote,
  setRecordLocationRemote,
  loadRemote,
  saveSetupRemote,
  type CollectionRow,
  type JobRow,
  type LayoutEvent,
} from "@/lib/store/remote";
import { replacesCollection } from "@/lib/import/replace";
import { localizeShelfNames } from "@/lib/shelf/localize";
import {
  buildViews,
  computeInitial,
  demoConfig,
  groupOf,
  withoutOtherFormats,
  withoutBrandNames,
  misplacedRecords,
  sizeOf,
  placementByPosition,
  toLayoutRecord,
  toSortSettings,
  type MediaView,
  type ShelfConfig,
  type StoredRecord,
  type TempLocation,
} from "@/lib/shelf/model";
import { useSupabase } from "@/lib/supabase/browser";

export type AppData = {
  records: StoredRecord[];
  config: ShelfConfig | null;
  placement: Placement;
  collection: CollectionRow | null;
  /** Local demo only: when its records were fetched from Discogs. */
  fetchedAt: string | null;
  /** Temporary locations (records taken out carry temp_location_id). */
  locations?: TempLocation[];
};

export type Status =
  | { kind: "loading"; message: Msg }
  | { kind: "onboarding"; error?: Msg; username?: string }
  /** scratch: starting from scratch (an import behind the scenes that the screen never calls one). */
  | { kind: "importing"; job: JobRow | null; message: Msg; scratch?: boolean }
  /** Another collection was asked for (from the landing page) while the user has one: confirm before replacing it. */
  | { kind: "confirmReplace"; target: ReplaceTarget; count: number }
  | { kind: "ready" }
  | { kind: "error"; message: Msg };

/** undo: a record just added, and the moves its insertion made, so "Undo" can put everything back. */
export type Notice = { tone: "info" | "success" | "warning"; msg: Msg; moves?: Move[]; undo?: { recordId: string; moves: Move[] } };

export type MapPreview = { config: ShelfConfig; changed: number; placed: number; leftover: number; notPlaced: number; hasMap: boolean; slackReduced: boolean };

export type InsertPreview = {
  record: StoredRecord;
  media: ShelfMedia | null;
  target: string | null;
  moves: Move[];
  movedCount: number;
  overflow: string[];
  placement: Placement;
};

const isStale = (iso: string | null | undefined) => !iso || Date.now() - new Date(iso).getTime() > FRESHNESS_MS;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; retryAfterMs?: number };
  if (!res.ok) throw Object.assign(new Error(json.error ?? `Request failed (${res.status}).`), { status: res.status, retryAfterMs: json.retryAfterMs });
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Drops ?start=demo from the address once it's been answered, so a reload doesn't ask again. */
function dropStartParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("start")) return;
  url.searchParams.delete("start");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

/** Stands for the demo where a username is expected (no Discogs username has parentheses). */
const DEMO_KEY = "(demo)";

const replacedNotice = (username: string): Notice => ({
  tone: "success",
  msg: username === DEMO_KEY ? msg("notices.replacedDemo") : isZeroStart(username) ? msg("notices.replacedZero") : msg("notices.replaced", { username }),
});

/** What would replace the collection the user has, waiting for them to confirm. */
export type ReplaceTarget = { source: "demo" } | { source: "discogs"; username: string };

// "Start from zero" is an import of an empty Discogs collection behind the
// scenes: its username and its Discogs errors never reach the screen.

/** Why an import failed, as the user sees it. */
const importError = (username: string | undefined, error: string | null | undefined): Msg =>
  isZeroStart(username) ? msg("notices.zeroFailed") : error ? rawMsg(error) : msg("notices.importFailed");

/** The username to put back in the field after a failed import. */
const retryUsername = (username: string | undefined): string | undefined => (isZeroStart(username) ? undefined : username);

/** A background update from Discogs that failed. */
const syncFailedNotice = (username: string | undefined, error: string | null | undefined): Notice => ({
  tone: "warning",
  msg: msg("notices.syncFailed", { message: isZeroStart(username) ? msg("notices.discogsDown") : error || "?" }),
});

/** An error from a server or the network, as raw text (it comes in English), or a fallback message. */
const errorMsg = (err: unknown, fallback: Msg): Msg => (err instanceof Error && err.message ? rawMsg(err.message) : fallback);

function demoRecords(payload: { records: RecordInput[] }): StoredRecord[] {
  return withoutOtherFormats(payload.records.map((r) => ({ ...r, id: `d${r.discogs_instance_id}`, origin: "import" as const })));
}

/**
 * True when most records have no compartment and there's room for them, e.g.
 * after switching from the demo to your own collection. A collection that
 * simply doesn't fit never triggers it.
 */
function needsRelayout(records: StoredRecord[], config: ShelfConfig, placement: Placement) {
  const views = buildViews(records, config, placement);
  const unplaced = views.reduce((n, v) => n + v.unplaced.length, 0);
  const placed = views.reduce((n, v) => n + v.index.sorted.length, 0);
  const capacity = views.reduce((n, v) => n + v.index.slots.reduce((c, s) => c + s.capacity, 0), 0);
  return unplaced > 50 && unplaced > placed && capacity - placed >= unplaced / 2;
}

/** Places records that have no compartment yet (new ones after a re-sync), skipping any that would push others off the shelf. */
function placeNewRecords(records: StoredRecord[], config: ShelfConfig, placement: Placement) {
  const views = buildViews(records, config, placement);
  const settings = toSortSettings(config.settings);
  let current = placement;
  const moves: Move[] = [];
  let placed = 0;
  let skipped = 0;
  for (const view of views) {
    if (view.unplaced.length === 0) continue;
    let group = records.filter((r) => groupOf(r) === view.media && current.has(r.id)).map(toLayoutRecord);
    for (const r of sortRecords(view.unplaced.map(toLayoutRecord), settings)) {
      const result = insertRecord({ ...restrictToSection(view.index.slots, group, r), placement: current, settings }, r, "minimum");
      if (result.overflow.length > 0 || !result.target) {
        skipped++;
        continue;
      }
      current = result.placement;
      group = [...group, r];
      moves.push(...result.moves);
      placed++;
    }
  }
  return { placement: current, moves: collapseMoves(moves), placed, skipped };
}

/**
 * Takes off the map any record whose compartment belongs to another format
 * group (a re-sync can turn an "LP" into a 7″ single once every format is
 * read). It goes back in through insertion in its own group, if that group has shelves.
 */
async function removeMisplaced(client: SupabaseClient, data: AppData): Promise<AppData> {
  if (!data.config) return data;
  const misplaced = misplacedRecords(data.records, data.config, data.placement);
  if (misplaced.length === 0) return data;
  const placement: Placement = new Map(data.placement);
  const moves: Move[] = misplaced.map((id) => ({ recordId: id, from: data.placement.get(id) ?? null, to: null }));
  for (const id of misplaced) placement.delete(id);
  await applyPlacementsRemote(client, placement, moves, { kind: "format_split", moves, movedCount: moves.length });
  return { ...data, placement };
}

export function useShelfApp(startParam: string | null) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { t, locale } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  /** Shelf names for the demo, in the language at the moment they're created. */
  const demoNames = useCallback(() => ({ living: tRef.current("demo.living"), studio: tRef.current("demo.studio"), singles: tRef.current("demo.singles") }), []);
  const clerk = useClerk();
  const supabase = useSupabase();
  const [data, setData] = useState<AppData | null>(null);
  useEffect(() => {
    latestData.current = data;
  }, [data]);
  const [status, setStatus] = useState<Status>({ kind: "loading", message: msg("app.loadingShelf") });
  const [syncJob, setSyncJob] = useState<JobRow | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef<string | null>(null);
  const alive = useRef(true);
  // The latest data, for actions started from an older render (Undo on a notice).
  const latestData = useRef<AppData | null>(null);
  // A replacement waiting for the user's answer, with the shelf to go back to if they keep it.
  const pendingReplace = useRef<{ target: ReplaceTarget; next: AppData; local: boolean } | null>(null);
  const mode: "local" | "remote" | null = !isLoaded ? null : isSignedIn ? "remote" : "local";

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ------------------------------------------------------------ local (demo)
  const persistLocal = useCallback((next: AppData, event?: { kind: string; movedCount: number }) => {
    const previous = loadLocal();
    const snapshot: LocalSnapshot = {
      version: 2,
      records: next.records,
      fetchedAt: next.fetchedAt ?? new Date().toISOString(),
      config: next.config ?? demoConfig(next.records, demoNames()),
      placement: [...next.placement],
      events: [...(previous?.events ?? []), ...(event ? [{ ...event, at: new Date().toISOString() }] : [])].slice(-50),
      locations: next.locations ?? previous?.locations ?? [],
    };
    if (!saveLocal(snapshot)) setNotice({ tone: "warning", msg: msg("notices.localSaveFailed") });
  }, [demoNames]);

  const startLocalDemo = useCallback(async () => {
    setStatus({ kind: "loading", message: msg("app.loadingDemo") });
    try {
      const payload = await api<{ records: RecordInput[]; fetchedAt: string }>("/api/demo");
      const records = demoRecords(payload);
      const config = demoConfig(records, demoNames());
      const { byPosition, layout } = computeInitial(records, config);
      const next: AppData = { records, config, placement: byPosition, collection: null, fetchedAt: payload.fetchedAt };
      persistLocal(next, { kind: "initial", movedCount: byPosition.size });
      if (!alive.current) return;
      setData(next);
      setStatus({ kind: "ready" });
      setNotice({
        tone: "success",
        msg: msg(layout.groups.single.sortedIds.length > 0 ? "notices.demoReadySingles" : "notices.demoReady", {
          lps: layout.groups.lp.sortedIds.length,
          singles: layout.groups.single.sortedIds.length,
          cds: layout.groups.cd.sortedIds.length,
        }),
      });
    } catch (err) {
      setStatus({ kind: "error", message: errorMsg(err, msg("notices.demoFailed")) });
    }
  }, [persistLocal, demoNames]);

  /** Re-fetches the demo when the browser copy is older than 6 hours, keeping the shelves. */
  const refreshLocalDemo = useCallback(
    async (snapshot: LocalSnapshot) => {
      setSyncJob({ id: "local", status: "running" } as JobRow);
      try {
        const payload = await api<{ records: RecordInput[]; fetchedAt: string }>("/api/demo");
        // Records added by hand stay; refresh their Discogs data too (6-hour rule).
        const added = await Promise.all(
          snapshot.records
            .filter((r) => r.origin === "added")
            .map(async (r) => {
              try {
                const { record } = await api<{ record: RecordInput }>(`/api/discogs/release?id=${r.discogs_release_id}`);
                return { ...record, id: r.id, origin: "added" as const, synced_at: new Date().toISOString() };
              } catch {
                return r;
              }
            }),
        );
        // The user may have added, taken out, or regenerated while we fetched:
        // merge into what's saved now, not into the snapshot we started from.
        const latest = loadLocal() ?? snapshot;
        const refreshedAdded = new Map(added.map((r) => [r.id, r]));
        const addedNow = latest.records.filter((r) => r.origin === "added").map((r) => refreshedAdded.get(r.id) ?? r);
        // Records taken out to a temporary location stay out after the refresh.
        const outside = new Map(latest.records.filter((r) => r.temp_location_id).map((r) => [r.id, r]));
        const fresh = withoutOtherFormats([...demoRecords(payload), ...addedNow]).map((r) => {
          const was = outside.get(r.id);
          return was ? { ...r, temp_location_id: was.temp_location_id, taken_out_at: was.taken_out_at } : r;
        });
        const ids = new Set(fresh.map((r) => r.id));
        const kept = new Map([...new Map(latest.placement)].filter(([id]) => ids.has(id)));
        const placed = placeNewRecords(fresh, latest.config, kept);
        const next: AppData = {
          records: fresh,
          config: latest.config,
          placement: placed.placement,
          collection: null,
          fetchedAt: payload.fetchedAt,
          locations: latest.locations ?? [],
        };
        persistLocal(next, placed.moves.length ? { kind: "insert", movedCount: placed.moves.length } : undefined);
        if (alive.current) setData(next);
      } catch {
        // Keep showing the old copy; we try again next time.
      } finally {
        if (alive.current) setSyncJob(null);
      }
    },
    [persistLocal],
  );

  // ------------------------------------------------------------ remote
  const reloadRemote = useCallback(async (client: SupabaseClient) => {
    const state = await loadRemote(client);
    const next: AppData = {
      records: state.records,
      config: state.config,
      placement: state.placement,
      collection: state.collection,
      fetchedAt: null,
      locations: state.locations,
    };
    return { state, next };
  }, []);

  const runJob = useCallback(
    async (client: SupabaseClient, job: JobRow, background: boolean): Promise<JobRow> => {
      let current = job;
      while (alive.current && (current.status === "queued" || current.status === "running")) {
        let step: { job: JobRow; retryAfterMs?: number };
        try {
          step = await api<{ job: JobRow; retryAfterMs?: number }>("/api/import/step", { jobId: current.id });
        } catch (err) {
          // Too fast: wait and try the same step again.
          if ((err as { status?: number }).status === 429) {
            await sleep((err as { retryAfterMs?: number }).retryAfterMs ?? 3000);
            continue;
          }
          throw err;
        }
        current = step.job;
        if (!alive.current) break;
        if (background) setSyncJob(current);
        else {
          const scratch = isZeroStart(current.discogs_username);
          setStatus({ kind: "importing", job: current, message: msg(scratch ? "importing.scratch" : "importing.importing"), scratch });
        }
        if (step.retryAfterMs) await sleep(step.retryAfterMs);
      }
      void client;
      return current;
    },
    [],
  );

  /** After an import: save a local demo into the account, build the demo shelves, or place new records. */
  const afterImport = useCallback(
    async (client: SupabaseClient) => {
      let { state, next } = await reloadRemote(client);
      let local = loadLocal();
      if (local && state.collection && state.collection.source !== "demo") {
        // They imported their own collection instead of saving the browser demo.
        clearLocal();
        local = null;
      }

      if (local && state.collection?.source === "demo" && !state.config) {
        // The visitor built something in the demo before signing up: keep it.
        const byInstance = new Map(state.records.map((r) => [`d${r.discogs_instance_id}`, r.id]));
        const byPosition = new Map<string, string>();
        for (const [localId, position] of local.placement) {
          const remoteId = byInstance.get(localId);
          if (remoteId) byPosition.set(remoteId, position);
        }
        // Records added by hand in the demo aren't in the Discogs collection: insert them first.
        const localPositions = new Map(local.placement);
        for (const r of local.records.filter((x) => x.origin === "added")) {
          if (!userId) break;
          // Only the Discogs fields go to the database: not the demo's local temporary location.
          const { id: localId, origin: _origin, synced_at: _synced, temp_location_id: _loc, taken_out_at: _out, ...input } = r;
          void [_origin, _synced, _loc, _out];
          const stored = await addRecordRemote(client, userId, { ...input, size_inches: sizeOf(r), format_group: groupOf(r) });
          const position = localPositions.get(localId);
          if (position) byPosition.set(stored.id, position);
        }
        const config: ShelfConfig = {
          ...local.config,
          furniture: local.config.furniture.map((f) => ({ ...f, compartments: f.compartments.map((c) => ({ ...c, id: undefined })) })),
        };
        await saveSetupRemote(client, config, byPosition, { kind: "initial", moves: [], movedCount: byPosition.size });
        clearLocal();
        ({ state, next } = await reloadRemote(client));
        setNotice({ tone: "success", msg: msg("notices.demoSaved") });
      } else if (!state.config && state.collection?.source === "demo") {
        const config = demoConfig(state.records, demoNames());
        const { byPosition } = computeInitial(state.records, config);
        await saveSetupRemote(client, config, byPosition, { kind: "initial", moves: [], movedCount: byPosition.size });
        ({ state, next } = await reloadRemote(client));
      } else if (state.config && needsRelayout(next.records, state.config, next.placement)) {
        // Mostly new records (e.g. switching from the demo to your own collection): lay the shelf out again.
        const { byPosition } = computeInitial(state.records, state.config);
        const config: ShelfConfig = {
          ...state.config,
          furniture: state.config.furniture.map((f) => ({ ...f, compartments: f.compartments.map((c) => ({ ...c, id: undefined })) })),
        };
        await saveSetupRemote(client, config, byPosition, { kind: "relayout", moves: [], movedCount: byPosition.size });
        ({ state, next } = await reloadRemote(client));
        setNotice({ tone: "info", msg: msg("notices.relaidOut") });
      } else if (state.config) {
        next = await removeMisplaced(client, next);
        const placed = placeNewRecords(next.records, state.config, next.placement);
        let saved = placed.moves.length > 0;
        if (saved) {
          try {
            await applyPlacementsRemote(client, placed.placement, placed.moves, { kind: "insert", moves: placed.moves, movedCount: placed.moves.length });
          } catch (err) {
            saved = false;
            setNotice({ tone: "warning", msg: msg("notices.placeFailed", { message: err instanceof Error ? err.message : "?" }) });
          }
        }
        if (saved) {
          next = { ...next, placement: placed.placement };
          setNotice({
            tone: "info",
            msg: msg("notices.newPlaced", { count: placed.placed, moves: msg("notices.moves", { count: placed.moves.length }) }),
            moves: placed.moves,
          });
        } else if (placed.skipped > 0) {
          setNotice({ tone: "warning", msg: msg("notices.newSkipped", { count: placed.skipped }) });
        }
      }
      if (!alive.current) return;
      setData(next);
      setStatus({ kind: "ready" });
    },
    [reloadRemote, userId, demoNames],
  );

  /** A replacement failed: nothing changed, so go back to the current collection and say why. */
  const failReplacement = useCallback((username: string, message: string) => {
    setStatus({ kind: "ready" });
    setNotice({
      tone: "warning",
      msg:
        username === DEMO_KEY
          ? msg("notices.replaceDemoFailed")
          : isZeroStart(username)
            ? msg("notices.replaceZeroFailed")
            : msg("notices.replaceFailed", { username, message }),
    });
  }, []);

  const startRemoteImport = useCallback(
    async (client: SupabaseClient, input: { source: "discogs"; username: string } | { source: "demo" }, background: boolean, replacing = false) => {
      const username = input.source === "discogs" ? input.username : DEMO_KEY;
      const scratch = input.source === "discogs" && isZeroStart(input.username);
      if (!background)
        setStatus({ kind: "importing", job: null, message: msg(input.source === "demo" ? "importing.loadingDemo" : scratch ? "importing.scratch" : "importing.starting"), scratch });
      try {
        const { job } = await api<{ job: JobRow }>("/api/import/start", input);
        if (background) setSyncJob(job);
        const finished = await runJob(client, job, background);
        if (!alive.current || (finished.status !== "done" && finished.status !== "error")) return;
        if (finished.status === "error") {
          if (background) setNotice(syncFailedNotice(username, finished.last_error));
          else if (replacing) failReplacement(username, finished.last_error ?? "The import failed.");
          else setStatus({ kind: "onboarding", error: importError(username, finished.last_error), username: input.source === "discogs" ? retryUsername(input.username) : undefined });
          return;
        }
        await afterImport(client);
        if (replacing && alive.current) setNotice(replacedNotice(username));
      } catch (err) {
        if (!alive.current) return;
        const message = err instanceof Error ? err.message : "";
        if (background) setNotice(syncFailedNotice(username, message));
        else if (replacing) failReplacement(username, message);
        else setStatus({ kind: "onboarding", error: importError(username, message), username: input.source === "discogs" ? retryUsername(input.username) : undefined });
      } finally {
        if (alive.current && background) setSyncJob(null);
      }
    },
    [afterImport, runJob, failReplacement],
  );

  // ------------------------------------------------------------ boot
  useEffect(() => {
    if (!mode) return;
    const key = mode === "remote" ? `remote:${userId}` : "local";
    if (mode === "remote" && !supabase) return;
    if (started.current === key) return;
    started.current = key;

    if (mode === "local") {
      void (async () => {
        const loaded = loadLocalWithMigration(demoNames().singles);
        const snapshot = loaded?.snapshot ?? null;
        if (snapshot) {
          setData({
            records: withoutOtherFormats(snapshot.records),
            config: withoutBrandNames(snapshot.config, tRef.current("builder.cubeShelf")),
            placement: new Map(snapshot.placement),
            collection: null,
            fetchedAt: snapshot.fetchedAt,
            locations: snapshot.locations ?? [],
          });
          setStatus({ kind: "ready" });
          if (isStale(snapshot.fetchedAt)) await refreshLocalDemo(snapshot);
        } else if (startParam === "demo") {
          await startLocalDemo();
        } else {
          setStatus({ kind: "onboarding" });
        }
      })();
      return;
    }

    const client = supabase!;
    void (async () => {
      try {
        const { state, next } = await reloadRemote(client);
        if (!alive.current) return;
        // Another collection was asked for while they have one (or a demo in this browser): ask first.
        const pendingTarget: ReplaceTarget | null = peekPendingImport()
          ? { source: "discogs", username: peekPendingImport()! }
          : startParam === "demo"
            ? { source: "demo" }
            : null;
        const local = !state.collection ? loadLocal() : null;
        const hasShelf = state.records.length > 0 || !!state.config;
        const differs =
          pendingTarget !== null &&
          !!state.collection &&
          replacesCollection(state.collection, pendingTarget.source === "demo" ? { source: "demo", discogs_username: DEMO.username } : { source: "discogs", discogs_username: pendingTarget.username });
        if (pendingTarget && ((differs && hasShelf) || (local && pendingTarget.source === "discogs"))) {
          takePendingImport();
          pendingReplace.current = { target: pendingTarget, next, local: !!local };
          setStatus({ kind: "confirmReplace", target: pendingTarget, count: local ? withoutOtherFormats(local.records).length : state.records.length });
          return;
        }
        if (pendingTarget?.source === "demo" && differs) {
          // Nothing on their shelf yet (an empty collection without shelves): nothing to lose, so no question.
          dropStartParam();
          await startRemoteImport(client, { source: "demo" }, false);
          return;
        }
        const pending = takePendingImport();
        if (pending) {
          // A different collection than the one they have replaces it: show it as a full import, not a quiet re-sync.
          const replacing = state.records.length > 0 && replacesCollection(state.collection, { source: "discogs", discogs_username: pending });
          if (state.records.length > 0) {
            setData(next);
            setStatus({ kind: "ready" });
          }
          await startRemoteImport(client, { source: "discogs", username: pending }, state.records.length > 0 && !replacing, replacing);
          return;
        }
        if (state.activeJob) {
          const replacing = state.records.length > 0 && replacesCollection(state.collection, state.activeJob);
          const background = state.records.length > 0 && !!state.config && !replacing;
          if (state.records.length > 0) setData(next);
          if (background) {
            setStatus({ kind: "ready" });
            setSyncJob(state.activeJob);
          }
          const finished = await runJob(client, state.activeJob, background);
          if (!alive.current) return;
          const username = finished.source === "demo" ? DEMO_KEY : finished.discogs_username;
          if (finished.status === "error") {
            if (background) setNotice(syncFailedNotice(username, finished.last_error));
            else if (replacing) failReplacement(username, finished.last_error ?? "The import failed.");
            else setStatus({ kind: "onboarding", error: importError(finished.discogs_username, finished.last_error), username: retryUsername(finished.discogs_username) });
            setSyncJob(null);
            return;
          }
          setSyncJob(null);
          if (finished.status === "done") {
            await afterImport(client);
            if (replacing && alive.current) setNotice(replacedNotice(username));
          }
          return;
        }
        if (state.records.length === 0 && state.lastJob?.status === "error") {
          // The last import failed (a typo, a private collection): let them fix it.
          setStatus({ kind: "onboarding", error: importError(state.lastJob.discogs_username, state.lastJob.last_error), username: retryUsername(state.lastJob.discogs_username) });
          return;
        }
        if (!state.collection) {
          if (loadLocal() || startParam === "demo") {
            await startRemoteImport(client, { source: "demo" }, false);
          } else {
            setStatus({ kind: "onboarding" });
          }
          return;
        }
        setData(next);
        setStatus({ kind: "ready" });
        if (state.config && misplacedRecords(next.records, state.config, next.placement).length > 0) {
          const fixed = await removeMisplaced(client, next);
          if (alive.current) setData(fixed);
        }
        if (!state.config && state.collection.source === "demo") {
          // A demo import that finished without its shelves (e.g. the tab closed at the end): build them now.
          await afterImport(client);
        }
        if (isStale(state.collection.last_synced_at)) {
          const input =
            state.collection.source === "demo" || !state.collection.discogs_username
              ? ({ source: "demo" } as const)
              : ({ source: "discogs", username: state.collection.discogs_username } as const);
          await startRemoteImport(client, input, true);
        } else if (state.config) {
          const placed = placeNewRecords(next.records, state.config, next.placement);
          if (placed.moves.length > 0) await afterImport(client);
        }
      } catch (err) {
        if (alive.current) setStatus({ kind: "error", message: errorMsg(err, msg("notices.loadFailed")) });
      }
    })();
  }, [mode, userId, supabase, startParam, startLocalDemo, refreshLocalDemo, reloadRemote, startRemoteImport, runJob, afterImport, failReplacement, demoNames]);

  // ------------------------------------------------------------ actions
  /** The user confirmed: the other collection replaces theirs. */
  const confirmReplace = useCallback(async () => {
    const waiting = pendingReplace.current;
    if (!waiting || !supabase) return;
    pendingReplace.current = null;
    dropStartParam();
    // A demo in this browser isn't a saved collection: importing simply leaves it behind.
    await startRemoteImport(supabase, waiting.target, false, !waiting.local);
  }, [supabase, startRemoteImport]);

  /** The user kept their collection. */
  const keepCollection = useCallback(async () => {
    const waiting = pendingReplace.current;
    if (!waiting || !supabase) return;
    pendingReplace.current = null;
    dropStartParam();
    // The demo in this browser goes to the new account, as it would have without the detour.
    if (waiting.local) return void (await startRemoteImport(supabase, { source: "demo" }, false));
    setData(waiting.next);
    setStatus({ kind: "ready" });
  }, [supabase, startRemoteImport]);

  /** Syncs with Discogs now (it also gives a shared link six more hours). */
  const syncNow = useCallback(() => {
    const collection = data?.collection;
    if (mode !== "remote" || !supabase || !collection || syncJob) return;
    const input =
      collection.source === "demo" || !collection.discogs_username
        ? ({ source: "demo" } as const)
        : ({ source: "discogs", username: collection.discogs_username } as const);
    void startRemoteImport(supabase, input, true);
  }, [mode, supabase, data?.collection, syncJob, startRemoteImport]);

  const startDemo = useCallback(() => {
    if (mode === "remote" && supabase) void startRemoteImport(supabase, { source: "demo" }, false);
    else void startLocalDemo();
  }, [mode, supabase, startLocalDemo, startRemoteImport]);

  const importDiscogs = useCallback(
    (username: string) => {
      if (mode === "remote" && supabase) {
        const replacing = (data?.records.length ?? 0) > 0 && replacesCollection(data?.collection, { source: "discogs", discogs_username: username });
        void startRemoteImport(supabase, { source: "discogs", username }, !!data?.config && !replacing, replacing);
      } else {
        setPendingImport(username);
        clerk.openSignUp({ forceRedirectUrl: "/app", signInForceRedirectUrl: "/app" });
      }
    },
    [mode, supabase, startRemoteImport, data, clerk],
  );

  // What the screens get: automatic shelf names in the current language (saved shelves keep what they were saved with).
  const shownData = useMemo(() => (data?.config ? { ...data, config: localizeShelfNames(data.config, locale) } : data), [data, locale]);
  const views: MediaView[] = useMemo(() => (shownData?.config ? buildViews(shownData.records, shownData.config, shownData.placement) : []), [shownData]);

  /** What "Generate map" would do, before saving. */
  const previewMap = useCallback(
    (config: ShelfConfig): MapPreview => {
      const records = data?.records ?? [];
      const { byPosition, layout } = computeInitial(records, config);
      const hasMap = !!data?.config && (data?.placement.size ?? 0) > 0;
      const before = hasMap ? placementByPosition(data!.placement, data!.config!.furniture) : new Map<string, string>();
      return {
        config,
        changed: hasMap ? countChanges(before, byPosition) : byPosition.size,
        placed: byPosition.size,
        leftover: SHELF_MEDIA.reduce((n, m) => n + layout.groups[m].leftover.length, 0),
        notPlaced: layout.notPlaced.length,
        hasMap,
        slackReduced: SHELF_MEDIA.some((m) => layout.groups[m].slackReduced),
      };
    },
    [data],
  );

  const generateMap = useCallback(
    async (config: ShelfConfig) => {
      if (!data) return;
      setBusy(true);
      try {
        const preview = previewMap(config);
        const { byPosition } = computeInitial(data.records, config);
        const kind = preview.hasMap ? "relayout" : "initial";
        if (mode === "remote" && supabase) {
          // Use the records as they are now: a background sync may have added or removed some.
          const { next: current } = await reloadRemote(supabase);
          const { byPosition: target } = computeInitial(current.records, config);
          const hasMap = !!current.config && current.placement.size > 0;
          const before = hasMap ? placementByPosition(current.placement, current.config!.furniture) : new Map<string, string>();
          const moves: Move[] = [];
          for (const [id, to] of target) if (before.get(id) !== to) moves.push({ recordId: id, from: before.get(id) ?? null, to });
          for (const [id, from] of before) if (!target.has(id)) moves.push({ recordId: id, from, to: null });
          const event: LayoutEvent = {
            kind: hasMap ? "relayout" : "initial",
            moves: hasMap ? moves : [],
            movedCount: hasMap ? countChanges(before, target) : target.size,
          };
          await saveSetupRemote(supabase, config, target, event);
          const { next } = await reloadRemote(supabase);
          setData(next);
        } else {
          const next: AppData = { ...data, config, placement: byPosition };
          persistLocal(next, { kind, movedCount: preview.changed });
          setData(next);
        }
        setNotice({
          tone: preview.leftover > 0 ? "warning" : "success",
          msg:
            preview.leftover > 0
              ? msg("notices.mapLeftover", { count: preview.leftover })
              : preview.hasMap
                ? msg("notices.mapUpdated", { count: preview.changed })
                : preview.placed === 0 && data.records.length === 0
                  ? msg("notices.mapGeneratedEmpty")
                  : msg("notices.mapGenerated", { count: preview.placed }),
        });
      } catch (err) {
        setNotice({ tone: "warning", msg: errorMsg(err, msg("notices.mapSaveFailed")) });
      } finally {
        setBusy(false);
      }
    },
    [data, mode, supabase, previewMap, reloadRemote, persistLocal],
  );

  const applyChange = useCallback(
    async (placement: Placement, moves: Move[], event: LayoutEvent, extraRecords: StoredRecord[] = []) => {
      if (!data) return;
      const records = extraRecords.length ? [...data.records, ...extraRecords] : data.records;
      if (mode === "remote" && supabase) {
        await applyPlacementsRemote(supabase, placement, moves, event);
      } else {
        persistLocal({ ...data, records, placement }, { kind: event.kind, movedCount: event.movedCount });
      }
      setData({ ...data, records, placement });
    },
    [data, mode, supabase, persistLocal],
  );

  /** "Add a new record": the naive insertion, computed without saving. */
  const previewInsert = useCallback(
    (input: RecordInput): InsertPreview | null => {
      if (!data?.config) return null;
      const record: StoredRecord = { ...input, id: `new-${input.discogs_release_id}`, origin: "added" };
      const view = views.find((v) => v.media === groupOf(record));
      if (!view || view.index.slots.length === 0) {
        return { record, media: null, target: null, moves: [], movedCount: 0, overflow: [], placement: data.placement };
      }
      const settings = toSortSettings(data.config.settings);
      const group = data.records.filter((r) => groupOf(r) === view.media && data.placement.has(r.id)).map(toLayoutRecord);
      const layoutRecord = toLayoutRecord(record);
      const result = insertRecord({ ...restrictToSection(view.index.slots, group, layoutRecord), placement: data.placement, settings }, layoutRecord, "minimum");
      return { record, media: view.media, target: result.target, moves: result.moves, movedCount: result.movedCount, overflow: result.overflow, placement: result.placement };
    },
    [data, views],
  );

  const addRecord = useCallback(
    async (input: RecordInput) => {
      if (!data?.config) return null;
      setBusy(true);
      try {
        let stored: StoredRecord;
        if (mode === "remote" && supabase && userId) stored = await addRecordRemote(supabase, userId, input);
        else stored = { ...input, id: `a${input.discogs_release_id}-${Date.now().toString(36)}`, origin: "added", synced_at: new Date().toISOString() };
        const view = views.find((v) => v.media === groupOf(stored));
        if (!view || view.index.slots.length === 0) {
          setData({ ...data, records: [...data.records, stored] });
          return { stored, preview: null };
        }
        const settings = toSortSettings(data.config.settings);
        const group = data.records.filter((r) => groupOf(r) === view.media && data.placement.has(r.id)).map(toLayoutRecord);
        const layoutRecord = toLayoutRecord(stored);
        const result = insertRecord({ ...restrictToSection(view.index.slots, group, layoutRecord), placement: data.placement, settings }, layoutRecord, "minimum");
        try {
          await applyChange(result.placement, result.moves, { kind: "insert", moves: result.moves, movedCount: result.movedCount }, [stored]);
        } catch (err) {
          if (mode === "remote" && supabase) await supabase.from("records").delete().eq("id", stored.id);
          throw err;
        }
        setNotice({
          tone: "success",
          msg: result.movedCount <= 1 ? msg("notices.addedOneMove") : msg("notices.addedMoves", { count: result.movedCount }),
          moves: result.moves,
          undo: { recordId: stored.id, moves: result.moves },
        });
        return { stored, preview: result };
      } catch (err) {
        setNotice({ tone: "warning", msg: errorMsg(err, msg("notices.addFailed")) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [data, mode, supabase, userId, views, applyChange],
  );

  /**
   * Removes a record added by hand (imported ones come back with the next sync:
   * they're removed on Discogs). Its place is left free; no other record moves.
   * With `moves` (Undo right after adding it), the records its insertion
   * pushed go back to where they were.
   */
  const removeRecord = useCallback(
    async (recordId: string, moves: Move[] = []) => {
      const current = latestData.current;
      if (!current) return false;
      const record = current.records.find((r) => r.id === recordId);
      if (!record || record.origin !== "added") return false;
      setBusy(true);
      try {
        const placement = new Map(current.placement);
        placement.delete(recordId);
        // Undo: move back the records the insertion pushed, if they're still where it left them.
        const back: Move[] = moves
          .filter((m) => m.recordId !== recordId && m.from !== null && m.to !== null && placement.get(m.recordId) === m.to)
          .map((m) => ({ recordId: m.recordId, from: m.to, to: m.from }));
        for (const m of back) placement.set(m.recordId, m.to!);
        if (mode === "remote" && supabase) {
          const { error } = await supabase.from("records").delete().eq("id", recordId);
          if (error) throw new Error("delete");
          if (back.length > 0) await applyPlacementsRemote(supabase, placement, back, { kind: "insert", moves: back, movedCount: back.length });
        }
        const next: AppData = { ...current, records: current.records.filter((r) => r.id !== recordId), placement };
        if (mode !== "remote") persistLocal(next);
        setData(next);
        setNotice({
          tone: "info",
          msg: moves.length > 0 ? msg("notices.undone", { title: record.title }) : msg("notices.removed", { title: record.title }),
          moves: back.length > 0 ? back : undefined,
        });
        return true;
      } catch {
        setNotice({ tone: "warning", msg: msg("notices.removeFailed") });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [mode, supabase, persistLocal],
  );

  /** Takes a record out to a temporary location (created if it's new). It keeps its spot on the shelf. */
  const takeOut = useCallback(
    async (recordId: string, name: string): Promise<TempLocation | null> => {
      const trimmed = name.trim().slice(0, 60);
      if (!data || !trimmed) return null;
      setBusy(true);
      try {
        let location = (data.locations ?? []).find((l) => l.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
        if (mode === "remote" && supabase && userId) {
          if (!location) location = await ensureLocationRemote(supabase, userId, trimmed);
          await setRecordLocationRemote(supabase, recordId, location.id);
        } else if (!location) {
          location = { id: `loc-${Date.now().toString(36)}`, name: trimmed };
        }
        const found = location;
        const locations = (data.locations ?? []).some((l) => l.id === found.id) ? (data.locations ?? []) : [...(data.locations ?? []), found];
        const records = data.records.map((r) => (r.id === recordId ? { ...r, temp_location_id: found.id, taken_out_at: new Date().toISOString() } : r));
        const next: AppData = { ...data, records, locations };
        if (mode !== "remote") persistLocal(next);
        setData(next);
        setNotice({ tone: "info", msg: msg("temp.takenOut", { location: found.name }) });
        return found;
      } catch (err) {
        setNotice({ tone: "warning", msg: errorMsg(err, msg("temp.failed")) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [data, mode, supabase, userId, persistLocal],
  );

  /** Puts a record back: its spot never changed, so the card and the map show where. */
  const putBack = useCallback(
    async (recordId: string): Promise<boolean> => {
      if (!data) return false;
      setBusy(true);
      try {
        if (mode === "remote" && supabase) await setRecordLocationRemote(supabase, recordId, null);
        const records = data.records.map((r) => (r.id === recordId ? { ...r, temp_location_id: null, taken_out_at: null } : r));
        const next: AppData = { ...data, records };
        if (mode !== "remote") persistLocal(next);
        setData(next);
        setNotice({ tone: "success", msg: msg("temp.putBack") });
        return true;
      } catch (err) {
        setNotice({ tone: "warning", msg: errorMsg(err, msg("temp.failed")) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [data, mode, supabase, persistLocal],
  );

  const resetLocal = useCallback(() => {
    clearLocal();
    setData(null);
    setStatus({ kind: "onboarding" });
  }, []);

  return {
    mode,
    status,
    data: shownData,
    views,
    syncJob,
    notice,
    busy,
    pendingImport: typeof window === "undefined" ? null : (retryUsername(peekPendingImport() ?? undefined) ?? null),
    dismissNotice: () => setNotice(null),
    startDemo,
    importDiscogs,
    startFromZero: () => importDiscogs(ZERO_START.username),
    confirmReplace,
    keepCollection,
    previewMap,
    generateMap,
    previewInsert,
    addRecord,
    takeOut,
    putBack,
    removeRecord,
    syncNow,
    resetLocal,
  };
}

export type ShelfApp = ReturnType<typeof useShelfApp>;

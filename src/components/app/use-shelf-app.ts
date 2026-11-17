"use client";

/**
 * The app's state machine. Without an account everything lives in this
 * browser (the demo); signed in, it lives in Supabase. Both use the same
 * layout algorithm and the same shapes, so the screens don't care which.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FRESHNESS_MS } from "@/lib/config";
import type { RecordInput } from "@/lib/discogs/map";
import {
  calibrate as calibrateLayout,
  collapseMoves,
  countChanges,
  insertRecord,
  sortRecords,
  type Move,
  type Placement,
  type ShelfMedia,
} from "@/lib/layout";
import { clearLocal, loadLocal, saveLocal, type LocalSnapshot } from "@/lib/store/local";
import { peekPendingImport, setPendingImport, takePendingImport } from "@/lib/local/pending";
import {
  addRecordRemote,
  applyPlacementsRemote,
  loadRemote,
  saveSetupRemote,
  type CollectionRow,
  type JobRow,
  type LayoutEvent,
} from "@/lib/store/remote";
import { replacesCollection } from "@/lib/import/replace";
import {
  buildViews,
  computeInitial,
  demoConfig,
  placementByPosition,
  toLayoutRecord,
  toSortSettings,
  type MediaView,
  type ShelfConfig,
  type StoredRecord,
} from "@/lib/shelf/model";
import { useSupabase } from "@/lib/supabase/browser";

export type AppData = {
  records: StoredRecord[];
  config: ShelfConfig | null;
  placement: Placement;
  collection: CollectionRow | null;
  /** Local demo only: when its records were fetched from Discogs. */
  fetchedAt: string | null;
};

export type Status =
  | { kind: "loading"; message: string }
  | { kind: "onboarding"; error?: string; username?: string }
  | { kind: "importing"; job: JobRow | null; message: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export type Notice = { tone: "info" | "success" | "warning"; text: string; moves?: Move[] };

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

const replacedNotice = (username: string): Notice => ({
  tone: "success",
  text: `The Discogs collection of "${username}" replaced the previous one. Build your shelf for it.`,
});

function demoRecords(payload: { records: RecordInput[] }): StoredRecord[] {
  return payload.records.map((r) => ({ ...r, id: `d${r.discogs_instance_id}`, origin: "import" as const }));
}

/**
 * True when most records have no compartment and there's room for them, e.g.
 * after switching from the demo to your own collection. A collection that
 * simply doesn't fit never triggers it, so calibrations aren't thrown away.
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
    let group = records.filter((r) => r.media === view.media && current.has(r.id)).map(toLayoutRecord);
    for (const r of sortRecords(view.unplaced.map(toLayoutRecord), settings)) {
      const result = insertRecord({ slots: view.index.slots, records: group, placement: current, settings }, r);
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

export function useShelfApp(startParam: string | null) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const clerk = useClerk();
  const supabase = useSupabase();
  const [data, setData] = useState<AppData | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading your shelf…" });
  const [syncJob, setSyncJob] = useState<JobRow | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef<string | null>(null);
  const alive = useRef(true);
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
      version: 1,
      records: next.records,
      fetchedAt: next.fetchedAt ?? new Date().toISOString(),
      config: next.config ?? demoConfig(),
      placement: [...next.placement],
      events: [...(previous?.events ?? []), ...(event ? [{ ...event, at: new Date().toISOString() }] : [])].slice(-50),
    };
    if (!saveLocal(snapshot)) setNotice({ tone: "warning", text: "This browser couldn't save the demo. It will reset when you leave." });
  }, []);

  const startLocalDemo = useCallback(async () => {
    setStatus({ kind: "loading", message: "Loading the demo collection from Discogs…" });
    try {
      const payload = await api<{ records: RecordInput[]; fetchedAt: string }>("/api/demo");
      const records = demoRecords(payload);
      const config = demoConfig();
      const { byPosition, layout } = computeInitial(records, config);
      const next: AppData = { records, config, placement: byPosition, collection: null, fetchedAt: payload.fetchedAt };
      persistLocal(next, { kind: "initial", movedCount: byPosition.size });
      if (!alive.current) return;
      setData(next);
      setStatus({ kind: "ready" });
      setNotice({
        tone: "success",
        text: `Demo ready: ${layout.groups.vinyl.sortedIds.length} records on "Living room" and ${layout.groups.cd.sortedIds.length} CDs in "Studio", sorted by genre, then artist.`,
      });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load the demo." });
    }
  }, [persistLocal]);

  /** Re-fetches the demo when the browser copy is older than 6 hours, keeping the shelves and calibrations. */
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
        // The user may have calibrated, added, or regenerated while we fetched:
        // merge into what's saved now, not into the snapshot we started from.
        const latest = loadLocal() ?? snapshot;
        const refreshedAdded = new Map(added.map((r) => [r.id, r]));
        const addedNow = latest.records.filter((r) => r.origin === "added").map((r) => refreshedAdded.get(r.id) ?? r);
        const fresh = [...demoRecords(payload), ...addedNow];
        const ids = new Set(fresh.map((r) => r.id));
        const kept = new Map([...new Map(latest.placement)].filter(([id]) => ids.has(id)));
        const placed = placeNewRecords(fresh, latest.config, kept);
        const next: AppData = { records: fresh, config: latest.config, placement: placed.placement, collection: null, fetchedAt: payload.fetchedAt };
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
    const next: AppData = { records: state.records, config: state.config, placement: state.placement, collection: state.collection, fetchedAt: null };
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
        else setStatus({ kind: "importing", job: current, message: "Importing your collection…" });
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
          const { id: localId, origin: _origin, synced_at: _synced, ...input } = r;
          void _origin;
          void _synced;
          const stored = await addRecordRemote(client, userId, input);
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
        setNotice({ tone: "success", text: "Your demo shelf is saved to your account." });
      } else if (!state.config && state.collection?.source === "demo") {
        const config = demoConfig();
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
        setNotice({ tone: "info", text: "Most records were new, so the whole shelf was laid out again with your settings." });
      } else if (state.config) {
        const placed = placeNewRecords(next.records, state.config, next.placement);
        let saved = placed.moves.length > 0;
        if (saved) {
          try {
            await applyPlacementsRemote(client, placed.placement, placed.moves, { kind: "insert", moves: placed.moves, movedCount: placed.moves.length });
          } catch (err) {
            saved = false;
            setNotice({ tone: "warning", text: `Couldn't place the new records: ${err instanceof Error ? err.message : "unknown error"}. Regenerate the map to include them.` });
          }
        }
        if (saved) {
          next = { ...next, placement: placed.placement };
          setNotice({
            tone: "info",
            text: `${placed.placed} new record${placed.placed === 1 ? "" : "s"} placed on your shelf: ${placed.moves.length} move${placed.moves.length === 1 ? "" : "s"}.`,
            moves: placed.moves,
          });
        } else if (placed.skipped > 0) {
          setNotice({ tone: "warning", text: `${placed.skipped} new record${placed.skipped === 1 ? " doesn't" : "s don't"} fit where they belong. Add a shelf or regenerate the map.` });
        }
      }
      if (!alive.current) return;
      setData(next);
      setStatus({ kind: "ready" });
    },
    [reloadRemote, userId],
  );

  /** A replacement failed: nothing changed, so go back to the current collection and say why. */
  const failReplacement = useCallback((username: string, message: string) => {
    setStatus({ kind: "ready" });
    setNotice({ tone: "warning", text: `Couldn't import "${username}": ${message} Your current collection didn't change.` });
  }, []);

  const startRemoteImport = useCallback(
    async (client: SupabaseClient, input: { source: "discogs"; username: string } | { source: "demo" }, background: boolean, replacing = false) => {
      const username = input.source === "discogs" ? input.username : "the demo";
      if (!background) setStatus({ kind: "importing", job: null, message: input.source === "demo" ? "Loading the demo collection…" : "Starting the import…" });
      try {
        const { job } = await api<{ job: JobRow }>("/api/import/start", input);
        if (background) setSyncJob(job);
        const finished = await runJob(client, job, background);
        if (!alive.current || (finished.status !== "done" && finished.status !== "error")) return;
        if (finished.status === "error") {
          if (background) setNotice({ tone: "warning", text: `Couldn't update from Discogs: ${finished.last_error ?? "unknown error"}` });
          else if (replacing) failReplacement(username, finished.last_error ?? "The import failed.");
          else setStatus({ kind: "onboarding", error: finished.last_error ?? "The import failed.", username: input.source === "discogs" ? input.username : undefined });
          return;
        }
        await afterImport(client);
        if (replacing && alive.current) setNotice(replacedNotice(username));
      } catch (err) {
        if (!alive.current) return;
        const message = err instanceof Error ? err.message : "The import failed.";
        if (background) setNotice({ tone: "warning", text: `Couldn't update from Discogs: ${message}` });
        else if (replacing) failReplacement(username, message);
        else setStatus({ kind: "onboarding", error: message, username: input.source === "discogs" ? input.username : undefined });
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
        const snapshot = loadLocal();
        if (snapshot) {
          setData({ records: snapshot.records, config: snapshot.config, placement: new Map(snapshot.placement), collection: null, fetchedAt: snapshot.fetchedAt });
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
          const username = finished.source === "demo" ? "the demo" : finished.discogs_username;
          if (finished.status === "error") {
            if (background) setNotice({ tone: "warning", text: `Couldn't update from Discogs: ${finished.last_error}` });
            else if (replacing) failReplacement(username, finished.last_error ?? "The import failed.");
            else setStatus({ kind: "onboarding", error: finished.last_error ?? "The import failed.", username: finished.discogs_username });
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
          setStatus({ kind: "onboarding", error: state.lastJob.last_error ?? "The last import failed.", username: state.lastJob.discogs_username });
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
        if (alive.current) setStatus({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load your shelf." });
      }
    })();
  }, [mode, userId, supabase, startParam, startLocalDemo, refreshLocalDemo, reloadRemote, startRemoteImport, runJob, afterImport, failReplacement]);

  // ------------------------------------------------------------ actions
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

  const views: MediaView[] = useMemo(() => (data?.config ? buildViews(data.records, data.config, data.placement) : []), [data]);

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
        leftover: layout.groups.vinyl.leftover.length + layout.groups.cd.leftover.length,
        notPlaced: layout.notPlaced.length,
        hasMap,
        slackReduced: layout.groups.vinyl.slackReduced || layout.groups.cd.slackReduced,
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
          text:
            preview.leftover > 0
              ? `Map generated. ${preview.leftover} record${preview.leftover === 1 ? " doesn't" : "s don't"} fit: add a shelf or raise the capacity.`
              : preview.hasMap
                ? `Map updated: ${preview.changed} record${preview.changed === 1 ? "" : "s"} changed compartment.`
                : `Map generated: ${preview.placed} records placed.`,
        });
      } catch (err) {
        setNotice({ tone: "warning", text: err instanceof Error ? err.message : "Couldn't save the map." });
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

  const calibrate = useCallback(
    async (recordId: string, slotId: string) => {
      if (!data?.config) return { ok: false as const, reason: "Generate a map first." };
      const record = data.records.find((r) => r.id === recordId);
      const view = views.find((v) => v.media === record?.media);
      if (!record || !view) return { ok: false as const, reason: "That record isn't on a shelf." };
      const settings = toSortSettings(data.config.settings);
      const group = data.records.filter((r) => r.media === view.media).map(toLayoutRecord);
      const result = calibrateLayout({ slots: view.index.slots, records: group, placement: data.placement, settings }, recordId, slotId);
      if (!result.ok) return result;
      if (result.movedCount > 0) {
        setBusy(true);
        try {
          await applyChange(result.placement, result.moves, { kind: "calibrate", moves: result.moves, movedCount: result.movedCount });
        } finally {
          setBusy(false);
        }
      }
      return result;
    },
    [data, views, applyChange],
  );

  /** "Where does this record go?": the naive insertion, computed without saving. */
  const previewInsert = useCallback(
    (input: RecordInput): InsertPreview | null => {
      if (!data?.config) return null;
      const record: StoredRecord = { ...input, id: `new-${input.discogs_release_id}`, origin: "added" };
      const view = views.find((v) => v.media === input.media);
      if (!view || view.index.slots.length === 0) {
        return { record, media: null, target: null, moves: [], movedCount: 0, overflow: [], placement: data.placement };
      }
      const settings = toSortSettings(data.config.settings);
      const group = data.records.filter((r) => r.media === view.media && data.placement.has(r.id)).map(toLayoutRecord);
      const result = insertRecord({ slots: view.index.slots, records: group, placement: data.placement, settings }, toLayoutRecord(record));
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
        const view = views.find((v) => v.media === stored.media);
        if (!view || view.index.slots.length === 0) {
          setData({ ...data, records: [...data.records, stored] });
          return { stored, preview: null };
        }
        const settings = toSortSettings(data.config.settings);
        const group = data.records.filter((r) => r.media === view.media && data.placement.has(r.id)).map(toLayoutRecord);
        const result = insertRecord({ slots: view.index.slots, records: group, placement: data.placement, settings }, toLayoutRecord(stored));
        try {
          await applyChange(result.placement, result.moves, { kind: "insert", moves: result.moves, movedCount: result.movedCount }, [stored]);
        } catch (err) {
          if (mode === "remote" && supabase) await supabase.from("records").delete().eq("id", stored.id);
          throw err;
        }
        setNotice({
          tone: "success",
          text: `Added. ${result.movedCount === 1 ? "1 move: just put it in." : `${result.movedCount} moves.`}`,
          moves: result.moves,
        });
        return { stored, preview: result };
      } catch (err) {
        setNotice({ tone: "warning", text: err instanceof Error ? err.message : "Couldn't add the record." });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [data, mode, supabase, userId, views, applyChange],
  );

  const resetLocal = useCallback(() => {
    clearLocal();
    setData(null);
    setStatus({ kind: "onboarding" });
  }, []);

  return {
    mode,
    status,
    data,
    views,
    syncJob,
    notice,
    busy,
    pendingImport: typeof window === "undefined" ? null : peekPendingImport(),
    dismissNotice: () => setNotice(null),
    startDemo,
    importDiscogs,
    previewMap,
    generateMap,
    calibrate,
    previewInsert,
    addRecord,
    resetLocal,
  };
}

export type ShelfApp = ReturnType<typeof useShelfApp>;

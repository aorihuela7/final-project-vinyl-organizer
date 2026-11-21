/**
 * Server-side Discogs client. Uses the app's personal token (never sent to the
 * browser), a unique User-Agent, reads X-Discogs-Ratelimit-Remaining, backs
 * off exponentially on 429 and 5xx for imports, and splits the shared budget
 * between imports and interactive calls.
 */
import type { DiscogsCollectionPage, DiscogsRelease, DiscogsSearchResult } from "./types";

if (typeof window !== "undefined") {
  throw new Error("The Discogs client must only run on the server.");
}

const BASE = "https://api.discogs.com";
const MAX_RETRIES = 3;

/**
 * The whole app shares one token: 60 requests in a moving minute. Two
 * thresholds split it between imports and what visitors ask for:
 * - imports slow down when fewer than IMPORT_PACE are left, so searches,
 *   releases, and tracklists keep working while someone imports;
 * - those interactive calls, which anyone can make without an account, wait
 *   or stop when fewer than INTERACTIVE_FLOOR are left, so they can't starve imports.
 */
export const IMPORT_PACE = 30;
export const INTERACTIVE_FLOOR = 10;
/** Discogs counts requests in a moving one-minute window, so it refills at most one request a second. */
const REFILL_PER_MS = 60 / 60_000;
/** How long an interactive call may wait for the budget before giving up. */
const MAX_INTERACTIVE_WAIT_MS = 5000;

/** The last X-Discogs-Ratelimit-Remaining this server instance saw, and when. */
let lastRemaining: { value: number; at: number } | null = null;

/** For tests. */
export function resetDiscogsBudget() {
  lastRemaining = null;
}

/**
 * How long an interactive call should wait for the budget to reach the floor:
 * the last reading plus what has refilled since (an estimate; if it's too
 * hopeful, Discogs answers 429 and the reading drops to zero).
 */
export function interactiveWaitMs(now = Date.now()): number {
  if (!lastRemaining) return 0;
  const estimate = lastRemaining.value + (now - lastRemaining.at) * REFILL_PER_MS;
  return estimate >= INTERACTIVE_FLOOR ? 0 : Math.ceil((INTERACTIVE_FLOOR - estimate) / REFILL_PER_MS);
}

/**
 * "import": collection pages and the refresh at the end of a sync; retried with
 * exponential backoff on 429 and 5xx. "interactive": requests a visitor makes
 * (search, a release, a tracklist); they wait up to 5 s while the budget is
 * below INTERACTIVE_FLOOR, are refused if it would take longer, and are never
 * retried, so a burst of them doesn't keep the window full.
 */
export type DiscogsCall = "import" | "interactive";

export class DiscogsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "DiscogsError";
  }
}

export type DiscogsResponse<T> = { data: T; remaining: number | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function discogsGet<T>(path: string, kind: DiscogsCall = "import"): Promise<DiscogsResponse<T>> {
  const token = process.env.DISCOGS_TOKEN;
  const userAgent = process.env.DISCOGS_USER_AGENT;
  if (!token || !userAgent) throw new DiscogsError("Discogs isn't configured on the server.", 500);

  if (kind === "interactive") {
    // Wait a moment for the budget if it's nearly gone; refuse if that would take long.
    const wait = interactiveWaitMs();
    if (wait > MAX_INTERACTIVE_WAIT_MS) throw new DiscogsError("Discogs is busy right now.", 429, wait);
    if (wait > 0) await sleep(wait);
  }
  const maxRetries = kind === "interactive" ? 0 : MAX_RETRIES;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "User-Agent": userAgent,
        Authorization: `Discogs token=${token}`,
        Accept: "application/vnd.discogs.v2.discogs+json",
      },
      cache: "no-store",
    });
    const remainingHeader = res.headers.get("x-discogs-ratelimit-remaining");
    const remaining = remainingHeader === null || !Number.isFinite(Number(remainingHeader)) ? null : Number(remainingHeader);
    if (remaining !== null) lastRemaining = { value: remaining, at: Date.now() };
    else if (res.status === 429) lastRemaining = { value: 0, at: Date.now() };

    if (res.status === 429 || res.status >= 500) {
      const wait = 1000 * 2 ** attempt;
      if (attempt >= maxRetries) {
        throw new DiscogsError(
          res.status === 429 ? "Discogs is busy right now." : "Discogs isn't responding.",
          res.status,
          wait * 2,
        );
      }
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      let message = `Discogs returned ${res.status}.`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // keep the generic message
      }
      throw new DiscogsError(message, res.status);
    }

    return { data: (await res.json()) as T, remaining };
  }
}

export function getCollectionPage(
  username: string,
  page: number,
  sort = "added",
  sortOrder: "asc" | "desc" = "asc",
): Promise<DiscogsResponse<DiscogsCollectionPage>> {
  const q = new URLSearchParams({ page: String(page), per_page: "100", sort, sort_order: sortOrder });
  return discogsGet<DiscogsCollectionPage>(`/users/${encodeURIComponent(username)}/collection/folders/0/releases?${q}`);
}

export function searchReleases(query: string): Promise<DiscogsResponse<{ results: DiscogsSearchResult[] }>> {
  const q = new URLSearchParams({ q: query, type: "release", per_page: "12" });
  return discogsGet<{ results: DiscogsSearchResult[] }>(`/database/search?${q}`, "interactive");
}

export function getRelease(releaseId: number, kind: DiscogsCall = "interactive"): Promise<DiscogsResponse<DiscogsRelease>> {
  return discogsGet<DiscogsRelease>(`/releases/${releaseId}`, kind);
}

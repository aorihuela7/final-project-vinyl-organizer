/**
 * Server-side Discogs client. Uses the app's personal token (never sent to the
 * browser), a unique User-Agent, reads X-Discogs-Ratelimit-Remaining, and backs
 * off exponentially on 429 and 5xx.
 */
import type { DiscogsCollectionPage, DiscogsRelease, DiscogsSearchResult } from "./types";

if (typeof window !== "undefined") {
  throw new Error("The Discogs client must only run on the server.");
}

const BASE = "https://api.discogs.com";
const MAX_RETRIES = 3;

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

export async function discogsGet<T>(path: string): Promise<DiscogsResponse<T>> {
  const token = process.env.DISCOGS_TOKEN;
  const userAgent = process.env.DISCOGS_USER_AGENT;
  if (!token || !userAgent) throw new DiscogsError("Discogs isn't configured on the server.", 500);

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
    const remaining = remainingHeader === null ? null : Number(remainingHeader);

    if (res.status === 429 || res.status >= 500) {
      const wait = 1000 * 2 ** attempt;
      if (attempt >= MAX_RETRIES) {
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
  return discogsGet<{ results: DiscogsSearchResult[] }>(`/database/search?${q}`);
}

export function getRelease(releaseId: number): Promise<DiscogsResponse<DiscogsRelease>> {
  return discogsGet<DiscogsRelease>(`/releases/${releaseId}`);
}

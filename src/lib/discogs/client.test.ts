import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscogsError, INTERACTIVE_FLOOR, getCollectionPage, getRelease, interactiveWaitMs, resetDiscogsBudget, searchReleases } from "./client";

function reply(status: number, remaining: number | null, body: unknown = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (remaining !== null) headers.set("x-discogs-ratelimit-remaining", String(remaining));
  return new Response(JSON.stringify(body), { status, headers });
}

describe("Discogs budget shared by the whole app", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDiscogsBudget();
    vi.stubEnv("DISCOGS_TOKEN", "test-token");
    vi.stubEnv("DISCOGS_USER_AGENT", "RecordOrganizerTest/1.0");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("lets searches, releases, and tracklists straight through while the budget is above the floor", async () => {
    fetchMock.mockImplementation(async () => reply(200, INTERACTIVE_FLOOR, { results: [] }));
    await searchReleases("a");
    await searchReleases("b");
    expect(interactiveWaitMs()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes an interactive call wait a moment when the budget is just under the floor", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, INTERACTIVE_FLOOR - 2, { results: [] }));
    await searchReleases("a");
    expect(interactiveWaitMs()).toBe(2000);
    fetchMock.mockResolvedValueOnce(reply(200, INTERACTIVE_FLOOR, { results: [] }));
    const waiting = searchReleases("b");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses interactive calls without calling Discogs when the budget is gone, so they can't starve imports", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, 0, { results: [] }));
    await searchReleases("a");
    await expect(searchReleases("b")).rejects.toMatchObject({ status: 429 });
    await expect(getRelease(1)).rejects.toBeInstanceOf(DiscogsError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Ten seconds later the window has room again (one request a second).
    vi.advanceTimersByTime(10_000);
    expect(interactiveWaitMs()).toBe(0);
  });

  it("keeps importing when the budget is low", async () => {
    fetchMock.mockImplementation(async () => reply(200, 0, { pagination: {}, releases: [] }));
    await getCollectionPage("aorihuelar", 1);
    await getCollectionPage("aorihuelar", 2);
    await getRelease(1, "import");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry an interactive 429, so a burst doesn't keep the window full", async () => {
    fetchMock.mockImplementation(async () => reply(429, null));
    await expect(searchReleases("a")).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // And the next interactive call is refused locally.
    await expect(getRelease(5)).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries an import's 429 with backoff", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, 0)).mockResolvedValueOnce(reply(200, 40, { pagination: {}, releases: [] }));
    const page = getCollectionPage("aorihuelar", 1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(page).resolves.toMatchObject({ remaining: 40 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from "vitest";
import { ZERO_START } from "@/lib/config";
import type { DiscogsCollectionItem, DiscogsCollectionPage } from "@/lib/discogs/types";
import { readPage } from "./service";

const item = (id: number) => ({ id, instance_id: id }) as unknown as DiscogsCollectionItem;
const page = (items: number, pages: number, releases = [item(1), item(2)]): DiscogsCollectionPage => ({
  pagination: { page: 1, pages, per_page: 100, items },
  releases,
});

describe("readPage", () => {
  it("saves what Discogs returns, with its totals", () => {
    const read = readPage({ source: "discogs", discogs_username: "someone", max_pages: null }, page(1234, 13));
    expect(read.items).toHaveLength(2);
    expect(read).toMatchObject({ totalPages: 13, itemsTotal: 1234 });
  });

  it("caps the demo at its page limit", () => {
    expect(readPage({ source: "demo", discogs_username: "aorihuelar", max_pages: 10 }, page(1725, 18))).toMatchObject({ totalPages: 10, itemsTotal: 1000 });
  });

  it("keeps a collection started from scratch empty, even if that Discogs collection gains records", () => {
    for (const username of [ZERO_START.username, ZERO_START.username.toUpperCase()]) {
      expect(readPage({ source: "discogs", discogs_username: username, max_pages: null }, page(2, 1))).toEqual({ items: [], totalPages: 1, itemsTotal: 0 });
    }
    expect(readPage({ source: "discogs", discogs_username: ZERO_START.username, max_pages: null }, page(0, 0, []))).toEqual({ items: [], totalPages: 1, itemsTotal: 0 });
  });
});

import { describe, expect, it } from "vitest";
import { buildViews, computeInitial, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { migrateV1 } from "./local";

function record(i: number, descriptions: string[], media: StoredRecord["media"] = "vinyl"): StoredRecord {
  return {
    id: `d${i}`,
    origin: "import",
    discogs_release_id: i,
    discogs_instance_id: i,
    artist: `Artist ${String(i).padStart(3, "0")}`,
    title: `Title ${i}`,
    year: 1970,
    label: null,
    genre: "Rock",
    styles: [],
    format_name: media === "cd" ? "CD" : "Vinyl",
    format_qty: 1,
    format_descriptions: descriptions,
    media,
    cover_url: null,
    thumb_url: null,
    discogs_url: `https://www.discogs.com/release/${i}`,
    date_added: null,
  };
}

describe("migrating the browser demo from v1", () => {
  // A v1 demo: every vinyl record (LPs and 7″ singles mixed) on one vinyl shelf.
  const records = Array.from({ length: 60 }, (_, i) => record(i, i % 4 === 0 ? ['7"', "Single"] : ["LP", "Album"]));
  const v1Config = {
    furniture: [
      {
        key: "shelf-1",
        name: "Living room",
        template: "kallax_4x4" as const,
        media: "vinyl",
        rows: 2,
        cols: 2,
        traversal: "rows" as const,
        defaultCapacity: 20,
        sortIndex: 0,
        compartments: [0, 1].flatMap((row) => [0, 1].map((col) => ({ row, col, status: "available" as const, capacity: null }))),
      },
    ],
    settings: { sortLevels: ["artist" as const], ignoreArticles: false, slackPct: 10 },
  };
  // v1 laid out every vinyl record together; simulate that by treating all as LPs.
  const asLp = records.map((r) => ({ ...r, format_group: "lp" as const }));
  const v1Placement = computeInitial(asLp, { ...v1Config, furniture: v1Config.furniture.map((f) => ({ ...f, media: "lp" as const })) } as ShelfConfig).byPosition;

  const { snapshot, migration } = migrateV1({
    version: 1,
    records,
    fetchedAt: new Date().toISOString(),
    config: v1Config,
    placement: [...v1Placement],
    events: [],
  });
  const placement = new Map(snapshot.placement);

  it("turns vinyl shelves into LP shelves and adds a Singles box", () => {
    expect(snapshot.version).toBe(2);
    expect(snapshot.config.furniture.map((f) => f.media)).toEqual(["lp", "single"]);
    expect(migration).toEqual({ singlesMoved: 15, singlesBoxAdded: true });
  });

  it("doesn't move any LP", () => {
    for (const r of records.filter((_, i) => i % 4 !== 0)) expect(placement.get(r.id)).toBe(v1Placement.get(r.id));
  });

  it("puts every single in the Singles box and none on the LP shelf", () => {
    const views = buildViews(snapshot.records, snapshot.config, placement);
    const singles = views.find((v) => v.media === "single")!;
    const lps = views.find((v) => v.media === "lp")!;
    expect(singles.index.sorted).toHaveLength(15);
    expect(singles.unplaced).toHaveLength(0);
    expect(lps.index.sorted.every((r) => r.media === "lp")).toBe(true);
    expect(snapshot.events.at(-1)).toMatchObject({ kind: "format_split", movedCount: 15 });
  });
});

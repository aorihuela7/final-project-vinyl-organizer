/**
 * Purchase simulator on a real collection: naive insertion (v1) vs minimum moves (v2).
 *
 * Reads a public Discogs collection with the app's token, suggests shelves for
 * it as the app does (room for the collection plus about 20%: cubes for LPs, a
 * record box or cubes for singles, cubes for CDs), holds out 100 records as
 * purchases, lays out the rest, and
 * replays the purchases with both methods. Prints a Markdown table.
 *
 * Run: npx tsx --env-file=.env.local scripts/simulate.ts [username]
 */
import { getCollectionPage } from "../src/lib/discogs/client";
import { mapCollectionItem } from "../src/lib/discogs/map";
import { simulatePurchases } from "../src/lib/layout/simulate";
import type { SortSettings } from "../src/lib/layout/types";
import { suggestedConfig, toLayoutRecord, toShelfSpecs, type StoredRecord } from "../src/lib/shelf/model";

async function main() {
  const username = process.argv[2] ?? "aorihuelar";
  const records: StoredRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await getCollectionPage(username, page, "added", "asc");
    records.push(...data.releases.map((item) => ({ ...mapCollectionItem(item), id: `i${item.instance_id}`, origin: "import" as const })));
    if (page >= data.pagination.pages) break;
  }
  const layoutRecords = records.map(toLayoutRecord);
  const shelves = toShelfSpecs(suggestedConfig(records).furniture);
  const counts = { lp: 0, single: 0, cd: 0, other: 0 };
  for (const r of layoutRecords) counts[r.media]++;

  console.log(`Collection of ${username}: ${records.length} records (${counts.lp} LPs, ${counts.single} singles, ${counts.cd} CDs, ${counts.other} other).`);
  console.log(`Shelves: ${shelves.map((s) => `${s.name} (${s.media}, ${s.rows}×${s.cols}, ${s.defaultCapacity} per compartment)`).join("; ")}.\n`);

  const sorts: Array<[string, SortSettings]> = [
    ["artist", { levels: ["artist"], ignoreArticles: false }],
    ["genre → artist", { levels: ["genre", "artist"], ignoreArticles: false }],
  ];
  const seeds = Array.from({ length: 10 }, (_, i) => 1000 + i);
  console.log("| Sort order | Shelves | Naive: records moved | Minimum: records moved | Naive: moves | Minimum: moves | Naive worst | Minimum worst |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  const scenarios: Array<[string, number | undefined]> = [
    ["suggested, 10% free space", undefined],
    ["90% full after", 0.9],
    ["95% full after", 0.95],
    ["98% full after", 0.98],
    ["100% full after", 1],
  ];
  for (const [name, settings] of sorts) {
    for (const [label, fill] of scenarios) {
      const runs = seeds.map((seed) => simulatePurchases(layoutRecords, shelves, settings, { purchases: 100, seed, slackPct: 10, fill }));
      const avg = (f: (r: (typeof runs)[number]) => number) => (runs.reduce((a, r) => a + f(r), 0) / runs.length).toFixed(1);
      const max = (f: (r: (typeof runs)[number]) => number) => Math.max(...runs.map(f));
      console.log(
        `| ${name} | ${label} | ${avg((r) => r.naive.recordsMoved)} | ${avg((r) => r.minimum.recordsMoved)} | ${avg((r) => r.naive.moves)} | ${avg((r) => r.minimum.moves)} | ${max((r) => r.naive.worst)} | ${max((r) => r.minimum.worst)} |`,
      );
    }
  }
  console.log(`\nAverages over ${seeds.length} seeds of 100 purchases each; "moves" includes putting each new record on the shelf.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

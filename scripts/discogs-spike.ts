/**
 * Discogs spike (Phase 1).
 *
 * Run: npx tsx --env-file=.env.local scripts/discogs-spike.ts [username]
 *
 * Fetches the public collection of a user, prints counts, three sample
 * records, the rate-limit headers, one database search, and compares the
 * same call without a token. It scans every page to count edge cases.
 * It never prints the token.
 */

const username = process.argv[2] ?? "aorihuelar";
const token = process.env.DISCOGS_TOKEN;
const userAgent = process.env.DISCOGS_USER_AGENT;

if (!token || !userAgent) {
  console.error("DISCOGS_TOKEN and DISCOGS_USER_AGENT must be set (load them with --env-file=.env.local).");
  process.exit(1);
}

const BASE = "https://api.discogs.com";

type Artist = { name: string; anv?: string; join?: string; id: number };
type Label = { name: string; catno?: string };
type Format = { name: string; qty: string; descriptions?: string[]; text?: string };
type BasicInformation = {
  id: number;
  title: string;
  year: number;
  artists: Artist[];
  labels: Label[];
  genres?: string[];
  styles?: string[];
  formats: Format[];
  cover_image: string;
  thumb: string;
};
type CollectionItem = {
  id: number;
  instance_id: number;
  date_added: string;
  folder_id: number;
  basic_information: BasicInformation;
};
type CollectionPage = {
  pagination: { page: number; pages: number; per_page: number; items: number };
  releases: CollectionItem[];
};

function rateHeaders(res: Response) {
  return {
    status: res.status,
    limit: res.headers.get("x-discogs-ratelimit"),
    used: res.headers.get("x-discogs-ratelimit-used"),
    remaining: res.headers.get("x-discogs-ratelimit-remaining"),
  };
}

async function get(path: string, withToken: boolean): Promise<Response> {
  const headers: Record<string, string> = { "User-Agent": userAgent! };
  if (withToken) headers.Authorization = `Discogs token=${token}`;
  return fetch(`${BASE}${path}`, { headers });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function collectionPath(page: number, sort = "added", order = "asc") {
  return `/users/${encodeURIComponent(username)}/collection/folders/0/releases?page=${page}&per_page=100&sort=${sort}&sort_order=${order}`;
}

async function main() {
  console.log(`== Collection of ${username}, page 1, with token ==`);
  const res1 = await get(collectionPath(1), true);
  console.log("rate limit headers:", rateHeaders(res1));
  if (!res1.ok) {
    console.error("Request failed:", res1.status, await res1.text());
    process.exit(1);
  }
  const page1 = (await res1.json()) as CollectionPage;
  console.log("pagination:", page1.pagination);

  console.log("\n== Three sample records ==");
  for (const item of page1.releases.slice(0, 3)) {
    const b = item.basic_information;
    console.log({
      release_id: b.id,
      instance_id: item.instance_id,
      date_added: item.date_added,
      artists: b.artists.map((a) => ({ name: a.name, anv: a.anv, join: a.join })),
      title: b.title,
      year: b.year,
      labels: b.labels.map((l) => l.name),
      genres: b.genres,
      styles: b.styles,
      formats: b.formats,
      cover_image: b.cover_image,
      thumb: b.thumb,
    });
  }

  console.log("\n== Same call without a token ==");
  const resNoToken = await get(collectionPath(1), false);
  console.log("rate limit headers:", rateHeaders(resNoToken));
  if (resNoToken.ok) {
    const p = (await resNoToken.json()) as CollectionPage;
    const b = p.releases[0]?.basic_information;
    console.log("pagination:", p.pagination);
    console.log("first record cover_image without token:", b?.cover_image || "(empty)");
  }

  console.log("\n== Do cover URLs load without auth? ==");
  const sampleCover = page1.releases.map((r) => r.basic_information.cover_image).find((u) => u && !u.includes("spacer"));
  if (sampleCover) {
    const img = await fetch(sampleCover, { headers: { "User-Agent": userAgent! } });
    console.log("cover GET status:", img.status, "content-type:", img.headers.get("content-type"));
  }

  console.log("\n== One database search ==");
  const resSearch = await get(`/database/search?q=${encodeURIComponent("Kind of Blue Miles Davis")}&type=release&per_page=3`, true);
  console.log("rate limit headers:", rateHeaders(resSearch));
  if (resSearch.ok) {
    const s = (await resSearch.json()) as { pagination: unknown; results: Array<Record<string, unknown>> };
    console.log("pagination:", s.pagination);
    for (const r of s.results) {
      console.log({ id: r.id, title: r.title, year: r.year, format: r.format, genre: r.genre, label: (r.label as string[] | undefined)?.slice(0, 2), cover_image: r.cover_image });
    }
  }

  console.log("\n== Full scan for edge cases ==");
  const all: CollectionItem[] = [...page1.releases];
  for (let page = 2; page <= page1.pagination.pages; page++) {
    const res = await get(collectionPath(page), true);
    const rl = rateHeaders(res);
    if (res.status === 429) {
      console.log(`page ${page}: 429, backing off`);
      await sleep(5000);
      page--;
      continue;
    }
    if (!res.ok) throw new Error(`page ${page}: ${res.status}`);
    const p = (await res.json()) as CollectionPage;
    all.push(...p.releases);
    if (Number(rl.remaining) < 5) await sleep(3000);
  }
  console.log("items scanned:", all.length, "reported:", page1.pagination.items);

  const suffix = /\s\(\d+\)$/;
  const stats = {
    artistSuffix: all.filter((i) => i.basic_information.artists.some((a) => suffix.test(a.name))),
    multipleArtists: all.filter((i) => i.basic_information.artists.length > 1),
    noGenre: all.filter((i) => !i.basic_information.genres?.length),
    noCover: all.filter((i) => !i.basic_information.cover_image || i.basic_information.cover_image.includes("spacer")),
    noYear: all.filter((i) => !i.basic_information.year),
    multipleFormats: all.filter((i) => i.basic_information.formats.length > 1),
    variousArtists: all.filter((i) => i.basic_information.artists.some((a) => a.name === "Various")),
    leadingArticle: all.filter((i) => /^(The|A|An|El|La|Los|Las|Le|Les)\s/i.test(i.basic_information.artists[0]?.name ?? "")),
  };
  const instanceIds = new Set(all.map((i) => i.instance_id));
  const releaseIds = new Map<number, number>();
  for (const i of all) releaseIds.set(i.basic_information.id, (releaseIds.get(i.basic_information.id) ?? 0) + 1);
  const duplicates = [...releaseIds.values()].filter((n) => n > 1).length;

  const formatNames = new Map<string, number>();
  for (const i of all) {
    const name = i.basic_information.formats[0]?.name ?? "(none)";
    formatNames.set(name, (formatNames.get(name) ?? 0) + 1);
  }
  const genres = new Map<string, number>();
  for (const i of all) {
    const g = i.basic_information.genres?.[0] ?? "(none)";
    genres.set(g, (genres.get(g) ?? 0) + 1);
  }
  const sizes = new Map<string, number>();
  for (const i of all) {
    const d = i.basic_information.formats[0]?.descriptions ?? [];
    const size = d.find((x) => /"$/.test(x)) ?? "(no size)";
    sizes.set(size, (sizes.get(size) ?? 0) + 1);
  }

  for (const [k, v] of Object.entries(stats)) {
    console.log(`${k}: ${v.length}`, v.slice(0, 3).map((i) => `${i.basic_information.artists.map((a) => a.name + (a.join ? ` ${a.join}` : "")).join(" ")} - ${i.basic_information.title}`));
  }
  console.log("unique instance_ids:", instanceIds.size, "releases owned more than once:", duplicates);
  console.log("first format name:", Object.fromEntries([...formatNames].sort((a, b) => b[1] - a[1])));
  console.log("format_qty > 1:", all.filter((i) => Number(i.basic_information.formats[0]?.qty) > 1).length);
  console.log("sizes (first format):", Object.fromEntries([...sizes].sort((a, b) => b[1] - a[1])));
  console.log("primary genre:", Object.fromEntries([...genres].sort((a, b) => b[1] - a[1])));
  console.log("date_added range:", all.map((i) => i.date_added).sort()[0], "→", all.map((i) => i.date_added).sort().at(-1));
  console.log("cover hosts:", [...new Set(all.map((i) => { try { return new URL(i.basic_information.cover_image).host; } catch { return "(invalid)"; } }))]);
  console.log("max title length:", Math.max(...all.map((i) => i.basic_information.title.length)));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

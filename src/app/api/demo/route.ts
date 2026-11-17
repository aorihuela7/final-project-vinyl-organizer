import { connection } from "next/server";
import { cacheLife } from "next/cache";
import { DEMO } from "@/lib/config";
import { getCollectionPage } from "@/lib/discogs/client";
import { mapCollectionItem, type RecordInput } from "@/lib/discogs/map";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * The demo collection for visitors without an account: the newest 1,000
 * records of a public Discogs collection. Cached on the server for at most two
 * hours so a busy demo doesn't drain the shared Discogs rate limit; the browser
 * refetches when its copy is older than six hours.
 */
async function getDemoRecords(): Promise<{ records: RecordInput[]; fetchedAt: string }> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 7200 });

  const records: RecordInput[] = [];
  for (let page = 1; page <= DEMO.maxPages; page++) {
    const { data } = await getCollectionPage(DEMO.username, page, DEMO.sort, DEMO.sortOrder);
    records.push(...data.releases.map(mapCollectionItem));
    if (page >= data.pagination.pages) break;
  }
  return { records, fetchedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  await connection();
  const limit = rateLimit(`demo:${clientKey(null, request)}`, 20, 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests. Wait a minute." }, { status: 429 });
  try {
    return Response.json(await getDemoRecords());
  } catch {
    return Response.json({ error: "Couldn't load the demo collection from Discogs. Try again in a minute." }, { status: 502 });
  }
}

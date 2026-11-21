import { connection } from "next/server";
import { cacheLife } from "next/cache";
import { SAMPLE_COLLECTIONS, type SampleCollection } from "@/lib/config";
import { DiscogsError, getCollectionCount } from "@/lib/discogs/client";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export type SampleCount = { username: SampleCollection; count: number };

/**
 * How many records each sample collection has, for the list under the username
 * field. Cached on the server for at most two hours (five Discogs requests per
 * refresh), well inside the 6-hour rule. A collection that is no longer public,
 * or no longer exists, is left out.
 */
async function getSampleCounts(): Promise<SampleCount[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 7200 });

  const counts = await Promise.all(
    SAMPLE_COLLECTIONS.map(async (username): Promise<SampleCount | null> => {
      try {
        return { username, count: await getCollectionCount(username) };
      } catch (err) {
        if (err instanceof DiscogsError && (err.status === 403 || err.status === 404 || err.status === 401)) return null;
        // Anything else (Discogs busy or down) isn't cached: the next request tries again.
        throw err;
      }
    }),
  );
  return counts.filter((c): c is SampleCount => c !== null);
}

export async function GET(request: Request) {
  await connection();
  const limit = rateLimit(`samples:${clientKey(null, request)}`, 20, 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests. Wait a minute." }, { status: 429 });
  try {
    return Response.json({ samples: await getSampleCounts() });
  } catch {
    return Response.json({ error: "Couldn't reach Discogs. Try again in a minute." }, { status: 502 });
  }
}

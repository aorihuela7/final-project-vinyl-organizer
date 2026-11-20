import { connection } from "next/server";
import { cacheLife } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { DiscogsError, getRelease } from "@/lib/discogs/client";
import { parseTracklist, type TracklistSection } from "@/lib/discogs/tracklist";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const idSchema = z.coerce.number().int().positive().max(1e10);

/**
 * A release's tracklist, fetched on demand and never stored in the database.
 * Cached on the server for at most six hours, as the Discogs terms require
 * (data no older than six hours); errors aren't cached.
 */
async function getTracklist(id: number): Promise<TracklistSection[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 6 * 3600 });
  const { data } = await getRelease(id);
  return parseTracklist(data.tracklist);
}

/** GET /api/discogs/release/{id}: only the fields the record detail needs. Works without an account (the demo). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { userId } = await auth();
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return Response.json({ error: "Invalid release id." }, { status: 400 });

  const limit = rateLimit(`tracklist:${clientKey(userId, request)}`, userId ? 30 : 15, 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests. Wait a few seconds." }, { status: 429 });

  try {
    return Response.json({ tracklist: await getTracklist(parsed.data) });
  } catch (err) {
    if (err instanceof DiscogsError && err.status === 404) return Response.json({ error: "That release doesn't exist on Discogs." }, { status: 404 });
    return Response.json({ error: "Discogs isn't available right now." }, { status: 502 });
  }
}

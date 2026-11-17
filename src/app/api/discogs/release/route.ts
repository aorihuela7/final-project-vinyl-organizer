import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { DiscogsError, getRelease } from "@/lib/discogs/client";
import { mapRelease } from "@/lib/discogs/map";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const idSchema = z.coerce.number().int().positive().max(1e10);

/** One release from Discogs, with full artist, format, and cover data, before adding it. */
export async function GET(request: Request) {
  const { userId } = await auth();
  const parsed = idSchema.safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return Response.json({ error: "Invalid release id." }, { status: 400 });

  const limit = rateLimit(`release:${clientKey(userId, request)}`, userId ? 30 : 15, 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests. Wait a few seconds." }, { status: 429 });

  try {
    const { data } = await getRelease(parsed.data);
    return Response.json({ record: mapRelease(data) });
  } catch (err) {
    if (err instanceof DiscogsError && err.status === 404) return Response.json({ error: "That release doesn't exist on Discogs." }, { status: 404 });
    return Response.json({ error: "Discogs isn't available right now. Try again in a minute." }, { status: 502 });
  }
}

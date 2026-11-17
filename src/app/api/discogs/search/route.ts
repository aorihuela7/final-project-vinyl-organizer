import { auth } from "@clerk/nextjs/server";
import { DiscogsError, searchReleases } from "@/lib/discogs/client";
import { mapSearchResult } from "@/lib/discogs/map";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { searchQuerySchema } from "@/lib/validation";

/** Discogs database search for "Where does this record go?". Rate-limited per user (or per IP without an account). */
export async function GET(request: Request) {
  const { userId } = await auth();
  const parsed = searchQuerySchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid search." }, { status: 400 });

  const limit = rateLimit(`search:${clientKey(userId, request)}`, userId ? 30 : 15, 60_000);
  if (!limit.ok) {
    return Response.json({ error: "Too many searches. Wait a few seconds." }, { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } });
  }

  try {
    const { data } = await searchReleases(parsed.data.q);
    const results = data.results.filter((r) => !r.type || r.type === "release").map((r) => ({ ...mapSearchResult(r) }));
    return Response.json({ results });
  } catch (err) {
    const status = err instanceof DiscogsError && err.status === 429 ? 503 : 502;
    return Response.json({ error: "Discogs search isn't available right now. Try again in a minute." }, { status });
  }
}

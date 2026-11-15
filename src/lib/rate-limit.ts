/**
 * A small in-memory sliding-window limiter for the routes that call Discogs.
 * It's per server instance (good enough for a class project on free tiers);
 * Discogs' own X-Discogs-Ratelimit-Remaining is the global safety net.
 */
const windows = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    windows.set(key, hits);
    return { ok: false, retryAfterMs: windowMs - (now - hits[0]!) };
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 5000) {
    for (const [k, v] of windows) if (v.every((t) => now - t >= windowMs)) windows.delete(k);
  }
  return { ok: true, retryAfterMs: 0 };
}

/** The signed-in user id, or the client IP for visitors without an account. */
export function clientKey(userId: string | null, request: Request): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwarded || request.headers.get("x-real-ip") || "unknown"}`;
}

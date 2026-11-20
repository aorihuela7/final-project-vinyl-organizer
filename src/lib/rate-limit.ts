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

/**
 * The key a client is limited by. IPv6 addresses count by their /64 network:
 * one connection usually gets a whole /64, so counting single addresses would
 * let one visitor rotate through billions of them.
 */
export function ipKey(ip: string): string {
  const address = ip.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!address.includes(":")) return address;
  const last = address.slice(address.lastIndexOf(":") + 1);
  if (last.includes(".")) return last; // IPv4-mapped (::ffff:1.2.3.4)
  const [head, tail] = address.includes("::") ? address.split("::") : [address, undefined];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(":")}::/64`;
}

/** The signed-in user id, or the client's network for visitors without an account. */
export function clientKey(userId: string | null, request: Request): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip");
  return `ip:${ip ? ipKey(ip) : "unknown"}`;
}

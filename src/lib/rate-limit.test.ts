import { describe, expect, it } from "vitest";
import { clientKey, ipKey, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit in the window, then refuses", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const fourth = rateLimit(key, 3, 60_000);
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("keys by user when signed in and by IP otherwise", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKey("user_1", req)).toBe("user:user_1");
    expect(clientKey(null, req)).toBe("ip:1.2.3.4");
  });

  it("counts IPv6 visitors by their /64 network, so rotating addresses doesn't help", () => {
    const a = new Request("http://x", { headers: { "x-forwarded-for": "2001:db8:abcd:12:1111:2222:3333:4444" } });
    const b = new Request("http://x", { headers: { "x-forwarded-for": "2001:0db8:abcd:0012::9" } });
    const other = new Request("http://x", { headers: { "x-forwarded-for": "2001:db8:abcd:13::1" } });
    expect(clientKey(null, a)).toBe("ip:2001:db8:abcd:12::/64");
    expect(clientKey(null, b)).toBe(clientKey(null, a));
    expect(clientKey(null, other)).not.toBe(clientKey(null, a));
  });

  it("reads compressed, bracketed, zoned, and IPv4-mapped addresses", () => {
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
    expect(ipKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(ipKey("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
  });
});

import { describe, expect, it } from "vitest";
import { clientKey, rateLimit } from "./rate-limit";

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
});

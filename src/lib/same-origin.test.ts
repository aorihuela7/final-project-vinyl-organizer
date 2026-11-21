import { describe, expect, it } from "vitest";
import { refuseCrossSite } from "./same-origin";

const post = (headers: Record<string, string>) => new Request("https://app.example/api/import/start", { method: "POST", headers });

describe("refuseCrossSite", () => {
  it("lets the app's own JSON fetch through", () => {
    expect(refuseCrossSite(post({ "sec-fetch-site": "same-origin", "content-type": "application/json", host: "app.example" }))).toBeNull();
  });

  it("lets scripts without a browser through when they send JSON", () => {
    expect(refuseCrossSite(post({ "content-type": "application/json; charset=utf-8" }))).toBeNull();
  });

  it("refuses requests the browser marks as cross-site", () => {
    expect(refuseCrossSite(post({ "sec-fetch-site": "cross-site", "content-type": "application/json" }))?.status).toBe(403);
    expect(refuseCrossSite(post({ "sec-fetch-site": "same-site", "content-type": "application/json" }))?.status).toBe(403);
  });

  it("refuses another origin when the browser doesn't send Sec-Fetch-Site", () => {
    expect(refuseCrossSite(post({ origin: "https://evil.example", host: "app.example", "content-type": "application/json" }))?.status).toBe(403);
    expect(refuseCrossSite(post({ origin: "null", host: "app.example", "content-type": "application/json" }))?.status).toBe(403);
    expect(refuseCrossSite(post({ origin: "https://app.example", host: "app.example", "content-type": "application/json" }))).toBeNull();
  });

  it("refuses the bodies an HTML form can send (the text/plain JSON trick)", () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      expect(refuseCrossSite(post({ "sec-fetch-site": "same-origin", "content-type": type }))?.status).toBe(415);
    }
    expect(refuseCrossSite(post({ "sec-fetch-site": "same-origin" }))?.status).toBe(415);
  });
});

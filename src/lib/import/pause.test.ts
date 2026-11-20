import { describe, expect, it } from "vitest";
import { IMPORT_PACE } from "@/lib/discogs/client";
import { importPause } from "./service";

describe("importPause", () => {
  it("doesn't wait while the shared budget is comfortable", () => {
    expect(importPause(null)).toBeUndefined();
    expect(importPause(60)).toBeUndefined();
    expect(importPause(IMPORT_PACE)).toBeUndefined();
  });

  it("waits longer the less is left, so several imports leave room for searches", () => {
    expect(importPause(IMPORT_PACE - 1)).toBe(2500);
    expect(importPause(10)).toBeGreaterThan(importPause(20)!);
    expect(importPause(0)).toBe(14_100);
    expect(importPause(-3)).toBe(14_100);
  });
});

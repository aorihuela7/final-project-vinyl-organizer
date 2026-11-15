import { describe, expect, it } from "vitest";
import { discogsUsernameSchema, startImportSchema } from "./validation";

describe("discogsUsernameSchema", () => {
  it("accepts normal usernames and trims spaces", () => {
    expect(discogsUsernameSchema.parse("  aorihuelar ")).toBe("aorihuelar");
    expect(discogsUsernameSchema.parse("dj.some_one-2")).toBe("dj.some_one-2");
  });

  it("rejects empty, too long, and unsafe values", () => {
    expect(discogsUsernameSchema.safeParse("").success).toBe(false);
    expect(discogsUsernameSchema.safeParse("a".repeat(65)).success).toBe(false);
    expect(discogsUsernameSchema.safeParse("../etc/passwd").success).toBe(false);
    expect(discogsUsernameSchema.safeParse("name with spaces").success).toBe(false);
    expect(discogsUsernameSchema.safeParse("x?page=2").success).toBe(false);
  });
});

describe("startImportSchema", () => {
  it("requires a username only for Discogs imports", () => {
    expect(startImportSchema.safeParse({ source: "demo" }).success).toBe(true);
    expect(startImportSchema.safeParse({ source: "discogs" }).success).toBe(false);
    expect(startImportSchema.safeParse({ source: "discogs", username: "abc" }).success).toBe(true);
    expect(startImportSchema.safeParse({ source: "csv" }).success).toBe(false);
  });
});

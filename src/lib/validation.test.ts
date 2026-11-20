import { describe, expect, it } from "vitest";
import { discogsUsernameSchema, startImportSchema, storedJobSchema, usernameIssue } from "./validation";

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

describe("storedJobSchema", () => {
  const base = { source: "discogs", discogs_username: "aorihuelar", sort: "added", sort_order: "asc", max_pages: null, next_page: 3 };

  it("accepts the jobs the app creates", () => {
    expect(storedJobSchema.safeParse(base).success).toBe(true);
    expect(storedJobSchema.safeParse({ source: "demo", discogs_username: "aorihuelar", sort: "added", sort_order: "desc", max_pages: 10, next_page: 1 }).success).toBe(true);
  });

  it("rejects job rows a user edited through the Data API", () => {
    expect(storedJobSchema.safeParse({ ...base, discogs_username: "../x" }).success).toBe(false);
    expect(storedJobSchema.safeParse({ ...base, discogs_username: ".." }).success).toBe(false);
    expect(storedJobSchema.safeParse({ ...base, sort: "title" }).success).toBe(false);
    expect(storedJobSchema.safeParse({ ...base, max_pages: 3 }).success).toBe(false);
    // The demo is always the same 10 pages of the same collection.
    expect(storedJobSchema.safeParse({ source: "demo", discogs_username: "someoneelse", sort: "added", sort_order: "desc", max_pages: 10, next_page: 1 }).success).toBe(false);
    expect(storedJobSchema.safeParse({ source: "demo", discogs_username: "aorihuelar", sort: "added", sort_order: "desc", max_pages: null, next_page: 1 }).success).toBe(false);
  });
});

describe("usernames made only of dots", () => {
  it("are refused by the schema and the form", () => {
    expect(discogsUsernameSchema.safeParse("..").success).toBe(false);
    expect(usernameIssue("...")).toBe("usernameChars");
    expect(usernameIssue("a.b")).toBeNull();
  });
});

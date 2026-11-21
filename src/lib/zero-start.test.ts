import { describe, expect, it } from "vitest";
import { DEMO, SAMPLE_COLLECTIONS, ZERO_START, isZeroStart } from "@/lib/config";
import { LOCALES, translator } from "@/i18n/core";
import { usernameIssue } from "@/lib/validation";

describe("start from scratch", () => {
  it("recognizes its Discogs account in any case, and nothing else", () => {
    expect(isZeroStart(ZERO_START.username)).toBe(true);
    expect(isZeroStart(` ${ZERO_START.username.toUpperCase()} `)).toBe(true);
    expect(isZeroStart(DEMO.username)).toBe(false);
    expect(isZeroStart(null)).toBe(false);
    expect(isZeroStart(undefined)).toBe(false);
  });

  it("goes through the same username validation as any import", () => {
    expect(usernameIssue(ZERO_START.username)).toBeNull();
  });
});

describe("sample collections", () => {
  it("are valid usernames, none of them the demo or the empty account", () => {
    for (const username of SAMPLE_COLLECTIONS) {
      expect(usernameIssue(username)).toBeNull();
      expect(username).toBe(username.toLowerCase());
      expect(isZeroStart(username)).toBe(false);
      expect(username).not.toBe(DEMO.username);
    }
  });

  it("each have a description in every language", () => {
    for (const username of SAMPLE_COLLECTIONS) {
      const english = translator("en").t(`samples.about.${username}`);
      expect(english).not.toBe(`samples.about.${username}`);
      // Spanish and Portuguese have their own words, not the English fallback.
      for (const locale of LOCALES.filter((l) => l !== "en")) expect(translator(locale).t(`samples.about.${username}`)).not.toBe(english);
    }
  });
});

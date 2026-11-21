import { describe, expect, it } from "vitest";
import { formatNumber, msg, renderMsg, translate, translator } from "./core";

describe("translate", () => {
  it("looks up dotted keys and fills placeholders", () => {
    expect(translate("en", "importing.progress", { done: 820, total: 1725 })).toBe("820 of 1,725 records");
  });

  it("picks the plural form from count", () => {
    expect(translate("en", "common.records", { count: 1 })).toBe("1 record");
    expect(translate("en", "common.records", { count: 2 })).toBe("2 records");
    expect(translate("en", "common.records", { count: 0 })).toBe("0 records");
  });

  it("falls back to English, then to the key", () => {
    expect(translate("pt", "common.close")).not.toBe("common.close");
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });

  it("leaves unknown placeholders alone", () => {
    expect(translate("en", "importing.progress", { done: 1 })).toBe("1 of {total} records");
  });
});

describe("formatNumber", () => {
  it("groups thousands the way each language does", () => {
    expect(formatNumber("en", 1392)).toBe("1,392");
    expect(formatNumber("es", 1392)).toBe("1.392");
    expect(formatNumber("pt", 1392)).toBe("1.392");
    expect(formatNumber("es", 999)).toBe("999");
  });
});

describe("messages", () => {
  it("renders nested messages in the current language", () => {
    const { t } = translator("en");
    const m = msg("notices.newPlaced", { count: 3, moves: msg("notices.moves", { count: 1 }) });
    expect(renderMsg(t, m)).toBe("3 new records are on your shelf now, with 1 move.");
  });

  it("passes raw text through", () => {
    const { t } = translator("en");
    expect(renderMsg(t, { text: "Discogs is busy." })).toBe("Discogs is busy.");
  });
});

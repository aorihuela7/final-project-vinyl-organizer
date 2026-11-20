import { describe, expect, it } from "vitest";
import en from "./en.json";
import es from "./es.json";
import pt from "./pt.json";
import { genreName, keysOf, translate } from "./core";

function leaf(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), dict);
}

function placeholders(value: unknown): string[] {
  const text = typeof value === "string" ? value : value && typeof value === "object" ? Object.values(value as Record<string, string>).join(" ") : "";
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

const english = keysOf(en);

describe.each([
  ["es", es],
  ["pt", pt],
])("the %s dictionary", (_name, dict) => {
  it("has every key of the English one, and no others", () => {
    expect(keysOf(dict).sort()).toEqual([...english].sort());
  });

  it("uses the same placeholders as English for every key", () => {
    for (const key of english) expect({ key, vars: placeholders(leaf(dict, key)) }).toEqual({ key, vars: placeholders(leaf(en, key)) });
  });

  it("gives every plural entry a singular and a plural form", () => {
    for (const key of english) {
      const value = leaf(dict, key);
      if (value && typeof value === "object") expect(Object.keys(value).sort(), key).toEqual(["one", "other"]);
    }
  });
});

describe("translations", () => {
  it("formats numbers and plurals per language", () => {
    expect(translate("es", "common.records", { count: 1392 })).toBe("1.392 discos");
    expect(translate("pt", "common.records", { count: 1 })).toBe("1 disco");
    expect(translate("pt", "common.records", { count: 0 })).toBe("0 discos");
    expect(translate("en", "common.records", { count: 1392 })).toBe("1,392 records");
  });

  it("translates the 15 Discogs genres and keeps unknown ones as they are", () => {
    expect(genreName("es", "Folk, World, & Country")).toBe("Folk, world y country");
    expect(genreName("pt", "Stage & Screen")).toBe("Cinema e teatro");
    expect(genreName("en", "Funk / Soul")).toBe("Funk / Soul");
    expect(genreName("es", "Something New")).toBe("Something New");
  });
});

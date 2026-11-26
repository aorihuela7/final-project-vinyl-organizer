/**
 * Shelf names the app gives on its own ("Cube shelf 2×1", "CD shelf 1×1 (2)",
 * "Living room") are stored in the language they were created in. They're
 * shown in the current language: a name made of an automatic name in any of
 * the three languages, plus an optional size and number, is translated; any
 * other name (one the user wrote) is shown as it is.
 */
import { LOCALES, translate, type Locale, type MessageKey } from "@/i18n/core";
import type { ShelfConfig } from "./model";

/** Automatic names, without their size: a key, and how to read its base from the translation. */
const AUTOMATIC: Array<{ key: MessageKey; base: (text: string) => string }> = [
  ...(["builder.cubeShelf", "builder.suggestedSingles", "builder.suggestedCds", "demo.living", "demo.studio", "demo.singles", "templates.crates", "templates.record_box"] as const).map(
    (key) => ({ key, base: (text: string) => text }),
  ),
  // Template names that carry a size ("Tower 1×5"): the base is the name without it.
  ...(["templates.low_2x4", "templates.tower_1x5"] as const).map((key) => ({ key, base: (text: string) => text.replace(/ \d+×\d+$/, "") })),
  { key: "builder.customName", base: (text: string) => text.replace(/ ?\{size\}/, "") },
];

let lookup: Map<string, (typeof AUTOMATIC)[number]> | null = null;
function automaticNames() {
  if (lookup) return lookup;
  lookup = new Map();
  for (const entry of AUTOMATIC) for (const locale of LOCALES) lookup.set(entry.base(translate(locale, entry.key)).toLocaleLowerCase(), entry);
  return lookup;
}

export function localizeShelfName(name: string, locale: Locale): string {
  const match = /^(.*?)( \d+×\d+)?( \(\d+\))?$/.exec(name.trim());
  if (!match) return name;
  const entry = automaticNames().get(match[1]!.toLocaleLowerCase());
  if (!entry) return name;
  return `${entry.base(translate(locale, entry.key))}${match[2] ?? ""}${match[3] ?? ""}`;
}

/** The same shelves with their automatic names in `locale`. */
export function localizeShelfNames(config: ShelfConfig, locale: Locale): ShelfConfig {
  let changed = false;
  const furniture = config.furniture.map((f) => {
    const name = localizeShelfName(f.name, locale);
    if (name === f.name) return f;
    changed = true;
    return { ...f, name };
  });
  return changed ? { ...config, furniture } : config;
}

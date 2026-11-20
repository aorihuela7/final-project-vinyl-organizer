/**
 * Translations without a library: one JSON dictionary per language, a dotted
 * key lookup, `{name}` placeholders, plurals through Intl.PluralRules, and
 * numbers through Intl.NumberFormat. Safe on the server and in the browser.
 *
 * English is the source: every key exists in en.json, and the other
 * dictionaries fall back to English for anything missing.
 */
import en from "./en.json";
import es from "./es.json";
import pt from "./pt.json";

export const LOCALES = ["en", "es", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

/** Each language by its own name, as the selector shows it. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español", pt: "Português" };

/** BCP 47 tags for Intl and <html lang>. */
export const LOCALE_TAGS: Record<Locale, string> = { en: "en", es: "es", pt: "pt-BR" };

export type Dictionary = typeof en;
const DICTIONARIES: Record<Locale, unknown> = { en, es, pt };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** A plural entry: an object with at least an "other" form. */
type PluralForms = { other: string; one?: string; zero?: string; two?: string; few?: string; many?: string };

/** Dotted paths to every string or plural entry in the English dictionary. */
type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends { other: string }
      ? `${Prefix}${K}`
      : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Dictionary>;
export type Vars = Record<string, string | number>;

function lookup(dict: unknown, key: string): unknown {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export function formatNumber(locale: Locale, n: number, options?: Intl.NumberFormatOptions): string {
  // Spanish and Portuguese group thousands from four digits too ("1.392"), as the plan asks.
  return new Intl.NumberFormat(LOCALE_TAGS[locale], { useGrouping: "always", ...options } as Intl.NumberFormatOptions).format(n);
}

function interpolate(template: string, locale: Locale, vars: Vars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    if (value === undefined) return match;
    return typeof value === "number" ? formatNumber(locale, value) : value;
  });
}

function pickPlural(forms: PluralForms, locale: Locale, count: number): string {
  if (count === 0 && forms.zero) return forms.zero;
  const category = new Intl.PluralRules(LOCALE_TAGS[locale]).select(count) as keyof PluralForms;
  return forms[category] ?? forms.other;
}

/**
 * The string for `key` in `locale`, with placeholders filled. Plural entries
 * use `vars.count`. Missing keys fall back to English, then to the key itself.
 */
export function translate(locale: Locale, key: MessageKey | string, vars?: Vars): string {
  let entry = lookup(DICTIONARIES[locale], key);
  if (entry === undefined) entry = lookup(DICTIONARIES.en, key);
  if (typeof entry === "string") return interpolate(entry, locale, vars);
  if (entry && typeof entry === "object" && "other" in entry) {
    const count = Number(vars?.count ?? 0);
    return interpolate(pickPlural(entry as PluralForms, locale, count), locale, vars);
  }
  return key;
}

export type Translator = {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Numbers in the current language: 1,392 or 1.392. */
  n: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** A list joined the way the language does it: "a, b and c" / "a, b y c". */
  list: (items: string[], type?: "conjunction" | "disjunction" | "unit") => string;
};

export function translator(locale: Locale): Translator {
  return {
    locale,
    t: (key, vars) => translate(locale, key, vars),
    n: (value, options) => formatNumber(locale, value, options),
    list: (items, type = "conjunction") => new Intl.ListFormat(LOCALE_TAGS[locale], { style: "long", type }).format(items),
  };
}

/** Every dotted key of a dictionary, with plural entries as one key. Used by the dictionary test. */
export function keysOf(dict: unknown, prefix = ""): string[] {
  if (!dict || typeof dict !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(dict as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || (v && typeof v === "object" && "other" in v)) out.push(path);
    else out.push(...keysOf(v, path));
  }
  return out;
}

export const dictionaries = DICTIONARIES as Record<Locale, Dictionary>;

/**
 * A message to show later, in whatever language is current then: a key with
 * its variables (which may themselves be messages), or raw text (errors that
 * come from a server).
 */
export type Msg = { key: MessageKey; vars?: Record<string, string | number | Msg> } | { text: string };

export function msg(key: MessageKey, vars?: Record<string, string | number | Msg>): Msg {
  return { key, vars };
}

export function rawMsg(text: string): Msg {
  return { text };
}

export function renderMsg(t: Translator["t"], m: Msg): string {
  if ("text" in m) return m.text;
  if (!m.vars) return t(m.key);
  const vars: Vars = {};
  for (const [k, v] of Object.entries(m.vars)) vars[k] = typeof v === "object" ? renderMsg(t, v) : v;
  return t(m.key, vars);
}

/** A Discogs genre in the current language (the canonical name when there's no translation). Sorting always uses the canonical name. */
export function genreName(locale: Locale, canonical: string): string {
  const table = (DICTIONARIES[locale] as { genres?: Record<string, string> }).genres;
  return table?.[canonical] ?? (DICTIONARIES.en as { genres?: Record<string, string> }).genres?.[canonical] ?? canonical;
}

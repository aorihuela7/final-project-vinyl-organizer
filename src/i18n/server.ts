import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translator, type Locale } from "./core";

/** The visitor's language from the locale cookie (English by default). Call it inside a Suspense boundary. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getTranslator() {
  return translator(await getLocale());
}

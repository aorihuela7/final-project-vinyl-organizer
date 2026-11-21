"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_TAGS, translator, type Locale, type Translator } from "./core";

type I18nContext = Translator & { setLocale: (locale: Locale) => void };

const Context = createContext<I18nContext | null>(null);

/** One year, so the choice sticks. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Listeners for a language change (e.g. to save it to the signed-in user's preferences). */
const listeners = new Set<(locale: Locale) => void>();
export function onLocaleChange(listener: (locale: Locale) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Holds the current language. Changing it updates every client component in
 * place (nothing remounts, so the person stays where they were), stores the
 * cookie, updates <html lang>, and refreshes server components.
 */
export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale];
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
      for (const listener of listeners) listener(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18nContext>(() => ({ ...translator(locale), setLocale }), [locale, setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18nContext {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>.");
  return value;
}

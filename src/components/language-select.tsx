"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, isLocale } from "@/i18n/core";
import { onLocaleChange, useI18n } from "@/i18n/client";
import { useSupabase } from "@/lib/supabase/browser";
import { loadPreferences, savePreferences } from "@/lib/store/preferences";

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2322302A'/%3E%3C/svg%3E\")";

/** The language, by its own name, in a paper pill with a chevron. */
export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <span className="inline-flex">
      <label htmlFor="language-select" className="sr-only">
        {t("common.language")}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        className="cursor-pointer appearance-none rounded-[18px] border border-input-line bg-paper bg-no-repeat py-1.5 pr-[30px] pl-3.5 text-sm text-ink"
        style={{ backgroundImage: CHEVRON, backgroundPosition: "right 12px center" }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * Keeps the language in the signed-in user's preferences: a choice made on
 * this device (the cookie) is saved; on a device without the cookie, the saved
 * choice is used.
 */
export function LocaleSync() {
  const { isSignedIn, userId } = useAuth();
  const supabase = useSupabase();
  const { locale, setLocale } = useI18n();
  const synced = useRef<string | null>(null);
  const current = useRef(locale);
  useEffect(() => {
    current.current = locale;
  }, [locale]);

  useEffect(() => {
    if (!isSignedIn || !userId || !supabase || synced.current === userId) return;
    synced.current = userId;
    const hasCookie = document.cookie.split("; ").some((c) => c.startsWith(`${LOCALE_COOKIE}=`));
    void loadPreferences(supabase)
      .then((prefs) => {
        if (!hasCookie && prefs.locale && prefs.locale !== current.current) setLocale(prefs.locale);
        else if (prefs.locale !== current.current) return savePreferences(supabase, userId, { locale: current.current });
      })
      .catch(() => {
        // Preferences are a convenience: the cookie still works.
      });
  }, [isSignedIn, userId, supabase, setLocale]);

  useEffect(() => {
    if (!isSignedIn || !userId || !supabase) return;
    return onLocaleChange((next) => {
      void savePreferences(supabase, userId, { locale: next }).catch(() => {});
    });
  }, [isSignedIn, userId, supabase]);

  return null;
}

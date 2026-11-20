/**
 * The signed-in user's preferences (language and guided tour), in
 * user_preferences, through RLS with the Clerk session token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, type Locale } from "@/i18n/core";

export type TourStatus = "offered" | "accepted_pending" | "completed" | "dismissed";
export type Preferences = { locale: Locale | null; tourStatus: TourStatus | null; exists: boolean };

export async function loadPreferences(supabase: SupabaseClient): Promise<Preferences> {
  const { data, error } = await supabase.from("user_preferences").select("locale, tour_status").maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { locale: string; tour_status: TourStatus | null } | null;
  return { locale: row && isLocale(row.locale) ? row.locale : null, tourStatus: row?.tour_status ?? null, exists: !!row };
}

/** Saves only the given fields; the other ones keep their value (or their default on the first save). */
export async function savePreferences(supabase: SupabaseClient, userId: string, patch: { locale?: Locale; tourStatus?: TourStatus }) {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.locale) row.locale = patch.locale;
  if (patch.tourStatus) row.tour_status = patch.tourStatus;
  const { error } = await supabase.from("user_preferences").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

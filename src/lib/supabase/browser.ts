"use client";

/**
 * Supabase client for the browser. It sends the Clerk session token through
 * the supabase-js `accessToken` option, so RLS sees the Clerk user.
 */
import { useMemo } from "react";
import { useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function useSupabase(): SupabaseClient | null {
  const { session, isLoaded } = useSession();
  return useMemo(() => {
    if (!isLoaded || !session) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      accessToken: async () => (await session.getToken()) ?? null,
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [session, isLoaded]);
}

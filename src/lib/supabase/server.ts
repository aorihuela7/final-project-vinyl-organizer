/**
 * Supabase client for route handlers. It sends the Clerk session token through
 * the supabase-js `accessToken` option, so RLS sees the Clerk user.
 */
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ServerSession = { supabase: SupabaseClient; userId: string };

export async function getServerSession(): Promise<ServerSession | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: async () => (await getToken()) ?? null,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { supabase, userId };
}

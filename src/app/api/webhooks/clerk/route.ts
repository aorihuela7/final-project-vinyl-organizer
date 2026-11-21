import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { createClient } from "@supabase/supabase-js";

/**
 * Clerk webhook: when an account is deleted, delete its rows in Supabase.
 * The request is verified with Clerk's signing secret (CLERK_WEBHOOK_SIGNING_SECRET);
 * the database call is allowed by a second secret (USER_DELETION_SECRET) whose
 * SHA-256 is stored in private.settings. Without both, nothing is deleted.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET || !process.env.USER_DELETION_SECRET) {
    console.error("[webhooks/clerk] CLERK_WEBHOOK_SIGNING_SECRET or USER_DELETION_SECRET is missing.");
    return new Response("Not configured", { status: 503 });
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "user.deleted" || !event.data.id) return new Response("Ignored", { status: 200 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("delete_user_data", { p_user_id: event.data.id, p_secret: process.env.USER_DELETION_SECRET });
  if (error) {
    console.error("[webhooks/clerk] delete_user_data failed:", error.message);
    return new Response("Couldn't delete the account's data", { status: 500 });
  }
  return new Response("Deleted", { status: 200 });
}

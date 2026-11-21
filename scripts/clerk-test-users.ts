/**
 * Counts, and optionally deletes, the users the end-to-end tests create.
 *
 * Clerk's development instance allows at most 100 users, and every e2e run
 * signs up about 25 (`e2e-…+clerk_test@example.com`). When the cap is reached,
 * nobody can sign up, including real people on the live app while it runs on
 * the development instance.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/clerk-test-users.ts            # count only
 *   npx tsx --env-file=.env.local scripts/clerk-test-users.ts --delete   # delete e2e users and their rows
 *
 * Only users whose every email address matches the e2e pattern are touched
 * (never real accounts, never the RLS test users). Their rows are deleted
 * first, through the Data API with their own session token (RLS applies),
 * then the Clerk user. It never prints tokens, keys, or email addresses.
 */
import { createClient } from "@supabase/supabase-js";

const CLERK_API = "https://api.clerk.com/v1";
const clerkSecret = process.env.CLERK_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const E2E_EMAIL = /^e2e-[a-z0-9-]+\+clerk_test@example\.com$/;

// Children before parents (some links have no cascade).
const TABLES = [
  "share_links",
  "layout_events",
  "placements",
  "records",
  "temporary_locations",
  "compartments",
  "furniture",
  "shelf_settings",
  "user_preferences",
  "import_jobs",
  "collections",
] as const;

if (!clerkSecret || !supabaseUrl || !supabaseKey) {
  console.error("Missing CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

type ClerkUser = { id: string; email_addresses: Array<{ email_address: string }> };

async function clerk<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${clerkSecret}`, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Clerk ${init?.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${body.slice(0, 200)}`);
  return (body ? JSON.parse(body) : null) as T;
}

async function allUsers(): Promise<ClerkUser[]> {
  const users: ClerkUser[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await clerk<ClerkUser[]>(`/users?limit=100&offset=${offset}&order_by=created_at`);
    users.push(...page);
    if (page.length < 100) return users;
  }
}

const isE2eUser = (u: ClerkUser) => u.email_addresses.length > 0 && u.email_addresses.every((e) => E2E_EMAIL.test(e.email_address));

async function deleteRows(userId: string) {
  const session = await clerk<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify({ user_id: userId }) });
  const { jwt } = await clerk<{ jwt: string }>(`/sessions/${session.id}/tokens`, { method: "POST", body: "{}" });
  const supabase = createClient(supabaseUrl!, supabaseKey!, {
    accessToken: async () => jwt,
    auth: { persistSession: false },
  } as Parameters<typeof createClient>[2]);
  for (const table of TABLES) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const users = await allUsers();
  const e2e = users.filter(isE2eUser);
  console.log(`Clerk users: ${users.length} (the development instance allows 100). E2E test users: ${e2e.length}. Others: ${users.length - e2e.length}.`);
  if (!process.argv.includes("--delete")) {
    console.log("Count only. Add --delete to delete the e2e test users and their rows.");
    return;
  }
  let deleted = 0;
  for (const user of e2e) {
    await deleteRows(user.id);
    await clerk(`/users/${user.id}`, { method: "DELETE" });
    deleted++;
    process.stdout.write(`  deleted ${deleted}/${e2e.length}\r`);
  }
  console.log(`\nDeleted ${deleted} e2e test users and their rows.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Proves that one account can't see or change another account's data.
 *
 * Run: npx tsx --env-file=.env.local scripts/rls-test.ts
 *
 * It creates (or reuses) two Clerk test users in the development instance,
 * opens a session for each through Clerk's Backend API, and calls the
 * Supabase Data API with each user's real session token, exactly like the app.
 * It never prints tokens or keys.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CLERK_API = "https://api.clerk.com/v1";
const clerkSecret = process.env.CLERK_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!clerkSecret || !supabaseUrl || !supabaseKey) {
  console.error("Missing CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

async function clerk<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${clerkSecret}`, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Clerk ${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as T;
}

async function ensureUser(email: string): Promise<string> {
  const found = await clerk<Array<{ id: string }>>(`/users?email_address=${encodeURIComponent(email)}`);
  if (found[0]) return found[0].id;
  const created = await clerk<{ id: string }>("/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [email], skip_password_requirement: true }),
  });
  return created.id;
}

async function sessionToken(userId: string): Promise<string> {
  const session = await clerk<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify({ user_id: userId }) });
  const token = await clerk<{ jwt: string }>(`/sessions/${session.id}/tokens`, { method: "POST", body: "{}" });
  return token.jwt;
}

function claims(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
}

function clientFor(token: string | null): SupabaseClient {
  return createClient(supabaseUrl!, supabaseKey!, {
    accessToken: async () => token,
    auth: { persistSession: false },
  } as Parameters<typeof createClient>[2]);
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  const userA = await ensureUser("rls-a+clerk_test@example.com");
  const userB = await ensureUser("rls-b+clerk_test@example.com");
  const tokenA = await sessionToken(userA);
  const tokenB = await sessionToken(userB);

  const ca = claims(tokenA);
  check("Clerk session token has role=authenticated", ca.role === "authenticated", `role=${String(ca.role)}`);
  check("Clerk session token sub is the Clerk user id", ca.sub === userA);

  const a = clientFor(tokenA);
  const b = clientFor(tokenB);
  const anon = clientFor(null);

  // Clean leftovers from a previous run of A.
  await a.from("furniture").delete().like("name", "RLS test%");

  const insertA = await a
    .from("furniture")
    .insert({ name: "RLS test A", template: "custom", rows: 1, cols: 2, default_capacity: 10, sort_index: 9000 })
    .select()
    .single();
  check("A can insert its own furniture", !insertA.error && !!insertA.data, insertA.error?.message);
  const furnitureId = insertA.data?.id as string | undefined;
  check("user_id defaults to the Clerk user id", insertA.data?.user_id === userA);

  const compA = await a.from("compartments").insert({ furniture_id: furnitureId, row: 0, col: 0 }).select().single();
  check("A can insert a compartment in its furniture", !compA.error, compA.error?.message);

  const readA = await a.from("furniture").select("id").eq("id", furnitureId!);
  check("A can read its furniture", readA.data?.length === 1, readA.error?.message);

  const readB = await b.from("furniture").select("id").eq("id", furnitureId!);
  check("B can't read A's furniture", !readB.error && readB.data?.length === 0, readB.error?.message);

  const readBComp = await b.from("compartments").select("id").eq("furniture_id", furnitureId!);
  check("B can't read A's compartments", !readBComp.error && readBComp.data?.length === 0, readBComp.error?.message);

  const updateB = await b.from("furniture").update({ name: "hacked" }).eq("id", furnitureId!).select();
  check("B can't update A's furniture", !updateB.error && updateB.data?.length === 0, updateB.error?.message);

  const deleteB = await b.from("furniture").delete().eq("id", furnitureId!).select();
  check("B can't delete A's furniture", !deleteB.error && deleteB.data?.length === 0, deleteB.error?.message);

  const stillThere = await a.from("furniture").select("name").eq("id", furnitureId!).single();
  check("A's furniture is unchanged", stillThere.data?.name === "RLS test A");

  const spoof = await b
    .from("furniture")
    .insert({ user_id: userA, name: "RLS test spoof", template: "custom", rows: 1, cols: 1, default_capacity: 10, sort_index: 9001 });
  check("B can't insert rows as A", !!spoof.error, spoof.error?.code);

  const crossRef = await b.from("compartments").insert({ furniture_id: furnitureId, row: 0, col: 1 });
  check("B can't attach a compartment to A's furniture", !!crossRef.error, crossRef.error?.code);

  const crossRpc = await b.rpc("apply_placements", {
    p_placements: [{ record_id: "00000000-0000-0000-0000-000000000000", compartment_id: compA.data?.id }],
    p_event: null,
  });
  check("B can't place a record in A's compartment through the RPC", !!crossRpc.error, crossRpc.error?.code);

  const anonRead = await anon.from("furniture").select("id");
  check("Anonymous requests can't read tables", !!anonRead.error || anonRead.data?.length === 0, anonRead.error?.code);

  const keepalive = await anon.rpc("keepalive");
  check("Anonymous keepalive RPC works", !keepalive.error && keepalive.data === 1, keepalive.error?.message);

  const badLink = await a.from("records").insert({
    artist: "x",
    title: "x",
    origin: "added",
    discogs_release_id: 1,
    discogs_url: "javascript:alert(1)",
    cover_url: "https://evil.example/pixel.gif",
  });
  check("The database rejects non-Discogs links and covers", badLink.error?.code === "23514", badLink.error?.code);

  await a.from("furniture").delete().eq("id", furnitureId!);

  console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

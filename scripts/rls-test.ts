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
import { randomBytes } from "node:crypto";
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

  // ------------------------------------------------------------- v2 tables
  await a.from("temporary_locations").delete().like("name", "RLS test%");
  await a.from("share_links").delete().like("token", "rlstest%");

  const locA = await a.from("temporary_locations").insert({ name: "RLS test bag" }).select().single();
  check("A can create a temporary location", !locA.error, locA.error?.message);
  const prefsA = await a.from("user_preferences").upsert({ user_id: userA, locale: "es" }, { onConflict: "user_id" }).select().single();
  check("A can save its preferences", !prefsA.error, prefsA.error?.message);
  const linkToken = `rlstest${Date.now().toString(36)}abcdefghijkl`;
  const linkA = await a.from("share_links").insert({ token: linkToken }).select().single();
  check("A can create a guest link", !linkA.error, linkA.error?.message);

  for (const table of ["temporary_locations", "user_preferences", "share_links"] as const) {
    const seen = await b.from(table).select("user_id").eq("user_id", userA);
    check(`B can't read A's ${table}`, !seen.error && seen.data?.length === 0, seen.error?.message);
    const anonSeen = await anon.from(table).select("user_id");
    check(`Anonymous requests can't read ${table}`, !!anonSeen.error || anonSeen.data?.length === 0, anonSeen.error?.code);
  }

  // Tags were removed: no table, no tag sort level, no tag section.
  const noTags = await a.from("tags").select("id").limit(1);
  check("The tags table is gone", !!noTags.error, noTags.error?.code ?? "still there");
  const tagLevel = await a.from("shelf_settings").insert({ sort_levels: ["tag", "artist"] });
  check("The database refuses the tag sort level", tagLevel.error?.code === "23514", tagLevel.error?.code ?? "accepted");
  const tagSection = await a
    .from("furniture")
    .insert({ name: "RLS test tag section", template: "custom", rows: 1, cols: 1, default_capacity: 10, sort_index: 9200, section: "tag:Sunday morning" });
  check("The database refuses a tag section", tagSection.error?.code === "23514", tagSection.error?.code ?? "accepted");
  await a.from("furniture").delete().like("name", "RLS test tag section");

  // The guest link returns data only while A's Discogs data is less than 6 hours old.
  const before = await a.from("collections").select("id, last_synced_at").maybeSingle();
  const collection = before.data ?? (await a.from("collections").insert({ source: "manual" }).select("id, last_synced_at").single()).data;
  await a.from("collections").update({ last_synced_at: new Date().toISOString() }).eq("id", collection!.id);
  const guest = await anon.rpc("shared_shelf", { p_token: linkToken });
  check("A guest link returns A's shelf to an anonymous caller", !guest.error && guest.data?.stale === false && Array.isArray(guest.data?.records), guest.error?.message);
  await a.from("collections").update({ last_synced_at: new Date(Date.now() - 7 * 3600_000).toISOString() }).eq("id", collection!.id);
  const stale = await anon.rpc("shared_shelf", { p_token: linkToken });
  check("A guest link returns no Discogs data older than 6 hours", !stale.error && stale.data?.stale === true && !("records" in (stale.data ?? {})), stale.error?.message);
  const wrong = await anon.rpc("shared_shelf", { p_token: "rlstest-not-a-real-token-123" });
  check("A wrong guest token returns nothing", !wrong.error && wrong.data === null, wrong.error?.message);
  await a.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("token", linkToken);
  const revoked = await anon.rpc("shared_shelf", { p_token: linkToken });
  check("A revoked guest link returns nothing", !revoked.error && revoked.data === null, revoked.error?.message);

  const anonSave = await anon.rpc("save_setup", { p_furniture: [], p_settings: null, p_placements: [], p_event: null });
  check("Anonymous requests can't call save_setup", !!anonSave.error, anonSave.error?.code);
  const anonDelete = await anon.rpc("delete_user_data", { p_user_id: userA, p_secret: "guess" });
  check("delete_user_data refuses without the secret", !!anonDelete.error, anonDelete.error?.code);

  // ------------------------------------------- limits from the security review
  const bigMoves = Array.from({ length: 60_000 }, () => ({ recordId: randomBytes(18).toString("base64"), from: null, to: null }));
  const bigEvent = await a.from("layout_events").insert({ kind: "insert", moves: bigMoves, moved_count: 1 });
  check("A layout event with more than 1 MB of moves is refused", bigEvent.error?.code === "23514", bigEvent.error?.code ?? "accepted");

  await a.from("layout_events").delete().eq("user_id", userA);
  await a.from("layout_events").insert({ kind: "calibrate", moves: [], moved_count: 0 });
  const flood = await a.from("layout_events").insert(Array.from({ length: 505 }, () => ({ kind: "insert", moves: [], moved_count: 0 })));
  const kept = await a.from("layout_events").select("kind").eq("user_id", userA);
  check(
    "The layout log keeps an account's newest 500 events and its newest calibration",
    !flood.error && (kept.data?.length ?? 0) <= 501 && (kept.data ?? []).some((e) => e.kind === "calibrate"),
    flood.error?.message ?? `kept ${kept.data?.length}`,
  );
  await a.from("layout_events").delete().eq("user_id", userA);

  const tooMany = await a
    .from("furniture")
    .insert(Array.from({ length: 31 }, (_, i) => ({ name: `RLS test quota ${i}`, template: "custom", rows: 1, cols: 1, default_capacity: 10, sort_index: 9100 + i })));
  const quotaLeft = await a.from("furniture").select("id").like("name", "RLS test quota%");
  check("An account can't have more than 30 shelves", tooMany.error?.code === "23514" && quotaLeft.data?.length === 0, tooMany.error?.code ?? "accepted");
  const outside = await a.from("compartments").insert({ furniture_id: furnitureId, row: 12, col: 0 });
  check("A compartment can't sit outside the largest shelf", outside.error?.code === "23514", outside.error?.code ?? "accepted");

  await a.from("import_jobs").delete().eq("user_id", userA);
  const badJob = await a.from("import_jobs").insert({ collection_id: collection!.id, source: "discogs", discogs_username: "../x", sort: "added" });
  check("The database refuses an import job with an invalid username", badJob.error?.code === "23514", badJob.error?.code ?? "accepted");
  const job = await a
    .from("import_jobs")
    .insert({ collection_id: collection!.id, source: "discogs", discogs_username: "rls-test", sort: "added", next_page: 3 })
    .select("id")
    .single();
  check("A can create a valid import job", !job.error, job.error?.message);
  const back = await a.from("import_jobs").update({ next_page: 1 }).eq("id", job.data?.id);
  check("An import job can't go back a page", back.error?.code === "23514", back.error?.code ?? "accepted");
  const otherUser = await a.from("import_jobs").update({ discogs_username: "someone-else" }).eq("id", job.data?.id);
  check("An import job can't change what it imports", otherUser.error?.code === "23514", otherUser.error?.code ?? "accepted");
  await a.from("import_jobs").update({ status: "done" }).eq("id", job.data?.id);
  const reopen = await a.from("import_jobs").update({ status: "running" }).eq("id", job.data?.id);
  check("A finished import job can't be reopened", reopen.error?.code === "23514", reopen.error?.code ?? "accepted");
  await a.from("import_jobs").delete().eq("user_id", userA);

  const classifyA = await a.rpc("classify_vinyl_size", { p_descriptions: ['7"'] });
  check("Signed-in users can still run the format classifier (the trigger needs it)", !classifyA.error && classifyA.data === 7, classifyA.error?.message);
  const classifyAnon = await anon.rpc("classify_vinyl_size", { p_descriptions: ['7"'] });
  check("Anonymous requests can't run the format classifier", !!classifyAnon.error, classifyAnon.error?.code ?? "allowed");

  if (before.data) await a.from("collections").update({ last_synced_at: before.data.last_synced_at }).eq("id", before.data.id);
  else await a.from("collections").delete().eq("id", collection!.id);

  await a.from("temporary_locations").delete().eq("id", locA.data?.id);
  await a.from("share_links").delete().eq("token", linkToken);
  await a.from("user_preferences").delete().eq("user_id", userA);

  await a.from("furniture").delete().eq("id", furnitureId!);

  console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

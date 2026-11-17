/**
 * Prints what is stored for test users: records, shelves, compartments,
 * placements, and layout events. Used as evidence for the build log.
 *
 * Run: npx tsx --env-file=.env.local scripts/db-check.ts [email-or-prefix…]
 */
import { clerkApi, openSession, supabaseAs } from "./lib/clerk-test";

async function usersFor(query: string): Promise<Array<{ id: string; email: string }>> {
  const list = await clerkApi<Array<{ id: string; email_addresses: Array<{ email_address: string }>; created_at: number }>>(
    `/users?query=${encodeURIComponent(query)}&order_by=-created_at&limit=1`,
  );
  return list.map((u) => ({ id: u.id, email: u.email_addresses[0]?.email_address ?? "?" }));
}

async function main() {
  const queries = process.argv.slice(2).length ? process.argv.slice(2) : ["demo-check+clerk_test", "e2e-import-"];
  for (const q of queries) {
    for (const user of await usersFor(q)) {
      const session = await openSession(user.id);
      const db = supabaseAs(() => session.token());
      const count = async (table: string) => (await db.from(table).select("*", { count: "exact", head: true })).count;
      const { data: furniture } = await db.from("furniture").select("name, template, media, rows, cols, traversal, default_capacity, sort_index").order("sort_index");
      const { data: blocked } = await db.from("compartments").select("row, col").eq("status", "blocked");
      const { data: events } = await db.from("layout_events").select("kind, moved_count, created_at").order("created_at");
      const { data: collection } = await db.from("collections").select("source, discogs_username, last_synced_at").maybeSingle();
      console.log(`\n${user.email}`);
      console.log(`  collection: ${JSON.stringify(collection)}`);
      console.log(`  records=${await count("records")} compartments=${await count("compartments")} placements=${await count("placements")}`);
      console.log(`  furniture: ${JSON.stringify(furniture)}`);
      console.log(`  blocked compartments: ${JSON.stringify(blocked)}`);
      console.log(`  layout events: ${JSON.stringify(events?.map((e) => `${e.kind}:${e.moved_count}`))}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

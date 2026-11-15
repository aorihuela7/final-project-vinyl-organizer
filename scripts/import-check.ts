/**
 * Phase 3 check: runs a full import and a demo import through the real API
 * routes of the local dev server (http://localhost:3000), as two Clerk test
 * users, and compares the stored record counts with what Discogs reports.
 *
 * Run (with `npm run dev` running): npx tsx --env-file=.env.local scripts/import-check.ts
 */
import { ensureTestUser, openSession, supabaseAs } from "./lib/clerk-test";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const USERNAME = "aorihuelar";

type Job = { id: string; status: string; items_done: number; items_total: number | null; total_pages: number | null; next_page: number; last_error: string | null };

async function call(path: string, token: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { job?: Job; retryAfterMs?: number; error?: string };
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${json.error}`);
  return json;
}

async function discogsCount(): Promise<number> {
  const res = await fetch(`https://api.discogs.com/users/${USERNAME}/collection/folders/0/releases?per_page=1`, {
    headers: { "User-Agent": process.env.DISCOGS_USER_AGENT!, Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}` },
  });
  const json = (await res.json()) as { pagination: { items: number } };
  return json.pagination.items;
}

async function runImport(email: string, body: unknown) {
  const userId = await ensureTestUser(email);
  const session = await openSession(userId);
  const started = Date.now();
  let { job } = await call("/api/import/start", await session.token(), body);
  if (!job) throw new Error("No job returned");
  while (job.status === "queued" || job.status === "running") {
    const step = await call("/api/import/step", await session.token(), { jobId: job.id });
    job = step.job!;
    process.stdout.write(`  page ${job.next_page - 1}/${job.total_pages ?? "?"} · ${job.items_done}/${job.items_total ?? "?"}\r`);
    if (step.retryAfterMs) await new Promise((r) => setTimeout(r, step.retryAfterMs));
  }
  const supabase = supabaseAs(() => session.token());
  const { count, error } = await supabase.from("records").select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  const { count: active } = await supabase
    .from("import_jobs")
    .select("*", { count: "exact", head: true })
    .in("status", ["queued", "running"]);
  const { data: collection } = await supabase.from("collections").select("source, discogs_username, last_synced_at").single();
  console.log(`\n  status=${job.status} error=${job.last_error ?? "none"} seconds=${((Date.now() - started) / 1000).toFixed(1)}`);
  console.log(`  stored records=${count} · items_total=${job.items_total} · active jobs left=${active} · collection=${JSON.stringify(collection)}`);
  return { count: count ?? -1, job };
}

async function main() {
  const reported = await discogsCount();
  console.log(`Discogs reports ${reported} items for ${USERNAME}.`);

  console.log("Full import (test user import-check+clerk_test@example.com):");
  const full = await runImport("import-check+clerk_test@example.com", { source: "discogs", username: USERNAME });

  console.log("Demo import (test user demo-check+clerk_test@example.com):");
  const demo = await runImport("demo-check+clerk_test@example.com", { source: "demo" });

  console.log("Resume + one active job (re-sync of the full-import user):");
  const userId = await ensureTestUser("import-check+clerk_test@example.com");
  const session = await openSession(userId);
  const first = (await call("/api/import/start", await session.token(), { source: "discogs", username: USERNAME })).job!;
  await call("/api/import/step", await session.token(), { jobId: first.id });
  await call("/api/import/step", await session.token(), { jobId: first.id });
  // The tab "closes" here. Starting again must resume the same job, not create a second one.
  const resumed = (await call("/api/import/start", await session.token(), { source: "discogs", username: USERNAME })).job!;
  const okResume = resumed.id === first.id && resumed.next_page === 3;
  console.log(`${okResume ? "PASS" : "FAIL"}  start while a job is active returns the same job (next_page=${resumed.next_page})`);
  let job = resumed;
  while (job.status === "queued" || job.status === "running") {
    const step = await call("/api/import/step", await session.token(), { jobId: job.id });
    job = step.job!;
    if (step.retryAfterMs) await new Promise((r) => setTimeout(r, step.retryAfterMs));
  }
  const { count: afterResync } = await supabaseAs(() => session.token()).from("records").select("*", { count: "exact", head: true });
  const okResync = job.status === "done" && afterResync === reported;
  console.log(`${okResync ? "PASS" : "FAIL"}  re-sync is idempotent: ${afterResync} records after the second full sync`);

  const okFull = full.job.status === "done" && full.count === reported;
  const okDemo = demo.job.status === "done" && demo.count === Math.min(1000, reported);
  console.log(`${okFull ? "PASS" : "FAIL"}  full import stored ${full.count}, Discogs reports ${reported}`);
  console.log(`${okDemo ? "PASS" : "FAIL"}  demo import stored ${demo.count}, expected ${Math.min(1000, reported)}`);
  process.exit(okFull && okDemo && okResume && okResync ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

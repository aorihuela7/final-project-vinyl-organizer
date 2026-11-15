/**
 * Import jobs: one page of 100 per step, upserted by discogs_instance_id.
 * The browser asks for the next step; if the tab closes, the job stays in the
 * database and resumes. When a full sync finishes, records the job didn't see
 * are deleted (and lose their placement through the foreign key).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO, FRESHNESS_MS } from "@/lib/config";
import { DiscogsError, getCollectionPage, getRelease } from "@/lib/discogs/client";
import { mapCollectionItem, mapRelease } from "@/lib/discogs/map";
import { replacesCollection } from "./replace";

export type ImportJob = {
  id: string;
  user_id: string;
  collection_id: string;
  source: "discogs" | "demo";
  discogs_username: string;
  max_pages: number | null;
  sort: string;
  sort_order: "asc" | "desc";
  status: "queued" | "running" | "done" | "error";
  next_page: number;
  total_pages: number | null;
  items_total: number | null;
  items_done: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type StepResult = { job: ImportJob; retryAfterMs?: number };

const MAX_ATTEMPTS = 5;
/** Added records refreshed per finished sync (each costs one Discogs request). */
const MAX_ADDED_REFRESH = 25;

export class ImportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function activeJob(supabase: SupabaseClient): Promise<ImportJob | null> {
  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ImportError(error.message, 500);
  return (data as ImportJob | null) ?? null;
}

/** Starts an import, or returns the active one (one active job per user). */
export async function startImport(
  supabase: SupabaseClient,
  userId: string,
  input: { source: "discogs"; username: string } | { source: "demo" },
): Promise<ImportJob> {
  const existing = await activeJob(supabase);
  if (existing) {
    const same =
      existing.source === input.source &&
      (input.source === "demo" || existing.discogs_username.toLowerCase() === input.username.toLowerCase());
    if (same) return existing;
    // A different collection was asked for: retire the active job and start the new one.
    const { error: retireError } = await supabase
      .from("import_jobs")
      .update({ status: "error", last_error: "Replaced by a newer import.", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (retireError) throw new ImportError(retireError.message, 500);
  }

  const username = input.source === "demo" ? DEMO.username : input.username;
  // One collection per user. An existing one keeps its source and username until
  // the new import finishes (finishSync), so a typo or a private collection
  // never replaces what the user already has.
  const collection = await ensureCollection(supabase, userId, input.source, username);

  const job =
    input.source === "demo"
      ? { max_pages: DEMO.maxPages, sort: DEMO.sort, sort_order: DEMO.sortOrder }
      : { max_pages: null, sort: "added", sort_order: "asc" as const };

  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      user_id: userId,
      collection_id: collection,
      source: input.source,
      discogs_username: username,
      status: "queued",
      ...job,
    })
    .select("*")
    .single();

  if (error) {
    // Unique violation: another request created the active job first.
    if (error.code === "23505") {
      const again = await activeJob(supabase);
      if (again) return again;
    }
    throw new ImportError(error.message, 500);
  }
  return data as ImportJob;
}

async function ensureCollection(supabase: SupabaseClient, userId: string, source: ImportJob["source"], username: string): Promise<string> {
  const { data: existing, error: readError } = await supabase.from("collections").select("id").maybeSingle();
  if (readError) throw new ImportError(readError.message, 500);
  if (existing) return existing.id as string;
  const { data: created, error: createError } = await supabase
    .from("collections")
    .upsert({ user_id: userId, source, discogs_username: username }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("id");
  if (createError) throw new ImportError(createError.message, 500);
  if (created?.[0]) return created[0].id as string;
  // Another request created it first.
  const { data: again, error: againError } = await supabase.from("collections").select("id").single();
  if (againError || !again) throw new ImportError(againError?.message ?? "Couldn't save the collection.", 500);
  return again.id as string;
}

function friendlyDiscogsError(err: DiscogsError, username: string): string {
  if (err.status === 404) return `We couldn't find the Discogs user "${username}". Check the spelling.`;
  if (err.status === 403 || err.status === 401)
    return `The collection of "${username}" isn't public. In Discogs, go to Settings → Privacy, make your collection public, and try again.`;
  return err.message;
}

async function updateJob(supabase: SupabaseClient, id: string, patch: Partial<ImportJob>, expectedPage?: number) {
  let query = supabase
    .from("import_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (expectedPage !== undefined) query = query.eq("next_page", expectedPage);
  const { data, error } = await query.select("*");
  if (error) throw new ImportError(error.message, 500);
  return (data?.[0] as ImportJob | undefined) ?? null;
}

/** Processes the next page of a job. */
export async function stepImport(supabase: SupabaseClient, userId: string, jobId: string): Promise<StepResult> {
  const { data: found, error } = await supabase.from("import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new ImportError(error.message, 500);
  if (!found) throw new ImportError("Import not found.", 404);
  const job = found as ImportJob;
  if (job.status === "done" || job.status === "error") return { job };

  const page = job.next_page;
  let pageData;
  let remaining: number | null;
  try {
    ({ data: pageData, remaining } = await getCollectionPage(job.discogs_username, page, job.sort, job.sort_order));
  } catch (err) {
    if (err instanceof DiscogsError) {
      const permanent = err.status === 404 || err.status === 403 || err.status === 401;
      const attempts = job.attempts + 1;
      const failed = permanent || attempts >= MAX_ATTEMPTS;
      const updated = await updateJob(supabase, job.id, {
        attempts,
        last_error: friendlyDiscogsError(err, job.discogs_username),
        status: failed ? "error" : "running",
        ...(failed ? { finished_at: new Date().toISOString() } : {}),
      });
      return { job: updated ?? job, retryAfterMs: failed ? undefined : (err.retryAfterMs ?? 3000) };
    }
    throw err;
  }

  const discogsPages = pageData.pagination.pages;
  const totalPages = job.max_pages ? Math.min(discogsPages, job.max_pages) : discogsPages;
  const itemsTotal = job.max_pages
    ? Math.min(pageData.pagination.items, job.max_pages * pageData.pagination.per_page)
    : pageData.pagination.items;

  const now = new Date().toISOString();
  const rows = pageData.releases.map((item) => ({
    ...mapCollectionItem(item),
    user_id: userId,
    origin: "import" as const,
    synced_at: now,
    last_seen_job_id: job.id,
  }));
  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("records")
      .upsert(rows, { onConflict: "user_id,discogs_instance_id" });
    if (upsertError) throw new ImportError(upsertError.message, 500);
  }

  const isLast = page >= totalPages || rows.length === 0;
  if (isLast) await finishSync(supabase, job, itemsTotal);

  const updated = await updateJob(
    supabase,
    job.id,
    {
      next_page: page + 1,
      items_done: Math.min(job.items_done + rows.length, itemsTotal),
      total_pages: totalPages,
      items_total: itemsTotal,
      attempts: 0,
      last_error: null,
      status: isLast ? "done" : "running",
      ...(isLast ? { finished_at: new Date().toISOString() } : {}),
    },
    page,
  );
  if (!updated) {
    // Another tab processed this page first; return the current state.
    const { data: current } = await supabase.from("import_jobs").select("*").eq("id", job.id).single();
    return { job: (current as ImportJob) ?? job };
  }

  // Leave room in the shared rate limit for other users.
  const retryAfterMs = remaining !== null && remaining < 5 ? 2500 : undefined;
  return { job: updated, retryAfterMs };
}

/** End of a full sync: sweep unseen records, refresh added ones, stamp the collection. */
async function finishSync(supabase: SupabaseClient, job: ImportJob, expected: number) {
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("source, discogs_username")
    .eq("id", job.collection_id)
    .maybeSingle();
  if (collectionError) throw new ImportError(collectionError.message, 500);

  if (replacesCollection(collection, job)) {
    // One collection per user: the new one replaces the old one entirely. Every
    // record this job didn't see goes, including records added by hand, and so do
    // the shelves (their compartments and placements cascade); the user builds
    // shelves again for the new collection.
    const { error: recordsError } = await supabase.from("records").delete().eq("user_id", job.user_id).or(`last_seen_job_id.is.null,last_seen_job_id.neq.${job.id}`);
    if (recordsError) throw new ImportError(recordsError.message, 500);
    const { error: furnitureError } = await supabase.from("furniture").delete().eq("user_id", job.user_id);
    if (furnitureError) throw new ImportError(furnitureError.message, 500);
    const { error: stampError } = await supabase
      .from("collections")
      .update({ source: job.source, discogs_username: job.discogs_username, last_synced_at: new Date().toISOString() })
      .eq("id", job.collection_id);
    if (stampError) throw new ImportError(stampError.message, 500);
    return;
  }

  // Pages are offsets: if a record was removed on Discogs mid-import, later ones
  // shift into a page we already read and this job never saw them. Only sweep
  // when the job saw as many records as Discogs reports; otherwise the next sync does.
  const { count: seen, error: countError } = await supabase
    .from("records")
    .select("id", { count: "exact", head: true })
    .eq("origin", "import")
    .eq("last_seen_job_id", job.id);
  if (countError) throw new ImportError(countError.message, 500);
  if ((seen ?? 0) >= expected) {
    const { error: sweepError } = await supabase
      .from("records")
      .delete()
      .eq("origin", "import")
      .or(`last_seen_job_id.is.null,last_seen_job_id.neq.${job.id}`);
    if (sweepError) throw new ImportError(sweepError.message, 500);
  }

  // Records added by hand aren't in the Discogs collection: refresh them from
  // /releases so they also meet the 6-hour freshness rule.
  const staleBefore = new Date(Date.now() - FRESHNESS_MS).toISOString();
  const { data: added } = await supabase
    .from("records")
    .select("id, discogs_release_id")
    .eq("origin", "added")
    .lt("synced_at", staleBefore)
    .limit(MAX_ADDED_REFRESH);
  for (const record of added ?? []) {
    if (!record.discogs_release_id) continue;
    try {
      const { data } = await getRelease(record.discogs_release_id);
      const fresh = mapRelease(data);
      await supabase
        .from("records")
        .update({ ...fresh, discogs_instance_id: null, synced_at: new Date().toISOString() })
        .eq("id", record.id);
    } catch {
      // Keep the old copy; the next sync tries again.
    }
  }

  await supabase.from("collections").update({ last_synced_at: new Date().toISOString() }).eq("id", job.collection_id);
}

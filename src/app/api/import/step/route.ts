import { getServerSession } from "@/lib/supabase/server";
import { ImportError, stepImport } from "@/lib/import/service";
import { importStepSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

/** Processes the next page (100 records) of an import job. The browser calls it until the job is done. */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to continue the import." }, { status: 401 });

  // Steps are sequential (about one per second); this stops a client from hammering the shared Discogs limit.
  const limit = rateLimit(`import-step:${session.userId}`, 120, 60_000);
  if (!limit.ok) return Response.json({ job: null, retryAfterMs: limit.retryAfterMs, error: "Slow down." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = importStepSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  try {
    const result = await stepImport(session.supabase, session.userId, parsed.data.jobId);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    return Response.json({ error: err instanceof Error ? err.message : "The import step failed." }, { status });
  }
}

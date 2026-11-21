import { getServerSession } from "@/lib/supabase/server";
import { stepImport } from "@/lib/import/service";
import { publicError } from "@/lib/import/errors";
import { importStepSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { refuseCrossSite } from "@/lib/same-origin";

/** Processes the next page (100 records) of an import job. The browser calls it until the job is done. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request);
  if (refused) return refused;
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to continue the import." }, { status: 401 });

  // Steps are sequential, one Discogs request each. The whole app shares 60
  // requests a minute, so one person's import can't take more than 50 of them.
  const limit = rateLimit(`import-step:${session.userId}`, 50, 60_000);
  if (!limit.ok) return Response.json({ job: null, retryAfterMs: limit.retryAfterMs, error: "Slow down." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = importStepSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  try {
    const result = await stepImport(session.supabase, session.userId, parsed.data.jobId);
    return Response.json(result);
  } catch (err) {
    const { status, message } = publicError(err, "The import step failed. It will continue when you try again.", "import/step");
    return Response.json({ error: message }, { status });
  }
}

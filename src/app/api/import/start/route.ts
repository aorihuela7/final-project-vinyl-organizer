import { getServerSession } from "@/lib/supabase/server";
import { startImport } from "@/lib/import/service";
import { publicError } from "@/lib/import/errors";
import { startImportSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { refuseCrossSite } from "@/lib/same-origin";

/** Starts an import of a public Discogs collection (or the demo), or returns the active one. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request);
  if (refused) return refused;
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to import a collection." }, { status: 401 });

  const limit = rateLimit(`import-start:${session.userId}`, 10, 60_000);
  if (!limit.ok) return Response.json({ error: "Too many imports started. Wait a minute." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = startImportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const job = await startImport(session.supabase, session.userId, parsed.data);
    return Response.json({ job });
  } catch (err) {
    const { status, message } = publicError(err, "Couldn't start the import. Try again in a minute.", "import/start");
    return Response.json({ error: message }, { status });
  }
}

import { getServerSession } from "@/lib/supabase/server";
import { ImportError, startImport } from "@/lib/import/service";
import { startImportSchema } from "@/lib/validation";

/** Starts an import of a public Discogs collection (or the demo), or returns the active one. */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to import a collection." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = startImportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const job = await startImport(session.supabase, session.userId, parsed.data);
    return Response.json({ job });
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't start the import." }, { status });
  }
}

import { ImportError } from "./service";

/**
 * What an API route may tell the browser about a failure: the message of an
 * expected error (4xx: not found, Discogs said no), or a generic sentence for
 * anything else. Database and server details are logged, never returned.
 */
export function publicError(err: unknown, fallback: string, where: string): { status: number; message: string } {
  if (err instanceof ImportError && err.status < 500) return { status: err.status, message: err.message };
  console.error(`[${where}]`, err);
  return { status: err instanceof ImportError ? err.status : 500, message: fallback };
}

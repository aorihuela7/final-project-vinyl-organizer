/** Shared by the server (finishSync) and the browser (to show a replacement as a full import). */

type CollectionLike = { source: string; discogs_username: string | null };
type JobLike = { source: string; discogs_username: string };

/** True when the job imports a different collection than the one the user has (demo → own, or another username). */
export function replacesCollection(collection: CollectionLike | null | undefined, job: JobLike): boolean {
  if (!collection) return false;
  return collection.source !== job.source || (collection.discogs_username ?? "").toLowerCase() !== job.discogs_username.toLowerCase();
}

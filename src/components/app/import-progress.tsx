"use client";

import type { JobRow } from "@/lib/store/remote";

export function ImportProgress({ job, message }: { job: JobRow | null; message: string }) {
  const total = job?.items_total ?? null;
  const done = job?.items_done ?? 0;
  const pct = total ? Math.round((done / total) * 100) : null;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card" role="status" aria-live="polite">
      <h1 className="text-lg font-semibold text-ink">{job?.source === "demo" ? "Loading the demo collection" : message}</h1>
      <div className="h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${pct ?? 5}%` }} />
      </div>
      <p className="text-sm text-ink-muted">
        {total ? `${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} records` : "Talking to Discogs…"}
        {job?.total_pages ? ` · page ${Math.min(job.next_page, job.total_pages)} of ${job.total_pages}` : ""}
      </p>
      <p className="text-xs text-ink-faint">You can close this tab: the import continues from here when you come back.</p>
    </div>
  );
}

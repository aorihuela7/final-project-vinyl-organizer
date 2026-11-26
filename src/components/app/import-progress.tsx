"use client";

import type { JobRow } from "@/lib/store/remote";
import { useI18n } from "@/i18n/client";
import { card } from "../ui";

/**
 * An import's progress. Starting from scratch shows only its message and the
 * bar: behind the scenes it's an import, but nothing on screen says so.
 */
export function ImportProgress({ job, message, scratch = false }: { job: JobRow | null; message: string; scratch?: boolean }) {
  const { t } = useI18n();
  const total = job?.items_total ?? null;
  const done = job?.items_done ?? 0;
  const pct = total ? Math.round((done / total) * 100) : null;
  const pages = job?.total_pages ?? null;
  return (
    <div className={`${card} mx-auto flex w-full max-w-md flex-col gap-3 p-5`} role="status" aria-live="polite">
      <h1 className="font-display text-lg text-ink">{job?.source === "demo" ? t("importing.demoTitle") : message}</h1>
      <div className="h-3 overflow-hidden rounded-pill bg-meter-track shadow-[inset_0_1px_2px_rgb(0_0_0/0.15)]">
        <div className="h-full transition-[width]" style={{ width: `${scratch ? (job?.status === "done" ? 100 : 60) : (pct ?? 5)}%`, background: "var(--gradient-meter)" }} />
      </div>
      {!scratch && (
        <>
          <p className="text-sm text-muted">
        {total
          ? pages
            ? t("importing.progressPages", { done, total, page: Math.min(job!.next_page, pages), pages })
            : t("importing.progress", { done, total })
          : t("importing.talking")}
          </p>
          <p className="text-xs text-muted">{t("importing.closeTab")}</p>
        </>
      )}
    </div>
  );
}

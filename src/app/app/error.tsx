"use client";

import { useI18n } from "@/i18n/client";
import { btnPrimary, card } from "@/components/ui";

/** Shown if something in the app screen crashes. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <div className={`${card} flex flex-col gap-3 p-5`} role="alert">
        <h1 className="font-display text-lg text-ink">{t("app.errorTitle")}</h1>
        <p className="text-sm text-muted">{t("app.crashText")}</p>
        <button type="button" onClick={reset} className={`${btnPrimary} self-start`}>
          {t("common.tryAgain")}
        </button>
      </div>
    </main>
  );
}

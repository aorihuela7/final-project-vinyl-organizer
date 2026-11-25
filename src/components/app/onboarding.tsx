"use client";

import { useState } from "react";
import { usernameIssue, type UsernameIssue } from "@/lib/validation";
import { useI18n } from "@/i18n/client";
import { renderMsg } from "@/i18n/core";
import { UsernameField } from "../sample-collections";
import { Banner, btnPrimary, btnSecondary, card } from "../ui";
import type { ShelfApp } from "./use-shelf-app";

/**
 * First screen when there's nothing yet: the demo, a Discogs collection (yours
 * or a public one), or an empty collection to fill by hand. No login wall.
 */
export function Onboarding({ app }: { app: ShelfApp }) {
  const { t } = useI18n();
  const previous = app.status.kind === "onboarding" ? app.status : null;
  const [username, setUsername] = useState(previous?.username ?? app.pendingImport ?? "");
  const [error, setError] = useState<UsernameIssue | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="font-display text-2xl text-ink">{t("onboarding.title")}</h1>
      {previous?.error && (
        <Banner tone="danger" role="alert">
          {renderMsg(t, previous.error)}
        </Banner>
      )}
      <div className={`${card} p-5`}>
        <h2 className="font-display text-lg text-ink">{t("onboarding.demoTitle")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("onboarding.demoText")} {app.mode === "local" ? t("onboarding.demoNoAccount") : ""}
        </p>
        <button type="button" onClick={app.startDemo} className={`${btnPrimary} mt-3`}>
          {t("onboarding.demoButton")}
        </button>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const issue = usernameIssue(username);
          if (issue) return setError(issue);
          setError(null);
          app.importDiscogs(username.trim());
        }}
        className={`${card} p-5`}
      >
        <h2 className="font-display text-lg text-ink">{t("onboarding.importTitle")}</h2>
        <label htmlFor="onboarding-username" className="mt-2 block text-sm text-muted">
          {t("onboarding.importLabel")}
        </label>
        <div className="mt-1 flex gap-2">
          <UsernameField id="onboarding-username" value={username} onChange={setUsername} invalid={!!error} className="flex-1" />
          <button type="submit" className={btnPrimary}>
            {t("common.import")}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-sm font-semibold text-danger">
            {t(`validation.${error}`)}
          </p>
        )}
        {app.mode === "local" && <p className="mt-2 text-xs text-muted">{t("onboarding.importAccount")}</p>}
      </form>
      <div className={`${card} p-5`}>
        <h2 className="font-display text-lg text-ink">{t("zero.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("zero.text")}</p>
        <button type="button" onClick={app.startFromZero} className={`${btnSecondary} mt-3`}>
          {t("zero.button")}
        </button>
        {app.mode === "local" && <p className="mt-2 text-xs text-muted">{t("onboarding.importAccount")}</p>}
      </div>
    </div>
  );
}

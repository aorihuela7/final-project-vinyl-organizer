"use client";

import { useState } from "react";
import { replacesCollection } from "@/lib/import/replace";
import { usernameIssue } from "@/lib/validation";
import { useI18n } from "@/i18n/client";
import { Banner, btnPrimary, btnPrimarySm, btnSecondarySm, card, input } from "../ui";
import type { ShelfApp } from "./use-shelf-app";

/**
 * Which collection this is, and a way to import another one. One collection per
 * user: a new import replaces the current collection and its shelves.
 */
export function CollectionPanel({ app }: { app: ShelfApp }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const count = app.data?.records.length ?? 0;
  const collection = app.data?.collection ?? null;
  const isDemo = app.mode === "local" || collection?.source === "demo";
  const summary =
    app.mode === "local"
      ? t("collection.demoLocal", { count })
      : isDemo
        ? t("collection.demo", { count })
        : t("collection.discogs", { count, username: collection?.discogs_username ?? "?" });

  return (
    <section aria-labelledby="collection-heading" className={`${card} p-[18px]`}>
      <h2 id="collection-heading" className="font-display text-xl text-ink">
        {t("collection.title")}
      </h2>
      <p className="mt-1 text-sm text-muted">{summary}</p>

      {confirming === null ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const issue = usernameIssue(username);
            if (issue) return setError(t(`validation.${issue}`));
            const name = username.trim();
            if (app.mode === "remote" && !replacesCollection(collection, { source: "discogs", discogs_username: name })) {
              return setError(t("collection.already"));
            }
            setError(null);
            setConfirming(name);
          }}
          className="mt-3"
        >
          <label htmlFor="replace-username" className="block text-sm text-ink">
            {isDemo ? t("collection.importOwn") : t("collection.importOther")}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="replace-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("collection.placeholder")}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              className={`${input} flex-1`}
            />
            <button type="submit" disabled={!!app.syncJob || app.busy} className={btnPrimary}>
              {t("common.import")}
            </button>
          </div>
          {app.syncJob && <p className="mt-1 text-xs text-muted">{t("collection.waitSync")}</p>}
          {error && (
            <p role="alert" className="mt-1 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </form>
      ) : (
        <Banner tone="warning" role="alert" className="mt-3">
          <p className="font-semibold">{t("collection.confirmTitle", { username: confirming })}</p>
          <p className="mt-1">{t("collection.confirmText", { count })}</p>
          {app.mode === "local" && <p className="mt-1">{t("collection.accountFirst")}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                app.importDiscogs(confirming);
                setConfirming(null);
                setUsername("");
              }}
              className={btnPrimarySm}
            >
              {t("collection.replace")}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className={btnSecondarySm}>
              {t("common.cancel")}
            </button>
          </div>
        </Banner>
      )}
    </section>
  );
}

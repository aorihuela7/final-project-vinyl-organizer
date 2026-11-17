"use client";

import { useState } from "react";
import { replacesCollection } from "@/lib/import/replace";
import { discogsUsernameSchema } from "@/lib/validation";
import type { ShelfApp } from "./use-shelf-app";

/**
 * Which collection this is, and a way to import another one. One collection per
 * user: a new import replaces the current collection and its shelves.
 */
export function CollectionPanel({ app }: { app: ShelfApp }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const count = app.data?.records.length ?? 0;
  const collection = app.data?.collection ?? null;
  const isDemo = app.mode === "local" || collection?.source === "demo";
  const records = `${count.toLocaleString("en-US")} record${count === 1 ? "" : "s"}`;
  const summary =
    app.mode === "local"
      ? `The demo collection: ${records}, kept in this browser.`
      : isDemo
        ? `The demo collection: ${records}.`
        : `The Discogs collection of “${collection?.discogs_username ?? "?"}”: ${records}.`;

  return (
    <section aria-labelledby="collection-heading" className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 id="collection-heading" className="font-semibold text-ink">
        Collection
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{summary}</p>

      {confirming === null ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = discogsUsernameSchema.safeParse(username);
            if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the username.");
            if (app.mode === "remote" && !replacesCollection(collection, { source: "discogs", discogs_username: parsed.data })) {
              return setError("That's already your collection. It updates from Discogs on its own.");
            }
            setError(null);
            setConfirming(parsed.data);
          }}
          className="mt-3"
        >
          <label htmlFor="replace-username" className="block text-sm text-ink">
            {isDemo ? "Import your own collection from Discogs instead" : "Import a different Discogs collection"}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="replace-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Discogs username"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              className="min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 py-2 text-base placeholder:text-ink-faint"
            />
            <button
              type="submit"
              disabled={!!app.syncJob || app.busy}
              className="rounded-control bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85 disabled:opacity-50"
            >
              Import
            </button>
          </div>
          {app.syncJob && <p className="mt-1 text-xs text-ink-muted">Wait for the update from Discogs to finish.</p>}
          {error && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div role="alert" className="mt-3 rounded-card bg-warning-soft p-3 text-sm">
          <p className="font-semibold text-warning">Replace your collection with the one of “{confirming}”?</p>
          <p className="mt-1 text-ink">
            Your {records} and your shelves are replaced, including records you added by hand. You&apos;ll set up your shelves again for the new
            collection. Nothing changes on Discogs.
          </p>
          {app.mode === "local" && <p className="mt-1 text-ink">You&apos;ll create a free account first.</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                app.importDiscogs(confirming);
                setConfirming(null);
                setUsername("");
              }}
              className="rounded-control bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover"
            >
              Replace my collection
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="rounded-control border border-line-strong px-4 py-2 font-medium hover:bg-sunken">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

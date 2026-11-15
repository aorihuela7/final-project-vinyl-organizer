"use client";

import { useState } from "react";
import { discogsUsernameSchema } from "@/lib/validation";
import type { ShelfApp } from "./use-shelf-app";

/** First screen when there's nothing yet: the demo or your own Discogs collection. No login wall. */
export function Onboarding({ app }: { app: ShelfApp }) {
  const [username, setUsername] = useState(app.pendingImport ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Let&apos;s map your shelf</h1>
      <div className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="font-semibold text-ink">Try the demo collection</h2>
        <p className="mt-1 text-sm text-ink-muted">1,000 real records on two prebuilt shelves. {app.mode === "local" ? "No account needed." : ""}</p>
        <button type="button" onClick={app.startDemo} className="mt-3 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">
          Load the demo
        </button>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = discogsUsernameSchema.safeParse(username);
          if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the username.");
          setError(null);
          app.importDiscogs(parsed.data);
        }}
        className="rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <h2 className="font-semibold text-ink">Import your collection from Discogs</h2>
        <label htmlFor="onboarding-username" className="mt-2 block text-sm text-ink-muted">
          Your Discogs username (the collection must be public)
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="onboarding-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            className="min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 py-2 text-base"
          />
          <button type="submit" className="rounded-control bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85">
            Import
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
        {app.mode === "local" && <p className="mt-2 text-xs text-ink-muted">You&apos;ll create a free account first, so your shelf is saved.</p>}
      </form>
    </div>
  );
}

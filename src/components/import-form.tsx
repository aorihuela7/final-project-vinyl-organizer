"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { discogsUsernameSchema } from "@/lib/validation";
import { setPendingImport } from "@/lib/local/pending";

/**
 * Lets anyone type their Discogs username without an account.
 * Signing up is asked right before the import starts, because the
 * resumable import job lives in the database.
 */
export function ImportForm() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = discogsUsernameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the username.");
      return;
    }
    setError(null);
    setPendingImport(parsed.data);
    if (isSignedIn) {
      router.push("/app");
    } else {
      clerk.openSignUp({ forceRedirectUrl: "/app", signInForceRedirectUrl: "/app" });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="discogs-username" className="text-sm font-medium text-ink">
        Your Discogs username
      </label>
      <div className="flex gap-2">
        <input
          id="discogs-username"
          name="username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby="discogs-username-help"
          placeholder="e.g. vinylcollector"
          className="min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint"
        />
        <button
          type="submit"
          className="shrink-0 rounded-control bg-ink px-4 py-2.5 text-sm font-semibold text-surface hover:bg-ink/85"
        >
          Import
        </button>
      </div>
      <p id="discogs-username-help" className={`text-sm ${error ? "text-danger" : "text-ink-muted"}`} role={error ? "alert" : undefined}>
        {error ?? "Your collection must be public on Discogs. You'll create a free account to save it."}
      </p>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { usernameIssue, type UsernameIssue } from "@/lib/validation";
import { setPendingImport } from "@/lib/local/pending";
import { ZERO_START } from "@/lib/config";
import { useI18n } from "@/i18n/client";
import { UsernameField } from "./sample-collections";
import { btnPrimary, btnSecondary } from "./ui";

/** Saves what to import and goes to the app, asking to sign up first if needed (the import job lives in the database). */
function useStartImport() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  return (username: string) => {
    setPendingImport(username);
    if (isSignedIn) {
      router.push("/app");
    } else {
      clerk.openSignUp({ forceRedirectUrl: "/app", signInForceRedirectUrl: "/app" });
    }
  };
}

/**
 * Lets anyone type their Discogs username without an account.
 * Signing up is asked right before the import starts, because the
 * resumable import job lives in the database.
 */
export function ImportForm() {
  const startImport = useStartImport();
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [error, setError] = useState<UsernameIssue | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const issue = usernameIssue(value);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    startImport(value.trim());
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="discogs-username" className="text-sm font-semibold text-ink">
        {t("importForm.label")}
      </label>
      <div className="flex gap-2">
        <UsernameField
          id="discogs-username"
          value={value}
          onChange={setValue}
          invalid={!!error}
          describedBy="discogs-username-help"
          placeholder={t("importForm.placeholder")}
          className="flex-1"
        />
        <button type="submit" className={`${btnPrimary} shrink-0`}>
          {t("common.import")}
        </button>
      </div>
      <p id="discogs-username-help" className={`text-sm ${error ? "font-semibold text-danger" : "text-muted"}`} role={error ? "alert" : undefined}>
        {error ? t(`validation.${error}`) : t("importForm.help")}
      </p>
    </form>
  );
}

/**
 * "Start from scratch" for people without a Discogs account: behind the scenes,
 * an import of an empty Discogs collection (ZERO_START), so the app works the
 * same as for everyone else; the user then adds records one by one.
 */
export function StartFromScratch() {
  const startImport = useStartImport();
  const { t } = useI18n();
  return (
    <button type="button" onClick={() => startImport(ZERO_START.username)} className={btnSecondary}>
      {t("zero.button")}
    </button>
  );
}

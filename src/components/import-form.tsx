"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { usernameIssue, type UsernameIssue } from "@/lib/validation";
import { setPendingImport } from "@/lib/local/pending";
import { useI18n } from "@/i18n/client";
import { btnPrimary, input } from "./ui";

/**
 * Lets anyone type their Discogs username without an account.
 * Signing up is asked right before the import starts, because the
 * resumable import job lives in the database.
 */
export function ImportForm() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
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
    setPendingImport(value.trim());
    if (isSignedIn) {
      router.push("/app");
    } else {
      clerk.openSignUp({ forceRedirectUrl: "/app", signInForceRedirectUrl: "/app" });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="discogs-username" className="text-sm font-semibold text-ink">
        {t("importForm.label")}
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
          placeholder={t("importForm.placeholder")}
          className={`${input} flex-1`}
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

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { APP_NAME } from "@/lib/config";
import { useI18n } from "@/i18n/client";
import { LanguageSelect, LocaleSync } from "./language-select";

function Bar({ children }: { children?: ReactNode }) {
  return (
    <header className="bg-wall">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-5 pb-2 sm:px-6">
        <Link href="/" className="font-display text-brand tracking-[0.3px] text-ink">
          {APP_NAME}
        </Link>
        {children}
      </div>
    </header>
  );
}

/** The app bar while the language is being read: the brand alone, same height. */
export function SiteHeaderFallback() {
  return (
    <Bar>
      <span className="h-9" aria-hidden />
    </Bar>
  );
}

/** App bar: the brand on the left; on the right the language selector, Help (the guided tour), "My shelf", and the account. Signing in never blocks the app. */
export function SiteHeader() {
  const { isLoaded, isSignedIn } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const showHelp = () => {
    if (pathname === "/app") window.dispatchEvent(new Event("ro:start-tour"));
    else router.push("/app?tour=1");
  };

  return (
    <Bar>
      <nav className="flex items-center gap-3 text-[15px]" aria-label={t("header.account")}>
        <LanguageSelect />
        <LocaleSync />
        <button
          type="button"
          onClick={showHelp}
          aria-label={t("header.helpLabel")}
          className="rounded-pill px-2 py-1.5 font-semibold text-ink hover:underline"
        >
          {t("header.help")}
        </button>
        {isLoaded && isSignedIn ? (
          <>
            <Link href="/app" className="rounded-pill px-2 py-1.5 font-semibold text-ink hover:underline">
              {t("header.myShelf")}
            </Link>
            <UserButton />
          </>
        ) : isLoaded ? (
          <>
            <SignInButton mode="modal">
              <button type="button" className="rounded-pill px-2 py-1.5 font-semibold text-ink hover:underline">
                {t("header.signIn")}
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="rounded-pill bg-ink px-4 py-1.5 font-semibold text-paper hover:bg-accent-hover">
                {t("header.signUp")}
              </button>
            </SignUpButton>
          </>
        ) : (
          <span className="h-9 w-32" aria-hidden />
        )}
      </nav>
    </Bar>
  );
}

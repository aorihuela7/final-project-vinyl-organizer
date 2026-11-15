"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { APP_NAME } from "@/lib/config";

/** Top bar. Sign in / Sign up never block the app: they sit here, optional. */
export function SiteHeader() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
          <span aria-hidden className="inline-block size-5 rounded-full border-[5px] border-ink bg-accent" />
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-2 text-sm" aria-label="Account">
          {isLoaded && isSignedIn ? (
            <>
              <Link href="/app" className="rounded-control px-3 py-2 font-medium text-ink hover:bg-sunken">
                My shelf
              </Link>
              <UserButton />
            </>
          ) : isLoaded ? (
            <>
              <SignInButton mode="modal">
                <button type="button" className="rounded-control px-3 py-2 font-medium text-ink hover:bg-sunken">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-control bg-ink px-3 py-2 font-medium text-surface hover:bg-ink/85"
                >
                  Sign up
                </button>
              </SignUpButton>
            </>
          ) : (
            <span className="h-9 w-32" aria-hidden />
          )}
        </nav>
      </div>
    </header>
  );
}

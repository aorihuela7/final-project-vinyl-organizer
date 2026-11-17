import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10">
      <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
        <SignUp fallbackRedirectUrl="/app" signInUrl="/sign-in" />
      </Suspense>
    </main>
  );
}

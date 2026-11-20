import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10">
      <Suspense fallback={<p className="text-muted" role="status">…</p>}>
        <SignIn fallbackRedirectUrl="/app" signUpUrl="/sign-up" />
      </Suspense>
    </main>
  );
}

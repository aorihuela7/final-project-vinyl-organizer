import { Suspense } from "react";
import { ShelfApp } from "@/components/app/shelf-app";

export const metadata = { title: "My shelf" };

export default function AppPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <Suspense fallback={<p className="py-16 text-center text-ink-muted">Loading your shelf…</p>}>
        <ShelfApp />
      </Suspense>
    </main>
  );
}

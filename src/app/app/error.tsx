"use client";

/** Shown if something in the app screen crashes. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card" role="alert">
        <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="text-sm text-ink-muted">Your shelf is safe. Try again, and if it keeps happening, reload the page.</p>
        <button type="button" onClick={reset} className="self-start rounded-control bg-ink px-4 py-2 text-sm font-semibold text-surface">
          Try again
        </button>
      </div>
    </main>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-16">
      <h1 className="text-2xl font-semibold text-ink">This page isn&apos;t on the shelf</h1>
      <p className="text-ink-muted">The link may be wrong or old.</p>
      <Link href="/" className="self-start rounded-control bg-ink px-4 py-2 text-sm font-semibold text-surface">
        Go to the start
      </Link>
    </main>
  );
}

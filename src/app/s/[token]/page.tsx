import { Suspense } from "react";
import { GuestShelf } from "@/components/guest/guest-shelf";

export const metadata = { title: "A shared shelf", robots: { index: false, follow: false } };

async function Shelf({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestShelf token={token} />;
}

/** /s/{token}: a shelf shared read-only by its owner. No account needed. */
export default function SharedShelfPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6">
      <Suspense fallback={null}>
        <Shelf params={params} />
      </Suspense>
    </main>
  );
}

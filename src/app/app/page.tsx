import { Suspense } from "react";
import { ShelfApp } from "@/components/app/shelf-app";
import { getTranslator } from "@/i18n/server";

export const metadata = { title: "My shelf" };

async function Loading() {
  const { t } = await getTranslator();
  return <p className="py-16 text-center text-muted">{t("app.loadingShelf")}</p>;
}

export default function AppPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6">
      <Suspense fallback={<Loading />}>
        <ShelfApp />
      </Suspense>
    </main>
  );
}

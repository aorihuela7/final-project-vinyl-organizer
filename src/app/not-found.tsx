import Link from "next/link";
import { getTranslator } from "@/i18n/server";
import { btnPrimary } from "@/components/ui";

export default async function NotFound() {
  const { t } = await getTranslator();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-16">
      <h1 className="font-display text-2xl text-ink">{t("notFound.title")}</h1>
      <p className="text-muted">{t("notFound.text")}</p>
      <Link href="/" className={`${btnPrimary} self-start`}>
        {t("notFound.home")}
      </Link>
    </main>
  );
}

import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { btnPrimary, btnSecondary, card } from "@/components/ui";
import { getTranslator } from "@/i18n/server";

export default async function Home() {
  const { t } = await getTranslator();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 md:flex-row md:items-start md:gap-14 md:py-14">
      <section className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">{t("landing.title")}</h1>
          <p className="text-lg leading-relaxed text-muted">{t("meta.pitch")}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/app?start=demo" className={btnPrimary}>
            {t("landing.tryDemo")}
          </Link>
          <Link href="/sign-up" className={btnSecondary}>
            {t("landing.signUp")}
          </Link>
        </div>
        <p className="text-sm text-muted">{t("landing.noAccount")}</p>

        <div className={`${card} p-5`}>
          <h2 className="mb-3 font-display text-lg text-ink">{t("landing.importTitle")}</h2>
          <ImportForm />
        </div>
      </section>
    </main>
  );
}

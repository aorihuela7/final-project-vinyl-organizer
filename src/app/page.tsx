import Link from "next/link";
import { AboutDiscogs } from "@/components/about-discogs";
import { ImportForm, StartFromScratch } from "@/components/import-form";
import { LandingHero } from "@/components/landing-hero";
import { btnPrimary, card } from "@/components/ui";
import { getTranslator } from "@/i18n/server";

export default async function Home() {
  const { t } = await getTranslator();
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-6 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-14 md:py-12">
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">{t("landing.title")}</h1>
          <p className="text-lg leading-relaxed text-muted">{t("meta.pitch")}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/app?start=demo" className={btnPrimary}>
            {t("landing.tryDemo")}
          </Link>
        </div>
        <p className="text-sm text-muted">{t("landing.noAccount")}</p>

        <div className={`${card} flex flex-col items-start gap-2 p-5`}>
          <h2 className="font-display text-lg text-ink">{t("zero.title")}</h2>
          <p className="text-sm text-muted">{t("zero.text")}</p>
          <StartFromScratch />
        </div>

        <div className={`${card} p-5`}>
          <h2 className="font-display text-lg text-ink">{t("landing.importTitle")}</h2>
          <AboutDiscogs text={t("landing.aboutDiscogs")} className="mt-1 mb-3" />
          <ImportForm />
        </div>
      </section>

      <section className="md:pt-2">
        <LandingHero />
      </section>
    </main>
  );
}

import { Suspense, type ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Belleza, Nunito_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InlineScript } from "@/components/inline-script";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import { LOCALE_COOKIE } from "@/i18n/core";
import { APP_NAME, APP_PITCH } from "@/lib/config";
import "./globals.css";

const belleza = Belleza({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-belleza", display: "swap" });
const nunito = Nunito_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_PITCH,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#d3dbcd",
};

/** Sets <html lang> from the locale cookie before the first paint (the shell is prerendered in English). */
const LANG_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${LOCALE_COOKIE}=(en|es|pt)(?:;|$)/);if(m)document.documentElement.lang=m[1]==="pt"?"pt-BR":m[1]}catch(e){}`;

/** Reads the language inside the Suspense boundary, so the rest of each route can still be prerendered. */
async function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${belleza.variable} ${nunito.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <InlineScript html={LANG_SCRIPT} />
      </head>
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <Suspense fallback={<SiteHeaderFallback />}>
            <LocaleRoot>
              <SiteHeader />
              <div className="flex flex-1 flex-col">{children}</div>
            </LocaleRoot>
          </Suspense>
          <SiteFooter />
        </ClerkProvider>
      </body>
    </html>
  );
}

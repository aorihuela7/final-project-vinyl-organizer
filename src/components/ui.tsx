/**
 * Shared Nogal building blocks: pill buttons, pill inputs, paper cards, and
 * banners. Class strings rather than wrappers where a wrapper would only get
 * in the way (Clerk buttons, links, form controls).
 */
import type { ReactNode } from "react";

/** Primary: an ink pill with paper text. */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

/** Secondary: an outlined ink pill on a transparent background. */
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-ink bg-transparent px-5 py-2.5 text-[15px] text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50";

/** Small variants for dense places (sheets, lists). */
export const btnPrimarySm =
  "inline-flex items-center justify-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-sm font-semibold text-paper hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondarySm =
  "inline-flex items-center justify-center gap-1.5 rounded-pill border border-ink bg-transparent px-4 py-1.5 text-sm text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50";

/** A quiet text button. */
export const btnText = "rounded-pill px-2 py-1 text-sm font-semibold text-ink underline-offset-2 hover:underline disabled:opacity-50";

/** Inputs and selects: paper pills with a 1 px line. */
export const input =
  "min-w-0 rounded-pill border border-input-line bg-paper px-4 py-2 text-base text-ink placeholder:text-muted disabled:opacity-50";

/** A paper card. */
export const card = "rounded-card bg-paper shadow-card";

/** A paper strip with a 4 px mustard rule on the left. Links inside are underlined ink. */
export function Banner({
  children,
  tone = "info",
  role = "status",
  className = "",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "danger";
  role?: "status" | "alert";
  className?: string;
}) {
  const rule = tone === "danger" ? "border-l-danger" : "border-l-mustard";
  return (
    <div
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      className={`rounded-card border-l-4 ${rule} bg-paper px-3 py-2 text-sm text-ink shadow-card [&_a]:underline [&_a]:underline-offset-2 ${className}`}
    >
      {children}
    </div>
  );
}

/** The walnut band used as a card header (record detail, tour). */
export function WalnutBand({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surface-walnut px-[18px] py-3 ${className}`}>{children}</div>;
}

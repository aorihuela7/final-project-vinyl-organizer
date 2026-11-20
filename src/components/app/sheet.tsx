"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";

/**
 * A bottom sheet on phones, a centered panel on larger screens. Escape and the
 * backdrop close it; focus stays inside while it's open and returns after.
 * `bare` drops the header so the content brings its own (the record card's walnut band).
 */
export function Sheet({
  title,
  onClose,
  children,
  labelledBy,
  wide = false,
  bare = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  /** Wider on larger screens (the compartment view). */
  wide?: boolean;
  bare?: boolean;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = labelledBy ?? "sheet-title";

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      // Keep focus inside the dialog.
      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label={t("common.close")} className="absolute inset-0 bg-ink/45" onClick={onClose} tabIndex={-1} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-sheet
        className={`relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[10px] bg-paper shadow-sheet outline-none sm:rounded-card ${wide ? "sm:max-w-3xl" : ""}`}
      >
        {!bare && (
          <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
            <h2 id={titleId} className="min-w-0 font-display text-xl text-ink">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="-mr-1 shrink-0 rounded-pill px-3 py-1 text-sm font-semibold text-ink hover:bg-ink/5">
              {t("common.close")}
            </button>
          </div>
        )}
        <div className={`overflow-y-auto overscroll-contain ${bare ? "" : "px-4 py-4"}`}>{children}</div>
      </div>
    </div>
  );
}

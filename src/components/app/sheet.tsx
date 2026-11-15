"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A bottom sheet on phones, a centered panel on larger screens. Escape and the backdrop close it. */
export function Sheet({
  title,
  onClose,
  children,
  labelledBy,
  wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  /** Wider on larger screens (the compartment view's spines). */
  wide?: boolean;
}) {
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
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onClose} tabIndex={-1} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-card bg-surface shadow-sheet outline-none sm:rounded-card ${wide ? "sm:max-w-3xl" : ""}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="min-w-0 text-base font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-control px-2 py-1 text-sm font-medium text-ink-muted hover:bg-sunken"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

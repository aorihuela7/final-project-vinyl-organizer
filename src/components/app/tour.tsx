"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPreferences, savePreferences, type TourStatus } from "@/lib/store/preferences";
import { useI18n } from "@/i18n/client";
import { Banner, btnPrimary, btnPrimarySm, btnSecondary, btnSecondarySm } from "../ui";
import { Sheet } from "./sheet";

const LOCAL_KEY = "ro:tour";
export const START_TOUR_EVENT = "ro:start-tour";

export type TourStepId = "search" | "rail" | "compartment" | "record" | "add" | "setup" | "language" | "done";
export type TourStep = {
  id: TourStepId;
  /** CSS selector of the element to point at; none for the closing step. */
  target?: string;
  /** Runs when the step opens (e.g. open a sample record). */
  enter?: () => void;
  /** Runs when the tour leaves the step. */
  leave?: () => void;
};

function readLocal(): TourStatus | null {
  try {
    const v = localStorage.getItem(LOCAL_KEY);
    return v === "offered" || v === "accepted_pending" || v === "completed" || v === "dismissed" ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(status: TourStatus) {
  try {
    localStorage.setItem(LOCAL_KEY, status);
  } catch {
    // The tour just gets offered again next time.
  }
}

/**
 * Whether to offer the tour, wait for the shelf, or run it. The state lives
 * in localStorage for the accountless demo and in user_preferences when signed in.
 */
export function useTourState({
  mode,
  userId,
  supabase,
  ready,
  hasMap,
}: {
  mode: "local" | "remote" | null;
  userId: string | null | undefined;
  supabase: SupabaseClient | null;
  /** The app finished loading (a shelf, onboarding, or an import on screen). */
  ready: boolean;
  hasMap: boolean;
}) {
  const [status, setStatusState] = useState<TourStatus | null | undefined>(undefined);
  const [active, setActive] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Load the saved status once per mode and user.
  useEffect(() => {
    if (!mode || (mode === "remote" && (!supabase || !userId))) return;
    const key = mode === "remote" ? `remote:${userId}` : "local";
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    if (mode === "local") {
      void Promise.resolve().then(() => setStatusState(readLocal()));
      return;
    }
    void loadPreferences(supabase!)
      .then(async (prefs) => {
        let saved = prefs.tourStatus;
        // A visitor who answered in the demo before signing up isn't asked again.
        const local = readLocal();
        if (!saved && local && local !== "offered") {
          saved = local;
          await savePreferences(supabase!, userId!, { tourStatus: local }).catch(() => {});
        }
        setStatusState(saved);
      })
      .catch(() => setStatusState("dismissed"));
  }, [mode, supabase, userId]);

  const setStatus = useCallback(
    (next: TourStatus) => {
      setStatusState(next);
      if (mode === "remote" && supabase && userId) void savePreferences(supabase, userId, { tourStatus: next }).catch(() => {});
      else writeLocal(next);
    },
    [mode, supabase, userId],
  );

  // Offer it the first time: the first demo visit, or right after signing up.
  const offer = ready && status === null && !active;
  // "Show me around" before the first map: start as soon as the shelf is ready.
  const waiting = status === "accepted_pending" && !hasMap;
  const start = useCallback(() => setActive(true), []);
  useEffect(() => {
    if (status === "accepted_pending" && hasMap && ready && !active) {
      const timer = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(timer);
    }
  }, [status, hasMap, ready, active]);

  return {
    offer,
    waiting,
    active,
    accept: () => {
      if (hasMap) {
        setStatus("offered");
        setActive(true);
      } else setStatus("accepted_pending");
    },
    decline: () => setStatus("dismissed"),
    start,
    end: (finished: boolean) => {
      setActive(false);
      setStatus(finished ? "completed" : "dismissed");
    },
  };
}

/** "Want a quick tour?" */
export function TourOffer({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet title={t("tour.offerTitle")} onClose={onDecline} labelledBy="tour-offer-title">
      <div className="flex flex-col gap-4">
        <p className="text-ink">{t("tour.offerText")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAccept} className={btnPrimary} autoFocus>
            {t("tour.showMe")}
          </button>
          <button type="button" onClick={onDecline} className={btnSecondary}>
            {t("tour.notNow")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function TourWaiting() {
  const { t } = useI18n();
  return <Banner>{t("tour.waiting")}</Banner>;
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;

/**
 * The tour itself: a spotlight around the real element and a popover next to
 * it, with Back, Next, Skip, and progress. Focus moves into the popover, Esc
 * closes, the arrow keys move between steps, and focus returns at the end.
 */
export function TourOverlay({ steps, onEnd }: { steps: TourStep[]; onEnd: (finished: boolean) => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;
  // The steps come from the parent and are rebuilt on every render; effects read the latest ones by index.
  const stepsRef = useRef(steps);
  useLayoutEffect(() => {
    stepsRef.current = steps;
  });

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    return () => returnTo.current?.focus?.();
  }, []);

  // Enter and leave each step, then find and frame its element.
  useLayoutEffect(() => {
    const step = stepsRef.current[index]!;
    step.enter?.();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const measure = () => {
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    // The element may appear a moment later (the record card opens on enter).
    const timer = setTimeout(() => {
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      el?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      measure();
      nextButton.current?.focus();
    }, step.enter ? 350 : 30);
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      step.leave?.();
    };
  }, [index]);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = i + delta;
        if (next >= steps.length) {
          onEnd(true);
          return i;
        }
        return Math.max(0, next);
      });
    },
    [steps.length, onEnd],
  );

  // Keys in the capture phase, so an open sheet underneath doesn't also react to Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onEnd(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        go(-1);
      } else if (e.key === "Tab" && popover.current) {
        e.stopPropagation();
        const focusable = Array.from(popover.current.querySelectorAll<HTMLElement>("button"));
        const first = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (!first || !lastEl) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        } else if (!popover.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onEnd]);

  // Place the popover below the element when there's room, otherwise above; centered when there's no element.
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const width = Math.min(340, vw - 32);
  let style: React.CSSProperties;
  if (rect) {
    const below = vh - (rect.top + rect.height) > 230 || rect.top < 230;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), vw - width - 16);
    style = below ? { top: Math.min(rect.top + rect.height + 12, vh - 220), left, width } : { bottom: vh - rect.top + 12, left, width };
  } else {
    style = { top: "50%", left: "50%", width, transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Blocks the page while the tour runs; the spotlight is a hole in a giant shadow. */}
      <div className="absolute inset-0" aria-hidden />
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[6px] shadow-[0_0_0_9999px_rgb(34_48_42/0.55)] transition-all duration-300"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-ink/55" />
      )}
      <div
        ref={popover}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        className="absolute overflow-hidden rounded-card bg-paper shadow-sheet"
        style={style}
      >
        <div className="surface-walnut flex items-baseline justify-between gap-3 px-4 py-2">
          <h2 id="tour-title" className="font-display text-lg">
            {t(`tour.steps.${step.id}.title`)}
          </h2>
          <span className="text-xs opacity-85 tabular-nums">{t("tour.progress", { n: index + 1, total: steps.length })}</span>
        </div>
        <p id="tour-text" className="px-4 pt-3 text-sm text-ink">
          {t(`tour.steps.${step.id}.text`)}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-4">
          {!last ? (
            <button type="button" onClick={() => onEnd(false)} className="text-sm font-semibold text-ink underline underline-offset-2">
              {t("tour.skip")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={() => go(-1)} className={btnSecondarySm}>
                {t("tour.back")}
              </button>
            )}
            <button ref={nextButton} type="button" onClick={() => go(1)} className={btnPrimarySm}>
              {last ? t("tour.finish") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

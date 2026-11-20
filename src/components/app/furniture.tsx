"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

/** Widest a compartment gets on the map, so a tower doesn't fill the screen. */
export const MAX_CELL_PX = 190;

/** Frame padding (2 × 14) and the gap between compartments, in px. */
const FRAME_PX = 28;
const GAP_PX = 10;

/**
 * One compartment width for every shelf on a page (a CSS length), so a CD
 * tower is drawn at the same scale as a Kallax of LPs: the width the widest
 * shelf (most columns) gets in its container, at most MAX_CELL_PX. Needs a
 * container (`@container`) around the shelves.
 */
export function sharedCell(maxCols: number): string {
  const cols = Math.max(1, maxCols);
  return `min(${MAX_CELL_PX}px, (100cqw - ${FRAME_PX + (cols - 1) * GAP_PX}px) / ${cols})`;
}

/**
 * A piece of walnut furniture: the frame with a faint top highlight, a header
 * line in the display face (name on the left, a count on the right), the grid
 * of compartments, and two tapered legs splayed outward.
 */
export function Furniture({
  title,
  aside,
  cols,
  children,
  className = "",
  maxCell = MAX_CELL_PX,
  label,
}: {
  title: ReactNode;
  aside?: ReactNode;
  cols: number;
  children: ReactNode;
  className?: string;
  /** Widest a compartment gets: px, or a CSS length shared by every shelf on the page (sharedCell). */
  maxCell?: number | string;
  label?: string;
}) {
  // Frame padding plus the gaps between compartments.
  const extra = (cols - 1) * GAP_PX + FRAME_PX;
  const maxWidth = typeof maxCell === "number" ? cols * maxCell + extra : `calc(${cols} * ${maxCell} + ${extra}px)`;
  return (
    <section aria-label={label} className={`relative mb-[34px] w-full ${className}`} style={{ maxWidth }}>
      <div className="surface-walnut relative rounded-[4px] px-[14px] pt-[14px] pb-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]">
        {/* On a narrow shelf (a one-column tower) the count wraps under the name instead of cutting it. */}
        <div className="-mt-1 mb-2.5 flex flex-wrap justify-between gap-x-2.5 px-0.5 font-display text-sm text-on-walnut">
          <span className="min-w-0 truncate">{title}</span>
          {aside !== undefined && <span className="shrink-0 tabular-nums">{aside}</span>}
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {children}
        </div>
      </div>
      <Leg side="left" />
      <Leg side="right" />
    </section>
  );
}

function Leg({ side }: { side: "left" | "right" }) {
  const style: CSSProperties = {
    background: "var(--gradient-leg)",
    transform: `skewX(${side === "left" ? 8 : -8}deg)`,
    [side]: 26,
  };
  return <span aria-hidden className="absolute -bottom-[32px] h-[34px] w-3 rounded-b-[6px]" style={style} />;
}

/**
 * One compartment: the interior (walnut, with inset shadows from the top and
 * the left) and its brass plate centered below. A container, so the plate and
 * the count shrink in narrow compartments.
 */
export function Compartment({
  children,
  plate,
  blocked,
  found,
  aspect = 1,
  interactive,
  ariaLabel,
  ariaPressed,
  onActivate,
  dataSlot,
}: {
  children?: ReactNode;
  plate?: ReactNode;
  blocked?: ReactNode;
  found?: boolean;
  aspect?: number;
  interactive?: boolean;
  ariaLabel?: string;
  ariaPressed?: boolean;
  onActivate?: () => void;
  dataSlot?: string;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (!onActivate) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };
  return (
    <div className="@container grid min-w-0 content-start gap-1.5" data-slot={dataSlot}>
      {blocked !== undefined ? (
        <div
          className="grid place-items-center bg-walnut-blocked px-1 text-center text-[13px] text-on-walnut @max-[80px]:text-2xs"
          style={{ aspectRatio: aspect }}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-label={ariaLabel}
          aria-pressed={ariaPressed}
          onClick={interactive ? onActivate : undefined}
          onKeyDown={interactive ? onKeyDown : undefined}
        >
          {blocked}
        </div>
      ) : (
        <div
          className={`surface-interior relative overflow-hidden ${interactive ? "cursor-pointer" : ""} ${found ? "outline-3 -outline-offset-1 outline-mustard" : ""}`}
          style={{ aspectRatio: aspect }}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-label={ariaLabel}
          aria-pressed={ariaPressed}
          data-found={found ? "true" : undefined}
          onClick={interactive ? onActivate : undefined}
          onKeyDown={interactive ? onKeyDown : undefined}
        >
          {children}
        </div>
      )}
      {/* Blocked compartments have no plate; an invisible one keeps the rows aligned. */}
      {plate !== undefined ? plate : <span aria-hidden className="invisible block h-[23px]" />}
    </div>
  );
}

export type PlateLineText = { lead?: string; text: string };

/**
 * A brass nameplate: one line for letter ranges, two only in the genre case.
 * In a narrow compartment a single genre line breaks into the genre over its range.
 */
export function Plate({ lines, title }: { lines: Array<string | PlateLineText>; title?: string }) {
  const single = lines.length === 1;
  return (
    <span
      title={title}
      className="surface-brass mx-auto block max-w-[92%] truncate rounded-plate px-3 py-[3px] text-center font-display text-sm leading-[1.2] shadow-plate @max-[80px]:px-1.5 @max-[80px]:text-xs"
    >
      {lines.map((line, i) => {
        const { lead, text } = typeof line === "string" ? { lead: undefined, text: line } : line;
        return (
          <span key={i} className="block truncate">
            {lead && (
              <>
                <span className={single ? "@max-[80px]:block @max-[80px]:truncate" : ""}>{lead}</span>{" "}
              </>
            )}
            <span className={lead && single ? "@max-[80px]:block @max-[80px]:truncate" : ""}>{text}</span>
          </span>
        );
      })}
    </span>
  );
}

/** The count in a compartment's top-right corner; mustard from 90% full. */
export function CountBadge({ count, capacity, long, short }: { count: number; capacity: number; long: string; short: string }) {
  const tight = capacity > 0 && count / capacity >= 0.9;
  return (
    <span
      aria-hidden
      className={`absolute top-[5px] right-1.5 rounded-[3px] px-[5px] text-2xs leading-[1.3] tabular-nums ${
        tight ? "bg-mustard font-semibold text-ink" : "bg-(--color-badge) text-on-walnut"
      }`}
    >
      <span className="@max-[80px]:hidden">{long}</span>
      <span className="hidden @max-[80px]:inline">{short}</span>
    </span>
  );
}

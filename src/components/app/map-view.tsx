"use client";

import { rangeLabels, type Slot } from "@/lib/layout";
import { toSortSettings, type FurnitureConfig, type MediaView, type ShelfConfig } from "@/lib/shelf/model";
import { slotPlace } from "@/lib/shelf/describe";
import { DiscogsAttribution } from "./discogs-attribution";

type Props = {
  config: ShelfConfig;
  views: MediaView[];
  highlight: string | null;
  onOpen: (slot: Slot) => void;
};

/** Each shelf as a grid: every compartment shows its range and how full it is; blocked ones are shaded. */
export function MapView({ config, views, highlight, onOpen }: Props) {
  const settings = toSortSettings(config.settings);
  const slotAt = new Map<string, Slot>();
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const view of views) {
    for (const s of view.index.slots) slotAt.set(`${s.shelfKey}:${s.row}:${s.col}`, s);
    for (const [id, l] of rangeLabels(view.index, settings)) labels.set(id, l.label);
    for (const [id, list] of view.index.bySlot) counts.set(id, list.length);
  }

  const furniture = [...config.furniture].sort((a, b) => a.sortIndex - b.sortIndex);
  return (
    <div className="flex flex-col gap-6">
      {furniture.map((f) => (
        <ShelfGrid key={f.key} furniture={f} slotAt={slotAt} labels={labels} counts={counts} highlight={highlight} onOpen={onOpen} />
      ))}
      <DiscogsAttribution />
    </div>
  );
}

function ShelfGrid({
  furniture: f,
  slotAt,
  labels,
  counts,
  highlight,
  onOpen,
}: {
  furniture: FurnitureConfig;
  slotAt: Map<string, Slot>;
  labels: Map<string, string>;
  counts: Map<string, number>;
  highlight: string | null;
  onOpen: (slot: Slot) => void;
}) {
  let total = 0;
  let capacity = 0;
  for (let row = 0; row < f.rows; row++)
    for (let col = 0; col < f.cols; col++) {
      const s = slotAt.get(`${f.key}:${row}:${col}`);
      if (s) {
        total += counts.get(s.id) ?? 0;
        capacity += s.capacity;
      }
    }

  return (
    <section aria-label={f.name} className="rounded-card border border-line bg-surface p-3 shadow-card">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink">
          {f.name} <span className="text-sm font-normal text-ink-muted">· {f.media === "cd" ? "CDs" : "Vinyl"}</span>
        </h3>
        <p className="text-xs text-ink-muted">
          {total.toLocaleString("en-US")} / {capacity.toLocaleString("en-US")} · {capacity ? Math.round((total / capacity) * 100) : 0}% full
        </p>
      </header>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${f.cols}, minmax(0, 1fr))`, maxWidth: `${f.cols * 10}rem` }}>
        {Array.from({ length: f.rows * f.cols }, (_, i) => {
          const row = Math.floor(i / f.cols);
          const col = i % f.cols;
          const slot = slotAt.get(`${f.key}:${row}:${col}`);
          if (!slot) {
            return (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-cell bg-blocked text-[10px] text-ink-faint sm:text-xs"
                aria-label={`Blocked, ${slotPlace({ row, col }, f)}`}
              >
                Blocked
              </div>
            );
          }
          const count = counts.get(slot.id) ?? 0;
          const fill = slot.capacity ? Math.min(1, count / slot.capacity) : 0;
          const over = count > slot.capacity;
          const isHighlight = highlight === slot.id;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onOpen(slot)}
              aria-label={`${slotPlace(slot, f)}: ${labels.get(slot.id) ?? "empty"}, ${count} of ${slot.capacity}${over ? ", over capacity" : ""}`}
              className={`flex aspect-square min-w-0 flex-col justify-between rounded-cell border p-1.5 text-left transition-colors ${
                isHighlight ? "border-accent bg-accent-soft ring-2 ring-accent" : "border-line bg-canvas hover:border-line-strong"
              }`}
            >
              <span className="line-clamp-3 break-words text-[11px] font-medium leading-tight text-ink sm:text-xs">
                {labels.get(slot.id) ?? <span className="text-ink-faint">Empty</span>}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={`text-[10px] leading-none ${over ? "font-semibold text-danger" : "text-ink-muted"}`}>
                  {count}/{slot.capacity}
                  {over ? " !" : ""}
                </span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className={`block h-full ${over ? "bg-danger" : "bg-ink/70"}`} style={{ width: `${fill * 100}%` }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

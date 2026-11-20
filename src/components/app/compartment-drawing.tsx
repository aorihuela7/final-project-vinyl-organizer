"use client";

import { memo, useMemo } from "react";
import { leanLayout, type LeanRecord, type RecordSize } from "@/lib/visual/lean";
import { recordColor } from "@/lib/design";

export type DrawingRecord = { id: string; size: RecordSize };

type Props = {
  records: readonly DrawingRecord[];
  capacity: number;
  /** viewBox size: 100 × 100 for a square cube, 160 × 100 for the record detail. */
  width?: number;
  height?: number;
  /** The record that was found: mustard with an ink stroke. */
  foundId?: string | null;
  /** Lift the found record along its own angle (the "found moment"). */
  lifted?: boolean;
  /** Called with the record under the pointer (compartment view only). */
  onHover?: (id: string | null) => void;
  onPick?: (id: string) => void;
  className?: string;
};

/** A stable seed per compartment content, so the same compartment looks the same everywhere. */
function seedOf(records: readonly DrawingRecord[]): number {
  let h = records.length;
  for (const r of records.slice(0, 3)) for (let i = 0; i < r.id.length; i++) h = (Math.imul(h, 31) + r.id.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * One compartment seen from the front, as an SVG: one thin shape per record in
 * shelf order, each one record's share of the capacity wide, colored by a hash
 * of its ID, with heights by size, leaning into the free space. One component
 * in three sizes (map, compartment view, record detail), so a compartment
 * looks identical everywhere. Memoized: typing in the search doesn't redraw it.
 */
export const CompartmentDrawing = memo(function CompartmentDrawing({
  records,
  capacity,
  width = 100,
  height = 100,
  foundId = null,
  lifted = false,
  onHover,
  onPick,
  className = "",
}: Props) {
  const layout = useMemo(() => leanLayout(records, { capacity, width, height, seed: seedOf(records) }), [records, capacity, width, height]);
  const scale = width / 100;
  const interactive = !!(onHover || onPick);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`absolute inset-0 block h-full w-full ${className}`}
      aria-hidden="true"
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      {layout.records.map((r) => (
        <RecordShape
          key={r.id}
          record={r}
          floor={layout.floor}
          found={r.id === foundId}
          lifted={lifted && r.id === foundId}
          scale={scale}
          interactive={interactive}
          onHover={onHover}
          onPick={onPick}
        />
      ))}
    </svg>
  );
});

function RecordShape({
  record: r,
  floor,
  found,
  lifted,
  scale,
  interactive,
  onHover,
  onPick,
}: {
  record: LeanRecord;
  floor: number;
  found: boolean;
  lifted: boolean;
  scale: number;
  interactive: boolean;
  onHover?: (id: string | null) => void;
  onPick?: (id: string) => void;
}) {
  return (
    <g transform={`rotate(${(-r.angle).toFixed(2)} ${r.x.toFixed(2)} ${floor.toFixed(2)})`}>
      <rect
        x={r.x.toFixed(2)}
        y={(floor - r.height).toFixed(2)}
        width={r.width.toFixed(2)}
        height={r.height.toFixed(2)}
        className="transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{
          fill: found ? "var(--color-mustard)" : recordColor(r.id),
          stroke: found ? "var(--color-ink)" : "var(--color-record-stroke)",
          strokeWidth: (found ? 0.35 : 0.2) * scale,
          transform: lifted ? `translateY(${-6 * scale}px)` : undefined,
          cursor: interactive ? "pointer" : undefined,
        }}
        onMouseEnter={onHover ? () => onHover(r.id) : undefined}
        onClick={onPick ? () => onPick(r.id) : undefined}
      />
    </g>
  );
}

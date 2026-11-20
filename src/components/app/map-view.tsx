"use client";

import { useMemo, type ReactNode } from "react";
import type { ShelfMedia, Slot } from "@/lib/layout";
import { sizeOf, toSortSettings, type FurnitureConfig, type MediaView, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { slotPlace } from "@/lib/shelf/describe";
import { isBoxTemplate } from "@/lib/shelf/templates";
import { plateLabels, plateLines, type Plate as PlateData } from "@/lib/visual/plates";
import { genreName } from "@/i18n/core";
import { useI18n } from "@/i18n/client";
import { CompartmentDrawing, type DrawingRecord } from "./compartment-drawing";
import { Compartment, CountBadge, Furniture, Plate, type PlateLineText } from "./furniture";
import { DiscogsAttribution } from "./discogs-attribution";

type Props = {
  config: ShelfConfig;
  views: MediaView[];
  byId: Map<string, StoredRecord>;
  /** The record that was found: its compartment gets the mustard outline and the record lifts. */
  foundId: string | null;
  foundSlot: string | null;
  lifted: boolean;
  onOpen: (slot: Slot) => void;
  /** A compartment to highlight briefly (after jumping to it from the rail). */
  flashSlot?: string | null;
  /** Rendered above the shelves of each format group (the brass rail). */
  railFor?: (view: MediaView) => ReactNode;
};

/** Box templates (crates, record boxes) are a bit wider than tall; Kallax cubes are square. */
export function aspectOf(f: Pick<FurnitureConfig, "template">): number {
  return isBoxTemplate(f.template) ? 1.25 : 1;
}

export type GroupData = {
  view: MediaView;
  plates: Map<string, PlateData>;
  drawings: Map<string, DrawingRecord[]>;
  slotAt: Map<string, Slot>;
};

/** Plates and drawing inputs for one format group, computed once per data change. */
export function useGroupData(views: MediaView[], config: ShelfConfig, byId: Map<string, StoredRecord>): GroupData[] {
  const { locale, t } = useI18n();
  return useMemo(() => {
    const settings = toSortSettings(config.settings);
    return views.map((view) => {
      const plates = plateLabels(view.index, settings, { noYear: t("map.noYear"), genreName: (g) => genreName(locale, g) });
      const drawings = new Map<string, DrawingRecord[]>();
      for (const [slotId, list] of view.index.bySlot) {
        drawings.set(
          slotId,
          list.map((r) => {
            const stored = byId.get(r.id);
            return { id: r.id, size: (stored ? sizeOf(stored) : null) ?? (view.media === "single" ? 7 : 12) };
          }),
        );
      }
      const slotAt = new Map<string, Slot>();
      for (const s of view.index.slots) slotAt.set(`${s.shelfKey}:${s.row}:${s.col}`, s);
      return { view, plates, drawings, slotAt };
    });
  }, [views, config.settings, byId, locale, t]);
}

const EMPTY: DrawingRecord[] = [];

/**
 * The map: for each format group, its brass rail and its shelves as walnut
 * furniture. Every compartment shows a drawing of its records, its letters on
 * a brass plate, and how full it is.
 */
export function MapView({ config, views, byId, foundId, foundSlot, lifted, onOpen, flashSlot = null, railFor }: Props) {
  const { t, n, locale } = useI18n();
  const groups = useGroupData(views, config, byId);
  const furniture = [...config.furniture].sort((a, b) => a.sortIndex - b.sortIndex);
  const multipleGroups = groups.filter((g) => furniture.some((f) => f.media === g.view.media)).length > 1;
  const genre = (g: string) => genreName(locale, g);
  const genresCount = (count: number) => t("map.genresCount", { count });

  return (
    <div className="flex flex-col gap-2" data-map>
      {groups.map((group) => {
        const shelves = furniture.filter((f) => f.media === group.view.media);
        if (shelves.length === 0) return null;
        return (
          <section key={group.view.media} aria-label={t(`media.${group.view.media}`)} className="flex flex-col gap-3">
            {multipleGroups && <h2 className="font-display text-lg text-ink">{t(`media.${group.view.media}` as const)}</h2>}
            {railFor?.(group.view)}
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
              {shelves.map((f) => (
                <ShelfFurniture
                  key={f.key}
                  furniture={f}
                  media={group.view.media}
                  group={group}
                  foundId={foundId}
                  foundSlot={foundSlot}
                  lifted={lifted}
                  flashSlot={flashSlot}
                  onOpen={onOpen}
                  plateLines={(p) => plateLines(p, genre, genresCount)}
                  t={t}
                  n={n}
                />
              ))}
            </div>
          </section>
        );
      })}
      <DiscogsAttribution />
    </div>
  );
}

function ShelfFurniture({
  furniture: f,
  media,
  group,
  foundId,
  foundSlot,
  lifted,
  flashSlot,
  onOpen,
  plateLines,
  t,
  n,
}: {
  furniture: FurnitureConfig;
  media: ShelfMedia;
  group: GroupData;
  foundId: string | null;
  foundSlot: string | null;
  lifted: boolean;
  flashSlot: string | null;
  onOpen: (slot: Slot) => void;
  plateLines: (p: PlateData) => PlateLineText[];
  t: ReturnType<typeof useI18n>["t"];
  n: ReturnType<typeof useI18n>["n"];
}) {
  let total = 0;
  let capacity = 0;
  for (let row = 0; row < f.rows; row++)
    for (let col = 0; col < f.cols; col++) {
      const s = group.slotAt.get(`${f.key}:${row}:${col}`);
      if (s) {
        total += group.view.index.bySlot.get(s.id)?.length ?? 0;
        capacity += s.capacity;
      }
    }
  const aspect = aspectOf(f);

  return (
    <Furniture
      cols={f.cols}
      label={f.name}
      title={t("map.shelfTitle", { name: f.name, media: t(`media.${media}`) })}
      aside={t("map.holdsOf", { count: total, capacity })}
    >
      {Array.from({ length: f.rows * f.cols }, (_, i) => {
        const row = Math.floor(i / f.cols);
        const col = i % f.cols;
        const slot = group.slotAt.get(`${f.key}:${row}:${col}`);
        if (!slot) return <Compartment key={i} aspect={aspect} blocked={t("map.blocked")} />;
        const records = group.drawings.get(slot.id) ?? EMPTY;
        const plate = group.plates.get(slot.id);
        const count = records.length;
        const isFound = foundSlot === slot.id;
        const place = slotPlace(slot, f, t);
        const label = plate
          ? `${place}: ${t("map.openCompartment", { range: plate.full, count, capacity: slot.capacity })}${count > slot.capacity ? `, ${t("map.overCapacity")}` : ""}`
          : t("map.openEmpty", { place });
        return (
          <Compartment
            key={i}
            aspect={aspect}
            interactive
            found={isFound || flashSlot === slot.id}
            ariaLabel={label}
            onActivate={() => onOpen(slot)}
            dataSlot={slot.id}
            plate={plate ? <Plate lines={plateLines(plate)} title={plate.full} /> : <Plate lines={[t("map.empty")]} />}
          >
            <CompartmentDrawing
              records={records}
              capacity={slot.capacity}
              width={100 * aspect}
              height={100}
              foundId={isFound ? foundId : null}
              lifted={isFound && lifted}
            />
            <CountBadge count={count} capacity={slot.capacity} long={t("map.badge", { count, capacity: slot.capacity })} short={n(count)} />
          </Compartment>
        );
      })}
    </Furniture>
  );
}

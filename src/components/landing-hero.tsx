"use client";

import { useI18n } from "@/i18n/client";
import type { RecordSize } from "@/lib/visual/lean";
import { CompartmentDrawing } from "./app/compartment-drawing";
import { Compartment, CountBadge, Furniture, Plate } from "./app/furniture";

/** A slice of a real-looking shelf, drawn with the same components as the map (sample data, not anyone's collection). */
const CUBES: Array<{ plate: string; n: number; found?: number } | { blocked: true }> = [
  { plate: "# – Al", n: 55, found: 49 },
  { plate: "Al – Ba", n: 55 },
  { plate: "Ba – Bo", n: 62 },
  { plate: "Bo – Ch", n: 70 },
  { blocked: true },
  { plate: "Ch – Da", n: 48 },
];
const CAPACITY = 80;

function records(cube: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `hero-${cube}-${i}`, size: ((i * 53 + cube * 7) % 17 === 0 ? 10 : 12) as RecordSize }));
}

export function LandingHero() {
  const { t } = useI18n();
  return (
    <figure className="flex flex-col gap-2" aria-label={t("landing.heroLabel")}>
      <Furniture cols={3} title={t("landing.heroShelf")} aside={t("map.holdsOf", { count: 290, capacity: 400 })} maxCell={170}>
        {CUBES.map((cube, i) =>
          "blocked" in cube ? (
            <Compartment key={i} blocked={t("landing.turntable")} />
          ) : (
            <Compartment key={i} found={cube.found !== undefined} plate={<Plate lines={[cube.plate]} />}>
              <CompartmentDrawing records={records(i, cube.n)} capacity={CAPACITY} foundId={cube.found !== undefined ? `hero-${i}-${cube.found}` : null} />
              <CountBadge count={cube.n} capacity={CAPACITY} long={t("map.badge", { count: cube.n, capacity: CAPACITY })} short={String(cube.n)} />
            </Compartment>
          ),
        )}
      </Furniture>
      <figcaption className="text-sm text-muted">{t("landing.heroCaption")}</figcaption>
    </figure>
  );
}

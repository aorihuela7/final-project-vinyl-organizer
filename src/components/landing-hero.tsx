"use client";

import { useI18n } from "@/i18n/client";
import type { RecordSize } from "@/lib/visual/lean";
import { CompartmentDrawing } from "./app/compartment-drawing";
import { Compartment, CountBadge, Furniture, Plate } from "./app/furniture";
import { RailBar } from "./app/brass-rail";

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
const LETTERS = ["#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "R", "S", "T", "V", "Z"];
const WEIGHTS = [1, 7, 6, 8, 5, 4, 4, 3, 3, 1, 4, 1, 6, 7, 2, 2, 5, 5, 6, 4, 3, 1];

function records(cube: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `hero-${cube}-${i}`, size: ((i * 53 + cube * 7) % 17 === 0 ? 10 : 12) as RecordSize }));
}

export function LandingHero() {
  const { t } = useI18n();
  return (
    <figure className="flex flex-col gap-2" aria-label={t("landing.heroLabel")}>
      <RailBar
        ariaLabel={t("landing.heroRail")}
        marker={0.036}
        items={LETTERS.map((l, i) => ({ key: l, label: l, count: WEIGHTS[i]!, title: l, ariaLabel: l }))}
      />
      <Furniture cols={3} title={t("landing.heroShelf")} aside={t("map.holdsOf", { count: 290, capacity: 400 })} maxCell={170}>
        {CUBES.map((cube, i) =>
          "blocked" in cube ? (
            <Compartment key={i} blocked={t("landing.turntable")} />
          ) : (
            <Compartment key={i} found={cube.found !== undefined} plate={<Plate lines={[cube.plate]} />}>
              <CompartmentDrawing records={records(i, cube.n)} capacity={CAPACITY} foundId={cube.found !== undefined ? `hero-${i}-${cube.found}` : null} lifted={cube.found !== undefined} />
              <CountBadge count={cube.n} capacity={CAPACITY} long={t("map.badge", { count: cube.n, capacity: CAPACITY })} short={String(cube.n)} />
            </Compartment>
          ),
        )}
      </Furniture>
      <figcaption className="text-sm text-muted">{t("landing.heroCaption")}</figcaption>
    </figure>
  );
}

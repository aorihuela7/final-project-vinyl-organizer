import { describe, expect, it } from "vitest";
import { MAX_LEAN, corners, leanLayout, type LeanInput, type LeanRecord, type RecordSize } from "./lean";

const CAPACITY = 80;
const SEEDS = Array.from({ length: 20 }, (_, i) => i * 7919 + 13);
const DRAWINGS = [
  { name: "square", width: 100, height: 100 },
  { name: "1.6:1", width: 160, height: 100 },
] as const;

type Mix = { name: string; size: (i: number, seed: number) => RecordSize };
const MIXES: Mix[] = [
  { name: "all 12″", size: () => 12 },
  // About 10% to 30% 10″ records among 12″ ones, varying with the seed.
  { name: "10″ among 12″", size: (i, seed) => (((i * 53 + seed) % 100) < 10 + (seed % 21) ? 10 : 12) },
  { name: "all 7″", size: () => 7 },
  { name: "all CDs", size: () => "cd" },
];

function inputs(n: number, seed: number, mix: Mix): LeanInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${seed}-${i}`, size: mix.size(i, seed) }));
}

/** Separating-axis test for two rotated rectangles: true if they overlap by more than a hair. */
function overlaps(a: LeanRecord, b: LeanRecord): boolean {
  const pa = corners(a);
  const pb = corners(b);
  // Bounding boxes apart: no overlap (a fast, exact shortcut).
  const box = (p: Array<[number, number]>) => [Math.min(...p.map((c) => c[0])), Math.max(...p.map((c) => c[0])), Math.min(...p.map((c) => c[1])), Math.max(...p.map((c) => c[1]))];
  const [ax0, ax1, ay0, ay1] = box(pa);
  const [bx0, bx1, by0, by1] = box(pb);
  if (ax1! <= bx0! || bx1! <= ax0! || ay1! <= by0! || by1! <= ay0!) return false;
  const axes: Array<[number, number]> = [];
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 2; i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[i + 1]!;
      const len = Math.hypot(x2 - x1, y2 - y1);
      axes.push([-(y2 - y1) / len, (x2 - x1) / len]);
    }
  }
  for (const [ax, ay] of axes) {
    const project = (poly: Array<[number, number]>) => poly.map(([x, y]) => x * ax + y * ay);
    const A = project(pa);
    const B = project(pb);
    const gap = Math.max(Math.min(...B) - Math.max(...A), Math.min(...A) - Math.max(...B));
    if (gap >= -1e-6) return false; // a separating axis: they at most touch
  }
  return true;
}

describe("leanLayout", () => {
  it("gives an empty result for zero records", () => {
    expect(leanLayout([], { capacity: 80, width: 100, height: 100 }).records).toEqual([]);
  });

  it("stands every record upright when the compartment is full", () => {
    const { records } = leanLayout(inputs(80, 1, MIXES[0]!), { capacity: 80, width: 100, height: 100, seed: 1 });
    expect(records.every((r) => r.angle === 0)).toBe(true);
  });

  it("leans only slightly when nearly full (free < 2%)", () => {
    for (const seed of SEEDS) {
      const { records } = leanLayout(inputs(79, seed, MIXES[0]!), { capacity: 80, width: 100, height: 100, seed });
      const max = Math.max(...records.map((r) => r.angle));
      expect(max).toBeLessThanOrEqual(1.5);
      expect(records.filter((r) => r.angle > 0).length).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic: the same seed gives the same drawing", () => {
    const a = leanLayout(inputs(37, 5, MIXES[1]!), { capacity: 80, width: 160, height: 100, seed: 5 });
    const b = leanLayout(inputs(37, 5, MIXES[1]!), { capacity: 80, width: 160, height: 100, seed: 5 });
    expect(a).toEqual(b);
  });

  it("keeps a record's height the same in every drawing", () => {
    const a = leanLayout([{ id: "x", size: 12 }], { capacity: 80, width: 100, height: 100, seed: 1 });
    const b = leanLayout([{ id: "y", size: 12 }, { id: "x", size: 12 }], { capacity: 80, width: 100, height: 100, seed: 9 });
    expect(a.records[0]!.height).toBeCloseTo(b.records[1]!.height, 9);
  });

  it("makes 10″ and 7″ records shorter than 12″ ones", () => {
    const { records } = leanLayout(
      [
        { id: "a", size: 12 },
        { id: "b", size: 10 },
        { id: "c", size: 7 },
      ],
      { capacity: 80, width: 100, height: 100 },
    );
    expect(records[1]!.height).toBeLessThan(records[0]!.height * 0.85);
    expect(records[2]!.height).toBeLessThan(records[1]!.height * 0.75);
  });

  it("stands the first records upright even when there are only a few", () => {
    for (const seed of SEEDS) {
      for (let n = 1; n <= 12; n++) {
        const { records } = leanLayout(inputs(n, seed, MIXES[2]!), { capacity: 100, width: 125, height: 100, seed });
        // At least the first half stands at exactly 0°, starting with the one against the wall.
        const upright = records.filter((r) => r.angle === 0).length;
        expect(upright).toBeGreaterThanOrEqual(Math.ceil(n / 2));
        expect(records[0]!.angle).toBe(0);
        for (let i = 0; i < Math.ceil(n / 2); i++) expect(records[i]!.angle).toBe(0);
        // With room to spare, the last one leans (one record alone stands).
        if (n >= 2) expect(records[n - 1]!.angle).toBeGreaterThan(0);
      }
    }
  });

  it("leans four singles in a box of 100 as two upright and two leaning, the last one the most", () => {
    const { records } = leanLayout(inputs(4, 1, MIXES[2]!), { capacity: 100, width: 125, height: 100, seed: 1 });
    expect(records.map((r) => r.angle > 0)).toEqual([false, false, true, true]);
    expect(records[3]!.angle).toBeGreaterThan(records[2]!.angle);
  });

  it("draws a CD at about 40% of an LP's height when both compartments are the same width", () => {
    // An LP in a square cube; a CD in a row of CDs 2.1 times wider than tall (half a cube with a board).
    const lp = leanLayout([{ id: "a", size: 12 }], { capacity: 80, width: 100, height: 100 }).records[0]!;
    const cd = leanLayout([{ id: "a", size: "cd" }], { capacity: 30, width: 210, height: 100 }).records[0]!;
    // Same drawn width means the CD's height counts 1/2.1 as much.
    const ratio = cd.height / 2.1 / lp.height;
    expect(ratio).toBeGreaterThan(0.37);
    expect(ratio).toBeLessThan(0.43);
    // Thicker too: 30 CDs per row against 80 LPs per cube.
    expect(cd.width / 2.1).toBeGreaterThan(lp.width * 2.4);
  });

  it("never leans past 18°, even with two or three records in a big compartment", () => {
    for (const n of [2, 3, 4, 5, 10, 40]) {
      for (const seed of SEEDS.slice(0, 5)) {
        const { records } = leanLayout(inputs(n, seed, MIXES[0]!), { capacity: CAPACITY, width: 100, height: 100, seed });
        for (const r of records) expect(r.angle).toBeLessThanOrEqual(MAX_LEAN + 1e-9);
        // Every record stands on the floor: its bottom-left corner is the pivot at y = 0.
        for (const r of records) expect(corners(r)[0]![1]).toBe(0);
      }
    }
  });

  it("gives a larger or equal maximum angle with more free space", () => {
    for (const drawing of DRAWINGS) {
      for (const seed of SEEDS.slice(0, 5)) {
        let previous = Infinity;
        // From two records: one record alone stands upright.
        for (let n = 2; n <= 80; n++) {
          const { records } = leanLayout(inputs(n, seed, MIXES[0]!), { capacity: CAPACITY, ...drawing, seed });
          const max = Math.max(...records.map((r) => r.angle));
          // n grows, so free space shrinks: the maximum angle must not grow.
          expect(max).toBeLessThanOrEqual(previous + 1e-9);
          previous = max;
        }
      }
    }
  });

  it("computes 25 compartments of 80 records in under 16 ms", () => {
    const sets = Array.from({ length: 25 }, (_, i) => inputs(40 + (i % 40), i, MIXES[1]!));
    leanLayout(sets[0]!, { capacity: 80, width: 100, height: 100 }); // warm up
    const start = performance.now();
    for (let i = 0; i < 25; i++) leanLayout(sets[i]!, { capacity: 80, width: 100, height: 100, seed: i });
    expect(performance.now() - start).toBeLessThan(16);
  });

  it("squeezes a compartment marked fuller than its capacity instead of overflowing", () => {
    const { records } = leanLayout(inputs(90, 3, MIXES[0]!), { capacity: 80, width: 100, height: 100 });
    for (const r of records) for (const [x] of corners(r)) expect(x).toBeLessThanOrEqual(100 + 1e-9);
  });

  for (const drawing of DRAWINGS) {
    for (const mix of MIXES) {
      it(`never overlaps, stays inside, and leans the right way (${drawing.name}, ${mix.name})`, () => {
        let pairs = 0;
        for (const seed of SEEDS) {
          for (let n = 1; n <= 80; n++) {
            const { records } = leanLayout(inputs(n, seed, mix), { capacity: CAPACITY, ...drawing, seed });
            expect(records).toHaveLength(n);
            for (let i = 0; i < records.length; i++) {
              const r = records[i]!;
              const where = `n=${n} seed=${seed} record ${i}`;
              // Every corner inside the compartment.
              for (const [x, y] of corners(r)) {
                if (x < -1e-9 || x > drawing.width + 1e-9 || y < -1e-9 || y > drawing.height + 1e-9) throw new Error(`corner outside: ${where}`);
              }
              // A leaning record's top is to the left of its own base.
              if (r.angle > 0 && !(corners(r)[3]![0] < r.x)) throw new Error(`top not left of base: ${where}`);
              // Angles never decrease toward the right.
              if (i > 0 && r.angle < records[i - 1]!.angle) throw new Error(`angle decreases: ${where}`);
              for (let j = 0; j < i; j++) {
                pairs++;
                if (overlaps(records[j]!, r)) {
                  throw new Error(`overlap: n=${n} seed=${seed} records ${j} and ${i}`);
                }
              }
            }
          }
        }
        expect(pairs).toBeGreaterThan(0);
      });
    }
  }
});

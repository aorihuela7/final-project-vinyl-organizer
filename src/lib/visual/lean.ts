/**
 * Lean physics for compartment drawings (visual only: it never affects placement).
 *
 * Records stand packed against the left wall. When a compartment has free
 * space, the records nearest the empty side lean the way real records do:
 * the first ones stand upright against the wall (at least half of them, so
 * even two or three records never all recline on a smooth floor), and each
 * leaning one's top rests against the record before it while its bottom
 * slides toward the right. Angles grow toward the right, so records touch at
 * most at a point and never overlap.
 *
 * Ported from leanLayout in docs/design/nogal.html, generalized to a width per
 * record (so thickness by format can replace "inner width ÷ capacity" later).
 * Pure TypeScript: no React, no Supabase.
 *
 * Coordinates: x grows to the right from the compartment's left wall, y grows
 * up from the floor. A record is a rectangle of width `width` and height
 * `height` whose bottom-left corner sits at (x, 0), rotated counterclockwise
 * by `angle` degrees around that corner (its top toward the left wall).
 * To draw it in SVG (y down): <rect x={x} y={floor - height} …
 * transform={`rotate(${-angle} ${x} ${floor})`} />.
 */

/** Vinyl by size in inches, or a CD (drawn in its own low compartment: see compartmentAspect). */
export type RecordSize = 7 | 10 | 12 | "cd";

export type LeanInput = {
  /** Stable record ID: its height and jitter come from a hash of it, so a record looks the same everywhere. */
  id: string;
  size: RecordSize;
  /** Width of the record's place on the shelf. Defaults to the inner width ÷ capacity. */
  width?: number;
  /** Or its share in places (thickness by format: a double album is 2). Used when width is missing. */
  places?: number;
};

export type LeanOptions = {
  capacity: number;
  /** Inner width and height of the drawing (any unit, e.g. an SVG viewBox). */
  width: number;
  height: number;
  seed?: number;
};

export type LeanRecord = {
  id: string;
  index: number;
  size: RecordSize;
  /** x of the bottom-left corner (the pivot). */
  x: number;
  /** Drawn thickness (90% of the record's place; the rest is air between records). */
  width: number;
  height: number;
  /** Degrees, counterclockwise (top toward the left wall). 0 = upright. */
  angle: number;
};

export type LeanLayout = {
  records: LeanRecord[];
  /** y of the floor in SVG coordinates (y down), for drawing. */
  floor: number;
  /** Side margins inside the compartment. */
  pad: number;
};

/**
 * Heights by size, as a share of the room above the floor. Vinyl is measured
 * against a cube (a 12″ jacket fills it); a CD (12.5 cm) against its own row
 * of CDs (about 15.7 cm, half a cube), so it's drawn at about 40% of an LP's
 * height when both compartments are the same width.
 */
const HEIGHT_SHARE: Record<RecordSize, number> = { 12: 1, 10: 0.8, 7: 0.56, cd: 0.85 };
/**
 * The steepest a record leans, in degrees. Steeper, a jacket's bottom would
 * slide out on a smooth floor, so even a nearly empty compartment stays calm.
 */
export const MAX_LEAN = 18;
/** How many earlier records each leaning record checks for contact (a short one can sit between tall ones). */
const LOOKBACK = 12;
const MAX_TRIES = 20;

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** FNV-1a, so the same ID always gives the same numbers. */
function hash(value: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a small deterministic generator. */
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Height variation of a record (0–5%), from its ID only. */
export function heightJitter(id: string): number {
  return (hash(id, 0x9e37) % 1000) / 1000;
}

/**
 * How many of the last records lean and how far, from the free share of the
 * compartment. At most the last half leans: the first records always stand
 * upright, so the leaning ones have something to rest on.
 */
export function leanParams(n: number, capacity: number): { free: number; k: number; maxAngle: number; exponent: number } {
  const free = capacity > 0 ? Math.max(0, capacity - n) / capacity : 0;
  let k: number;
  let maxAngle: number;
  if (n <= 0 || free <= 0) {
    k = 0;
    maxAngle = 0;
  } else if (free < 0.02) {
    k = Math.min(1, n);
    maxAngle = 1.2;
  } else {
    k = Math.min(n, Math.max(2, Math.round(3 + 14 * free + 0.05 * n)));
    maxAngle = Math.min(MAX_LEAN, 4 + 30 * free);
  }
  k = Math.min(k, Math.floor(n / 2));
  if (k === 0) maxAngle = 0;
  // Each leaning record leans further than the one before: steeply progressive with little space, closer to even with a lot.
  const exponent = 1.6 - 0.6 * smooth((free - 0.4) / 0.5);
  return { free, k, maxAngle, exponent };
}

export function leanLayout(inputs: readonly LeanInput[], options: LeanOptions): LeanLayout {
  const { width: W, height: H, seed = 0 } = options;
  const pad = Math.min(2.5, W * 0.025);
  const floor = H - Math.min(1.5, H * 0.015);
  const room = H - Math.min(7, H * 0.07);
  const n = inputs.length;
  if (n === 0) return { records: [], floor, pad };

  const inner = W - 2 * pad;
  // A compartment marked fuller than its capacity (calibration) squeezes instead of overflowing: see placeCapacity.
  // Capacity in places; with weights, the free share comes from places, not records.
  const totalPlaces = inputs.reduce((n, r) => n + (r.places && r.places > 0 ? r.places : 1), 0);
  const placeCapacity = Math.max(1, options.capacity, totalPlaces);
  let slots = inputs.map((r) => (r.width && r.width > 0 ? r.width : ((r.places && r.places > 0 ? r.places : 1) * inner) / placeCapacity));
  const used = slots.reduce((a, b) => a + b, 0);
  if (used > inner) slots = slots.map((s) => (s * inner) / used);
  const usedWidth = Math.min(inner, used);

  // How far records lean depends on the free share of the compartment (in places).
  const placesUsed = Math.round(totalPlaces);
  const { k: kPlaces, maxAngle, exponent } = leanParams(placesUsed, options.capacity);
  // In records, not places: a double album is still one record to rest on.
  const k = Math.min(Math.floor(n / 2), kPlaces);
  // The bases never use more than 65% of the free width.
  const limit = Math.min(pad + usedWidth + 0.65 * Math.max(0, inner - usedWidth) + 3, W - pad);

  // Per-record numbers that don't depend on the angles.
  const base = inputs.map((r, i) => {
    const random = rng(hash(r.id, seed) ^ (i * 0x45d9f3b));
    const h = room * HEIGHT_SHARE[r.size] * (0.95 + heightJitter(r.id) * 0.05);
    const jitter = (random() - 0.5) * 1.4 * Math.min(1, maxAngle / 4);
    const slot = slots[i]!;
    return { h, jitter, t: slot * 0.9, gap: slot * 0.1 };
  });
  const uprightX: number[] = [];
  let cursor = pad;
  for (const s of slots) {
    uprightX.push(cursor);
    cursor += s;
  }

  type Built = { b: number; t: number; h: number; th: number; a: number };

  function build(scale: number): Built[] {
    const out: Built[] = [];
    const cap = maxAngle * scale;
    let prevA = 0;
    for (let i = 0; i < n; i++) {
      const { h, jitter, t, gap } = base[i]!;
      const j = i - (n - k);
      let a = 0;
      if (j >= 0) {
        const p = (j + 1) / k;
        // The outermost record sets the compartment's maximum exactly; the others get a little jitter.
        const wobble = j === k - 1 ? 0 : jitter;
        // Never decreasing toward the right, never past the compartment's maximum.
        a = Math.min(cap, Math.max(prevA, (maxAngle * Math.pow(p, exponent) + wobble) * scale, 0));
      }
      const th = (a * Math.PI) / 180;
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      let b: number;
      const prev = out[out.length - 1];
      if (j < 0) {
        b = uprightX[i]!;
      } else if (!prev) {
        b = pad + h * sn;
      } else {
        // 1. the top-left corner clears the left wall; 2. the bottom clears the previous record's bottom-right corner.
        let best = Math.max(prev.b + prev.t * Math.cos(prev.th) + gap * 0.5, pad + h * sn);
        // 3. against each of the records before it, not only the previous one.
        for (let q = out.length - 1; q >= 0 && q >= out.length - LOOKBACK; q--) {
          const o = out[q]!;
          const ps = Math.sin(o.th);
          const pc = Math.cos(o.th);
          const yTop = h * cs;
          // This record's top-left corner must be on or right of o's right face at that height.
          const s = (yTop - o.t * ps) / pc;
          if (s >= 0 && s <= o.h) best = Math.max(best, o.b + o.t * pc - s * ps + gap + h * sn);
          // o's top-right corner must be on or left of this record's left face.
          const cx = o.b + o.t * pc - o.h * ps;
          const cy = o.t * ps + o.h * pc;
          if (cy <= yTop + 1e-9) {
            best = Math.max(best, cx + gap + (cy * sn) / cs);
          } else {
            const s2 = (yTop - o.t * ps) / pc;
            if (s2 >= 0) best = Math.max(best, o.b + o.t * pc - s2 * ps + gap + h * sn);
          }
        }
        b = best;
      }
      out.push({ b, t, h, th, a });
      prevA = a;
    }
    return out;
  }

  const fits = (recs: Built[]) => recs.every((r) => r.b + r.t * Math.cos(r.th) <= limit + 1e-9 && r.b - r.h * Math.sin(r.th) >= pad - 1e-9);

  let scale = 1;
  let recs = build(scale);
  for (let tries = 0; tries < MAX_TRIES && !fits(recs); tries++) {
    scale *= 0.88;
    recs = build(scale);
  }
  // Upright always fits: the last resort.
  if (!fits(recs)) recs = build(0);

  return {
    records: recs.map((r, i) => ({ id: inputs[i]!.id, index: i, size: inputs[i]!.size, x: r.b, width: r.t, height: r.h, angle: r.a })),
    floor,
    pad,
  };
}

/** The four corners of a record (x right, y up from the floor): bottom-left, bottom-right, top-right, top-left. */
export function corners(r: LeanRecord): Array<[number, number]> {
  const th = (r.angle * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const rot = (x: number, y: number): [number, number] => [r.x + x * c - y * s, x * s + y * c];
  return [rot(0, 0), rot(r.width, 0), rot(r.width, r.height), rot(0, r.height)];
}

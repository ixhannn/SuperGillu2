/**
 * Deterministic seeded RNG for the bonsai voxel engine.
 * Both partners must render an identical tree from the same couple seed,
 * so every random decision in the tree pipeline flows through this.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, good-enough distribution for visuals. */
export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Stable 32-bit hash for strings (couple ids, day keys). */
export const hashString = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Derive a child seed from a base seed and a label, e.g. per-day randomness. */
export const childSeed = (seed: number, label: string): number =>
  (seed ^ hashString(label)) >>> 0;

export const rngRange = (rng: Rng, min: number, max: number): number =>
  min + rng() * (max - min);

export const rngInt = (rng: Rng, min: number, max: number): number =>
  Math.floor(rngRange(rng, min, max + 1));

export const rngPick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

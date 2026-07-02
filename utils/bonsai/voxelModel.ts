/**
 * Deterministic voxel sakura bonsai generator.
 * The full "adult" tree is generated once from the couple seed; every voxel
 * carries a growth threshold in [0..1] so the tree can be revealed
 * voxel-by-voxel as the couple's growth points accumulate. Both partners
 * generate byte-identical models from the same seed.
 */

import { childSeed, createRng, rngInt, rngPick, rngRange, type Rng } from './rng';
import type { BonsaiDecorationId } from './types';

export type VoxelLayer = 'static' | 'canopyBack' | 'canopyFront';

export type VoxelKind =
  | 'island'
  | 'rock'
  | 'pot'
  | 'soil'
  | 'seed'
  | 'sprout'
  | 'trunk'
  | 'branch'
  | 'leaf'
  | 'blossom'
  | 'decor';

export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: string;
  kind: VoxelKind;
  layer: VoxelLayer;
  /** Growth fraction [0..1] at which this voxel becomes visible. */
  threshold: number;
  /** Fraction [0..1] of bloom progress at which a leaf voxel turns pink. */
  bloomAt?: number;
  /** Voxel scale (petal fluff uses < 1). */
  size?: number;
  /** Per-tier shade shift, carried through to bloom colours (maple's fire
   *  gradient must survive the green→blossom transition). */
  tint?: number;
  decorId?: BonsaiDecorationId;
}

/** A shell position where a permanent "bloom day" blossom can anchor. */
export interface BlossomAnchor {
  x: number;
  y: number;
  z: number;
  layer: VoxelLayer;
}

export type BonsaiSpeciesId = 'sakura' | 'wisteria' | 'plum' | 'maple';

/**
 * Geometry grammar — what makes each species a DIFFERENT bonsai style.
 * The defining bonsai look: flat foliage PADS stacked with negative space
 * along a dramatic trunk, largest pad lowest, a small apex crowning the top.
 */
export interface BonsaiShape {
  /** Trunk height range (voxels). */
  height: [number, number];
  /** Lean amplitude range — how dramatic the trunk line is. */
  lean: [number, number];
  /** true = one-direction arc (cascade); false = classic S-curve (moyogi). */
  arc?: boolean;
  /** Trunk thickness multiplier (literati trunks are thin). */
  girth: number;
  /** Foliage pad tiers stacked along the trunk, including the apex. */
  tiers: number;
  /** Lowest (largest) pad radius range. */
  padRx: [number, number];
  /** Pad flatness: ry = max(1.7, rx * padFlat). Low = razor-flat clouds. */
  padFlat: number;
  /** Each tier above shrinks by this factor. */
  padShrink: number;
  /** Shell drop fraction — high = airy, see-through pads. */
  sparse: number;
  /** Foliage voxel size — fine-leaved species use smaller cubes. */
  leafSize: number;
  /** Side-branch reach from trunk to pad centres. */
  branchLen: [number, number];
  /** 0 = none; 1 = blossom racemes hang below pad rims (wisteria). */
  droop: number;
  /** Blossoms bud straight from bare wood (plum flowers before leafing). */
  bareBloom?: boolean;
}

/** Each species gets its own glazed ceramic. */
export interface BonsaiPot {
  body: string;
  rim: string;
  foot: string;
}

export interface BonsaiSpecies {
  id: BonsaiSpeciesId;
  name: string;
  line: string;
  leaf: readonly string[];
  blossom: readonly string[];
  blossomBright: string;
  trunk: readonly string[];
  pot: BonsaiPot;
  shape: BonsaiShape;
}

export const BONSAI_SPECIES: Record<BonsaiSpeciesId, BonsaiSpecies> = {
  sakura: {
    id: 'sakura',
    name: 'Sakura',
    line: 'The first tree. Pink as a held breath.',
    leaf: ['#7fae5e', '#6f9e52', '#93bd6f'],
    blossom: ['#f6c9d7', '#f2aec4', '#ec92ae', '#e77c9d'],
    blossomBright: '#fbe3ec',
    trunk: ['#8a6248', '#81593f', '#936b4f'],
    pot: { body: '#c98a8f', rim: '#b5767c', foot: '#a2666d' },
    // Moyogi (informal upright): S-curve trunk, three alternating pads + apex.
    shape: {
      height: [10, 12], lean: [1.6, 2.2], girth: 1,
      tiers: 4, padRx: [4.4, 5.2], padFlat: 0.34, padShrink: 0.74,
      sparse: 0.13, leafSize: 0.9, branchLen: [2.4, 3.4], droop: 0,
    },
  },
  wisteria: {
    id: 'wisteria',
    name: 'Wisteria',
    line: 'Lavender falls like slow rain.',
    leaf: ['#75a45c', '#65944e', '#86b269'],
    blossom: ['#cdb4e2', '#b79bd8', '#a487c9', '#8f72b8'],
    blossomBright: '#e6d7f2',
    trunk: ['#7d6a56', '#71604c', '#89755f'],
    pot: { body: '#5b6b8c', rim: '#4c5a77', foot: '#414d66' },
    // Cascade-leaning arch: broad flat canopy raining blossom racemes.
    shape: {
      height: [8, 10], lean: [2.6, 3.4], arc: true, girth: 1.05,
      tiers: 2, padRx: [5.6, 6.4], padFlat: 0.3, padShrink: 0.72,
      sparse: 0.1, leafSize: 0.88, branchLen: [2, 3], droop: 1,
    },
  },
  plum: {
    id: 'plum',
    name: 'Plum',
    line: 'It blooms earliest, in the cold, out of stubborn love.',
    leaf: ['#7aa861', '#6a9853', '#8db571'],
    blossom: ['#f7e6ea', '#f2c9d4', '#e8a4b8', '#c96f8c'],
    blossomBright: '#fdf4f6',
    trunk: ['#6f4a38', '#654232', '#7a5440'],
    pot: { body: '#9a8d80', rim: '#877a6e', foot: '#75695e' },
    // Literati (bunjin): tall thin serpentine trunk, sparse crowns high up,
    // blossoms budding straight from the bare wood.
    shape: {
      height: [13, 15], lean: [2.6, 3.4], girth: 0.72,
      tiers: 2, padRx: [2.6, 3.2], padFlat: 0.44, padShrink: 0.82,
      sparse: 0.3, leafSize: 0.74, branchLen: [3.2, 4.6], droop: 0,
      bareBloom: true,
    },
  },
  maple: {
    id: 'maple',
    name: 'Maple',
    line: 'It saves its fire for the days you keep showing up.',
    leaf: ['#84ac58', '#749c4c', '#95b968'],
    blossom: ['#e2734b', '#d95f3b', '#c94f2f', '#e88a5a'],
    blossomBright: '#f2a06a',
    trunk: ['#77503c', '#6c4735', '#835a44'],
    pot: { body: '#a9c4b0', rim: '#93b09c', foot: '#7f9c88' },
    // Upright layered broom: thick trunk, dense fine-leaf tiers, the lower
    // pads burning darker red than the crown.
    shape: {
      height: [11, 13], lean: [1.0, 1.4], girth: 1.12,
      tiers: 4, padRx: [4.2, 5.0], padFlat: 0.4, padShrink: 0.72,
      sparse: 0.06, leafSize: 0.84, branchLen: [2, 3], droop: 0,
    },
  },
};

export interface BonsaiModel {
  voxels: Voxel[];
  anchors: BlossomAnchor[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  palette: { blossom: readonly string[]; blossomBright: string };
}

export const MAX_GROWTH = 400;

/** Fast early growth, slow late — first weeks feel dramatic. */
export const growthToG = (growth: number): number =>
  Math.pow(Math.min(growth, MAX_GROWTH) / MAX_GROWTH, 0.5);

/** Pink conversion begins at first-bloom (75) and saturates near ancient. */
export const growthToBloom = (growth: number): number =>
  Math.max(0, Math.min(1, (growth - 60) / (MAX_GROWTH - 120)));

export const PALETTE = {
  grass: ['#93c06d', '#88b562', '#9dca78'],
  grassEdge: '#7ca757',
  soilSide: '#9c7250',
  rock: ['#948a7c', '#877d70'],
  pot: '#c98a8f',
  potRim: '#b5767c',
  potFoot: '#a2666d',
  soil: '#6f4f3a',
  seed: '#8a6248',
  sprout: '#7fae5e',
  trunk: ['#8a6248', '#81593f', '#936b4f'],
  leaf: ['#7fae5e', '#6f9e52', '#93bd6f'],
  blossom: ['#f6c9d7', '#f2aec4', '#ec92ae', '#e77c9d'],
  blossomBright: '#fbe3ec',
  gold: '#e9c46a',
  lanternStone: '#b9b3a8',
  lanternLight: '#ffd98a',
  water: '#9fd1e8',
  waterDeep: '#7fbcd9',
  koi: '#f28c5f',
  koiWhite: '#f4f1ea',
  chime: '#cfc8bd',
  wood: '#b08a5e',
  torii: '#c95d63',
  moss: '#84c26e',
} as const;

interface PathPoint {
  x: number;
  y: number;
  z: number;
  r: number;
  t: number;
}

const push = (
  out: Voxel[],
  v: Omit<Voxel, 'layer'> & { layer?: VoxelLayer },
): void => {
  out.push({ layer: 'static', ...v });
};

/** Fill a horizontal disc of voxels around a path point. */
const fillDisc = (
  out: Voxel[],
  p: PathPoint,
  color: (rng: Rng) => string,
  kind: VoxelKind,
  threshold: (radial: number) => number,
  rng: Rng,
): void => {
  const rCeil = Math.ceil(p.r);
  for (let dx = -rCeil; dx <= rCeil; dx++) {
    for (let dz = -rCeil; dz <= rCeil; dz++) {
      const dist = Math.hypot(dx, dz);
      if (dist > p.r + 0.15) continue;
      push(out, {
        x: Math.round(p.x) + dx,
        y: Math.round(p.y),
        z: Math.round(p.z) + dz,
        color: color(rng),
        kind,
        threshold: threshold(p.r <= 0.01 ? 0 : dist / Math.max(1, p.r)),
      });
    }
  }
};

/** Bonsai trunk line: S-curve (moyogi) or one-direction arc (cascade). */
const buildTrunkPath = (rng: Rng, baseY: number, shape: BonsaiShape): PathPoint[] => {
  const height = rngInt(rng, shape.height[0], shape.height[1]);
  const leanDir = rngRange(rng, 0, Math.PI * 2);
  const leanAmp = rngRange(rng, shape.lean[0], shape.lean[1]);
  const counter = rngRange(rng, 0.5, 0.9);
  const points: PathPoint[] = [];
  // Half-steps keep the voxelised curve connected through diagonal moves.
  for (let i = 0; i <= height * 2; i++) {
    const t = i / (height * 2);
    // Cascade arcs steadily out over the pot edge; moyogi leans out then
    // pulls the apex back over the nebari (the classic S).
    const sway = shape.arc
      ? Math.sin(t * Math.PI * 0.55) * leanAmp
      : Math.sin(t * Math.PI) * leanAmp - Math.sin(t * Math.PI * 2) * leanAmp * counter * 0.4;
    const x = Math.cos(leanDir) * sway;
    const z = Math.sin(leanDir) * sway * 0.8;
    const r = (2.0 * (1 - t) + 0.7) * shape.girth;
    points.push({ x, y: baseY + i / 2, z, r, t });
  }
  return points;
};

/**
 * Bonsai pads: flat foliage clouds stacked with NEGATIVE SPACE between them.
 * Side pads alternate left/right of the trunk line (the classic staircase
 * silhouette), shrink as they climb, and a small apex pad crowns the top.
 */
interface PadSpec {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  /** Growth threshold base — lower pads leaf out first. */
  attachT: number;
  /** 0 = lowest tier … 1 = apex; drives the maple's fire gradient. */
  tint: number;
  /** Trunk point the pad's branch grows from (apex has none). */
  branchFrom: PathPoint | null;
}

const planPads = (rng: Rng, trunk: PathPoint[], shape: BonsaiShape): PadSpec[] => {
  const pads: PadSpec[] = [];
  const top = trunk[trunk.length - 1];
  const baseRx = rngRange(rng, shape.padRx[0], shape.padRx[1]);
  const sideTiers = Math.max(0, shape.tiers - 1);
  // Side pads jut perpendicular-ish to the lean so the silhouette staggers.
  const leanAngle = Math.atan2(top.z, top.x || 0.001);
  let side = rng() < 0.5 ? 1 : -1;

  for (let i = 0; i < sideTiers; i++) {
    const attachT = 0.42 + (i / Math.max(1, sideTiers)) * 0.4;
    const from = trunk[Math.round(attachT * (trunk.length - 1))];
    const rx = baseRx * Math.pow(shape.padShrink, i);
    const ry = Math.max(1.7, rx * shape.padFlat);
    const azimuth = leanAngle + side * (Math.PI / 2 + rngRange(rng, -0.35, 0.35));
    side = -side;
    const reach = rngRange(rng, shape.branchLen[0], shape.branchLen[1]) + rx * 0.4;
    pads.push({
      cx: from.x + Math.cos(azimuth) * reach,
      cy: from.y + rngRange(rng, 0.8, 1.6),
      cz: from.z + Math.sin(azimuth) * reach * 0.85,
      rx,
      ry,
      rz: rx * rngRange(rng, 0.85, 1),
      attachT,
      tint: sideTiers <= 1 ? 0 : i / sideTiers,
      branchFrom: from,
    });
  }

  // Apex pad sits ON the trunk top — the tree's crown.
  const apexRx = Math.max(2.2, baseRx * Math.pow(shape.padShrink, sideTiers));
  const apexRy = Math.max(1.7, apexRx * shape.padFlat * 1.15);
  pads.push({
    cx: top.x,
    cy: top.y + apexRy * 0.5,
    cz: top.z,
    rx: apexRx,
    ry: apexRy,
    rz: apexRx * rngRange(rng, 0.85, 1),
    attachT: 0.86,
    tint: 1,
    branchFrom: null,
  });
  return pads;
};

/** Thick, slightly sagging limbs from the trunk out to each side pad. */
const buildBranchesToPads = (
  out: Voxel[],
  rng: Rng,
  pads: PadSpec[],
  species: BonsaiSpecies,
): void => {
  for (const pad of pads) {
    const from = pad.branchFrom;
    if (!from) continue;
    const target = { x: pad.cx, y: pad.cy - pad.ry * 0.35, z: pad.cz };
    const len = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
    const steps = Math.max(4, Math.round(len)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Slight sag makes the limb read as wood carrying weight.
      const sag = Math.sin(t * Math.PI) * 0.45;
      fillDisc(
        out,
        {
          x: from.x + (target.x - from.x) * t,
          y: from.y + (target.y - from.y) * t - sag,
          z: from.z + (target.z - from.z) * t,
          r: (1.05 * (1 - t) + 0.42) * species.shape.girth,
          t,
        },
        (r) => rngPick(r, species.trunk),
        'branch',
        // Limbs finish just before their pad leafs out.
        (radial) => Math.min(0.9, 0.03 + pad.attachT * 0.14 + t * 0.05 + radial * 0.04),
        rng,
      );
    }
  }
};

const fillPad = (
  out: Voxel[],
  anchors: BlossomAnchor[],
  rng: Rng,
  pad: PadSpec,
  species: BonsaiSpecies,
): void => {
  const shape = species.shape;
  const layer: VoxelLayer = pad.cz < 0 ? 'canopyBack' : 'canopyFront';
  // Pacing contract: first leaves by "Sapling" (growth ~10, G≈0.16), the
  // apex crown by "Young Tree" (growth ~27). Structure lands early, density
  // fills through mid-game, and the bloom colour carries the late game.
  const baseThreshold = 0.04 + pad.attachT * 0.18;
  // Maple's fire gradient: lower pads burn darker than the crown.
  const tintShift = (pad.tint - 0.5) * 0.12;

  for (let dx = -Math.ceil(pad.rx); dx <= Math.ceil(pad.rx); dx++) {
    for (let dy = -Math.ceil(pad.ry); dy <= Math.ceil(pad.ry); dy++) {
      for (let dz = -Math.ceil(pad.rz); dz <= Math.ceil(pad.rz); dz++) {
        const d = Math.hypot(dx / pad.rx, dy / pad.ry, dz / pad.rz);
        if (d > 1) continue;
        // Bonsai pads are cloud-topped and FLAT underneath: trim the belly.
        if (dy < -pad.ry * 0.3 && d > 0.5) continue;
        const shell = d > 0.6;
        // Ragged silhouette; literati pads drop far more for the airy look.
        if (shell && rng() < shape.sparse) continue;
        const threshold = Math.min(0.985, baseThreshold + d * 0.28 + rngRange(rng, 0, 0.04));
        // Outer shell voxels turn colour first; the core keeps green depth.
        const bloomAt = shell ? rngRange(rng, 0.05, 0.75) : rngRange(rng, 0.55, 1.15);
        push(out, {
          x: Math.round(pad.cx + dx),
          y: Math.round(pad.cy + dy),
          z: Math.round(pad.cz + dz),
          color: shadeHex(rngPick(rng, species.leaf), tintShift),
          kind: 'leaf',
          layer,
          threshold,
          bloomAt,
          size: shell ? shape.leafSize : 1,
          tint: tintShift,
        });
        if (shell && dy >= 0 && rng() < 0.3) {
          anchors.push({ x: Math.round(pad.cx + dx), y: Math.round(pad.cy + dy) + 1, z: Math.round(pad.cz + dz), layer });
        }
        // Wisteria racemes: tapering blossom columns raining from pad rims.
        if (shape.droop > 0 && d > 0.7 && dy <= 0 && rng() < 0.45) {
          const tail = rngInt(rng, 3, 5);
          for (let t = 1; t <= tail; t++) {
            push(out, {
              x: Math.round(pad.cx + dx),
              y: Math.round(pad.cy + dy) - t,
              z: Math.round(pad.cz + dz),
              color: rngPick(rng, species.leaf),
              kind: 'leaf',
              layer,
              threshold: Math.min(0.985, threshold + t * 0.04),
              bloomAt: rngRange(rng, 0.02, 0.35),
              size: Math.max(0.5, 0.8 - t * 0.07),
            });
          }
        }
      }
    }
  }
};

/** Plum blooms on bare wood: blossom buds sprinkled along trunk + limbs. */
const buildBareBlooms = (out: Voxel[], rng: Rng, trunk: PathPoint[], species: BonsaiSpecies): void => {
  for (const p of trunk) {
    if (p.t < 0.35 || rng() > 0.55) continue;
    const ox = rngInt(rng, -1, 1);
    const oz = rngInt(rng, -1, 1);
    if (ox === 0 && oz === 0) continue;
    push(out, {
      x: Math.round(p.x) + ox,
      y: Math.round(p.y) + rngInt(rng, 0, 1),
      z: Math.round(p.z) + oz,
      color: rngPick(rng, species.leaf),
      kind: 'leaf',
      layer: oz < 0 ? 'canopyBack' : 'canopyFront',
      threshold: Math.min(0.985, 0.14 + p.t * 0.3 + rngRange(rng, 0, 0.05)),
      bloomAt: rngRange(rng, 0.02, 0.45),
      size: 0.58,
    });
  }
};

/** Small lighten/darken used at model build time (species tier gradients). */
const shadeHex = (hex: string, amount: number): string => {
  if (amount === 0) return hex;
  const c = (o: number) => parseInt(hex.slice(o, o + 2), 16);
  const mix = (v: number) =>
    Math.round(Math.min(255, Math.max(0, amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `rgb(${mix(c(1))},${mix(c(3))},${mix(c(5))})`;
};

const buildIsland = (out: Voxel[], rng: Rng): void => {
  const R = 10.5;
  for (let x = -Math.ceil(R); x <= Math.ceil(R); x++) {
    for (let z = -Math.ceil(R); z <= Math.ceil(R); z++) {
      const d = Math.hypot(x / R, z / (R * 0.82));
      if (d > 1) continue;
      const edge = d > 0.86;
      push(out, {
        x, y: 0, z,
        color: edge ? PALETTE.grassEdge : rngPick(rng, PALETTE.grass),
        kind: 'island',
        threshold: 0,
      });
      // Tapering rock underside gives the floating-diorama silhouette.
      const depth = Math.max(1, Math.round((1 - d) * 3.2));
      for (let y = -1; y >= -depth; y--) {
        if (Math.hypot(x / (R * (1 + y * 0.16)), z / (R * 0.82 * (1 + y * 0.16))) > 1) continue;
        push(out, { x, y, z, color: rngPick(rng, PALETTE.rock), kind: 'rock', threshold: 0 });
      }
      // Living ground detail: grass blades, wildflowers, mossy stones.
      if (!edge && d < 0.8 && Math.hypot(x, z) > 5.5) {
        const roll = rng();
        if (roll < 0.045) {
          push(out, { x, y: 1, z, color: PALETTE.grassEdge, kind: 'island', threshold: 0, size: 0.34 });
        } else if (roll < 0.065) {
          push(out, { x, y: 1, z, color: rng() < 0.5 ? '#f2c9d4' : '#f4f1ea', kind: 'island', threshold: 0, size: 0.38 });
        } else if (roll < 0.078) {
          push(out, { x, y: 1, z, color: rngPick(rng, PALETTE.rock), kind: 'rock', threshold: 0, size: 0.6 });
        }
      }
    }
  }
};

const buildPot = (out: Voxel[], pot: BonsaiPot): void => {
  const rx = 3.6;
  const rz = 2.8;
  for (let y = 1; y <= 3; y++) {
    const shrink = y === 1 ? 0.82 : 1;
    for (let x = -4; x <= 4; x++) {
      for (let z = -3; z <= 3; z++) {
        const d = Math.hypot(x / (rx * shrink), z / (rz * shrink));
        if (d > 1) continue;
        const rim = y === 3 && d > 0.62;
        push(out, {
          x, y, z,
          color: rim ? pot.rim : y === 1 ? pot.foot : pot.body,
          kind: 'pot',
          threshold: 0,
        });
        if (y === 3 && d <= 0.62) {
          push(out, { x, y, z, color: PALETTE.soil, kind: 'soil', threshold: 0 });
        }
      }
    }
  }
};

const buildSeedAndSprout = (out: Voxel[]): void => {
  // Visible only at the very beginning; the trunk replaces them.
  push(out, { x: 0, y: 4, z: 0, color: PALETTE.seed, kind: 'seed', threshold: 0, size: 0.7 });
  push(out, { x: 0, y: 4, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.018 });
  push(out, { x: 0, y: 5, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.03 });
  push(out, { x: 1, y: 5, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.04, size: 0.8 });
  push(out, { x: -1, y: 5, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.05, size: 0.8 });
};

const decorVoxel = (
  out: Voxel[],
  id: BonsaiDecorationId,
  x: number,
  y: number,
  z: number,
  color: string,
  size?: number,
): void => {
  push(out, { x, y, z, color, kind: 'decor', threshold: 0, decorId: id, size });
};

const buildDecorations = (out: Voxel[], rng: Rng): void => {
  // Moss garden — soft tufts around the pot.
  for (let i = 0; i < 9; i++) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const r = rngRange(rng, 4.6, 7.5);
    decorVoxel(out, 'moss', Math.round(Math.cos(a) * r), 1, Math.round(Math.sin(a) * r * 0.8), PALETTE.moss, 0.72);
  }
  // Stone lantern (front-right).
  const lx = 7, lz = 3;
  decorVoxel(out, 'lantern', lx, 1, lz, PALETTE.lanternStone);
  decorVoxel(out, 'lantern', lx, 2, lz, PALETTE.lanternStone, 0.8);
  decorVoxel(out, 'lantern', lx, 3, lz, PALETTE.lanternLight, 0.9);
  decorVoxel(out, 'lantern', lx, 4, lz, PALETTE.lanternStone);
  // Koi pond (front-left) — sunk into the grass.
  for (let x = -8; x <= -5; x++) {
    for (let z = 2; z <= 4; z++) {
      const d = Math.hypot((x + 6.5) / 1.9, (z - 3) / 1.4);
      if (d > 1) continue;
      decorVoxel(out, 'koi-pond', x, 1, z, d < 0.55 ? PALETTE.waterDeep : PALETTE.water, 0.94);
    }
  }
  decorVoxel(out, 'koi-pond', -7, 1, 3, PALETTE.koi, 0.55);
  decorVoxel(out, 'koi-pond', -6, 1, 3, PALETTE.koiWhite, 0.5);
  // Wind chime hangs in the lower canopy.
  decorVoxel(out, 'wind-chime', 2, 9, 0, PALETTE.wood, 0.5);
  decorVoxel(out, 'wind-chime', 2, 8, 0, PALETTE.chime, 0.62);
  decorVoxel(out, 'wind-chime', 2, 7, 0, PALETTE.chime, 0.5);
  // Bench for two (right, facing the tree).
  decorVoxel(out, 'bench', 7, 1, -2, PALETTE.wood);
  decorVoxel(out, 'bench', 8, 1, -3, PALETTE.wood);
  decorVoxel(out, 'bench', 7, 2, -2, PALETTE.wood, 0.85);
  decorVoxel(out, 'bench', 8, 2, -3, PALETTE.wood, 0.85);
  // Torii gate at the back edge.
  const tz = -8;
  for (let y = 1; y <= 5; y++) {
    decorVoxel(out, 'torii', -3, y, tz, PALETTE.torii, 0.85);
    decorVoxel(out, 'torii', 3, y, tz, PALETTE.torii, 0.85);
  }
  for (let x = -4; x <= 4; x++) decorVoxel(out, 'torii', x, 6, tz, PALETTE.torii, 0.92);
  for (let x = -3; x <= 3; x++) decorVoxel(out, 'torii', x, 5, tz, PALETTE.torii, 0.7);
  // Songbird nest — tucked into the front canopy so it reads as "in the tree".
  const nest: Array<[number, number, number, string, number]> = [
    [5, 12, 3, PALETTE.wood, 0.8],
    [6, 12, 3, PALETTE.wood, 0.7],
    [5, 12, 4, PALETTE.wood, 0.7],
    [5, 13, 3, PALETTE.koiWhite, 0.55],
  ];
  for (const [x, y, z, color, size] of nest) {
    out.push({ x, y, z, color, kind: 'decor', layer: 'canopyFront', threshold: 0, decorId: 'nest', size });
  }
  // The bird itself — a warm rose fleck perched on the rim.
  out.push({ x: 6, y: 13, z: 4, color: '#e77c9d', kind: 'decor', layer: 'canopyFront', threshold: 0, decorId: 'nest', size: 0.5 });
};

export const generateBonsaiModel = (
  seed: number,
  speciesId: BonsaiSpeciesId = 'sakura',
): BonsaiModel => {
  const species = BONSAI_SPECIES[speciesId] ?? BONSAI_SPECIES.sakura;
  const voxels: Voxel[] = [];
  const anchors: BlossomAnchor[] = [];

  buildIsland(voxels, createRng(childSeed(seed, 'island')));
  buildPot(voxels, species.pot);
  buildSeedAndSprout(voxels);
  buildDecorations(voxels, createRng(childSeed(seed, 'decor')));

  // Species-salted streams: the same couple gets a genuinely different
  // SILHOUETTE per species, not just a recolour.
  const trunkRng = createRng(childSeed(seed, `trunk:${species.id}`));
  const trunk = buildTrunkPath(trunkRng, 4, species.shape);
  for (const p of trunk) {
    // Height finishes by G≈0.35; girth keeps thickening until G≈0.8.
    fillDisc(
      voxels,
      p,
      (r) => rngPick(r, species.trunk),
      'trunk',
      (radial) => Math.max(0.03 + p.t * 0.32, radial * 0.85 - 0.05),
      trunkRng,
    );
  }

  // Nebari — the root flare bonsai are prized for. Spokes of dark root
  // spreading over the soil, appearing as the trunk thickens.
  const nebariRng = createRng(childSeed(seed, 'nebari'));
  const spokes = rngInt(nebariRng, 4, 6);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rngRange(nebariRng, -0.3, 0.3);
    for (let r = 1; r <= 2; r++) {
      push(voxels, {
        x: Math.round(Math.cos(a) * r),
        y: 4,
        z: Math.round(Math.sin(a) * r * 0.8),
        color: species.trunk[1],
        kind: 'trunk',
        threshold: 0.12 + r * 0.08,
        size: r === 2 ? 0.72 : 1,
      });
    }
  }

  const padRng = createRng(childSeed(seed, `pads:${species.id}`));
  const pads = planPads(padRng, trunk, species.shape);
  buildBranchesToPads(voxels, createRng(childSeed(seed, `branches:${species.id}`)), pads, species);
  const leafRng = createRng(childSeed(seed, `leaves:${species.id}`));
  for (const pad of pads) {
    fillPad(voxels, anchors, leafRng, pad, species);
  }
  if (species.shape.bareBloom) {
    buildBareBlooms(voxels, createRng(childSeed(seed, `buds:${species.id}`)), trunk, species);
  }

  const bounds = voxels.reduce(
    (acc, v) => ({
      minX: Math.min(acc.minX, v.x),
      maxX: Math.max(acc.maxX, v.x),
      minY: Math.min(acc.minY, v.y),
      maxY: Math.max(acc.maxY, v.y),
      minZ: Math.min(acc.minZ, v.z),
      maxZ: Math.max(acc.maxZ, v.z),
    }),
    { minX: 99, maxX: -99, minY: 99, maxY: -99, minZ: 99, maxZ: -99 },
  );

  // Stable order first (so both phones agree), then a seeded shuffle spreads
  // consecutive bloom days across the whole canopy. (A fixed stride collapses
  // onto a few spots whenever the count shares a factor with it.)
  anchors.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  const shuffleRng = createRng(childSeed(seed, 'anchors'));
  for (let i = anchors.length - 1; i > 0; i--) {
    const j = Math.floor(shuffleRng() * (i + 1));
    const tmp = anchors[i];
    anchors[i] = anchors[j];
    anchors[j] = tmp;
  }

  return {
    voxels,
    anchors,
    bounds,
    palette: { blossom: species.blossom, blossomBright: species.blossomBright },
  };
};

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

/** Geometry grammar — what makes each species SHAPED differently. */
export interface BonsaiShape {
  /** Trunk height range (voxels). */
  height: [number, number];
  /** Lean amplitude range — how gnarled the S-curve is. */
  lean: [number, number];
  /** Main crown lobe radius range. */
  crownRx: [number, number];
  /** Crown flatness: ry = rx * crownFlat (low = wide umbrella, high = dome). */
  crownFlat: number;
  /** Number of secondary crown lobes. */
  lobes: number;
  /** How far secondary lobes scatter from the main lobe (× crownRx). */
  lobeSpread: [number, number];
  /** Shell drop fraction — high = airy, see-through crown (plum). */
  sparse: number;
  /** Branch length range (they reach from trunk into the crown). */
  branchLen: [number, number];
  /** 0 = none; 1 = blossom tails hang below the crown (wisteria). */
  droop: number;
}

export interface BonsaiSpecies {
  id: BonsaiSpeciesId;
  name: string;
  line: string;
  leaf: readonly string[];
  blossom: readonly string[];
  blossomBright: string;
  trunk: readonly string[];
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
    // Classic broad umbrella over a curving trunk.
    shape: {
      height: [11, 13], lean: [1.2, 1.8],
      crownRx: [5.4, 6.2], crownFlat: 0.48, lobes: 4, lobeSpread: [0.5, 0.75],
      sparse: 0.13, branchLen: [2.5, 4], droop: 0,
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
    // Low, arched, extra-wide flat canopy dripping blossom tails.
    shape: {
      height: [9, 11], lean: [2.0, 2.8],
      crownRx: [6.4, 7.2], crownFlat: 0.34, lobes: 3, lobeSpread: [0.55, 0.8],
      sparse: 0.12, branchLen: [3, 5], droop: 1,
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
    // Tall, angular, AIRY — separate blossom clouds on long visible branches.
    shape: {
      height: [13, 15], lean: [2.2, 3.0],
      crownRx: [3.2, 3.9], crownFlat: 0.6, lobes: 5, lobeSpread: [1.0, 1.5],
      sparse: 0.24, branchLen: [4, 6], droop: 0,
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
    // Upright and full — a tall layered dome on a straighter trunk.
    shape: {
      height: [13, 15], lean: [0.7, 1.1],
      crownRx: [5.2, 6.0], crownFlat: 0.66, lobes: 4, lobeSpread: [0.45, 0.7],
      sparse: 0.1, branchLen: [2, 3.5], droop: 0,
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

/** Gnarled bonsai trunk: an S-curve lean, parameters from the species shape. */
const buildTrunkPath = (rng: Rng, baseY: number, shape: BonsaiShape): PathPoint[] => {
  const height = rngInt(rng, shape.height[0], shape.height[1]);
  const leanDir = rngRange(rng, 0, Math.PI * 2);
  const leanAmp = rngRange(rng, shape.lean[0], shape.lean[1]);
  const counter = rngRange(rng, 0.5, 0.9);
  const points: PathPoint[] = [];
  // Half-steps keep the voxelised curve connected through diagonal moves.
  for (let i = 0; i <= height * 2; i++) {
    const t = i / (height * 2);
    // S-curve: lean out, then pull back over the pot.
    const sway = Math.sin(t * Math.PI) * leanAmp - Math.sin(t * Math.PI * 2) * leanAmp * counter * 0.4;
    const x = Math.cos(leanDir) * sway;
    const z = Math.sin(leanDir) * sway * 0.8;
    const r = 2.0 * (1 - t) + 0.7;
    points.push({ x, y: baseY + i / 2, z, r, t });
  }
  return points;
};

/**
 * The crown is ONE coherent mass: a big central lobe sitting on the trunk
 * top (so the trunk visibly enters it), with species-many secondary lobes
 * scattered around it. Sakura reads umbrella, wisteria reads wide-and-flat,
 * plum reads as separate airy clouds, maple reads tall dome.
 */
interface CrownLobe {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  /** Growth threshold base — the main lobe leafs out first. */
  attachT: number;
  main: boolean;
}

const planCrown = (rng: Rng, trunk: PathPoint[], shape: BonsaiShape): CrownLobe[] => {
  const top = trunk[trunk.length - 1];
  const rx = rngRange(rng, shape.crownRx[0], shape.crownRx[1]);
  const ry = Math.max(2, rx * shape.crownFlat);
  // Pull the crown centre back over the pot so the silhouette balances.
  const main: CrownLobe = {
    cx: top.x * 0.5,
    cy: top.y + ry * 0.45,
    cz: top.z * 0.5,
    rx,
    ry,
    rz: rx * rngRange(rng, 0.85, 1),
    attachT: 0.5,
    main: true,
  };
  const lobes: CrownLobe[] = [main];
  const golden = 2.39996;
  let azimuth = rngRange(rng, 0, Math.PI * 2);
  for (let i = 0; i < shape.lobes; i++) {
    azimuth += golden + rngRange(rng, -0.3, 0.3);
    const spread = rx * rngRange(rng, shape.lobeSpread[0], shape.lobeSpread[1]);
    const scale = rngRange(rng, 0.45, 0.62);
    lobes.push({
      cx: main.cx + Math.cos(azimuth) * spread,
      cy: main.cy + rngRange(rng, -ry * 0.45, ry * 0.55),
      cz: main.cz + Math.sin(azimuth) * spread * 0.9,
      rx: rx * scale,
      ry: Math.max(1.4, ry * scale * 1.1),
      rz: rx * scale * rngRange(rng, 0.85, 1),
      attachT: 0.62 + i * 0.07,
      main: false,
    });
  }
  return lobes;
};

/** Thick connecting branches from the trunk out to each secondary lobe. */
const buildBranchesToLobes = (
  out: Voxel[],
  rng: Rng,
  trunk: PathPoint[],
  lobes: CrownLobe[],
  species: BonsaiSpecies,
): void => {
  const shape = species.shape;
  for (const lobe of lobes) {
    if (lobe.main) continue;
    // Attach where the trunk is closest in height to just under the lobe.
    const attachT = Math.min(0.9, Math.max(0.45, rngRange(rng, 0.55, 0.85)));
    const start = trunk[Math.round(attachT * (trunk.length - 1))];
    const target = { x: lobe.cx, y: lobe.cy - lobe.ry * 0.4, z: lobe.cz };
    const len = Math.hypot(target.x - start.x, target.y - start.y, target.z - start.z);
    const capped = Math.min(len, rngRange(rng, shape.branchLen[0], shape.branchLen[1]) + len * 0.4);
    const steps = Math.max(4, Math.round(capped)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Slight sag makes the limb read as wood carrying weight.
      const sag = Math.sin(t * Math.PI) * 0.5;
      fillDisc(
        out,
        {
          x: start.x + (target.x - start.x) * t,
          y: start.y + (target.y - start.y) * t - sag,
          z: start.z + (target.z - start.z) * t,
          r: 1.1 * (1 - t) + 0.4,
          t,
        },
        (r) => rngPick(r, species.trunk),
        'branch',
        (radial) => Math.min(0.9, 0.08 + attachT * 0.26 + t * 0.1 + radial * 0.04),
        rng,
      );
    }
  }
};

const fillLobe = (
  out: Voxel[],
  anchors: BlossomAnchor[],
  rng: Rng,
  lobe: CrownLobe,
  species: BonsaiSpecies,
): void => {
  const shape = species.shape;
  const layer: VoxelLayer = lobe.cz < 0 ? 'canopyBack' : 'canopyFront';
  // Leaves arrive early (main lobe by G≈0.3) so the young tree never looks bare.
  const baseThreshold = lobe.main ? 0.24 : 0.14 + lobe.attachT * 0.34;

  for (let dx = -Math.ceil(lobe.rx); dx <= Math.ceil(lobe.rx); dx++) {
    for (let dy = -Math.ceil(lobe.ry); dy <= Math.ceil(lobe.ry); dy++) {
      for (let dz = -Math.ceil(lobe.rz); dz <= Math.ceil(lobe.rz); dz++) {
        const d = Math.hypot(dx / lobe.rx, dy / lobe.ry, dz / lobe.rz);
        if (d > 1) continue;
        const shell = d > 0.62;
        // Ragged silhouette: drop shell voxels so the crown reads as living
        // foliage; plum drops many more for its airy look.
        if (shell && rng() < shape.sparse) continue;
        // The underside thins out — real crowns are darker and sparser below.
        if (dy < -lobe.ry * 0.4 && rng() < 0.35) continue;
        const threshold = Math.min(0.985, baseThreshold + d * 0.3 + rngRange(rng, 0, 0.04));
        // Outer shell voxels turn pink first; the core keeps green depth.
        const bloomAt = shell ? rngRange(rng, 0.05, 0.75) : rngRange(rng, 0.55, 1.15);
        push(out, {
          x: Math.round(lobe.cx + dx),
          y: Math.round(lobe.cy + dy),
          z: Math.round(lobe.cz + dz),
          color: rngPick(rng, species.leaf),
          kind: 'leaf',
          layer,
          threshold,
          bloomAt,
          size: shell ? 0.88 : 1,
        });
        if (shell && dy >= 0 && rng() < 0.12) {
          anchors.push({ x: Math.round(lobe.cx + dx), y: Math.round(lobe.cy + dy) + 1, z: Math.round(lobe.cz + dz), layer });
        }
        // Wisteria: blossom tails rain from the crown's underside.
        if (shape.droop > 0 && shell && dy <= -lobe.ry * 0.35 && rng() < 0.42) {
          const tail = rngInt(rng, 2, 4);
          for (let t = 1; t <= tail; t++) {
            push(out, {
              x: Math.round(lobe.cx + dx),
              y: Math.round(lobe.cy + dy) - t,
              z: Math.round(lobe.cz + dz),
              color: rngPick(rng, species.leaf),
              kind: 'leaf',
              layer,
              threshold: Math.min(0.985, threshold + t * 0.05),
              bloomAt: rngRange(rng, 0.02, 0.4),
              size: 0.74,
            });
          }
        }
      }
    }
  }
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

const buildPot = (out: Voxel[], rng: Rng): void => {
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
          color: rim ? PALETTE.potRim : y === 1 ? PALETTE.potFoot : PALETTE.pot,
          kind: 'pot',
          threshold: 0,
        });
        if (y === 3 && d <= 0.62) {
          push(out, { x, y, z, color: PALETTE.soil, kind: 'soil', threshold: 0 });
        }
      }
    }
  }
  void rng;
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
  buildPot(voxels, createRng(childSeed(seed, 'pot')));
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

  const crownRng = createRng(childSeed(seed, `crown:${species.id}`));
  const lobes = planCrown(crownRng, trunk, species.shape);
  buildBranchesToLobes(voxels, createRng(childSeed(seed, `branches:${species.id}`)), trunk, lobes, species);
  const leafRng = createRng(childSeed(seed, `leaves:${species.id}`));
  for (const lobe of lobes) {
    fillLobe(voxels, anchors, leafRng, lobe, species);
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

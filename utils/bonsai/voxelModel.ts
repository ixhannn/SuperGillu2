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

export interface BonsaiSpecies {
  id: BonsaiSpeciesId;
  name: string;
  line: string;
  leaf: readonly string[];
  blossom: readonly string[];
  blossomBright: string;
  trunk: readonly string[];
  /** 0 = puffed pads (sakura); 1 = hanging tails below pads (wisteria). */
  droop: number;
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
    droop: 0,
  },
  wisteria: {
    id: 'wisteria',
    name: 'Wisteria',
    line: 'Lavender falls like slow rain.',
    leaf: ['#75a45c', '#65944e', '#86b269'],
    blossom: ['#cdb4e2', '#b79bd8', '#a487c9', '#8f72b8'],
    blossomBright: '#e6d7f2',
    trunk: ['#7d6a56', '#71604c', '#89755f'],
    droop: 1,
  },
  plum: {
    id: 'plum',
    name: 'Plum',
    line: 'It blooms earliest, in the cold, out of stubborn love.',
    leaf: ['#7aa861', '#6a9853', '#8db571'],
    blossom: ['#f7e6ea', '#f2c9d4', '#e8a4b8', '#c96f8c'],
    blossomBright: '#fdf4f6',
    trunk: ['#6f4a38', '#654232', '#7a5440'],
    droop: 0,
  },
  maple: {
    id: 'maple',
    name: 'Maple',
    line: 'It saves its fire for the days you keep showing up.',
    leaf: ['#84ac58', '#749c4c', '#95b968'],
    blossom: ['#e2734b', '#d95f3b', '#c94f2f', '#e88a5a'],
    blossomBright: '#f2a06a',
    trunk: ['#77503c', '#6c4735', '#835a44'],
    droop: 0,
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

/** Gnarled bonsai trunk: an S-curve lean (informal upright / moyogi). */
const buildTrunkPath = (rng: Rng, baseY: number): PathPoint[] => {
  const height = rngInt(rng, 13, 15);
  const leanDir = rngRange(rng, 0, Math.PI * 2);
  const leanAmp = rngRange(rng, 1.4, 2.2);
  const counter = rngRange(rng, 0.5, 0.9);
  const points: PathPoint[] = [];
  // Half-steps keep the voxelised curve connected through diagonal moves.
  for (let i = 0; i <= height * 2; i++) {
    const t = i / (height * 2);
    // S-curve: lean out, then pull back over the pot.
    const sway = Math.sin(t * Math.PI) * leanAmp - Math.sin(t * Math.PI * 2) * leanAmp * counter * 0.4;
    const x = Math.cos(leanDir) * sway;
    const z = Math.sin(leanDir) * sway * 0.8;
    const r = 1.7 * (1 - t) + 0.6;
    points.push({ x, y: baseY + i / 2, z, r, t });
  }
  return points;
};

interface BranchSpec {
  path: PathPoint[];
  /** Trunk progress where this branch attaches (drives growth threshold). */
  attachT: number;
  tip: PathPoint;
}

const buildBranches = (rng: Rng, trunk: PathPoint[]): BranchSpec[] => {
  const specs: BranchSpec[] = [];
  const attachTs = [0.38, 0.56, 0.72, 0.86];
  const golden = 2.39996; // golden angle keeps branches from stacking
  let azimuth = rngRange(rng, 0, Math.PI * 2);
  for (const at of attachTs) {
    const count = at < 0.6 ? 2 : 1;
    for (let c = 0; c < count; c++) {
      azimuth += golden + rngRange(rng, -0.3, 0.3);
      const start = trunk[Math.round(at * (trunk.length - 1))];
      const len = rngRange(rng, 3.2, 5.6) * (1 - at * 0.35);
      const rise = rngRange(rng, 1.2, 2.2);
      const path: PathPoint[] = [];
      const steps = Math.max(3, Math.round(len)) * 2; // half-steps stay connected
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Bonsai branches reach out, lift, then flatten toward the pad.
        const reach = len * t;
        const lift = rise * Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.5);
        path.push({
          x: start.x + Math.cos(azimuth) * reach,
          y: start.y + lift,
          z: start.z + Math.sin(azimuth) * reach,
          r: 0.9 * (1 - t) + 0.3,
          t,
        });
      }
      specs.push({ path, attachT: at, tip: path[path.length - 1] });
    }
  }
  // Apex pad on top of the trunk.
  const top = trunk[trunk.length - 1];
  specs.push({ path: [], attachT: 0.95, tip: { ...top, y: top.y + 0.5 } });
  return specs;
};

/** A foliage "cloud" pad: flattened ellipsoid of leaf/blossom voxels. */
const buildPad = (
  out: Voxel[],
  anchors: BlossomAnchor[],
  rng: Rng,
  tip: PathPoint,
  attachT: number,
  scale: number,
  species: BonsaiSpecies,
): void => {
  const rx = rngRange(rng, 2.6, 4.2) * scale;
  const ry = rngRange(rng, 1.2, 1.9) * scale;
  const rz = rngRange(rng, 2.6, 4.2) * scale;
  const cx = tip.x;
  const cy = tip.y + ry * 0.55;
  const cz = tip.z;
  const layer: VoxelLayer = cz < 0 ? 'canopyBack' : 'canopyFront';
  // Leaves arrive early (low pads by G≈0.3) so the young tree never looks bare.
  const baseThreshold = 0.16 + attachT * 0.34;

  for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      for (let dz = -Math.ceil(rz); dz <= Math.ceil(rz); dz++) {
        const d = Math.hypot(dx / rx, dy / ry, dz / rz);
        if (d > 1) continue;
        const shell = d > 0.62;
        // Ragged silhouette: drop a fraction of the shell so pads read as
        // living foliage clouds, not geometric ellipsoids.
        if (shell && rng() < 0.13) continue;
        const threshold = Math.min(0.985, baseThreshold + d * 0.3 + rngRange(rng, 0, 0.04));
        // Outer shell voxels turn pink first; the core keeps green depth.
        const bloomAt = shell ? rngRange(rng, 0.05, 0.75) : rngRange(rng, 0.55, 1.15);
        push(out, {
          x: Math.round(cx + dx),
          y: Math.round(cy + dy),
          z: Math.round(cz + dz),
          color: rngPick(rng, species.leaf),
          kind: 'leaf',
          layer,
          threshold,
          bloomAt,
          size: shell ? 0.88 : 1,
        });
        if (shell && dy >= 0 && rng() < 0.14) {
          anchors.push({ x: Math.round(cx + dx), y: Math.round(cy + dy) + 1, z: Math.round(cz + dz), layer });
        }
        // Wisteria: blossom tails hang below the pad's underside.
        if (species.droop > 0 && shell && dy <= -ry * 0.5 && rng() < 0.3) {
          const tail = rngInt(rng, 2, 3);
          for (let t = 1; t <= tail; t++) {
            push(out, {
              x: Math.round(cx + dx),
              y: Math.round(cy + dy) - t,
              z: Math.round(cz + dz),
              color: rngPick(rng, species.leaf),
              kind: 'leaf',
              layer,
              threshold: Math.min(0.985, threshold + t * 0.05),
              bloomAt: rngRange(rng, 0.02, 0.4),
              size: 0.78,
            });
          }
        }
      }
    }
  }

  // Satellite tufts break up the outline further.
  for (let i = 0; i < 2; i++) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const tx = Math.round(cx + Math.cos(a) * (rx + 0.8));
    const ty = Math.round(cy + rngRange(rng, -0.5, ry * 0.5));
    const tz = Math.round(cz + Math.sin(a) * (rz + 0.8));
    for (let n = 0; n < 3; n++) {
      push(out, {
        x: tx + rngInt(rng, -1, 1),
        y: ty + rngInt(rng, 0, 1),
        z: tz + rngInt(rng, -1, 1),
        color: rngPick(rng, species.leaf),
        kind: 'leaf',
        layer,
        threshold: Math.min(0.985, baseThreshold + 0.28 + rngRange(rng, 0, 0.06)),
        bloomAt: rngRange(rng, 0.1, 0.8),
        size: 0.82,
      });
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

  const trunkRng = createRng(childSeed(seed, 'trunk'));
  const trunk = buildTrunkPath(trunkRng, 4);
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

  const branchRng = createRng(childSeed(seed, 'branches'));
  const branches = buildBranches(branchRng, trunk);
  const padRng = createRng(childSeed(seed, 'pads'));
  for (const b of branches) {
    for (const p of b.path) {
      fillDisc(
        voxels,
        p,
        (r) => rngPick(r, species.trunk),
        'branch',
        (radial) => Math.min(0.9, 0.06 + b.attachT * 0.3 + p.t * 0.12 + radial * 0.04),
        branchRng,
      );
    }
    buildPad(voxels, anchors, padRng, b.tip, b.attachT, b.attachT > 0.9 ? 1.05 : 0.95, species);
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

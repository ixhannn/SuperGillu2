/**
 * Deterministic voxel sakura bonsai generator.
 * The full "adult" tree is generated once from the couple seed; every voxel
 * carries a growth threshold in [0..1] so the tree can be revealed
 * voxel-by-voxel as the couple's growth points accumulate. Both partners
 * generate byte-identical models from the same seed.
 *
 * Composition (what makes it read as a BONSAI, not a normal tree):
 *  - a slender S-curve trunk with a flared nebari base — a visible hero line
 *  - discrete flattened CLOUD-PADS of foliage stacked asymmetrically along
 *    the trunk (the scalene-triangle rule: big low pad one side, mid pad
 *    opposite, small accent behind, little crown on top) with sky between
 *  - a shallow oval ceramic tray, wider than tall — never a bucket
 *  - a finer voxel grid than a toy tree: small cubes read as craft, not chunk
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
  /** Per-voxel shade shift, carried through to bloom colours (pad tops stay
   *  luminous, undersides deepen — and maple's fire gradient survives the
   *  green→blossom transition). */
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

/** One flowering cloud-pad in a bonsai's layered canopy. */
export interface PadPlan {
  /** Where on the trunk (0=base, 1=top) the pad's branch attaches. */
  attachT: number;
  /** Horizontal direction the pad juts, in degrees (0 = +x, front-right). */
  azimuthDeg: number;
  /** Horizontal distance from the trunk to the pad centre. */
  reach: number;
  rx: number;
  ry: number;
  rz: number;
}

/**
 * Geometry grammar — what makes each species a DIFFERENT bonsai style.
 * The silhouette lives in the trunk line plus an explicit scalene pad plan.
 */
export interface BonsaiShape {
  /** Trunk height range (voxels above the soil). */
  height: [number, number];
  /** Lean amplitude range — how dramatic the trunk line is. */
  lean: [number, number];
  /** true = one-direction arc (cascade); false = classic S-curve (moyogi). */
  arc?: boolean;
  /** Trunk thickness multiplier (literati trunks are thin). */
  girth: number;
  /** Shell drop fraction — high = airy, see-through pads. */
  sparse: number;
  /** Foliage voxel size — fine-leaved species use smaller cubes. */
  leafSize: number;
  /** 0 = none; 1 = blossom racemes hang below pad rims (wisteria). */
  droop: number;
  /** Blossoms bud straight from bare wood (plum flowers before leafing). */
  bareBloom?: boolean;
  /** The cloud-pad composition — the layered bonsai canopy, lowest first. */
  padPlan: PadPlan[];
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
    leaf: ['#8cab72', '#7c9b64', '#9cb881'],
    blossom: ['#f6c9d7', '#f2aec4', '#e29aae', '#d27f95'],
    blossomBright: '#f7d3e0',
    trunk: ['#7a5236', '#6d472e', '#855b41'],
    // DEEP wine glazed tray — warm ceramic in the brand family but a full
    // value-step darker than the blossoms so it never merges with the canopy.
    // (An indigo tray read as WATER around the tree — never blue vessels.)
    pot: { body: '#9c5f68', rim: '#8c525c', foot: '#77444d' },
    // Moyogi (informal upright): slender S-curve trunk, three asymmetric
    // cloud-pads (big low right, mid left, small back accent) + a crown.
    shape: {
      height: [15, 15], lean: [4.6, 5.4], girth: 1.0,
      sparse: 0.08, leafSize: 0.94, droop: 0,
      padPlan: [
        // Canopy rides the UPPER trunk, and pads jut to the SIDES of the iso
        // camera (never toward it) so the bare S, the nebari and the tray all
        // stay visible: big cloud screen-right, counter cloud screen-left, a
        // small accent peeking behind, and the crown counter-leaning left.
        { attachT: 0.45, azimuthDeg: 335, reach: 5.3, rx: 5.8, ry: 2.0, rz: 5.0 },
        { attachT: 0.68, azimuthDeg: 160, reach: 4.8, rx: 4.8, ry: 1.8, rz: 4.0 },
        { attachT: 0.85, azimuthDeg: 250, reach: 3.6, rx: 3.4, ry: 1.6, rz: 2.9 },
        { attachT: 1.0, azimuthDeg: 30, reach: 1.4, rx: 2.9, ry: 1.8, rz: 2.6 },
      ],
    },
  },
  wisteria: {
    id: 'wisteria',
    name: 'Wisteria',
    line: 'Lavender falls like slow rain.',
    leaf: ['#75a45c', '#65944e', '#86b269'],
    blossom: ['#cdb4e2', '#b79bd8', '#a487c9', '#8f72b8'],
    blossomBright: '#e6d7f2',
    trunk: ['#6f5d4a', '#635341', '#7c6853'],
    // Warm cream ceramic so the lavender racemes carry the colour.
    pot: { body: '#cfc2ae', rim: '#b8ab96', foot: '#a0937f' },
    // Cascade-leaning arch: broad low pads raining blossom racemes, with a
    // clear gap under the crown so the racemes read against the sky.
    shape: {
      height: [12, 13], lean: [4.4, 5.2], arc: true, girth: 0.95,
      sparse: 0.1, leafSize: 0.9, droop: 1,
      padPlan: [
        { attachT: 0.5, azimuthDeg: 20, reach: 6.4, rx: 7.4, ry: 2.0, rz: 6.0 },
        { attachT: 0.8, azimuthDeg: 200, reach: 4.6, rx: 5.0, ry: 1.8, rz: 4.2 },
        { attachT: 1.0, azimuthDeg: 60, reach: 1.4, rx: 3.6, ry: 1.8, rz: 3.1 },
      ],
    },
  },
  plum: {
    id: 'plum',
    name: 'Plum',
    line: 'It blooms earliest, in the cold, out of stubborn love.',
    leaf: ['#7aa861', '#6a9853', '#8db571'],
    blossom: ['#f7e6ea', '#f2c9d4', '#e8a4b8', '#c96f8c'],
    blossomBright: '#fdf4f6',
    trunk: ['#66422f', '#5b3a29', '#714c38'],
    pot: { body: '#9a8d80', rim: '#877a6e', foot: '#75695e' },
    // Literati (bunjin): tall thin serpentine trunk mostly bare, small airy
    // crowns riding high, blossoms budding straight off the wood.
    shape: {
      height: [17, 18], lean: [3.8, 4.6], girth: 0.62,
      sparse: 0.3, leafSize: 0.78, droop: 0, bareBloom: true,
      padPlan: [
        { attachT: 0.62, azimuthDeg: 30, reach: 4.6, rx: 3.5, ry: 1.5, rz: 2.9 },
        { attachT: 0.82, azimuthDeg: 210, reach: 3.8, rx: 3.0, ry: 1.4, rz: 2.5 },
        { attachT: 1.0, azimuthDeg: 90, reach: 1.2, rx: 2.7, ry: 1.5, rz: 2.3 },
      ],
    },
  },
  maple: {
    id: 'maple',
    name: 'Maple',
    line: 'It saves its fire for the days you keep showing up.',
    leaf: ['#84ac58', '#749c4c', '#95b968'],
    blossom: ['#e2734b', '#d95f3b', '#c94f2f', '#e88a5a'],
    blossomBright: '#f2a06a',
    trunk: ['#6d4632', '#623d2b', '#78503b'],
    pot: { body: '#8fb59b', rim: '#7aa186', foot: '#688e74' },
    // Upright layered broom: thick straight-ish trunk, four tidy tiers with
    // air between them, the lower pads burning darker than the crown.
    shape: {
      height: [14, 15], lean: [1.3, 1.7], girth: 1.15,
      sparse: 0.07, leafSize: 0.9, droop: 0,
      padPlan: [
        { attachT: 0.34, azimuthDeg: 20, reach: 5.6, rx: 6.0, ry: 2.0, rz: 5.0 },
        { attachT: 0.56, azimuthDeg: 200, reach: 4.6, rx: 5.0, ry: 1.8, rz: 4.2 },
        { attachT: 0.76, azimuthDeg: 330, reach: 3.8, rx: 4.0, ry: 1.7, rz: 3.4 },
        { attachT: 1.0, azimuthDeg: 90, reach: 1.2, rx: 3.2, ry: 1.8, rz: 2.8 },
      ],
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
  // Sage-muted greens: the lawn is a supporting player — pink is the hero.
  grass: ['#a3b37e', '#97a872', '#aebe89'],
  grassEdge: '#8c9c6b',
  soilSide: '#9c7250',
  rock: ['#948a7c', '#877d70'],
  pot: '#c98a8f',
  potRim: '#b5767c',
  potFoot: '#a2666d',
  // Dark enough that trunk wood sits clearly LIGHTER than the earth below it.
  soil: '#5a4030',
  soilMoss: '#9aa878',
  seed: '#8a6248',
  sprout: '#8cab72',
  trunk: ['#8a6248', '#81593f', '#936b4f'],
  leaf: ['#8cab72', '#7c9b64', '#9cb881'],
  blossom: ['#f6c9d7', '#f2aec4', '#e29aae', '#d27f95'],
  blossomBright: '#f7d3e0',
  gold: '#e9c46a',
  lanternStone: '#b9b3a8',
  lanternLight: '#ffd98a',
  // Warm celadon pool — never swimming-pool blue in a dusty-rose world.
  water: '#d4e2de',
  waterDeep: '#b9cfc9',
  koi: '#d98a68',
  koiWhite: '#f4ede2',
  chime: '#cfc8bd',
  wood: '#b08a5e',
  torii: '#b25a60',
  moss: '#9cb287',
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
  // Keep the lean roughly facing the isometric camera so the S always reads
  // in profile (a random azimuth can hide the whole curve behind the trunk).
  const leanDir = rngRange(rng, -0.35, 0.55);
  const leanAmp = rngRange(rng, shape.lean[0], shape.lean[1]);
  const points: PathPoint[] = [];
  // Half-steps keep the voxelised curve connected through diagonal moves.
  for (let i = 0; i <= height * 2; i++) {
    const t = i / (height * 2);
    // Moyogi S with the drama LOW where the trunk is bare and visible: the
    // belly swings wide by ~1/4 height, returns over the nebari at mid, and
    // the apex counter-leans the other way — a readable serpentine line.
    const sway = shape.arc
      ? Math.sin(t * Math.PI * 0.55) * leanAmp
      : Math.sin(Math.PI * t * 1.35) * leanAmp * (1 - 0.25 * t);
    const x = Math.cos(leanDir) * sway;
    const z = Math.sin(leanDir) * sway * 0.8;
    // Flared nebari tapering hard to a fine apex — slender through the middle
    // so the serpentine line stays elegant and readable between the pads.
    const r = (1.7 * Math.pow(1 - t, 1.9) + 0.6) * shape.girth;
    points.push({ x, y: baseY + i / 2, z, r, t });
  }
  return points;
};

interface FoliageBlob {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
}

/**
 * The bonsai signature: discrete flowering CLOUD-PADS. Each pad is one core
 * ellipsoid plus a ring of small fluff blobs — inner fluff domes the top,
 * outer fluff sits slightly lower so the rim droops like a real foliage
 * cloud — with a FLAT clipped underside. Pads sit in their own y-bands at
 * scalene azimuths, each tied to the trunk by a short thick sagging limb, so
 * the sculptural trunk stays visible below and between them. The canopy
 * reveals tier-by-tier from the lowest pad up as the couple's tree grows.
 */
const buildCloudPads = (
  out: Voxel[],
  anchors: BlossomAnchor[],
  rng: Rng,
  trunk: PathPoint[],
  species: BonsaiSpecies,
): void => {
  const shape = species.shape;
  const plan = shape.padPlan;
  const at = (t: number): PathPoint =>
    trunk[Math.max(0, Math.min(trunk.length - 1, Math.round(t * (trunk.length - 1))))];
  const lastTier = Math.max(1, plan.length - 1);

  plan.forEach((pad, tier) => {
    const from = at(pad.attachT);
    const az = (pad.azimuthDeg * Math.PI) / 180;
    const cx = from.x + Math.cos(az) * pad.reach;
    const cz = from.z + Math.sin(az) * pad.reach * 0.82;
    const cy = from.y + 0.9 + pad.ry * 0.25;
    // Wood precedes foliage: nothing about this pad appears until the trunk
    // has grown past its attach point (no more clouds floating in the sky).
    // Mirrors the trunk fill's own threshold formula.
    const trunkGate = 0.14 + pad.attachT * 0.3;

    // Short thick sagging limb from the trunk deep INTO the pad's cloud, so
    // every plate visibly hangs on wood.
    if (pad.reach > 0.5) {
      const tx = cx - Math.cos(az) * pad.rx * 0.22;
      const tz = cz - Math.sin(az) * pad.rz * 0.22;
      const ty = cy - pad.ry * 0.05;
      const steps = 7;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const sag = Math.sin(t * Math.PI) * 0.55;
        fillDisc(
          out,
          {
            x: from.x + (tx - from.x) * t,
            y: from.y + (ty - from.y) * t - sag,
            z: from.z + (tz - from.z) * t,
            r: (0.9 * (1 - t) + 0.42) * shape.girth,
            t,
          },
          (r) => rngPick(r, species.trunk),
          'branch',
          (radial) => Math.min(0.85, trunkGate + t * 0.04 + radial * 0.03),
          rng,
        );
      }
    }

    // Core plate + a ring of fluff: inner bumps dome the top, outer bumps
    // droop below the rim — a soft cloud, never a ball and never a slab.
    const blobs: FoliageBlob[] = [
      { cx, cy, cz, rx: pad.rx * 0.8, ry: pad.ry * 0.9, rz: pad.rz * 0.8 },
    ];
    const fluff = 6 + Math.round(pad.rx * 0.5);
    for (let i = 0; i < fluff; i++) {
      const a = (i / fluff) * Math.PI * 2 + rngRange(rng, -0.3, 0.3);
      const dist = rngRange(rng, 0.45, 0.8);
      const s = rngRange(rng, 0.3, 0.45);
      const outer = dist > 0.66;
      blobs.push({
        cx: cx + Math.cos(a) * pad.rx * dist,
        cy: cy + (outer ? -pad.ry * 0.28 : rngRange(rng, 0.05, 0.45) * pad.ry),
        cz: cz + Math.sin(a) * pad.rz * dist,
        rx: pad.rx * s,
        ry: pad.ry * s * 1.1,
        rz: pad.rz * s,
      });
    }

    // Union of blob cells; remember nearest-surface distance for shelling.
    const cells = new Map<string, { x: number; y: number; z: number; minD: number; padD: number }>();
    for (const b of blobs) {
      const rcx = Math.ceil(b.rx), rcy = Math.ceil(b.ry), rcz = Math.ceil(b.rz);
      for (let dx = -rcx; dx <= rcx; dx++) {
        for (let dy = -rcy; dy <= rcy; dy++) {
          for (let dz = -rcz; dz <= rcz; dz++) {
            const d = Math.hypot(dx / b.rx, dy / b.ry, dz / b.rz);
            if (d > 1) continue;
            const x = Math.round(b.cx + dx), y = Math.round(b.cy + dy), z = Math.round(b.cz + dz);
            const key = `${x},${y},${z}`;
            const prev = cells.get(key);
            if (prev) { if (d < prev.minD) prev.minD = d; }
            else {
              const padD = Math.hypot((x - cx) / pad.rx, (y - cy) / (pad.ry * 1.4), (z - cz) / pad.rz);
              cells.set(key, { x, y, z, minD: d, padD });
            }
          }
        }
      }
    }
    const has = (x: number, y: number, z: number): boolean => cells.has(`${x},${y},${z}`);

    // Maple's fire gradient: lower tiers burn darker than the crown; other
    // species keep it subtle. Pad tops stay luminous, undersides deepen.
    const tierShade = (tier / lastTier - 0.5) * (species.id === 'maple' ? 0.22 : 0.08);
    // The pad leafs out just after its limb finishes — never before its wood.
    const baseThreshold = trunkGate + 0.04 + tier * 0.04;

    for (const cell of cells.values()) {
      const { x, y, z, minD, padD } = cell;
      // FLAT underside: clip the belly so the pad reads as a floating cloud
      // plate and the trunk shows beneath it.
      if (y < cy - pad.ry * 0.75) continue;
      const layer: VoxelLayer = z < 0 ? 'canopyBack' : 'canopyFront';
      const exposedTop = !has(x, y + 1, z);
      const exposedSide =
        !has(x + 1, y, z) || !has(x - 1, y, z) || !has(x, y, z + 1) || !has(x, y, z - 1);
      const shell = exposedTop || exposedSide || minD > 0.7;
      // Airy species drop some side-shell voxels for a see-through crown.
      if (shell && exposedSide && !exposedTop && rng() < shape.sparse) continue;
      const rel = Math.max(0, Math.min(1, (y - cy) / (pad.ry * 2) + 0.5));
      const tint = Math.max(-0.15, Math.min(0.15, tierShade + (rel - 0.4) * 0.1));
      const threshold = Math.min(0.985, baseThreshold + padD * 0.2 + rngRange(rng, 0, 0.03));
      // Shell voxels turn to blossom first; the core keeps its green depth.
      const bloomAt = shell ? rngRange(rng, 0.05, 0.62) : rngRange(rng, 0.7, 1.3);
      push(out, {
        x, y, z,
        color: shadeHex(rngPick(rng, species.leaf), tint * 0.6),
        kind: 'leaf',
        layer,
        threshold,
        bloomAt,
        size: shell ? shape.leafSize : 1,
        tint,
      });
      if (exposedTop && rng() < 0.45) anchors.push({ x, y: y + 1, z, layer });
    }

    // Wisteria racemes: tapering blossom columns raining from the underside.
    if (shape.droop > 0 && tier < plan.length - 1) {
      for (const cell of cells.values()) {
        const { x, y, z } = cell;
        if (has(x, y - 1, z)) continue; // underside surface only
        if (y > cy + pad.ry * 0.1) continue;
        if (rng() > 0.32) continue;
        const tail = rngInt(rng, 4, 7);
        for (let t = 1; t <= tail; t++) {
          push(out, {
            x, y: y - t, z,
            color: rngPick(rng, species.leaf),
            kind: 'leaf',
            layer: z < 0 ? 'canopyBack' : 'canopyFront',
            threshold: Math.min(0.985, baseThreshold + 0.02 + t * 0.03 + rngRange(rng, 0, 0.03)),
            bloomAt: rngRange(rng, 0.02, 0.32),
            size: Math.max(0.46, 0.8 - t * 0.06),
          });
        }
      }
    }
  });
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
  // A quiet green floating disc — big enough to hold the finer-grained tree,
  // but plain so the bonsai is unquestionably the hero.
  const R = 11;
  for (let x = -Math.ceil(R); x <= Math.ceil(R); x++) {
    for (let z = -Math.ceil(R); z <= Math.ceil(R); z++) {
      const d = Math.hypot(x / R, z / (R * 0.84));
      if (d > 1) continue;
      const edge = d > 0.88;
      push(out, {
        x, y: 0, z,
        color: edge ? PALETTE.grassEdge : rngPick(rng, PALETTE.grass),
        kind: 'island',
        threshold: 0,
      });
      // Tapering rock underside gives the floating-diorama silhouette.
      const depth = Math.max(1, Math.round((1 - d) * 3));
      for (let y = -1; y >= -depth; y--) {
        if (Math.hypot(x / (R * (1 + y * 0.14)), z / (R * 0.84 * (1 + y * 0.14))) > 1) continue;
        push(out, { x, y, z, color: rngPick(rng, PALETTE.rock), kind: 'rock', threshold: 0 });
      }
      // A little living ground detail, kept sparse so it stays quiet.
      if (!edge && d < 0.82 && Math.hypot(x, z) > 7) {
        const roll = rng();
        if (roll < 0.03) {
          push(out, { x, y: 1, z, color: PALETTE.grassEdge, kind: 'island', threshold: 0, size: 0.32 });
        } else if (roll < 0.045) {
          push(out, { x, y: 1, z, color: rng() < 0.5 ? '#f2c9d4' : '#f4f1ea', kind: 'island', threshold: 0, size: 0.36 });
        }
      }
    }
  }
};

/**
 * A SHALLOW oval bonsai tray — clearly wider than tall (never a bucket):
 * low tapered walls (y=1..2), a slightly wider rim lip, little feet, and a
 * moss-capped soil mound the trunk rises out of at y=3.
 */
const buildPot = (out: Voxel[], pot: BonsaiPot, rng: Rng): void => {
  const RX = 6.4;
  const RZ = 5.0;
  const topY = 3;
  const staveDark = shadeHex(pot.body, -0.07);
  const staveLight = shadeHex(pot.body, 0.05);

  // Walls — a raised (but still tray-proportioned: 13 wide × 3 tall) hollow
  // oval with subtle vertical banding, so it reads as a VESSEL, not a moat.
  for (let y = 1; y <= topY; y++) {
    const grow = 0.9 + 0.1 * (y / topY);
    const rrx = RX * grow;
    const rrz = RZ * grow;
    for (let x = -Math.ceil(rrx); x <= Math.ceil(rrx); x++) {
      for (let z = -Math.ceil(rrz); z <= Math.ceil(rrz); z++) {
        const d = Math.hypot(x / rrx, z / rrz);
        if (d > 1) continue;
        if (Math.hypot(x / (rrx - 1.5), z / (rrz - 1.5)) <= 1) continue; // hollow
        const sector = Math.floor(((Math.atan2(z / rrz, x / rrx) + Math.PI) / (Math.PI * 2)) * 18);
        push(out, { x, y, z, color: sector % 2 === 0 ? staveDark : staveLight, kind: 'pot', threshold: 0 });
      }
    }
  }

  // Rim — a slightly wider LIT lip ring: the highlight band separates rim
  // from wall and sells the ceramic.
  const lipX = RX + 0.6;
  const lipZ = RZ + 0.6;
  const rimLit = shadeHex(pot.body, 0.16);
  for (let x = -Math.ceil(lipX); x <= Math.ceil(lipX); x++) {
    for (let z = -Math.ceil(lipZ); z <= Math.ceil(lipZ); z++) {
      const d = Math.hypot(x / lipX, z / lipZ);
      if (d > 1) continue;
      if (Math.hypot(x / (RX - 1.4), z / (RZ - 1.4)) <= 1) continue;
      push(out, { x, y: topY, z, color: rimLit, kind: 'pot', threshold: 0 });
    }
  }

  // Four little feet under the tray.
  for (const [fx, fz] of [[-4, -3], [-4, 3], [4, -3], [4, 3]] as const) {
    push(out, { x: fx, y: 0, z: fz, color: pot.foot, kind: 'pot', threshold: 0 });
  }

  // Soil — RECESSED one voxel below the rim (the shadowed inner lip is what
  // makes the tray read as a vessel with depth). Dark earth, never lawn-green,
  // with sparse organic moss flecks and a baked shadow ring where the trunk
  // meets the ground.
  const soilRx = RX - 1.0;
  const soilRz = RZ - 1.0;
  const soilTop = topY - 1;
  for (let x = -Math.ceil(soilRx); x <= Math.ceil(soilRx); x++) {
    for (let z = -Math.ceil(soilRz); z <= Math.ceil(soilRz); z++) {
      const d = Math.hypot(x / soilRx, z / soilRz);
      if (d > 1) continue;
      // Centre rises back to rim height — only the OUTER band stays recessed,
      // so the inner-lip shadow reads as vessel depth without a mud crater.
      const domeTop = soilTop + (d < 0.7 ? 1 : 0);
      for (let y = soilTop; y <= domeTop; y++) {
        const r = Math.hypot(x, z * 1.2);
        let color: string;
        if (y === domeTop && r > 1.8 && r < 2.8) {
          color = shadeHex(PALETTE.soil, -0.18); // trunk contact shadow
        } else if (y === domeTop && rng() < 0.2) {
          color = PALETTE.soilMoss;
        } else {
          color = y === domeTop ? shadeHex(PALETTE.soil, 0.08) : PALETTE.soil;
        }
        push(out, { x, y, z, color, kind: 'soil', threshold: 0 });
      }
    }
  }
};

const buildSeedAndSprout = (out: Voxel[]): void => {
  // Visible only at the very beginning; the trunk replaces them.
  push(out, { x: 0, y: 3, z: 0, color: PALETTE.seed, kind: 'seed', threshold: 0, size: 0.7 });
  push(out, { x: 0, y: 3, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.018 });
  push(out, { x: 0, y: 4, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.03 });
  push(out, { x: 1, y: 4, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.04, size: 0.8 });
  push(out, { x: -1, y: 4, z: 0, color: PALETTE.sprout, kind: 'sprout', threshold: 0.05, size: 0.8 });
  // Young shoots hugging the lower trunk — the first REAL leaves, long before
  // the first cloud-pad unlocks. (They also anchor the pacing contract: a
  // Sapling must show leaves even though pads now wait for their wood.)
  push(out, { x: 1, y: 5, z: 0, color: PALETTE.sprout, kind: 'leaf', threshold: 0.055, bloomAt: 1.2, size: 0.62 });
  push(out, { x: 0, y: 6, z: 1, color: PALETTE.sprout, kind: 'leaf', threshold: 0.095, bloomAt: 1.2, size: 0.6 });
  push(out, { x: -1, y: 6, z: 0, color: PALETTE.sprout, kind: 'leaf', threshold: 0.19, bloomAt: 1.2, size: 0.58 });
  push(out, { x: 1, y: 7, z: 0, color: PALETTE.sprout, kind: 'leaf', threshold: 0.23, bloomAt: 1.2, size: 0.56 });
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
  // Everything sits WELL inside the island (R≈11 × 9.2) and stays small so
  // the tree keeps the stage.
  // Moss garden — soft tufts ringing the pot.
  for (let i = 0; i < 8; i++) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const r = rngRange(rng, 5.5, 8.5);
    decorVoxel(out, 'moss', Math.round(Math.cos(a) * r), 1, Math.round(Math.sin(a) * r * 0.8), PALETTE.moss, 0.7);
  }
  // Stone lantern (front-right): 2-wide base, a lit chamber and a wide kasa
  // cap so the classic T-profile actually reads at this scale.
  const lx = 8, lz = 4;
  decorVoxel(out, 'lantern', lx, 1, lz, PALETTE.lanternStone, 0.95);
  decorVoxel(out, 'lantern', lx + 1, 1, lz, PALETTE.lanternStone, 0.8);
  decorVoxel(out, 'lantern', lx, 2, lz, PALETTE.lanternStone, 0.7);
  decorVoxel(out, 'lantern', lx, 3, lz, PALETTE.lanternLight, 0.8);
  decorVoxel(out, 'lantern', lx - 1, 4, lz, PALETTE.lanternStone, 0.8);
  decorVoxel(out, 'lantern', lx, 4, lz, PALETTE.lanternStone, 0.95);
  decorVoxel(out, 'lantern', lx + 1, 4, lz, PALETTE.lanternStone, 0.8);
  // Koi pond (front-left) — warm celadon water sitting FLUSH in the lawn
  // (full-size cells at grass level replace the turf; sides cull away), with
  // an irregular darker-grass rim.
  for (let x = -9; x <= -5; x++) {
    for (let z = 2; z <= 6; z++) {
      const d = Math.hypot((x + 7) / 2.0, (z - 4) / 1.6);
      if (d <= 1) {
        decorVoxel(out, 'koi-pond', x, 0, z, d < 0.5 ? PALETTE.waterDeep : PALETTE.water, 1);
      } else if (d <= 1.4 && (x * 3 + z * 5) % 2 === 0) {
        decorVoxel(out, 'koi-pond', x, 0, z, PALETTE.grassEdge, 1);
      }
    }
  }
  decorVoxel(out, 'koi-pond', -7, 0, 4, PALETTE.koi, 0.5);
  decorVoxel(out, 'koi-pond', -6, 0, 3, PALETTE.koiWhite, 0.45);
  // Wind chime hangs beneath the low pad's rim (front-right cloud).
  decorVoxel(out, 'wind-chime', 7, 9, -1, PALETTE.wood, 0.46);
  decorVoxel(out, 'wind-chime', 7, 8, -1, PALETTE.chime, 0.56);
  decorVoxel(out, 'wind-chime', 7, 7, -1, PALETTE.chime, 0.46);
  // Bench for two (right, facing the tree): one plank, two legs.
  decorVoxel(out, 'bench', 7, 1, -3, PALETTE.wood, 0.6);
  decorVoxel(out, 'bench', 9, 1, -3, PALETTE.wood, 0.6);
  for (let x = 7; x <= 9; x++) decorVoxel(out, 'bench', x, 2, -3, PALETTE.wood, 0.8);
  // A modest wine torii at the back-left gap (the pad plan leaves sky there),
  // posts along z so the gate faces the camera diagonal.
  const tx = -8;
  for (let y = 1; y <= 5; y++) {
    decorVoxel(out, 'torii', tx, y, -2, PALETTE.torii, 0.8);
    decorVoxel(out, 'torii', tx, y, 4, PALETTE.torii, 0.8);
  }
  for (let z = -3; z <= 5; z++) decorVoxel(out, 'torii', tx, 6, z, PALETTE.torii, 0.85);
  for (let z = -2; z <= 4; z++) decorVoxel(out, 'torii', tx, 5, z, PALETTE.torii, 0.62);
  // Songbird nest — tucked onto the low pad's rim (front-right cloud).
  const nest: Array<[number, number, number, string, number]> = [
    [7, 13, 0, PALETTE.wood, 0.7],
    [8, 13, 0, PALETTE.wood, 0.6],
    [7, 13, 1, PALETTE.wood, 0.6],
    [7, 14, 0, PALETTE.koiWhite, 0.5],
  ];
  for (const [x, y, z, color, size] of nest) {
    out.push({ x, y, z, color, kind: 'decor', layer: 'canopyFront', threshold: 0, decorId: 'nest', size });
  }
  // The bird itself — a warm rose fleck perched on the rim.
  out.push({ x: 8, y: 14, z: 1, color: '#e77c9d', kind: 'decor', layer: 'canopyFront', threshold: 0, decorId: 'nest', size: 0.46 });
};

export const generateBonsaiModel = (
  seed: number,
  speciesId: BonsaiSpeciesId = 'sakura',
): BonsaiModel => {
  const species = BONSAI_SPECIES[speciesId] ?? BONSAI_SPECIES.sakura;
  const voxels: Voxel[] = [];
  const anchors: BlossomAnchor[] = [];

  buildIsland(voxels, createRng(childSeed(seed, 'island')));
  buildPot(voxels, species.pot, createRng(childSeed(seed, 'pot')));
  buildSeedAndSprout(voxels);
  buildDecorations(voxels, createRng(childSeed(seed, 'decor')));

  // Species-salted streams: the same couple gets a genuinely different
  // SILHOUETTE per species, not just a recolour.
  const trunkRng = createRng(childSeed(seed, `trunk:${species.id}`));
  const trunk = buildTrunkPath(trunkRng, 3, species.shape);
  for (const p of trunk) {
    // Wood starts only as the sprout window ends (G≈0.14-0.16) so the first
    // days stay a tender seedling, never a broken stump; girth by mid-game.
    fillDisc(
      voxels,
      p,
      (r) => rngPick(r, species.trunk),
      'trunk',
      (radial) => Math.max(0.14 + p.t * 0.3, radial * 0.6 - 0.05),
      trunkRng,
    );
  }

  // Nebari — the root flare bonsai are prized for. Pale spokes of root
  // spreading over the DARK earth (light-on-dark so the flare reads).
  const nebariRng = createRng(childSeed(seed, 'nebari'));
  const nebariColor = shadeHex(species.trunk[2], 0.12);
  const spokes = rngInt(nebariRng, 5, 7);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rngRange(nebariRng, -0.3, 0.3);
    for (let r = 2; r <= 4; r++) {
      push(voxels, {
        x: Math.round(Math.cos(a) * r),
        y: 3,
        z: Math.round(Math.sin(a) * r * 0.8),
        color: nebariColor,
        kind: 'trunk',
        threshold: 0.1 + r * 0.05,
        size: r === 4 ? 0.6 : r === 3 ? 0.8 : 1,
      });
    }
  }

  const canopyRng = createRng(childSeed(seed, `canopy:${species.id}`));
  buildCloudPads(voxels, anchors, canopyRng, trunk, species);
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

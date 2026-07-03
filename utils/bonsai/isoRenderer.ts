/**
 * Isometric voxel renderer for the bonsai scene.
 * The tree is painted onto three offscreen layers (static ground/trunk,
 * back canopy, front canopy) only when state changes; the per-frame cost is
 * just compositing those layers with a gentle sway — no per-voxel redraws,
 * no WebGL, safe under glass and cheap on mobile GPUs.
 *
 * Light model (what makes it read as a diorama, not flat cubes):
 *  - hidden-face culling: faces sharing a cell with a neighbour never draw
 *  - ambient occlusion: faces under/beside neighbours darken into crevices
 *  - directional sun (upper-right): lit right faces, shaded left faces,
 *    higher voxels catch slightly more light
 *  - a soft contact shadow grounds the tree on the island
 */

import { hashString } from './rng';
import type { BonsaiSeason } from './growth';
import type { BonsaiDecorationId } from './types';
import {
  growthToBloom,
  growthToG,
  PALETTE,
  type BlossomAnchor,
  type BonsaiModel,
  type Voxel,
  type VoxelLayer,
} from './voxelModel';

export interface SceneOptions {
  growth: number;
  bloomCount: number;
  decorations: ReadonlySet<BonsaiDecorationId>;
  resting: boolean;
  golden: boolean;
  season: BonsaiSeason;
  /** Ordinal bloom indices that were "twin blooms" (watered within minutes). */
  twinIndices?: ReadonlySet<number>;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

const AUTUMN_LEAVES = ['#d9a05b', '#c98a4b', '#b9793f'];
const SNOW = '#f3f0f4';
const SHADOW_INK = '#3a2b33';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const hexToRgb = (color: string): [number, number, number] => {
  if (color.startsWith('rgb')) {
    const parts = color.slice(color.indexOf('(') + 1, -1).split(',').map(Number);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
};

/** Lighten (amount > 0) or darken (amount < 0), optionally desaturate. */
const shade = (hex: string, amount: number, desat = 0): string => {
  const [r, g, b] = hexToRgb(hex);
  const grey = (r + g + b) / 3;
  const mix = (c: number): number => {
    const d = c + (grey - c) * desat;
    return Math.round(clamp(amount >= 0 ? d + (255 - d) * amount : d * (1 + amount), 0, 255));
  };
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
};

const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

const isGround = (v: Voxel): boolean =>
  (v.kind === 'island' || v.kind === 'rock') && v.y <= 1;

/**
 * A voxel plus everything about it that never changes between repaints.
 * Hashing (string building + FNV) per voxel per render was the dominant
 * repaint cost — precomputing it once makes growth scrubbing/time-lapse
 * renders ~3× cheaper.
 */
interface PreppedVoxel {
  v: Voxel;
  jitter: number;
  /** Deterministic per-voxel roll shared by bloom/autumn/carpet/snow picks. */
  h: number;
  snowTop: boolean;
}

export class VoxelSceneRenderer {
  private model: BonsaiModel;
  private layers: Record<VoxelLayer, HTMLCanvasElement | null> = {
    static: null,
    canopyBack: null,
    canopyFront: null,
  };
  private sorted: PreppedVoxel[] = [];
  private scale = 8;
  private origin: ScreenPoint = { x: 0, y: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;
  private optsKey = '';

  constructor(model: BonsaiModel) {
    this.model = model;
    this.sorted = [...model.voxels]
      .sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y || a.x - b.x)
      .map((v) => {
        const h = hashString(`${v.x},${v.y},${v.z}`);
        return {
          v,
          h,
          jitter: ((h % 9) - 4) / 100,
          snowTop: (v.kind === 'leaf' || v.kind === 'island') && (h >> 4) % 10 < 4,
        };
      });
  }

  layout(widthCss: number, heightCss: number, dpr: number): void {
    this.width = Math.max(1, Math.round(widthCss));
    this.height = Math.max(1, Math.round(heightCss));
    this.dpr = clamp(dpr, 1, 2);
    const b = this.model.bounds;
    const spanX = (b.maxX - b.minX + b.maxZ - b.minZ + 4);
    const spanY = b.maxY - b.minY + (b.maxX + b.maxZ) / 2 + 6;
    this.scale = Math.floor(
      Math.min((this.width * 0.92) / spanX, (this.height * 0.92) / spanY),
    );
    this.scale = clamp(this.scale, 4, 14);
    const v = this.vh();
    this.origin = {
      x: this.width / 2,
      y: this.height / 2 + ((b.maxY + b.minY) / 2) * v + this.scale * 1.5,
    };
    this.optsKey = ''; // force re-render at new size
  }

  private vh(): number {
    return this.scale * 0.95;
  }

  project(x: number, y: number, z: number): ScreenPoint {
    return {
      x: this.origin.x + (x - z) * this.scale,
      y: this.origin.y - y * this.vh() + ((x + z) * this.scale) / 2,
    };
  }

  /** True when the given options require repainting the layers. */
  needsRender(opts: SceneOptions): boolean {
    return this.keyFor(opts) !== this.optsKey;
  }

  private keyFor(opts: SceneOptions): string {
    return [
      opts.growth,
      opts.bloomCount,
      [...opts.decorations].sort().join(','),
      opts.resting ? 1 : 0,
      opts.golden ? 1 : 0,
      opts.season,
      [...(opts.twinIndices ?? [])].sort().join(','),
      this.width,
      this.height,
      this.dpr,
    ].join('|');
  }

  render(opts: SceneOptions): void {
    const key = this.keyFor(opts);
    if (key === this.optsKey) return;
    this.optsKey = key;

    const G = growthToG(opts.growth);
    const bloomP = growthToBloom(opts.growth);
    const desat = opts.resting ? 0.38 : 0;
    const contexts: Record<VoxelLayer, CanvasRenderingContext2D> = {
      static: this.layerCtx('static'),
      canopyBack: this.layerCtx('canopyBack'),
      canopyFront: this.layerCtx('canopyFront'),
    };

    // Visible voxels + per-layer occupancy (full-size voxels only) for
    // hidden-face culling and ambient occlusion.
    const visible: PreppedVoxel[] = [];
    const occ: Record<VoxelLayer, Set<string>> = {
      static: new Set(),
      canopyBack: new Set(),
      canopyFront: new Set(),
    };
    for (const p of this.sorted) {
      if (!this.isVisible(p.v, G, opts)) continue;
      visible.push(p);
      if ((p.v.size ?? 1) >= 0.95) occ[p.v.layer].add(cellKey(p.v.x, p.v.y, p.v.z));
    }

    const winter = opts.season === 'winter';
    // Ground → contact shadow → everything else. Painter order within each
    // pass is preserved because `visible` keeps the global depth sort.
    for (const p of visible) {
      if (!isGround(p.v)) continue;
      this.drawCube(contexts.static, p.v, this.colorFor(p, bloomP, opts), desat, occ.static, winter && p.snowTop ? SNOW : null, p.jitter);
    }
    this.drawContactShadow(contexts.static, G);
    for (const p of visible) {
      if (isGround(p.v)) continue;
      this.drawCube(contexts[p.v.layer], p.v, this.colorFor(p, bloomP, opts), desat, occ[p.v.layer], winter && p.snowTop ? SNOW : null, p.jitter);
    }

    this.drawBloomAnchors(contexts, opts, G, desat);
  }

  /** Soft dark ellipse under the canopy — grounds the tree on the island. */
  private drawContactShadow(ctx: CanvasRenderingContext2D, G: number): void {
    if (G <= 0.02) return;
    const c = this.project(0, 0.9, 0);
    const rx = this.scale * (2.5 + 6.5 * G);
    ctx.save();
    ctx.globalAlpha = 0.09 + 0.07 * G;
    ctx.fillStyle = SHADOW_INK;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, rx * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private isVisible(v: Voxel, G: number, opts: SceneOptions): boolean {
    if (v.kind === 'decor') {
      return v.decorId != null && opts.decorations.has(v.decorId);
    }
    if (v.kind === 'seed') return G < 0.04;
    if (v.kind === 'sprout') return G >= v.threshold && G < 0.1;
    return G >= v.threshold;
  }

  private colorFor(p: PreppedVoxel, bloomP: number, opts: SceneOptions): string {
    const { v, h } = p;
    if (v.kind === 'leaf' && v.bloomAt != null && bloomP >= v.bloomAt) {
      if (opts.golden && h % 41 === 0) return PALETTE.gold;
      // ~1 in 3 blossoms is the bright/white variant — a fuller, real-sakura
      // sprinkle rather than flat pink.
      const bloom = h % 3 === 0
        ? this.model.palette.blossomBright
        : this.model.palette.blossom[h % this.model.palette.blossom.length];
      // Carry the pad-tier tint through the bloom (maple's fire gradient).
      return v.tint ? shade(bloom, v.tint) : bloom;
    }
    if (v.kind === 'leaf' && opts.season === 'autumn') {
      if ((h >> 2) % 5 < 2) return AUTUMN_LEAVES[h % AUTUMN_LEAVES.length];
    }
    if (v.kind === 'leaf' && opts.season === 'summer') {
      return shade(v.color, -0.06);
    }
    if (v.kind === 'leaf' && opts.season === 'winter') {
      return shade(v.color, 0.06, 0.25);
    }
    // Fallen-petal carpet: the island top slowly gathers colour as the tree
    // blooms — a visible record of every petal that ever fell.
    if (v.kind === 'island' && v.y === 0 && bloomP > 0.05) {
      if (((h >> 3) % 100) / 100 < bloomP * 0.28) {
        return shade(this.model.palette.blossom[h % this.model.palette.blossom.length], 0.1);
      }
    }
    return v.color;
  }

  private drawBloomAnchors(
    contexts: Record<VoxelLayer, CanvasRenderingContext2D>,
    opts: SceneOptions,
    G: number,
    desat: number,
  ): void {
    if (G < 0.4) return;
    const twins = opts.twinIndices;
    for (const { anchor, index } of this.visibleAnchors(opts.bloomCount, G)) {
      const twin = twins?.has(index) ?? false;
      if (twin) {
        // Twin blooms (watered within moments of each other) carry a gold rim.
        const rim: Voxel = {
          x: anchor.x, y: anchor.y, z: anchor.z,
          color: PALETTE.gold,
          kind: 'blossom',
          layer: anchor.layer,
          threshold: 0,
          size: 1.12,
        };
        this.drawCube(contexts[anchor.layer], rim, PALETTE.gold, desat, null, null);
      }
      const cube: Voxel = {
        x: anchor.x, y: anchor.y, z: anchor.z,
        color: this.model.palette.blossomBright,
        kind: 'blossom',
        layer: anchor.layer,
        threshold: 0,
        size: twin ? 0.86 : 0.92,
      };
      this.drawCube(contexts[anchor.layer], cube, this.model.palette.blossomBright, desat, null, null);
    }
  }

  /** Permanent bloom-day blossoms currently on the tree, oldest first. */
  visibleAnchors(bloomCount: number, G?: number): { anchor: BlossomAnchor; index: number }[] {
    const g = G ?? growthToG(0);
    const anchors = this.model.anchors;
    if (anchors.length === 0 || g < 0.4) return [];
    const count = Math.min(bloomCount, anchors.length);
    const out: { anchor: BlossomAnchor; index: number }[] = [];
    for (let i = 0; i < count; i++) out.push({ anchor: anchors[i], index: i });
    return out;
  }

  /** Screen position for bloom-day blossom i (for DOM glow overlays + taps). */
  anchorScreen(index: number): ScreenPoint | null {
    const a = this.model.anchors[index];
    if (!a) return null;
    return this.project(a.x, a.y + 0.4, a.z);
  }

  /**
   * Hit-test a tap (CSS px) against visible bloom-day blossoms.
   * Returns the blossom's ordinal index (its position in bloomDays).
   */
  pickAnchor(x: number, y: number, bloomCount: number, growth: number): number | null {
    const G = growthToG(growth);
    let bestIdx: number | null = null;
    let bestDist = 24; // generous touch target
    for (const { index } of this.visibleAnchors(bloomCount, G)) {
      const p = this.anchorScreen(index);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = index;
      }
    }
    return bestIdx;
  }

  /** Screen points of voxels newly revealed between two growth values. */
  revealedBetween(prevGrowth: number, growth: number): ScreenPoint[] {
    const g0 = growthToG(prevGrowth);
    const g1 = growthToG(growth);
    if (g1 <= g0) return [];
    const pts: ScreenPoint[] = [];
    for (const { v } of this.sorted) {
      if (v.threshold > g0 && v.threshold <= g1 && v.kind !== 'decor') {
        pts.push(this.project(v.x, v.y, v.z));
        if (pts.length >= 48) break;
      }
    }
    return pts;
  }

  /** Composite the pre-rendered layers onto the visible canvas. */
  composite(ctx: CanvasRenderingContext2D, timeMs: number, swayAmp: number, droop: number): void {
    ctx.clearRect(0, 0, this.width, this.height);
    const t = timeMs / 1000;
    const back = Math.sin(t * 0.55) * swayAmp;
    const front = Math.sin(t * 0.55 + 0.9) * swayAmp * 1.25;
    const draw = (layer: VoxelLayer, dx: number, dy: number): void => {
      const c = this.layers[layer];
      if (c) ctx.drawImage(c, dx, dy, this.width, this.height);
    };
    draw('static', 0, 0);
    draw('canopyBack', back, droop + Math.cos(t * 0.4) * swayAmp * 0.3);
    draw('canopyFront', front, droop + Math.sin(t * 0.47) * swayAmp * 0.35);
  }

  private layerCtx(layer: VoxelLayer): CanvasRenderingContext2D {
    let canvas = this.layers[layer];
    const w = Math.round(this.width * this.dpr);
    const h = Math.round(this.height * this.dpr);
    if (!canvas) {
      canvas = document.createElement('canvas');
      this.layers[layer] = canvas;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('bonsai: 2d context unavailable');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    return ctx;
  }

  private drawCube(
    ctx: CanvasRenderingContext2D,
    v: Voxel,
    baseColor: string,
    desat: number,
    occ: Set<string> | null,
    topOverride: string | null = null,
    jitter = 0,
  ): void {
    const size = v.size ?? 1;
    const full = size >= 0.95 && occ != null;

    // Hidden-face culling + per-face ambient occlusion from neighbours.
    const hideTop = full && occ.has(cellKey(v.x, v.y + 1, v.z));
    const hideRight = full && occ.has(cellKey(v.x + 1, v.y, v.z));
    const hideLeft = full && occ.has(cellKey(v.x, v.y, v.z + 1));
    if (hideTop && hideRight && hideLeft) return;

    let aoTop = 0;
    let aoRight = 0;
    let aoLeft = 0;
    if (full) {
      if (occ.has(cellKey(v.x + 1, v.y + 1, v.z))) { aoTop += 0.05; aoRight += 0.09; }
      if (occ.has(cellKey(v.x, v.y + 1, v.z + 1))) { aoTop += 0.05; aoLeft += 0.09; }
      if (occ.has(cellKey(v.x - 1, v.y + 1, v.z))) aoTop += 0.03;
      if (occ.has(cellKey(v.x, v.y + 1, v.z - 1))) aoTop += 0.03;
    }

    const s = this.scale * size;
    const vh = this.vh() * size;
    const p = this.project(v.x, v.y, v.z);
    // Center reduced-size cubes within their cell.
    const cy = p.y + (this.vh() - vh) * 0.5;
    const j = jitter;
    // Sun sits upper-right: lit right faces, shaded left, height catches light.
    const lift = Math.min(0.08, Math.max(0, v.y) * 0.004);

    if (!hideTop) {
      ctx.beginPath();
      ctx.moveTo(p.x, cy - s / 2);
      ctx.lineTo(p.x + s, cy);
      ctx.lineTo(p.x, cy + s / 2);
      ctx.lineTo(p.x - s, cy);
      ctx.closePath();
      ctx.fillStyle = topOverride ?? shade(baseColor, 0.16 + j + lift - aoTop, desat);
      ctx.fill();
    }

    if (!hideLeft) {
      ctx.beginPath();
      ctx.moveTo(p.x - s, cy);
      ctx.lineTo(p.x, cy + s / 2);
      ctx.lineTo(p.x, cy + s / 2 + vh);
      ctx.lineTo(p.x - s, cy + vh);
      ctx.closePath();
      ctx.fillStyle = shade(baseColor, -0.26 + j * 0.5 - aoLeft, desat);
      ctx.fill();
    }

    if (!hideRight) {
      ctx.beginPath();
      ctx.moveTo(p.x + s, cy);
      ctx.lineTo(p.x, cy + s / 2);
      ctx.lineTo(p.x, cy + s / 2 + vh);
      ctx.lineTo(p.x + s, cy + vh);
      ctx.closePath();
      ctx.fillStyle = shade(baseColor, -0.06 + j + lift - aoRight, desat);
      ctx.fill();
    }
  }
}

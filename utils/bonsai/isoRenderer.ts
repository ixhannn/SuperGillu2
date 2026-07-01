/**
 * Isometric voxel renderer for the bonsai scene.
 * The tree is painted onto three offscreen layers (static ground/trunk,
 * back canopy, front canopy) only when state changes; the per-frame cost is
 * just compositing those layers with a gentle sway — no per-voxel redraws,
 * no WebGL, safe under glass and cheap on mobile GPUs.
 */

import { hashString } from './rng';
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
}

export interface ScreenPoint {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

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

const voxelJitter = (v: Voxel): number => ((hashString(`${v.x},${v.y},${v.z}`) % 9) - 4) / 100;

export class VoxelSceneRenderer {
  private model: BonsaiModel;
  private layers: Record<VoxelLayer, HTMLCanvasElement | null> = {
    static: null,
    canopyBack: null,
    canopyFront: null,
  };
  private sorted: Voxel[] = [];
  private scale = 8;
  private origin: ScreenPoint = { x: 0, y: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;
  private optsKey = '';

  constructor(model: BonsaiModel) {
    this.model = model;
    this.sorted = [...model.voxels].sort(
      (a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y || a.x - b.x,
    );
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

    for (const v of this.sorted) {
      if (!this.isVisible(v, G, opts)) continue;
      const ctx = contexts[v.layer];
      const color = this.colorFor(v, bloomP, opts.golden);
      this.drawCube(ctx, v, color, desat);
    }

    this.drawBloomAnchors(contexts, opts, G, desat);
  }

  private isVisible(v: Voxel, G: number, opts: SceneOptions): boolean {
    if (v.kind === 'decor') {
      return v.decorId != null && opts.decorations.has(v.decorId);
    }
    if (v.kind === 'seed') return G < 0.04;
    if (v.kind === 'sprout') return G >= v.threshold && G < 0.1;
    return G >= v.threshold;
  }

  private colorFor(v: Voxel, bloomP: number, golden: boolean): string {
    if (v.kind === 'leaf' && v.bloomAt != null && bloomP >= v.bloomAt) {
      const h = hashString(`bloom:${v.x},${v.y},${v.z}`);
      if (golden && h % 41 === 0) return PALETTE.gold;
      return PALETTE.blossom[h % PALETTE.blossom.length];
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
    for (const { anchor } of this.visibleAnchors(opts.bloomCount, G)) {
      const cube: Voxel = {
        x: anchor.x, y: anchor.y, z: anchor.z,
        color: PALETTE.blossomBright,
        kind: 'blossom',
        layer: anchor.layer,
        threshold: 0,
        size: 0.92,
      };
      this.drawCube(contexts[anchor.layer], cube, PALETTE.blossomBright, desat);
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
    const p = this.project(a.x, a.y + 0.4, a.z);
    return p;
  }

  /** Screen points of voxels newly revealed between two growth values. */
  revealedBetween(prevGrowth: number, growth: number): ScreenPoint[] {
    const g0 = growthToG(prevGrowth);
    const g1 = growthToG(growth);
    if (g1 <= g0) return [];
    const pts: ScreenPoint[] = [];
    for (const v of this.sorted) {
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
  ): void {
    const size = v.size ?? 1;
    const s = this.scale * size;
    const vh = this.vh() * size;
    const p = this.project(v.x, v.y, v.z);
    // Center reduced-size cubes within their cell.
    const cy = p.y + (this.vh() - vh) * 0.5;
    const j = voxelJitter(v);
    const top = shade(baseColor, 0.14 + j, desat);
    const right = shade(baseColor, -0.1 + j, desat);
    const left = shade(baseColor, -0.22 + j, desat);

    ctx.beginPath();
    ctx.moveTo(p.x, cy - s / 2);
    ctx.lineTo(p.x + s, cy);
    ctx.lineTo(p.x, cy + s / 2);
    ctx.lineTo(p.x - s, cy);
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(p.x - s, cy);
    ctx.lineTo(p.x, cy + s / 2);
    ctx.lineTo(p.x, cy + s / 2 + vh);
    ctx.lineTo(p.x - s, cy + vh);
    ctx.closePath();
    ctx.fillStyle = left;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(p.x + s, cy);
    ctx.lineTo(p.x, cy + s / 2);
    ctx.lineTo(p.x, cy + s / 2 + vh);
    ctx.lineTo(p.x + s, cy + vh);
    ctx.closePath();
    ctx.fillStyle = right;
    ctx.fill();
  }
}

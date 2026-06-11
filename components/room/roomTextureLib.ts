/**
 * roomTextureLib — high-quality canvas painting toolkit for room props.
 *
 * Provides:
 *   • Anti-aliased rounded shapes (rect, circle, ellipse, pill, triangle)
 *   • Linear + radial gradient builders
 *   • Procedural texture overlays (wood, fabric, marble, leather, metal, glass)
 *   • Soft drop-shadows + ambient occlusion ground contact
 *   • Highlights and rim lights
 *
 * Coordinate system per painter: a 256x256 logical unit space (the painter
 * receives a Painter object that knows the actual pixel scale, so all
 * coordinates are device-independent).
 */

import * as THREE from 'three';

export type Ctx = CanvasRenderingContext2D;

export const PAINT_UNITS = 256;       // logical unit space per side
export const PAINT_SCALE = 3;          // physical pixels per logical unit (3 = 768x768)

export const TEX_PX = PAINT_UNITS * PAINT_SCALE;

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export const hexToRgb = (hex: string): [number, number, number] => {
  if (!HEX_RE.test(hex)) return [200, 180, 200];
  const raw = hex.replace('#', '');
  const safe = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;
  const num = parseInt(safe, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

export const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

export const shade = (hex: string, delta: number) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + delta, g + delta, b + delta);
};

export const mix = (a: string, b: string, t: number) => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
};

export const alpha = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Painter — a wrapper around a 2D context that maps logical units → pixels.
// ─────────────────────────────────────────────────────────────────────────────

export class Painter {
  constructor(
    public readonly ctx: Ctx,
    public readonly scale = PAINT_SCALE,
  ) {}

  get u() { return this.scale; }

  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }

  clear() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  fill(color: string) { this.ctx.fillStyle = color; }
  stroke(color: string, width: number) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width * this.u;
  }

  /** Anti-aliased filled rounded rectangle. */
  rect(x: number, y: number, w: number, h: number, r = 0, fill?: string) {
    const u = this.u;
    const ctx = this.ctx;
    const rr = clamp(r, 0, Math.min(w, h) / 2);
    if (fill) ctx.fillStyle = fill;
    ctx.beginPath();
    if (rr <= 0) {
      ctx.rect(x * u, y * u, w * u, h * u);
    } else {
      const x1 = x * u, y1 = y * u, w1 = w * u, h1 = h * u, r1 = rr * u;
      ctx.moveTo(x1 + r1, y1);
      ctx.arcTo(x1 + w1, y1, x1 + w1, y1 + h1, r1);
      ctx.arcTo(x1 + w1, y1 + h1, x1, y1 + h1, r1);
      ctx.arcTo(x1, y1 + h1, x1, y1, r1);
      ctx.arcTo(x1, y1, x1 + w1, y1, r1);
      ctx.closePath();
    }
    if (fill) ctx.fill();
  }

  /** Filled + stroked rounded rectangle in one call. */
  rectS(x: number, y: number, w: number, h: number, r: number, fill: string, stroke: string, sw = 0.5) {
    this.rect(x, y, w, h, r, fill);
    this.stroke(stroke, sw);
    this.ctx.stroke();
  }

  circle(cx: number, cy: number, r: number, fill?: string) {
    const u = this.u;
    const ctx = this.ctx;
    if (fill) ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx * u, cy * u, r * u, 0, Math.PI * 2);
    if (fill) ctx.fill();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill?: string, rotation = 0) {
    const u = this.u;
    const ctx = this.ctx;
    if (fill) ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx * u, cy * u, rx * u, ry * u, rotation, 0, Math.PI * 2);
    if (fill) ctx.fill();
  }

  triangle(p1: [number, number], p2: [number, number], p3: [number, number], fill?: string) {
    const u = this.u;
    const ctx = this.ctx;
    if (fill) ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(p1[0] * u, p1[1] * u);
    ctx.lineTo(p2[0] * u, p2[1] * u);
    ctx.lineTo(p3[0] * u, p3[1] * u);
    ctx.closePath();
    if (fill) ctx.fill();
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1) {
    const u = this.u;
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 * u, y1 * u);
    ctx.lineTo(x2 * u, y2 * u);
    ctx.stroke();
  }

  /** Linear gradient between two logical points. Stops: [offset, color]. */
  linearGrad(x1: number, y1: number, x2: number, y2: number, stops: Array<[number, string]>) {
    const u = this.u;
    const g = this.ctx.createLinearGradient(x1 * u, y1 * u, x2 * u, y2 * u);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  radialGrad(cx: number, cy: number, r0: number, r1: number, stops: Array<[number, string]>) {
    const u = this.u;
    const g = this.ctx.createRadialGradient(cx * u, cy * u, r0 * u, cx * u, cy * u, r1 * u);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  /** Soft drop-shadow: paints an elliptical contact shadow on the ground. */
  contactShadow(cx: number, cy: number, rx: number, ry: number, intensity = 0.32) {
    const u = this.u;
    const ctx = this.ctx;
    ctx.save();
    const g = ctx.createRadialGradient(cx * u, cy * u, 0, cx * u, cy * u, Math.max(rx, ry) * u);
    g.addColorStop(0, `rgba(28,18,40,${intensity})`);
    g.addColorStop(0.6, `rgba(28,18,40,${intensity * 0.45})`);
    g.addColorStop(1, 'rgba(28,18,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx * u, cy * u, rx * u, ry * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Glossy highlight band across the top of a shape. */
  topGloss(x: number, y: number, w: number, h: number, opacity = 0.45) {
    const g = this.linearGrad(0, y, 0, y + h, [
      [0, `rgba(255,255,255,${opacity})`],
      [0.55, 'rgba(255,255,255,0)'],
    ]);
    this.rect(x, y, w, h, 0, g as unknown as string);
  }

  /** Drops a soft halo (glow). */
  halo(cx: number, cy: number, r: number, color: string, intensity = 0.6) {
    const [rr, gg, bb] = hexToRgb(color);
    const grad = this.radialGrad(cx, cy, 0, r, [
      [0, `rgba(${rr},${gg},${bb},${intensity})`],
      [0.55, `rgba(${rr},${gg},${bb},${intensity * 0.45})`],
      [1, `rgba(${rr},${gg},${bb},0)`],
    ]);
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx * this.u, cy * this.u, r * this.u, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Generic clipping region for repeating overlays. */
  clipRect(x: number, y: number, w: number, h: number, r = 0) {
    const u = this.u;
    const ctx = this.ctx;
    const rr = clamp(r, 0, Math.min(w, h) / 2);
    ctx.beginPath();
    if (rr <= 0) {
      ctx.rect(x * u, y * u, w * u, h * u);
    } else {
      const x1 = x * u, y1 = y * u, w1 = w * u, h1 = h * u, r1 = rr * u;
      ctx.moveTo(x1 + r1, y1);
      ctx.arcTo(x1 + w1, y1, x1 + w1, y1 + h1, r1);
      ctx.arcTo(x1 + w1, y1 + h1, x1, y1 + h1, r1);
      ctx.arcTo(x1, y1 + h1, x1, y1, r1);
      ctx.arcTo(x1, y1, x1 + w1, y1, r1);
      ctx.closePath();
    }
    ctx.clip();
  }

  // ── Procedural textures ────────────────────────────────────────────────

  /** Soft wood grain — vertical streaks, two tones, occasional knot. */
  woodGrain(x: number, y: number, w: number, h: number, baseHex: string, vein = 0.42) {
    const u = this.u;
    const ctx = this.ctx;
    const dark = shade(baseHex, -22);
    const mid = shade(baseHex, -8);
    const light = shade(baseHex, 12);
    ctx.fillStyle = baseHex;
    ctx.fillRect(x * u, y * u, w * u, h * u);
    for (let i = 0; i < Math.max(6, w * 1.3); i++) {
      const gx = x + Math.random() * w;
      const gw = 0.5 + Math.random() * 1.4;
      ctx.fillStyle = (i & 1) === 0 ? mid : dark;
      ctx.globalAlpha = vein * (0.45 + Math.random() * 0.5);
      ctx.fillRect(gx * u, y * u, gw * u, h * u);
    }
    ctx.globalAlpha = vein * 0.25;
    ctx.fillStyle = light;
    for (let i = 0; i < 3; i++) {
      const gx = x + Math.random() * w;
      ctx.fillRect(gx * u, y * u, 0.6 * u, h * u);
    }
    ctx.globalAlpha = 1;
  }

  /** Cross-hatch / weave fabric texture. */
  weave(x: number, y: number, w: number, h: number, baseHex: string, density = 6) {
    const u = this.u;
    const ctx = this.ctx;
    ctx.fillStyle = baseHex;
    ctx.fillRect(x * u, y * u, w * u, h * u);
    ctx.strokeStyle = alpha(shade(baseHex, -25), 0.32);
    ctx.lineWidth = 0.35 * u;
    const step = Math.max(1.5, w / density);
    for (let xx = x; xx <= x + w; xx += step) {
      ctx.beginPath();
      ctx.moveTo(xx * u, y * u);
      ctx.lineTo(xx * u, (y + h) * u);
      ctx.stroke();
    }
    for (let yy = y; yy <= y + h; yy += step) {
      ctx.beginPath();
      ctx.moveTo(x * u, yy * u);
      ctx.lineTo((x + w) * u, yy * u);
      ctx.stroke();
    }
  }

  /** Soft marble veining. */
  marble(x: number, y: number, w: number, h: number, baseHex: string) {
    const u = this.u;
    const ctx = this.ctx;
    ctx.fillStyle = baseHex;
    ctx.fillRect(x * u, y * u, w * u, h * u);
    ctx.strokeStyle = alpha(shade(baseHex, -28), 0.55);
    ctx.lineWidth = 0.45 * u;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      const sx = x + Math.random() * w;
      const sy = y + Math.random() * h;
      ctx.moveTo(sx * u, sy * u);
      for (let j = 0; j < 6; j++) {
        const nx = sx + (Math.random() - 0.5) * w * 0.6;
        const ny = sy + (Math.random() - 0.5) * h * 0.6;
        ctx.quadraticCurveTo(
          (sx + nx) * 0.5 * u, (sy + ny) * 0.5 * u,
          nx * u, ny * u,
        );
      }
      ctx.stroke();
    }
  }

  /** Metallic brushed sheen — vertical streaks. */
  metallic(x: number, y: number, w: number, h: number, baseHex: string) {
    const u = this.u;
    const ctx = this.ctx;
    const grad = this.linearGrad(x, y, x + w, y + h, [
      [0, shade(baseHex, 30)],
      [0.5, baseHex],
      [1, shade(baseHex, -22)],
    ]);
    ctx.fillStyle = grad;
    ctx.fillRect(x * u, y * u, w * u, h * u);
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 18; i++) {
      const gx = x + Math.random() * w;
      ctx.fillStyle = i % 2 === 0 ? shade(baseHex, 35) : shade(baseHex, -16);
      ctx.fillRect(gx * u, y * u, 0.4 * u, h * u);
    }
    ctx.globalAlpha = 1;
  }

  /** Sparkle stars (n stars within the rect). */
  sparkles(x: number, y: number, w: number, h: number, count: number, color = '#fff') {
    const u = this.u;
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const cx = x + Math.random() * w;
      const cy = y + Math.random() * h;
      const s = 0.4 + Math.random() * 1.2;
      ctx.globalAlpha = 0.4 + Math.random() * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx * u, (cy - s) * u);
      ctx.lineTo((cx + s * 0.32) * u, cy * u);
      ctx.lineTo((cx + s) * u, cy * u);
      ctx.lineTo((cx + s * 0.4) * u, (cy + s * 0.3) * u);
      ctx.lineTo((cx + s * 0.55) * u, (cy + s) * u);
      ctx.lineTo(cx * u, (cy + s * 0.45) * u);
      ctx.lineTo((cx - s * 0.55) * u, (cy + s) * u);
      ctx.lineTo((cx - s * 0.4) * u, (cy + s * 0.3) * u);
      ctx.lineTo((cx - s) * u, cy * u);
      ctx.lineTo((cx - s * 0.32) * u, cy * u);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Texture finalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

export const createCanvas = (size = TEX_PX): { canvas: HTMLCanvasElement; ctx: Ctx } => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
};

export const canvasToTexture = (canvas: HTMLCanvasElement, opts: { smooth?: boolean; wrap?: boolean } = {}): THREE.CanvasTexture => {
  const tex = new THREE.CanvasTexture(canvas);
  const smooth = opts.smooth !== false;
  tex.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  tex.minFilter = smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  tex.generateMipmaps = smooth;
  tex.anisotropy = 4;
  if (opts.wrap) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
};

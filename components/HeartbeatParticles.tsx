/**
 * HeartbeatParticles — premium button-to-heart particle effect.
 *
 * triggerButtonDissolve(rect, onDone):
 *   1. IGNITE   — the button surface lifts off as fine dust on turbulent
 *                 updrafts, left → right (0–700 ms)
 *   2. VORTEX   — every grain spirals into the heart like a collapsing galaxy:
 *                 one shared rotation, silky motion-blur arms (700–1550 ms)
 *   3. HOLD     — stage lights dim; the 3-D heart beats "lub-dub" twice with
 *                 shockwave rings, ember ejecta on each lub, a specular sweep
 *                 and rim light (1550–3550 ms)
 *   4. RELEASE  — the heart draws a breath in, then lets go: grains arc home
 *                 and repaint the button while a volley of comets streaks off
 *                 the top of the screen — the heartbeat travelling to the
 *                 partner (3550–4370 ms)
 *   5. FADE     — particle layer crossfades into the real DOM button
 *
 * Rendering: DPR-aware canvas + hard-edged stardust grains (crisp fillRect
 * squares) coloured from a single rose→white palette LUT — no gradients,
 * no soft sprites, no per-frame allocation.
 *
 * triggerSend / triggerReceive: legacy scatter-send and violet receive effects.
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────── types ────────────────

interface Particle {
  active: boolean;
  mode: 'send' | 'receive' | 'dissolve';

  // 3-D local coords (heart target)
  lx: number; ly: number; lz: number;
  // legacy burst velocity (send/receive)
  vlx: number; vly: number; vlz: number;

  // heart centre on screen
  hcx: number; hcy: number;
  // home position on screen (button pixel)
  ox: number; oy: number;

  // live integrated position + velocity (peel/drift)
  px: number; py: number; pvx: number; pvy: number;
  // previous drawn position (motion-blur trails)
  prevX: number; prevY: number;

  // converge path: start, control point, end (projected heart position)
  scx: number; scy: number; cpx: number; cpy: number; endX: number; endY: number;
  // fly-back path: snapshot start + control point
  fsx: number; fsy: number; fcpx: number; fcpy: number;

  ph: number;                       // dissolve phase state machine
  cDelay: number; cDur: number;     // converge stagger / duration
  fDelay: number; fDur: number;     // fly-back stagger / duration

  elapsed: number;
  startAt: number;
  convergeEnd: number;              // legacy send timings
  holdEnd: number;
  lifetime: number;

  size: number;
  bright: number;
  r: number; g: number; b: number;  // legacy additive colour
  shadeA: number;                   // button shade (palette t)
  shadeB: number;                   // heart base shade
  shadeNow: number;                 // last lit shade (for fly-back blend)
  tX: number;                       // 0..1 horizontal position within button
  wobble: number;
}

const POOL = 12000;
const pool: Particle[] = Array.from({ length: POOL }, () => ({
  active: false, mode: 'send' as const,
  lx:0, ly:0, lz:0, vlx:0, vly:0, vlz:0,
  hcx:0, hcy:0, ox:0, oy:0,
  px:0, py:0, pvx:0, pvy:0, prevX:0, prevY:0,
  scx:0, scy:0, cpx:0, cpy:0, endX:0, endY:0,
  fsx:0, fsy:0, fcpx:0, fcpy:0,
  ph:0, cDelay:0, cDur:0, fDelay:0, fDur:0,
  elapsed:0, startAt:0, convergeEnd:0, holdEnd:0, lifetime:0,
  size:2, bright:1, r:244, g:63, b:94,
  shadeA:0.6, shadeB:0.45, shadeNow:0.45, tX:0, wobble:0,
}));

function acquire(): Particle | null {
  for (let i = 0; i < POOL; i++) if (!pool[i].active) return pool[i];
  return null;
}

// ──────────────────────────────────────────────── heart geometry ─────────────
//
// Exact set intersection of a rotated square and two tangent circles —
// the iOS-style emoji heart silhouette.

const HR   = 130;
const STEP = 2.6;
const FOV  = 520;
const S    = HR * 0.75;

function insideHeart(xc: number, yc: number): boolean {
  const x = xc;
  const y = yc + S * 0.89; // align bounding centre to origin

  if (Math.abs(x) + Math.abs(y - S) <= S) return true;          // diamond

  const dxL = x - (-S / 2), dyL = y - (S / 2);
  if (dxL * dxL + dyL * dyL <= (S * S) / 2) return true;        // left lobe

  const dxR = x - (S / 2), dyR = y - (S / 2);
  if (dxR * dxR + dyR * dyR <= (S * S) / 2) return true;        // right lobe

  return false;
}

interface GridPt { lx: number; ly: number; lz: number; bright: number; }
const GRID: GridPt[] = (() => {
  const pts: GridPt[] = [];
  const lo = -S * 1.5, hi = S * 1.5;

  for (let gx = lo; gx <= hi; gx += STEP) {
    for (let gy = lo; gy <= hi; gy += STEP) {
      if (!insideHeart(gx, gy)) continue;

      const r2   = gx * gx + gy * gy;
      const maxZ = HR * 0.12 * Math.sqrt(Math.max(0, 1 - r2 / (HR * HR * 1.5)));
      const lz   = -maxZ * rnd(0.95, 1.05);

      // brightness: highlight the lobe rims
      const dxL = gx - (-S / 2), dyL = (gy + S * 0.89) - (S / 2);
      const dxR = gx - (S / 2),  dyR = (gy + S * 0.89) - (S / 2);
      const rCircleSq = (S * S) / 2;
      const dEdge = Math.min(
        Math.abs(dxL * dxL + dyL * dyL - rCircleSq),
        Math.abs(dxR * dxR + dyR * dyR - rCircleSq),
      );
      const bright = 0.40 + 0.60 * Math.exp(-dEdge / (S * S * 0.15));

      // jitter off the lattice — sharp grains on a perfect grid read as an
      // LED matrix, not stardust
      pts.push({ lx: gx + rnd(-0.45, 0.45) * STEP, ly: gy + rnd(-0.45, 0.45) * STEP, lz, bright });
    }
  }
  return pts;
})();

function rnd(a: number, b: number) { return a + Math.random() * (b - a); }
function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function eio(t: number) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
function quartInOut(t: number) { return t < 0.5 ? 8*t*t*t*t : 1 - 8*Math.pow(1-t, 4); }
function easeOutCubic(t: number) { return 1 - Math.pow(1-t, 3); }

// ───────────────────────────────────── palette LUT + soft sprites ────────────
//
// All dissolve colours live on one 1-D ramp: deep wine → crimson → brand rose
// → blush → white. Particles carry a `shade` (0..1) instead of raw RGB, and
// draw via pre-rendered radial-gradient sprites — soft, luminous, allocation-
// free per frame.

const LUT_N = 64;
const LUT_STOPS: Array<[number, [number, number, number]]> = [
  [0.00, [ 88,   8,  34]],   // deep wine shadow
  [0.22, [159,  18,  57]],   // rose-800
  [0.40, [190,  18,  60]],   // rose-700
  [0.55, [225,  29,  72]],   // rose-600 (button right)
  [0.68, [244,  63,  94]],   // rose-500 (button left)
  [0.82, [251, 113, 133]],   // rose-400
  [0.92, [253, 164, 175]],   // rose-300
  [1.00, [255, 241, 242]],   // near-white highlight
];

const LUT: Array<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < LUT_N; i++) {
    const t = i / (LUT_N - 1);
    let k = 0;
    while (k < LUT_STOPS.length - 2 && LUT_STOPS[k + 1][0] < t) k++;
    const [t0, c0] = LUT_STOPS[k];
    const [t1, c1] = LUT_STOPS[k + 1];
    const f = clamp01((t - t0) / (t1 - t0 || 1));
    out.push([
      Math.round(c0[0] + (c1[0] - c0[0]) * f),
      Math.round(c0[1] + (c1[1] - c0[1]) * f),
      Math.round(c0[2] + (c1[2] - c0[2]) * f),
    ]);
  }
  return out;
})();

const SHADE_BTN_L = 0.68;  // rose-500
const SHADE_BTN_R = 0.55;  // rose-600

// Pre-built fillStyle strings — no gradients, no sprites: grains are drawn as
// hard-edged squares so they stay razor sharp at any size.
const COL_BASE: string[] = LUT.map(([r, g, b]) => `rgb(${r},${g},${b})`);
const COL_HOT:  string[] = LUT.map((_, i) => {
  const [r, g, b] = LUT[Math.min(LUT_N - 1, i + 5)];
  return `rgb(${r},${g},${b})`;
});

// Sharp stardust grain. `size` = grain edge in CSS px. Fine grains are a single
// crisp square; brighter motes (size > 1.15) get a hot core + faint halo square.
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shade: number, alpha: number) {
  if (alpha <= 0.01) return;
  const idx = Math.max(0, Math.min(LUT_N - 1, (shade * (LUT_N - 1)) | 0));
  const s = size < 0.5 ? 0.5 : size;
  if (s > 1.15) {
    const h = s * 2.2;
    ctx.globalAlpha = alpha * 0.14;
    ctx.fillStyle = COL_BASE[idx];
    ctx.fillRect(x - h / 2, y - h / 2, h, h);
    ctx.fillStyle = COL_HOT[idx];
  } else {
    ctx.fillStyle = COL_BASE[idx];
  }
  ctx.globalAlpha = alpha;
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
  ctx.globalAlpha = 1;
}

// 4-point star sprite for sparkles (champagne gold / blush white)
function makeStar(r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d')!;
  x.translate(32, 32);
  for (let i = 0; i < 4; i++) {
    x.rotate(Math.PI / 2 * (i ? 1 : 0));
    x.beginPath();
    x.moveTo(-1.7, 0); x.lineTo(0, -26); x.lineTo(1.7, 0);
    x.closePath();
    x.fillStyle = `rgba(${r},${g},${b},0.92)`;
    x.fill();
  }
  const glow = x.createRadialGradient(0, 0, 0, 0, 0, 11);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.5, `rgba(${r},${g},${b},0.85)`);
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = glow;
  x.beginPath(); x.arc(0, 0, 11, 0, Math.PI * 2); x.fill();
  return c;
}
let starGold: HTMLCanvasElement | null = null;
let starBlush: HTMLCanvasElement | null = null;

// ─────────────────────────────── dissolve timing constants ───────────────────

const D_PEEL     = 700;
const D_FLY_IN   = 850;
const D_HOLD     = 2000;
const D_FLY_BACK = 820;
const D_FADE     = 340;

const CONV_END   = D_PEEL + D_FLY_IN;          // 1550
const HOLD_END   = CONV_END + D_HOLD;          // 3550
const FADE_START = HOLD_END + D_FLY_BACK;      // 4370
const D_TOTAL    = FADE_START + D_FADE;        // 4710

// Fixed X-tilt for the held heart (slight forward lean)
const H_ANG_X = 0.12;
const H_COS_X = Math.cos(H_ANG_X), H_SIN_X = Math.sin(H_ANG_X);

// "Lub-dub" heartbeat: two double-pulses within the hold (t = 0..1),
// then a slow inhale — the heart compresses before releasing the send.
const BEATS = [
  { t: 0.12, a:  0.16, w: 0.13, lub: true  },
  { t: 0.26, a:  0.10, w: 0.11, lub: false },
  { t: 0.58, a:  0.16, w: 0.13, lub: true  },
  { t: 0.72, a:  0.10, w: 0.11, lub: false },
  { t: 0.90, a: -0.07, w: 0.16, lub: false },
] as const;

function pulseAt(hT: number): number {
  let p = 1;
  for (const b of BEATS) {
    const d = hT - b.t;
    if (d >= 0 && d < b.w) p += b.a * Math.sin((d / b.w) * Math.PI);
  }
  return p;
}

/**
 * Haptic pattern matching the heartbeat choreography: a soft tap on press,
 * then buzzes synced to each lub-dub of the held heart.
 * Beat times: 1550 + t·2000 → 1790 / 2070 / 2710 / 2990 ms.
 */
export const DISSOLVE_VIBRATION: number[] = [18, 1772, 42, 238, 28, 612, 42, 238, 28];

// ── Phong lighting (computed once) ───────────────────────────────────────────
const _lx = -0.28, _ly = -0.52, _lz = 1.00;
const _lm = Math.sqrt(_lx*_lx + _ly*_ly + _lz*_lz);
const LIT_X = _lx/_lm, LIT_Y = _ly/_lm, LIT_Z = _lz/_lm;
const _hx = LIT_X, _hy = LIT_Y, _hz = LIT_Z + 1;
const _hm = Math.sqrt(_hx*_hx + _hy*_hy + _hz*_hz);
const HAL_X = _hx/_hm, HAL_Y = _hy/_hm, HAL_Z = _hz/_hm;

// Warm rim light from lower-right-back
const _rx = 0.85, _ry = -0.20, _rz = -0.65;
const _rm = Math.sqrt(_rx*_rx + _ry*_ry + _rz*_rz);
const _rhx = _rx/_rm, _rhy = _ry/_rm, _rhz = _rz/_rm + 1;
const _rhm = Math.sqrt(_rhx*_rhx + _rhy*_rhy + _rhz*_rhz);
const RIM_HAL_X = _rhx/_rhm, RIM_HAL_Y = _rhy/_rhm, RIM_HAL_Z = _rhz/_rhm;

// ── Global dissolve + FX state ────────────────────────────────────────────────

let dissolveOnDone:  (() => void) | null = null;
let dissolveOnDoneAt = 0;
let dissolveFired    = false;
let dissolveHcx      = 0;
let dissolveHcy      = 0;
let dissolveStart    = 0;
let dissolveTimer    = 0;
let lastTickWall     = 0;

// Fires onDone exactly once — from the rAF loop in the normal case.
function fireDissolveDone() {
  if (dissolveFired || !dissolveOnDone) return;
  dissolveFired = true;
  window.clearTimeout(dissolveTimer);
  const cb = dissolveOnDone;
  dissolveOnDone = null;
  cb();
}

// Wall-clock fallback: if the page is hidden right after the tap, rAF never
// runs and onDone would never fire — the button would stay invisible and the
// heartbeat signal would never send. If the loop is merely slow, keep waiting;
// if it is fully stalled, complete the action and drop the leftover visual so
// a ghost animation doesn't replay when the page becomes visible again.
function dissolveFallback() {
  if (dissolveFired || !dissolveOnDone) return;
  if (performance.now() - lastTickWall < 250) {
    dissolveTimer = window.setTimeout(dissolveFallback, 700);
    return;
  }
  for (let i = 0; i < POOL; i++) if (pool[i].mode === 'dissolve') pool[i].active = false;
  ringsFx.length = 0;
  sparksFx.length = 0;
  fireDissolveDone();
}

interface RingFx  { start: number; amp: number; }
interface SparkFx { x: number; y: number; vx: number; vy: number; start: number; life: number; size: number; gold: boolean; phase: number; comet: boolean; }
const ringsFx: RingFx[] = [];
const sparksFx: SparkFx[] = [];
let beatSpawnMask = 0;

let DPR = 1;
let effectTs = 0;

// ────────────────────────────────────────────────────────── spawn ─────────────

export function spawnDissolve(rect: DOMRect, onDone: () => void) {
  if (typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.setTimeout(onDone, 400);
    return;
  }

  effectTs      = performance.now();
  dissolveStart = effectTs;
  dissolveOnDone   = onDone;
  dissolveOnDoneAt = effectTs + HOLD_END + D_FLY_BACK * 0.55;
  dissolveFired    = false;
  window.clearTimeout(dissolveTimer);
  dissolveTimer = window.setTimeout(dissolveFallback, HOLD_END + D_FLY_BACK * 0.55 + 400);
  beatSpawnMask    = 0;
  ringsFx.length   = 0;
  sparksFx.length  = 0;

  const SPACING = 1.2;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2 - 40;
  dissolveHcx = cx;
  dissolveHcy = cy;

  // Button grid clipped to the rounded-rect silhouette
  const btnPts: Array<{ bx: number; by: number }> = [];
  const rad = 24;
  const inRoundedRect = (x: number, y: number) => {
    const nx = x < rect.left + rad ? rect.left + rad : x > rect.right  - rad ? rect.right  - rad : x;
    const ny = y < rect.top  + rad ? rect.top  + rad : y > rect.bottom - rad ? rect.bottom - rad : y;
    if (nx === x && ny === y) return true;
    return (x - nx) ** 2 + (y - ny) ** 2 <= rad * rad;
  };
  for (let x = rect.left + SPACING / 2; x < rect.right; x += SPACING) {
    for (let y = rect.top + SPACING / 2; y < rect.bottom; y += SPACING) {
      if (inRoundedRect(x, y)) btnPts.push({ bx: x, by: y });
    }
  }

  // Assign heart targets — reuse cyclically if the button has more pixels
  const heartOrder = GRID.map((_, i) => i).sort(() => Math.random() - 0.5);
  const useCount = Math.min(btnPts.length, POOL - 200);
  const maxR = S * 1.55;

  for (let i = 0; i < useCount; i++) {
    const p = acquire(); if (!p) break;
    const { lx, ly, lz, bright } = GRID[heartOrder[i % heartOrder.length]];
    const { bx, by } = btnPts[i];
    const tX = clamp01((bx - rect.left) / rect.width);

    // converge target: heart position projected with the resting hold pose
    const ryT = ly * H_COS_X - lz * H_SIN_X;
    const rzT = ly * H_SIN_X + lz * H_COS_X;
    const psT = FOV / (FOV + rzT);

    // centre-out bloom order
    const radial = clamp01(Math.sqrt(lx * lx + (ly - S * 0.1) ** 2) / maxR);

    p.active = true;
    p.mode   = 'dissolve';
    p.ph     = 0;
    p.lx = lx; p.ly = ly; p.lz = lz;
    p.vlx = 0; p.vly = 0; p.vlz = 0;
    p.hcx = cx; p.hcy = cy;
    p.ox = bx; p.oy = by;
    p.px = bx; p.py = by;
    p.pvx = 0; p.pvy = 0;
    p.prevX = bx; p.prevY = by;
    p.endX = cx + lx * psT;
    p.endY = cy + ryT * psT;
    p.scx = 0; p.scy = 0; p.cpx = 0; p.cpy = 0;
    p.fsx = 0; p.fsy = 0; p.fcpx = 0; p.fcpy = 0;
    p.elapsed = 0;
    p.startAt = tX * 340 + rnd(0, 45);          // left → right peel
    p.cDelay  = radial * 240 + rnd(0, 50);      // centre-out heart bloom
    p.cDur    = 520 + rnd(0, 40);
    p.fDelay  = tX * 240;                       // button repaints left → right
    p.fDur    = 540 + rnd(0, 40);
    p.convergeEnd = 0; p.holdEnd = 0;
    p.lifetime = D_TOTAL;
    // fine stardust grains with a sprinkle of brighter motes
    p.size   = Math.random() < 0.10 ? rnd(1.25, 1.7) : rnd(0.55, 1.0);
    p.bright = bright;
    p.shadeA = SHADE_BTN_L + (SHADE_BTN_R - SHADE_BTN_L) * tX;
    p.shadeB = 0.42 + (bright - 0.4) * 0.28;
    p.shadeNow = p.shadeB;
    p.tX     = tX;
    p.wobble = rnd(0, Math.PI * 2);
  }
}

function spawnSend(cx: number, cy: number, W: number, H: number) {
  effectTs = performance.now();
  const order = GRID.map((_, i) => i).sort(() => Math.random() - 0.5);

  for (const idx of order) {
    const p = acquire(); if (!p) break;
    const { lx, ly, lz, bright } = GRID[idx];

    let ox: number, oy: number;
    const kind = Math.random();
    if (kind < 0.35) {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { ox = rnd(W*0.1, W*0.9); oy = rnd(-60, -20); }
      else if (edge === 1) { ox = rnd(W+20, W+60); oy = rnd(H*0.1, H*0.9); }
      else if (edge === 2) { ox = rnd(W*0.1, W*0.9); oy = rnd(H+20, H+60); }
      else { ox = -rnd(20, 60); oy = rnd(H*0.1, H*0.9); }
    } else if (kind < 0.65) {
      const a = Math.random()*Math.PI*2, d = rnd(220, 500);
      ox = cx + Math.cos(a)*d; oy = cy + Math.sin(a)*d;
    } else {
      ox = rnd(W*0.05, W*0.95); oy = rnd(H*0.05, H*0.95);
    }

    const mag3 = Math.sqrt(lx*lx + ly*ly + lz*lz) || 1;
    const spd  = rnd(0.06, 0.22) * (0.5 + bright*0.5);
    const delay = rnd(0, 550), convDur = rnd(550, 820), holdDur = rnd(400, 550), burstDur = rnd(520, 680);

    p.active = true; p.mode = 'send'; p.ph = 0;
    p.lx = lx; p.ly = ly; p.lz = lz;
    p.vlx = (lx/mag3)*spd; p.vly = (ly/mag3)*spd - 0.004; p.vlz = (lz/mag3)*spd*0.55;
    p.hcx = cx; p.hcy = cy; p.ox = ox; p.oy = oy;
    p.elapsed = 0; p.startAt = delay;
    p.convergeEnd = delay + convDur; p.holdEnd = delay + convDur + holdDur;
    p.lifetime = delay + convDur + holdDur + burstDur;
    p.size = rnd(1.8, 3.0); p.bright = bright;
    p.r = 244; p.g = 63; p.b = 94; p.wobble = 0;
  }
}

const RCV: Array<[number, number, number]> = [
  [175,75,255],[145,95,255],[205,145,255],[225,105,255],[255,125,215],
];
function spawnReceive(cx: number, cy: number, W: number, H: number) {
  for (let i = 0; i < 180; i++) {
    const p = acquire(); if (!p) break;
    const edge = Math.floor(Math.random()*4);
    let sx: number, sy: number;
    if (edge === 0) { sx = rnd(0, W); sy = -16; }
    else if (edge === 1) { sx = W+16; sy = rnd(0, H); }
    else if (edge === 2) { sx = rnd(0, W); sy = H+16; }
    else { sx = -16; sy = rnd(0, H); }
    const dx = cx-sx, dy = cy-sy, dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const lt = rnd(1100, 1800), spd = dist/lt*rnd(0.85, 1.15);
    const [r, g, b] = RCV[Math.floor(Math.random()*RCV.length)];
    p.active = true; p.mode = 'receive'; p.ph = 0;
    p.lx = 0; p.ly = 0; p.lz = 0; p.vlx = dx/dist*spd; p.vly = dy/dist*spd; p.vlz = 0;
    p.hcx = cx; p.hcy = cy; p.ox = sx; p.oy = sy;
    p.elapsed = 0; p.startAt = 0; p.convergeEnd = 0; p.holdEnd = 0; p.lifetime = lt;
    p.size = rnd(1.2, 2.8); p.bright = rnd(0.5, 1.0);
    p.r = r; p.g = g; p.b = b; p.wobble = Math.random()*Math.PI*2;
  }
}

// ──────────────────────────────────────────────────────────── draw ────────────

// Additive dot — legacy send/receive
function dot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, radius: number,
  r: number, g: number, b: number, alpha: number,
) {
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = `rgba(255,220,235,${(alpha*0.5).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, radius*0.32, 0, Math.PI*2); ctx.fill();
}

// Soft expanding shockwave ring for each heartbeat
function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, ring: RingFx, dEt: number) {
  const age = dEt - ring.start;
  const T = age / 650;
  if (T < 0 || T >= 1) return;
  const radius = HR * (0.95 + 1.05 * easeOutCubic(T));
  const w = 16 * (1 - T * 0.45);
  const alpha = Math.pow(1 - T, 2) * 0.22 * (ring.amp / 0.16);
  const g = ctx.createRadialGradient(x, y, Math.max(0, radius - w), x, y, radius + w);
  g.addColorStop(0,   'rgba(225,29,72,0)');
  g.addColorStop(0.5, `rgba(232,62,98,${alpha.toFixed(3)})`);
  g.addColorStop(1,   'rgba(225,29,72,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, radius + w, 0, Math.PI*2); ctx.fill();
}

// Motion-blurred soft dot: extra taps toward the previous position
function puffTrail(ctx: CanvasRenderingContext2D, p: Particle, x: number, y: number, size: number, shade: number, alpha: number) {
  const dx = x - p.prevX, dy = y - p.prevY;
  const d2 = dx*dx + dy*dy;
  if (d2 > 36) {
    puff(ctx, x - dx*0.5, y - dy*0.5, size*0.82, shade, alpha*0.38);
    if (d2 > 144) puff(ctx, x - dx*0.8, y - dy*0.8, size*0.62, shade - 0.05, alpha*0.16);
  }
  puff(ctx, x, y, size, shade, alpha);
  p.prevX = x; p.prevY = y;
}

// ─────────────────────────────────────────────────────── component ────────────

export interface HeartbeatParticlesHandle {
  triggerSend:           (cx: number, cy: number) => void;
  triggerReceive:        (cx: number, cy: number) => void;
  triggerButtonDissolve: (rect: DOMRect, onDone: () => void) => void;
}

export const HeartbeatParticles = forwardRef<HeartbeatParticlesHandle>(
  function HeartbeatParticles(_props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef    = useRef(0);
    const lastTs    = useRef(0);

    useImperativeHandle(ref, () => ({
      triggerSend(cx, cy) {
        spawnSend(cx, cy, window.innerWidth, window.innerHeight);
        go();
      },
      triggerReceive(cx, cy) {
        spawnReceive(cx, cy, window.innerWidth, window.innerHeight);
        go();
      },
      triggerButtonDissolve(rect, onDone) {
        spawnDissolve(rect, onDone); go();
      },
    }));

    function go() {
      if (rafRef.current) return;
      lastTs.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }

    function tick(ts: number) {
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = 0; return; }
      const ctx = canvas.getContext('2d');
      if (!ctx)   { rafRef.current = 0; return; }

      const dt = Math.min(ts - lastTs.current, 50);
      lastTs.current = ts;
      lastTickWall = performance.now();

      if (dissolveOnDone && !dissolveFired && ts >= dissolveOnDoneAt) {
        fireDissolveDone();
      }

      const W = window.innerWidth, H = window.innerHeight;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Global 3-D rotation for the legacy send hold
      const et   = ts - effectTs;
      const angY = et * 0.00090;
      const angX = Math.sin(et * 0.00055) * 0.24;
      const angZ = Math.sin(et * 0.00033) * 0.06;
      const cosY = Math.cos(angY), sinY = Math.sin(angY);
      const cosX = Math.cos(angX), sinX = Math.sin(angX);
      const cosZ = Math.cos(angZ), sinZ = Math.sin(angZ);

      let any = false;

      // ── Pass 1: update ALL + draw send/receive (additive) ────────────────
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < POOL; i++) {
        const p = pool[i];
        if (!p.active) continue;

        p.elapsed += dt;
        any = true;

        if (p.elapsed >= p.lifetime) { p.active = false; continue; }
        if (p.mode === 'dissolve') continue;  // drawn in pass 2
        if (p.elapsed < p.startAt) continue;

        const e = p.elapsed;

        if (p.mode === 'receive') {
          const w = ts*0.002 + p.wobble;
          p.vlx += Math.sin(w)*0.00006*dt;
          p.vly += Math.cos(w)*0.00006*dt;
          p.ox  += p.vlx*dt;
          p.oy  += p.vly*dt;
          const t = e/p.lifetime;
          const a = (t < 0.12 ? t/0.12 : t < 0.65 ? 1 : 1-(t-0.65)/0.35)*0.85;
          if (a > 0.01) dot(ctx, p.ox, p.oy, p.size, p.r, p.g, p.b, a);
          continue;
        }

        // legacy SEND
        let cur_lx = p.lx, cur_ly = p.ly, cur_lz = p.lz;
        let alpha = 0;

        if (e < p.convergeEnd) {
          const raw  = (e - p.startAt) / (p.convergeEnd - p.startAt);
          const ease = eio(clamp01(raw));
          const cX = p.ox + (p.lx + p.hcx - p.ox) * ease;
          const cY = p.oy + (p.ly + p.hcy - p.oy) * ease;
          alpha = Math.min(raw*6, 1) * (0.55 + p.bright*0.45);
          if (alpha > 0.01) dot(ctx, cX, cY, p.size, p.r, p.g, p.b, alpha);
          continue;
        } else if (e < p.holdEnd) {
          alpha = 0.45 + p.bright*0.55;
        } else {
          p.vly += 0.00013*dt;
          p.vlx *= 0.990; p.vly *= 0.990; p.vlz *= 0.990;
          p.lx += p.vlx*dt; p.ly += p.vly*dt; p.lz += p.vlz*dt;
          cur_lx = p.lx; cur_ly = p.ly; cur_lz = p.lz;
          const bt = (e - p.holdEnd) / (p.lifetime - p.holdEnd);
          alpha = (1-bt) * (0.45 + p.bright*0.55);
        }

        let rx = cur_lx*cosY + cur_lz*sinY;
        let ry = cur_ly;
        let rz = -cur_lx*sinY + cur_lz*cosY;
        const ry2 = ry*cosX - rz*sinX;
        rz = ry*sinX + rz*cosX; ry = ry2;
        const rx2 = rx*cosZ - ry*sinZ;
        ry = rx*sinZ + ry*cosZ; rx = rx2;

        const ps = FOV / (FOV + rz);
        const sx = rx*ps + p.hcx;
        const sy = ry*ps + p.hcy;
        const zF = clamp01((HR - rz) / (2*HR));
        const finalA = alpha * (0.30 + 0.70*zF);
        if (finalA > 0.01) dot(ctx, sx, sy, p.size*ps*(0.55+0.45*zF), p.r, p.g, p.b, finalA);
      }

      // ── Pass 2: dissolve — source-over soft sprites ───────────────────────
      ctx.globalCompositeOperation = 'source-over';

      const dEt = ts - dissolveStart;
      const holdActive = dissolveStart !== 0 && dEt > CONV_END - 250 && dEt < HOLD_END + 600;

      // resting → animated hold pose (sway / bob / ripple / pulse)
      const holdTRaw = (dEt - CONV_END) / D_HOLD;
      const hT       = clamp01(holdTRaw);
      const pulse    = pulseAt(hT);
      const sway     = holdTRaw > 0 ? 0.20 * Math.sin(holdTRaw * Math.PI * 1.2) : 0;
      const bobY     = holdTRaw > 0 ? Math.sin(holdTRaw * Math.PI * 2) * 3 : 0;
      const rippleAmp = 1.4 * clamp01(hT * 6) * clamp01((1 - hT) * 6);
      const cosS = Math.cos(sway), sinS = Math.sin(sway);

      // specular light sweep across the heart between the two lub-dubs
      const bandT = (hT - 0.34) / 0.28;
      const bandPos = -1.5 + 3.0 * bandT;
      const sweepOn = bandT >= 0 && bandT <= 1;

      const projectHold = (lx: number, ly: number, lz: number) => {
        const rippleX = Math.sin(ts*0.0020 + lx*0.025) * rippleAmp;
        const rippleY = Math.cos(ts*0.0017 + ly*0.025) * rippleAmp;
        const slx = lx * pulse + rippleX;
        const sly = ly * pulse + rippleY;
        const slz = lz * pulse;
        const rx1 = slx*cosS + slz*sinS;
        const rz1 = -slx*sinS + slz*cosS;
        const ryH = sly*H_COS_X - rz1*H_SIN_X;
        const rzH = sly*H_SIN_X + rz1*H_COS_X;
        const ps  = FOV / (FOV + rzH);
        return { sx: rx1*ps + dissolveHcx, sy: ryH*ps + dissolveHcy + bobY, rx1, ryH, rzH, ps };
      };

      // beat events → shockwave rings + sparkles
      if (dissolveStart !== 0 && dEt < HOLD_END + 100) {
        for (let bi = 0; bi < BEATS.length; bi++) {
          const b = BEATS[bi];
          const bAbs = CONV_END + b.t * D_HOLD;
          if (dEt >= bAbs && !(beatSpawnMask & (1 << bi))) {
            beatSpawnMask |= 1 << bi;
            if (b.a > 0) ringsFx.push({ start: bAbs, amp: b.a });
            if (b.lub) {
              // ember ejecta — each lub spits fine sparks off the surface
              for (let k = 0; k < 26; k++) {
                const gp = GRID[(Math.random() * GRID.length) | 0];
                const pr = projectHold(gp.lx, gp.ly, gp.lz);
                const dxs = pr.sx - dissolveHcx, dys = pr.sy - dissolveHcy;
                const dm = Math.sqrt(dxs*dxs + dys*dys) || 1;
                const spd = rnd(0.02, 0.07);
                sparksFx.push({
                  x: pr.sx + (dxs/dm)*rnd(2, 10), y: pr.sy + (dys/dm)*rnd(2, 10),
                  vx: (dxs/dm)*spd, vy: (dys/dm)*spd - 0.014,
                  start: dEt, life: rnd(480, 820), size: rnd(4, 9),
                  gold: Math.random() < 0.7, phase: rnd(0, Math.PI*2), comet: false,
                });
              }
            }
          }
        }
        // RELEASE — a volley of comets streaks off the top of the screen:
        // the heartbeat leaving to reach the partner
        if (dEt >= HOLD_END && !(beatSpawnMask & 64)) {
          beatSpawnMask |= 64;
          for (let k = 0; k < 46; k++) {
            const gp = GRID[(Math.random() * GRID.length) | 0];
            const pr = projectHold(gp.lx, gp.ly, gp.lz);
            sparksFx.push({
              x: pr.sx + rnd(-4, 4), y: pr.sy + rnd(-4, 4),
              vx: (dissolveHcx - pr.sx) * 0.0009 + rnd(-0.012, 0.012),
              vy: -rnd(0.30, 0.62),
              start: dEt, life: rnd(520, 880), size: rnd(0.8, 1.7),
              gold: false, phase: rnd(0, Math.PI*2), comet: true,
            });
          }
        }
      }

      // bloom glow behind the heart
      if (holdActive) {
        const bScale = 1 + (pulse - 1) * 1.8;
        const fadeIn  = clamp01((dEt - (CONV_END - 250)) / 350);
        const fadeOut = clamp01(1 - (dEt - HOLD_END) / 500);
        const gA = fadeIn * fadeOut;

        // stage dim — house lights down while the heart beats
        const vg = ctx.createRadialGradient(
          dissolveHcx, dissolveHcy + bobY, HR,
          dissolveHcx, dissolveHcy + bobY, Math.max(W, H) * 0.8,
        );
        vg.addColorStop(0, 'rgba(10,2,8,0)');
        vg.addColorStop(1, `rgba(10,2,8,${(gA*0.32).toFixed(3)})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        const gR = HR * 1.35 * bScale;
        const g1 = ctx.createRadialGradient(dissolveHcx, dissolveHcy + bobY, 0, dissolveHcx, dissolveHcy + bobY, gR);
        g1.addColorStop(0,    `rgba(225,29,72,${(gA*0.30).toFixed(3)})`);
        g1.addColorStop(0.45, `rgba(180,15,48,${(gA*0.13).toFixed(3)})`);
        g1.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = g1;
        ctx.beginPath(); ctx.arc(dissolveHcx, dissolveHcy + bobY, gR, 0, Math.PI*2); ctx.fill();

        const gR2 = HR * 0.55 * bScale;
        const g2  = ctx.createRadialGradient(dissolveHcx, dissolveHcy + bobY - HR*0.15, 0, dissolveHcx, dissolveHcy + bobY, gR2);
        g2.addColorStop(0,   `rgba(255,205,212,${(gA*0.35).toFixed(3)})`);
        g2.addColorStop(0.5, `rgba(255,90,118,${(gA*0.16).toFixed(3)})`);
        g2.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(dissolveHcx, dissolveHcy + bobY, gR2, 0, Math.PI*2); ctx.fill();

        for (const ring of ringsFx) drawRing(ctx, dissolveHcx, dissolveHcy + bobY, ring, dEt);
      }

      // dissolve particles
      for (let i = 0; i < POOL; i++) {
        const p = pool[i];
        if (!p.active || p.mode !== 'dissolve') continue;

        const e = p.elapsed;
        const convStart = D_PEEL + p.cDelay;
        const flyStart  = HOLD_END + p.fDelay;

        // grains are fine; oversize them while they sit as button pixels so
        // the intact surface reads solid, not gappy (button grid is 1.2px)
        const solidSize = Math.max(p.size, 1.35);

        if (e < p.startAt) {
          // intact button surface with a barely-there shimmer
          const tw = 1 + 0.06 * Math.sin(ts*0.01 + p.wobble*7);
          puff(ctx, p.ox, p.oy, solidSize * tw, p.shadeA, 1);
          p.prevX = p.ox; p.prevY = p.oy;

        } else if (e < convStart) {
          // IGNITE — dust lifts off on layered turbulent updrafts
          if (p.ph < 1) {
            p.ph = 1;
            p.pvx = (Math.random() - 0.5) * 0.03 + (p.tX - 0.5) * 0.02;
            p.pvy = -rnd(0.01, 0.045);
          }
          // two-octave swirl field sampled at the live position (cheap curl)
          const ax = (Math.sin(p.py*0.045 + ts*0.0012) + 0.6*Math.sin(p.py*0.012 - ts*0.0005)) * 0.00011
                   + (p.tX - 0.5) * 0.00005;
          const ay = -0.00017
                   - (Math.cos(p.px*0.05 + ts*0.0009) + 0.6*Math.cos(p.px*0.013 + ts*0.0006)) * 0.00007;
          const damp = Math.exp(-dt * 0.0008);
          p.pvx = (p.pvx + ax*dt) * damp;
          p.pvy = (p.pvy + ay*dt) * damp;
          p.px += p.pvx*dt;
          p.py += p.pvy*dt;
          puffTrail(ctx, p, p.px, p.py, p.size, p.shadeA, 1);

        } else if (e < CONV_END) {
          // VORTEX — grains spiral into the heart like a collapsing galaxy:
          // polar in-spiral with one shared rotation direction, so the trails
          // shear into silky arms
          if (p.ph < 2) {
            p.ph = 2;
            const dx0 = p.px - p.hcx, dy0 = p.py - p.hcy;
            p.scy = Math.sqrt(dx0*dx0 + dy0*dy0);                 // r0
            p.scx = Math.atan2(dy0, dx0);                         // a0
            const dxT = p.endX - p.hcx, dyT = p.endY - p.hcy;
            p.cpy = Math.sqrt(dxT*dxT + dyT*dyT);                 // r target
            let sweep = Math.atan2(dyT, dxT) - p.scx;
            sweep -= Math.round(sweep / (Math.PI*2)) * Math.PI*2; // wrap (-π..π]
            p.cpx = sweep - Math.PI*2 * (0.55 + Math.random()*0.35); // total sweep
          }
          const t  = clamp01((e - convStart) / p.cDur);
          const uA = easeOutCubic(t);                             // whip in, settle out
          const uR = eio(t);
          const ang = p.scx + p.cpx * uA;
          const rad = p.scy + (p.cpy - p.scy) * uR + Math.sin(p.wobble + t*11) * (1-t) * 5;
          const px = p.hcx + Math.cos(ang) * rad;
          const py = p.hcy + Math.sin(ang) * rad;
          // grains glint as they whip through the fastest part of the spiral
          const shade = p.shadeA + (p.shadeB - p.shadeA) * uA + 0.10 * Math.sin(t*Math.PI);
          puffTrail(ctx, p, px, py, p.size, clamp01(shade), 0.98);

        } else if (e < flyStart) {
          // HOLD — beating, swaying, lit 3-D heart
          const pr = projectHold(p.lx, p.ly, p.lz);

          const nmag = Math.sqrt(pr.rx1*pr.rx1 + pr.ryH*pr.ryH + pr.rzH*pr.rzH) || 1;
          const nx = -pr.rx1/nmag, ny = -pr.ryH/nmag, nz = -pr.rzH/nmag;

          const diffuse = Math.max(0, nx*LIT_X + ny*LIT_Y + nz*LIT_Z);
          const spec    = Math.pow(Math.max(0, nx*HAL_X + ny*HAL_Y + nz*HAL_Z), 48);
          const rim     = Math.pow(Math.max(0, nx*RIM_HAL_X + ny*RIM_HAL_Y + nz*RIM_HAL_Z), 24);

          let sweepBoost = 0;
          if (sweepOn) {
            const proj = (pr.rx1*0.94 + pr.ryH*0.34) / S;
            sweepBoost = Math.exp(-Math.pow((proj - bandPos) / 0.28, 2)) * 0.30;
          }

          const depth = clamp01((HR - pr.rzH) / (2*HR));
          let shade = p.shadeB + diffuse*0.07 + spec*0.50 + rim*0.15 + sweepBoost - (1 - depth)*0.12;
          shade = shade < 0.02 ? 0.02 : shade > 1 ? 1 : shade;
          p.shadeNow = shade;

          const sm = pr.ps * (0.78 + 0.22*depth) * (0.92 + pulse*0.08);
          // independent micro-flicker — the dust shimmers like embers
          const tw = 0.84 + 0.16 * Math.sin(ts*0.011 + p.wobble*17);
          puff(ctx, pr.sx, pr.sy, p.size * sm, shade, 0.96 * tw);
          p.prevX = pr.sx; p.prevY = pr.sy;

        } else if (e < flyStart + p.fDur) {
          // RETURN — graceful arc back to the button, left → right repaint
          if (p.ph < 3) {
            p.ph = 3;
            const pr = projectHold(p.lx, p.ly, p.lz);
            p.fsx = pr.sx; p.fsy = pr.sy;
            p.fcpx = (p.fsx + p.ox)/2 + (Math.random() - 0.5)*30;
            p.fcpy = Math.min(p.fsy, p.oy) - 60 - rnd(0, 40);
          }
          const t = clamp01((e - flyStart) / p.fDur);
          const u = quartInOut(t);
          const m = 1 - u;
          const px = m*m*p.fsx + 2*m*u*p.fcpx + u*u*p.ox;
          const py = m*m*p.fsy + 2*m*u*p.fcpy + u*u*p.oy;
          const shade = p.shadeNow + (p.shadeA - p.shadeNow) * u;
          puffTrail(ctx, p, px, py, p.size, shade, 0.98);

        } else if (e < FADE_START) {
          // landed — solid button pixel awaiting the crossfade
          puff(ctx, p.ox, p.oy, solidSize, p.shadeA, 1);
          p.prevX = p.ox; p.prevY = p.oy;

        } else {
          // FADE — crossfade into the real DOM button
          const t = clamp01((e - FADE_START) / D_FADE);
          puff(ctx, p.ox, p.oy, solidSize, p.shadeA, 1 - t);
        }
      }

      // sparkles on top
      if (sparksFx.length) {
        const gold = starGold  ?? (starGold  = makeStar(255, 196, 110));
        const blush = starBlush ?? (starBlush = makeStar(255, 214, 224));
        for (let i = sparksFx.length - 1; i >= 0; i--) {
          const s = sparksFx[i];
          const age = dEt - s.start;
          if (age >= s.life) { sparksFx.splice(i, 1); continue; }
          const lifeT = age / s.life;

          if (s.comet) {
            // comet — hot head with a tapering rose tail, racing upward
            s.x += s.vx*dt; s.y += s.vy*dt;
            const a = lifeT < 0.12 ? lifeT / 0.12 : 1 - (lifeT - 0.12) / 0.88;
            if (a < 0.02 || s.y < -30) { sparksFx.splice(i, 1); continue; }
            const tx = s.x - s.vx*95, ty = s.y - s.vy*95;
            const gr = ctx.createLinearGradient(s.x, s.y, tx, ty);
            gr.addColorStop(0,    `rgba(255,236,240,${(a*0.9).toFixed(3)})`);
            gr.addColorStop(0.35, `rgba(251,113,133,${(a*0.5).toFixed(3)})`);
            gr.addColorStop(1,    'rgba(225,29,72,0)');
            ctx.strokeStyle = gr;
            ctx.lineWidth = s.size;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.fillStyle = `rgba(255,255,255,${(a*0.95).toFixed(3)})`;
            ctx.fillRect(s.x - s.size*0.7, s.y - s.size*0.7, s.size*1.4, s.size*1.4);
            continue;
          }

          // ember — drifts out, falls under gravity, twinkles
          s.vy += 0.00018*dt;
          s.x += s.vx*dt; s.y += s.vy*dt;
          const a = Math.max(0, Math.sin(lifeT*Math.PI) * (0.55 + 0.45*Math.sin(age*0.04 + s.phase)));
          if (a < 0.02) continue;
          const sz = s.size * (1 - lifeT*0.3);
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.phase + age*0.0025);
          ctx.globalAlpha = a;
          ctx.drawImage(s.gold ? gold : blush, -sz/2, -sz/2, sz, sz);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      ctx.globalCompositeOperation = 'source-over';
      if (any) rafRef.current = requestAnimationFrame(tick);
      else     rafRef.current = 0;
    }

    useEffect(() => {
      const resize = () => {
        const c = canvasRef.current; if (!c) return;
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        c.width  = Math.round(window.innerWidth  * DPR);
        c.height = Math.round(window.innerHeight * DPR);
      };
      resize();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }, []);

    useEffect(() => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (let i = 0; i < POOL; i++) pool[i].active = false;
    }, []);

    return createPortal(
      <canvas
        ref={canvasRef}
        style={{ position:'fixed', inset:0, width:'100%', height:'100%', zIndex:9999, pointerEvents:'none' }}
        aria-hidden="true"
      />,
      document.body,
    );
  },
);

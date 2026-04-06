/**
 * HeartbeatParticles — Button-to-heart particle effect.
 *
 * triggerButtonDissolve(rect, onDone):
 *   1. EXPLODE  — button pixels scatter outward (0–380 ms)
 *   2. CONVERGE — stream toward 3-D heart positions (380–1130 ms)
 *   3. HOLD     — rotating glowing 3-D heart (1130–1780 ms)
 *   4. FLY BACK — particles return to button pixel positions (1780–2480 ms)
 *   5. FADE     — fade at button position; onDone fires at ~2000 ms (2480–2830 ms)
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
  // burst / scatter velocity
  vlx: number; vly: number; vlz: number;

  // heart centre on screen
  hcx: number; hcy: number;
  // spawn / home position on screen
  ox: number; oy: number;

  // dissolve fly-back: snapshot of projected 3-D pos at end of HOLD
  snapX: number; snapY: number; snapped: boolean;
  flyBackEnd: number;

  elapsed: number;
  startAt: number;
  convergeEnd: number;
  holdEnd: number;
  lifetime: number;

  size: number;
  bright: number;
  r: number; g: number; b: number;
  wobble: number;
}

const POOL = 2800;
const pool: Particle[] = Array.from({ length: POOL }, () => ({
  active: false, mode: 'send' as const,
  lx:0, ly:0, lz:0, vlx:0, vly:0, vlz:0,
  hcx:0, hcy:0, ox:0, oy:0,
  snapX:0, snapY:0, snapped:false, flyBackEnd:0,
  elapsed:0, startAt:0, convergeEnd:0, holdEnd:0, lifetime:0,
  size:2, bright:1, r:244, g:63, b:94, wobble:0,
}));

function acquire(): Particle | null {
  for (let i = 0; i < POOL; i++) if (!pool[i].active) return pool[i];
  return null;
}

// ──────────────────────────────────────────────── heart geometry ─────────────
//
// ❤️ emoji-accurate heart: two overlapping circles at top + tapered body.
//
//   Top-left  circle : centre (−CX, −CY),  radius R
//   Top-right circle : centre (+CX, −CY),  radius R
//   Body              : linear taper from y = −CY down to tip at y = TIP
//
// Coordinate convention: xc positive → right, yc positive → DOWN (screen).

const HR   = 130;
const STEP = 4.0;
const FOV  = 520;

// Heart shape parameters (all in px)
const H_CX  = HR * 0.50;   // horizontal offset of bump centres
const H_CY  = HR * 0.20;   // how far ABOVE origin the bump centres are (screen: y = −H_CY)
const H_R   = HR * 0.56;   // radius of each bump circle
const H_TIP = HR * 0.92;   // y-position of the bottom tip (below origin)
const H_R2  = H_R * H_R;

function insideHeart(xc: number, yc: number): boolean {
  // ── two circular bumps ──────────────────────────────────────────────────
  const lx = xc + H_CX, ly = yc + H_CY;   // left  bump: centre (−CX, −CY)
  const rx = xc - H_CX, ry = yc + H_CY;   // right bump: centre (+CX, −CY)
  if (lx*lx + ly*ly <= H_R2) return true;
  if (rx*rx + ry*ry <= H_R2) return true;

  // ── tapered body (below bump centres → tip) ──────────────────────────
  if (yc >= -H_CY && yc <= H_TIP) {
    // t = 0 at top of body (y = −H_CY), 1 at tip
    const t     = (yc + H_CY) / (H_TIP + H_CY);
    // cubic taper → smooth sides + sharp tip
    const halfW = (H_CX + H_R) * Math.pow(1 - t, 0.80);
    if (Math.abs(xc) <= halfW) return true;
  }

  return false;
}

interface GridPt { lx: number; ly: number; lz: number; bright: number; }
const GRID: GridPt[] = (() => {
  const pts: GridPt[] = [];
  // Tight bounding box for the new heart shape
  const loX = -(H_CX + H_R) * 1.04,  hiX = (H_CX + H_R) * 1.04;
  const loY = -(H_CY + H_R) * 1.04,  hiY = H_TIP * 1.04;

  for (let gx = loX; gx <= hiX; gx += STEP) {
    for (let gy = loY; gy <= hiY; gy += STEP) {
      if (!insideHeart(gx, gy)) continue;

      // Depth: thin card shape — max ~22px at centre, tapers to near-zero at edges
      const cx = gx, cy = gy - (H_TIP - H_CY) * 0.1;
      const r2  = cx*cx + cy*cy;
      const maxZ = HR * 0.17 * Math.sqrt(Math.max(0, 1 - r2 / (HR * HR * 1.1)));
      const lz   = maxZ * rnd(0.3, 1.0) * (Math.random() < 0.5 ? 1 : -1);

      // Brightness: brightest near the circle outlines (gives clear edge)
      const dLeft  = Math.sqrt((gx+H_CX)**2 + (gy+H_CY)**2);
      const dRight = Math.sqrt((gx-H_CX)**2 + (gy+H_CY)**2);
      const nearEdge = Math.min(Math.abs(dLeft - H_R), Math.abs(dRight - H_R));
      const edgeBright = Math.exp(-nearEdge / (H_R * 0.40));
      const bright = 0.40 + 0.60 * edgeBright;

      pts.push({ lx: gx, ly: gy, lz, bright });
    }
  }
  return pts;
})();

function rnd(a: number, b: number) { return a + Math.random() * (b - a); }
function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function eio(t: number) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
function easeOut(t: number) { return 1 - (1-t)*(1-t)*(1-t); }

// ─────────────────────────────── dissolve timing constants ───────────────────

const D_SCATTER  = 380;
const D_FLY_IN   = 750;
const D_HOLD     = 1350;  // 3 clear heartbeat pulses need room
const D_FLY_BACK = 700;
const D_FADE     = 350;
const D_TOTAL    = D_SCATTER + D_FLY_IN + D_HOLD + D_FLY_BACK + D_FADE; // 3530 ms

// Fixed X-tilt for dissolve HOLD (slight forward-facing lean)
const H_ANG_X = 0.12;
const H_COS_X = Math.cos(H_ANG_X), H_SIN_X = Math.sin(H_ANG_X);

// 3 heartbeat pulse positions (0–1 within hold duration)
const BEAT_POSITIONS = [0.08, 0.40, 0.72] as const;

// ── Phong lighting (computed once) ───────────────────────────────────────────
// Light from upper-left-front
const _lx = -0.28, _ly = -0.52, _lz = 1.00;
const _lm = Math.sqrt(_lx*_lx + _ly*_ly + _lz*_lz);
const LIT_X = _lx/_lm, LIT_Y = _ly/_lm, LIT_Z = _lz/_lm;
// Blinn-Phong half-vector H = normalize(L + V), V=(0,0,1)
const _hx = LIT_X, _hy = LIT_Y, _hz = LIT_Z + 1;
const _hm = Math.sqrt(_hx*_hx + _hy*_hy + _hz*_hz);
const HAL_X = _hx/_hm, HAL_Y = _hy/_hm, HAL_Z = _hz/_hm;

// Global dissolve state
let dissolveOnDone:  (() => void) | null = null;
let dissolveOnDoneAt = 0;
let dissolveFired    = false;
let dissolveHcx      = 0;   // heart centre x (for bloom glow)
let dissolveHcy      = 0;   // heart centre y
let dissolveStart    = 0;   // timestamp of spawn

// ────────────────────────────────────────────────────────── spawn ─────────────

let effectTs = 0;

// Button colour gradient: tulika-500 (#f43f5e) → tulika-600 (#e11d48)
function btnColor(bx: number, btnLeft: number, btnWidth: number): [number,number,number] {
  const t = (bx - btnLeft) / btnWidth;  // 0 (left) → 1 (right)
  const r = Math.round(244 - t*19);     // 244 → 225
  const g = Math.round(63  - t*34);     // 63  → 29
  const b = Math.round(94  - t*22);     // 94  → 72
  return [r, g, b];
}

export function spawnDissolve(rect: DOMRect, onDone: () => void) {
  effectTs      = performance.now();
  dissolveStart = effectTs;
  dissolveOnDone    = onDone;
  dissolveOnDoneAt  = effectTs + D_SCATTER + D_FLY_IN + D_HOLD + D_FLY_BACK * 0.75;
  dissolveFired     = false;

  const SPACING = 3;
  const cx = rect.left + rect.width  / 2;
  const cy = rect.top  + rect.height / 2;
  dissolveHcx = cx;
  dissolveHcy = cy;

  // Build button grid
  const btnPts: Array<{bx: number; by: number}> = [];
  for (let x = rect.left + SPACING/2; x < rect.right;  x += SPACING) {
    for (let y = rect.top  + SPACING/2; y < rect.bottom; y += SPACING) {
      btnPts.push({ bx: x, by: y });
    }
  }

  // Shuffle heart grid and assign one heart target per button particle
  const heartOrder = GRID.map((_,i) => i).sort(() => Math.random()-0.5);
  const useCount = Math.min(btnPts.length, heartOrder.length, POOL - 10);

  for (let i = 0; i < useCount; i++) {
    const p = acquire(); if (!p) break;
    const { lx, ly, lz, bright } = GRID[heartOrder[i]];
    const { bx, by } = btnPts[i];

    // Scatter direction: outward from button centre + randomness
    const angle = Math.atan2(by - cy, bx - cx) + rnd(-1.1, 1.1);
    const scatterDist = rnd(55, 210);

    p.active      = true;
    p.mode        = 'dissolve';
    p.lx = lx; p.ly = ly; p.lz = lz;
    // vlx/vly store the PEAK scatter offset (reached at end of D_SCATTER)
    p.vlx = Math.cos(angle) * scatterDist;
    p.vly = Math.sin(angle) * scatterDist;
    p.vlz = 0;
    p.hcx = cx; p.hcy = cy;
    p.ox  = bx; p.oy  = by;
    p.snapX = 0; p.snapY = 0; p.snapped = false;
    p.elapsed     = 0;
    p.startAt     = rnd(0, 90);   // tiny stagger so button disintegrates at once
    p.convergeEnd = D_SCATTER + D_FLY_IN;
    p.holdEnd     = D_SCATTER + D_FLY_IN + D_HOLD;
    p.flyBackEnd  = D_SCATTER + D_FLY_IN + D_HOLD + D_FLY_BACK;
    p.lifetime    = D_TOTAL;
    p.size        = rnd(1.8, 2.6);
    p.bright      = bright;
    const [r, g, b] = btnColor(bx, rect.left, rect.width);
    p.r = r; p.g = g; p.b = b;
    p.wobble = 0;
  }
}

function spawnSend(cx: number, cy: number, W: number, H: number) {
  effectTs = performance.now();
  const order = GRID.map((_,i) => i).sort(() => Math.random()-0.5);

  for (const idx of order) {
    const p = acquire(); if (!p) break;
    const { lx, ly, lz, bright } = GRID[idx];

    let ox: number, oy: number;
    const kind = Math.random();
    if (kind < 0.35) {
      const edge = Math.floor(Math.random()*4);
      if (edge===0) { ox=rnd(W*0.1,W*0.9); oy=rnd(-60,-20); }
      else if (edge===1) { ox=rnd(W+20,W+60); oy=rnd(H*0.1,H*0.9); }
      else if (edge===2) { ox=rnd(W*0.1,W*0.9); oy=rnd(H+20,H+60); }
      else { ox=-rnd(20,60); oy=rnd(H*0.1,H*0.9); }
    } else if (kind < 0.65) {
      const a=Math.random()*Math.PI*2, d=rnd(220,500);
      ox=cx+Math.cos(a)*d; oy=cy+Math.sin(a)*d;
    } else {
      ox=rnd(W*0.05,W*0.95); oy=rnd(H*0.05,H*0.95);
    }

    const mag3 = Math.sqrt(lx*lx+ly*ly+lz*lz)||1;
    const spd  = rnd(0.06,0.22)*(0.5+bright*0.5);
    const delay=rnd(0,550), convDur=rnd(550,820), holdDur=rnd(400,550), burstDur=rnd(520,680);

    p.active=true; p.mode='send';
    p.lx=lx; p.ly=ly; p.lz=lz;
    p.vlx=(lx/mag3)*spd; p.vly=(ly/mag3)*spd-0.004; p.vlz=(lz/mag3)*spd*0.55;
    p.hcx=cx; p.hcy=cy; p.ox=ox; p.oy=oy;
    p.snapX=0; p.snapY=0; p.snapped=false; p.flyBackEnd=0;
    p.elapsed=0; p.startAt=delay;
    p.convergeEnd=delay+convDur; p.holdEnd=delay+convDur+holdDur;
    p.lifetime=delay+convDur+holdDur+burstDur;
    p.size=rnd(1.8,3.0); p.bright=bright;
    p.r=244; p.g=63; p.b=94; p.wobble=0;
  }
}

const RCV: Array<[number,number,number]> = [
  [175,75,255],[145,95,255],[205,145,255],[225,105,255],[255,125,215],
];
function spawnReceive(cx: number, cy: number, W: number, H: number) {
  for (let i=0; i<180; i++) {
    const p=acquire(); if (!p) break;
    const edge=Math.floor(Math.random()*4);
    let sx:number,sy:number;
    if (edge===0){sx=rnd(0,W);sy=-16;}
    else if (edge===1){sx=W+16;sy=rnd(0,H);}
    else if (edge===2){sx=rnd(0,W);sy=H+16;}
    else {sx=-16;sy=rnd(0,H);}
    const dx=cx-sx,dy=cy-sy,dist=Math.sqrt(dx*dx+dy*dy)||1;
    const lt=rnd(1100,1800),spd=dist/lt*rnd(0.85,1.15);
    const [r,g,b]=RCV[Math.floor(Math.random()*RCV.length)];
    p.active=true; p.mode='receive';
    p.lx=0;p.ly=0;p.lz=0;p.vlx=dx/dist*spd;p.vly=dy/dist*spd;p.vlz=0;
    p.hcx=cx;p.hcy=cy;p.ox=sx;p.oy=sy;
    p.snapX=0;p.snapY=0;p.snapped=false;p.flyBackEnd=0;
    p.elapsed=0;p.startAt=0;p.convergeEnd=0;p.holdEnd=0;p.lifetime=lt;
    p.size=rnd(1.2,2.8);p.bright=rnd(0.5,1.0);
    p.r=r;p.g=g;p.b=b;p.wobble=Math.random()*Math.PI*2;
  }
}

// ──────────────────────────────────────────────────────────── draw ────────────

// Additive dot — for send/receive on dark-ish backgrounds
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

// Solid dot — for dissolve particles on light backgrounds (source-over)
function dotSolid(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, radius: number,
  r: number, g: number, b: number, alpha: number,
) {
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI*2); ctx.fill();
}

// Heart crimson: vibrant red — visible on both light and dark backgrounds
const HEART_R = 218, HEART_G = 30, HEART_B = 62;

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
        const c = canvasRef.current;
        spawnSend(cx, cy, c?.width ?? window.innerWidth, c?.height ?? window.innerHeight);
        go();
      },
      triggerReceive(cx, cy) {
        const c = canvasRef.current; if (!c) return;
        spawnReceive(cx, cy, c.width, c.height); go();
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

      // Fire dissolve-done callback when it's time
      if (dissolveOnDone && !dissolveFired && ts >= dissolveOnDoneAt) {
        dissolveFired = true;
        const cb = dissolveOnDone;
        dissolveOnDone = null;
        cb();
      }

      // Global 3-D rotation (affects HOLD phases of send + dissolve)
      const et   = ts - effectTs;
      const angY = et * 0.00090;
      const angX = Math.sin(et * 0.00055) * 0.24;
      const angZ = Math.sin(et * 0.00033) * 0.06;
      const cosY = Math.cos(angY), sinY = Math.sin(angY);
      const cosX = Math.cos(angX), sinX = Math.sin(angX);
      const cosZ = Math.cos(angZ), sinZ = Math.sin(angZ);

      function rotate3D(lx: number, ly: number, lz: number) {
        let rx = lx*cosY + lz*sinY;
        let ry = ly;
        let rz = -lx*sinY + lz*cosY;
        const ry2 = ry*cosX - rz*sinX;
        rz = ry*sinX + rz*cosX; ry = ry2;
        const rx2 = rx*cosZ - ry*sinZ;
        ry = rx*sinZ + ry*cosZ; rx = rx2;
        return { rx, ry, rz };
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let any = false;

      // ── Pass 1: update ALL + draw send/receive (additive 'lighter') ──────
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < POOL; i++) {
        const p = pool[i];
        if (!p.active) continue;

        p.elapsed += dt;
        any = true;

        if (p.elapsed >= p.lifetime) { p.active = false; continue; }

        // Dissolve particles drawn in pass 2
        if (p.mode === 'dissolve') continue;
        if (p.elapsed < p.startAt) continue;

        const e = p.elapsed;

        // ── RECEIVE ──────────────────────────────────────────────────────
        if (p.mode === 'receive') {
          const w = ts*0.002 + p.wobble;
          p.vlx += Math.sin(w)*0.00006*dt;
          p.vly += Math.cos(w)*0.00006*dt;
          p.ox  += p.vlx*dt;
          p.oy  += p.vly*dt;
          const t = e/p.lifetime;
          const a = (t<0.12 ? t/0.12 : t<0.65 ? 1 : 1-(t-0.65)/0.35)*0.85;
          if (a>0.01) dot(ctx, p.ox, p.oy, p.size, p.r, p.g, p.b, a);
          continue;
        }

        // ── SEND ─────────────────────────────────────────────────────────
        let cur_lx = p.lx, cur_ly = p.ly, cur_lz = p.lz;
        let alpha = 0;
        let useConvergePos = false;
        let convergeX = 0, convergeY = 0;

        if (e < p.convergeEnd) {
          const raw  = (e - p.startAt) / (p.convergeEnd - p.startAt);
          const ease = eio(clamp01(raw));
          const tx = p.lx + p.hcx;
          const ty = p.ly + p.hcy;
          convergeX = p.ox + (tx - p.ox) * ease;
          convergeY = p.oy + (ty - p.oy) * ease;
          useConvergePos = true;
          const fadeIn = Math.min(raw*6, 1);
          alpha = fadeIn * (0.55 + p.bright * 0.45);

        } else if (e < p.holdEnd) {
          alpha = 0.45 + p.bright * 0.55;

        } else {
          p.vly += 0.00013*dt;
          p.vlx *= 0.990; p.vly *= 0.990; p.vlz *= 0.990;
          p.lx  += p.vlx*dt; p.ly  += p.vly*dt; p.lz  += p.vlz*dt;
          cur_lx = p.lx; cur_ly = p.ly; cur_lz = p.lz;
          const bt = (e - p.holdEnd) / (p.lifetime - p.holdEnd);
          alpha = (1-bt) * (0.45 + p.bright * 0.55);
        }

        if (useConvergePos) {
          if (alpha>0.01) dot(ctx, convergeX, convergeY, p.size, p.r, p.g, p.b, alpha);
          continue;
        }

        const { rx, ry, rz } = rotate3D(cur_lx, cur_ly, cur_lz);
        const ps = FOV / (FOV + rz);
        const sx = rx * ps + p.hcx;
        const sy = ry * ps + p.hcy;
        const zF = clamp01((HR - rz) / (2 * HR));  // fixed: front(rz<0)→1(bright), back→0(dim)
        const depthDim = 0.30 + 0.70*zF;
        const sm = ps*(0.55+0.45*zF);
        const finalA = alpha * depthDim;
        if (finalA>0.01) dot(ctx, sx, sy, p.size*sm, p.r, p.g, p.b, finalA);
      }

      // ── Pass 2: dissolve — source-over ───────────────────────────────────
      ctx.globalCompositeOperation = 'source-over';

      // Bloom glow behind the heart (drawn once, under all particles)
      if (dissolveHcx !== 0 && dissolveStart !== 0) {
        const dEt       = ts - dissolveStart;
        const holdStart = D_SCATTER + D_FLY_IN;
        const holdEnd_g = holdStart + D_HOLD;
        if (dEt > holdStart - 250 && dEt < holdEnd_g + 500) {
          const holdTg  = clamp01((dEt - holdStart) / D_HOLD);
          let bScaleG = 1.0;
          for (const b of BEAT_POSITIONS) {
            const dt2 = holdTg - b;
            if (dt2 >= 0 && dt2 < 0.20) {
              const bt = dt2 / 0.20;
              bScaleG += 0.45 * Math.pow(1-bt,2) * Math.sin(bt*Math.PI);
            }
          }
          const fadeIn  = clamp01((dEt - (holdStart - 250)) / 350);
          const fadeOut = clamp01(1 - (dEt - holdEnd_g) / 500);
          const gA = fadeIn * fadeOut;

          // Outer soft bloom
          const gR = HR * 1.35 * bScaleG;
          const g1 = ctx.createRadialGradient(dissolveHcx, dissolveHcy, 0, dissolveHcx, dissolveHcy, gR);
          g1.addColorStop(0,    `rgba(210,15,45,${(gA*0.22).toFixed(3)})`);
          g1.addColorStop(0.45, `rgba(170,5,25, ${(gA*0.10).toFixed(3)})`);
          g1.addColorStop(1,    'rgba(0,0,0,0)');
          ctx.fillStyle = g1;
          ctx.beginPath(); ctx.arc(dissolveHcx, dissolveHcy, gR, 0, Math.PI*2); ctx.fill();

          // Tight inner hot-core glow
          const gR2 = HR * 0.55 * bScaleG;
          const g2  = ctx.createRadialGradient(dissolveHcx, dissolveHcy - HR*0.15, 0, dissolveHcx, dissolveHcy, gR2);
          g2.addColorStop(0,   `rgba(255,140,160,${(gA*0.18).toFixed(3)})`);
          g2.addColorStop(0.5, `rgba(220,30,60, ${(gA*0.08).toFixed(3)})`);
          g2.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(dissolveHcx, dissolveHcy, gR2, 0, Math.PI*2); ctx.fill();
        }
      }

      for (let i = 0; i < POOL; i++) {
        const p = pool[i];
        if (!p.active || p.mode !== 'dissolve') continue;
        if (p.elapsed < p.startAt) continue;

        const e        = p.elapsed;
        const convEnd  = p.convergeEnd;
        const holdEnd  = p.holdEnd;
        const flyBackEnd = p.flyBackEnd;

        if (e < D_SCATTER) {
          // Phase 1: button pixels scatter outward — keep button colour
          const t      = easeOut(clamp01(e / D_SCATTER));
          const px     = p.ox + p.vlx * t;
          const py     = p.oy + p.vly * t;
          const fadeIn = Math.min(e / 50, 1);
          dotSolid(ctx, px, py, p.size, p.r, p.g, p.b, fadeIn * 0.95);

        } else if (e < convEnd) {
          // Phase 2: fly to heart — colour transitions button → deep crimson
          const scx = p.ox + p.vlx;
          const scy = p.oy + p.vly;
          const t   = eio(clamp01((e - D_SCATTER) / D_FLY_IN));
          const hx  = p.lx + p.hcx;
          const hy  = p.ly + p.hcy;
          const px  = scx + (hx - scx) * t;
          const py  = scy + (hy - scy) * t;
          const cr  = Math.round(p.r + (HEART_R - p.r) * t);
          const cg  = Math.round(p.g + (HEART_G - p.g) * t);
          const cb  = Math.round(p.b + (HEART_B - p.b) * t);
          dotSolid(ctx, px, py, p.size, cr, cg, cb, 0.90);

        } else if (e < holdEnd) {
          // Phase 3: HOLD — full 3-D depth, Y-oscillation, beats 3×
          const holdT = clamp01((e - convEnd) / D_HOLD);

          // ── 3 heartbeat pulses ────────────────────────────────────────
          let beatScale = 1.0;
          for (const b of BEAT_POSITIONS) {
            const dt2 = holdT - b;
            if (dt2 >= 0 && dt2 < 0.20) {
              const bt = dt2 / 0.20;
              beatScale += 0.55 * Math.pow(1 - bt, 2) * Math.sin(bt * Math.PI);
            }
          }

          // ── Y-oscillation (0° → 22° → 0°) — gentle tilt shows depth without bloat ─
          const angY_h  = Math.sin(holdT * Math.PI) * 0.38;
          const cosY_h  = Math.cos(angY_h), sinY_h = Math.sin(angY_h);

          // Scale beat, keep FULL lz for real depth
          const slx = p.lx * beatScale;
          const sly = p.ly * beatScale;
          const slz = p.lz * beatScale;          // ← full depth, no attenuation

          // Y-rotation → X-tilt
          const rx0  =  slx * cosY_h + slz * sinY_h;
          const rz0  = -slx * sinY_h + slz * cosY_h;
          const ry_h =  sly * H_COS_X - rz0 * H_SIN_X;
          const rz_h =  sly * H_SIN_X + rz0 * H_COS_X;
          const rx_h =  rx0;

          const ps = FOV / (FOV + rz_h);
          const sx = rx_h * ps + p.hcx;
          const sy = ry_h * ps + p.hcy;

          // ── Phong lighting: position proxy as surface normal ─────────
          // In this projection rz_h < 0 = front (closer, ps>1). Outward normal
          // = negate position so front normals have nz>0 = face toward viewer.
          const nmag = Math.sqrt(rx_h*rx_h + ry_h*ry_h + rz_h*rz_h) || 1;
          const nx = -rx_h / nmag, ny = -ry_h / nmag, nz = -rz_h / nmag;

          // Lambertian diffuse
          const diffuse  = Math.max(0, nx*LIT_X + ny*LIT_Y + nz*LIT_Z);
          // Blinn-Phong specular (shininess 52)
          const specDot  = Math.max(0, nx*HAL_X + ny*HAL_Y + nz*HAL_Z);
          const specular = Math.pow(specDot, 52);
          // Combined lighting — ambient raised to 0.20 so shadow = deep crimson, never near-black
          const lit = clamp01(0.20 + 0.70 * diffuse + 1.00 * specular);

          // Color ramp: dark crimson shadow → base crimson → bright cherry highlight
          const SHAD_R = 148, SHAD_G = 12, SHAD_B = 32;   // dark red, clearly not black
          const LITE_R = 255, LITE_G = 70, LITE_B = 92;    // bright cherry
          let cr: number, cg: number, cb: number;
          if (lit < 0.5) {
            const t = lit * 2;
            cr = Math.round(SHAD_R + (HEART_R - SHAD_R) * t);
            cg = Math.round(SHAD_G + (HEART_G - SHAD_G) * t);
            cb = Math.round(SHAD_B + (HEART_B - SHAD_B) * t);
          } else {
            const t = (lit - 0.5) * 2;
            cr = Math.round(HEART_R + (LITE_R - HEART_R) * t);
            cg = Math.round(HEART_G + (LITE_G - HEART_G) * t);
            cb = Math.round(HEART_B + (LITE_B - HEART_B) * t);
          }
          // Specular bloom: near-white hot spot on shiny surfaces
          const bloom = clamp01(specular * 2.8);
          cr = Math.min(255, Math.round(cr + (255 - cr) * bloom * 0.58));
          cg = Math.min(255, Math.round(cg + (215 - cg) * bloom * 0.48));
          cb = Math.min(255, Math.round(cb + (220 - cb) * bloom * 0.48));

          // Rim light: warm pink glow at silhouette edges (nz≈0, front-facing only)
          const rim = Math.pow(1 - Math.abs(nz), 4) * clamp01(nz * 12 + 0.6);
          cr = Math.min(255, Math.round(cr + (255 - cr) * rim * 0.55));
          cg = Math.min(255, Math.round(cg + (80  - cg) * rim * 0.40));
          cb = Math.min(255, Math.round(cb + (100 - cb) * rim * 0.40));

          // Depth: 1=front(rz<0), 0=back(rz>0)
          const depth = clamp01((HR - rz_h) / (2 * HR));
          // Back particles fade out — removes dark smudges from behind the heart
          const alpha = (0.18 + 0.82 * depth) * (0.72 + p.bright * 0.28) * (0.90 + beatScale * 0.10);
          // Size: high floor so back particles still fill the grid (no hollow gaps)
          const szBoost = 1 + specular * 0.38;
          const sm = ps * (0.80 + 0.20 * depth) * (0.90 + beatScale * 0.10) * szBoost;
          dotSolid(ctx, sx, sy, p.size * sm, cr, cg, cb, alpha);

        } else if (e < flyBackEnd) {
          // Phase 4: fly back — crimson → button colour
          if (!p.snapped) {
            // At holdT=1, angY_h = sin(π)*0.82 = 0 → heart face-forward again.
            // Snap with X-tilt only, full lz.
            const ry_h = p.ly * H_COS_X - p.lz * H_SIN_X;
            const rz_h = p.ly * H_SIN_X + p.lz * H_COS_X;
            const ps   = FOV / (FOV + rz_h);
            p.snapX = p.lx * ps + p.hcx;
            p.snapY = ry_h * ps + p.hcy;
            p.snapped = true;
          }
          const t  = eio(clamp01((e - holdEnd) / D_FLY_BACK));
          const px = p.snapX + (p.ox - p.snapX) * t;
          const py = p.snapY + (p.oy - p.snapY) * t;
          const cr = Math.round(HEART_R + (p.r - HEART_R) * t);
          const cg = Math.round(HEART_G + (p.g - HEART_G) * t);
          const cb = Math.round(HEART_B + (p.b - HEART_B) * t);
          dotSolid(ctx, px, py, p.size, cr, cg, cb, 0.92);

        } else {
          // Phase 5: fade at button position
          const t     = clamp01((e - flyBackEnd) / D_FADE);
          const alpha = (1 - t) * 0.92;
          if (alpha > 0.01) dotSolid(ctx, p.ox, p.oy, p.size, p.r, p.g, p.b, alpha);
        }
      }

      ctx.globalCompositeOperation = 'source-over';
      if (any) rafRef.current = requestAnimationFrame(tick);
      else     rafRef.current = 0;
    }

    useEffect(() => {
      const resize = () => {
        const c = canvasRef.current; if (!c) return;
        c.width = window.innerWidth; c.height = window.innerHeight;
      };
      resize();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }, []);

    useEffect(() => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (let i=0; i<POOL; i++) pool[i].active = false;
    }, []);

    return createPortal(
      <canvas
        ref={canvasRef}
        style={{ position:'fixed', inset:0, zIndex:9999, pointerEvents:'none' }}
        aria-hidden="true"
      />,
      document.body,
    );
  },
);

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

const POOL = 12000;
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
const STEP = 1.5;
const FOV  = 520;

// Pure Geometric Heart Math
// Defined via an exact set intersection of a rotated square and two perfectly tangent circles.
// This generates the flawless iOS-style emoji heart format.
const S = HR * 0.75; 

function insideHeart(xc: number, yc: number): boolean {
  const x = xc;
  const y = yc + S * 0.89; // Align physical bounding center to origin

  // 1. Diamond test
  if (Math.abs(x) + Math.abs(y - S) <= S) return true;

  // 2. Left Circle test
  const dxL = x - (-S/2);
  const dyL = y - (S/2);
  if (dxL*dxL + dyL*dyL <= (S*S)/2) return true;

  // 3. Right Circle test
  const dxR = x - (S/2);
  const dyR = y - (S/2);
  if (dxR*dxR + dyR*dyR <= (S*S)/2) return true;

  return false;
}

interface GridPt { lx: number; ly: number; lz: number; bright: number; }
const GRID: GridPt[] = (() => {
  const pts: GridPt[] = [];
  
  const loX = -S * 1.5, hiX = S * 1.5;
  const loY = -S * 1.5, hiY = S * 1.5;

  for (let gx = loX; gx <= hiX; gx += STEP) {
    for (let gy = loY; gy <= hiY; gy += STEP) {
      if (!insideHeart(gx, gy)) continue;

      // Distance from center for bevel map
      const r2 = gx*gx + gy*gy;
      const maxZ = HR * 0.12 * Math.sqrt(Math.max(0, 1 - r2 / (HR * HR * 1.50)));
      const lz   = -maxZ * rnd(0.95, 1.05);

      // Brightness: highlight outer shape
      const dxL = gx - (-S/2);
      const dyL = (gy + S * 0.89) - (S/2);
      const dxR = gx - (S/2);
      const dyR = (gy + S * 0.89) - (S/2);
      
      const rCircleSq = (S*S)/2;
      const dL = Math.abs(dxL*dxL + dyL*dyL - rCircleSq);
      const dR = Math.abs(dxR*dxR + dyR*dyR - rCircleSq);
      
      const dEdge = Math.min(dL, dR);
      const edgeBright = Math.exp(-dEdge / (S * S * 0.15));
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

const D_SCATTER  = 800;
const D_FLY_IN   = 800;
const D_HOLD     = 2000;
const D_FLY_BACK = 900;
const D_FADE     = 350;
const D_TOTAL    = D_SCATTER + D_FLY_IN + D_HOLD + D_FLY_BACK + D_FADE;

// Fixed X-tilt for dissolve HOLD (slight forward-facing lean)
const H_ANG_X = 0.12;
const H_COS_X = Math.cos(H_ANG_X), H_SIN_X = Math.sin(H_ANG_X);

// 3 heartbeat pulse positions (0–1 within hold duration)
const BEAT_POSITIONS = [0.08, 0.40, 0.72] as const;

// ── Phong lighting (computed once) ───────────────────────────────────────────
// Main Key Light from upper-left-front
const _lx = -0.28, _ly = -0.52, _lz = 1.00;
const _lm = Math.sqrt(_lx*_lx + _ly*_ly + _lz*_lz);
const LIT_X = _lx/_lm, LIT_Y = _ly/_lm, LIT_Z = _lz/_lm;
const _hx = LIT_X, _hy = LIT_Y, _hz = LIT_Z + 1;
const _hm = Math.sqrt(_hx*_hx + _hy*_hy + _hz*_hz);
const HAL_X = _hx/_hm, HAL_Y = _hy/_hm, HAL_Z = _hz/_hm;

// Warm Rim Light from lower-right-back
const _rx = 0.85, _ry = -0.20, _rz = -0.65;
const _rm = Math.sqrt(_rx*_rx + _ry*_ry + _rz*_rz);
const RIM_LIT_X = _rx/_rm, RIM_LIT_Y = _ry/_rm, RIM_LIT_Z = _rz/_rm;
const _rhx = RIM_LIT_X, _rhy = RIM_LIT_Y, _rhz = RIM_LIT_Z + 1;
const _rhm = Math.sqrt(_rhx*_rhx + _rhy*_rhy + _rhz*_rhz);
const RIM_HAL_X = _rhx/_rhm, RIM_HAL_Y = _rhy/_rhm, RIM_HAL_Z = _rhz/_rhm;

// Global dissolve state
let dissolveOnDone:  (() => void) | null = null;
let dissolveOnDoneAt = 0;
let dissolveFired    = false;
let dissolveHcx      = 0;   // heart centre x (for bloom glow)
let dissolveHcy      = 0;   // heart centre y
let dissolveStart    = 0;   // timestamp of spawn

// ────────────────────────────────────────────────────────── spawn ─────────────

let effectTs = 0;

// Base colour gradient perfectly matching the DOM button: tulika-500 (#f43f5e) → tulika-600 (#e11d48)
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

  const SPACING = 1.5;
  const btnCx = rect.left + rect.width  / 2;
  const btnCy = rect.top  + rect.height / 2;
  
  // Center of screen for the heart animation target
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2 - 40; // slight upward offset feels better
  dissolveHcx = cx;
  dissolveHcy = cy;

  // Build button grid with rounded corners to precisely match button silhouette
  const btnPts: Array<{bx: number; by: number}> = [];
  const rad = 24; // ~1.5rem border radius
  
  const inRoundedRect = (x: number, y: number) => {
    if (x < rect.left + rad && y < rect.top + rad) {
        return (x - (rect.left + rad))**2 + (y - (rect.top + rad))**2 <= rad*rad;
    }
    if (x > rect.right - rad && y < rect.top + rad) {
        return (x - (rect.right - rad))**2 + (y - (rect.top + rad))**2 <= rad*rad;
    }
    if (x < rect.left + rad && y > rect.bottom - rad) {
        return (x - (rect.left + rad))**2 + (y - (rect.bottom - rad))**2 <= rad*rad;
    }
    if (x > rect.right - rad && y > rect.bottom - rad) {
        return (x - (rect.right - rad))**2 + (y - (rect.bottom - rad))**2 <= rad*rad;
    }
    return true;
  };

  for (let x = rect.left + SPACING/2; x < rect.right;  x += SPACING) {
    for (let y = rect.top  + SPACING/2; y < rect.bottom; y += SPACING) {
      if (inRoundedRect(x, y)) {
        btnPts.push({ bx: x, by: y });
      }
    }
  }

  // Shuffle heart grid and assign one heart target per button particle
  const heartOrder = GRID.map((_,i) => i).sort(() => Math.random()-0.5);
  const useCount = Math.min(btnPts.length, heartOrder.length, POOL - 50);

  for (let i = 0; i < useCount; i++) {
    const p = acquire(); if (!p) break;
    const { lx, ly, lz, bright } = GRID[heartOrder[i]];
    const { bx, by } = btnPts[i];

    // Soft fly away (like magical dust blowing off)
    const angle = rnd(0, Math.PI * 2);
    const scatterDist = rnd(30, 90);
    // Calculate 0 to 1 ratio from left to right of the button
    const tX = Math.max(0, Math.min(1, (bx - rect.left) / rect.width));

    p.active      = true;
    p.mode        = 'dissolve';
    p.lx = lx; p.ly = ly; p.lz = lz;
    p.vlx = Math.cos(angle) * scatterDist + rnd(10, 30); // slight rightward wind pushing them
    p.vly = Math.sin(angle) * scatterDist - rnd(10, 30); // slight gentle lift
    p.vlz = 0;
    p.hcx = cx; p.hcy = cy;
    p.ox  = bx; p.oy  = by;
    p.snapX = 0; p.snapY = 0; p.snapped = false;
    p.elapsed     = 0;
    // Left-to-right horizontal peel
    p.startAt     = tX * 350 + rnd(0, 45);
    p.convergeEnd = D_SCATTER + D_FLY_IN;
    p.holdEnd     = D_SCATTER + D_FLY_IN + D_HOLD;
    p.flyBackEnd  = D_SCATTER + D_FLY_IN + D_HOLD + D_FLY_BACK;
    p.lifetime    = D_TOTAL;
    p.size        = rnd(1.4, 2.0); // large enough to cover the button seamlessly before falling
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
function dotSolid(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number, g: number, b: number, a: number) {
  // Use slightly rounded inputs to prevent blurry sub-pixel antialiasing edge artifacts,
  // but keep sizes fractional for volumetric depth feeling.
  ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
  ctx.fillRect(Math.floor(x - s*0.5), Math.floor(y - s*0.5), s, Math.max(1, s));
}

// Heart crimson core: extreme contrast
const HEART_R = 220, HEART_G = 15, HEART_B = 40;

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
          g1.addColorStop(0,    `rgba(240,20,70,${(gA*0.35).toFixed(3)})`);
          g1.addColorStop(0.45, `rgba(180,10,40, ${(gA*0.15).toFixed(3)})`);
          g1.addColorStop(1,    'rgba(0,0,0,0)');
          ctx.fillStyle = g1;
          ctx.beginPath(); ctx.arc(dissolveHcx, dissolveHcy, gR, 0, Math.PI*2); ctx.fill();

          // Tight inner hot-core glow (fiery peach heart pulse)
          const gR2 = HR * 0.55 * bScaleG;
          const g2  = ctx.createRadialGradient(dissolveHcx, dissolveHcy - HR*0.15, 0, dissolveHcx, dissolveHcy, gR2);
          g2.addColorStop(0,   `rgba(255,180,190,${(gA*0.40).toFixed(3)})`);
          g2.addColorStop(0.5, `rgba(255,60,90, ${(gA*0.18).toFixed(3)})`);
          g2.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(dissolveHcx, dissolveHcy, gR2, 0, Math.PI*2); ctx.fill();
        }
      }

      for (let i = 0; i < POOL; i++) {
        const p = pool[i];
        if (!p.active || p.mode !== 'dissolve') continue;
        
        // Ensure the button looks completely solid before its particles start crumbling
        if (p.elapsed < p.startAt) {
          dotSolid(ctx, p.ox, p.oy, p.size, p.r, p.g, p.b, 1.0);
          continue;
        }

        const e        = p.elapsed;
        const convEnd  = p.convergeEnd;
        const holdEnd  = p.holdEnd;
        const flyBackEnd = p.flyBackEnd;

        if (e < D_SCATTER) {
          // Phase 1: Flying away sweeping freely
          const t      = easeOut(clamp01(e / D_SCATTER));
          const px     = p.ox + p.vlx * t;
          const py     = p.oy + p.vly * t; 
          dotSolid(ctx, px, py, p.size, p.r, p.g, p.b, 1.0);

        } else if (e < convEnd) {
          // Phase 2: Smooth wind-blown arc into the heart (Fits Thanos snap)
          const scx = p.ox + p.vlx;
          const scy = p.oy + p.vly;
          
          const dt = e - D_SCATTER;
          const t  = clamp01(dt / D_FLY_IN);
          const easeT = eio(t);
          
          const endX = p.hcx + p.lx;
          const endY = p.hcy + p.ly;
          
          // Control point continues their fly-away velocity before swooping into the heart
          const cpX = scx + p.vlx * 2.5; 
          const cpY = scy + p.vly * 2.5 - 40; // upward draft logic
          
          // Quadratic bezier interpolation for elegant dust-blown gathering
          let px = (1 - easeT) * (1 - easeT) * scx 
                 + 2 * (1 - easeT) * easeT * cpX 
                 + easeT * easeT * endX;
                 
          let py = (1 - easeT) * (1 - easeT) * scy 
                 + 2 * (1 - easeT) * easeT * cpY 
                 + easeT * easeT * endY;

          // Gentle ambient dust wobble
          p.wobble += 0.15;
          px += Math.sin(p.wobble) * (1 - easeT) * 2.0;

          const cr  = Math.round(p.r + (HEART_R - p.r) * easeT);
          const cg  = Math.round(p.g + (HEART_G - p.g) * easeT);
          const cb  = Math.round(p.b + (HEART_B - p.b) * easeT);

          // snap
          if (easeT > 0.98) {
            p.snapped = true;
            p.snapX = px; p.snapY = py;
          }

          dotSolid(ctx, px, py, p.size, cr, cg, cb, 0.98);

        } else if (e < holdEnd) {
          // Phase 3: HOLD — full 3-D depth, Y-oscillation, beats 3×
          const holdT = clamp01((e - convEnd) / D_HOLD);

          // ── 3 heartbeat pulses (Aggressive fluid pump) ───────────────────
          let pulse = 1.0;
          for (const b of BEAT_POSITIONS) {
            const dt2 = holdT - b;
            if (dt2 >= 0 && dt2 < 0.22) {
              const bt = dt2 / 0.22;
              // Hard pump outward, elastic recoil inward
              pulse += 0.85 * Math.pow(1 - bt, 3) * Math.sin(bt * Math.PI);
            }
          }

          // ── Organic Liquid Breathing ─────────
          // Inject subtle math to make the heart slowly boil and warp like liquid
          const ripple = Math.sin(effectTs / 500 + p.lx / 40) * 1.5; 
          const rippleY = Math.cos(effectTs / 600 + p.ly / 40) * 1.5;

          // X-tilt only (catching the zenith lighting)
          const slx = p.lx * pulse;
          const sly = p.ly * pulse;
          const slz = p.lz * pulse;

          const ry_h =  (sly + rippleY) * H_COS_X - slz * H_SIN_X;
          const rz_h =  (sly + rippleY) * H_SIN_X + slz * H_COS_X;
          const rx_h =  slx + ripple;

          const ps = FOV / (FOV + rz_h);
          const sx = rx_h * ps + p.hcx;
          const sy = ry_h * ps + p.hcy;

          // ── Studio Dual Lighting: glass surface normals ─────────
          const nmag = Math.sqrt(rx_h*rx_h + ry_h*ry_h + rz_h*rz_h) || 1;
          const nx = -rx_h / nmag, ny = -ry_h / nmag, nz = -rz_h / nmag;

          // Lambertian diffuse core
          const diffuse  = Math.max(0, nx*LIT_X + ny*LIT_Y + nz*LIT_Z);
          
          // Main Blinn-Phong Key Specular (Diamond white punch)
          const specDot  = Math.max(0, nx*HAL_X + ny*HAL_Y + nz*HAL_Z);
          const specular = Math.pow(specDot, 48); // Sharp glossy reflection
          
          // High-Ambient lighting to prevent pinks from collapsing into black/dark red
          const AMB = 0.85;
          const DIF = 0.25;
          const light = Math.min(1, AMB + diffuse * DIF);
          
          // Pure brand color ramp based on the particle's own spawn pigment
          // Specular highlights are mapped additively to create a glossy white sheen
          const specAdd = Math.min(255, specular * 100 * p.bright);
          const cr = Math.min(255, Math.round(p.r * light + specAdd));
          const cg = Math.min(255, Math.round(p.g * light + specAdd));
          const cb = Math.min(255, Math.round(p.b * light + specAdd));

          // Depth: 1=front(rz<0), 0=back(rz>0)
          const depth = clamp01((HR - rz_h) / (2 * HR));
          // Solid opacity so no dark alpha-blending artifacts appear against the app background.
          const alpha = clamp01(0.95 + pulse * 0.05);
          const szBoost = 1 + specular * 0.38;
          // Background particles shrink slightly for depth
          const sm = ps * (0.80 + 0.20 * depth) * (0.90 + pulse * 0.10) * szBoost;
          dotSolid(ctx, sx, sy, p.size * sm, cr, cg, cb, alpha);

        } else if (e < flyBackEnd) {
          // Phase 4: fly back dissolving into reverse fluid swirl
          if (!p.snapped) {
            const ry_h = p.ly * H_COS_X - p.lz * H_SIN_X;
            const rz_h = p.ly * H_SIN_X + p.lz * H_COS_X;
            const ps   = FOV / (FOV + rz_h);
            p.snapX = p.lx * ps + p.hcx;
            p.snapY = ry_h * ps + p.hcy;
            p.snapped = true;
          }
          const t  = eio(clamp01((e - holdEnd) / D_FLY_BACK));
          
          // Base linear trajectory interpolation
          const ix = p.snapX + (p.ox - p.snapX) * t;
          const iy = p.snapY + (p.oy - p.snapY) * t;

          const dx = ix - p.hcx;
          const dy = iy - p.hcy;

          // Distance-based particle shear unspools the rigid shape into flowing particles
          const btnDx = p.ox - p.hcx;
          const btnDy = p.oy - p.hcy;
          const btnDist = Math.sqrt(btnDx * btnDx + btnDy * btnDy);
          const shear = Math.sin(t * Math.PI) * (btnDist / 120) * 2.0;

          // 1 smooth reverse rotation + sheer scatter
          const swirlA = t * Math.PI * -2.0 - shear;

          const cosS = Math.cos(swirlA), sinS = Math.sin(swirlA);
          const px = p.hcx + (dx * cosS - dy * sinS);
          const py = p.hcy + (dx * sinS + dy * cosS);

          const cr = Math.round(HEART_R + (p.r - HEART_R) * t);
          const cg = Math.round(HEART_G + (p.g - HEART_G) * t);
          const cb = Math.round(HEART_B + (p.b - HEART_B) * t);
          dotSolid(ctx, px, py, p.size, cr, cg, cb, 0.98);

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

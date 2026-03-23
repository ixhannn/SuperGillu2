/**
 * ParticleHeart — 2D Canvas particle animation.
 *
 * Particles BURST explosively from the heartbeat button, stream into a
 * depth-sorted 3D heart with volumetric glow, breathe with lub-dub pulse,
 * then stream back to the button.
 *
 * Key design: white-hot particle centers, JS-controlled overlay fade,
 * button visible during burst, pre-computed fixed bezier curves,
 * depth-sorted rendering, central volumetric glow.
 */

import React, { useRef, useEffect } from 'react';

interface ParticleHeartProps {
  active: boolean;
  onComplete?: () => void;
  originRef?: React.RefObject<HTMLElement>;
}

// ── Heart curve ─────────────────────────────────────────────────
function heartXY(t: number): [number, number] {
  return [
    16 * Math.sin(t) ** 3,
    -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
  ];
}

function makeTargets(n: number, scale: number, cx: number, cy: number) {
  const S = 4000;
  const pts: [number, number][] = [];
  const lens = [0];
  for (let i = 0; i < S; i++) {
    pts.push(heartXY((i / S) * Math.PI * 2));
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      lens.push(lens[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
  }
  const total = lens[S - 1];
  const out: { x: number; y: number; d: number }[] = [];
  const shellN = Math.floor(n * 0.55);

  for (let i = 0; i < shellN; i++) {
    const tgt = (i / shellN) * total;
    let j = 1;
    for (; j < S; j++) if (lens[j] >= tgt) break;
    const [hx, hy] = pts[j];
    const nr = Math.sqrt(hx * hx + hy * hy) / 18;
    const mz = 1 - nr * 0.4;
    out.push({
      x: cx + hx * scale,
      y: cy + hy * scale,
      d: (Math.random() > 0.5 ? 1 : -1) * mz * (0.5 + Math.random() * 0.5),
    });
  }
  for (let i = shellN; i < n; i++) {
    const t = Math.random() * Math.PI * 2;
    const [hx, hy] = heartXY(t);
    const s = 0.08 + Math.random() * 0.88;
    const nr = Math.sqrt(hx * hx + hy * hy) / 18;
    out.push({
      x: cx + hx * s * scale,
      y: cy + hy * s * scale,
      d: (Math.random() * 2 - 1) * (1 - nr * 0.4) * 0.7,
    });
  }
  return out;
}

// ── Easing ──────────────────────────────────────────────────────
const eOQ = (t: number) => 1 - (1 - t) ** 4;
const eIOC = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const eOE = (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

// ── Palette ─────────────────────────────────────────────────────
const PAL = [
  [215, 48, 68], [225, 65, 82], [180, 35, 58],
  [240, 110, 120], [250, 210, 150], [255, 250, 240],
];

// ── Constants ───────────────────────────────────────────────────
const N = 200;
const DUR = 6500;
const HSCALE = 6.2;
const HYOFF = 150;
// Phases
const P1 = 0.10; // burst end
const P2 = 0.38; // stream end
const P3 = 0.72; // hold end
const P4 = 0.94; // return end

export const ParticleHeart: React.FC<ParticleHeartProps> = ({ active, onComplete, originRef }) => {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const cv = cvRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    if (!ctx) { onComplete?.(); return; }
    ctx.scale(dpr, dpr);
    const ov = ovRef.current;

    // ── Sprites: WHITE-HOT center + colored glow ────────────
    const mkSpr = (sz: number, r: number, g: number, b: number, core: boolean) => {
      const c = document.createElement('canvas');
      c.width = sz; c.height = sz;
      const x = c.getContext('2d')!;
      const h = sz / 2;
      const g2 = x.createRadialGradient(h, h, 0, h, h, h);
      if (core) {
        // White-hot center → color → transparent
        g2.addColorStop(0, 'rgba(255,255,255,1)');
        g2.addColorStop(0.18, `rgba(${Math.min(r + 55, 255)},${Math.min(g + 35, 255)},${Math.min(b + 35, 255)},0.92)`);
        g2.addColorStop(0.4, `rgba(${r},${g},${b},0.5)`);
        g2.addColorStop(0.7, `rgba(${r},${g},${b},0.08)`);
        g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
      } else {
        g2.addColorStop(0, `rgba(${r},${g},${b},0.28)`);
        g2.addColorStop(0.3, `rgba(${r},${g},${b},0.12)`);
        g2.addColorStop(0.7, `rgba(${r},${g},${b},0.02)`);
        g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
      }
      x.fillStyle = g2;
      x.fillRect(0, 0, sz, sz);
      return c;
    };
    const cores = PAL.map(c => mkSpr(24, c[0], c[1], c[2], true));
    const glows = PAL.map(c => mkSpr(48, c[0], c[1], c[2], false));

    // ── Button ──────────────────────────────────────────────
    const getBtn = () => {
      if (originRef?.current) {
        const r = originRef.current.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 };
      }
      return { cx: W / 2, cy: H - 120, hw: 70, hh: 28 };
    };

    // ── Per-particle init ───────────────────────────────────
    const bnx = new Float32Array(N), bny = new Float32Array(N);
    const bAng = new Float32Array(N), bDst = new Float32Array(N);
    const col = new Uint8Array(N), rad = new Float32Array(N);
    const arc = new Float32Array(N), rnd = new Float32Array(N);
    const shl = new Uint8Array(N);
    const retDel = new Float32Array(N); // pre-computed return delays

    const px = new Float32Array(N), py = new Float32Array(N);
    const p1x = new Float32Array(N), p1y = new Float32Array(N);
    const p2x = new Float32Array(N), p2y = new Float32Array(N);

    const beX = new Float32Array(N), beY = new Float32Array(N);
    const heX = new Float32Array(N), heY = new Float32Array(N);
    const scX = new Float32Array(N), scY = new Float32Array(N);
    const rcX = new Float32Array(N), rcY = new Float32Array(N);

    const shellN = Math.floor(N * 0.60);
    const b0 = getBtn();

    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.5);
      bnx[i] = Math.max(-1, Math.min(1, Math.cos(a) * r));
      bny[i] = Math.max(-1, Math.min(1, Math.sin(a) * r * 0.3));

      // Burst: upward-biased with wide spread
      bAng[i] = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      bDst[i] = 55 + Math.random() * 130;

      const rr = Math.random();
      col[i] = rr < 0.03 ? 5 : rr < 0.10 ? 4 : Math.floor(Math.random() * 4);
      rad[i] = 3.5 + Math.random() * 6; // 3.5-9.5px
      arc[i] = 0.3 + Math.random() * 0.7;
      rnd[i] = Math.random() * Math.PI * 2;
      shl[i] = i < shellN ? 1 : 0;

      // Pre-computed return delay (stable per particle)
      if (i < shellN) {
        const edge = Math.max(Math.abs(bnx[i]), Math.abs(bny[i]));
        retDel[i] = (1 - edge) * 0.42;
      } else {
        retDel[i] = (rnd[i] / (Math.PI * 2)) * 0.12;
      }

      px[i] = b0.cx + bnx[i] * b0.hw;
      py[i] = b0.cy + bny[i] * b0.hh;
      p1x[i] = px[i]; p1y[i] = py[i];
      p2x[i] = px[i]; p2y[i] = py[i];
    }

    // ── Targets ─────────────────────────────────────────────
    const btn = getBtn();
    const hCx = btn.cx, hCy = btn.cy - HYOFF;
    const tgts = makeTargets(N, HSCALE, hCx, hCy);

    // Sort
    const si = new Uint16Array(N);
    for (let i = 0; i < N; i++) si[i] = i;
    const dv = new Float32Array(N);

    // Bezier
    const bz = (a: number, c: number, b: number, t: number) => {
      const o = 1 - t;
      return o * o * a + 2 * o * t * c + t * t * b;
    };

    // Pre-compute volumetric glow gradient
    const holdGlow = ctx.createRadialGradient(hCx, hCy + 20, 0, hCx, hCy + 20, 140);
    holdGlow.addColorStop(0, 'rgba(225,55,75,0.26)');
    holdGlow.addColorStop(0.35, 'rgba(210,45,65,0.12)');
    holdGlow.addColorStop(0.7, 'rgba(190,35,55,0.03)');
    holdGlow.addColorStop(1, 'rgba(170,25,45,0)');

    // ── Constellation network lines (Auros-style) ─────────
    const CLOSE2 = 22 * 22;
    const FAR2 = 38 * 38;
    const drawNet = (mul: number) => {
      if (mul < 0.01) return;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(255,220,228,1)'; // warm white-pink

      // Close connections (brighter)
      ctx.beginPath();
      for (let a = 0; a < shellN; a++) {
        for (let b = a + 1; b < shellN; b++) {
          const dx = px[a] - px[b], dy = py[a] - py[b];
          const d2 = dx * dx + dy * dy;
          if (d2 < CLOSE2) { ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]); }
        }
      }
      ctx.globalAlpha = 0.22 * mul;
      ctx.stroke();

      // Far connections (dimmer, wider reach)
      ctx.beginPath();
      for (let a = 0; a < shellN; a++) {
        for (let b = a + 1; b < shellN; b++) {
          const dx = px[a] - px[b], dy = py[a] - py[b];
          const d2 = dx * dx + dy * dy;
          if (d2 >= CLOSE2 && d2 < FAR2) { ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]); }
        }
      }
      ctx.globalAlpha = 0.07 * mul;
      ctx.stroke();
    };

    // ── Animation ───────────────────────────────────────────
    const t0 = performance.now();
    let raf = 0;
    let burstCap = false, holdCap = false;

    const tick = () => {
      const el = performance.now() - t0;
      const p = Math.min(el / DUR, 1);
      const time = el * 0.001;

      // Trail shift
      for (let i = 0; i < N; i++) {
        p2x[i] = p1x[i]; p2y[i] = p1y[i];
        p1x[i] = px[i]; p1y[i] = py[i];
      }

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      const btn = getBtn();

      // ── Overlay opacity (JS-controlled, not CSS) ──────────
      let ovA = 0;
      if (p < P1) ovA = Math.min(p / P1 * 1.5, 1);
      else if (p < P3) ovA = 1;
      else if (p < P4) ovA = Math.max(1 - (p - P3) / (P4 - P3) * 1.3, 0);
      if (ov) ov.style.opacity = String(ovA);

      // ── BURST (0 → 10%) ──────────────────────────────────
      if (p < P1) {
        const rawT = p / P1;
        const e = eOQ(rawT);
        const alpha = Math.min(rawT * 8, 1);

        // Energy lines from button to particles (fades as they separate)
        if (e > 0.01 && e < 0.50) {
          const lineA = (1 - e / 0.50) * 0.32;
          for (let i = 0; i < N; i += 3) {
            const sx = btn.cx + bnx[i] * btn.hw;
            const sy = btn.cy + bny[i] * btn.hh;
            const c = PAL[col[i]];
            ctx.globalAlpha = lineA;
            ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(px[i], py[i]);
            ctx.stroke();
          }
        }

        // Particles burst from button surface
        for (let i = 0; i < N; i++) {
          const sx = btn.cx + bnx[i] * btn.hw;
          const sy = btn.cy + bny[i] * btn.hh;
          px[i] = sx + Math.cos(bAng[i]) * bDst[i] * e;
          py[i] = sy + Math.sin(bAng[i]) * bDst[i] * e;

          const grow = 0.25 + e * 0.75;
          const r = rad[i] * grow;
          // Glow halo
          const gr = r * 2.5;
          ctx.globalAlpha = alpha * 0.45;
          ctx.drawImage(glows[col[i]], px[i] - gr, py[i] - gr, gr * 2, gr * 2);
          // White-hot core
          ctx.globalAlpha = alpha;
          ctx.drawImage(cores[col[i]], px[i] - r, py[i] - r, r * 2, r * 2);
        }

      // ── STREAM (10% → 38%) ────────────────────────────────
      } else if (p < P2) {
        if (!burstCap) {
          for (let i = 0; i < N; i++) {
            beX[i] = px[i]; beY[i] = py[i];
            const t = tgts[i];
            scX[i] = (beX[i] + t.x) / 2 + Math.sin(rnd[i] * 3) * 40;
            scY[i] = Math.min(beY[i], t.y) - 35 - arc[i] * 75;
          }
          burstCap = true;
        }
        const rawT = (p - P1) / (P2 - P1);
        const e = eOE(rawT);

        // Trail pass (prev positions, drawn first = behind)
        for (let i = 0; i < N; i++) {
          let r = rad[i] * 0.3;
          ctx.globalAlpha = 0.07;
          ctx.drawImage(cores[col[i]], p2x[i] - r, p2y[i] - r, r * 2, r * 2);
          r = rad[i] * 0.5;
          ctx.globalAlpha = 0.15;
          ctx.drawImage(cores[col[i]], p1x[i] - r, p1y[i] - r, r * 2, r * 2);
        }

        // Current particles
        for (let i = 0; i < N; i++) {
          const t = tgts[i];
          px[i] = bz(beX[i], scX[i], t.x, e);
          py[i] = bz(beY[i], scY[i], t.y, e);

          // Decaying spiral
          const spR = (1 - e) * 18;
          const spA = rnd[i] + e * 9;
          px[i] += Math.cos(spA) * spR;
          py[i] += Math.sin(spA) * spR * 0.5;

          const ds = 1 + t.d * e * 0.3;
          const r = rad[i] * ds;
          // Glow
          const gr = r * 2.2;
          ctx.globalAlpha = 0.35;
          ctx.drawImage(glows[col[i]], px[i] - gr, py[i] - gr, gr * 2, gr * 2);
          // Core
          ctx.globalAlpha = 1;
          ctx.drawImage(cores[col[i]], px[i] - r, py[i] - r, r * 2, r * 2);
        }

        // Constellation lines crystallize as particles converge
        if (e > 0.65) drawNet((e - 0.65) / 0.35);

      // ── HOLD (38% → 72%) ─────────────────────────────────
      } else if (p < P3) {
        const hp = (p - P2) / (P3 - P2);

        // Lub-dub heartbeat (72bpm = 833ms/beat)
        const beatT = (hp * (P3 - P2) * DUR / 833) * Math.PI * 2;
        const breath = 1 + Math.sin(beatT) * 0.035 + Math.sin(beatT * 2) * 0.015;
        const rot = Math.sin(hp * Math.PI * 1.5) * 0.22;
        const cR = Math.cos(rot), sR = Math.sin(rot);

        // Volumetric central glow (pulses with heartbeat)
        ctx.globalAlpha = 0.7 + Math.sin(beatT) * 0.3;
        ctx.fillStyle = holdGlow;
        ctx.fillRect(hCx - 170, hCy - 145, 340, 330);

        // Depth sort
        for (let i = 0; i < N; i++)
          dv[i] = (tgts[i].x - hCx) * sR + tgts[i].d * 30 * cR;
        for (let i = 0; i < N; i++) si[i] = i;
        si.sort((a, b) => dv[a] - dv[b]);

        // Constellation network mesh
        drawNet(1);

        // Glow pass (every 2nd, back-to-front)
        for (let idx = 0; idx < N; idx += 2) {
          const i = si[idx];
          const t = tgts[i];
          const dx = (t.x - hCx) * breath, dy = (t.y - hCy) * breath;
          const rx = dx * cR - t.d * 30 * sR;
          const shX = Math.sin(time * 2.5 + rnd[i] * 9) * 1.5;
          const shY = Math.cos(time * 1.8 + rnd[i] * 7) * 1.2;
          const gx = hCx + rx + shX, gy = hCy + dy + shY;
          const dn = (dv[i] / 30 + 1) / 2;
          const gr = rad[i] * (0.55 + dn * 1.0) * 2.8;
          ctx.globalAlpha = 0.14 + dn * 0.08;
          ctx.drawImage(glows[col[i]], gx - gr, gy - gr, gr * 2, gr * 2);
        }

        // Core pass (back-to-front, depth-sorted)
        for (let idx = 0; idx < N; idx++) {
          const i = si[idx];
          const t = tgts[i];
          const dx = (t.x - hCx) * breath, dy = (t.y - hCy) * breath;
          const rx = dx * cR - t.d * 30 * sR;
          const dpR = dx * sR + t.d * 30 * cR;
          const shX = Math.sin(time * 2.5 + rnd[i] * 9) * 1.5;
          const shY = Math.cos(time * 1.8 + rnd[i] * 7) * 1.2;
          px[i] = hCx + rx + shX;
          py[i] = hCy + dy + shY;

          // 0=back 1=front
          const dn = (dpR / 30 + 1) / 2;
          const dSc = 0.50 + dn * 1.05; // 0.50→1.55
          const dAl = 0.28 + dn * 0.72; // 0.28→1.0

          // Sparkle flashes
          const spark = Math.max(0, Math.sin(time * 7 + rnd[i] * 16) - 0.90) * 4;

          const r = rad[i] * dSc;
          ctx.globalAlpha = Math.min(dAl + spark, 1);
          ctx.drawImage(cores[col[i]], px[i] - r, py[i] - r, r * 2, r * 2);
        }

      // ── RETURN (72% → 94%) ────────────────────────────────
      } else if (p < P4) {
        if (!holdCap) {
          for (let i = 0; i < N; i++) {
            heX[i] = px[i]; heY[i] = py[i];
            const tx = btn.cx + bnx[i] * btn.hw;
            const ty = btn.cy + bny[i] * btn.hh;
            rcX[i] = (heX[i] + tx) / 2 + Math.sin(rnd[i] * 2) * 28;
            rcY[i] = (heY[i] + ty) / 2 - arc[i] * 30;
          }
          holdCap = true;
        }
        const rawT = (p - P3) / (P4 - P3);

        // Trail pass
        for (let i = 0; i < N; i++) {
          let r = rad[i] * 0.28;
          ctx.globalAlpha = 0.05;
          ctx.drawImage(cores[col[i]], p2x[i] - r, p2y[i] - r, r * 2, r * 2);
          r = rad[i] * 0.45;
          ctx.globalAlpha = 0.10;
          ctx.drawImage(cores[col[i]], p1x[i] - r, p1y[i] - r, r * 2, r * 2);
        }

        for (let i = 0; i < N; i++) {
          const delay = retDel[i]; // pre-computed, stable
          const lt = Math.max((rawT - delay) / (1 - delay), 0);
          const e = eIOC(lt);

          const tx = btn.cx + bnx[i] * btn.hw;
          const ty = btn.cy + bny[i] * btn.hh;
          px[i] = bz(heX[i], rcX[i], tx, e);
          py[i] = bz(heY[i], rcY[i], ty, e);

          const r = rad[i] * (1 - e * 0.5);
          const a = 1 - e * 0.3;
          // Glow fades out as particles approach button
          if (e < 0.6) {
            const gr = r * 2;
            ctx.globalAlpha = a * 0.4 * (1 - e / 0.6);
            ctx.drawImage(glows[col[i]], px[i] - gr, py[i] - gr, gr * 2, gr * 2);
          }
          ctx.globalAlpha = a;
          ctx.drawImage(cores[col[i]], px[i] - r, py[i] - r, r * 2, r * 2);
        }

        // Network lines dissolve as particles separate
        if (rawT < 0.30) drawNet(1 - rawT / 0.30);

      // ── FADE (94% → 100%) ────────────────────────────────
      } else {
        const rawT = (p - P4) / (1 - P4);
        const fadeA = Math.max(1 - eOQ(rawT) * 1.5, 0);

        for (let i = 0; i < N; i++) {
          const tx = btn.cx + bnx[i] * btn.hw * (1 - rawT * 0.7);
          const ty = btn.cy + bny[i] * btn.hh * (1 - rawT * 0.7);
          px[i] += (tx - px[i]) * 0.25;
          py[i] += (ty - py[i]) * 0.25;
          const r = rad[i] * (1 - rawT * 0.6);
          ctx.globalAlpha = fadeA;
          ctx.drawImage(cores[col[i]], px[i] - r, py[i] - r, r * 2, r * 2);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        if (ov) ov.style.opacity = '0';
        onComplete?.();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (ov) ov.style.opacity = '0';
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div
        ref={ovRef}
        className="absolute inset-0"
        style={{
          backdropFilter: 'blur(10px) saturate(1.2) brightness(0.72)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.2) brightness(0.72)',
          backgroundColor: 'rgba(12, 4, 8, 0.22)',
          opacity: 0,
        }}
      />
      <canvas
        ref={cvRef}
        className="absolute inset-0"
        style={{ width: '100vw', height: '100vh' }}
      />
    </div>
  );
};

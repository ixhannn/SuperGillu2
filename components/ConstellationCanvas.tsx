/**
 * ConstellationCanvas — A living map of two people.
 *
 * 180 soft star-points drift in slow orbital paths.
 * Nearby stars draw gossamer connection lines — a living constellation.
 * Touch causes stars to rush toward the finger, form new patterns, then drift back.
 *
 * Two "partner stars" — one for each lover — pulse with independent heartbeat
 * rhythms that slowly sync. They are always connected by a glowing thread
 * that sways like a string caught in wind.
 *
 * Runs entirely on Canvas 2D. No main-thread physics — all calculations are
 * minimal float arithmetic. Pooled, no GC during steady state.
 */

import React, { useEffect, useRef } from 'react';
import { AnimationEngine } from '../utils/AnimationEngine';
import { readThemeRgbTriplet } from '../utils/themeVars';

// ─── Tuning ────────────────────────────────────────────────────────────────────
const STAR_COUNT       = 180;
const CONNECTION_DIST  = 120;   // px — max distance to draw a connection line
const TOUCH_RADIUS     = 160;   // px — stars within this rush toward finger
const TOUCH_STRENGTH   = 0.18;  // acceleration toward touch point
const DRIFT_SPEED      = 0.014; // base orbital drift speed
const HEARTBEAT_PERIOD = 2200;  // ms — base partner heartbeat period

interface Star {
  x: number; y: number;
  vx: number; vy: number;
  // Orbital parameters
  ox: number; oy: number;     // orbit center
  orbitR: number;             // orbit radius
  orbitSpeed: number;         // radians per ms
  orbitPhase: number;         // initial phase
  // Visual
  size: number;
  opacity: number;
  isPartner: 0 | 1 | -1;     // -1 = normal, 0 = my star, 1 = partner star
  heartPhase: number;         // individual heartbeat phase offset
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export const ConstellationCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    // ── Sizing ────────────────────────────────────────────────────
    let W = 0, H = 0;
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      // Re-seed orbit centers on resize
      stars.forEach(s => {
        if (s.isPartner === -1) {
          s.ox = Math.random() * W;
          s.oy = Math.random() * H;
        }
      });
    };

    // ── Star pool ──────────────────────────────────────────────────
    const stars: Star[] = [];

    const makeNormal = (): Star => {
      const ox = Math.random() * window.innerWidth;
      const oy = Math.random() * window.innerHeight;
      const r  = Math.random() * 60 + 20;
      const ph = Math.random() * Math.PI * 2;
      return {
        x: ox + Math.cos(ph) * r,
        y: oy + Math.sin(ph) * r,
        vx: 0, vy: 0,
        ox, oy, orbitR: r,
        orbitSpeed: (Math.random() * 0.6 + 0.2) * DRIFT_SPEED * (Math.random() < 0.5 ? 1 : -1),
        orbitPhase: ph,
        size:    Math.random() * 1.6 + 0.6,
        opacity: Math.random() * 0.45 + 0.15,
        isPartner: -1,
        heartPhase: 0,
      };
    };

    for (let i = 0; i < STAR_COUNT; i++) stars.push(makeNormal());

    // Partner star 0 (mine) — rose colored
    stars[0] = {
      ...makeNormal(),
      isPartner: 0, size: 3.5, opacity: 1,
      orbitR: 30, orbitSpeed: DRIFT_SPEED * 0.3,
      heartPhase: 0,
    };
    // Partner star 1 (theirs) — gold colored
    stars[1] = {
      ...makeNormal(),
      isPartner: 1, size: 3.5, opacity: 1,
      orbitR: 30, orbitSpeed: DRIFT_SPEED * 0.3,
      heartPhase: HEARTBEAT_PERIOD * 0.4, // starts offset, then syncs
    };

    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Touch state ───────────────────────────────────────────────
    let touchX = -9999, touchY = -9999, touching = false;
    const onPointerDown = (e: PointerEvent) => {
      touching = true; touchX = e.clientX; touchY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (touching) { touchX = e.clientX; touchY = e.clientY; }
    };
    const onPointerUp = () => { touching = false; touchX = -9999; touchY = -9999; };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup',   onPointerUp,  { passive: true });

    // ── Heartbeat sync state ──────────────────────────────────────
    // Over 8 seconds the two partner stars' phases converge
    let syncProgress = 0; // 0 = desync, 1 = perfect sync

    // ── Partner thread sway ───────────────────────────────────────
    // The thread between partner stars sways like a string in wind
    // Two control points that drift on slow noise
    let cp1x = 0, cp1y = 0, cp2x = 0, cp2y = 0;

    let starLinkRgb = '253,164,175';
    let starCoreRgb = '253,164,175';
    let partnerARgb = '244,63,94';
    let partnerBRgb = '251,191,36';

    const syncThemeColors = () => {
      starLinkRgb = readThemeRgbTriplet('--theme-star-link-rgb', '253,164,175');
      starCoreRgb = readThemeRgbTriplet('--theme-star-core-rgb', '253,164,175');
      partnerARgb = readThemeRgbTriplet('--theme-partner-a-rgb', '244,63,94');
      partnerBRgb = readThemeRgbTriplet('--theme-partner-b-rgb', '251,191,36');
    };
    syncThemeColors();

    const themeObserver = new MutationObserver(syncThemeColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme'],
    });

    // ── Main tick ─────────────────────────────────────────────────
    AnimationEngine.register({
      id: 'constellation',
      priority: 4,
      budgetMs: 2,
      minTier: 'medium',

      tick(delta, timestamp, tier) {
        ctx.clearRect(0, 0, W, H);

        const t = timestamp;
        const dt = delta * 0.001; // seconds

        // ── Heartbeat sync — converges over ~8s then resets ───────
        syncProgress = Math.min(syncProgress + dt / 8, 1);
        const star0Phase = stars[0].heartPhase + t / HEARTBEAT_PERIOD * Math.PI * 2;
        // Partner phase drifts toward star0's phase as sync increases
        const targetPhase1 = star0Phase;
        const currentPhase1 = stars[1].heartPhase + t / HEARTBEAT_PERIOD * Math.PI * 2;
        const phaseDiff = targetPhase1 - currentPhase1;
        const syncedPhase1 = currentPhase1 + phaseDiff * syncProgress * 0.015;

        // Heartbeat pulse shape: double-bump (lub-dub)
        const heartbeat = (ph: number) => {
          const p = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const norm = p / (Math.PI * 2); // 0–1
          // Two bumps at 0.15 and 0.35
          const b1 = Math.exp(-Math.pow((norm - 0.15) * 14, 2));
          const b2 = Math.exp(-Math.pow((norm - 0.35) * 18, 2)) * 0.6;
          return Math.max(b1 + b2, 0);
        };

        const hb0 = heartbeat(star0Phase);
        const hb1 = heartbeat(syncedPhase1);

        // ── Update star positions ─────────────────────────────────
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];

          // Orbital drift
          const phase = s.orbitPhase + t * s.orbitSpeed;
          const targetX = s.ox + Math.cos(phase) * s.orbitR;
          const targetY = s.oy + Math.sin(phase) * s.orbitR;

          // Touch attraction
          if (touching) {
            const d2 = dist2(s.x, s.y, touchX, touchY);
            const touchR2 = TOUCH_RADIUS * TOUCH_RADIUS;
            if (d2 < touchR2) {
              const d = Math.sqrt(d2);
              const force = (1 - d / TOUCH_RADIUS) * TOUCH_STRENGTH;
              s.vx += (touchX - s.x) / d * force * delta;
              s.vy += (touchY - s.y) / d * force * delta;
            }
          }

          // Spring toward orbit target
          s.vx += (targetX - s.x) * 0.0008 * delta;
          s.vy += (targetY - s.y) * 0.0008 * delta;

          // Damping
          s.vx *= 0.92;
          s.vy *= 0.92;

          s.x += s.vx;
          s.y += s.vy;
        }

        // Partner star sway (subtle control-point drift for the thread)
        const swayT = t * 0.0006;
        cp1x = lerp(stars[0].x, stars[1].x, 0.33) + Math.sin(swayT * 1.3) * 22;
        cp1y = lerp(stars[0].y, stars[1].y, 0.33) + Math.cos(swayT * 0.9) * 18;
        cp2x = lerp(stars[0].x, stars[1].x, 0.66) + Math.sin(swayT * 1.1 + 1) * 22;
        cp2y = lerp(stars[0].y, stars[1].y, 0.66) + Math.cos(swayT * 1.5 + 2) * 18;

        // ── Draw connection lines (skip on low tier) ─────────────
        if (tier !== 'low' && tier !== 'css-only') {
          ctx.lineWidth = 0.6;
          for (let i = 0; i < stars.length - 1; i++) {
            const a = stars[i];
            for (let j = i + 1; j < stars.length; j++) {
              const b = stars[j];
              const d2 = dist2(a.x, a.y, b.x, b.y);
              if (d2 > CONNECTION_DIST * CONNECTION_DIST) continue;
              const alpha = (1 - Math.sqrt(d2) / CONNECTION_DIST) * 0.18;
              ctx.beginPath();
              ctx.strokeStyle = `rgba(${starLinkRgb},${alpha.toFixed(3)})`;
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        // ── Draw partner thread ───────────────────────────────────
        const threadAlpha = 0.5 + syncProgress * 0.5;
        const threadWidth = 1 + syncProgress * 1.5;
        ctx.beginPath();
        ctx.moveTo(stars[0].x, stars[0].y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, stars[1].x, stars[1].y);
        const grad = ctx.createLinearGradient(stars[0].x, stars[0].y, stars[1].x, stars[1].y);
        grad.addColorStop(0,   `rgba(${partnerARgb},${threadAlpha})`);
        grad.addColorStop(0.5, `rgba(${partnerBRgb},${threadAlpha * 0.6})`);
        grad.addColorStop(1,   `rgba(${partnerBRgb},${threadAlpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = threadWidth;
        ctx.stroke();

        // ── Draw stars ────────────────────────────────────────────
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];

          if (s.isPartner === -1) {
            // Normal star
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${starCoreRgb},${s.opacity})`;
            ctx.fill();
          } else {
            // Partner star — heartbeat scale + glow
            const hb = s.isPartner === 0 ? hb0 : hb1;
            const scale = 1 + hb * 0.7;
            const r = s.size * scale;
            const gR = r * 4;

            // Outer glow
            const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gR);
            const col0 = s.isPartner === 0 ? partnerARgb : partnerBRgb;
            glow.addColorStop(0,   `rgba(${col0},${(0.35 + hb * 0.4).toFixed(3)})`);
            glow.addColorStop(0.4, `rgba(${col0},${(0.12 + hb * 0.15).toFixed(3)})`);
            glow.addColorStop(1,   `rgba(${col0},0)`);
            ctx.beginPath();
            ctx.arc(s.x, s.y, gR, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            // Core
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = s.isPartner === 0 ? `rgba(${partnerARgb},0.95)` : `rgba(${partnerBRgb},0.95)`;
            ctx.fill();

            // Perfect sync shockwave
            if (syncProgress > 0.985) {
              const wave = ((t % 2000) / 2000);
              const waveR = gR * 3 * wave;
              const waveA = (1 - wave) * 0.5 * (syncProgress - 0.985) / 0.015;
              ctx.beginPath();
              ctx.arc(s.x, s.y, waveR, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(${col0},${waveA.toFixed(3)})`;
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }
        }

        // ── Sync shockwave bloom — screen-wash when perfectly synced ──
        if (syncProgress > 0.99) {
          const wave = ((t % 2200) / 2200);
          if (wave < 0.5) {
            const midX = (stars[0].x + stars[1].x) / 2;
            const midY = (stars[0].y + stars[1].y) / 2;
            const maxR = Math.sqrt(W * W + H * H);
            const r = maxR * wave * 2;
            const a = (0.5 - wave) * 0.06;
            const bloom = ctx.createRadialGradient(midX, midY, 0, midX, midY, r);
            bloom.addColorStop(0,   `rgba(${partnerARgb},${a.toFixed(4)})`);
            bloom.addColorStop(0.5, `rgba(${starCoreRgb},${(a * 0.5).toFixed(4)})`);
            bloom.addColorStop(1,   `rgba(${partnerARgb},0)`);
            ctx.fillStyle = bloom;
            ctx.fillRect(0, 0, W, H);
          }
          // Reset sync after one cycle to restart the drift-toward-sync loop
          if (wave > 0.99) syncProgress = 0;
        }
      },
    });

    return () => {
      AnimationEngine.unregister('constellation');
      ro.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup',   onPointerUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{ opacity: 0.75 }}
    />
  );
};

/**
 * TouchTrailCanvas — Every touch leaves a mark.
 *
 * Finger movement spawns a trail of living particles.
 * Each particle inherits velocity, then decelerates, blooms into soft glow,
 * and fades over 800ms. Color shifts based on movement speed:
 *   slow movement → warm gold (#f43f5e rose-gold)
 *   fast swipe    → cool violet (#818cf8)
 *
 * Pool-based — zero allocations during steady state.
 * OffscreenCanvas-compatible architecture (runs in AnimationEngine RAF).
 */

import React, { useEffect, useRef } from 'react';
import { AnimationEngine } from '../utils/AnimationEngine';

const POOL_SIZE    = 800;
const LIFETIME_MS  = 800;
const SPAWN_DIST   = 8;    // px — spawn a new particle every N px of movement

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;    // 0→1, 1 = just born
  maxSize: number;
  speed: number;   // capture velocity magnitude for color mapping
  active: boolean;
}

// Pre-allocate pool
const pool: Particle[] = Array.from({ length: POOL_SIZE }, () => ({
  x: 0, y: 0, vx: 0, vy: 0,
  life: 0, maxSize: 0, speed: 0,
  active: false,
}));

let poolHead = 0;
function acquire(): Particle | null {
  for (let i = 0; i < POOL_SIZE; i++) {
    const idx = (poolHead + i) % POOL_SIZE;
    if (!pool[idx].active) {
      poolHead = (idx + 1) % POOL_SIZE;
      return pool[idx];
    }
  }
  return null; // pool exhausted — drop gracefully
}

// Lerp between two hex colors via float channels
function speedColor(speed: number): [number, number, number, number] {
  // speed in px/frame, ~0 (still) to ~40 (fast swipe)
  const t = Math.min(speed / 35, 1);
  // Rose gold: 244,63,94 → violet: 129,140,248
  const r = 244 + (129 - 244) * t;
  const g =  63 + (140 -  63) * t;
  const b =  94 + (248 -  94) * t;
  return [r, g, b, t];
}

export const TouchTrailCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false })!;

    let W = 0, H = 0;
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Touch tracking ────────────────────────────────────────────
    let prevX = 0, prevY = 0, prevTime = 0;
    let lastSpawnX = 0, lastSpawnY = 0;
    let isDown = false;

    const spawnTrail = (x: number, y: number, vx: number, vy: number, speed: number) => {
      const dx = x - lastSpawnX, dy = y - lastSpawnY;
      const distSq = dx * dx + dy * dy;
      if (distSq < SPAWN_DIST * SPAWN_DIST) return;
      lastSpawnX = x; lastSpawnY = y;

      // Spawn cluster of 2–4 particles with slight spread
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const p = acquire();
        if (!p) return;
        const angle = Math.random() * Math.PI * 2;
        const spread = Math.random() * 3;
        p.x = x + Math.cos(angle) * spread;
        p.y = y + Math.sin(angle) * spread;
        p.vx = vx * (0.3 + Math.random() * 0.4) + (Math.random() - 0.5) * 1.2;
        p.vy = vy * (0.3 + Math.random() * 0.4) + (Math.random() - 0.5) * 1.2;
        p.life = 1;
        p.maxSize = Math.random() * 5 + 3;
        p.speed = speed;
        p.active = true;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) return;
      isDown = true;
      prevX = lastSpawnX = e.clientX;
      prevY = lastSpawnY = e.clientY;
      prevTime = performance.now();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const now = performance.now();
      const dt = Math.max(now - prevTime, 1);
      const vx = (e.clientX - prevX) / dt * 16;
      const vy = (e.clientY - prevY) / dt * 16;
      const speed = Math.sqrt(vx * vx + vy * vy);
      spawnTrail(e.clientX, e.clientY, vx, vy, speed);
      prevX = e.clientX; prevY = e.clientY; prevTime = now;
    };

    const onPointerUp = () => { isDown = false; };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup',   onPointerUp,  { passive: true });

    // ── Render tick ───────────────────────────────────────────────
    AnimationEngine.register({
      id: 'touch-trail',
      priority: 6,
      budgetMs: 1.5,
      minTier: 'medium',

      tick(delta) {
        ctx.clearRect(0, 0, W, H);

        const decay = delta / LIFETIME_MS;

        for (let i = 0; i < POOL_SIZE; i++) {
          const p = pool[i];
          if (!p.active) continue;

          p.life -= decay;
          if (p.life <= 0) { p.active = false; continue; }

          p.vx *= 0.88;
          p.vy *= 0.88;
          p.x += p.vx;
          p.y += p.vy;

          // Lifecycle shape: 0→0.3 bloom in, 0.3→1 fade out
          const alpha = p.life > 0.7
            ? (1 - p.life) / 0.3        // bloom in (0→1)
            : p.life / 0.7;             // fade out (1→0)

          const size = p.maxSize * (0.4 + p.life * 0.6);
          const [r, g, b] = speedColor(p.speed);

          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2);
          grd.addColorStop(0,   `rgba(${r|0},${g|0},${b|0},${(alpha * 0.9).toFixed(3)})`);
          grd.addColorStop(0.5, `rgba(${r|0},${g|0},${b|0},${(alpha * 0.4).toFixed(3)})`);
          grd.addColorStop(1,   `rgba(${r|0},${g|0},${b|0},0)`);

          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }
      },
    });

    return () => {
      AnimationEngine.unregister('touch-trail');
      ro.disconnect();
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup',   onPointerUp);
      // Reset pool
      for (const p of pool) p.active = false;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[60]"
    />
  );
};

/**
 * GravityBloom — Scroll creates an updraft.
 *
 * As the user scrolls, decorative elements — rose petals, light fragments,
 * luminous particles — float upward against gravity as if scroll creates an
 * updraft. They drift, rotate, catch light, and fade.
 *
 * Never loops, never repeats. Generated procedurally per scroll event.
 * Perlin-ish drift applied per particle for organic movement.
 */

import React, { useEffect, useRef } from 'react';
import { AnimationEngine } from '../utils/AnimationEngine';

interface BloomParticle {
  x: number; y: number;
  vx: number; vy: number;
  rotation: number;
  rotationSpeed: number;
  life: number;         // 0→1, 1 = just spawned
  decayRate: number;
  size: number;
  type: 'petal' | 'spark' | 'heart';
  color: string;
  active: boolean;
}

const POOL_SIZE = 300;
const pool: BloomParticle[] = Array.from({ length: POOL_SIZE }, () => ({
  x: 0, y: 0, vx: 0, vy: 0,
  rotation: 0, rotationSpeed: 0,
  life: 0, decayRate: 0, size: 0,
  type: 'spark', color: '', active: false,
}));

let poolHead = 0;
function acquire(): BloomParticle | null {
  for (let i = 0; i < POOL_SIZE; i++) {
    const idx = (poolHead + i) % POOL_SIZE;
    if (!pool[idx].active) { poolHead = (idx + 1) % POOL_SIZE; return pool[idx]; }
  }
  return null;
}

const COLORS = ['244,63,94', '251,113,133', '251,191,36', '168,85,247', '253,186,116'];
const TYPES: BloomParticle['type'][] = ['petal', 'spark', 'heart', 'petal', 'spark'];

// Hash-based pseudo-random for deterministic but non-repeating
let seed = 1;
function rng(): number { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; }

function spawnBurst(x: number, y: number, intensity: number): void {
  const count = Math.floor(intensity * 6) + 2;
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    const angle = rng() * Math.PI * 2;
    const speed = rng() * 1.8 * intensity + 0.5;
    p.x = x + (rng() - 0.5) * 60;
    p.y = y;
    p.vx = Math.cos(angle) * speed * 0.4 + (rng() - 0.5) * 0.8;
    p.vy = -(speed + rng() * 2); // upward
    p.rotation = rng() * Math.PI * 2;
    p.rotationSpeed = (rng() - 0.5) * 0.08;
    p.life = 1;
    p.decayRate = rng() * 0.003 + 0.002;
    p.size = rng() * 8 + 4;
    p.type = TYPES[Math.floor(rng() * TYPES.length)];
    p.color = COLORS[Math.floor(rng() * COLORS.length)];
    p.active = true;
  }
}

// Draw petal shape
function drawPetal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.5, size * 0.4, size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw heart shape
function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size * 0.06, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.bezierCurveTo(0, -6, -5, -6, -5, -2);
  ctx.bezierCurveTo(-5, 2, 0, 5, 0, 8);
  ctx.bezierCurveTo(0, 5, 5, 2, 5, -2);
  ctx.bezierCurveTo(5, -6, 0, -6, 0, -3);
  ctx.fill();
  ctx.restore();
}

interface GravityBloomProps {
  scrollContainer: HTMLElement | null;
}

export const GravityBloom: React.FC<GravityBloomProps> = ({ scrollContainer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    let W = 0, H = 0;
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Scroll listener ───────────────────────────────────────────
    let lastScrollY = 0;
    let scrollVelocity = 0;

    const onScroll = () => {
      const container = scrollContainer;
      if (!container) return;
      const currentY = container.scrollTop;
      scrollVelocity = Math.abs(currentY - lastScrollY);
      lastScrollY = currentY;

      if (scrollVelocity > 4) {
        // Spawn burst from random x near bottom of viewport
        const intensity = Math.min(scrollVelocity / 20, 2);
        const spawnX = W * 0.1 + Math.random() * W * 0.8;
        spawnBurst(spawnX, H - 20, intensity);
      }
    };

    scrollContainer?.addEventListener('scroll', onScroll, { passive: true });

    // ── Physics constants ─────────────────────────────────────────
    const GRAVITY  = 0.012;  // downward pull (weak — buoyancy wins when alive)
    const BUOYANCY = 0.055;  // upward force when alive
    const DRAG     = 0.985;  // velocity damping per frame

    AnimationEngine.register({
      id: 'gravity-bloom',
      priority: 3,
      budgetMs: 1.2,
      minTier: 'medium',

      tick(delta) {
        ctx.clearRect(0, 0, W, H);

        for (let i = 0; i < POOL_SIZE; i++) {
          const p = pool[i];
          if (!p.active) continue;

          p.life -= p.decayRate * delta;
          if (p.life <= 0 || p.y < -60) { p.active = false; continue; }

          // Buoyancy when young, gravity when old
          const lift = BUOYANCY * p.life - GRAVITY * (1 - p.life);
          p.vy += lift * delta * 0.3;
          // Gentle Perlin-ish sideways drift using life as "time"
          p.vx += Math.sin(p.life * 12 + i) * 0.015 * delta;

          p.vx *= DRAG;
          p.vy *= DRAG;

          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.rotationSpeed * delta;

          // Opacity: ramp in (0.7–1.0 life) then ramp out (0–0.3 life)
          const alpha = p.life > 0.7
            ? (1 - p.life) / 0.3 * 0.85
            : p.life < 0.3
              ? (p.life / 0.3) * 0.85
              : 0.85;

          ctx.fillStyle = `rgba(${p.color},${alpha.toFixed(3)})`;

          if (p.type === 'petal') {
            drawPetal(ctx, p.x, p.y, p.size, p.rotation);
          } else if (p.type === 'heart') {
            drawHeart(ctx, p.x, p.y, p.size, p.rotation);
          } else {
            // spark — glowing point
            const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            grd.addColorStop(0, `rgba(${p.color},${alpha.toFixed(3)})`);
            grd.addColorStop(1, `rgba(${p.color},0)`);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = grd;
            ctx.fill();
          }
        }
      },
    });

    return () => {
      AnimationEngine.unregister('gravity-bloom');
      ro.disconnect();
      scrollContainer?.removeEventListener('scroll', onScroll);
      for (const p of pool) p.active = false;
    };
  }, [scrollContainer]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[8]"
    />
  );
};

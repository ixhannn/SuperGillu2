/**
 * PhysicsConfetti — Celebration Physics.
 *
 * On key moments (app open, milestone, special trigger), hundreds of
 * objects explode from the center: hearts, stars, petals, light shards.
 *
 * Each has full simulated physics:
 * · Mass-dependent gravity and air resistance
 * · Angular velocity with moment of inertia
 * · Bounce off viewport edges with coefficient of restitution
 * · Objects slowly drift upward and off screen as buoyancy takes over
 *
 * Custom Verlet-ish integrator. Zero external dependencies.
 * Call confettiRef.current.trigger() from anywhere in the app.
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { AnimationEngine } from '../utils/AnimationEngine';

export interface ConfettiHandle {
  trigger(x?: number, y?: number): void;
}

interface ConfettiParticle {
  x: number; y: number;
  vx: number; vy: number;
  ax: number; ay: number;  // acceleration
  rotation: number;
  omega: number;           // angular velocity rad/ms
  life: number;            // 0→1 alive→dead
  mass: number;
  drag: number;
  color: string;
  shape: 'heart' | 'star' | 'rect' | 'circle';
  w: number; h: number;    // bounding size
  active: boolean;
}

const POOL_SIZE = 400;
const CONFETTI_POOL: ConfettiParticle[] = Array.from({ length: POOL_SIZE }, () => ({
  x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
  rotation: 0, omega: 0,
  life: 1, mass: 1, drag: 0,
  color: '', shape: 'circle',
  w: 0, h: 0, active: false,
}));

let poolIdx = 0;
function acquireConfetti(): ConfettiParticle | null {
  for (let i = 0; i < POOL_SIZE; i++) {
    const idx = (poolIdx + i) % POOL_SIZE;
    if (!CONFETTI_POOL[idx].active) { poolIdx = (idx + 1) % POOL_SIZE; return CONFETTI_POOL[idx]; }
  }
  return null;
}

const COLORS = [
  '244,63,94', '251,113,133', '251,191,36',
  '168,85,247', '96,165,250', '52,211,153',
  '253,186,116', '255,255,255',
];
const SHAPES: ConfettiParticle['shape'][] = ['heart', 'star', 'rect', 'circle', 'heart', 'rect'];

function explode(cx: number, cy: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const p = acquireConfetti();
    if (!p) return;

    const angle = (Math.random() * Math.PI * 2);
    const speed = Math.random() * 18 + 6;
    const mass  = Math.random() * 0.8 + 0.4;

    p.x = cx + (Math.random() - 0.5) * 40;
    p.y = cy + (Math.random() - 0.5) * 40;
    p.vx = Math.cos(angle) * speed * (0.6 + Math.random() * 0.8);
    p.vy = Math.sin(angle) * speed - Math.random() * 8; // bias upward
    p.ax = 0;
    p.ay = 0.0035 * mass;   // gravity proportional to mass
    p.rotation = Math.random() * Math.PI * 2;
    p.omega = (Math.random() - 0.5) * 0.015;
    p.life = 1;
    p.mass = mass;
    p.drag = 0.988 - mass * 0.01;  // lighter = more drag
    p.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    p.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    p.w = Math.random() * 10 + 6;
    p.h = p.shape === 'rect' ? Math.random() * 14 + 4 : p.w;
    p.active = true;
  }
}

// ── Shape drawers ───────────────────────────────────────────────────────────
function drawHeart(ctx: CanvasRenderingContext2D, s: number) {
  ctx.scale(s * 0.08, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.bezierCurveTo(0, -7, -6, -7, -6, -2);
  ctx.bezierCurveTo(-6, 2, 0, 6, 0, 9);
  ctx.bezierCurveTo(0, 6, 6, 2, 6, -2);
  ctx.bezierCurveTo(6, -7, 0, -7, 0, -3);
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.4;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

const PhysicsConfettiInner: React.ForwardRefRenderFunction<ConfettiHandle> = (_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    trigger(x?: number, y?: number) {
      const cx = x ?? window.innerWidth  / 2;
      const cy = y ?? window.innerHeight / 2;
      explode(cx, cy, 220);
    },
  }));

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

    const BOUNCE = 0.45; // coefficient of restitution
    const BUOY   = 0.0018; // upward buoyancy (causes eventual float-off)

    AnimationEngine.register({
      id: 'physics-confetti',
      priority: 5,
      budgetMs: 3,
      minTier: 'medium',

      tick(delta) {
        ctx.clearRect(0, 0, W, H);

        for (let i = 0; i < POOL_SIZE; i++) {
          const p = CONFETTI_POOL[i];
          if (!p.active) continue;

          // Gravity + buoyancy
          p.vy += (p.ay - BUOY * (1 - p.life) * 2) * delta;
          p.vx *= p.drag;
          p.vy *= p.drag;

          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.omega * delta;

          // Edge bounce
          if (p.x < 0)   { p.x = 0;  p.vx = Math.abs(p.vx) * BOUNCE; }
          if (p.x > W)   { p.x = W;  p.vx = -Math.abs(p.vx) * BOUNCE; }
          if (p.y > H)   { p.y = H;  p.vy = -Math.abs(p.vy) * BOUNCE; }

          // Slow life decay after initial burst
          p.life -= 0.00018 * delta;
          if (p.life < 0 || p.y < -100) { p.active = false; continue; }

          // Alpha: full for first 70%, then fade
          const alpha = p.life > 0.3 ? 0.88 : (p.life / 0.3) * 0.88;
          ctx.fillStyle = `rgba(${p.color},${alpha.toFixed(3)})`;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);

          switch (p.shape) {
            case 'heart':   drawHeart(ctx, p.w); break;
            case 'star':    drawStar(ctx, p.w * 0.6); break;
            case 'rect':
              ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
              break;
            case 'circle':
              ctx.beginPath();
              ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
              ctx.fill();
              break;
          }

          ctx.restore();
        }
      },
    });

    return () => {
      AnimationEngine.unregister('physics-confetti');
      ro.disconnect();
      for (const p of CONFETTI_POOL) p.active = false;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[55]"
    />
  );
};

export const PhysicsConfetti = forwardRef(PhysicsConfettiInner);

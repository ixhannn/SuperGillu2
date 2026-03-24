/**
 * CanvasParticles — Touch-reactive particle system
 *
 * 200-300 lightweight particles floating in a Perlin noise flow field.
 * On touch: particles flee from finger in radial burst, elastically return.
 * On idle: gentle drift like motes of light in a sunbeam.
 *
 * Performance: Single Canvas, object pooling via Float32Array, zero GC.
 * Targets <2ms per frame. Scales particle count by device tier.
 */

import React, { useRef, useEffect } from 'react';
import { PerformanceManager } from '../services/performance';

/* ─── Simplex-like noise for flow field ─── */
function noise2D(x: number, y: number): number {
  /* Fast pseudo-noise — not true Perlin, but visually convincing
     and costs almost nothing per call */
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function flowAngle(x: number, y: number, time: number): number {
  /* Two octaves of noise for organic flow */
  const n1 = noise2D(x * 0.003 + time * 0.1, y * 0.003);
  const n2 = noise2D(x * 0.008 - time * 0.05, y * 0.008 + time * 0.08);
  return (n1 + n2 * 0.5) * Math.PI * 2;
}

export const CanvasParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!PerformanceManager.useCanvas) return;

    const ctx = canvas.getContext('2d', { alpha: true })!;
    if (!ctx) return;

    const count = PerformanceManager.particleCount;
    if (count === 0) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    /* Size canvas */
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    /* ─── Particle pool — pre-allocated typed arrays ─── */
    const px = new Float32Array(count);    /* x position */
    const py = new Float32Array(count);    /* y position */
    const vx = new Float32Array(count);    /* x velocity */
    const vy = new Float32Array(count);    /* y velocity */
    const sizes = new Float32Array(count); /* radius */
    const alphas = new Float32Array(count);/* opacity */
    const hues = new Float32Array(count);  /* color hue offset */

    /* Initialize particles randomly across screen */
    for (let i = 0; i < count; i++) {
      px[i] = Math.random() * w;
      py[i] = Math.random() * h;
      vx[i] = 0;
      vy[i] = 0;
      sizes[i] = Math.random() * 2.0 + 1.4;
      alphas[i] = Math.random() * 0.35 + 0.45;
      hues[i] = Math.random() * 30 - 15; /* slight hue variation around rose */
    }

    /* ─── Touch tracking ─── */
    let touchX = -9999;
    let touchY = -9999;
    let touching = false;

    const onPointerDown = (e: PointerEvent) => {
      touchX = e.clientX;
      touchY = e.clientY;
      touching = true;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!touching) return;
      touchX = e.clientX;
      touchY = e.clientY;
    };
    const onPointerUp = () => {
      touching = false;
      touchX = -9999;
      touchY = -9999;
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });

    /* ─── Animation loop ─── */
    let time = 0;
    let rafId: number;
    let lastFrame = performance.now();

    /* Rose palette colors for particles */
    const colors = [
      'rgba(251,113,133,',  /* tulika-400 */
      'rgba(253,164,175,',  /* tulika-300 */
      'rgba(254,205,211,',  /* tulika-200 */
      'rgba(249,168,212,',  /* baby pink */
      'rgba(255,228,230,',  /* tulika-100 */
    ];

    const animate = () => {
      rafId = requestAnimationFrame(animate);

      /* Delta time for frame-rate independence */
      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 16.67, 3); /* Normalized to 60fps, capped */
      lastFrame = now;
      time += 0.016 * dt;

      /* Clear with transparent */
      ctx.clearRect(0, 0, w, h);

      /* Touch influence radius */
      const touchRadius = 120;
      const touchForce = 4;

      /* Phase 1: update physics */
      for (let i = 0; i < count; i++) {
        const angle = flowAngle(px[i], py[i], time);
        vx[i] += Math.cos(angle) * 0.3 * dt;
        vy[i] += Math.sin(angle) * 0.3 * dt;

        if (touching) {
          const dx = px[i] - touchX;
          const dy = py[i] - touchY;
          const distSq = dx * dx + dy * dy;
          if (distSq < touchRadius * touchRadius && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / touchRadius) * touchForce * dt;
            vx[i] += (dx / dist) * force;
            vy[i] += (dy / dist) * force;
          }
        }

        vx[i] *= 0.94;
        vy[i] *= 0.94;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;

        if (px[i] < -10) px[i] = w + 10;
        if (px[i] > w + 10) px[i] = -10;
        if (py[i] < -10) py[i] = h + 10;
        if (py[i] > h + 10) py[i] = -10;
      }

      /* Phase 2: draw each particle individually (alpha varies per particle) */
      const TAU = Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const colorIdx = i % colors.length;
        const alpha = alphas[i] * (0.8 + Math.sin(time * 2 + i) * 0.2);
        const size = sizes[i];

        ctx.beginPath();
        ctx.arc(px[i], py[i], size, 0, TAU);
        ctx.fillStyle = colors[colorIdx] + alpha.toFixed(2) + ')';
        ctx.fill();

        if (size > 2) {
          ctx.beginPath();
          ctx.arc(px[i], py[i], size * 1.8, 0, TAU);
          ctx.fillStyle = colors[colorIdx] + (alpha * 0.12).toFixed(3) + ')';
          ctx.fill();
        }
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  if (PerformanceManager.reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[4] pointer-events-none"
      style={{ opacity: 1 }}
    />
  );
};

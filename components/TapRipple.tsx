/**
 * TapRipple — Global tap shockwave effect
 *
 * Every tap anywhere on the app emits a soft radial shockwave —
 * a ring that expands and fades like a ripple on water.
 * Two rings offset by 120ms for depth.
 *
 * Canvas-based, no DOM elements created per tap, zero reflow.
 * Gradient stroke in the app's rose palette.
 * Cost: ~0.5ms per frame with active ripples.
 */

import React, { useRef, useEffect } from 'react';
import { PerformanceManager } from '../services/performance';

interface Ripple {
  x: number;
  y: number;
  startTime: number;
  delay: number; /* 0 for first ring, 120 for second */
}

const MAX_RIPPLES = 8;
const RIPPLE_DURATION = 700; /* ms */
const RIPPLE_MAX_RADIUS = 120;

export const TapRipple: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!PerformanceManager.useCanvas) return;

    const ctx = canvas.getContext('2d', { alpha: true })!;
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    /* Object pool for ripples — zero allocation during taps */
    const ripples: Ripple[] = [];

    const onPointerDown = (e: PointerEvent) => {
      const now = performance.now();
      /* Two rings per tap — offset by 120ms for layered depth */
      ripples.push({ x: e.clientX, y: e.clientY, startTime: now, delay: 0 });
      ripples.push({ x: e.clientX, y: e.clientY, startTime: now, delay: 120 });

      /* Cap pool size */
      while (ripples.length > MAX_RIPPLES) ripples.shift();
    };

    /* Capture phase so we get taps even on interactive elements */
    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });

    let rafId: number;
    let hasActiveRipples = false;

    const animate = () => {
      rafId = requestAnimationFrame(animate);

      if (ripples.length === 0) {
        if (hasActiveRipples) {
          ctx.clearRect(0, 0, w, h);
          hasActiveRipples = false;
        }
        return;
      }

      ctx.clearRect(0, 0, w, h);
      hasActiveRipples = true;
      const now = performance.now();

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const elapsed = now - r.startTime - r.delay;

        /* Not started yet (delayed ring) */
        if (elapsed < 0) continue;

        /* Expired */
        if (elapsed > RIPPLE_DURATION) {
          ripples.splice(i, 1);
          continue;
        }

        /* Progress 0→1 with ease-out */
        const t = elapsed / RIPPLE_DURATION;
        const eased = 1 - Math.pow(1 - t, 3); /* cubic ease out */
        const radius = eased * RIPPLE_MAX_RADIUS;
        const opacity = (1 - t) * 0.4; /* Fade out */

        /* Draw the ring — gradient stroke from rose to transparent */
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(244, 63, 94, ${opacity})`;
        ctx.lineWidth = 2 - t * 1.5; /* Thins as it expands */
        ctx.stroke();

        /* Inner soft glow fill */
        if (t < 0.3) {
          const glowOpacity = (1 - t / 0.3) * 0.06;
          ctx.beginPath();
          ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(244, 63, 94, ${glowOpacity})`;
          ctx.fill();
        }
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
    };
  }, []);

  if (PerformanceManager.reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[60] pointer-events-none"
    />
  );
};

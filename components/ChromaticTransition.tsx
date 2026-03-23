/**
 * ChromaticTransition — Reality comes undone.
 *
 * Navigating between views fractures the screen into prismatic light.
 * RGB channels split apart (chromatic aberration), reality seems to
 * come undone over 400ms, then snaps back as the new view assembles.
 *
 * One Canvas 2D overlay. Pure requestAnimationFrame effect.
 * Triggered via the global event 'tulika:navigate'.
 */

import React, { useEffect, useRef } from 'react';

const DURATION_MS = 420;

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

export const ChromaticTransition: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(false);
  const startRef  = useRef(0);

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

    let rafId = 0;

    const runEffect = (ts: number) => {
      const progress = Math.min((ts - startRef.current) / DURATION_MS, 1);
      ctx.clearRect(0, 0, W, H);

      if (progress >= 1) {
        activeRef.current = false;
        return;
      }

      rafId = requestAnimationFrame(runEffect);

      // Bell-curve intensity: peaks at 50% of transition
      const bell = Math.sin(progress * Math.PI);
      const intensity = easeInOutQuart(bell);

      // ── Prismatic fracture ────────────────────────────────────
      // Snapshot the current screen content, then offset RGB channels
      // by drawing three rectangle fills with globalCompositeOperation

      const shift = intensity * 18;  // max px offset

      // We can't capture the live DOM easily on canvas, so instead we
      // draw a series of colored overlay strips with globalCompositeOperation
      // that creates a convincing chromatic aberration overlay

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // Red channel — shift left
      const redAlpha = intensity * 0.28;
      ctx.fillStyle = `rgba(255,0,60,${redAlpha.toFixed(3)})`;
      ctx.save();
      ctx.translate(-shift, 0);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Blue channel — shift right
      const blueAlpha = intensity * 0.28;
      ctx.fillStyle = `rgba(0,80,255,${blueAlpha.toFixed(3)})`;
      ctx.save();
      ctx.translate(shift, 0);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Green channel — shift up/down
      const greenAlpha = intensity * 0.15;
      ctx.fillStyle = `rgba(0,255,120,${greenAlpha.toFixed(3)})`;
      ctx.save();
      ctx.translate(0, -shift * 0.5);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      ctx.globalCompositeOperation = 'source-over';

      // ── Scanline bands at peak ────────────────────────────────
      if (intensity > 0.4) {
        const bandIntensity = (intensity - 0.4) / 0.6;
        const bandCount = Math.floor(H / 6);
        for (let b = 0; b < bandCount; b++) {
          if (Math.random() < 0.08 * bandIntensity) {
            const by = b * 6;
            const bw = Math.random() * W * 0.6 + W * 0.2;
            const bx = Math.random() * (W - bw);
            ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.12 * bandIntensity).toFixed(3)})`;
            ctx.fillRect(bx, by, bw, 3);
          }
        }
      }

      // ── White flash at peak ───────────────────────────────────
      const flashAlpha = Math.max(0, intensity - 0.7) / 0.3 * 0.35;
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,245,250,${flashAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();
    };

    const trigger = () => {
      if (activeRef.current) return;
      activeRef.current = true;
      startRef.current  = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(runEffect);
    };

    window.addEventListener('tulika:navigate', trigger);

    return () => {
      window.removeEventListener('tulika:navigate', trigger);
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[50]"
    />
  );
};

/** Call this whenever a view transition begins */
export function triggerChromaticTransition(): void {
  window.dispatchEvent(new Event('tulika:navigate'));
}

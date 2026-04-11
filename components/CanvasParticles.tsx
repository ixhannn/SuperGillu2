/**
 * CanvasParticles — Touch-reactive particle system.
 *
 * Physics runs in a dedicated Web Worker with OffscreenCanvas.
 * Main thread cost: ~0.1ms per frame (only pointer event forwarding).
 *
 * The Worker runs its own RAF loop (required for OffscreenCanvas rendering).
 * Main-thread AnimationEngine registers a lightweight subscriber that:
 *   1. Forwards pointer events to the Worker (debounced via flag)
 *   2. Sends tier/config changes when the quality level changes
 *
 * On devices that don't support OffscreenCanvas (Safari < 17 on some builds),
 * falls back gracefully by rendering nothing (particles are decorative).
 */

import React, { useRef, useEffect } from 'react';
import { AnimationEngine, QualityTier } from '../utils/AnimationEngine';
import { PerformanceManager } from '../services/performance';
import { readThemeRgbTriplet } from '../utils/themeVars';

// Particle count per tier
const TIER_COUNT: Record<QualityTier, number> = {
  ultra:    200,
  high:     140,
  medium:   80,
  low:      0,   // no particles on low — canvas is still there for touch trail
  'css-only': 0,
};

function buildColors(): string[] {
  return [
    readThemeRgbTriplet('--theme-particle-1-rgb', '251,113,133'),
    readThemeRgbTriplet('--theme-particle-2-rgb', '253,164,175'),
    readThemeRgbTriplet('--theme-particle-3-rgb', '254,205,211'),
    readThemeRgbTriplet('--theme-particle-4-rgb', '249,168,212'),
    readThemeRgbTriplet('--theme-particle-5-rgb', '255,228,230'),
  ];
}

export const CanvasParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const pointerRef = useRef({ x: -9999, y: -9999, down: false, dirty: false });
  const lastTierRef = useRef<QualityTier | null>(null);

  useEffect(() => {
    if (PerformanceManager.reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check OffscreenCanvas support
    if (typeof canvas.transferControlToOffscreen !== 'function') {
      // Graceful degradation — no particles but no crash
      console.debug('[CanvasParticles] OffscreenCanvas not supported, skipping particles');
      return;
    }

    // Spin up the Worker
    const worker = new Worker(
      new URL('../workers/ParticleWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    const dpr    = Math.min(window.devicePixelRatio, 2);
    const width  = window.innerWidth;
    const height = window.innerHeight;
    const offscreen = canvas.transferControlToOffscreen();

    worker.postMessage({
      type:   'init',
      canvas: offscreen,
      width,
      height,
      dpr,
      count:  TIER_COUNT['ultra'],
      colors: buildColors(),
    }, [offscreen]); // transfer ownership — zero copy

    // ── Resize handler ────────────────────────────────────────────────────
    const onResize = () => {
      worker.postMessage({
        type:   'resize',
        width:  window.innerWidth,
        height: window.innerHeight,
        dpr:    Math.min(window.devicePixelRatio, 2),
      });
    };
    window.addEventListener('resize', onResize, { passive: true });

    // ── Pointer forwarding (raw events → worker, batched per frame) ───────
    const onPointerDown = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, down: true, dirty: true };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerRef.current.down) return;
      pointerRef.current.x = e.clientX;
      pointerRef.current.y = e.clientY;
      pointerRef.current.dirty = true;
    };
    const onPointerUp = () => {
      pointerRef.current = { x: -9999, y: -9999, down: false, dirty: true };
    };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup',   onPointerUp,   { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });

    // ── Theme change observer ─────────────────────────────────────────────
    const themeObserver = new MutationObserver(() => {
      if (!workerRef.current) return;
      workerRef.current.postMessage({
        type:   'config',
        count:  TIER_COUNT[AnimationEngine.tier],
        colors: buildColors(),
      });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme'],
    });

    // ── AnimationEngine subscriber (main-thread side, very cheap) ─────────
    AnimationEngine.register({
      id:       'canvas-particles-bridge',
      priority: 3,
      budgetMs: 0.2,
      minTier:  'medium',

      tick(_delta, _ts, tier) {
        // Forward pending pointer state to worker (max one message per frame)
        if (pointerRef.current.dirty) {
          pointerRef.current.dirty = false;
          workerRef.current?.postMessage({
            type: 'pointer',
            x:    pointerRef.current.x,
            y:    pointerRef.current.y,
            down: pointerRef.current.down,
          });
        }

        // Sync tier → particle count
        if (tier !== lastTierRef.current) {
          lastTierRef.current = tier;
          workerRef.current?.postMessage({
            type:   'config',
            count:  TIER_COUNT[tier],
            colors: buildColors(),
          });
        }
      },
    });

    return () => {
      AnimationEngine.unregister('canvas-particles-bridge');
      worker.postMessage({ type: 'stop' });
      worker.terminate();
      workerRef.current = null;

      window.removeEventListener('resize',     onResize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup',   onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      themeObserver.disconnect();
    };
  }, []);

  if (PerformanceManager.reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[4] pointer-events-none"
    />
  );
};

/**
 * PerformanceManager — Device capability detection.
 *
 * Detects device tier at startup. FPS monitoring is handled entirely by
 * AnimationEngine (which owns the single RAF loop) — this class no longer
 * runs a separate requestAnimationFrame for monitoring, eliminating the
 * previous double-loop that wasted one frame callback per tick.
 *
 * Device tiers:
 *   1 — High-end:   120fps target (Pixel 7+, Galaxy S22+, iPhone 13 Pro+)
 *   2 — Mid-range:  60fps target
 *   3 — Low-end:    reduced motion, no particles
 *
 * Live FPS: read from AnimationEngine.fps (no separate loop needed).
 */

import { AnimationEngine } from '../utils/AnimationEngine';

export type DeviceTier = 1 | 2 | 3;

class PerformanceManagerClass {
  /** Tier system disabled — every device is treated as top-tier (1). */
  tier: DeviceTier = 1;
  reducedMotion: boolean = false;

  private _initialized = false;
  private _listeners = new Set<(tier: DeviceTier) => void>();

  /** Call once in App root — safe to call multiple times */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;
    // Honor OS-level reduced-motion only — every other capability is forced on.
    this.reducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        this.reducedMotion = e.matches;
      });
    }
    AnimationEngine.setTier('ultra');
  }

  get currentFps(): number {
    return AnimationEngine.fps;
  }

  get particleCount(): number { return 200; }
  get useWebGL(): boolean { return !this.reducedMotion; }
  get useCanvas(): boolean { return !this.reducedMotion; }
  get useChromaticAberration(): boolean { return !this.reducedMotion; }
  get useEntranceChoreography(): boolean { return !this.reducedMotion; }

  onTierChange(fn: (tier: DeviceTier) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  destroy(): void {}
}

export const PerformanceManager = new PerformanceManagerClass();

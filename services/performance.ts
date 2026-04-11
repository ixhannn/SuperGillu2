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
  tier: DeviceTier = 2;
  reducedMotion: boolean = false;

  private _initialized = false;
  private _listeners = new Set<(tier: DeviceTier) => void>();

  /** Call once in App root — safe to call multiple times */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    // Reduced motion — check immediately, listen for changes
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
      if (e.matches) {
        this._setTier(3);
        AnimationEngine.setTier('css-only');
      } else {
        this._setTier(this._detectTier());
        AnimationEngine.setTier('ultra');
      }
    });

    if (this.reducedMotion) {
      this.tier = 3;
      AnimationEngine.setTier('css-only');
      return;
    }

    this.tier = this._detectTier();

    // Map DeviceTier → initial AnimationEngine QualityTier
    if (this.tier === 3) {
      AnimationEngine.setTier('low');
    } else if (this.tier === 2) {
      AnimationEngine.setTier('high');
    }
    // Tier 1 → AnimationEngine defaults to 'ultra'
  }

  /** Live FPS — delegates to AnimationEngine (no separate RAF) */
  get currentFps(): number {
    return AnimationEngine.fps;
  }

  get particleCount(): number {
    if (this.tier === 1) return 200;
    if (this.tier === 2) return 60;
    return 0;
  }

  get useWebGL(): boolean {
    return this.tier <= 2 && !this.reducedMotion;
  }

  get useCanvas(): boolean {
    return this.tier <= 2 && !this.reducedMotion;
  }

  get useChromaticAberration(): boolean {
    return this.tier === 1 && !this.reducedMotion;
  }

  get useEntranceChoreography(): boolean {
    return this.tier <= 2 && !this.reducedMotion;
  }

  onTierChange(fn: (tier: DeviceTier) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // No-op: kept for backward compat, no RAF to cancel
  destroy(): void {}

  private _detectTier(): DeviceTier {
    const memory = (navigator as any).deviceMemory ?? 4;
    const cores  = navigator.hardwareConcurrency ?? 4;

    // GPU check: prefer WebGL2 presence as a proxy for capable GPU
    let hasGPU = false;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      hasGPU = !!gl;
    } catch {}

    if (memory >= 4 && cores >= 6 && hasGPU) return 1;
    if (memory >= 2 && cores >= 4) return 2;
    return 3;
  }

  private _setTier(t: DeviceTier): void {
    if (this.tier === t) return;
    this.tier = t;
    this._listeners.forEach(fn => fn(t));
  }
}

export const PerformanceManager = new PerformanceManagerClass();

/**
 * PerformanceManager — animation capability coordinator.
 *
 * Claude's mobile build intentionally disabled device-tier visual gating so
 * the ambient background and premium visuals do not vanish on Capacitor.
 * Reduced motion is still honored.
 */

import { AnimationEngine } from '../utils/AnimationEngine';

export type DeviceTier = 1 | 2 | 3;

class PerformanceManagerClass {
  tier: DeviceTier = 1;
  reducedMotion: boolean = false;

  private _initialized = false;
  private _listeners = new Set<(tier: DeviceTier) => void>();

  /** Call once in App root — safe to call multiple times */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    this.reducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        this.reducedMotion = e.matches;
      });
    }
    AnimationEngine.setTier('ultra');
  }

  /** Live FPS — delegates to AnimationEngine (no separate RAF) */
  get currentFps(): number {
    return AnimationEngine.fps;
  }

  get particleCount(): number {
    return this.reducedMotion ? 0 : 200;
  }

  get useWebGL(): boolean {
    return !this.reducedMotion;
  }

  get useCanvas(): boolean {
    return !this.reducedMotion;
  }

  get useChromaticAberration(): boolean {
    return !this.reducedMotion;
  }

  get useEntranceChoreography(): boolean {
    return !this.reducedMotion;
  }

  onTierChange(fn: (tier: DeviceTier) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // No-op: kept for backward compat, no RAF to cancel
  destroy(): void {}

  private _setTier(t: DeviceTier): void {
    if (this.tier === t) return;
    this.tier = t;
    this._listeners.forEach(fn => fn(t));
  }
}

export const PerformanceManager = new PerformanceManagerClass();

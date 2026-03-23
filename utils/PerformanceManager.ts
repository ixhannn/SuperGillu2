/**
 * PerformanceManager — Adaptive Quality System.
 *
 * Samples real delivered fps every 500ms. Applies hysteresis to prevent
 * oscillation between tiers. Downgrades fast (1s), upgrades slowly (3s)
 * one tier at a time to avoid visual jarring during recovery.
 *
 * Register once from AnimationEngine subscriber, call update() every tick.
 */

import { AnimationEngine, type QualityTier } from './AnimationEngine';

const TIERS: QualityTier[] = ['ultra', 'high', 'medium', 'low', 'css-only'];

/** fps must stay BELOW this to downgrade */
const DOWNGRADE_FPS: Record<QualityTier, number> = {
  ultra: 100,
  high: 78,
  medium: 52,
  low: 35,
  'css-only': 0,
};

/** fps must stay ABOVE this to upgrade */
const UPGRADE_FPS = 95;

const DOWNGRADE_HOLD_MS = 1000; // sustained drop before downgrade
const UPGRADE_HOLD_MS = 3000;   // sustained recovery before upgrade
const SAMPLE_INTERVAL_MS = 500;

class PerformanceManagerClass {
  private lastSampleAt = 0;
  private belowSince = 0;
  private aboveSince = 0;

  public currentFps = 120;
  /** Ring buffer of last 120 fps samples for the debug graph */
  public readonly fpsHistory = new Float32Array(120).fill(120);
  private histIdx = 0;

  private onTierChangeCb?: (tier: QualityTier) => void;

  setTierChangeCallback(cb: (tier: QualityTier) => void): void {
    this.onTierChangeCb = cb;
  }

  /**
   * Call this from an AnimationEngine subscriber's tick().
   * Self-throttles to SAMPLE_INTERVAL_MS — safe to call every frame.
   */
  update(timestamp: number): void {
    if (timestamp - this.lastSampleAt < SAMPLE_INTERVAL_MS) return;
    this.lastSampleAt = timestamp;

    const fps = AnimationEngine.fps;
    this.currentFps = fps;
    this.fpsHistory[this.histIdx % 120] = fps;
    this.histIdx++;

    this.evaluate(fps, timestamp);
  }

  private evaluate(fps: number, now: number): void {
    const tier = AnimationEngine.tier;
    const idx = TIERS.indexOf(tier);

    // ─── Downgrade check ───────────────────────────────────────────
    if (fps < DOWNGRADE_FPS[tier] && idx < TIERS.length - 1) {
      if (!this.belowSince) {
        this.belowSince = now;
      } else if (now - this.belowSince > DOWNGRADE_HOLD_MS) {
        this.applyTier(TIERS[idx + 1], fps, 'down');
        this.belowSince = 0;
        this.aboveSince = 0;
      }
    } else {
      this.belowSince = 0;
    }

    // ─── Upgrade check (gradual — one tier at a time) ─────────────
    if (fps >= UPGRADE_FPS && idx > 0) {
      if (!this.aboveSince) {
        this.aboveSince = now;
      } else if (now - this.aboveSince > UPGRADE_HOLD_MS) {
        this.applyTier(TIERS[idx - 1], fps, 'up');
        this.aboveSince = 0;
      }
    } else {
      this.aboveSince = 0;
    }
  }

  private applyTier(tier: QualityTier, fps: number, dir: 'up' | 'down'): void {
    AnimationEngine.setTier(tier);
    this.onTierChangeCb?.(tier);
    if (import.meta.env.DEV) {
      console.info(`[PerformanceManager] ${dir === 'up' ? '↑' : '↓'} ${tier} @ ${fps}fps`);
    }
  }
}

export const PerformanceManager = new PerformanceManagerClass();

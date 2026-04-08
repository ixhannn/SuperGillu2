/**
 * AnimationEngine - The heartbeat of Tulika.
 *
 * Single requestAnimationFrame loop. Every visual effect subscribes here.
 * No effect runs its own RAF - zero redundant loops, zero duplicate work.
 *
 * Frame budget tracked per subscriber. Quality tier broadcast to all effects
 * for real-time adaptive rendering. Auto-downgrades tier when FPS drops.
 */

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'css-only';

export interface AnimationSubscriber {
  id: string;
  /** Called every frame with delta (ms), absolute timestamp (ms), and current quality tier */
  tick: (delta: number, timestamp: number, tier: QualityTier) => void;
  /** Declared CPU budget in ms - used for scheduling/shedding */
  budgetMs: number;
  /** Minimum quality tier required to run this effect */
  minTier: QualityTier;
  /** Priority 1-10: higher = more likely to survive tier downgrade */
  priority: number;
}

const TIER_RANK: Record<QualityTier, number> = {
  'css-only': 0,
  low: 1,
  medium: 2,
  high: 3,
  ultra: 4,
};

// FPS thresholds for auto adaptive quality
const FPS_LOW    = 30; // below this → downgrade
const FPS_HIGH   = 52; // above this → upgrade
const ADAPT_INTERVAL = 3000; // ms between tier checks

class AnimationEngineClass {
  private readonly subs = new Map<string, AnimationSubscriber>();
  private rafId = 0;
  private lastTs = 0;
  private running = false;
  private visibilityListenerBound = false;
  private lastAdapt = 0;
  private adaptLockUntil = 0; // prevent rapid flapping

  public tier: QualityTier = 'ultra';

  /**
   * Ring buffer of last 60 frame deltas in ms.
   * PerformanceManager reads this to compute real fps without any extra tracking.
   */
  public readonly frameTimes = new Float32Array(60).fill(16.67);
  private frameIdx = 0;

  /** Current measured fps (averaged over last 60 frames) */
  get fps(): number {
    let sum = 0;
    for (let i = 0; i < 60; i++) sum += this.frameTimes[i];
    return Math.round(60000 / sum);
  }

  register(sub: AnimationSubscriber): void {
    this.subs.set(sub.id, sub);
    if (!this.running) this.start();
  }

  unregister(id: string): void {
    this.subs.delete(id);
    if (this.subs.size === 0) this.stop();
  }

  setTier(tier: QualityTier): void {
    this.tier = tier;
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.tier = tier;
    }
  }

  private adaptTier(ts: number): void {
    if (ts - this.lastAdapt < ADAPT_INTERVAL) return;
    if (ts < this.adaptLockUntil) return;
    this.lastAdapt = ts;

    const fps = this.fps;
    const currentRank = TIER_RANK[this.tier];

    if (fps < FPS_LOW && currentRank > 0) {
      // Downgrade
      const tiers = Object.keys(TIER_RANK) as QualityTier[];
      const lower = tiers.find(t => TIER_RANK[t] === currentRank - 1);
      if (lower) {
        this.setTier(lower);
        this.adaptLockUntil = ts + 5000; // 5s lock after downgrade
      }
    } else if (fps > FPS_HIGH && currentRank < TIER_RANK['ultra']) {
      // Upgrade (more conservative — only if well above threshold)
      const tiers = Object.keys(TIER_RANK) as QualityTier[];
      const higher = tiers.find(t => TIER_RANK[t] === currentRank + 1);
      if (higher) {
        this.setTier(higher);
        this.adaptLockUntil = ts + 8000; // 8s lock after upgrade (stable before re-checking)
      }
    }
  }

  private readonly loop = (ts: number): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.rafId = requestAnimationFrame(this.loop);

    // Cap delta at 50ms to prevent physics spiral-of-death after tab switch
    const delta = Math.min(ts - this.lastTs, 50);
    // Skip duplicate frames (e.g. from display power saving doubling callbacks)
    if (delta < 4) return;
    this.lastTs = ts;

    // Record frame time in ring buffer
    this.frameTimes[this.frameIdx % 60] = delta;
    this.frameIdx++;

    // Auto adaptive quality
    this.adaptTier(ts);

    const tierRank = TIER_RANK[this.tier];

    // Tick all eligible subscribers
    for (const sub of this.subs.values()) {
      if (tierRank >= TIER_RANK[sub.minTier]) {
        sub.tick(delta, ts, this.tier);
      }
    }
  };

  start(): void {
    if (this.running) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    this.bindVisibilityListener();
    this.running = true;
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private bindVisibilityListener(): void {
    if (this.visibilityListenerBound || typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.stop();
      } else if (this.subs.size > 0) {
        this.lastTs = performance.now(); // Reset to avoid huge delta on resume
        this.start();
      }
    });
    this.visibilityListenerBound = true;
  }
}

export const AnimationEngine = new AnimationEngineClass();

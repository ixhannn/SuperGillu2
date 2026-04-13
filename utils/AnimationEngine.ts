/**
 * AnimationEngine — The single heartbeat of Lior.
 *
 * ONE requestAnimationFrame loop owns ALL rendering.
 * No component, service, or effect may call requestAnimationFrame directly.
 * Everything subscribes here and receives tick(delta, ts, tier).
 *
 * Quality tiers (120fps display tuned):
 *   ultra    → 120fps   (all effects on, full particle count)
 *   high     → 90fps    (WebGL on, particle count 70%)
 *   medium   → 60fps    (backdrop-filter disabled, particle count 40%)
 *   low      → 30fps    (canvas-only, no WebGL, no blur)
 *   css-only → fallback (all JS animations off, pure CSS)
 *
 * Tier thresholds:
 *   < 100fps sustained → downgrade (5s lock)
 *   ≥ 108fps for 1.5s  → upgrade   (8s lock)
 *
 * CSS Animation Bus (zero-thrash):
 *   Subscribers returning cssProps() contribute to a SINGLE
 *   style.setProperty burst at the END of each frame — one paint
 *   boundary regardless of how many subscribers write CSS vars.
 */

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'css-only';

export interface AnimationSubscriber {
  /** Unique id — used for unregister and cost tracking in overlay */
  id: string;
  /** Main tick. delta = ms since last frame (capped at 50ms, min 3ms). */
  tick: (delta: number, timestamp: number, tier: QualityTier) => void;
  /** Declared CPU budget in ms — surfaced in dev overlay */
  budgetMs: number;
  /** Minimum tier this subscriber requires to run */
  minTier: QualityTier;
  /** Priority 1–10: higher survives tier downgrade longer */
  priority: number;
  /**
   * Optional CSS Animation Bus contribution.
   * Return a map of CSS custom property → value this frame.
   * All contributors are batched into ONE setProperty burst at frame end.
   *
   * NEVER write to document.documentElement.style directly in tick().
   * Use this instead.
   *
   * Example:
   *   cssProps: () => ({
   *     '--breathe-phase': `${Math.sin(t * 0.5).toFixed(4)}`,
   *     '--glow-alpha':    `${alpha.toFixed(3)}`,
   *   })
   */
  cssProps?: () => Record<string, string>;
}

const TIER_RANK: Record<QualityTier, number> = {
  'css-only': 0,
  low:        1,
  medium:     2,
  high:       3,
  ultra:      4,
};

// Pre-sorted tier array — computed once, reused in _adaptTier every 30 frames
const TIER_SORTED: QualityTier[] = (Object.keys(TIER_RANK) as QualityTier[])
  .sort((a, b) => TIER_RANK[a] - TIER_RANK[b]);

// Thresholds — tuned for 120fps panel (8.33ms budget per frame)
const DOWNGRADE_FPS = 100;       // below this → downgrade
const UPGRADE_FPS   = 108;       // above this (sustained) → upgrade
const SAMPLE_EVERY  = 30;        // frames between tier evaluations
const UPGRADE_REQUIRED = 180;    // frames of high FPS before upgrading (~1.5s @120)
const DOWNGRADE_LOCK = 5_000;    // ms lock after downgrade
const UPGRADE_LOCK   = 8_000;    // ms lock after upgrade

class AnimationEngineClass {
  private readonly subs = new Map<string, AnimationSubscriber>();
  private rafId = 0;
  private lastTs = 0;
  private running = false;
  private visListenerBound = false;
  private adaptLockUntil = 0;
  private upgradeFrames = 0;

  /** Active quality tier — broadcast to subscribers and CSS via data-tier */
  public tier: QualityTier = 'ultra';

  /**
   * Ring buffer of frame deltas (ms). Length 128 → ~1s of history at 120fps.
   * PerformanceManager and FPSMonitor read from here.
   * No separate RAF needed to measure FPS.
   */
  public readonly frameTimes = new Float32Array(128).fill(8.33);
  private frameIdx = 0;

  /**
   * Per-subscriber measured cost (ms) for the last frame.
   * FPSMonitor reads this map to render budget bars.
   */
  public readonly costs = new Map<string, number>();

  // Pre-allocated CSS accumulator — reused every frame to avoid GC pressure
  private readonly _cssAccum: { [k: string]: string } = Object.create(null);
  private _cssDirty = false;

  /** Rolling average FPS over the last 128 frames */
  get fps(): number {
    const len = this.frameTimes.length;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += this.frameTimes[i];
    return Math.round((len * 1000) / sum);
  }

  register(sub: AnimationSubscriber): void {
    this.subs.set(sub.id, sub);
    if (!this.running) this.start();
  }

  unregister(id: string): void {
    this.subs.delete(id);
    this.costs.delete(id);
  }

  /** Override tier externally (e.g. from settings or debug UI) */
  setTier(tier: QualityTier): void {
    if (this.tier === tier) return;
    this.tier = tier;
    this.upgradeFrames = 0;
    this._publishTier(tier);
  }

  private _publishTier(tier: QualityTier): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.tier = tier;
    }
  }

  private _adaptTier(fps: number, ts: number): void {
    if (ts < this.adaptLockUntil) {
      this.upgradeFrames = 0;
      return;
    }

    const rank  = TIER_RANK[this.tier];
    const tiers = TIER_SORTED;

    if (fps < DOWNGRADE_FPS && rank > 0) {
      this.upgradeFrames = 0;
      const lower = tiers.find(t => TIER_RANK[t] === rank - 1)!;
      this.tier = lower;
      this._publishTier(lower);
      this.adaptLockUntil = ts + DOWNGRADE_LOCK;
    } else if (fps >= UPGRADE_FPS && rank < TIER_RANK['ultra']) {
      if (++this.upgradeFrames >= UPGRADE_REQUIRED) {
        this.upgradeFrames = 0;
        const higher = tiers.find(t => TIER_RANK[t] === rank + 1)!;
        this.tier = higher;
        this._publishTier(higher);
        this.adaptLockUntil = ts + UPGRADE_LOCK;
      }
    } else {
      this.upgradeFrames = 0;
    }
  }

  private readonly loop = (ts: number): void => {
    // Pause when tab is hidden — saves battery, avoids huge delta on resume
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.running = false;
      this.rafId = 0;
      return;
    }

    this.rafId = requestAnimationFrame(this.loop);

    const delta = Math.min(ts - this.lastTs, 50);
    if (delta < 3) return; // skip duplicate callbacks from power-saving display
    this.lastTs = ts;

    // Record into ring buffer
    this.frameTimes[this.frameIdx & 127] = delta;
    this.frameIdx++;

    // Evaluate tier every N frames
    if ((this.frameIdx & (SAMPLE_EVERY - 1)) === 0) {
      this._adaptTier(this.fps, ts);
    }

    const tierRank = TIER_RANK[this.tier];
    const root = typeof document !== 'undefined' ? document.documentElement.style : null;

    // Clear accumulator (reuse object — no per-frame allocation)
    if (this._cssDirty) {
      const acc = this._cssAccum;
      for (const k in acc) delete acc[k];
      this._cssDirty = false;
    }

    for (const sub of this.subs.values()) {
      if (tierRank < TIER_RANK[sub.minTier]) continue;

      const t0 = performance.now();
      sub.tick(delta, ts, this.tier);
      this.costs.set(sub.id, performance.now() - t0);

      // Collect CSS contributions
      if (sub.cssProps) {
        const props = sub.cssProps();
        if (props) {
          const acc = this._cssAccum;
          for (const k in props) { acc[k] = props[k]; this._cssDirty = true; }
        }
      }
    }

    // ONE setProperty burst for all CSS vars this frame
    if (this._cssDirty && root) {
      for (const key in this._cssAccum) root.setProperty(key, this._cssAccum[key]);
    }
  };

  start(): void {
    if (this.running) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    this._bindVisibility();
    this._publishTier(this.tier);
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

  private _bindVisibility(): void {
    if (this.visListenerBound || typeof document === 'undefined') return;
    this.visListenerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.stop();
      } else {
        this.lastTs = performance.now(); // avoid spike on resume
        this.running = false;
        this.start();
      }
    });
  }
}

export const AnimationEngine = new AnimationEngineClass();

// Boot the engine immediately so the CSS tier attribute is set before first paint
if (typeof document !== 'undefined') {
  AnimationEngine.start();
}

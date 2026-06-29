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

// Adaptive thresholds are RELATIVE to the device's own measured refresh ceiling
// (peakFps), NOT an absolute fps. A 60Hz panel delivering a smooth 60fps must
// never read as "struggling" — keying off an absolute 100fps did exactly that
// and is why this system was previously disabled. We downgrade only when fps
// drops well below the device's OWN established peak.
const DOWNGRADE_RATIO = 0.70;    // below 70% of peak (sustained) → shed a tier
const UPGRADE_RATIO   = 0.92;    // above 92% of peak (sustained) → recover a tier
const SAMPLE_EVERY  = 30;        // frames between tier evaluations
const DOWNGRADE_HOLD = 1_500;    // ms of sustained low fps before shedding a tier
const UPGRADE_HOLD   = 1_500;    // ms of sustained high fps before recovering a tier
const DOWNGRADE_LOCK = 5_000;    // ms settle-lock after a downgrade (fast to shed)
const UPGRADE_LOCK   = 8_000;    // ms settle-lock after an upgrade (slow to restore)
const ADAPT_WARMUP_FRAMES = 256; // ~2s before adapting, so peakFps is established

class AnimationEngineClass {
  private readonly subs = new Map<string, AnimationSubscriber>();
  private rafId = 0;
  private lastTs = 0;
  private running = false;
  private visListenerBound = false;
  private adaptLockUntil = 0;
  private peakFps = 0;       // running max rolling-fps ≈ the device refresh ceiling
  private belowSince = 0;    // ts since fps first dropped below the downgrade line
  private aboveSince = 0;    // ts since fps first rose above the upgrade line
  /** Cost tracking is opt-in. The dev overlay flips this on so production
   *  builds don't pay the `performance.now()` cost twice per subscriber per
   *  frame just to populate a map nobody reads. */
  public costTrackingEnabled = false;

  /** Active quality tier — locked at ultra for the Capacitor visual build. */
  public tier: QualityTier = 'ultra';

  constructor() {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.tier = 'ultra';
    }
  }

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
    if (this.subs.size === 0) {
      this.stop();
    }
  }

  setTier(tier: QualityTier): void {
    if (this.tier === tier) {
      this._publishTier(tier);
      return;
    }
    this.tier = tier;
    this._publishTier(tier);
  }

  private _publishTier(tier: QualityTier): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.tier = tier;
    }
  }

  /**
   * Adaptive quality — refresh-relative, fail-safe.
   *
   * Drives data-tier (CSS rules in index.css §ADAPTIVE QUALITY TIERS) + the
   * per-subscriber minTier gate in the loop, so a struggling device sheds the
   * heaviest work (backdrop-filter, particle density, WebGL stage) to hold its
   * framerate. On a device that comfortably hits its own refresh ceiling this
   * NEVER fires — it stays at 'ultra' and nothing changes.
   *
   * Safety: thresholds are a fraction of the device's OWN measured peak fps, so
   * a healthy 60Hz panel (peak ≈ 60) is judged against ~42fps, not an absolute
   * 100. peakFps is a running max of the ~1s rolling average, so it cannot
   * exceed the true refresh and the system fails safe (under-measuring peak only
   * makes it LESS likely to downgrade). Two-step + hysteresis + settle-locks
   * mean the first (near-invisible) ultra→high step absorbs transient dips;
   * backdrop-filter is only dropped at 'medium', which needs sustained struggle.
   */
  private _adaptTier(fps: number, ts: number): void {
    if (fps > this.peakFps) this.peakFps = fps;
    // Warm up until the refresh ceiling is established, and respect settle-locks.
    if (this.peakFps < 30 || this.frameIdx < ADAPT_WARMUP_FRAMES) return;
    if (ts < this.adaptLockUntil) return;

    const idx = TIER_RANK[this.tier];
    const downgradeBelow = this.peakFps * DOWNGRADE_RATIO;
    const upgradeAbove   = this.peakFps * UPGRADE_RATIO;

    // Downgrade: shed one tier after fps stays below the line for the hold window.
    if (fps < downgradeBelow && idx > 0) {
      this.aboveSince = 0;
      if (this.belowSince === 0) { this.belowSince = ts; return; }
      if (ts - this.belowSince >= DOWNGRADE_HOLD) {
        this.belowSince = 0;
        this.adaptLockUntil = ts + DOWNGRADE_LOCK;
        this.setTier(TIER_SORTED[idx - 1]);
      }
      return;
    }
    this.belowSince = 0;

    // Upgrade: recover one tier after fps stays high for the hold window.
    if (fps >= upgradeAbove && idx < TIER_RANK.ultra) {
      if (this.aboveSince === 0) { this.aboveSince = ts; return; }
      if (ts - this.aboveSince >= UPGRADE_HOLD) {
        this.aboveSince = 0;
        this.adaptLockUntil = ts + UPGRADE_LOCK;
        this.setTier(TIER_SORTED[idx + 1]);
      }
    } else {
      this.aboveSince = 0;
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

    const trackCost = this.costTrackingEnabled;
    for (const sub of this.subs.values()) {
      if (tierRank < TIER_RANK[sub.minTier]) continue;

      if (trackCost) {
        const t0 = performance.now();
        sub.tick(delta, ts, this.tier);
        this.costs.set(sub.id, performance.now() - t0);
      } else {
        sub.tick(delta, ts, this.tier);
      }

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

    // Bind BEFORE the hidden check. If the app boots while backgrounded the
    // engine must still wake on the next visibilitychange — previously the
    // early return skipped binding and the engine stayed dead until a new
    // subscriber happened to register.
    this._bindVisibility();
    this._publishTier(this.tier);
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
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
      } else if (!this.running && this.subs.size > 0) {
        // Reset the last-timestamp to avoid feeding a huge delta into the
        // tick loop on resume. start() also writes lastTs but it does so
        // BEFORE the first RAF callback, which is the wrong baseline for
        // the next frame delta.
        this.lastTs = performance.now();
        this.start();
      }
    });
  }
}

export const AnimationEngine = new AnimationEngineClass();

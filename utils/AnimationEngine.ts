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
   * Optional per-subscriber frame-rate cap (fps). When set, this subscriber is
   * ticked at most this many times per second, regardless of the engine's
   * (already capped) frame rate. Use for purely decorative, slow ambient motion
   * that is visually identical at a low cadence — constellation drift, the CSS
   * breathing bus, the bokeh blob — so a 120Hz panel doesn't redraw/recalc them
   * 4× more often than the eye can tell. `tick` receives the accumulated delta
   * since this subscriber last ran, so physics and wave timing stay correct.
   * Omit for anything that must stay crisp (touch trail, confetti).
   */
  fps?: number;
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

// Visuals are LOCKED to the 'ultra' tier — never auto-downgraded by device or
// fps. The signature animated background is meant to run at full quality on
// every device; the user controls the heavy 3D blob with an explicit Settings
// toggle (services/ambientPrefs.ts) instead. Adaptive downgrade is intentionally
// disabled (see _adaptTier below).
const SAMPLE_EVERY  = 30;        // frames between (no-op) tier evaluations

// ── Frame-rate ceiling ────────────────────────────────────────────────
// QUALITY (what renders) is locked to ultra; CADENCE (how often) is capped
// here. Every subscriber is slow, decorative ambient motion — none of it is
// perceptibly better above 60fps. But a 120Hz phone with no ceiling runs the
// WHOLE engine (every tick, canvas redraw, CSS-var recalc, GL render, and the
// backdrop-filter re-blur each one triggers) at 120Hz, continuously, forever.
// That doubled-for-nothing spin is the dominant battery/heat cost — it makes a
// calm couples app draw power like a 3D game. 60fps halves it with zero visible
// change; reduced-motion / battery-saver drops to 30. Navigation smoothness is
// unaffected — route transitions are compositor/TransitionEngine-driven, not
// ticked here.
const FPS_NORMAL    = 60;
const FPS_REDUCED   = 30;        // prefers-reduced-motion / battery saver
// Process a frame once ~90% of the target interval has elapsed. The slack
// absorbs vsync jitter so a 120Hz panel cleanly lands on every-other-frame
// (true 60) instead of occasionally slipping to every-third (40).
const CAP_SLACK     = 0.9;

class AnimationEngineClass {
  private readonly subs = new Map<string, AnimationSubscriber>();
  private rafId = 0;
  private lastTs = 0;
  private running = false;
  private visListenerBound = false;
  private adaptLockUntil = 0;
  /** Global frame interval (ms). 1000/60 normally, 1000/30 under reduced-motion. */
  private targetInterval = 1000 / FPS_NORMAL;
  private rmListenerBound = false;
  /** Per-subscriber last-ticked timestamp — backs the optional `fps` cap. */
  private readonly subLastTs = new Map<string, number>();
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
    this._bindReducedMotion();
  }

  /**
   * Drop the frame ceiling to 30fps when the OS asks for reduced motion — which
   * Android/Chromium also reports when the system battery saver is on. This is
   * the user's own "calm it down / save power" signal, so we honour it for free.
   */
  private _bindReducedMotion(): void {
    if (this.rmListenerBound || typeof window === 'undefined' || !window.matchMedia) return;
    this.rmListenerBound = true;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      this.targetInterval = 1000 / (mq.matches ? FPS_REDUCED : FPS_NORMAL);
    };
    apply();
    // Safari <14 only supports the deprecated addListener signature.
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
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
    this.subLastTs.delete(id);
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

  private _publishTier(_tier: QualityTier): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.tier = 'ultra';
    }
  }

  private _adaptTier(_fps: number, _ts: number): void {
    // no-op: visuals are locked to 'ultra'. Quality never auto-downgrades by
    // device or fps — the heavy 3D blob is governed by the user's Settings
    // toggle instead (services/ambientPrefs.ts).
  }

  private readonly loop = (ts: number): void => {
    // Pause when tab is hidden — saves battery, avoids huge delta on resume
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.running = false;
      this.rafId = 0;
      return;
    }

    this.rafId = requestAnimationFrame(this.loop);

    // Global frame ceiling. rAF still fires at the panel's native rate, but we
    // only DO work once the target interval (60fps, or 30 under reduced-motion)
    // has elapsed. Skipped frames return here for the cost of two comparisons —
    // the expensive part (sub ticks, redraws, CSS recalcs, GL renders) is what
    // gets halved on a 120Hz device. lastTs is NOT advanced on a skip, so the
    // elapsed time accumulates until it crosses the threshold.
    const elapsed = ts - this.lastTs;
    if (elapsed < this.targetInterval * CAP_SLACK) return;

    const delta = Math.min(elapsed, 50);
    if (delta < 3) return; // skip duplicate callbacks from power-saving display
    this.lastTs = ts;

    // Record into ring buffer
    this.frameTimes[this.frameIdx & 127] = delta;
    this.frameIdx++;

    // Evaluate tier every N frames
    if (this.frameIdx % SAMPLE_EVERY === 0) {
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

      // Per-subscriber cadence cap (decorative ambient motion runs at fps ≤
      // the engine ceiling). tickDelta is the accumulated time since THIS
      // subscriber last ran, so its physics / wave phase advance correctly even
      // though it's ticked less often than the engine frame.
      let tickDelta = delta;
      if (sub.fps) {
        const last = this.subLastTs.get(sub.id);
        if (last !== undefined && (ts - last) < (1000 / sub.fps) * CAP_SLACK) continue;
        tickDelta = last === undefined ? delta : Math.min(ts - last, 50);
        this.subLastTs.set(sub.id, ts);
      }

      if (trackCost) {
        const t0 = performance.now();
        sub.tick(tickDelta, ts, this.tier);
        this.costs.set(sub.id, performance.now() - t0);
      } else {
        sub.tick(tickDelta, ts, this.tier);
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

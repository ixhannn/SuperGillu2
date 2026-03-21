/**
 * PerformanceManager — Device capability detection + real-time fps monitoring
 *
 * Detects device tier on load:
 *   Tier 1: Full 120fps (iPhone 13 Pro+, Pixel 7+, Samsung S22+)
 *   Tier 2: Optimized 60fps (mid-range devices)
 *   Tier 3: Minimal (low-end, prefers-reduced-motion)
 *
 * Monitors live fps and auto-downgrades if sustained drops detected.
 * All effect modules read from this singleton to decide quality levels.
 */

export type DeviceTier = 1 | 2 | 3;

class PerformanceManagerClass {
  tier: DeviceTier = 2;
  currentFps: number = 60;
  reducedMotion: boolean = false;

  /* Internal tracking */
  private _frames: number[] = [];
  private _rafId: number = 0;
  private _lastTime: number = 0;
  private _initialized: boolean = false;
  private _downgradeTimeout: number = 0;
  private _listeners: Set<(tier: DeviceTier) => void> = new Set();

  /** Call once on app mount */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    /* Detect prefers-reduced-motion immediately */
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
      if (e.matches) this._setTier(3);
    });

    if (this.reducedMotion) {
      this.tier = 3;
      return;
    }

    /* Detect device capability */
    this.tier = this._detectTier();

    /* Start fps monitoring loop */
    this._lastTime = performance.now();
    this._monitorFps();
  }

  /** Register callback for tier changes (auto-downgrade/upgrade) */
  onTierChange(fn: (tier: DeviceTier) => void) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** How many particles should the current tier render */
  get particleCount(): number {
    if (this.tier === 1) return 200;
    if (this.tier === 2) return 60;
    return 0; /* Tier 3: no particles */
  }

  /** Should we run WebGL effects? */
  get useWebGL(): boolean {
    return this.tier <= 2;
  }

  /** Should we run Canvas particle/ripple effects? */
  get useCanvas(): boolean {
    return this.tier <= 2;
  }

  /** Should we show chromatic aberration on scroll? */
  get useChromaticAberration(): boolean {
    return this.tier === 1;
  }

  /** Should we use full entrance choreography? */
  get useEntranceChoreography(): boolean {
    return this.tier <= 2;
  }

  destroy() {
    cancelAnimationFrame(this._rafId);
    this._initialized = false;
  }

  /* ─── Private ─── */

  private _detectTier(): DeviceTier {
    const memory = (navigator as any).deviceMemory || 4; /* Default 4GB if unsupported */
    const cores = navigator.hardwareConcurrency || 4;
    const screenRefresh = this._estimateRefreshRate();

    /* High-end: lots of memory, cores, and likely high refresh */
    if (memory >= 4 && cores >= 6) return 1;
    if (memory >= 2 && cores >= 4) return 2;
    return 3;
  }

  private _estimateRefreshRate(): number {
    /* We can't reliably measure refresh rate synchronously.
       Return 60 as default; the fps monitor will upgrade if we detect 120. */
    return 60;
  }

  private _monitorFps() {
    const now = performance.now();
    const delta = now - this._lastTime;
    this._lastTime = now;

    if (delta > 0) {
      const fps = 1000 / delta;
      this._frames.push(fps);

      /* Keep a rolling window of ~120 frames (~1-2 seconds) */
      if (this._frames.length > 120) this._frames.shift();

      /* Calculate average fps every 60 frames */
      if (this._frames.length % 60 === 0) {
        const avg = this._frames.reduce((a, b) => a + b, 0) / this._frames.length;
        this.currentFps = Math.round(avg);

        /* Auto-detect 120hz display */
        if (avg > 100 && this.tier === 2) {
          const memory = (navigator as any).deviceMemory || 4;
          if (memory >= 4) this._setTier(1);
        }

        /* Auto-downgrade: sustained drops below threshold */
        if (this.tier === 1 && avg < 80) {
          this._downgradeTimeout++;
          if (this._downgradeTimeout > 3) { /* 3 consecutive checks */
            this._setTier(2);
            this._downgradeTimeout = 0;
          }
        } else {
          this._downgradeTimeout = 0;
        }
      }
    }

    this._rafId = requestAnimationFrame(() => this._monitorFps());
  }

  private _setTier(tier: DeviceTier) {
    if (this.tier === tier) return;
    this.tier = tier;
    this._listeners.forEach(fn => fn(tier));
  }
}

/** Singleton — import and use everywhere */
export const PerformanceManager = new PerformanceManagerClass();

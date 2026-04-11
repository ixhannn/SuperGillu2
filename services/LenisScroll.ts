/**
 * LenisScroll — Singleton smooth-scroll service.
 *
 * Owns ONE Lenis instance bound to the main scroll container.
 * Ticked by AnimationEngine (not its own RAF) so scroll interpolation
 * stays in sync with every other animation subscriber.
 *
 * Lenis version: 1.3.x
 *   - syncTouch: false  → smooth touch (lerp applied to touch input)
 *   - duration: 1.2s    → easing curve duration (overrides lerp)
 *   - easing: exponential ease-out — the "weighted, physical" feel
 *   - touchMultiplier: 1.8 → amplify touch velocity for mobile weight
 *
 * Inner scrollers opt out via data-lenis-prevent (handled natively by Lenis).
 * Those containers use native overscroll with contain so they don't bleed.
 */

import Lenis from 'lenis';
import { AnimationEngine } from '../utils/AnimationEngine';

class LenisScrollService {
  private _lenis: Lenis | null = null;
  private _initialized = false;
  private _wrapper: HTMLElement | null = null;

  /**
   * Call once in Layout after the wrapper and content elements mount.
   *
   * @param wrapper  — The clipping element (overflow: hidden, fills viewport height)
   * @param content  — The element Lenis translates (contains all page children)
   */
  init(wrapper: HTMLElement, content: HTMLElement): void {
    if (this._initialized) this.destroy();

    this._wrapper = wrapper;
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: wrapper,

      // Responsive, lower-latency smoothing.
      smoothWheel: !prefersReducedMotion,
      lerp: prefersReducedMotion ? 1 : 0.12,
      syncTouch: !prefersReducedMotion,
      syncTouchLerp: 0.14,
      touchInertiaExponent: 1.8,
      touchMultiplier: 1,
      wheelMultiplier: 0.95,

      infinite: false,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      overscroll: true,

      // Prevent Lenis from handling scroll inside nested native scrollers.
      // Elements with data-lenis-prevent are passed through to native scroll.
      // (Lenis 1.3 checks data-lenis-prevent natively — no custom function needed)
    });

    // Register with AnimationEngine — single RAF loop owns all ticking.
    AnimationEngine.register({
      id:       'lenis-scroll',
      priority: 9,           // just below CSS bus (10), above all effects
      budgetMs: 1.5,
      minTier:  'css-only',  // scroll must work even in degraded modes

      tick(_delta, ts) {
        // Lenis.raf() takes the rAF timestamp (ms since page load), not delta
        LenisScrollService._instanceStatic?.raf(ts);
      },
    });

    // Expose static ref for the tick closure above
    LenisScrollService._instanceStatic = this._lenis;
    this._lenis.resize();
    this._initialized = true;
  }

  // Static ref used inside the AnimationEngine tick closure
  static _instanceStatic: Lenis | null = null;

  destroy(): void {
    AnimationEngine.unregister('lenis-scroll');
    this._lenis?.destroy();
    this._lenis = null;
    this._wrapper = null;
    LenisScrollService._instanceStatic = null;
    this._initialized = false;
  }

  // ── Scroll position API ──────────────────────────────────────────────────

  /**
   * Current animated scroll position (what's visible on screen right now).
   * Use this to save scroll position before a view transition.
   */
  get scroll(): number {
    return this._lenis?.scroll ?? this._wrapper?.scrollTop ?? 0;
  }

  /**
   * Target scroll position (where scroll is heading).
   */
  get targetScroll(): number {
    return this._lenis?.targetScroll ?? this._wrapper?.scrollTop ?? 0;
  }

  /**
   * Scroll to a position.
   * immediate: true → jump instantly (no animation), used for view restoration.
   */
  scrollTo(y: number, options: { immediate?: boolean; duration?: number } = {}): void {
    if (!this._lenis) {
      this._wrapper?.scrollTo({
        top: y,
        behavior: options.immediate ? 'auto' : 'smooth',
      });
      return;
    }

    this._lenis.scrollTo(y, {
      immediate: options.immediate ?? false,
      duration:  options.duration,
      force:     options.immediate, // force overrides current animation
    });
  }

  /**
   * Access the raw Lenis instance (e.g. to attach scroll event listeners).
   */
  get instance(): Lenis | null {
    return this._lenis;
  }

  get isReady(): boolean {
    return this._initialized && this._lenis !== null;
  }
}

export const LenisScroll = new LenisScrollService();

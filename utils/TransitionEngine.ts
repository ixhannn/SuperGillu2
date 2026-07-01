/**
 * TransitionEngine — native-grade view transition system.
 *
 * Two distinct flows:
 *   • programmatic  — navigate(dir, commit): clone outgoing page, commit React,
 *                     double-rAF CSS transition. Zero Framer Motion.
 *   • gesture-back  — 1:1 finger tracking on left-edge swipe. Exit animation
 *                     fires the 'te:gesture-back' custom event so App.tsx can
 *                     call flushSync directly without invoking navigate().
 *
 * All timing values are named constants at the top.
 * Zero runtime dependencies — pure DOM + CSS transitions.
 * prefers-reduced-motion → instant opacity crossfade.
 */

// ─── Timing (ms) ──────────────────────────────────────────────────────────────
export const T_TAB          = 240;
export const T_PUSH         = 360;
export const T_POP          = 260;
export const T_MODAL_OPEN   = 380;
export const T_MODAL_CLOSE  = 240;

// ─── Easing ───────────────────────────────────────────────────────────────────
const E_SILK     = 'cubic-bezier(0.16, 1, 0.3, 1)';
const E_STANDARD = 'cubic-bezier(0.22, 1, 0.36, 1)';
const E_EXIT     = 'cubic-bezier(0.4, 0, 0.2, 1)';

// Fluid spring (CSS linear() easing) — a damped spring sampled to 21 points, with
// a small, refined overshoot-and-settle (peak ~1.037). This is the "alive" curve
// a flat tween can't express: the page grows from the tapped tile, drifts just
// past rest, then settles. Used for OPEN/CLOSE so the route motion reads like a
// spring instead of a tween. It stays purely on transform + opacity, so it is
// compositor-only; and being a sampled linear() ramp (not an overshoot bezier),
// it satisfies the refined-curve motion guard.
const E_SPRING_LINEAR = 'linear(0,0.018,0.072,0.158,0.273,0.412,0.557,0.692,0.802,0.886,0.945,0.984,1.011,1.028,1.037,1.036,1.029,1.019,1.01,1.004,1)';

// CSS linear() easing only shipped in Chromium 126 (mid-2024). Navigation runs in
// Android System WebView, which can lag well behind on un-updated devices; there,
// an unsupported linear() value is silently ignored and the transition falls back
// to the UA default 'ease' — the spring's settle is lost and route open/close
// reads flat. Feature-detect once at module load (testing the exact multi-stop
// value, so a partial impl that rejects it also degrades) and fall back to the
// app's premium silk decelerate (E_SILK, already used for tab/modal) rather than
// bare 'ease'. Modern WebViews — the vast majority — keep the full spring.
const supportsLinearEasing = (): boolean => {
  try {
    return typeof CSS !== 'undefined'
      && typeof CSS.supports === 'function'
      && CSS.supports('transition-timing-function', E_SPRING_LINEAR);
  } catch {
    return false;
  }
};

const E_SPRING = supportsLinearEasing() ? E_SPRING_LINEAR : E_SILK;

// Close collapse — a gentle accelerate that lets the leaving page fall away
// cleanly while the screen beneath settles in on the spring. No overshoot on the
// thing being dismissed (a dismiss shouldn't spring back), just a soft start.
const E_COLLAPSE = 'cubic-bezier(0.32, 0, 0.67, 0.25)';

// ─── Gesture constants ─────────────────────────────────────────────────────────
const CLAIM_PX    = 10;    // px before axis lock
const EDGE_PX     = 28;    // left-edge zone that starts back gesture
const VEL_WIN_MS  = 80;    // rolling velocity window
const COMMIT_VEL  = 0.35;  // px/ms to auto-commit
const COMMIT_FRAC = 0.38;  // fraction of screen width to auto-commit

export type EngineDirection = 'tab' | 'push' | 'pop' | 'modal' | 'modal-close' | 'expand';

/** Geometry of a tapped tile, captured by useTileOpen for the container morph. */
export interface MorphOrigin {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: string;
  bg: string;
}

// ─── Config per direction ──────────────────────────────────────────────────────
interface DirConfig {
  dur:     number;
  inEase:  string;
  outEase: string;
  inFrom:  [string, string];   // [transform, opacity]
  outTo:   [string, string];
}

function dirConfig(dir: EngineDirection, _W: number): DirConfig {
  const ty = (p: string, sc = 1) => `translate3d(0,${p},0) scale(${sc})`;

  // This JS-clone path is now the PRIMARY route animator (the View Transitions
  // API is disabled because it snapshotted the fixed background). The outgoing
  // page is cloned ON TOP: "forward" motions recede + fade the old layer to
  // reveal the new sliding in beneath; "back" motions slide the opaque old
  // layer off to reveal the screen beneath. Tuned for a premium "arrive &
  // settle" open and a clean slide-off close, over the still background.
  switch (dir) {
    case 'tab':
      return { dur: T_TAB,  inEase: E_SILK, outEase: E_SILK,
        inFrom: [ty('14px', 0.985),  '0'],
        outTo:  [ty('-10px', 1.008), '0'] };
    case 'push':
      // OPEN: the new page BLOOMS into place on the SPRING — scales up from 94%
      // + fades in with the alive settle, while the outgoing page (cloned on top)
      // recedes to 105% + fades out. No sideways slide, no clip window that would
      // expose the shared background; content morphs in place over the STILL bg.
      return { dur: 460, inEase: E_SPRING, outEase: E_SILK,
        // Incoming opacity stays 1: only the opaque CLONE fades out on top. If the
        // new page itself fades 0→1, its live backdrop-filter glass sits under a
        // fractional-opacity ancestor for the whole animation and boils on WebView
        // (the reported "whole opened page flickers"). The clone IS the crossfade.
        inFrom: ['scale(0.94)', '1'],
        outTo:  ['scale(1.05)', '0'] };
    case 'pop':
      // CLOSE: the leaving page (cloned on top) collapses back + fades out on the
      // gentle accelerate (E_COLLAPSE — clean, no overshoot on a dismiss) while the
      // screen beneath returns from 103% + fades in and SETTLES on the spring. The
      // settle-in is what makes the close feel finished instead of abrupt.
      return { dur: 340, inEase: E_SPRING, outEase: E_COLLAPSE,
        // Reveal the destination at full opacity (only the leaving clone fades) so
        // its backdrop-filter glass never sits under a fractional-opacity group.
        inFrom: ['scale(1.03)', '1'],
        outTo:  ['scale(0.93)', '0'] };
    case 'modal':
      return { dur: T_MODAL_OPEN,  inEase: E_SILK, outEase: E_STANDARD,
        inFrom: [ty('100%', 1),      '1'],
        outTo:  [ty('-1.2%', 0.97),  '0'] };
    case 'modal-close':
      return { dur: T_MODAL_CLOSE, inEase: E_SILK, outEase: E_EXIT,
        inFrom: [ty('-1.2%', 0.97),  '0.9'],
        outTo:  [ty('100%', 1),      '1'] };
    case 'expand':
      // Tile-open bloom — the headline morph. _run sets transform-origin to the
      // tapped tile's centre (--lior-open-x/y) so the new page grows OUT OF the
      // card the finger touched, and the SPRING gives it the alive grow-and-settle
      // the flat tween lacked. Scale starts at 91% (a touch deeper than push, so
      // the grow-from-tile reads) — the background recede (html[data-nav-depth])
      // dims the stage behind during the bloom, so the small edge gap reads as the
      // page lifting forward, not as a bare-background flash. Longer dur lets the
      // spring's settle play out.
      return { dur: 520, inEase: E_SPRING, outEase: E_SILK,
        // Incoming opacity 1 (only the clone fades): the bloom is the scale-up +
        // the clone dissolving over it. Fading the live-glass page 0→1 was the
        // primary cause of the whole-page open flicker on WebView.
        inFrom: ['scale(0.91)', '1'],
        outTo:  ['scale(1.06)', '0'] };
  }
}

// ─── Engine ────────────────────────────────────────────────────────────────────

class TransitionEngineImpl {
  private _c:    HTMLElement | null = null;  // animated container
  private _busy  = false;
  private _init  = false;
  private _mo    = false;  // prefers-reduced-motion

  // Gesture state
  private _pid:     number | null = null;
  private _startX   = 0;
  private _startY   = 0;
  private _curX     = 0;
  private _axis:    'x' | null = null;
  private _live     = false;  // axis locked + tracking
  private _vSamples: { x: number; t: number }[] = [];
  private _prefired = false;

  private _prefetchCbs: ((dst: string) => void)[] = [];

  // Tapped-tile geometry for the next container-morph open (set by useTileOpen,
  // consumed once by navigate()).
  private _morphOrigin: MorphOrigin | null = null;

  // Rect + radius of the most-recently-tapped interactive element, captured
  // globally so ANY tile/button open can clip-reveal from where the finger
  // landed. Consumed (and expired after 700ms) by navigate().
  private _tapOrigin: { x: number; y: number; w: number; h: number; radius: string; t: number } | null = null;

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Call once. Registers global gesture listeners and stores the animated element. */
  init(container: HTMLElement): void {
    this._c = container;
    if (this._init) return;
    this._init = true;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._mo = mq.matches;
    mq.addEventListener('change', e => { this._mo = e.matches; });

    window.addEventListener('pointerdown',   this._pd, { passive: true });
    window.addEventListener('pointermove',   this._pm, { passive: false });
    window.addEventListener('pointerup',     this._pu, { passive: true });
    window.addEventListener('pointercancel', this._pc, { passive: true });
    // Capture where the finger landed so an ensuing page-open can clip-reveal
    // from that element. Capture phase + passive so it never blocks anything.
    window.addEventListener('pointerdown', this._captureTap, { passive: true, capture: true });
  }

  /** Hot-swap container when the DOM element changes (e.g. re-mount). */
  setContainer(container: HTMLElement): void { this._c = container; }

  /**
   * The last-tapped control's rect (captured by _captureTap), if fresh — lets
   * in-place overlays (dialogs, detail viewers) grow OUT OF the control that
   * opened them, the same way route opens now bloom from the tapped tile/button.
   * Non-consuming (several overlays may read one tap); freshness-guarded so a
   * stale tap never anchors an unrelated later surface.
   */
  peekTapOrigin(maxAgeMs = 1500): { x: number; y: number; w: number; h: number } | null {
    const o = this._tapOrigin;
    return o && (performance.now() - o.t) < maxAgeMs
      ? { x: o.x, y: o.y, w: o.w, h: o.h }
      : null;
  }

  /** Stash the tapped tile's geometry; the next 'expand' navigation morphs from it. */
  setMorphOrigin(origin: MorphOrigin): void { this._morphOrigin = origin; }

  /**
   * Programmatic navigation. Clones outgoing, commits React, double-rAF CSS transition.
   * `commit` must call flushSync internally to make React render synchronously.
   *
   * Returns false WITHOUT calling commit/onComplete when a transition is
   * already running — the caller must handle the refusal (commit by other
   * means) or its navigation state will never advance.
   */
  navigate(
    dir: EngineDirection,
    commit: () => void,
    onComplete?: () => void,
  ): boolean {
    if (this._busy) return false;
    this._busy = true;
    this._setTransitioning(true);

    // Tile-open upgrade: useTileOpen() flags a pending "expand" (bloom from the
    // tapped tile). Consume the flag here and upgrade a plain push into expand.
    let effectiveDir = dir;
    if (typeof document !== 'undefined') {
      const de = document.documentElement;
      if (de.dataset.liorOpenExpand === '1' && dir === 'push') effectiveDir = 'expand';
      if (de.dataset.liorOpenExpand) delete de.dataset.liorOpenExpand;
    }
    // Bloom from the tapped CONTROL, not just bento tiles. Any push triggered by
    // a recent tap (Sync pill, settings row, action button, …) grows out of the
    // control the finger landed on. _captureTap already recorded its rect; publish
    // its centre as the same --lior-open-x/y vars useTileOpen uses, then upgrade
    // to expand so _run blooms from there. Fresh-tap only (<700ms): a programmatic
    // nav with no recent tap stays a centre push.
    if (
      effectiveDir === 'push' &&
      typeof document !== 'undefined' &&
      this._tapOrigin != null &&
      (performance.now() - this._tapOrigin.t) < 700
    ) {
      const o = this._tapOrigin;
      const s = document.documentElement.style;
      s.setProperty('--lior-open-x', `${Math.round(o.x + o.w / 2)}px`);
      s.setProperty('--lior-open-y', `${Math.round(o.y + o.h / 2)}px`);
      this._tapOrigin = null; // consume so a later programmatic nav re-centres
      effectiveDir = 'expand';
    }

    // Background depth recede: a page OPEN/CLOSE drops the whole ambient
    // background back (dim + slight scale) so the page comes forward — CSS reads
    // html[data-nav-depth] (see styles/root-fixes.css). Tab switches
    // deliberately never set it, so the persistent stage stays put when moving
    // between root tabs. Gated behind !_mo so reduced-motion users get a still
    // background (a depth-zoom on every open is exactly the vestibular trigger
    // they opted out of). Cleared in wrappedComplete once the nav settles.
    const navDepth = !this._mo &&
      (effectiveDir === 'push' || effectiveDir === 'pop' || effectiveDir === 'expand');
    if (navDepth && typeof document !== 'undefined') {
      document.documentElement.dataset.navDepth = '1';
    }

    const wrappedComplete = () => {
      this._busy = false;
      this._setTransitioning(false);
      if (navDepth && typeof document !== 'undefined') {
        delete document.documentElement.dataset.navDepth;
      }
      onComplete?.();
    };

    const c = this._c;
    if (!c) { commit(); wrappedComplete(); return true; }

    if (this._mo) {
      this._xfade(c, commit, wrappedComplete);
      return true;
    }

    // OPEN / CLOSE → content BLOOM over the STILL background, via _run below.
    // A clip-path morph was tried and rejected on camera: Lior's pages are
    // transparent surfaces over ONE shared background world, so growing a clip
    // window just exposed that bright background as a pink "blob flash" for most
    // of the animation — it never read as content expanding. Sideways slides
    // were rejected too. _run instead cross-dissolves the page CONTENT with a
    // subtle scale (blooming from the tapped tile's origin on `expand`, centre
    // otherwise) and never touches the live background, so nothing blobs.

    // ── Native View Transitions API (Chromium 111+) ─────────────────────────
    // Lets the COMPOSITOR thread snapshot the old/new DOM. No JS cloneNode,
    // no fixed-position duplicate layer, no double-rAF dance. The browser
    // handles the crossfade + custom CSS keyframes we declare in :root.
    // Massive paint-cost reduction on Android Chrome — the most common
    // mobile target for this app.
    const docAny = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    if (typeof docAny.startViewTransition === 'function' && this._supportsVT) {
      this._runNativeVT(docAny, effectiveDir, commit, wrappedComplete);
      return true;
    }

    this._run(c, effectiveDir, commit, wrappedComplete);
    return true;
  }

  /**
   * Native View Transitions path — DISABLED.
   *
   * The VT API snapshots the WHOLE document root (::view-transition-old/new(root)),
   * which includes the FIXED AmbientVisuals WebGL background. Animating `root`
   * therefore slid/zoomed the entire background on every push/pop/expand — the
   * "stage" lurched along with the content, which reads as broken, "very bad"
   * motion (and violates "the background is the stage"). The JS path (_run)
   * below animates ONLY the content container (this._c); the live background is
   * never snapshotted and stays put. Re-enable only alongside a per-element
   * `view-transition-name` strategy that pins the background out of the snapshot.
   */
  private _supportsVT = false;

  private _runNativeVT(
    docAny: Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } },
    dir: EngineDirection,
    commit: () => void,
    done: () => void,
  ): void {
    // Tag the document so our CSS keyframes scope to this transition.
    document.documentElement.dataset.vtDir = dir;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      delete document.documentElement.dataset.vtDir;
      done();
    };
    try {
      const vt = docAny.startViewTransition!(() => {
        // The browser runs this callback inside the transition's "snapshot
        // captured" phase. React commits synchronously here.
        commit();
      });
      // Watchdog: `finished` is the ONLY completion signal on this path, and
      // under main-thread/GPU starvation it can stall far past the CSS
      // duration — or never settle at all. `done` releases the navigation
      // lock, so a dead promise here freezes navigation permanently. By
      // dur+400ms the transition is visually over either way; skip whatever
      // remains and settle. settle() is idempotent, so whichever of the
      // watchdog / `finished` fires first wins and the other no-ops.
      const dur = dirConfig(dir, window.innerWidth).dur;
      const watchdog = window.setTimeout(() => {
        try {
          (vt as { skipTransition?: () => void }).skipTransition?.();
        } catch (_) { /* already finished */ }
        settle();
      }, dur + 400);
      vt.finished.finally(() => {
        window.clearTimeout(watchdog);
        settle();
      });
    } catch (_) {
      // If the API throws (e.g. nested transitions), fall back to the JS path.
      delete document.documentElement.dataset.vtDir;
      const c = this._c;
      if (c) this._run(c, dir, commit, done); else { commit(); done(); }
    }
  }

  /**
   * Sets `data-transitioning` on <html>. Heavy ambient layers (R3F canvases,
   * particle systems, blur overlays) read this and skip work — gives the
   * tab-switch transition the entire GPU/CPU budget so it lands at 90+fps
   * even on mid-range Android.
   */
  private _setTransitioning(active: boolean): void {
    if (typeof document === 'undefined') return;
    if (active) {
      document.documentElement.dataset.transitioning = '1';
    } else {
      delete document.documentElement.dataset.transitioning;
    }
  }

  /** Register a listener called on touchstart of a predictable destination. */
  onPrefetch(fn: (dst: string) => void): () => void {
    this._prefetchCbs.push(fn);
    return () => { this._prefetchCbs = this._prefetchCbs.filter(f => f !== fn); };
  }

  // ── Cross-fade (reduced motion) ───────────────────────────────────────────

  private _xfade(c: HTMLElement, commit: () => void, done?: () => void): void {
    c.style.transition = 'opacity 0.15s linear';
    c.style.opacity    = '0';
    requestAnimationFrame(() => {
      commit();
      requestAnimationFrame(() => {
        c.style.opacity = '1';
        const cleanup = () => {
          c.style.transition = '';
          c.style.opacity    = '';
          this._busy = false;
          done?.();
        };
        c.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 220);
      });
    });
  }

  // ── Paint-ready gate ───────────────────────────────────────────────────────

  /**
   * Resolve once the freshly-committed destination has actually PAINTED real
   * content — not merely the two frames the browser needs to paint the
   * pre-positioned (scale + opacity:0) initial state.
   *
   * Why this exists: _run() used to start the outgoing clone's opacity fade-out
   * after a bare double-rAF (~33ms). On a lazy/async/cache-cold page the incoming
   * container was still empty at that point, and since every Lior page is a
   * transparent surface over ONE shared ambient world, the clone disappearing
   * over an empty page let the raw background bleed through for the whole
   * animation — and the bloom "morphed" over nothing. We instead keep the opaque
   * clone in place until the destination's active content layer has laid out,
   * then cross-fade over real pixels.
   *
   * Hard frame cap so a genuinely slow/stuck page can NEVER wedge the navigation
   * lock — we always proceed by MAX_PAINT_FRAMES regardless.
   */
  private _whenPainted(c: HTMLElement, run: () => void): void {
    const MIN_FRAMES = 2;         // preserve the original paint-the-initial-state gap
    const MAX_PAINT_FRAMES = 12;  // ~200ms ceiling (was 8). A cold/first-visit page
                                  // (freshly-mounted tab) can't lay out in 8 frames,
                                  // so the gate gave up and revealed it half-empty.
                                  // Holds the opaque outgoing snapshot a touch longer
                                  // — the old page stays put, which reads as "loading",
                                  // never as a blank flash.

    // The committed destination is either the page overlay (non-tab views mount
    // as a distinct __overlay__ layer) or the now-active keep-alive tab shell.
    const contentLayer = (): HTMLElement | null =>
      (c.querySelector('[data-keep-alive-tab="__overlay__"]') as HTMLElement | null)
      ?? (c.querySelector('.keep-alive-shell.is-active') as HTMLElement | null);

    const hasPaintedContent = (): boolean => {
      const el = contentLayer();
      // Real content has laid out (a non-trivial box with at least one child) vs.
      // an empty shell that would reveal the bare background beneath the fade.
      return !!el && el.childElementCount > 0 && el.getBoundingClientRect().height > 4;
    };

    let frame = 0;
    const tick = (): void => {
      frame += 1;
      if (frame >= MIN_FRAMES && (hasPaintedContent() || frame >= MAX_PAINT_FRAMES)) {
        // Content is LAID OUT — but layout is not paint. Uncovering it now let the
        // clone fade reveal a laid-out-but-not-yet-rasterized page for a frame or
        // two, so the shared ambient background showed through and the real content
        // then "popped in" (the reveal-then-pop seen on device). Wait two more
        // frames so the browser actually paints the pixels before we cross-fade.
        requestAnimationFrame(() => requestAnimationFrame(run));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Core programmatic transition ──────────────────────────────────────────

  private _run(
    c: HTMLElement,
    dir: EngineDirection,
    commit: () => void,
    done?: () => void,
  ): void {
    const W   = window.innerWidth;
    const cfg = dirConfig(dir, W);

    // ① Snapshot outgoing page.
    // Clone ONLY the visible (active) layer, not the whole shell container. The
    // container holds every mounted keep-alive tab; cached tabs are
    // `display:none` but `cloneNode(true)` still deep-copies their
    // multi-thousand-node React trees — a synchronous allocation that grows with
    // every tab ever visited and is the hitch felt right before the bloom. We
    // shallow-clone the container (preserving its box) and graft a deep clone of
    // just the one `.is-active` layer (the active tab, or the page overlay), so
    // the snapshot is visually identical with a fraction of the node count.
    // Falls back to the full clone if no active layer resolves.
    const activeLayer = c.querySelector('.keep-alive-shell.is-active');
    let clone: HTMLElement;
    if (activeLayer) {
      clone = c.cloneNode(false) as HTMLElement;
      clone.appendChild(activeLayer.cloneNode(true));
    } else {
      clone = c.cloneNode(true) as HTMLElement;
    }
    const rect  = c.getBoundingClientRect();
    clone.setAttribute('aria-hidden', 'true');
    clone.style.cssText = [
      'position:fixed',
      `top:${rect.top}px`,
      `left:${rect.left}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'z-index:9998',
      'pointer-events:none',
      'will-change:transform,opacity',
      'overflow:hidden',
      // NOTE: deliberately NO `backface-visibility:hidden` / `contain:paint`
      // here. The clone already composites on its own layer via will-change +
      // its animated transform/opacity; those two extra hints only forced
      // additional redundant backing-texture allocation for a viewport-sized
      // fixed layer on EVERY push/pop/expand — a per-nav GPU spike that, on a
      // memory-bound Android WebView, evicts other on-screen layers (they blank
      // for a frame then re-rasterize = the "element vanishes on exit" flash).
    ].join(';');
    document.body.appendChild(clone);

    // ② Pre-position incoming container at initial state (no transition)
    c.style.transition = 'none';
    c.style.willChange = 'transform,opacity';
    // Tile-open "expand": bloom the new content FROM the tapped tile's centre
    // (--lior-open-x/y, set in viewport px by useTileOpen) instead of from the
    // container centre — translated into this container's local box so the page
    // grows out of the card the user actually touched.
    if (dir === 'expand') {
      const rootStyle = getComputedStyle(document.documentElement);
      const ox = parseFloat(rootStyle.getPropertyValue('--lior-open-x'));
      const oy = parseFloat(rootStyle.getPropertyValue('--lior-open-y'));
      c.style.transformOrigin = (!Number.isNaN(ox) && !Number.isNaN(oy))
        ? `${ox - rect.left}px ${oy - rect.top}px`
        : '50% 35%';
    }
    c.style.transform  = cfg.inFrom[0];
    c.style.opacity    = cfg.inFrom[1];

    // ③ Commit React synchronously
    commit();

    // ④ Hold the opaque outgoing clone until the freshly-committed destination
    //    has actually PAINTED real content (not just the 2 frames the browser
    //    needs to paint the pre-positioned scale+opacity:0 state), then start the
    //    cross-fade over real pixels. Without this gate the clone's opacity
    //    fade-out began after a bare double-rAF while the incoming lazy/async page
    //    was still empty, so the shared ambient background bled through for the
    //    whole animation and the bloom played over nothing.
    this._whenPainted(c, () => {
      // Animate clone out
      const t = `${cfg.dur}ms`;
      clone.style.transition = `transform ${t} ${cfg.outEase}, opacity ${t} ${cfg.outEase}`;
      clone.style.transform  = cfg.outTo[0];
      clone.style.opacity    = cfg.outTo[1];

      // Animate container to identity
      c.style.transition = `transform ${t} ${cfg.inEase}, opacity ${t} ${cfg.inEase}`;
      c.style.transform  = 'translateZ(0) scale(1)';
      c.style.opacity    = '1';

      const cleanup = () => {
        clone.remove();
        c.style.transition = '';
        c.style.willChange = '';
        c.style.transformOrigin = '';
        if (c.style.transform === 'translateZ(0) scale(1)') c.style.transform = '';
        if (c.style.opacity   === '1')                       c.style.opacity   = '';
        this._busy = false;
        done?.();
      };
      const tid = window.setTimeout(cleanup, cfg.dur + 50);
      clone.addEventListener('transitionend', () => { clearTimeout(tid); cleanup(); }, { once: true });
    });
  }

  // ── Container morph (tile → page) ─────────────────────────────────────────

  /**
   * Tile-open container transform. A solid surface the size/shape/colour of the
   * tapped tile grows (GPU transform, WAAPI) from its exact rect to fill the
   * content area, then dissolves as the destination fades in beneath it. The
   * outgoing screen stays put behind the surface (no vanish-flash) and the fixed
   * background is never touched. Falls back to _run if geometry is unusable.
   */
  private _morph(c: HTMLElement, o: MorphOrigin, commit: () => void, done?: () => void): void {
    const full = c.getBoundingClientRect();
    if (full.width < 1 || full.height < 1 || o.w < 1 || o.h < 1) {
      this._run(c, 'expand', commit, done);
      return;
    }

    const DUR  = 440;
    const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

    // Opaque card-coloured surface — fall back to a warm sheet if the tile's own
    // background was transparent (e.g. a glass tile resolves to alpha 0).
    let bg = o.bg;
    if (!bg || bg === 'transparent' || /,\s*0(\.0+)?\)\s*$/.test(bg)) {
      bg = 'rgb(252, 249, 250)';
    }

    const surface = document.createElement('div');
    surface.setAttribute('aria-hidden', 'true');
    surface.style.cssText = [
      'position:fixed',
      `top:${full.top}px`,
      `left:${full.left}px`,
      `width:${full.width}px`,
      `height:${full.height}px`,
      `background:${bg}`,
      `border-radius:${o.radius && o.radius !== '0px' ? o.radius : '28px'}`,
      'z-index:9999',
      'pointer-events:none',
      'transform-origin:0 0',
      'will-change:transform,opacity',
      'box-shadow:0 30px 80px rgba(120,60,80,0.20)',
      'backface-visibility:hidden',
    ].join(';');
    document.body.appendChild(surface);

    // FLIP: full-size surface placed to start exactly over the tapped tile.
    const sx = o.w / full.width;
    const sy = o.h / full.height;
    const start = `translate(${o.x - full.left}px, ${o.y - full.top}px) scale(${sx}, ${sy})`;

    // Commit the destination, then hide ONLY the new overlay so the page fades
    // in beneath the growing surface — the outgoing screen stays visible behind
    // it, so nothing flashes out.
    commit();
    const overlay = c.querySelector('[data-keep-alive-tab="__overlay__"]') as HTMLElement | null;
    if (overlay) overlay.style.opacity = '0';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const surfAnim = surface.animate(
          [
            { transform: start, opacity: 1, offset: 0 },
            { opacity: 1, offset: 0.62 },
            { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 0, offset: 1 },
          ],
          { duration: DUR, easing: EASE, fill: 'forwards' },
        );
        // Destination solidifies behind the still-opaque surface, so it's fully
        // there by the time the surface dissolves to reveal it (no see-through).
        const overlayAnim = overlay
          ? overlay.animate(
              [{ opacity: 0 }, { opacity: 1 }],
              { duration: Math.round(DUR * 0.4), delay: Math.round(DUR * 0.05), easing: EASE, fill: 'forwards' },
            )
          : null;

        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          try { surface.remove(); } catch (_) { /* already gone */ }
          if (overlay) overlay.style.opacity = '';
          try { overlayAnim?.cancel(); } catch (_) { /* fine */ }
          done?.();
        };
        surfAnim.finished.then(cleanup).catch(cleanup);
        window.setTimeout(cleanup, DUR + 140);
      });
    });
  }

  // ── Clip-reveal open (tile/button → page) ─────────────────────────────────

  /** Records the tapped interactive element's geometry for clip-reveal opens. */
  private _captureTap = (e: PointerEvent): void => {
    // Don't force a layout/style read (getBoundingClientRect + getComputedStyle
    // below) while a route transition is animating — it stalls the main thread
    // mid clone-fade. A tap during a transition simply falls back to a
    // centre-origin morph on the next open, imperceptible against the slide.
    if (typeof document !== 'undefined' && document.documentElement.dataset.transitioning === '1') return;
    const el = (e.target as HTMLElement | null)?.closest?.(
      'button, [role="button"], a[href], .spring-press, [data-press], .bento-card, .aurora-card, [data-coachmark]',
    ) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return;
    let radius = '0px';
    try { radius = getComputedStyle(el).borderRadius || '0px'; } catch (_) { /* ignore */ }
    this._tapOrigin = { x: r.left, y: r.top, w: r.width, h: r.height, radius, t: performance.now() };
  };

  /**
   * The morph origin for the next open/close: the most-recent tap (with a 2.5s
   * freshness guard so a slow lazy-chunk load between tap and navigate doesn't
   * lose it) or, failing that, a small rect at screen centre. Always returns a
   * usable rect so opens/closes are ALWAYS a morph — never a fallback slide.
   */
  private _consumeOrigin(): { x: number; y: number; w: number; h: number; radius: string } {
    const o = this._tapOrigin;
    this._tapOrigin = null;
    if (o && (performance.now() - o.t) < 2500) {
      return { x: o.x, y: o.y, w: o.w, h: o.h, radius: o.radius };
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return { x: vw / 2 - 28, y: vh * 0.4, w: 56, h: 56, radius: '28px' };
  }

  /**
   * Reveal the new page through a rounded window that starts at the tapped
   * element's rect and expands (clip-path) to fill the screen — content at full
   * size throughout (no zoom), no slide, no fade. The screen being left is held
   * visible behind it so nothing flashes to bare background. GPU-composited
   * clip-path via WAAPI; the fixed ambient background is never touched.
   */
  private _clipReveal(
    c: HTMLElement,
    origin: { x: number; y: number; w: number; h: number; radius: string },
    commit: () => void,
    done?: () => void,
  ): void {
    // Hold the screen we're leaving (its keep-alive shell) visible behind the
    // reveal so the page opens OVER it, not over a flash of background.
    const prevShell = c.querySelector('.keep-alive-shell.is-active') as HTMLElement | null;

    commit();

    const overlay = c.querySelector('[data-keep-alive-tab="__overlay__"]') as HTMLElement | null;
    if (!overlay) {
      // No distinct page overlay to clip (destination is itself a tab) — settle
      // it in with a quick opacity rise instead.
      c.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 220, easing: E_SILK });
      done?.();
      return;
    }

    const prevOpacity = prevShell ? prevShell.style.opacity : '';
    const prevVis     = prevShell ? prevShell.style.visibility : '';
    if (prevShell) { prevShell.style.opacity = '1'; prevShell.style.visibility = 'visible'; }

    const oRect  = overlay.getBoundingClientRect();
    const top    = Math.max(0, Math.round(origin.y - oRect.top));
    const left   = Math.max(0, Math.round(origin.x - oRect.left));
    const right  = Math.max(0, Math.round(oRect.right  - (origin.x + origin.w)));
    const bottom = Math.max(0, Math.round(oRect.bottom - (origin.y + origin.h)));
    const radius = origin.radius && origin.radius !== '0px' ? origin.radius : '20px';
    const startClip = `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius})`;
    const endClip   = 'inset(0px 0px 0px 0px round 0px)';

    overlay.style.willChange = 'clip-path';
    const anim = overlay.animate(
      [{ clipPath: startClip }, { clipPath: endClip }],
      { duration: 440, easing: E_SILK, fill: 'both' },
    );

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      overlay.style.clipPath = '';   // fully unclipped before cancelling the fill
      overlay.style.willChange = '';
      try { anim.cancel(); } catch (_) { /* fine */ }
      if (prevShell) { prevShell.style.opacity = prevOpacity; prevShell.style.visibility = prevVis; }
      done?.();
    };
    anim.finished.then(cleanup).catch(cleanup);
    window.setTimeout(cleanup, 440 + 160);
  }

  /**
   * Close morph (mirror of _clipReveal): snapshot the page being left and clip
   * it DOWN into a window at the tapped point (or centre), revealing the screen
   * beneath — instead of sliding off sideways. The snapshot collapses ON TOP so
   * the destination (committed beneath) is uncovered as the snapshot shrinks.
   */
  private _clipCollapse(
    c: HTMLElement,
    origin: { x: number; y: number; w: number; h: number; radius: string },
    commit: () => void,
    done?: () => void,
  ): void {
    const overlay = c.querySelector('[data-keep-alive-tab="__overlay__"]') as HTMLElement | null;
    if (!overlay) {
      // Nothing distinct to collapse — settle the destination in.
      commit();
      c.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 200, easing: E_SILK });
      done?.();
      return;
    }

    const oRect = overlay.getBoundingClientRect();
    const clone = overlay.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    clone.style.cssText = [
      'position:fixed',
      `top:${oRect.top}px`, `left:${oRect.left}px`,
      `width:${oRect.width}px`, `height:${oRect.height}px`,
      'margin:0', 'z-index:9999', 'pointer-events:none',
      'will-change:clip-path,opacity', 'backface-visibility:hidden',
    ].join(';');
    document.body.appendChild(clone);

    commit();   // destination revealed beneath the collapsing snapshot

    const top    = Math.max(0, Math.round(origin.y - oRect.top));
    const left   = Math.max(0, Math.round(origin.x - oRect.left));
    const right  = Math.max(0, Math.round(oRect.right  - (origin.x + origin.w)));
    const bottom = Math.max(0, Math.round(oRect.bottom - (origin.y + origin.h)));
    const radius = origin.radius && origin.radius !== '0px' ? origin.radius : '20px';
    const endClip = `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius})`;

    const anim = clone.animate(
      [
        { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.7 },
        { clipPath: endClip, opacity: 0, offset: 1 },
      ],
      { duration: 320, easing: E_EXIT, fill: 'both' },
    );

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      try { clone.remove(); } catch (_) { /* gone */ }
      try { anim.cancel(); } catch (_) { /* fine */ }
      done?.();
    };
    anim.finished.then(cleanup).catch(cleanup);
    window.setTimeout(cleanup, 320 + 160);
  }

  // ── Gesture: pointerdown ─────────────────────────────────────────────────

  private _pd = (e: PointerEvent): void => {
    if (this._pid !== null || e.pointerType === 'mouse') return;
    if (e.clientX > EDGE_PX) return;          // only claim left-edge zone
    this._pid      = e.pointerId;
    this._startX   = e.clientX;
    this._startY   = e.clientY;
    this._curX     = e.clientX;
    this._axis     = null;
    this._live     = false;
    this._prefired = false;
    this._vSamples = [{ x: e.clientX, t: performance.now() }];
  };

  // ── Gesture: pointermove ─────────────────────────────────────────────────

  private _pm = (e: PointerEvent): void => {
    if (e.pointerId !== this._pid) return;

    const now = performance.now();
    const dx  = e.clientX - this._startX;
    const dy  = e.clientY - this._startY;

    // Rolling velocity window
    this._vSamples.push({ x: e.clientX, t: now });
    const cut = now - VEL_WIN_MS;
    while (this._vSamples.length > 1 && this._vSamples[0].t < cut) this._vSamples.shift();

    // Axis lock
    if (!this._axis) {
      if (Math.abs(dx) < CLAIM_PX && Math.abs(dy) < CLAIM_PX) return;
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) {
        this._axis = 'x';
      } else {
        this._pid = null; // vertical dominant → release to scroll
        return;
      }
    }

    if (dx <= 0) { this._pid = null; return; } // wrong direction

    // Prevent native scroll after we've claimed the axis
    try { e.preventDefault(); } catch (_) { /* may be passive */ }

    this._live = true;
    this._curX  = e.clientX;

    // Fire prefetch signal early
    if (!this._prefired && dx > 20) {
      this._prefired = true;
      for (const fn of this._prefetchCbs) fn('__back__');
    }

    // 1:1 live tracking
    const c = this._c;
    if (c && !this._busy) {
      c.style.transition = 'none';
      c.style.willChange = 'transform';
      c.style.transform  = `translate3d(${dx}px,0,0)`;
    }
  };

  // ── Gesture: pointerup ───────────────────────────────────────────────────

  private _pu = (e: PointerEvent): void => {
    if (e.pointerId !== this._pid) return;
    this._pid = null;
    if (!this._live) return;
    this._live = false;

    const c = this._c;
    if (!c) return;

    const dx = this._curX - this._startX;
    const W  = window.innerWidth;

    // Compute velocity from rolling window
    let vel = 0;
    if (this._vSamples.length >= 2) {
      const a = this._vSamples[0], b = this._vSamples[this._vSamples.length - 1];
      const dt = b.t - a.t;
      if (dt > 0) vel = (b.x - a.x) / dt;
    }

    const commit = vel > COMMIT_VEL || dx / W > COMMIT_FRAC;

    if (commit) {
      // Exit animation: current content flies off to the right
      const remain = Math.max(10, W - dx);
      const dur    = Math.max(80, Math.min(T_POP, remain / Math.max(vel, 0.3)));

      // Claim the navigation lock for the entire exit + fade-in. Without this a
      // tab tap / programmatic navigate() during the animation would pass the
      // `if (this._busy) return false` guard and fight this flow over the same
      // c.style.transform/opacity — leaving the container stuck at opacity:0.
      this._busy = true;
      this._setTransitioning(true);

      c.style.transition = `transform ${dur}ms ${E_STANDARD}`;
      c.style.transform  = `translate3d(${W}px,0,0)`;

      setTimeout(() => {
        // Container is now off-screen. Hide it instantly, snap position to 0.
        // Container is now off-screen. Snap it back to position at opacity:0,
        // but KEEP its will-change layer promoted — clearing it here tore down
        // the whole content layer's backing texture, forcing a from-scratch
        // re-rasterize when opacity rose again (part of the back-swipe flash).
        c.style.transition = 'none';
        c.style.transform  = '';
        c.style.opacity    = '0';

        // Fire 'te:gesture-back' — App.tsx calls flushSync(() => setState) directly.
        // TransitionEngine.navigate() is NOT called here; this is a separate flow.
        window.dispatchEvent(new CustomEvent('te:gesture-back'));

        // Hold opacity:0 only until the freshly-committed destination has
        // actually PAINTED real content, then fade in over real pixels. The old
        // bare double-rAF revealed the container after a fixed ~2 frames; on a
        // slow WebView commit the destination was still empty then, so the whole
        // content area sat transparent — the bare ambient background showing
        // through — for many frames = "the whole screen vanishes when I swipe
        // back". _whenPainted is hard-capped at 8 frames so it can never wedge
        // the navigation lock.
        this._whenPainted(c, () => {
          c.style.transition = `opacity 160ms ${E_STANDARD}`;
          c.style.opacity    = '1';
          const cleanup = () => {
            c.style.transition = '';
            c.style.opacity    = '';
            c.style.willChange = '';
            this._busy = false;
            this._setTransitioning(false);
          };
          c.addEventListener('transitionend', cleanup, { once: true });
          setTimeout(cleanup, 200);
        });
      }, dur + 16);

    } else {
      // Snap back to identity. Hold the navigation lock for the snap so a
      // concurrent navigate() can't fight this transform animation.
      this._busy = true;
      c.style.transition = `transform ${T_POP}ms ${E_STANDARD}`;
      c.style.transform  = 'translate3d(0,0,0)';
      const reset = () => {
        c.style.transition = '';
        c.style.transform  = '';
        c.style.willChange = '';
        this._busy = false;
      };
      c.addEventListener('transitionend', reset, { once: true });
      setTimeout(reset, T_POP + 32);
    }
  };

  // ── Gesture: pointercancel ───────────────────────────────────────────────

  private _pc = (e: PointerEvent): void => {
    if (e.pointerId !== this._pid) return;
    this._pid  = null;
    this._live = false;

    const c = this._c;
    if (!c) return;
    // Hold the navigation lock for the cancel snap-back so a concurrent
    // navigate() can't fight this transform animation.
    this._busy = true;
    c.style.transition = `transform ${T_POP}ms ${E_STANDARD}`;
    c.style.transform  = 'translate3d(0,0,0)';
    const reset = () => {
      c.style.transition = '';
      c.style.transform  = '';
      c.style.willChange = '';
      this._busy = false;
    };
    c.addEventListener('transitionend', reset, { once: true });
    setTimeout(reset, T_POP + 32);
  };
}

export const TransitionEngine = new TransitionEngineImpl();

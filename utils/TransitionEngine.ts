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

// Container-transform (tile → page) timings. The card you tapped GROWS into the
// page (open) and the page SHRINKS back into its tile (close) — the App-Store /
// Material container-transform pattern, tuned brisk.
const T_MORPH_GROW     = 340;  // tile rect → full screen
const T_MORPH_REVEAL   = 170;  // opaque surface dissolves over the painted page
const T_MORPH_SHRINK   = 300;  // full screen → tile rect
const T_MORPH_FADE     = 140;  // shrinking card's final fade (tail-overlapped)
// Apple's sheet curve — fast launch, long soft landing. No overshoot.
const E_MORPH = 'cubic-bezier(0.32, 0.72, 0, 1)';

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

  // This JS-clone path is the PRIMARY route animator (the View Transitions API
  // is disabled because it snapshotted the fixed background).
  //
  // OPEN/CLOSE are FAST OPAQUE SLIDES — the "deck of cards" model — after the
  // scale-bloom + clone-crossfade era proved structurally flash-prone on real
  // Android (2026-07-03 device frame captures): every Lior page is a
  // TRANSPARENT surface over one shared animated background, so any crossfade
  // has a mid-fade phase where BOTH layers are semi-transparent and the moving
  // ambient bleeds through — mistime the reveal by 2 frames on a slow paint and
  // it reads as a flash/flicker. Sliding sidesteps the whole failure class:
  //   • NEITHER layer ever animates opacity — both stay at 1 the entire time.
  //   • During data-transitioning the active shell (and its copy inside the
  //     clone) carries an opaque theme background (root-fixes.css paint-gap
  //     mask), so the two layers are solid surfaces: at every instant the
  //     screen is covered by old page ∪ new page. Nothing can bleed through,
  //     no matter how late the destination paints.
  //   • It's FAST — 300ms open / 260ms close instead of the 460-520ms bloom —
  //     and matches the gesture-back motion (page slides right), so forward
  //     and back are one coherent physical metaphor.
  //
  // Coverage-safety: the incoming layer starts at a small opposite-direction
  // offset and settles on E_SILK (which covers most of its distance in the
  // first ~40% of the duration), while the outgoing clone leaves on a
  // slow-start accelerate — so the outgoing edge never outruns the incoming
  // edge and the background can never peek between them.
  switch (dir) {
    case 'tab':
      return { dur: T_TAB,  inEase: E_SILK, outEase: E_SILK,
        inFrom: [ty('14px', 0.985),  '0'],
        outTo:  [ty('-10px', 1.008), '0'] };
    case 'push':
    case 'expand':
      // OPEN: the current page (cloned on top, full opacity) slides off LEFT —
      // forward motion — while the destination beneath settles in from a small
      // rightward offset. Reads as the old page peeling away to reveal the new
      // one already arriving. No scale, no fade, no crossfade → nothing to
      // mistime, nothing to flicker. ('expand' kept as an alias so useTileOpen's
      // upgrade path needs no changes; the tile press-lift still gives the
      // tactile origin cue.)
      return { dur: 300, inEase: E_SILK, outEase: 'cubic-bezier(0.5, 0, 0.28, 1)',
        inFrom: ['translate3d(56px,0,0)', '1'],
        outTo:  ['translate3d(-104%,0,0)', '1'] };
    case 'pop':
      // CLOSE: the leaving detail (cloned on top, full opacity) slides off
      // RIGHT — the exact mirror of open and the same motion as the interactive
      // edge-swipe back gesture — while the tab beneath settles from a small
      // leftward offset. Both layers opaque, no fades.
      return { dur: 260, inEase: E_SILK, outEase: 'cubic-bezier(0.5, 0, 0.28, 1)',
        inFrom: ['translate3d(-40px,0,0)', '1'],
        outTo:  ['translate3d(104%,0,0)', '1'] };
    case 'modal':
      return { dur: T_MODAL_OPEN,  inEase: E_SILK, outEase: E_STANDARD,
        inFrom: [ty('100%', 1),      '1'],
        outTo:  [ty('-1.2%', 0.97),  '0'] };
    case 'modal-close':
      return { dur: T_MODAL_CLOSE, inEase: E_SILK, outEase: E_EXIT,
        inFrom: [ty('-1.2%', 0.97),  '0.9'],
        outTo:  [ty('100%', 1),      '1'] };
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
  private _tapOrigin: { x: number; y: number; w: number; h: number; radius: string; t: number; el: HTMLElement | null } | null = null;

  // The tile rect a container-transform OPEN grew out of — the matching CLOSE
  // shrinks the page back into this exact rect ("the page returns to its
  // tile"). Set by _morphOpen, consumed by the next pop, cleared by any other
  // navigation (a deeper push / tab switch / gesture breaks the open↔close
  // spatial pairing, so the close falls back to the directional slide).
  private _closeMorph: { x: number; y: number; w: number; h: number; radius: string } | null = null;

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
      // NOT consumed here — _consumeOrigin() below reads the full rect for the
      // container transform (and nulls it).
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

    // ── Container transform (the shipped tile open/close) ───────────────────
    // OPEN: the tapped card grows into the page (_morphOpen). Every tap-driven
    // push has a fresh origin rect (_captureTap); programmatic navs get the
    // centre fallback, so opens are ALWAYS the same physical gesture. CLOSE:
    // if this pop pairs with a morph-open (no deeper nav in between), the page
    // shrinks back into the exact tile it grew from (_morphClose); otherwise
    // the directional slide in _run takes it.
    if (effectiveDir === 'expand') {
      const o = this._consumeOrigin();
      this._closeMorph = o;
      this._morphOpen(c, o, commit, wrappedComplete);
      return true;
    }
    if (effectiveDir === 'pop' && this._closeMorph) {
      const o = this._closeMorph;
      this._closeMorph = null;
      this._morphClose(c, o, commit, wrappedComplete);
      return true;
    }
    // Any other navigation breaks the open↔close spatial pairing.
    this._closeMorph = null;

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
      // Commits are time-sliced (startTransition in App.tsx), so a bare
      // double-rAF could raise opacity while the container still holds the
      // OUTGOING view — old content flashing back at full opacity, then
      // popping to the destination. Gate the fade-in on the committed route +
      // painted content exactly like the animated path does.
      this._whenPainted(c, () => {
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
  private _whenPainted(
    c: HTMLElement,
    run: (committed: boolean) => void,
    onLayout?: (committed: boolean) => void,
    maxFrames = 30,               // ~500ms default ceiling (was 12/~200ms). Engine
                                  // commits are TIME-SLICED (startTransition in
                                  // App.tsx), so the destination can land several
                                  // frames after navigate(). The outgoing snapshot
                                  // holds opaque meanwhile — reads as "loading",
                                  // never as a blank flash — and the cap still
                                  // guarantees the nav lock can't wedge. Callers
                                  // with a SYNCHRONOUS commit (gesture-back) pass a
                                  // tighter cap. `run`/`onLayout` receive whether
                                  // the route had actually committed, so the
                                  // cap-tripped path can degrade gracefully instead
                                  // of animating STALE outgoing content.
    settleFrames = 6,             // Frames to hold the OPAQUE outgoing snapshot on
                                  // top AFTER the destination has laid out, before
                                  // starting the crossfade — lets a heavy page
                                  // rasterize behind cover. COLD opens (freshly
                                  // mounted, slow first paint) pass a larger value
                                  // so the user sees the held outgoing page, not an
                                  // empty surface, until real content is ready;
                                  // WARM navigations (back to a cached tab — already
                                  // painted) pass a small value so back stays snappy.
  ): void {
    const MIN_FRAMES = 2;         // preserve the original paint-the-initial-state gap

    // Opens commit asynchronously now, so "has the DOM I'm inspecting even been
    // committed yet?" must be answered before the paint probes below mean
    // anything. App.tsx mirrors currentView to <html data-route> in an effect;
    // waiting for it to move past its value at gate-start keeps the gate from
    // passing on the OUTGOING view's still-active layer (or a lingering cached
    // overlay with stale content). The frame cap remains the escape hatch.
    const routeAtStart = typeof document !== 'undefined'
      ? document.documentElement.dataset.route
      : undefined;
    const routeCommitted = (): boolean =>
      typeof document === 'undefined'
      || document.documentElement.dataset.route !== routeAtStart;

    // The committed destination is either the page overlay (non-tab views mount
    // as a distinct __overlay__ layer — must be the ACTIVE one, not a lingering
    // cached overlay holding the previous detail view's content) or the
    // now-active keep-alive tab shell.
    const contentLayer = (): HTMLElement | null =>
      (c.querySelector('.keep-alive-shell.is-active[data-keep-alive-tab="__overlay__"]') as HTMLElement | null)
      ?? (c.querySelector('.keep-alive-shell.is-active') as HTMLElement | null);

    const hasPaintedContent = (): boolean => {
      const el = contentLayer();
      if (!el) return false;
      // The keep-alive shell is `min-height:100%`, so its OWN box is always
      // full-height — checking its height/childCount only proves the shell
      // mounted, not that the destination's real content laid out. A freshly
      // committed page has its header + an empty content wrapper for a frame or
      // two before the (often heavy: gradients, blur-3xl, glass) body paints.
      // Require a non-trivial descendant COUNT as a cheap "the body is really
      // here" proxy — an empty shell (header only) is a handful of nodes; a real
      // page body is dozens. Tuned low enough that even a minimal page clears it.
      return el.querySelectorAll('*').length >= 12;
    };

    // Once the committed content has laid out we UN-HIDE it (onLayout) but keep
    // the opaque outgoing clone fully on top, then wait SETTLE_FRAMES more before
    // starting the clone's dissolve. Device capture showed the destination's
    // first real paint (heavy hero: two blur-3xl blooms + gradient glass) lands
    // ~3 frames AFTER layout; the old bare double-rAF began fading the clone
    // before that paint, so the transparent page flashed the bare ambient world
    // for a few frames ("a brief flash right after the tile opens"). Letting the
    // page rasterize BEHIND the opaque clone means the dissolve only ever reveals
    // fully-painted pixels. It's behind the clone, so the extra frames cost
    // nothing visible — just a hair more "held outgoing", never a void.
    const SETTLE_FRAMES = settleFrames;

    let frame = 0;
    let revealedAt = -1;
    const tick = (): void => {
      frame += 1;
      if (revealedAt < 0) {
        if (frame >= MIN_FRAMES && ((routeCommitted() && hasPaintedContent()) || frame >= maxFrames)) {
          // Un-hide the destination behind the still-opaque clone and begin the
          // settle countdown so it can actually rasterize before the crossfade.
          onLayout?.(routeCommitted());
          revealedAt = frame;
        }
        requestAnimationFrame(tick);
        return;
      }
      if (frame - revealedAt >= SETTLE_FRAMES) {
        run(routeCommitted());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Outgoing-page snapshot (shared by _run and the morph paths) ────────────

  /**
   * Deep-clone the VISIBLE (active) layer only — cached keep-alive tabs are
   * display:none but cloneNode(true) on the container would still deep-copy
   * their multi-thousand-node trees (the hitch felt right before an open).
   * Copies canvas pixels (cloneNode leaves canvases blank), strips the
   * mid-flight tile-lift class (its keyframe restarts-then-freezes inside the
   * clone = tile flicker), tags `.te-clone` (scopes the transition-window CSS
   * suppressions + the paint-gap mask applies to the copied `.is-active` shell,
   * making the snapshot an OPAQUE surface), and appends it fixed over the
   * container's box. Caller owns removal.
   */
  private _snapshot(c: HTMLElement, zIndex: number, solid = true): HTMLElement {
    const activeLayer = c.querySelector('.keep-alive-shell.is-active');
    let clone: HTMLElement;
    if (activeLayer) {
      clone = c.cloneNode(false) as HTMLElement;
      clone.appendChild(activeLayer.cloneNode(true));
    } else {
      clone = c.cloneNode(true) as HTMLElement;
    }
    const rect = c.getBoundingClientRect();
    clone.setAttribute('aria-hidden', 'true');
    clone.classList.add('te-clone');
    // `.te-solid` → root-fixes.css backs the copied shell with the opaque theme
    // gradient. Required whenever the snapshot MOVES over other content (the
    // shrinking close-card, the sliding clones) — its transparent regions would
    // otherwise ghost the destination through the traveling page. The morph
    // OPEN's backdrop opts out: it holds perfectly still exactly where the live
    // page was, so its gaps show the ambient world exactly as at rest — no
    // snap when it swaps in.
    if (solid) clone.classList.add('te-solid');
    for (const lifted of clone.querySelectorAll('.tile-open-lifting')) {
      lifted.classList.remove('tile-open-lifting');
    }
    // Canvas pixels don't survive cloneNode — copy them so canvas-driven pages
    // (bonsai, drawings) don't blink out of the snapshot. GPU-backed sources
    // without preserveDrawingBuffer may read blank — same as before, never worse.
    {
      const srcRoot = (activeLayer ?? c) as HTMLElement;
      const srcCanvases = srcRoot.querySelectorAll('canvas');
      const dstCanvases = clone.querySelectorAll('canvas');
      const n = Math.min(srcCanvases.length, dstCanvases.length, 6);
      for (let i = 0; i < n; i++) {
        const src = srcCanvases[i];
        if (src.width < 1 || src.height < 1) continue;
        try {
          dstCanvases[i].getContext('2d')?.drawImage(src, 0, 0);
        } catch (_) { /* tainted/GPU-backed — stays blank, same as before */ }
      }
    }
    clone.style.cssText = [
      'position:fixed',
      `top:${rect.top}px`,
      `left:${rect.left}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      `z-index:${zIndex}`,
      'pointer-events:none',
      'will-change:transform,opacity',
      'overflow:hidden',
      // Soft edge shadow: the snapshot reads as a CARD over the destination.
      // Static shadow on a composited, transform-only layer = painted once.
      'box-shadow:0 0 44px rgba(63,29,42,0.22)',
      // NOTE: deliberately NO `backface-visibility:hidden` / `contain:paint` —
      // those forced redundant backing textures for a viewport-sized layer on
      // every nav; on memory-bound WebViews that evicted on-screen layers.
    ].join(';');
    document.body.appendChild(clone);
    return clone;
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

    // ① Snapshot outgoing page (shared with the morph paths — see _snapshot).
    // z-index 14: covers the page container (z auto/0) but sits DELIBERATELY
    // below the portaled chrome (header .vh-shell z-20, bottom nav z-60) — the
    // chrome stays live and steady through every transition instead of being
    // buried by a full-screen snapshot.
    const clone = this._snapshot(c, 14);
    const rect  = c.getBoundingClientRect();

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
    // Park the live container invisible while the commit lands. Opens commit
    // React asynchronously now (startTransition in App.tsx), so for a few frames
    // the container still holds the OUTGOING view — visible through the
    // translucent parts of the clone as a scaled double-image ghost — and then
    // the incoming view at its pre-positioned scale before it has rasterized.
    // The clone is a pixel-identical copy sitting exactly on top, so hiding the
    // real container here is invisible; _whenPainted's onLayout un-hides it
    // right before the cross-fade starts.
    c.style.visibility = 'hidden';

    // ③ Commit React. For opens this is time-sliced (startTransition) — the
    //    single biggest main-thread task of a tile tap (mounting the new detail
    //    view) no longer runs inside the tap's frame, which was the freeze felt
    //    on device. The paint gate below waits for it to land.
    commit();

    // ④ Hold the opaque outgoing clone until the freshly-committed destination
    //    has actually PAINTED real content (not just the 2 frames the browser
    //    needs to paint the pre-positioned scale+opacity:0 state), then start the
    //    cross-fade over real pixels. Without this gate the clone's opacity
    //    fade-out began after a bare double-rAF while the incoming lazy/async page
    //    was still empty, so the shared ambient background bled through for the
    //    whole animation and the bloom played over nothing.
    this._whenPainted(c, (committed) => {
      // Animate clone out
      const t = `${cfg.dur}ms`;
      clone.style.transition = `transform ${t} ${cfg.outEase}, opacity ${t} ${cfg.outEase}`;
      clone.style.transform  = cfg.outTo[0];
      clone.style.opacity    = cfg.outTo[1];

      // Animate container to identity — unless the frame cap tripped before the
      // sliced commit landed (sustained main-thread starvation). In that case
      // onLayout already snapped the container to identity: animating it now
      // would make the STALE outgoing content perform the entrance bloom. The
      // clone just dissolves over identical pixels and the destination swaps in
      // place whenever React's commit finally flushes.
      if (committed) {
        c.style.transition = `transform ${t} ${cfg.inEase}, opacity ${t} ${cfg.inEase}`;
        c.style.transform  = 'translateZ(0) scale(1)';
        c.style.opacity    = '1';
      }

      const cleanup = () => {
        clone.remove();
        c.style.transition = '';
        c.style.willChange = '';
        c.style.transformOrigin = '';
        c.style.visibility = '';   // defensive: onLayout already cleared it
        // Clear the animated end-state UNCONDITIONALLY. The old guard compared
        // against the literal 'translateZ(0) scale(1)', but CSSOM serializes the
        // stored value as 'translateZ(0px) scale(1)', so it never matched — the
        // container kept a permanent inline transform after the first navigation
        // (a standing full-screen composited layer, and a containing block that
        // broke position:fixed for every descendant). Unconditional is safe: the
        // engine holds the _busy lock until this runs, so nothing else can have
        // written transform/opacity meanwhile (gesture tracking checks !_busy).
        c.style.transform = '';
        c.style.opacity   = '';
        this._busy = false;
        done?.();
      };
      const tid = window.setTimeout(cleanup, cfg.dur + 50);
      clone.addEventListener('transitionend', () => { clearTimeout(tid); cleanup(); }, { once: true });
    }, (committed) => {
      // onLayout: the committed destination has laid out behind the snapshot —
      // reveal the container at its pre-positioned state so it rasterizes during
      // the two settle frames before the cross-fade begins. If the cap tripped
      // BEFORE the sliced commit landed, the container still holds the OUTGOING
      // view: snap it to identity first so the stale content doesn't bloom.
      if (!committed) {
        c.style.transform = 'translateZ(0) scale(1)';
        c.style.opacity   = '1';
        c.style.transformOrigin = '';
      }
      c.style.visibility = '';
    },
    // maxFrames: default cap.
    30,
    // settleFrames: a few frames for the committed page to rasterize behind the
    // opaque snapshot before the slide starts. The slide model is far less
    // paint-sensitive than the old crossfade (the destination is revealed
    // PROGRESSIVELY as the clone travels, and any unpainted region shows the
    // opaque theme mask, not the ambient), so a short settle keeps taps snappy.
    (dir === 'expand' || dir === 'push') ? 4 : 3);
  }

  // ── Container transform: the card you tapped BECOMES the page ─────────────

  /**
   * OPEN — "travel into the card" (App-Store / Material container transform).
   *
   *   1. The old page holds perfectly still (static opaque snapshot beneath).
   *   2. An opaque theme-surfaced CARD, matching the tapped tile's exact rect
   *      and radius, GROWS from under the finger to fill the screen (pure
   *      compositor transform, Apple sheet curve). The growth itself is the
   *      loading cover: the destination commits + paints behind it.
   *   3. The instant the card has arrived AND the page has painted, the old
   *      snapshot is dropped (invisible — the card covers everything) and the
   *      card dissolves over the fully-painted page.
   *
   * Flash-proof by construction: the screen is always covered by [old page ∪
   * growing opaque card], and the final dissolve is ONE translucent layer over
   * an OPAQUE page (paint-gap mask) — the animated ambient can never bleed
   * through, no matter how late the destination paints.
   */
  private _morphOpen(
    c: HTMLElement,
    o: { x: number; y: number; w: number; h: number; radius: string; el?: HTMLElement | null },
    commit: () => void,
    done?: () => void,
  ): void {
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Static backdrop: the page being left, held perfectly still. z 12 — above
    // the page container (z auto/0), below the growing card (z 14), and both
    // below the portaled chrome (header z-20, nav z-60) so the pills stay live.
    // NOT solid: it doesn't move, so its ambient gaps look exactly like rest —
    // the swap-in is invisible (the ambient deep-fade handles paint-gap safety).
    const clone = this._snapshot(c, 12, false);

    // The growing card. Sized at FULL SCREEN and FLIP-transformed down onto the
    // tile rect, so the animation is transform-only (compositor). Opaque theme
    // surface + a soft luminous wash so it reads as the tile lifting toward
    // you, not a blank sheet.
    const sx = Math.max(o.w / W, 0.02);
    const sy = Math.max(o.h / H, 0.02);
    const tx = o.x + o.w / 2 - W / 2;
    const ty = o.y + o.h / 2 - H / 2;
    const surface = document.createElement('div');
    surface.setAttribute('aria-hidden', 'true');
    surface.className = 'te-morph-card';
    surface.style.cssText = [
      'position:fixed',
      'top:0', 'left:0',
      `width:${W}px`, `height:${H}px`,
      'z-index:14',   // above backdrop snapshot (12), below chrome (20/60)
      'pointer-events:none',
      'background:var(--theme-bg-main, linear-gradient(168deg, #F8E7EC 0%, #EBD4DB 50%, #DEBFC9 100%))',
      'border-radius:26px',
      'will-change:transform,opacity',
      'box-shadow:0 24px 80px rgba(63,29,42,0.30)',
      `transform:translate3d(${tx}px,${ty}px,0) scale(${sx},${sy})`,
    ].join(';');
    const wash = document.createElement('div');
    wash.style.cssText = 'position:absolute;inset:0;border-radius:inherit;'
      + 'background:linear-gradient(160deg, rgba(255,255,255,0.55), rgba(255,255,255,0.14) 55%, rgba(255,255,255,0))';
    surface.appendChild(wash);

    // Carry the tapped tile's CONTENT with the card — the container transform
    // reads as "MY tile is opening", not "a sheet appeared". The tile snapshot
    // is counter-scaled so that at t=0 it exactly overlays the real tile
    // (surface scale × inverse scale = identity), then it eases toward natural
    // size while fading out over the first ~40% of the growth — dissolving as
    // the card becomes the page. Compositor-only (transform + opacity).
    let tileGhost: HTMLElement | null = null;
    if (o.el && o.el.isConnected) {
      try {
        const ghost = o.el.cloneNode(true) as HTMLElement;
        ghost.style.cssText = [
          'position:absolute', 'top:0', 'left:0',
          `width:${o.w}px`, `height:${o.h}px`,
          'margin:0',
          `border-radius:${o.radius && o.radius !== '0px' ? o.radius : '26px'}`,
          'overflow:hidden',
          'transform-origin:0 0',
          `transform:scale(${W / o.w},${H / o.h})`,
          'will-change:transform,opacity',
          'pointer-events:none',
        ].join(';');
        surface.appendChild(ghost);
        tileGhost = ghost;
      } catch (_) { /* clone failed — card grows without the content carry */ }
    }
    document.body.appendChild(surface);

    // Park the live container invisible while the (time-sliced) commit lands —
    // it sits beneath the clone + card, so nothing half-mounted is ever seen.
    c.style.visibility = 'hidden';
    commit();

    let grown = false;
    let painted = false;
    let revealed = false;
    let finished = false;
    let failsafe = 0;

    const cleanup = () => {
      // Idempotent: the failsafe timer, the dissolve's transitionend AND its
      // backup timeout can all race here (a stall followed by recovery fires
      // more than one) — done() must only ever complete the navigation once.
      if (finished) return;
      finished = true;
      window.clearTimeout(failsafe);
      clone.remove();
      surface.remove();
      c.style.visibility = '';
      this._busy = false;
      done?.();
    };
    // Hard failsafe: whatever happens (missed transitionend on a backgrounded
    // tab, etc.), the nav lock cannot wedge.
    failsafe = window.setTimeout(cleanup, T_MORPH_GROW + T_MORPH_REVEAL + 900);

    const reveal = () => {
      if (revealed || !grown || !painted) return;
      revealed = true;
      // The card fully covers the screen: drop the old snapshot invisibly, then
      // dissolve the card over the painted destination.
      clone.remove();
      surface.style.transition = `opacity ${T_MORPH_REVEAL}ms ${E_SILK}`;
      surface.style.opacity = '0';
      const tid = window.setTimeout(cleanup, T_MORPH_REVEAL + 60);
      surface.addEventListener('transitionend', () => { window.clearTimeout(tid); cleanup(); }, { once: true });
    };

    // Paint gate: un-hide the destination behind cover as soon as it lands.
    // (If the cap trips uncommitted — sustained starvation — we proceed anyway;
    // App.tsx's onComplete force-flush lands the content, same degraded path as
    // the slide. Small settle: the card covers everything regardless.)
    this._whenPainted(c, () => {
      c.style.visibility = '';
      painted = true;
      reveal();
    }, undefined, 30, 2);

    // Launch the growth on the next frame (initial transform must paint first).
    requestAnimationFrame(() => requestAnimationFrame(() => {
      surface.style.transition = `transform ${T_MORPH_GROW}ms ${E_MORPH}`;
      surface.style.transform = 'translate3d(0,0,0) scale(1)';
      if (tileGhost) {
        // Track the card's growth (same duration/ease so the net motion stays
        // continuous) while dissolving in the first ~40% of the trip.
        tileGhost.style.transition = `transform ${T_MORPH_GROW}ms ${E_MORPH}, opacity ${Math.round(T_MORPH_GROW * 0.4)}ms ${E_SILK}`;
        tileGhost.style.transform = 'scale(1,1)';
        tileGhost.style.opacity = '0';
      }
      const tid = window.setTimeout(() => { grown = true; reveal(); }, T_MORPH_GROW + 80);
      // NOT {once}: the tile ghost's transitionend events BUBBLE through the
      // surface and would consume a once-listener before the surface's own
      // transform finishes. Filter instead; the listener dies with the node.
      surface.addEventListener('transitionend', (ev) => {
        if (ev.propertyName !== 'transform' || ev.target !== surface) return;
        window.clearTimeout(tid);
        grown = true;
        reveal();
      });
    }));
  }

  /**
   * CLOSE — the page SHRINKS back into the tile it came from, over the live
   * destination. Mirror of _morphOpen: the current page's opaque snapshot
   * collapses (transform-only) onto the stored tile rect while the real
   * destination is already sitting beneath it, then fades out in its final
   * moments. One translucent layer over an opaque page — nothing can flash.
   */
  private _morphClose(
    c: HTMLElement,
    o: { x: number; y: number; w: number; h: number; radius: string },
    commit: () => void,
    done?: () => void,
  ): void {
    const W = window.innerWidth;
    const H = window.innerHeight;

    // The collapsing page — above the live destination (z auto/0), below chrome.
    const clone = this._snapshot(c, 14);

    c.style.visibility = 'hidden';
    commit();

    let finished = false;
    let failsafe = 0;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(failsafe);
      clone.remove();
      c.style.visibility = '';
      this._busy = false;
      done?.();
    };
    failsafe = window.setTimeout(cleanup, T_MORPH_SHRINK + 900);

    // Wait for the (warm, keep-alive) destination to be ready beneath, then
    // collapse the snapshot into the tile rect. The fade is tail-overlapped so
    // the card is already tile-sized and visually "landing" as it dissolves.
    this._whenPainted(c, () => {
      c.style.visibility = '';
      const sx = Math.max(o.w / W, 0.02);
      const sy = Math.max(o.h / H, 0.02);
      const tx = o.x + o.w / 2 - W / 2;
      const ty = o.y + o.h / 2 - H / 2;
      clone.style.borderRadius = '26px';
      clone.style.transition = [
        `transform ${T_MORPH_SHRINK}ms ${E_MORPH}`,
        `opacity ${T_MORPH_FADE}ms ${E_SILK} ${T_MORPH_SHRINK - T_MORPH_FADE}ms`,
      ].join(', ');
      requestAnimationFrame(() => {
        clone.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${sx},${sy})`;
        clone.style.opacity = '0';
      });
      const tid = window.setTimeout(cleanup, T_MORPH_SHRINK + 80);
      clone.addEventListener('transitionend', (ev) => {
        if (ev.propertyName !== 'opacity' || ev.target !== clone) return;
        window.clearTimeout(tid);
        cleanup();
      });
    }, undefined, 30, 2);
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
    // Keep the element itself: the container-transform open clones the tapped
    // tile's CONTENT into the growing card so "your tile" visibly becomes the
    // page (held only until consumed/overwritten by the next tap).
    this._tapOrigin = { x: r.left, y: r.top, w: r.width, h: r.height, radius, t: performance.now(), el };
  };

  /**
   * The morph origin for the next open/close: the most-recent tap (with a 2.5s
   * freshness guard so a slow lazy-chunk load between tap and navigate doesn't
   * lose it) or, failing that, a small rect at screen centre. Always returns a
   * usable rect so opens/closes are ALWAYS a morph — never a fallback slide.
   */
  private _consumeOrigin(): { x: number; y: number; w: number; h: number; radius: string; el: HTMLElement | null } {
    const o = this._tapOrigin;
    this._tapOrigin = null;
    if (o && (performance.now() - o.t) < 2500) {
      return { x: o.x, y: o.y, w: o.w, h: o.h, radius: o.radius, el: o.el };
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return { x: vw / 2 - 28, y: vh * 0.4, w: 56, h: 56, radius: '28px', el: null };
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
    clone.classList.add('te-clone');   // scoped blur/animation suppression target
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
        // The gesture pops the page itself, so the stored morph-close pairing is
        // consumed/broken — a later unrelated pop must not shrink into a stale rect.
        this._closeMorph = null;
        window.dispatchEvent(new CustomEvent('te:gesture-back'));

        // Hold opacity:0 only until the freshly-committed destination has
        // actually PAINTED real content, then fade in over real pixels. The old
        // bare double-rAF revealed the container after a fixed ~2 frames; on a
        // slow WebView commit the destination was still empty then, so the whole
        // content area sat transparent — the bare ambient background showing
        // through — for many frames = "the whole screen vanishes when I swipe
        // back". This flow's commit is SYNCHRONOUS (flushSync in the
        // te:gesture-back listener above), so unlike the sliced navigate() path
        // it resolves in 2-3 frames — cap at 12 frames (~200ms), not the default
        // 30 the async path needs, so a starved device never holds the screen
        // blank for half a second. The cap still means it can never wedge.
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
        }, undefined, 12);
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

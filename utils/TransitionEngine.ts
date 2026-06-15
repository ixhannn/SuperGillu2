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

// ─── Gesture constants ─────────────────────────────────────────────────────────
const CLAIM_PX    = 10;    // px before axis lock
const EDGE_PX     = 28;    // left-edge zone that starts back gesture
const VEL_WIN_MS  = 80;    // rolling velocity window
const COMMIT_VEL  = 0.35;  // px/ms to auto-commit
const COMMIT_FRAC = 0.38;  // fraction of screen width to auto-commit

export type EngineDirection = 'tab' | 'push' | 'pop' | 'modal' | 'modal-close' | 'expand';

// ─── Config per direction ──────────────────────────────────────────────────────
interface DirConfig {
  dur:     number;
  inEase:  string;
  outEase: string;
  inFrom:  [string, string];   // [transform, opacity]
  outTo:   [string, string];
}

function dirConfig(dir: EngineDirection, W: number): DirConfig {
  const tx = (px: number, sc = 1) => `translate3d(${px}px,0,0) scale(${sc})`;
  const ty = (p: string,   sc = 1) => `translate3d(0,${p},0) scale(${sc})`;

  // NOTE: this JS-clone fallback runs only where the View Transitions API is
  // unavailable (older WebViews). Here the outgoing page is cloned ON TOP, so
  // "forward" motions fade the old layer out to reveal the new one beneath,
  // while "back" motions slide the opaque old layer off to reveal it. The
  // primary (View Transitions) path is governed by the CSS keyframes and gets
  // the full new-on-top push; these values keep the legacy path coherent.
  switch (dir) {
    case 'tab':
      return { dur: T_TAB,  inEase: E_SILK, outEase: E_SILK,
        inFrom: [ty('14px', 0.985),  '0'],
        outTo:  [ty('-10px', 1.008), '0'] };
    case 'push':
      return { dur: T_PUSH, inEase: E_SILK, outEase: E_STANDARD,
        inFrom: [tx(W, 1),            '1'],
        outTo:  [tx(-W * 0.22, 0.965),'0'] };
    case 'pop':
      return { dur: T_POP,  inEase: E_SILK, outEase: E_STANDARD,
        inFrom: [tx(-W * 0.22, 0.965),'1'],
        outTo:  [tx(W, 1),            '1'] };
    case 'modal':
      return { dur: T_MODAL_OPEN,  inEase: E_SILK, outEase: E_STANDARD,
        inFrom: [ty('100%', 1),      '1'],
        outTo:  [ty('-1.2%', 0.97),  '0'] };
    case 'modal-close':
      return { dur: T_MODAL_CLOSE, inEase: E_SILK, outEase: E_EXIT,
        inFrom: [ty('-1.2%', 0.97),  '0.9'],
        outTo:  [ty('100%', 1),      '1'] };
    case 'expand':
      // Tile-open bloom. The View Transitions path scales the new page from the
      // tapped tile's origin (set in CSS by useTileOpen). This legacy clone
      // fallback can't honour a per-tile origin, so it blooms from centre.
      return { dur: T_PUSH, inEase: E_SILK, outEase: E_STANDARD,
        inFrom: ['scale(0.6)',  '0'],
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
  }

  /** Hot-swap container when the DOM element changes (e.g. re-mount). */
  setContainer(container: HTMLElement): void { this._c = container; }

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

    const wrappedComplete = () => {
      this._busy = false;
      this._setTransitioning(false);
      onComplete?.();
    };

    const c = this._c;
    if (!c) { commit(); wrappedComplete(); return true; }

    if (this._mo) {
      this._xfade(c, commit, wrappedComplete);
      return true;
    }

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

  /** Toggle off the native View Transitions path (testing / kill switch). */
  private _supportsVT = true;

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

  // ── Core programmatic transition ──────────────────────────────────────────

  private _run(
    c: HTMLElement,
    dir: EngineDirection,
    commit: () => void,
    done?: () => void,
  ): void {
    const W   = window.innerWidth;
    const cfg = dirConfig(dir, W);

    // ① Snapshot outgoing page
    const clone = c.cloneNode(true) as HTMLElement;
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
      'backface-visibility:hidden',
      'overflow:hidden',
      'contain:paint',
    ].join(';');
    document.body.appendChild(clone);

    // ② Pre-position incoming container at initial state (no transition)
    c.style.transition = 'none';
    c.style.willChange = 'transform,opacity';
    c.style.transform  = cfg.inFrom[0];
    c.style.opacity    = cfg.inFrom[1];

    // ③ Commit React synchronously
    commit();

    // ④ Double-rAF: browser needs 2 frames to paint new content at initial state
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
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
          if (c.style.transform === 'translateZ(0) scale(1)') c.style.transform = '';
          if (c.style.opacity   === '1')                       c.style.opacity   = '';
          this._busy = false;
          done?.();
        };
        const tid = window.setTimeout(cleanup, cfg.dur + 50);
        clone.addEventListener('transitionend', () => { clearTimeout(tid); cleanup(); }, { once: true });
      });
    });
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

      this._setTransitioning(true);

      c.style.transition = `transform ${dur}ms ${E_STANDARD}`;
      c.style.transform  = `translate3d(${W}px,0,0)`;

      setTimeout(() => {
        // Container is now off-screen. Hide it instantly, snap position to 0.
        c.style.transition = 'none';
        c.style.transform  = '';
        c.style.opacity    = '0';
        c.style.willChange = '';

        // Fire 'te:gesture-back' — App.tsx calls flushSync(() => setState) directly.
        // TransitionEngine.navigate() is NOT called here; this is a separate flow.
        window.dispatchEvent(new CustomEvent('te:gesture-back'));

        // After React commits the new view (give it one more frame), fade in.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            c.style.transition = `opacity 160ms ${E_STANDARD}`;
            c.style.opacity    = '1';
            const cleanup = () => {
              c.style.transition = '';
              c.style.opacity    = '';
              this._setTransitioning(false);
            };
            c.addEventListener('transitionend', cleanup, { once: true });
            setTimeout(cleanup, 200);
          });
        });
      }, dur + 16);

    } else {
      // Snap back to identity
      c.style.transition = `transform ${T_POP}ms ${E_STANDARD}`;
      c.style.transform  = 'translate3d(0,0,0)';
      const reset = () => {
        c.style.transition = '';
        c.style.transform  = '';
        c.style.willChange = '';
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
    c.style.transition = `transform ${T_POP}ms ${E_STANDARD}`;
    c.style.transform  = 'translate3d(0,0,0)';
    const reset = () => {
      c.style.transition = '';
      c.style.transform  = '';
      c.style.willChange = '';
    };
    c.addEventListener('transitionend', reset, { once: true });
    setTimeout(reset, T_POP + 32);
  };
}

export const TransitionEngine = new TransitionEngineImpl();

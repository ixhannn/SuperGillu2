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
export const T_TAB          = 220;
export const T_PUSH         = 280;
export const T_POP          = 200;
export const T_MODAL_OPEN   = 300;
export const T_MODAL_CLOSE  = 220;

// ─── Easing ───────────────────────────────────────────────────────────────────
const E_STANDARD     = 'cubic-bezier(0.22, 1, 0.36, 1)';     // iOS spring-like
const E_TAB_OUT      = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const E_MODAL_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';  // 6px overshoot
const E_MODAL_DROP   = 'cubic-bezier(0.55, 0, 1, 0.45)';

// ─── Gesture constants ─────────────────────────────────────────────────────────
const CLAIM_PX    = 10;    // px before axis lock
const EDGE_PX     = 28;    // left-edge zone that starts back gesture
const VEL_WIN_MS  = 80;    // rolling velocity window
const COMMIT_VEL  = 0.35;  // px/ms to auto-commit
const COMMIT_FRAC = 0.38;  // fraction of screen width to auto-commit

export type EngineDirection = 'tab' | 'push' | 'pop' | 'modal' | 'modal-close';

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

  switch (dir) {
    case 'tab':
      return { dur: T_TAB,  inEase: E_STANDARD, outEase: E_TAB_OUT,
        inFrom: [tx(0, 0.97),        '0.72'],
        outTo:  [tx(0, 1.03),        '0'   ] };
    case 'push':
      return { dur: T_PUSH, inEase: E_STANDARD, outEase: E_STANDARD,
        inFrom: [tx(W * 0.30, 0.97), '0.84'],
        outTo:  [tx(-W * 0.12, 0.97),'0'   ] };
    case 'pop':
      return { dur: T_POP,  inEase: E_STANDARD, outEase: E_STANDARD,
        inFrom: [tx(-W * 0.12, 0.97),'0.84'],
        outTo:  [tx(W * 0.30, 0.97), '0'   ] };
    case 'modal':
      return { dur: T_MODAL_OPEN,  inEase: E_MODAL_SPRING, outEase: E_TAB_OUT,
        inFrom: [ty('6%', 0.97),   '0.80'],
        outTo:  ['scale(0.96)',    '0.88'] };
    case 'modal-close':
      return { dur: T_MODAL_CLOSE, inEase: E_STANDARD,      outEase: E_MODAL_DROP,
        inFrom: ['scale(0.96)',    '0.88'],
        outTo:  [ty('8%', 0.97),   '0'  ] };
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
   */
  navigate(
    dir: EngineDirection,
    commit: () => void,
    onComplete?: () => void,
  ): void {
    if (this._busy) return;
    this._busy = true;

    const c = this._c;
    if (!c) { commit(); this._busy = false; onComplete?.(); return; }

    if (this._mo) {
      this._xfade(c, commit, onComplete);
      return;
    }
    this._run(c, dir, commit, onComplete);
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
            c.addEventListener('transitionend', () => {
              c.style.transition = '';
              c.style.opacity    = '';
            }, { once: true });
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

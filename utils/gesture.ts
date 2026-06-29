/**
 * gesture.ts — Native-feel gesture system for Lior
 *
 * All public APIs return a cleanup `() => void`.
 * All springs share one requestAnimationFrame loop (no duplicate RAF).
 * Touch feedback starts on pointerdown — guaranteed <16 ms.
 *
 * API surface:
 *   SpringValue          — animated spring primitive
 *   SPRING_PRESETS       — stiffness / damping / mass presets
 *   attachPress          — press / tap with spring release
 *   attachDrag           — drag with spring follow + momentum settle
 *   attachSwipe          — velocity-based swipe (horizontal or vertical)
 *   attachModalDismiss   — pull-down-to-dismiss gesture
 *   attachPinch          — multi-touch pinch-to-zoom
 *   attachRubberBand     — iOS-style rubber-band overscroll on a scroll container
 *   attachLongPress      — 380ms hold with SVG progress ring + haptic escalation
 *   navigateWithTransition — View Transitions API wrapper (Safari 17+ / Chrome 111+)
 *   initGlobalGestures   — call once at startup to wire [data-press] delegation
 */

import { Haptics } from '../services/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// 1. SPRING PHYSICS ENGINE
//    Single shared RAF loop — all active SpringValues tick in one callback.
//    Semi-implicit Euler: stable at 60–120 fps, matches iOS spring character.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpringConfig {
  /** Restoring-force constant — higher = snappier response (iOS default ≈ 400) */
  stiffness: number;
  /** Energy dissipation — higher = less bounce (iOS default ≈ 28) */
  damping:   number;
  /** Inertia — higher = heavier feel (iOS default = 1) */
  mass:      number;
}

export const SPRING_PRESETS = {
  /** iOS default spring — smooth, slightly springy */
  default: { stiffness: 400, damping: 28, mass: 1   } satisfies SpringConfig,
  /** Button press — snappy, almost no overshoot */
  button:  { stiffness: 600, damping: 32, mass: 0.7 } satisfies SpringConfig,
  /** Large card or image */
  card:    { stiffness: 300, damping: 24, mass: 1.2 } satisfies SpringConfig,
  /** Modal open/close — theatrical */
  modal:   { stiffness: 350, damping: 26, mass: 1   } satisfies SpringConfig,
  /** Drag follow — physical lag behind finger */
  drag:    { stiffness: 200, damping: 22, mass: 1   } satisfies SpringConfig,
  /** Rubber-band return */
  rubber:  { stiffness: 450, damping: 34, mass: 0.8 } satisfies SpringConfig,
};

type SpringCb = (value: number, settled: boolean) => void;

// ── Shared loop state (module-private) ────────────────────────────────────────
const _pool = new Set<SpringValue>();
let   _raf: number | null = null;
let   _lt  = 0;

function _loop(ts: number): void {
  const dt = Math.min((ts - _lt) / 1000, 0.05); // cap at 50 ms
  _lt = ts;

  for (const s of _pool) {
    // Semi-implicit Euler integration
    const force = -s._cfg.stiffness * (s._x - s._t) - s._cfg.damping * s._v;
    s._v += (force / s._cfg.mass) * dt;
    s._x += s._v * dt;

    const atRest =
      Math.abs(s._x - s._t) < 0.0005 && Math.abs(s._v) < 0.0005;

    if (atRest) {
      s._x = s._t;
      s._v = 0;
      _pool.delete(s);
      s._fire(true);
    } else {
      s._fire(false);
    }
  }

  _raf = _pool.size > 0 ? requestAnimationFrame(_loop) : null;
}

function _wake(s: SpringValue): void {
  _pool.add(s);
  if (_raf === null) {
    _lt  = performance.now();
    _raf = requestAnimationFrame(_loop);
  }
}

// ── SpringValue ───────────────────────────────────────────────────────────────

export class SpringValue {
  /** @internal */ _x: number;
  /** @internal */ _v = 0;
  /** @internal */ _t: number;
  /** @internal */ _cfg: SpringConfig;
  /** @internal */ _cbs = new Set<SpringCb>();

  constructor(initial = 0, config: SpringConfig = SPRING_PRESETS.default) {
    this._x  = initial;
    this._t  = initial;
    this._cfg = config;
  }

  get value()   { return this._x; }
  get settled() { return !_pool.has(this); }

  /** Animate to a new target value */
  to(target: number): this {
    this._t = target;
    _wake(this);
    return this;
  }

  /** Teleport instantly (no animation, fires callbacks once) */
  snap(value: number): this {
    _pool.delete(this);
    this._x = this._t = value;
    this._v = 0;
    this._fire(true);
    return this;
  }

  /** Inject velocity (e.g. from a flick / throw gesture), then animate to target */
  flick(velocityPerSec: number): this {
    this._v = velocityPerSec;
    _wake(this);
    return this;
  }

  onChange(cb: SpringCb): () => void {
    this._cbs.add(cb);
    return () => this._cbs.delete(cb);
  }

  /** @internal */
  _fire(settled: boolean): void {
    for (const cb of this._cbs) cb(this._x, settled);
  }

  destroy(): void {
    _pool.delete(this);
    this._cbs.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRESS GESTURE
//    Immediate pointerdown feedback (scale + opacity) with spring release.
//    Opt-in per element — safe to combine with framer-motion's whileTap.
// ─────────────────────────────────────────────────────────────────────────────

export interface PressOptions {
  /** Scale factor while pressed (default 0.97) */
  pressScale?:   number;
  /** Opacity while pressed (default 0.88) */
  pressOpacity?: number;
  spring?:       SpringConfig;
  onDown?:       () => void;
  onUp?:         () => void;
}

export function attachPress(el: HTMLElement, opts: PressOptions = {}): () => void {
  const pressScale   = opts.pressScale   ?? 0.97;
  const pressOpacity = opts.pressOpacity ?? 0.88;
  const cfg          = opts.spring ?? SPRING_PRESETS.button;

  el.style.touchAction = 'manipulation';
  (el.style as CSSStyleDeclaration & { webkitTapHighlightColor: string })
    .webkitTapHighlightColor = 'transparent';
  el.style.userSelect  = 'none';
  el.style.willChange  = 'transform, opacity';

  const sc = new SpringValue(1, cfg);
  const op = new SpringValue(1, cfg);

  sc.onChange(v => { el.style.transform = `scale(${v.toFixed(4)})`; });
  op.onChange(v => { el.style.opacity   = v.toFixed(4); });

  let pid: number | null = null;

  const onDown = (e: PointerEvent): void => {
    if (pid !== null) return;
    pid = e.pointerId;
    Haptics.warmUp(); // iOS: warm the Taptic Engine so the press haptic lands on time
    opts.onDown?.();
    // Synchronous write — this happens in the same task as the event, <16 ms
    el.style.transform = `scale(${pressScale})`;
    el.style.opacity   = String(pressOpacity);
    sc.snap(pressScale);
    op.snap(pressOpacity);
  };

  const release = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    pid = null;
    opts.onUp?.();
    sc.to(1);
    op.to(1);
  };

  el.addEventListener('pointerdown',  onDown);
  el.addEventListener('pointerup',    release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);

  return () => {
    el.removeEventListener('pointerdown',  onDown);
    el.removeEventListener('pointerup',    release);
    el.removeEventListener('pointercancel', release);
    el.removeEventListener('pointerleave', release);
    sc.destroy();
    op.destroy();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DRAG GESTURE
//    Spring-based follow: item trails finger with slight lag.
//    On release: momentum flick settles to final position via spring.
//    Scale 1.05× + shadow increase while dragging.
// ─────────────────────────────────────────────────────────────────────────────

export interface DragOptions {
  /** Axis constraint (default 'both') */
  axis?:      'x' | 'y' | 'both';
  spring?:    SpringConfig;
  /** Scale while dragging (default 1.05) */
  dragScale?: number;
  /** Bounding box the item spring-settles within on release */
  bounds?:    { left: number; top: number; right: number; bottom: number };
  onStart?:   () => void;
  onMove?:    (x: number, y: number) => void;
  onEnd?:     (x: number, y: number, vx: number, vy: number) => void;
}

export function attachDrag(el: HTMLElement, opts: DragOptions = {}): () => void {
  const axis      = opts.axis      ?? 'both';
  const dragScale = opts.dragScale ?? 1.05;
  const cfg       = opts.spring ?? SPRING_PRESETS.drag;

  el.style.touchAction = 'none'; // required for setPointerCapture
  el.style.cursor      = 'grab';
  el.style.willChange  = 'transform';

  let curX = 0, curY = 0;
  let isDragging = false;

  const sx = new SpringValue(0, cfg);
  const sy = new SpringValue(0, cfg);

  const applyTransform = (): void => {
    const tx    = axis === 'y' ? 0 : curX;
    const ty    = axis === 'x' ? 0 : curY;
    const scale = isDragging ? dragScale : 1;
    el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    el.style.boxShadow = isDragging
      ? '0 24px 48px rgba(0,0,0,0.18), 0 8px 16px rgba(0,0,0,0.10)'
      : '';
  };

  sx.onChange(v => { curX = v; applyTransform(); });
  sy.onChange(v => { curY = v; applyTransform(); });

  let pid: number | null = null;
  let prevX = 0, prevY = 0, vx = 0, vy = 0, lastMoveTs = 0;

  const onDown = (e: PointerEvent): void => {
    if (pid !== null) return;
    pid = e.pointerId;
    isDragging = true;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    opts.onStart?.();
    Haptics.dragPickup(); // L3 — "lifted off the surface"

    prevX = e.clientX;
    prevY = e.clientY;
    lastMoveTs = performance.now();
    vx = vy = 0;

    // Snap spring to current position so motion starts from where it is
    sx.snap(curX);
    sy.snap(curY);
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;

    const now = performance.now();
    const dt  = now - lastMoveTs;
    const dx  = e.clientX - prevX;
    const dy  = e.clientY - prevY;

    if (dt > 0) {
      vx = dx / dt; // px / ms
      vy = dy / dt;
    }

    prevX      = e.clientX;
    prevY      = e.clientY;
    lastMoveTs = now;

    // Direct snap during drag — finger position is truth, no spring lag while held
    const tx = axis === 'y' ? 0 : curX + dx;
    const ty = axis === 'x' ? 0 : curY + dy;

    sx.snap(tx);
    sy.snap(ty);
    opts.onMove?.(tx, ty);
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    pid = null;
    isDragging = false;
    el.style.cursor = 'grab';

    opts.onEnd?.(curX, curY, vx, vy);
    Haptics.dragDrop(); // L2 — "it landed"

    // Momentum look-ahead: where would item land in 80 ms?
    let targetX = curX + vx * 80;
    let targetY = curY + vy * 80;

    if (opts.bounds) {
      const { left, top, right, bottom } = opts.bounds;
      targetX = Math.max(left, Math.min(right,  targetX));
      targetY = Math.max(top,  Math.min(bottom, targetY));
    }

    // Inject velocity then spring to target — feels like a throw
    sx.flick(vx * 1000).to(targetX);
    sy.flick(vy * 1000).to(targetY);

    applyTransform(); // clear drag shadow immediately
  };

  el.addEventListener('pointerdown',   onDown);
  el.addEventListener('pointermove',   onMove);
  el.addEventListener('pointerup',     onUp);
  el.addEventListener('pointercancel', onUp);

  return () => {
    el.removeEventListener('pointerdown',   onDown);
    el.removeEventListener('pointermove',   onMove);
    el.removeEventListener('pointerup',     onUp);
    el.removeEventListener('pointercancel', onUp);
    sx.destroy();
    sy.destroy();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SWIPE GESTURE
//    Velocity-based: fast swipe commits, slow swipe snaps back.
//    Rubber-band resistance when swiping in a direction with no handler.
// ─────────────────────────────────────────────────────────────────────────────

export interface SwipeOptions {
  /** Velocity threshold in px/ms to commit swipe (default 0.4) */
  velocityThreshold?:  number;
  /** Distance threshold in px to commit swipe (default 80) */
  distanceThreshold?:  number;
  axis?:               'horizontal' | 'vertical';
  spring?:             SpringConfig;
  onSwipeLeft?:        () => void;
  onSwipeRight?:       () => void;
  onSwipeUp?:          () => void;
  onSwipeDown?:        () => void;
  /** Progress 0→1 during the swipe (use for live UI hints) */
  onProgress?:         (progress: number) => void;
  onCancel?:           () => void;
}

export function attachSwipe(el: HTMLElement, opts: SwipeOptions = {}): () => void {
  const vThresh  = opts.velocityThreshold  ?? 0.4;
  const dThresh  = opts.distanceThreshold  ?? 80;
  const axis     = opts.axis ?? 'horizontal';
  const cfg      = opts.spring ?? SPRING_PRESETS.default;

  // Allow native scroll on the non-gesture axis
  el.style.touchAction = axis === 'horizontal' ? 'pan-y' : 'pan-x';
  el.style.willChange  = 'transform';

  const spring = new SpringValue(0, cfg);
  spring.onChange(v => {
    el.style.transform = axis === 'horizontal'
      ? `translateX(${v.toFixed(2)}px)`
      : `translateY(${v.toFixed(2)}px)`;
  });

  let pid: number | null = null;
  let startX = 0, startY = 0;
  let prevPrimary = 0, velocity = 0, lastTs = 0;
  let locked = false; // true when perpendicular axis is dominant → treat as scroll
  let commitTid: ReturnType<typeof setTimeout> | null = null;

  const onDown = (e: PointerEvent): void => {
    if (pid !== null || e.pointerType === 'mouse') return;
    pid = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    // Seed with the gesture-start delta (0), not the absolute coordinate, so
    // the first velocity sample is (primary - 0)/dt instead of (delta - coord)/dt.
    prevPrimary = 0;
    velocity = 0;
    lastTs = performance.now();
    locked = false;
    spring.snap(0);
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const primary = axis === 'horizontal' ? dx : dy;
    const perp    = axis === 'horizontal' ? dy : dx;

    // First 10 px: detect scroll vs swipe
    if (!locked && Math.abs(primary) < 10 && Math.abs(perp) > Math.abs(primary) * 1.5) {
      locked = true;
      pid = null;
      opts.onProgress?.(0); // reset any live hint left from an earlier swipe-axis move
      spring.to(0);
      return;
    }
    if (locked) return;

    const now = performance.now();
    const dt  = now - lastTs;
    if (dt > 0) velocity = (primary - prevPrimary) / dt;
    prevPrimary = primary;
    lastTs = now;

    // Rubber-band resistance when no handler exists for that direction
    const noHandler = (primary > 0 && !opts.onSwipeRight && !opts.onSwipeDown)
                   || (primary < 0 && !opts.onSwipeLeft  && !opts.onSwipeUp);

    const offset = noHandler
      ? primary * 0.22 * (1 - Math.min(Math.abs(primary) / 380, 0.82))
      : primary;

    spring.snap(offset);
    opts.onProgress?.(Math.min(1, Math.abs(offset) / dThresh));
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    pid = null;

    const offset = spring.value;
    const commit = Math.abs(velocity) > vThresh || Math.abs(offset) > dThresh;

    if (commit) {
      const dir = offset > 0 ? 'positive' : 'negative';
      const exit = dir === 'positive' ? window.innerWidth * 1.1 : -window.innerWidth * 1.1;
      spring.to(exit);
      commitTid = setTimeout(() => {
        commitTid = null;
        spring.snap(0);
        if (axis === 'horizontal') {
          if (dir === 'positive') opts.onSwipeRight?.();
          else                    opts.onSwipeLeft?.();
        } else {
          if (dir === 'positive') opts.onSwipeDown?.();
          else                    opts.onSwipeUp?.();
        }
      }, 260);
    } else {
      opts.onCancel?.();
      opts.onProgress?.(0);
      spring.to(0);
    }
  };

  el.addEventListener('pointerdown',   onDown);
  el.addEventListener('pointermove',   onMove);
  el.addEventListener('pointerup',     onUp);
  el.addEventListener('pointercancel', onUp);

  return () => {
    el.removeEventListener('pointerdown',   onDown);
    el.removeEventListener('pointermove',   onMove);
    el.removeEventListener('pointerup',     onUp);
    el.removeEventListener('pointercancel', onUp);
    if (commitTid !== null) clearTimeout(commitTid);
    spring.destroy();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MODAL DISMISS GESTURE
//    Drag down > 120 px or velocity > 0.5 px/ms dismisses with spring exit.
//    Swiping up has iOS rubber-band resistance.
//    onProgress (0→1) drives backdrop opacity.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModalDismissOptions {
  /** Y distance threshold to trigger dismiss (default 120) */
  threshold?:          number;
  /** Velocity threshold in px/ms (default 0.5) */
  velocityThreshold?:  number;
  spring?:             SpringConfig;
  onDismiss:           () => void;
  /** 0 = fully open, 1 = fully dismissed — use to fade backdrop */
  onProgress?:         (progress: number) => void;
}

export function attachModalDismiss(el: HTMLElement, opts: ModalDismissOptions): () => void {
  const yThresh = opts.threshold         ?? 120;
  const vThresh = opts.velocityThreshold ?? 0.5;
  const cfg     = opts.spring ?? SPRING_PRESETS.modal;

  const spring = new SpringValue(0, cfg);
  spring.onChange(v => {
    el.style.transform = `translateY(${v.toFixed(2)}px)`;
    opts.onProgress?.(Math.max(0, Math.min(1, v / (yThresh * 1.5))));
  });

  let pid: number | null = null;
  let startY = 0, prevY = 0, velocity = 0, lastTs = 0, dismissed = false;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  const onDown = (e: PointerEvent): void => {
    if (pid !== null) return;
    pid = e.pointerId;
    startY = prevY = e.clientY;
    velocity = 0;
    lastTs = performance.now();
    dismissed = false;
    spring.snap(0);
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pid || dismissed) return;
    const now = performance.now();
    const dt  = now - lastTs;
    if (dt > 0) velocity = (e.clientY - prevY) / dt;
    prevY  = e.clientY;
    lastTs = now;

    const dy = e.clientY - startY;
    if (dy < 0) {
      // Pulling up — rubber-band resistance
      spring.snap(dy * 0.08);
    } else {
      spring.snap(dy);
    }
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    pid = null;

    if (spring.value > yThresh || velocity > vThresh) {
      dismissed = true;
      spring.to(window.innerHeight * 1.1);
      dismissTimer = setTimeout(() => {
        dismissTimer = null;
        opts.onDismiss();
      }, 300);
    } else {
      spring.to(0);
    }
  };

  el.addEventListener('pointerdown',   onDown);
  el.addEventListener('pointermove',   onMove);
  el.addEventListener('pointerup',     onUp);
  el.addEventListener('pointercancel', onUp);

  return () => {
    el.removeEventListener('pointerdown',   onDown);
    el.removeEventListener('pointermove',   onMove);
    el.removeEventListener('pointerup',     onUp);
    el.removeEventListener('pointercancel', onUp);
    if (dismissTimer !== null) clearTimeout(dismissTimer);
    spring.destroy();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PINCH-TO-ZOOM (multi-touch)
// ─────────────────────────────────────────────────────────────────────────────

export interface PinchOptions {
  minScale?: number; // default 0.5
  maxScale?: number; // default 4
  onScale?:  (scale: number) => void;
}

export function attachPinch(el: HTMLElement, opts: PinchOptions = {}): () => void {
  const minScale = opts.minScale ?? 0.5;
  const maxScale = opts.maxScale ?? 4;

  const scaleSpring = new SpringValue(1, SPRING_PRESETS.button);
  scaleSpring.onChange(v => { el.style.transform = `scale(${v.toFixed(4)})`; });

  const ptrs = new Map<number, { x: number; y: number }>();
  let baseScale = 1, baseDistance = 0, liveScale = 1;

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y);

  const onDown = (e: PointerEvent): void => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const pts  = [...ptrs.values()];
      // Floor at 1px so coincident pointers don't make d/baseDistance Infinity/NaN.
      baseDistance = Math.max(1, dist(pts[0], pts[1]));
      baseScale    = liveScale;
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size !== 2) return;

    const pts  = [...ptrs.values()];
    const d    = dist(pts[0], pts[1]);
    liveScale  = Math.max(minScale, Math.min(maxScale, baseScale * (d / baseDistance)));
    el.style.transform = `scale(${liveScale.toFixed(4)})`;
    opts.onScale?.(liveScale);
  };

  const onUp = (e: PointerEvent): void => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) {
      // Spring-snap back to 1 if close
      const snap = Math.abs(liveScale - 1) < 0.15 ? 1 : liveScale;
      liveScale  = snap;
      scaleSpring.snap(liveScale).to(snap);
    }
  };

  el.addEventListener('pointerdown',   onDown);
  el.addEventListener('pointermove',   onMove);
  el.addEventListener('pointerup',     onUp);
  el.addEventListener('pointercancel', onUp);

  return () => {
    el.removeEventListener('pointerdown',   onDown);
    el.removeEventListener('pointermove',   onMove);
    el.removeEventListener('pointerup',     onUp);
    el.removeEventListener('pointercancel', onUp);
    scaleSpring.destroy();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. RUBBER-BAND OVERSCROLL
//    Applies iOS-style resistance at scroll boundaries; spring-returns on
//    release.
//
//    ⚠ NOT CURRENTLY WIRED — and pointer events are the wrong primitive for
//    a scroll container with touch-action: pan-y: the browser claims the
//    vertical pan (pointercancel) before preventDefault on pointermove can
//    do anything. Wiring this to a touch scroller requires NATIVE
//    touchstart/touchmove listeners with { passive: false } — which makes
//    every scroll on that element block on the main thread. Prefer the
//    native Android 12+ stretch (enabled by overscroll-behavior: contain)
//    or scoped non-scrolling surfaces.
// ─────────────────────────────────────────────────────────────────────────────

export interface RubberBandOptions {
  /**
   * Consulted when an edge gesture begins. Return false to yield the edge —
   * e.g. tabs embedding PullToRefresh own the top edge themselves, and a
   * simultaneous container bounce would double the motion.
   */
  shouldEngage?: (edge: 'top' | 'bottom') => boolean;
}

export function attachRubberBand(container: HTMLElement, options: RubberBandOptions = {}): () => void {
  const spring = new SpringValue(0, SPRING_PRESETS.rubber);
  spring.onChange(v => {
    // translateZ(0) keeps the container's compositor-layer promotion (the
    // inline hint this write replaces).
    container.style.transform = `translateZ(0) translateY(${v.toFixed(2)}px)`;
  });

  let pid: number | null = null;
  let startY = 0, dragging = false;

  // iOS rubber-band curve: slope ~0.55 at the origin (resists from the very
  // first pixel), asymptotically approaching the container height. The
  // previous formula had slope 2 at the origin — it AMPLIFIED small drags.
  const rubberBand = (dy: number): number => {
    const sign = dy >= 0 ? 1 : -1;
    const abs  = Math.abs(dy);
    const size = container.clientHeight;
    return sign * (1 - 1 / ((abs * 0.55) / size + 1)) * size;
  };

  const isAtTop    = () => container.scrollTop <= 0;
  const isAtBottom = () =>
    container.scrollTop + container.clientHeight >= container.scrollHeight - 1;

  const onDown = (e: PointerEvent): void => {
    if (pid !== null || e.pointerType === 'mouse') return;
    pid = e.pointerId;
    startY   = e.clientY;
    dragging = false;
    spring.snap(0);
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    const dy = e.clientY - startY;

    if ((dy > 0 && isAtTop()) || (dy < 0 && isAtBottom())) {
      const edge: 'top' | 'bottom' = dy > 0 ? 'top' : 'bottom';
      if (!dragging && options.shouldEngage && !options.shouldEngage(edge)) {
        // Keep the anchor fresh so a yielded edge gesture doesn't accumulate
        // into our delta if the user later reverses direction.
        startY = e.clientY;
        return;
      }
      dragging = true;
      spring.snap(rubberBand(dy));
      e.preventDefault(); // stop native scroll only at boundaries
    }
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (dragging) {
      dragging = false;
      spring.to(0);
    }
  };

  // passive: false so we can call preventDefault at boundaries
  container.addEventListener('pointerdown',   onDown, { passive: true });
  container.addEventListener('pointermove',   onMove, { passive: false });
  container.addEventListener('pointerup',     onUp,   { passive: true });
  container.addEventListener('pointercancel', onUp,   { passive: true });

  return () => {
    container.removeEventListener('pointerdown',   onDown);
    container.removeEventListener('pointermove',   onMove);
    container.removeEventListener('pointerup',     onUp);
    container.removeEventListener('pointercancel', onUp);
    spring.destroy();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. VIEW TRANSITIONS API WRAPPER
//    Wraps navigation in document.startViewTransition.
//    Sets data-nav-dir on <html> so CSS can pick directional keyframes.
//    Falls back to direct call on unsupported browsers (< iOS 17, Chrome < 111).
//
//    Pass React's `flushSync` as the 3rd argument to make state updates
//    synchronous inside the transition snapshot — required for React:
//
//    import { flushSync } from 'react-dom';
//    navigateWithTransition(() => setView('timeline'), 'push', flushSync);
// ─────────────────────────────────────────────────────────────────────────────

export type NavDirection = 'push' | 'pop' | 'tab' | 'modal';

export function navigateWithTransition(
  navigate: () => void,
  direction: NavDirection = 'tab',
  flushSync?: (fn: () => void) => void,
): Promise<void> {
  if (typeof document === 'undefined' || !('startViewTransition' in document)) {
    navigate();
    return Promise.resolve();
  }

  const root = document.documentElement;
  const navToken = String((Number(root.dataset.navToken || '0') || 0) + 1);
  root.dataset.navDir = direction;
  root.dataset.navActive = 'true';
  root.dataset.navToken = navToken;

  const vt = (document as Document & {
    startViewTransition: (cb: () => void) => { finished: Promise<void> };
  }).startViewTransition(() => {
    if (flushSync) flushSync(navigate);
    else navigate();
  });

  return vt.finished.catch(() => undefined).finally(() => {
    if (root.dataset.navToken === navToken) {
      delete root.dataset.navDir;
      delete root.dataset.navActive;
      delete root.dataset.navToken;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. GLOBAL GESTURE INIT
//    Call once at app startup (index.tsx).
//
//    What it does:
//    • Sets up delegated pointerdown/up/cancel listener for [data-press]
//    • Injects minimal CSS for [data-press] and [data-drag] attribute hooks
//
//    [data-press] — opt any element into native spring press feedback.
//    This intentionally does NOT touch framer-motion elements (MagneticButton,
//    motion.div with whileTap) — those already have equivalent behavior.
// ─────────────────────────────────────────────────────────────────────────────

export function initGlobalGestures(): () => void {
  // ── CSS injection ──────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = 'lior-gesture-css';
  style.textContent = `
    [data-press] {
      touch-action: manipulation !important;
      -webkit-tap-highlight-color: transparent !important;
      user-select: none !important;
      cursor: pointer;
      will-change: transform, opacity;
    }
    [data-drag] {
      touch-action: none !important;
      -webkit-tap-highlight-color: transparent !important;
      user-select: none !important;
      cursor: grab;
      will-change: transform;
    }
    [data-drag]:active { cursor: grabbing; }
  `;
  document.head.appendChild(style);

  // ── Delegated spring pool ──────────────────────────────────────────────────
  const pool = new WeakMap<Element, { sc: SpringValue; op: SpringValue }>();

  function ensure(el: HTMLElement) {
    if (!pool.has(el)) {
      const sc = new SpringValue(1, SPRING_PRESETS.button);
      const op = new SpringValue(1, SPRING_PRESETS.button);
      sc.onChange(v => { el.style.transform = `scale(${v.toFixed(4)})`; });
      op.onChange(v => { el.style.opacity   = v.toFixed(4); });
      pool.set(el, { sc, op });
    }
    return pool.get(el)!;
  }

  function restore(el: HTMLElement | null): void {
    if (!el) return;
    const sp = pool.get(el);
    if (sp) { sp.sc.to(1); sp.op.to(1); }
  }

  let activeEl: HTMLElement | null  = null;
  let activePid: number | null      = null;

  const onDown = (e: PointerEvent): void => {
    const target = (e.target as HTMLElement).closest('[data-press]') as HTMLElement | null;
    if (!target) return;
    activeEl  = target;
    activePid = e.pointerId;
    const { sc, op } = ensure(target);
    // Immediate synchronous feedback
    target.style.transform = 'scale(0.97)';
    target.style.opacity   = '0.88';
    sc.snap(0.97);
    op.snap(0.88);
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== activePid) return;
    restore(activeEl);
    activeEl  = null;
    activePid = null;
  };

  document.addEventListener('pointerdown',   onDown, { passive: true });
  document.addEventListener('pointerup',     onUp,   { passive: true });
  document.addEventListener('pointercancel', onUp,   { passive: true });

  return () => {
    document.removeEventListener('pointerdown',   onDown);
    document.removeEventListener('pointerup',     onUp);
    document.removeEventListener('pointercancel', onUp);
    style.remove();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. REACT HOOK HELPERS
//     Import from 'lior/utils/gesture' in any component.
//     Each hook attaches a gesture on mount and cleans up on unmount.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type RefObject } from 'react';

/**
 * usePress — attach press gesture to a ref.
 *
 *   const ref = useRef<HTMLButtonElement>(null);
 *   usePress(ref, { onUp: () => doAction() });
 *   return <button ref={ref} data-press>Click me</button>;
 */
export function usePress(
  ref: RefObject<HTMLElement | null>,
  opts: PressOptions,
): void {
  useEffect(() => {
    if (!ref.current) return;
    return attachPress(ref.current, opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}

/**
 * useDrag — attach drag gesture to a ref.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useDrag(ref, { axis: 'both', onEnd: (x, y) => savePosition(x, y) });
 *   return <div ref={ref} data-drag>Drag me</div>;
 */
export function useDrag(
  ref: RefObject<HTMLElement | null>,
  opts: DragOptions,
): void {
  useEffect(() => {
    if (!ref.current) return;
    return attachDrag(ref.current, opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}

/**
 * useModalDismiss — pull-down-to-dismiss gesture on a sheet/modal element.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useModalDismiss(ref, { onDismiss: close, onProgress: p => setOpacity(1 - p) });
 *   return <div ref={ref}>Sheet content</div>;
 */
export function useModalDismiss(
  ref: RefObject<HTMLElement | null>,
  opts: ModalDismissOptions,
): void {
  useEffect(() => {
    if (!ref.current) return;
    return attachModalDismiss(ref.current, opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}


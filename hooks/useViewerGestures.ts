import { useCallback, useEffect, useMemo, useRef } from 'react';
import { animate, useMotionValue, type MotionValue } from 'framer-motion';

/**
 * Native photo-viewer gesture controller for the memory detail sheet.
 *
 * One pointer state machine drives every gesture on the hero media area:
 *   • vertical-down drag  → sheet follows the finger 1:1, release past the
 *     threshold (or a fast fling) dismisses — iOS Photos style
 *   • horizontal drag     → swipe between memories, with rubber-band
 *     resistance at either end of the timeline
 *   • two fingers / double-tap → pinch-zoom + pan (images only); while
 *     zoomed, single-finger drags pan the image instead of navigating
 *
 * The hook owns raw pointer events instead of framer-motion's drag so the
 * three gestures can share one intent-resolution pass without fighting
 * each other (framer locks its axis at pointerdown; we need to decide
 * after ~10px of movement).
 */

type GestureMode = 'idle' | 'pending' | 'dismiss' | 'swipe' | 'pinch' | 'pan';

const INTENT_THRESHOLD_PX = 10;
const DISMISS_DISTANCE_PX = 120;
const DISMISS_VELOCITY = 0.55; // px per ms
const SWIPE_DISTANCE_PX = 64;
const SWIPE_VELOCITY = 0.45; // px per ms
const EDGE_RESISTANCE = 0.28;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.4;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_SLOP_PX = 28;
const ZOOM_RESET_BELOW = 1.12;

interface PointerSample {
  x: number;
  y: number;
  t: number;
}

interface ViewerGesturesOptions {
  onDismiss: () => void;
  onNavigate: (direction: 1 | -1) => void;
  canNavigate: (direction: 1 | -1) => boolean;
  /** Pinch/double-tap zoom only applies to still images. */
  zoomEnabled: boolean;
}

interface ViewerGestures {
  /** Bind to the outer sheet wrapper: style={{ y: sheetY }} */
  sheetY: MotionValue<number>;
  /** Bind to the hero media container: style={{ x: heroX }} */
  heroX: MotionValue<number>;
  /** Attach to the zoomable <img> element. */
  zoomTargetRef: (el: HTMLElement | null) => void;
  /** Spread onto the hero container and the sheet drag handle. */
  heroHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  };
  /** Reset hero offset after the parent swaps the displayed memory. */
  resetAfterNavigate: () => void;
}

interface ZoomState {
  scale: number;
  tx: number;
  ty: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function useViewerGestures(options: ViewerGesturesOptions): ViewerGestures {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const sheetY = useMotionValue(0);
  const heroX = useMotionValue(0);

  const mode = useRef<GestureMode>('idle');
  const primaryId = useRef<number | null>(null);
  const pointers = useRef(new Map<number, PointerSample>());
  const start = useRef<PointerSample>({ x: 0, y: 0, t: 0 });
  const lastSample = useRef<PointerSample>({ x: 0, y: 0, t: 0 });
  const prevSample = useRef<PointerSample>({ x: 0, y: 0, t: 0 });
  const lastTap = useRef<PointerSample | null>(null);

  const zoomEl = useRef<HTMLElement | null>(null);
  const zoom = useRef<ZoomState>({ scale: 1, tx: 0, ty: 0 });
  const pinchBase = useRef<{
    dist: number;
    midX: number;
    midY: number;
    // Untransformed top-left of the zoom element, captured once at pinch
    // start — the live rect moves with every transform we apply.
    originX: number;
    originY: number;
    state: ZoomState;
  } | null>(null);
  const panBase = useRef<ZoomState>({ scale: 1, tx: 0, ty: 0 });

  const applyZoom = useCallback((next: ZoomState, animated: boolean) => {
    const el = zoomEl.current;
    zoom.current = next;
    if (!el) return;
    el.style.transition = animated ? 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    el.style.transformOrigin = '0 0';
    el.style.transform = `translate3d(${next.tx}px, ${next.ty}px, 0) scale(${next.scale})`;
    el.style.willChange = next.scale > 1 ? 'transform' : '';
  }, []);

  const zoomTargetRef = useCallback((el: HTMLElement | null) => {
    zoomEl.current = el;
    if (el) applyZoom({ scale: 1, tx: 0, ty: 0 }, false);
  }, [applyZoom]);

  const clampPan = useCallback((state: ZoomState): ZoomState => {
    const el = zoomEl.current;
    if (!el) return state;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    return {
      scale: state.scale,
      tx: clamp(state.tx, w - w * state.scale, 0),
      ty: clamp(state.ty, h - h * state.scale, 0),
    };
  }, []);

  const isZoomed = () => zoom.current.scale > 1.02;

  const settleRelease = useCallback(() => {
    const dy = lastSample.current.y - start.current.y;
    const dx = lastSample.current.x - start.current.x;
    const dt = Math.max(1, lastSample.current.t - prevSample.current.t);
    const vy = (lastSample.current.y - prevSample.current.y) / dt;
    const vx = (lastSample.current.x - prevSample.current.x) / dt;
    const opts = optionsRef.current;

    if (mode.current === 'dismiss') {
      if (dy > DISMISS_DISTANCE_PX || vy > DISMISS_VELOCITY) {
        opts.onDismiss();
      } else {
        animate(sheetY, 0, { type: 'spring', stiffness: 480, damping: 38 });
      }
    } else if (mode.current === 'swipe') {
      const direction: 1 | -1 = dx < 0 ? 1 : -1; // swipe left → next (newer-to-older list)
      const passed = Math.abs(dx) > SWIPE_DISTANCE_PX || Math.abs(vx) > SWIPE_VELOCITY;
      if (passed && opts.canNavigate(direction)) {
        opts.onNavigate(direction);
      } else {
        animate(heroX, 0, { type: 'spring', stiffness: 520, damping: 36 });
      }
    } else if (mode.current === 'pinch' || mode.current === 'pan') {
      if (zoom.current.scale < ZOOM_RESET_BELOW) {
        applyZoom({ scale: 1, tx: 0, ty: 0 }, true);
      } else {
        applyZoom(clampPan(zoom.current), true);
      }
    }
  }, [applyZoom, clampPan, heroX, sheetY]);

  const detachWindowListeners = useRef<() => void>(() => {});

  const handleMove = useCallback((e: PointerEvent) => {
    const tracked = pointers.current.get(e.pointerId);
    if (!tracked) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });

    if (mode.current === 'pinch') {
      const base = pinchBase.current;
      const pts = Array.from(pointers.current.values());
      if (!base || pts.length < 2) return;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const scale = clamp(base.state.scale * (dist / Math.max(1, base.dist)), 1, MAX_SCALE);
      // Keep the content point that sat under the pinch midpoint at gesture
      // start anchored under the (possibly moved) midpoint now.
      const localMidX = base.midX - base.originX;
      const localMidY = base.midY - base.originY;
      const ratio = scale / base.state.scale;
      applyZoom({
        scale,
        tx: base.state.tx + (localMidX - base.state.tx) * (1 - ratio) + (midX - base.midX),
        ty: base.state.ty + (localMidY - base.state.ty) * (1 - ratio) + (midY - base.midY),
      }, false);
      return;
    }

    if (e.pointerId !== primaryId.current) return;
    prevSample.current = lastSample.current;
    lastSample.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    if (mode.current === 'pending') {
      if (Math.hypot(dx, dy) < INTENT_THRESHOLD_PX) return;
      if (isZoomed()) {
        mode.current = 'pan';
        panBase.current = { ...zoom.current };
      } else if (Math.abs(dy) > Math.abs(dx)) {
        // Upward drags have nothing to do — only follow downward pulls.
        mode.current = dy > 0 ? 'dismiss' : 'idle';
      } else {
        mode.current = 'swipe';
      }
    }

    if (mode.current === 'dismiss') {
      sheetY.set(Math.max(0, dy));
    } else if (mode.current === 'swipe') {
      const direction: 1 | -1 = dx < 0 ? 1 : -1;
      const resisted = optionsRef.current.canNavigate(direction) ? dx : dx * EDGE_RESISTANCE;
      heroX.set(resisted);
    } else if (mode.current === 'pan') {
      applyZoom(clampPan({
        scale: panBase.current.scale,
        tx: panBase.current.tx + dx,
        ty: panBase.current.ty + dy,
      }), false);
    }
  }, [applyZoom, clampPan, heroX, sheetY]);

  const handleUp = useCallback((e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);

    if (mode.current === 'pinch') {
      pinchBase.current = null;
      if (pointers.current.size === 1) {
        // One finger lifted — remaining finger continues as a pan.
        const [remainingId, remaining] = Array.from(pointers.current.entries())[0];
        primaryId.current = remainingId;
        start.current = remaining;
        lastSample.current = remaining;
        prevSample.current = remaining;
        mode.current = isZoomed() ? 'pan' : 'idle';
        panBase.current = { ...zoom.current };
        return;
      }
    }

    if (pointers.current.size > 0) return;

    // Double-tap to zoom (images only, no drag happened).
    const moved = Math.hypot(
      lastSample.current.x - start.current.x,
      lastSample.current.y - start.current.y,
    );
    if (optionsRef.current.zoomEnabled && mode.current === 'pending' && moved < INTENT_THRESHOLD_PX) {
      const tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      const prior = lastTap.current;
      lastTap.current = tap;
      if (prior && tap.t - prior.t < DOUBLE_TAP_MS && Math.hypot(tap.x - prior.x, tap.y - prior.y) < DOUBLE_TAP_SLOP_PX) {
        lastTap.current = null;
        if (isZoomed()) {
          applyZoom({ scale: 1, tx: 0, ty: 0 }, true);
        } else {
          const rect = zoomEl.current?.getBoundingClientRect();
          if (rect) {
            const localX = tap.x - rect.left;
            const localY = tap.y - rect.top;
            applyZoom(clampPan({
              scale: DOUBLE_TAP_SCALE,
              tx: localX * (1 - DOUBLE_TAP_SCALE),
              ty: localY * (1 - DOUBLE_TAP_SCALE),
            }), true);
          }
        }
      }
    } else {
      settleRelease();
    }

    mode.current = 'idle';
    detachWindowListeners.current();
  }, [applyZoom, clampPan, settleRelease]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const sample = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    pointers.current.set(e.pointerId, sample);

    if (pointers.current.size === 2 && optionsRef.current.zoomEnabled) {
      const pts = Array.from(pointers.current.values());
      const rect = zoomEl.current?.getBoundingClientRect();
      mode.current = 'pinch';
      // Any in-flight follow offsets snap home before the pinch engages.
      sheetY.set(0);
      heroX.set(0);
      pinchBase.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        originX: rect ? rect.left - zoom.current.tx : 0,
        originY: rect ? rect.top - zoom.current.ty : 0,
        state: { ...zoom.current },
      };
      return;
    }
    if (pointers.current.size > 1) return;

    mode.current = 'pending';
    primaryId.current = e.pointerId;
    start.current = sample;
    lastSample.current = sample;
    prevSample.current = sample;

    detachWindowListeners.current();
    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp, { passive: true });
    window.addEventListener('pointercancel', handleUp, { passive: true });
    detachWindowListeners.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      detachWindowListeners.current = () => {};
    };
  }, [handleMove, handleUp]);

  useEffect(() => () => detachWindowListeners.current(), []);

  const resetAfterNavigate = useCallback(() => {
    heroX.jump(0);
    applyZoom({ scale: 1, tx: 0, ty: 0 }, false);
  }, [applyZoom, heroX]);

  return useMemo(() => ({
    sheetY,
    heroX,
    zoomTargetRef,
    heroHandlers: { onPointerDown },
    resetAfterNavigate,
  }), [sheetY, heroX, zoomTargetRef, onPointerDown, resetAfterNavigate]);
}

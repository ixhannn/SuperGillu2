/**
 * DeferredOverlays — Idle-mounted decorative canvases.
 *
 * `PhysicsConfetti` and `TouchTrailCanvas` were previously mounted eagerly in
 * Layout. Each is a `<canvas>` element that creates a compositor layer + GPU
 * memory allocation the moment it mounts, even when no particles are alive.
 * On mid-range Android they cost ~5–15ms of work during the first frame —
 * directly competing with the app's first paint.
 *
 * Strategy:
 *   1. On first paint, render nothing — give Home/Us/etc. the entire frame
 *      budget for their initial mount.
 *   2. Once the browser is idle (`requestIdleCallback`, or 1500ms fallback),
 *      mount the canvases via `React.lazy`. By then the user is reading the
 *      already-painted UI; the small mount cost is invisible.
 *
 * The `ConfettiHandle` ref still works the same way — until the lazy mount
 * resolves, calls to `trigger()` no-op silently. Confetti is decorative; a
 * missed first-frame celebration is acceptable.
 */
import React, { Suspense, useEffect, useState, useImperativeHandle, forwardRef, useRef } from 'react';
import type { ConfettiHandle } from './PhysicsConfetti';

const LazyPhysicsConfetti = React.lazy(() =>
  import('./PhysicsConfetti').then((m) => ({ default: m.PhysicsConfetti })),
);

const LazyTouchTrailCanvas = React.lazy(() =>
  import('./TouchTrailCanvas').then((m) => ({ default: m.TouchTrailCanvas })),
);

type WindowWithIdle = Window & {
  requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const DEFER_MS = 1500;

interface DeferredOverlaysProps {
  /** Forwarded confetti handle so the rest of the app keeps the same API. */
  confettiRef?: React.Ref<ConfettiHandle>;
}

/**
 * Bridge ref — captures `trigger` calls before the real component mounts and
 * forwards them once the lazy chunk resolves. Calls fired before mount are
 * silently dropped (the celebration would have been off-screen anyway).
 */
const ConfettiBridge = forwardRef<ConfettiHandle, { mounted: boolean; innerRef: React.Ref<ConfettiHandle> | undefined }>(
  ({ mounted, innerRef }, ref) => {
    const realRef = useRef<ConfettiHandle | null>(null);

    useImperativeHandle(ref, () => ({
      trigger: (x?: number, y?: number) => {
        if (!mounted) return; // Pre-mount celebrations silently dropped
        realRef.current?.trigger(x, y);
      },
    }), [mounted]);

    useImperativeHandle(innerRef as React.MutableRefObject<ConfettiHandle | null>, () => ({
      trigger: (x?: number, y?: number) => {
        if (!mounted) return;
        realRef.current?.trigger(x, y);
      },
    }), [mounted, innerRef]);

    if (!mounted) return null;
    return (
      <Suspense fallback={null}>
        <LazyPhysicsConfetti ref={realRef} />
      </Suspense>
    );
  }
);
ConfettiBridge.displayName = 'ConfettiBridge';

export const DeferredOverlays = forwardRef<ConfettiHandle, DeferredOverlaysProps>(({ confettiRef }, ref) => {
  const [overlaysReady, setOverlaysReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // No device-tier gate here — every device mounts the same overlays so
    // visuals are identical. Cost is controlled inside each overlay via
    // AnimationEngine subscriber priority + frame budget.

    const win = window as WindowWithIdle;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const enable = () => { if (!cancelled) setOverlaysReady(true); };

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(enable, { timeout: DEFER_MS });
    } else {
      timeoutId = window.setTimeout(enable, DEFER_MS);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      <ConfettiBridge ref={ref} innerRef={confettiRef} mounted={overlaysReady} />
      {overlaysReady && (
        <Suspense fallback={null}>
          <LazyTouchTrailCanvas />
        </Suspense>
      )}
    </>
  );
});
DeferredOverlays.displayName = 'DeferredOverlays';

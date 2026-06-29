/**
 * useThrottledReload — coalesce storage / sync events into one reload tick.
 *
 * Storage events fire frequently and many views call full loadData() in
 * response. This hook coalesces N events arriving in the same frame into
 * a single rAF-tick callback, avoiding the "10 events → 10 full reloads"
 * pattern that costs measurable time on mid-range mobile.
 *
 * Usage:
 *   const reload = useThrottledReload(loadData);
 *   useEffect(() => {
 *     storageEventTarget.addEventListener('storage-update', reload);
 *     return () => storageEventTarget.removeEventListener('storage-update', reload);
 *   }, [reload]);
 */
import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a stable event-handler callback that triggers `runner` at most
 * once per animation frame. Subsequent events in the same frame are
 * absorbed (no extra calls). The runner is also called immediately on
 * the first event in a quiet window, so UI updates feel snappy.
 */
export function useThrottledReload(runner: () => void): () => void {
  // Pin the latest runner in a ref so the returned handler stays stable
  // (avoids re-binding event listeners every render).
  const runnerRef = useRef(runner);
  runnerRef.current = runner;

  const pendingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const handlerRef = useRef<(() => void) | null>(null);

  if (!handlerRef.current) {
    handlerRef.current = () => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      // requestAnimationFrame guarantees we run at most once per visible
      // frame, regardless of how many events fire in that window.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        pendingRef.current = false;
        try {
          runnerRef.current?.();
        } catch (error: unknown) {
          if (import.meta.env.DEV) {
            // Keep the error visible during development; release builds
            // shouldn't crash on a single failed reload.
            // eslint-disable-next-line no-console
            console.error('[useThrottledReload] reload failed', error);
          }
        }
      });
    };
  }

  // Clean up the pending flag and cancel any in-flight rAF on unmount so a
  // future mount starts clean and the runner can't fire post-unmount.
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    pendingRef.current = false;
  }, []);

  return useCallback(() => handlerRef.current?.(), []);
}

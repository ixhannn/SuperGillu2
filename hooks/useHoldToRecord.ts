import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseHoldToRecordOptions {
  durationMs?: number;
  onStart?: () => void | Promise<void>;
  onRelease?: (heldMs: number, reachedFull: boolean) => void | Promise<void>;
  onCancel?: () => void;
  /** Minimum hold in ms before release is considered a valid take. */
  minHoldMs?: number;
}

export interface UseHoldToRecordReturn {
  isHolding: boolean;
  /** 0 -> 1 as progress from press start to durationMs */
  progress: number;
  /** Elapsed ms since press started. */
  elapsedMs: number;
  bind: {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
    onPointerLeave: (event: React.PointerEvent) => void;
    onPointerCancel: (event: React.PointerEvent) => void;
  };
}

/**
 * Pointer-hold with synced progress animation.
 *
 * - Press and hold -> progress animates from 0 to 1 over durationMs.
 * - Auto-resolves onRelease(duration, true) when user holds the full durationMs.
 * - Releasing early calls onRelease(heldMs, false).
 * - Leaving the element or pointer cancel calls onCancel.
 */
export function useHoldToRecord(options: UseHoldToRecordOptions = {}): UseHoldToRecordReturn {
  const {
    durationMs = 5000,
    onStart,
    onRelease,
    onCancel,
    minHoldMs = 400,
  } = options;

  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedRef = useRef(false);

  const clearLoops = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (autoStopRef.current !== null) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearLoops();
    };
  }, [clearLoops]);

  const tick = useCallback(() => {
    const now = performance.now();
    const elapsed = now - startTimeRef.current;
    const ratio = Math.min(elapsed / durationMs, 1);
    setElapsedMs(elapsed);
    setProgress(ratio);
    if (ratio < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [durationMs]);

  const handleStart = useCallback((event: React.PointerEvent) => {
    if (isHolding) return;
    resolvedRef.current = false;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    startTimeRef.current = performance.now();
    setIsHolding(true);
    setProgress(0);
    setElapsedMs(0);
    rafRef.current = requestAnimationFrame(tick);
    autoStopRef.current = setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      clearLoops();
      setIsHolding(false);
      setProgress(1);
      setElapsedMs(durationMs);
      void onRelease?.(durationMs, true);
    }, durationMs);
    void onStart?.();
  }, [isHolding, tick, durationMs, onStart, onRelease, clearLoops]);

  const handleEnd = useCallback((_event: React.PointerEvent, kind: 'release' | 'cancel') => {
    if (!isHolding || resolvedRef.current) return;
    resolvedRef.current = true;
    const heldMs = performance.now() - startTimeRef.current;
    clearLoops();
    setIsHolding(false);

    if (kind === 'cancel' || heldMs < minHoldMs) {
      setProgress(0);
      setElapsedMs(0);
      onCancel?.();
      return;
    }

    void onRelease?.(heldMs, heldMs >= durationMs);
  }, [isHolding, clearLoops, minHoldMs, durationMs, onRelease, onCancel]);

  const bind = {
    onPointerDown: (event: React.PointerEvent) => handleStart(event),
    onPointerUp: (event: React.PointerEvent) => handleEnd(event, 'release'),
    onPointerLeave: (event: React.PointerEvent) => handleEnd(event, 'cancel'),
    onPointerCancel: (event: React.PointerEvent) => handleEnd(event, 'cancel'),
  };

  return { isHolding, progress, elapsedMs, bind };
}

import { useCallback, useEffect, useRef } from 'react';

/**
 * useLongPress — native-style press-and-hold detection.
 *
 * Fires `onLongPress` after the hold delay unless the finger moves (scroll)
 * or lifts first. The click that the browser synthesizes after a completed
 * long-press is swallowed so the element's tap action does not also run.
 * The native context menu (e.g. Android WebView's image save sheet) is
 * suppressed while the handlers are attached.
 */

interface LongPressOptions {
  delayMs?: number;
  moveTolerancePx?: number;
}

export function useLongPress(
  onLongPress: () => void,
  { delayMs = 450, moveTolerancePx = 10 }: LongPressOptions = {},
) {
  const timer = useRef<number | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    startPoint.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    firedRef.current = false;
    startPoint.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      timer.current = null;
      firedRef.current = true;
      callbackRef.current();
    }, delayMs);
  }, [clear, delayMs]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const origin = startPoint.current;
    if (!origin) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > moveTolerancePx) clear();
  }, [clear, moveTolerancePx]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!firedRef.current) return;
    firedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture,
    onContextMenu,
  };
}

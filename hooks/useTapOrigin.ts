/**
 * useTapOrigin — grow an in-place overlay OUT OF the control that opened it.
 *
 * The route engine already blooms full-screen opens from the tapped tile/button
 * (TransitionEngine + useTileOpen). This brings the same feel to framer-driven
 * overlays that DON'T go through the route engine — centred dialogs, detail
 * viewers, lightboxes: instead of scaling from screen centre they scale from the
 * control the user tapped.
 *
 * Usage: attach `ref` to the overlay's animating box and feed `origin` into its
 * style.transformOrigin. The overlay keeps its existing scale/opacity animation;
 * only the ORIGIN of that scale changes.
 *
 *   const { ref, origin } = useTapOrigin(isOpen);
 *   <motion.div ref={ref} style={{ transformOrigin: origin }} … />
 *
 * Falls back to '50% 50%' (centre) when there's no fresh tap or reduced motion —
 * so a keyboard/programmatic open, or a motion-sensitive user, still gets the
 * original centred scale. The element's transform is briefly neutralised while
 * measuring so framer's initial scale doesn't skew the origin.
 */
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { TransitionEngine } from '../utils/TransitionEngine';

const CENTER = '50% 50%';

export function useTapOrigin<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
): { ref: RefObject<T | null>; origin: string } {
  const ref = useRef<T | null>(null);
  const [origin, setOrigin] = useState(CENTER);

  useLayoutEffect(() => {
    if (!open) { setOrigin(CENTER); return; }
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tap = TransitionEngine.peekTapOrigin();
    const el = ref.current;
    if (reduce || !tap || !el) { setOrigin(CENTER); return; }

    // Neutralise framer's initial transform so getBoundingClientRect returns the
    // element's TRUE laid-out box (otherwise the initial scale skews the origin).
    const prev = el.style.transform;
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = prev;
    if (r.width < 1 || r.height < 1) { setOrigin(CENTER); return; }

    const tx = tap.x + tap.w / 2;
    const ty = tap.y + tap.h / 2;
    const clamp = (v: number) => Math.max(-20, Math.min(120, v));
    setOrigin(
      `${clamp(((tx - r.left) / r.width) * 100).toFixed(1)}% ${clamp(((ty - r.top) / r.height) * 100).toFixed(1)}%`,
    );
  }, [open]);

  return { ref, origin };
}

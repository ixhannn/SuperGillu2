/**
 * useTileOpen — adds an "open" lift animation before navigating away.
 *
 * Tap a card → the card briefly lifts (scale + shadow grows, ~220ms CSS
 * keyframe `tile-lift` declared in index.css), then `navigate()` fires.
 * The user sees the card "pick up" before the next view slides in — a
 * cheap detail that makes navigation feel curated, not abrupt.
 *
 * Implementation:
 *   • Pure CSS keyframe on the compositor thread
 *   • Listener cleanup via animationend
 *   • Falls back to instant navigation if reduced-motion is on
 *
 * Usage:
 *   const open = useTileOpen();
 *   <div onClick={(e) => open(e, () => setView('time-capsule'))} />
 */
import { useCallback } from 'react';

const LIFT_CLASS = 'tile-open-lifting';
const LIFT_MS = 220; // matches tile-lift keyframe in index.css

type Target = HTMLElement | null;

const findLiftTarget = (start: Target): HTMLElement | null => {
  // Walk up looking for an element with .bento-card / .aurora-card /
  // .spring-press — those are the touchable surfaces. Falls back to the
  // closest positioned ancestor.
  let el: HTMLElement | null = start;
  while (el && el !== document.body) {
    if (
      el.classList.contains('bento-card') ||
      el.classList.contains('aurora-card') ||
      el.classList.contains('spring-press')
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return start;
};

export function useTileOpen(): (
  event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  navigate: () => void,
) => void {
  return useCallback((event, navigate) => {
    // Honor accessibility preference — skip the animation entirely.
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      navigate();
      return;
    }

    const target = findLiftTarget(event.currentTarget as HTMLElement);
    if (target) {
      target.classList.add(LIFT_CLASS);
      // Auto-remove after the keyframe completes. If the source view is
      // already unmounted by the time this fires, removeClass is a no-op.
      window.setTimeout(() => {
        target.classList.remove(LIFT_CLASS);
      }, LIFT_MS + 40);
    }

    // Fire navigation in parallel — the lift animates concurrently with
    // the page transition snapshot, so the user sees the card lift AND
    // the new page begin sliding in at the same time. This is what makes
    // it feel "premium" vs blocked.
    navigate();
  }, []);
}
// Reference LIFT_MS so the constant isn't dead-stripped by tsc strict mode.
export const TILE_LIFT_MS = LIFT_MS;

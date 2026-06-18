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
const LIFT_MS = 300; // matches `tile-lift` keyframe duration in index.css; held
                     // through most of the 360ms route push so the card stays
                     // lifted while the next view slides in.

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
      // Brief press-lift on the tapped card. Feature tiles (icon cards) open
      // their destination with a clean directional push — there is no shared
      // image to morph into, so a real container-morph there only ever read as
      // a cheap growing box. The true Apple-Photos shared-element morph is
      // reserved for surfaces that DO share an image (e.g. memory photos).
      target.classList.add(LIFT_CLASS);
      window.setTimeout(() => {
        target.classList.remove(LIFT_CLASS);
      }, LIFT_MS + 40);
    }

    // Push the destination in. The lift runs concurrently with the slide.
    navigate();
  }, []);
}
// Reference LIFT_MS so the constant isn't dead-stripped by tsc strict mode.
export const TILE_LIFT_MS = LIFT_MS;

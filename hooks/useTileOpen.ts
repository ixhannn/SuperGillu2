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
      // Brief press-lift on the tapped card.
      target.classList.add(LIFT_CLASS);
      window.setTimeout(() => {
        target.classList.remove(LIFT_CLASS);
      }, LIFT_MS + 40);

      // Bloom the next page OUT OF the card the finger touched. We publish the
      // card's viewport-space centre as --lior-open-x/y and flag the open as an
      // "expand"; TransitionEngine.navigate() upgrades the push to its expand
      // branch, which reads these vars to set the new page's transform-origin —
      // so the entrance scales up from the tapped tile instead of screen-centre.
      // (This is the subtle content bloom, NOT the old clip/box morph that read
      // as cheap. The engine consumes + clears the flag on the next navigate.)
      const r = target.getBoundingClientRect();
      const root = document.documentElement;
      root.style.setProperty('--lior-open-x', `${Math.round(r.left + r.width / 2)}px`);
      root.style.setProperty('--lior-open-y', `${Math.round(r.top + r.height / 2)}px`);
      root.dataset.liorOpenExpand = '1';
    }

    // Push the destination in. The lift runs concurrently with the bloom.
    navigate();
  }, []);
}
// Reference LIFT_MS so the constant isn't dead-stripped by tsc strict mode.
export const TILE_LIFT_MS = LIFT_MS;

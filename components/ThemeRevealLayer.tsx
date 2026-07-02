import React, { useEffect, useRef } from 'react';
import {
  themeEventTarget,
  ThemeService,
  REVEAL_GROW_MS,
  REVEAL_FADE_MS,
  type ThemeRevealDetail,
} from '../services/theme';

/**
 * ThemeRevealLayer — the cinematic theme-change wipe.
 *
 * Mounted inside Layout's shell but painted ABOVE all content (high z-index, see
 * index.css) so the reveal is actually VISIBLE — an earlier behind-content
 * (z-index:-1) version was almost entirely occluded by cards on content-heavy
 * screens, so a theme change looked instant.
 *
 * MECHANISM — GPU-cheap, true reveal. An OPAQUE disc of the incoming theme grows
 * from the tapped swatch via `transform: scale()` (a small BASE_PX circle scaled
 * up — tiny texture, composited, no per-frame repaint). The outgoing theme stays
 * fully rendered underneath until the disc COVERS the screen; then ThemeService
 * commits the whole new theme beneath the disc (one repaint, hidden) and the disc
 * DISSOLVES to reveal it. So: old theme → new sweeps in from your finger →
 * settles. Only `transform` + `opacity` animate (no lag). Works for every theme
 * incl. light↔dark (the swap is always hidden). Skipped under reduced motion
 * (CSS `display:none` + ThemeService never dispatches the event).
 */
const GROW_EASE = 'cubic-bezier(0.4, 0.0, 0.2, 1)';
const BASE_PX = 240;

export const ThemeRevealLayer: React.FC = () => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;

    const handleReveal = (event: Event) => {
      const detail = (event as CustomEvent<ThemeRevealDetail>).detail;
      if (!detail) return;
      const { discBg, originX, originY } = detail;

      // Clear any held end-states from a prior (possibly mid-flight) reveal so the
      // fresh inline styles below take effect. Cancelling rejects the prior
      // grow/fade `finished` promises, so their commit/teardown `.then`s no-op.
      // ThemeService.applyTheme already dropped the prior reveal's pending commit,
      // so the app still shows the current theme — we wipe onward to the new one.
      el.getAnimations().forEach((anim) => anim.cancel());

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Farthest-corner distance (+6% slack) → the radius the disc must reach.
      // We grow a small BASE_PX circle up to it via scale, so the target scale is
      // (2·radius / BASE_PX). Tiny base = tiny texture = smooth; the soft radial
      // fill hides the upscale.
      const radius = Math.hypot(
        Math.max(originX, vw - originX),
        Math.max(originY, vh - originY),
      ) * 1.06;
      const targetScale = (radius * 2) / BASE_PX;

      el.style.width = `${BASE_PX}px`;
      el.style.height = `${BASE_PX}px`;
      el.style.left = `${originX - BASE_PX / 2}px`;
      el.style.top = `${originY - BASE_PX / 2}px`;
      el.style.borderRadius = '50%';
      el.style.background = discBg;
      el.style.transformOrigin = 'center';
      el.style.willChange = 'transform, opacity';
      el.style.opacity = '1';
      el.style.visibility = 'visible';
      el.style.transform = 'scale(0.001)';

      const grow = el.animate(
        [{ transform: 'scale(0.001)' }, { transform: `scale(${targetScale})` }],
        { duration: REVEAL_GROW_MS, easing: GROW_EASE, fill: 'forwards' },
      );

      grow.finished
        .then(() => {
          // The disc now fully covers the screen. Commit the whole new theme
          // UNDER it (one repaint, hidden), then dissolve the disc to reveal it.
          ThemeService.commitPendingTheme();
          const fade = el.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: REVEAL_FADE_MS, easing: 'ease-out', fill: 'forwards' },
          );
          return fade.finished;
        })
        .then(() => {
          el.style.visibility = 'hidden';
          el.style.willChange = 'auto';
        })
        .catch(() => {
          /* cancelled by a newer reveal — the new run owns the element's state */
        });
    };

    themeEventTarget.addEventListener('theme-reveal', handleReveal);
    return () => {
      themeEventTarget.removeEventListener('theme-reveal', handleReveal);
      el.getAnimations().forEach((anim) => anim.cancel());
    };
  }, []);

  return <div ref={ref} className="lior-theme-reveal" aria-hidden="true" />;
};

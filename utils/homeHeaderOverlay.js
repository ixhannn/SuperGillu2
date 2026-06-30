const HEADER_SCROLL_RANGE = 100;
const HEADER_HIDE_THRESHOLD = 18;

// Baked opaque (no backdrop-filter): the scrolled header sits over the animating
// Home ambient blob, so a live blur re-resolved every frame during the most
// GPU-contended moment (scrolling) on mobile. The background fill below is
// bumped near-opaque so the bar reads solid without the frost.
const ACTIVE_BACKDROP = 'none';

/**
 * Keeps the home header overlay completely hidden at the top edge so the
 * dark safe-area bar does not linger while scroll settles back to zero.
 *
 * @param {number} scrollTop
 */
export function getHomeHeaderOverlayState(scrollTop) {
  const y = Number.isFinite(scrollTop) ? Math.max(scrollTop, 0) : 0;

  if (y <= HEADER_HIDE_THRESHOLD) {
    return {
      opacity: 0,
      background: 'transparent',
      backdropFilter: 'none',
      webkitBackdropFilter: 'none',
      borderBottom: '1px solid rgba(255,255,255,0)',
      transitionDurationMs: 0,
    };
  }

  const visibleRange = HEADER_SCROLL_RANGE - HEADER_HIDE_THRESHOLD;
  const opacity = Math.min((y - HEADER_HIDE_THRESHOLD) / visibleRange, 1);

  return {
    opacity,
    background: `rgba(255,248,250,${0.9 + opacity * 0.08})`,
    backdropFilter: ACTIVE_BACKDROP,
    webkitBackdropFilter: ACTIVE_BACKDROP,
    borderBottom: `1px solid rgba(232,160,176,${opacity * 0.16})`,
    transitionDurationMs: 300,
  };
}

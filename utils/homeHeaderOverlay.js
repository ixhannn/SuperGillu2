const HEADER_SCROLL_RANGE = 100;
const HEADER_HIDE_THRESHOLD = 18;

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
    background: `rgba(255,248,250,${0.74 + opacity * 0.12})`,
    backdropFilter: opacity > 0.08 ? 'blur(18px) saturate(140%)' : 'none',
    webkitBackdropFilter: opacity > 0.08 ? 'blur(18px) saturate(140%)' : 'none',
    borderBottom: `1px solid rgba(232,160,176,${opacity * 0.16})`,
    transitionDurationMs: 300,
  };
}

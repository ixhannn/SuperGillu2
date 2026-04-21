export const HOME_LAYOUT_METRICS = Object.freeze({
  topGapPx: 12,
  bottomGapPx: 8,
  overlayExtraTopPx: 12,
});

export function getHomeContainerStyle() {
  return {
    paddingTop: `${HOME_LAYOUT_METRICS.topGapPx}px`,
    paddingBottom: `${HOME_LAYOUT_METRICS.bottomGapPx}px`,
  };
}

export function getHomeHeaderOverlayHeight() {
  return `calc(env(safe-area-inset-top, 0px) + ${HOME_LAYOUT_METRICS.overlayExtraTopPx}px)`;
}

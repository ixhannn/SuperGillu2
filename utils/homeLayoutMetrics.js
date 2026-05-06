export const HOME_LAYOUT_METRICS = Object.freeze({
  topGapPx: 8,
  bottomGapPx: 8,
  overlayExtraTopPx: 8,
});

export function getHomeContainerStyle() {
  // Layout.tsx already applies `pt-safe` to the lenis-content wrapper, so we
  // only add a small extra gap here to keep the header tight against the
  // status bar without double-counting the device safe area.
  return {
    paddingTop: `${HOME_LAYOUT_METRICS.topGapPx}px`,
    paddingBottom: `${HOME_LAYOUT_METRICS.bottomGapPx}px`,
  };
}

export function getHomeHeaderOverlayHeight() {
  return `calc(env(safe-area-inset-top, 0px) + ${HOME_LAYOUT_METRICS.overlayExtraTopPx}px)`;
}

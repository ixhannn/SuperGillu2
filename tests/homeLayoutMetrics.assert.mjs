import assert from 'node:assert/strict';
import {
  HOME_LAYOUT_METRICS,
  getHomeContainerStyle,
  getHomeHeaderOverlayHeight,
} from '../utils/homeLayoutMetrics.js';

assert.equal(HOME_LAYOUT_METRICS.topGapPx, 12, 'Expected the home screen top gap to stay tight above the profile row');
assert.equal(HOME_LAYOUT_METRICS.bottomGapPx, 8, 'Expected the home screen bottom gap to avoid excess dead space past the last card');
assert.equal(HOME_LAYOUT_METRICS.overlayExtraTopPx, 12, 'Expected the fixed top chrome to match the compact home header spacing');

const containerStyle = getHomeContainerStyle();

assert.deepEqual(
  containerStyle,
  {
    paddingTop: '12px',
    paddingBottom: '8px',
  },
  'Expected the home screen to use compact top and bottom spacing',
);

assert.equal(
  getHomeHeaderOverlayHeight(),
  'calc(env(safe-area-inset-top, 0px) + 12px)',
  'Expected the fixed header overlay height to only cover the safe area plus a small visual gap',
);

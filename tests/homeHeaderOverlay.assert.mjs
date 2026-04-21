import assert from 'node:assert/strict';
import { getHomeHeaderOverlayState } from '../utils/homeHeaderOverlay.js';

const topState = getHomeHeaderOverlayState(0);

assert.equal(topState.opacity, 0, 'Expected no header overlay opacity at the very top of the home view');
assert.equal(topState.background, 'transparent', 'Expected the header overlay background to be transparent at scrollTop 0');
assert.equal(topState.backdropFilter, 'none', 'Expected no backdrop blur at scrollTop 0');
assert.equal(topState.webkitBackdropFilter, 'none', 'Expected no WebKit backdrop blur at scrollTop 0');
assert.equal(topState.transitionDurationMs, 0, 'Expected the overlay to hide immediately at the top instead of fading out');

const scrolledState = getHomeHeaderOverlayState(100);

assert.equal(scrolledState.opacity, 1, 'Expected full header overlay opacity after scrolling down the full range');
assert.equal(scrolledState.transitionDurationMs, 300, 'Expected the overlay to keep its smooth fade when the header is active');
assert.notEqual(scrolledState.background, 'transparent', 'Expected the overlay to render a background once the header is active');
assert.match(scrolledState.background, /255,248,250/, 'Expected the scrolled header overlay to stay light instead of flashing as a dark bar');

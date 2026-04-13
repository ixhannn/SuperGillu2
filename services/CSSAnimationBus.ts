/**
 * CSSAnimationBus — Centralized CSS custom property driver.
 *
 * Every "breathing", "pulsing", or "glowing" CSS animation that needs
 * JS-driven timing registers here. The bus registers ONE subscriber with
 * AnimationEngine and batches ALL property writes into that single tick.
 *
 * This replaces independent setInterval/setTimeout calls in components and
 * eliminates layout thrash from scattered style.setProperty calls.
 *
 * CSS usage:
 *   .breathe-scale { transform: scale(calc(1 + var(--breathe-scale) * 0.04)); }
 *   .pulse-alpha   { opacity: var(--pulse-alpha); }
 *   .glow-ring     { opacity: var(--glow-alpha); }
 *
 * Properties written every frame (all normalized 0→1 or -1→1):
 *   --breathe-sin     : sin wave at 0.5 Hz  (-1 → 1)
 *   --breathe-cos     : cos wave at 0.5 Hz  (-1 → 1)
 *   --breathe-scale   : 0 → 1 (rectified sin, for scale effects)
 *   --pulse-alpha     : 0 → 1 at 1.0 Hz (glow pulse)
 *   --shimmer-phase   : 0 → 1 cycling at 0.25 Hz (shimmer sweep timing)
 *   --ui-breathe      : 0.6 → 1.0 for opacity breathing on UI elements
 *
 * Quantisation: all values are rounded to 3 decimal places to avoid
 * triggering repaint on sub-pixel changes that are visually imperceptible.
 */

import { AnimationEngine } from '../utils/AnimationEngine';

function q(v: number, decimals = 3): string {
  const f = 10 ** decimals;
  return String(Math.round(v * f) / f);
}

let t = 0;

// Pre-allocated double buffers — swap each frame to avoid per-frame allocations
const _bufA: { [k: string]: string } = Object.create(null);
const _bufB: { [k: string]: string } = Object.create(null);
const _out:  { [k: string]: string } = Object.create(null);
let _cur  = _bufA;  // values computed this frame
let _prev = _bufB;  // values from last frame (for diff)

AnimationEngine.register({
  id: 'css-animation-bus',
  priority: 10, // highest — always runs, CSS bus must never shed
  budgetMs: 0.3,
  minTier: 'css-only', // runs in ALL tiers — CSS fallback depends on these vars

  tick(delta) {
    t += delta * 0.001; // convert ms → seconds
  },

  cssProps() {
    const breatheSin   = Math.sin(t * Math.PI * 2 * 0.5);   // 0.5 Hz
    const breatheCos   = Math.cos(t * Math.PI * 2 * 0.5);
    const breatheScale = (breatheSin + 1) * 0.5;            // 0→1

    const pulseAlpha   = (Math.sin(t * Math.PI * 2 * 1.0) + 1) * 0.5;       // 1 Hz, 0→1
    const shimmerPhase = ((t * 0.25) % 1);                                    // 0→1 at 0.25 Hz
    const uiBreath     = 0.6 + (breatheScale * 0.4);                          // 0.6→1.0

    // Write into current buffer (reused, no allocation)
    _cur['--breathe-sin']   = q(breatheSin);
    _cur['--breathe-cos']   = q(breatheCos);
    _cur['--breathe-scale'] = q(breatheScale);
    _cur['--pulse-alpha']   = q(pulseAlpha);
    _cur['--shimmer-phase'] = q(shimmerPhase);
    _cur['--ui-breathe']    = q(uiBreath);

    // Diff against previous frame — only emit changed values
    // Clear _out first (max 6 keys, so cheap)
    for (const k in _out) delete _out[k];
    for (const key in _cur) {
      if (_cur[key] !== _prev[key]) _out[key] = _cur[key];
    }

    // Swap buffers without copying
    const tmp = _prev; _prev = _cur; _cur = tmp;

    return _out;
  },
});

export {}; // side-effect import — just importing this file activates the bus

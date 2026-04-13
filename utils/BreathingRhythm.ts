/**
 * BreathingRhythm — The app breathes.
 *
 * A 4-second inhale/exhale cycle driven by a single sine wave from
 * performance.now(). One JS execution per frame writes all values to
 * CSS custom properties on :root via the AnimationEngine CSS bus —
 * batched into the single setProperty burst at frame end.
 *
 * CSS picks them up instantly via calc(). Zero layout triggers.
 * Zero reflows. The gestalt: the app is alive.
 */

import { AnimationEngine } from './AnimationEngine';

const PERIOD_MS = 4000; // 4s full inhale-exhale cycle

/** Normalized sine, 0→1→0 over one period */
function breath(t: number): number {
  return (Math.sin((t / PERIOD_MS) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
}

let registered = false;
let lastTs = 0; // stored by tick(), consumed by cssProps()

export function startBreathingRhythm(): void {
  if (registered) return;
  registered = true;

  AnimationEngine.register({
    id: 'breathing-rhythm',
    priority: 1,
    budgetMs: 0.15,
    minTier: 'css-only', // always runs — pure CSS, costs nothing

    tick(_delta, timestamp) {
      lastTs = timestamp;
    },

    cssProps() {
      const b = breath(lastTs); // 0–1
      return {
        '--breath':              b.toFixed(4),
        '--breath-shadow-blur':  `${(24 + b * 14).toFixed(1)}px`,
        '--breath-shadow-y':     `${(6  + b * 4).toFixed(1)}px`,
        '--breath-shadow-alpha': (0.07 + b * 0.06).toFixed(4),
        '--breath-glow-alpha':   (0.01 + b * 0.03).toFixed(4),
        '--breath-scale':        (1 + b * 0.004).toFixed(5),
        '--breath-pad':          `${(b * 1.5).toFixed(2)}px`,
      };
    },
  });
}

export function stopBreathingRhythm(): void {
  registered = false;
  AnimationEngine.unregister('breathing-rhythm');
}

/**
 * motion.ts — shared framer-motion vocabulary.
 *
 * Centralises easing + spring config so component animations feel consistent
 * and refined instead of each component picking ad-hoc stiffness/easing values
 * (the codebase previously had springs ranging stiffness 40–600 and a mix of
 * easeInOut / linear / silk curves).
 *
 * Design language matches the route layer (see styles/root-fixes.css motion
 * tokens + utils/TransitionEngine.ts): silky deceleration, critically-damped
 * springs with no loose overshoot/bounce, compositor-only transform + opacity.
 *
 * Both Claude and Codex should import from here for new animations so the two
 * efforts stay visually coherent.
 */
import type { Transition, Variants } from 'framer-motion';

// ── Easing curves — mirror the CSS custom properties --lior-ease-* ──────────
export const EASE_SILK = [0.16, 1, 0.3, 1] as const;   // premium deceleration
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;  // gentle standard
export const EASE_EXIT = [0.4, 0, 0.2, 1] as const;    // accelerate-out

// ── Durations (seconds) — mirror --lior-motion-* ────────────────────────────
export const DUR_TAB = 0.24;
export const DUR_POP = 0.26;
export const DUR_PUSH = 0.36;
export const DUR_MODAL = 0.38;

// ── Critically-damped springs — smooth settle, no bounce ────────────────────
// Damping is tuned high relative to stiffness so the value eases into place
// without the loose overshoot that reads as "jitter" on a phone.
export const springSmooth: Transition = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 };
export const springSnappy: Transition = { type: 'spring', stiffness: 460, damping: 34, mass: 0.7 };
export const springGentle: Transition = { type: 'spring', stiffness: 170, damping: 26, mass: 1 };

// ── Silk tween presets ──────────────────────────────────────────────────────
export const tweenSilk = (duration = 0.5): Transition => ({ duration, ease: EASE_SILK });
export const tweenSoft = (duration = 0.4): Transition => ({ duration, ease: EASE_SOFT });

// ── Scroll-reveal: fade + gentle rise, compositor-only ──────────────────────
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: springSmooth },
};

// ── Staggered container + item for lists / grids ────────────────────────────
export const staggerContainer = (stagger = 0.06, delay = 0.02): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

// ── Shared viewport config for whileInView reveals ──────────────────────────
export const inViewOnce = { once: true, margin: '0px 0px -40px 0px' } as const;

/** Runtime check for the OS reduced-motion preference. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

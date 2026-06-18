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

// ════════════════════════════════════════════════════════════════════════════
// Motion-OS §9.1 extension — typed JS mirrors of CSS tokens that were missing
// from the JS layer. Every value below mirrors a CSS custom prop that already
// lives in styles/root-fixes.css :root (the --lior-ease-* / --lior-motion-*
// props) or composes the existing springs/eases above. Nothing here introduces
// a NEW design value — these are exports, not new design decisions.
// (APPEND-ONLY: do not modify or remove the exports above.)
// ════════════════════════════════════════════════════════════════════════════

// ── Press-in curve — mirrors --lior-ease-press. The only ease the JS layer was
// missing; needed by <Pressable> for the down-stroke. ───────────────────────
export const EASE_PRESS = [0.2, 0, 0, 1] as const;

// ── Short-end durations (seconds) — mirror --lior-motion-press/feedback/micro/
// morph. (DUR_TAB/POP/PUSH/MODAL already exported above.) ────────────────────
export const DUR_PRESS = 0.09;    // --lior-motion-press 90ms
export const DUR_FEEDBACK = 0.14; // --lior-motion-feedback 140ms
export const DUR_MICRO = 0.2;     // --lior-motion-micro 200ms
export const DUR_MORPH = 0.4;     // --lior-motion-morph 400ms (shared-element)

// ── Press primitive variants ────────────────────────────────────────────────
// Down-stroke is sharp (EASE_PRESS, fast); release is springGentle so it
// settles with the same whisper as the global .spring-press CSS primitive.
// Scale floor matches the CSS press (0.955) — no bounce, no overshoot.
export const pressVariants: Variants = {
  rest:    { scale: 1,     transition: springGentle },
  pressed: { scale: 0.955, transition: { duration: DUR_PRESS, ease: EASE_PRESS } },
};

// ── Modal / sheet variants — for in-React surfaces that are NOT route-level ──
// (route-level sheets go through TransitionEngine 'modal'). Rises from the
// bottom edge to match the lior-vt-modal-* keyframes.
export const sheetVariants: Variants = {
  hidden:  { y: '100%', transition: { duration: DUR_MODAL, ease: EASE_SOFT } },
  visible: { y: 0,      transition: { duration: DUR_MODAL, ease: EASE_SILK } },
  exit:    { y: '100%', transition: { duration: DUR_POP,   ease: EASE_EXIT } },
};

export const scrimVariants: Variants = {
  hidden:  { opacity: 0, transition: { duration: DUR_POP } },
  visible: { opacity: 1, transition: { duration: DUR_MODAL } },
};

// ── Adaptive stagger step ─────────────────────────────────────────────────────
// Long lists must not take 2s to fully reveal. Clamps the total reveal window
// to ~480ms regardless of N (a 30-item Timeline reveals in ~480ms, not 2s).
export const staggerFor = (count: number): number =>
  count <= 0 ? 0.06 : Math.min(0.06, 0.48 / count);

// ── Heartbeat scale keyframes for romantic pulse surfaces (Pulse, hero heart).
// Loop duration ≥ 2000ms per the ambient-loop rule so it never competes with
// gesture feedback. Transform-only (scale) — compositor-safe.
export const heartbeatPulse: Variants = {
  beat: {
    scale: [1, 1.06, 1, 1.04, 1],
    transition: {
      duration: 2.0,
      times: [0, 0.12, 0.24, 0.36, 1],
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

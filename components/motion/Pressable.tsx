/**
 * <Pressable> — tactile down-stroke + semantically-correct haptic (Motion-OS §9.5.3).
 *
 * A framer-driven press wrapper for surfaces that want their press state to
 * compose with other framer transforms AND fire a haptic on the *actual*
 * product action. Scale-down on press uses `pressVariants` (sharp EASE_PRESS
 * down-stroke, springGentle release, scale floor 0.955 — matches the global
 * `.spring-press` CSS, no bounce).
 *
 * It opts OUT of the global CSS pointer-press via `data-no-press` (honoured by
 * the index.tsx pointer handler) so the visual never double-fires.
 *
 * Haptic rule (index.tsx contract): the haptic fires in the explicit
 * activation handler (`onClick`), NEVER on raw `pointerdown` — pointerdown only
 * drives the visual press. Choose the rung with `haptic`:
 *   - `'tap'`   → Haptics.tap()   (Light  — nav, row, chip, default)
 *   - `'press'` → Haptics.press() (Medium — standard button / card)
 *   - `'none'`  → no haptic
 *
 * Reduced motion: the framer press animation is collapsed globally by
 * <MotionConfig reducedMotion="user">; the imperative haptic is additionally
 * guarded with `prefersReducedMotion()` since it bypasses framer.
 *
 * Forwards `onClick` and `ref`. Renders a `<button>` (default) or `<div>`.
 *
 * @example
 * <Pressable haptic="press" onClick={save} className="cta">
 *   Save memory
 * </Pressable>
 *
 * @example
 * // A non-button surface (card) with the light rung:
 * <Pressable as="div" haptic="tap" onClick={() => open(id)} className="card">
 *   <MemoryCard memory={m} />
 * </Pressable>
 */
import { motion } from 'framer-motion';
import {
  forwardRef,
  useState,
  type ForwardedRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { pressVariants, prefersReducedMotion } from '../../utils/motion';
import { Haptics } from '../../services/haptics';

/** Which haptic rung fires on the explicit press action. */
type Haptic = 'tap' | 'press' | 'none';

const HAPTIC: Record<Exclude<Haptic, 'none'>, () => void> = {
  tap:   () => void Haptics.tap(),   // Light  — nav, row, chip
  press: () => void Haptics.press(), // Medium — standard button / card
};

interface PressableProps {
  children: ReactNode;
  /** Explicit-action handler. Receives the native click event. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Haptic rung fired on the actual press action (never on pointerdown). Default `'tap'`. */
  haptic?: Haptic;
  /** Intrinsic element to render. Default `'button'`. */
  as?: 'button' | 'div';
  className?: string;
  disabled?: boolean;
}

function PressableImpl(
  { children, onClick, haptic = 'tap', as = 'button', className, disabled }: PressableProps,
  ref: ForwardedRef<HTMLElement>,
) {
  const [pressed, setPressed] = useState(false);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled) return;
    // Haptic fires on the EXPLICIT product action only, and never under
    // reduced-motion (imperative effect bypasses framer's global switch).
    if (haptic !== 'none' && !prefersReducedMotion()) {
      HAPTIC[haptic]();
    }
    onClick?.(event);
  };

  const common = {
    'data-no-press': true as const, // opt OUT of the global CSS press; framer owns it
    className,
    variants: pressVariants,
    initial: 'rest' as const,
    animate: (pressed && !disabled ? 'pressed' : 'rest') as 'pressed' | 'rest',
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    onClick: handleClick,
  };

  if (as === 'div') {
    return (
      <motion.div ref={ref as ForwardedRef<HTMLDivElement>} {...common}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.button
      ref={ref as ForwardedRef<HTMLButtonElement>}
      type="button"
      disabled={disabled}
      {...common}
    >
      {children}
    </motion.button>
  );
}

export const Pressable = forwardRef<HTMLElement, PressableProps>(PressableImpl);
Pressable.displayName = 'Pressable';

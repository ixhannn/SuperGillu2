/**
 * <Reveal> — single-element scroll/mount reveal (Motion-OS §9.5.1).
 *
 * Fades + gently rises a single element into view the first time it crosses the
 * viewport. Compositor-only (opacity + translateY). Built on the canonical
 * `revealVariants` (springSmooth settle) + `inViewOnce` viewport config — zero
 * inline easing/duration numbers.
 *
 * Reduced motion: handled globally by <MotionConfig reducedMotion="user">
 * (index.tsx) which collapses framer transforms to opacity-only — no local
 * branch needed for the framer animation.
 *
 * Perf: `whileInView` + `once:true` detaches the IntersectionObserver after the
 * first reveal (no ongoing cost). Do NOT wrap every item of a long list in
 * <Reveal> (N observers) — use <Stagger>, which uses ONE container observer.
 *
 * @example
 * <Reveal as="section" className="masthead">
 *   <h1>Good morning</h1>
 * </Reveal>
 *
 * @example
 * // A touch later, and a larger rise:
 * <Reveal delay={80} y={24}>
 *   <GrowthCard />
 * </Reveal>
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { revealVariants, springSmooth } from '../../utils/motion';

/** Element tags <Reveal> can render as. */
type RevealTag = 'div' | 'section' | 'li' | 'article' | 'span';

interface RevealProps {
  children: ReactNode;
  /** Intrinsic element to render. Default `'div'`. */
  as?: RevealTag;
  /** ms delay before this element reveals (use sparingly; prefer <Stagger>). */
  delay?: number;
  /** Rise distance in px the element travels up into place. Default `16`. */
  y?: number;
  /** Reveal only once (observer detaches after). Default `true`. */
  once?: boolean;
  className?: string;
}

export function Reveal({
  children,
  as = 'div',
  delay = 0,
  y = 16,
  once = true,
  className,
}: RevealProps) {
  const Tag = motion[as];

  // Compose from the canonical reveal variant; only override the rise distance
  // (y) and the optional delay so the spring + opacity curve stay canonical.
  const variants = {
    hidden: { opacity: 0, y },
    visible: {
      opacity: 1,
      y: 0,
      transition: delay ? { ...springSmooth, delay: delay / 1000 } : springSmooth,
    },
  } satisfies typeof revealVariants;

  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '0px 0px -40px 0px' }}
      variants={variants}
    >
      {children}
    </Tag>
  );
}

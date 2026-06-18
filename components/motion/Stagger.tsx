/**
 * <Stagger> — list / grid entrance orchestration (Motion-OS §9.5.2).
 *
 * Staggers the entrance of its children (each fades + rises + settles via
 * `staggerItem` / springSmooth) using ONE container IntersectionObserver. The
 * container holds the only observer; children inherit the `visible` state
 * through framer variant propagation — no per-child observer.
 *
 * Step auto-adapts to child count via `staggerFor(n)`, which caps the full
 * reveal window at ~480ms so a 30-item grid does not animate for 2 seconds.
 * Pass `stagger` to override.
 *
 * Compositor-only (`staggerItem` is opacity + translateY + scale). Reduced
 * motion is handled globally by <MotionConfig reducedMotion="user">.
 *
 * @example
 * <Stagger className="bento-grid">
 *   {tiles.map((t) => <Tile key={t.id} {...t} />)}
 * </Stagger>
 *
 * @example
 * // Fixed step + a beat of lead-in delay:
 * <Stagger stagger={0.05} delay={0.1}>
 *   {stats.map((s) => <StatTile key={s.id} {...s} />)}
 * </Stagger>
 */
import { motion } from 'framer-motion';
import { Children, type ReactNode } from 'react';
import {
  staggerContainer,
  staggerItem,
  staggerFor,
  inViewOnce,
} from '../../utils/motion';

interface StaggerProps {
  children: ReactNode;
  /** Override the auto step (seconds between children). Default adapts via `staggerFor(n)`. */
  stagger?: number;
  /** Lead-in delay (seconds) before the first child reveals. Default `0.02`. */
  delay?: number;
  className?: string;
}

export function Stagger({ children, stagger, delay, className }: StaggerProps) {
  const count = Children.count(children);
  const step = stagger ?? staggerFor(count);

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={inViewOnce}
      variants={staggerContainer(step, delay)}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={staggerItem}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

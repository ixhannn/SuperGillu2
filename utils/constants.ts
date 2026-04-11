import { Variants } from 'framer-motion';

/** 
 * LIOR COHESION SYSTEM - MOTION CONSTANTS
 * All components must use these to ensure a single motion signature.
 */

export const PREMIUM_SPRING = {
  type: 'spring',
  stiffness: 260,
  damping: 26,
  mass: 1,
  ease: [0.23, 1, 0.32, 1]
} as const;

export const SNAPPY_SPRING = {
  type: 'spring',
  stiffness: 300,
  damping: 20
} as const;

export const VIEW_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.98, y: 12 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.23, 1, 0.32, 1],
      staggerChildren: 0.1,
      delayChildren: 0.05
    }
  },
  exit: { 
    opacity: 0, 
    scale: 1.02, 
    y: -8,
    transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] }
  }
};

export const STAGGER_CHILD_VARIANTS: Variants = {
  initial: { opacity: 0, y: 15 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { ...PREMIUM_SPRING }
  }
};

export const LIST_ITEM_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.9, y: 20 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { ...PREMIUM_SPRING }
  }
};

export const MODAL_VARIANTS: Variants = {
  initial: { opacity: 0, y: '100%' },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', damping: 25, stiffness: 200 }
  },
  exit: { 
    opacity: 0, 
    y: '100%',
    transition: { duration: 0.3, ease: 'easeInOut' }
  }
};

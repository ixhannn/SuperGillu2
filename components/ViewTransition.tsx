import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, TransitionDirection } from '../types';

interface ViewTransitionProps {
  viewKey: ViewState;
  transitionDirection?: TransitionDirection;
  children: React.ReactNode;
}

/**
 * ViewTransition — manages animated screen changes.
 *
 * Strategy:
 *   • Mobile + View Transitions API supported (Chrome 111+, Safari 18+):
 *     Children render directly with NO AnimatePresence. The View Transitions
 *     API (wired in navigateWithTransition) captures old/new DOM snapshots and
 *     applies the directional CSS keyframes already defined in index.css.
 *     This is compositor-level — zero JS animation jank.
 *
 *   • Desktop, or VT not supported:
 *     Framer Motion AnimatePresence handles the exit/enter animations.
 *     Desktop gets the dramatic clip-path-from-tap-origin reveal.
 *     Mobile fallback gets directional slide transitions.
 *
 * The `view-transition-name: main-view` is set on the wrapper so shared-element
 * transitions can reference named elements (memory card → full screen).
 */

// Detect VT API once at module load — stable across renders.
const VT_SUPPORTED =
  typeof document !== 'undefined' && 'startViewTransition' in document;

export const ViewTransition: React.FC<ViewTransitionProps> = ({
  viewKey,
  transitionDirection,
  children,
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq     = window.matchMedia(
      '(max-width: 768px), (pointer: coarse), (prefers-reduced-motion: reduce)',
    );
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ── VT MODE ──────────────────────────────────────────────────────────────
  // On mobile with VT support: render children directly inside a named element.
  // navigateWithTransition drives the actual animation via CSS keyframes.
  if (isMobile && VT_SUPPORTED) {
    return (
      <div
        className="w-full min-h-full"
        style={{
          gridColumn:         '1 / -1',
          gridRow:            '1 / -1',
          viewTransitionName: 'main-view',
        }}
      >
        {children}
      </div>
    );
  }

  // ── FRAMER MOTION FALLBACK ────────────────────────────────────────────────
  return (
    <FramerMotionTransition
      viewKey={viewKey}
      transitionDirection={transitionDirection}
      isMobile={isMobile}
    >
      {children}
    </FramerMotionTransition>
  );
};

// ── Framer Motion implementation (desktop + VT-unsupported mobile) ────────────

interface FMProps extends ViewTransitionProps {
  isMobile: boolean;
}

const FramerMotionTransition: React.FC<FMProps> = ({
  viewKey,
  transitionDirection,
  isMobile,
  children,
}) => {
  const clickPosRef = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth  / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  });
  const [clickPos, setClickPos] = useState(clickPosRef.current);

  useEffect(() => {
    const handleInput = (e: MouseEvent | TouchEvent) => {
      let x: number, y: number;
      if (e instanceof MouseEvent) {
        x = e.clientX; y = e.clientY;
      } else if (e.touches?.length) {
        x = e.touches[0].clientX; y = e.touches[0].clientY;
      } else return;
      clickPosRef.current = { x, y };
      setClickPos({ x, y });
    };
    window.addEventListener('mousedown', handleInput, { capture: true, passive: true });
    window.addEventListener('touchstart', handleInput, { capture: true, passive: true });
    return () => {
      window.removeEventListener('mousedown', handleInput, { capture: true });
      window.removeEventListener('touchstart', handleInput, { capture: true });
    };
  }, []);

  const desktopVariants = {
    initial: (pos: { x: number; y: number }) => ({
      clipPath: `circle(0% at ${pos.x}px ${pos.y}px)`,
      opacity:  1,
      scale:    0.97,
      filter:   'blur(3px)',
    }),
    animate: (pos: { x: number; y: number }) => ({
      clipPath: `circle(200% at ${pos.x}px ${pos.y}px)`,
      opacity:  1,
      scale:    1,
      filter:   'blur(0px)',
      transition: {
        clipPath: { duration: 0.48, ease: [0.32, 0.72, 0, 1] as any },
        opacity:  { duration: 0.25 },
        scale:    { duration: 0.45, ease: [0.16, 1, 0.3, 1] as any },
        filter:   { duration: 0.35 },
      },
    }),
    exit: {
      opacity: 0,
      scale:   0.97,
      filter:  'blur(2px)',
      transition: {
        opacity: { duration: 0.18 },
        scale:   { duration: 0.22 },
        filter:  { duration: 0.18 },
      },
    },
  };

  const getMobileVariants = (dir?: TransitionDirection) => {
    switch (dir) {
      case 'tab':
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1, transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as any } },
          exit:    { opacity: 0, transition: { duration: 0.12, ease: [0.55, 0, 1, 0.45] as any } },
        };
      case 'push':
        return {
          initial: { opacity: 0, x: '18%' },
          animate: { opacity: 1, x: 0,    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any } },
          exit:    { opacity: 0, x: '-8%', transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as any } },
        };
      case 'pop':
        return {
          initial: { opacity: 0, x: '-8%' },
          animate: { opacity: 1, x: 0,    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any } },
          exit:    { opacity: 0, x: '18%', transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as any } },
        };
      case 'modal':
        return {
          initial: { opacity: 0, y: '12%' },
          animate: { opacity: 1, y: 0,   transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as any } },
          exit:    { opacity: 0, y: '8%', transition: { duration: 0.22, ease: [0.55, 0, 1, 0.45] as any } },
        };
      default:
        return {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0,  transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as any } },
          exit:    { opacity: 0, y: -4, transition: { duration: 0.18, ease: [0.55, 0, 1, 0.45] as any } },
        };
    }
  };

  return (
    <div
      className="w-full min-h-full grid"
      style={{
        ...((!isMobile) && { perspective: '1200px' }),
        gridTemplateColumns: '1fr',
        gridTemplateRows:    '1fr',
      }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={viewKey}
          custom={clickPos}
          variants={isMobile ? getMobileVariants(transitionDirection) : desktopVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onAnimationComplete={(definition) => {
            if (!isMobile && definition === 'animate') {
              const el = document.querySelector(
                `[data-transition-key="${viewKey}"]`,
              ) as HTMLElement;
              if (el) {
                el.style.clipPath  = 'none';
                el.style.filter    = 'none';
                el.style.transform = 'none';
              }
            }
          }}
          data-transition-key={viewKey}
          className={`w-full bg-transparent ${isMobile ? '' : 'will-change-[clip-path,opacity,transform,filter]'}`}
          style={{
            gridColumn:       '1 / -1',
            gridRow:          '1 / -1',
            transformOrigin:  'center top',
            backfaceVisibility: 'hidden',
            willChange:       isMobile ? 'auto' : undefined,
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

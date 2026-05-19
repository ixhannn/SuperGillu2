import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { feedback } from '../utils/feedback';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

// PullToRefresh — direct DOM + compositor transforms only.
// The framer-motion useSpring + motion.div setup was triggering a React
// reconcile on every spring tick and slowed mid-tier devices. This version
// writes the indicator height as a CSS variable and lets a tight cubic-bezier
// transition (or `transition: none` during active drag) handle the animation
// on the compositor thread.
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const currentPull = useRef(0);
  const isRefreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const maxPull = 120;
  const threshold = 80;

  const resolveScrollRoot = useCallback((): HTMLElement | null => {
    if (scrollRootRef.current && document.contains(scrollRootRef.current)) {
      return scrollRootRef.current;
    }
    const root = containerRef.current?.closest<HTMLElement>('.lenis-wrapper') ?? null;
    scrollRootRef.current = root;
    return root;
  }, []);

  const getScrollTop = useCallback((): number => {
    const root = resolveScrollRoot();
    return root?.scrollTop ?? window.scrollY ?? document.documentElement.scrollTop ?? 0;
  }, [resolveScrollRoot]);

  // Direct DOM write — no React re-render per pull frame.
  const writePull = useCallback((value: number, withTransition: boolean) => {
    const el = indicatorRef.current;
    if (!el) return;
    el.style.transition = withTransition ? 'height 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    el.style.height = `${value}px`;
    currentPull.current = value;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshingRef.current) return;
    if (getScrollTop() > 1) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, [getScrollTop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const delta = e.touches[0].clientY - startY.current;

    if (delta > 0) {
      const resistance = delta * 0.4;
      const finalPull = Math.min(resistance, maxPull);
      const prev = currentPull.current;
      writePull(finalPull, false);

      // Haptic tick when passing threshold (rising edge only).
      if (prev < threshold && finalPull >= threshold) {
        feedback.light();
      }

      // Prevent native scroll chaining
      if (e.cancelable) e.preventDefault();
    }
  }, [writePull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    const pulled = currentPull.current;

    if (pulled >= threshold && !isRefreshingRef.current) {
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      writePull(50, true); // hold at spinner height
      feedback.tap();

      try {
        await onRefresh();
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
        writePull(0, true);
        feedback.success();
      }
    } else {
      writePull(0, true);
    }
  }, [onRefresh, writePull]);

  // Reset on unmount + initial paint
  useEffect(() => {
    writePull(0, false);
  }, [writePull]);

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator — height animated directly via style mutation */}
      <div
        ref={indicatorRef}
        className="absolute top-0 left-0 right-0 flex justify-center items-end pb-4 overflow-hidden pointer-events-none"
        style={{
          height: 0,
          zIndex: 0,
          willChange: 'height',
          contain: 'layout paint',
        }}
      >
        <style>
          {`
            @keyframes liorPtrPulse {
              0%,100% { transform: translateZ(0) scale(1) rotate(0deg); }
              50%     { transform: translateZ(0) scale(1.2) rotate(180deg); }
            }
            @keyframes liorPtrSpin {
              from { transform: translateZ(0) rotate(0deg); }
              to   { transform: translateZ(0) rotate(360deg); }
            }
          `}
        </style>
        <div
          style={{
            transform: 'translateZ(0)',
            willChange: 'transform',
            animation: isRefreshing
              ? 'liorPtrSpin 1s linear infinite, liorPtrPulse 1s ease-in-out infinite'
              : 'none',
          }}
        >
          <Heart
            size={24}
            className="text-lior-500 drop-shadow-md"
            fill={isRefreshing ? 'currentColor' : 'none'}
            strokeWidth={isRefreshing ? 0 : 2.5}
          />
        </div>
      </div>

      {/* Content wrapper — no JS animation, page transforms naturally */}
      <div className="min-h-full relative" style={{ zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
};

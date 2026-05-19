import React, { useState, useRef, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { feedback } from '../utils/feedback';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

/**
 * PullToRefresh — pure-DOM, no framer-motion. Touch-driven transforms run on
 * the compositor; the previous spring was solving on the JS main thread and
 * fighting with scroll velocity sampling, costing ~3ms per move event on
 * mid-range Android.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pull = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const passedThresholdRef = useRef(false);

  const maxPull = 120;
  const threshold = 80;

  // Direct DOM writes — no React reconciliation per move event
  const applyPull = (value: number) => {
    pull.current = value;
    const indicator = indicatorRef.current;
    const content = contentRef.current;
    if (indicator) indicator.style.height = `${value}px`;
    if (content) content.style.transform = value > 0 ? `translate3d(0, ${value}px, 0)` : '';
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0 && !isRefreshingRef.current) {
      startY.current = e.touches[0].clientY;
      isPullingRef.current = true;
      passedThresholdRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;
    if (delta > 0) {
      const resistance = delta * 0.4;
      const finalPull = Math.min(resistance, maxPull);
      // Threshold-cross haptic — only fires once per gesture
      if (finalPull >= threshold && !passedThresholdRef.current) {
        passedThresholdRef.current = true;
        feedback.light();
      }
      applyPull(finalPull);
      if (e.cancelable) e.preventDefault();
    }
  };

  const animateTo = (target: number, durationMs = 260) => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (!content || !indicator) { applyPull(target); return; }
    const transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    content.style.transition = transition;
    indicator.style.transition = `height ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    applyPull(target);
    window.setTimeout(() => {
      if (content) content.style.transition = '';
      if (indicator) indicator.style.transition = '';
    }, durationMs + 16);
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;

    if (pull.current >= threshold && !isRefreshingRef.current) {
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      animateTo(50);
      feedback.tap();
      try {
        await onRefresh();
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
        animateTo(0);
        feedback.success();
      }
    } else {
      animateTo(0);
    }
  };

  useEffect(() => {
    return () => {
      isPullingRef.current = false;
      isRefreshingRef.current = false;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-y-auto no-scrollbar"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator — height driven directly by DOM */}
      <div
        ref={indicatorRef}
        className="absolute top-0 left-0 right-0 flex justify-center items-end pb-4 overflow-hidden pointer-events-none"
        style={{ height: 0, zIndex: 0, willChange: 'height' }}
      >
        <div className={isRefreshing ? 'animate-spin-elastic' : ''}>
          <Heart
            size={24}
            className="text-lior-500 drop-shadow-md"
            fill={isRefreshing ? 'currentColor' : 'none'}
            strokeWidth={isRefreshing ? 0 : 2.5}
          />
        </div>
      </div>

      {/* Content wrapper — transform driven directly by DOM */}
      <div
        ref={contentRef}
        className="min-h-full relative"
        style={{ zIndex: 10, willChange: 'transform' }}
      >
        {children}
      </div>
    </div>
  );
};

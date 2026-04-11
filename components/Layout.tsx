import React, { useRef, useEffect, useState, createContext, useContext, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from './BottomNav';
import { LiveBackground3D } from './LiveBackground3D';
import { FloatingHeartsScene } from './FloatingHeartsScene';
import { TogetherMode } from './TogetherMode';
import { DebugOverlay } from './DebugOverlay';
import { DynamicToast } from './DynamicToast';
import { TouchTrailCanvas } from './TouchTrailCanvas';
import { PhysicsConfetti, ConfettiHandle } from './PhysicsConfetti';
import { ViewState } from '../types';
import { startBreathingRhythm } from '../utils/BreathingRhythm';
import { LenisScroll } from '../services/LenisScroll';
import { SafeRender } from './SafeRender';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  setView: (view: ViewState) => void;
  registerScrollRef?: (el: HTMLElement | null) => void;
  notifications?: {
    timeline?: boolean;
    moments?: boolean;
    keepsakes?: boolean;
  };
}

export const ConfettiContext = createContext<{ trigger: (x?: number, y?: number) => void }>({
  trigger: () => {},
});
export const useConfetti = () => useContext(ConfettiContext);

export const Layout: React.FC<LayoutProps> = memo(({ children, currentView, setView, registerScrollRef, notifications }) => {
  // wrapperRef = overflow:hidden clip container (Lenis "wrapper")
  const wrapperRef  = useRef<HTMLElement>(null);
  // contentRef = the div Lenis translates (Lenis "content")
  const contentRef  = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<ConfettiHandle>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevView = useRef(currentView);

  // Boot Lenis once both DOM refs are available.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    LenisScroll.init(wrapper, content);

    // Pass wrapper as scroll ref — App.tsx uses LenisScroll.scroll / scrollTo
    // instead of scrollTop, so this is just a stable ref handle.
    if (registerScrollRef) registerScrollRef(wrapper);

    return () => {
      LenisScroll.destroy();
      if (registerScrollRef) registerScrollRef(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once only

  useEffect(() => {
    startBreathingRhythm();
  }, []);

  // Global ink-ripple on every .spring-press tap
  const handleRipple = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.spring-press') as HTMLElement | null;
    if (!target) return;
    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
    target.style.overflow = 'hidden';
    const rect = target.getBoundingClientRect();
    const circle = document.createElement('span');
    circle.className = 'ripple-ink-circle';
    circle.style.left = `${e.clientX - rect.left}px`;
    circle.style.top  = `${e.clientY - rect.top}px`;
    target.appendChild(circle);
    circle.addEventListener('animationend', () => circle.remove(), { once: true });
  }, []);

  useEffect(() => {
    if (prevView.current !== currentView) {
      setIsTransitioning(true);
      prevView.current = currentView;
      const timer = setTimeout(() => setIsTransitioning(false), 600);
      return () => clearTimeout(timer);
    }
  }, [currentView]);

  return (
    <ConfettiContext.Provider value={{ trigger: (x, y) => confettiRef.current?.trigger(x, y) }}>
      <div
        className="fixed inset-0 text-gray-800 overflow-hidden flex flex-col"
        style={{
          background: 'var(--theme-bg-main, linear-gradient(168deg, #F8E7EC 0%, #EBD4DB 50%, #DEBFC9 100%))',
          color: 'var(--color-text-primary, #2D1F25)',
        }}
        onPointerDown={handleRipple}
      >
        {/* Page transition progress bar */}
        <AnimatePresence>
          {isTransitioning && (
            <motion.div
              className="fixed top-0 left-0 right-0 h-[2px] z-[100]"
              style={{ background: 'var(--theme-progress-gradient, linear-gradient(90deg, #f43f5e, #e879f9, #f43f5e))' }}
              initial={{ scaleX: 0, transformOrigin: 'left' }}
              animate={{ scaleX: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </AnimatePresence>

        {/* Ambient background layers — wrapped so GPU/WebGL crashes don't take down the app */}
        <SafeRender><LiveBackground3D /></SafeRender>
        <SafeRender><FloatingHeartsScene /></SafeRender>

        {/* Vignette */}
        <div
          className="fixed inset-0 pointer-events-none z-[2]"
          aria-hidden="true"
          style={{
            background: 'var(--theme-vignette, radial-gradient(ellipse 120% 80% at 50% -10%, rgba(251,207,232,0.14) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(249,168,212,0.08) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(251,207,232,0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(244,114,182,0.05) 0%, transparent 50%))',
          }}
        />

        {/*
          ── LENIS SCROLL STRUCTURE ──────────────────────────────────
          wrapper (main): overflow:hidden — the viewport clip.
                          flex-1 fills height between header and nav.
                          Lenis intercepts wheel/touch events here.

          content (div):  The element Lenis translates with transform.
                          Must have no overflow constraint of its own.
                          pt-safe: below device notch.
                          pb-32:   above bottom nav.
          ─────────────────────────────────────────────────────────── */}
        <main
          ref={wrapperRef}
          className="lenis-wrapper flex-1 min-h-0 relative z-10 w-full max-w-md mx-auto"
        >
          <div
            ref={contentRef}
            className="lenis-content pt-safe pb-32"
          >
            {children}
          </div>
        </main>

        {/* Global overlays — these sit above the scroll layer */}
        <TogetherMode />
        <BottomNav currentView={currentView} setView={setView} notifications={notifications} />
        <DebugOverlay />
        <DynamicToast />
        <TouchTrailCanvas />
        <PhysicsConfetti ref={confettiRef} />
      </div>
    </ConfettiContext.Provider>
  );
}) as React.FC<LayoutProps>;

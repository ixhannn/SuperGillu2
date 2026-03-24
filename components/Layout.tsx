import React, { useRef, useEffect, useState, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from './BottomNav';
import { LiveBackground3D } from './LiveBackground3D';
import { FloatingHeartsScene } from './FloatingHeartsScene';
import { TogetherMode } from './TogetherMode';
import { DebugOverlay } from './DebugOverlay';
import { ViewState } from '../types';
import { startBreathingRhythm } from '../utils/BreathingRhythm';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  setView: (view: ViewState) => void;
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

export const Layout: React.FC<LayoutProps> = ({ children, currentView, setView, notifications }) => {
  const mainRef = useRef<HTMLElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevView = useRef(currentView);

  useEffect(() => {
    startBreathingRhythm();
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
    <ConfettiContext.Provider value={{ trigger: () => {} }}>
      <div
        className="fixed inset-0 text-gray-100 overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(168deg, #1a0c14 0%, #1f0e19 25%, #24111c 50%, #1c0d16 75%, #140a10 100%)',
        }}
      >
        {/* Page transition progress bar */}
        <AnimatePresence>
          {isTransitioning && (
            <motion.div
              className="fixed top-0 left-0 right-0 h-[2px] z-[100]"
              style={{ background: 'linear-gradient(90deg, #f43f5e, #e879f9, #f43f5e)' }}
              initial={{ scaleX: 0, transformOrigin: 'left' }}
              animate={{ scaleX: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </AnimatePresence>
        {/* Ambient warm glow background */}
        <LiveBackground3D />

        {/* 3D floating hearts scene */}
        <FloatingHeartsScene />

        {/* Subtle top-down vignette for depth */}
        <div
          className="fixed inset-0 pointer-events-none z-[2]"
          aria-hidden="true"
          style={{
            background: `
              radial-gradient(ellipse 120% 80% at 50% -10%, rgba(251,207,232,0.14) 0%, transparent 60%),
              radial-gradient(ellipse 80% 50% at 30% 50%, rgba(249,168,212,0.08) 0%, transparent 50%),
              radial-gradient(ellipse 100% 60% at 50% 110%, rgba(251,207,232,0.10) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 70% 30%, rgba(244,114,182,0.05) 0%, transparent 50%)
            `,
          }}
        />

        {/* Soft diffusion layer — smooths out particle noise */}
        <div
          className="fixed inset-0 pointer-events-none z-[3]"
          aria-hidden="true"
          style={{
            backdropFilter: 'blur(1.5px)',
            WebkitBackdropFilter: 'blur(1.5px)',
          }}
        />

        {/* Main content */}
        <main
          ref={mainRef}
          className="flex-1 relative z-10 w-full max-w-md mx-auto overflow-y-auto overflow-x-hidden no-scrollbar smooth-scroll pt-safe pb-32"
        >
          {children}
        </main>

        {/* Global features */}
        <TogetherMode />

        {/* Navigation */}
        <BottomNav currentView={currentView} setView={setView} notifications={notifications} />

        {/* Dev debug overlay */}
        <DebugOverlay />
      </div>
    </ConfettiContext.Provider>
  );
};

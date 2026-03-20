import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BottomNav } from './BottomNav';
import { FloatingHearts } from './FloatingHearts';
import { LiveBackground } from './LiveBackground';
import { TogetherMode } from './TogetherMode';
import { ViewState } from '../types';

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

export const Layout: React.FC<LayoutProps> = ({ children, currentView, setView, notifications }) => {
  const mainRef = useRef<HTMLElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [parallaxY, setParallaxY] = useState(0);

  const handleScroll = useCallback(() => {
    const main = mainRef.current;
    if (!main) return;
    const { scrollTop, scrollHeight, clientHeight } = main;
    const progress = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
    setScrollProgress(Math.min(progress, 1));
    setParallaxY(scrollTop);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div className="fixed inset-0 text-gray-800 overflow-hidden flex flex-col" style={{ background: 'linear-gradient(165deg, #fff1f2 0%, #ffe4e6 25%, #fce7f3 50%, #fff7ed 75%, #fff1f2 100%)' }}>

      {/* Vivid Gradient Mesh — parallax-linked orbs */}
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        <div style={{ transform: `translateY(${parallaxY * 0.08}px)` }}>
          <div className="atmo-orb animate-morph-1" style={{ width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(251,113,133,0.5), transparent 65%)', top: '-200px', left: '-120px', filter: 'blur(60px)' }} />
        </div>
        <div style={{ transform: `translateY(${parallaxY * -0.05}px)` }}>
          <div className="atmo-orb animate-morph-2" style={{ width: '550px', height: '550px', background: 'radial-gradient(circle, rgba(249,115,22,0.35), transparent 65%)', bottom: '-180px', right: '-120px', filter: 'blur(60px)', animationDelay: '-8s' }} />
        </div>
        <div style={{ transform: `translateY(${parallaxY * 0.04}px)` }}>
          <div className="atmo-orb animate-morph-3" style={{ width: '450px', height: '450px', background: 'radial-gradient(circle, rgba(168,85,247,0.3), transparent 65%)', top: '30%', left: '50%', filter: 'blur(60px)', animationDelay: '-15s' }} />
        </div>
        <div style={{ transform: `translateY(${parallaxY * -0.06}px)` }}>
          <div className="atmo-orb animate-morph-1" style={{ width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(251,191,36,0.25), transparent 65%)', top: '60%', left: '-10%', filter: 'blur(60px)', animationDelay: '-20s' }} />
        </div>
      </div>

      {/* Ambient Particle Layer */}
      <FloatingHearts />

      {/* Live WebGL Fluid Aurora Background */}
      <LiveBackground />

      {/* Subtle Vignette — frames the content */}
      <div className="fixed inset-0 pointer-events-none z-[2]" style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(255,228,230,0.5) 100%)' }} />

      {/* Main Content Area */}
      <main ref={mainRef} className="flex-1 relative z-10 w-full max-w-md mx-auto overflow-y-auto overflow-x-hidden no-scrollbar smooth-scroll pt-safe pb-32">
        {children}
      </main>

      {/* Global Features */}
      <TogetherMode />

      {/* Navigation */}
      <BottomNav currentView={currentView} setView={setView} notifications={notifications} />
    </div>
  );
};
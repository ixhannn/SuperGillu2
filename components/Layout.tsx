import React, { useRef, useEffect, createContext, useContext, memo, useCallback, useMemo } from 'react';
import { BottomNav } from './BottomNav';
import { AmbientVisuals } from './AmbientVisuals';
import { TogetherMode } from './TogetherMode';
import { DebugOverlay } from './DebugOverlay';
import { DynamicToast } from './DynamicToast';
import { DeferredOverlays } from './DeferredOverlays';
import type { ConfettiHandle } from './PhysicsConfetti';
import { OfflineNotice } from './OfflineNotice';
import { ViewState } from '../types';
import { startBreathingRhythm } from '../utils/BreathingRhythm';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  setView: (view: ViewState) => void;
  registerScrollRef?: (el: HTMLElement | null) => void;
  /**
   * @deprecated No longer drilled — AmbientVisuals reads
   * `<html data-transitioning>` directly. Keeping the prop signature so the
   * App.tsx call site doesn't need to change in this pass; passing it is a
   * no-op. Layout no longer re-renders on every tab switch.
   */
  isSwitchingView?: boolean;
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
  // wrapperRef = overflow:hidden clip container for the app's main scroll root.
  const wrapperRef  = useRef<HTMLElement>(null);
  const confettiRef = useRef<ConfettiHandle>(null);

  // Boot Lenis once both DOM refs are available.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Pass the wrapper to App.tsx so navigation can restore scroll position.
    if (registerScrollRef) registerScrollRef(wrapper);

    return () => {
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
    // ── Read phase first — prevents layout thrash ──────────────────
    const rect = target.getBoundingClientRect();
    const pos  = getComputedStyle(target).position;
    // ── Write phase — all mutations after reads ────────────────────
    if (pos === 'static') target.style.position = 'relative';
    target.style.overflow = 'hidden';
    const circle = document.createElement('span');
    circle.className = 'ripple-ink-circle';
    circle.style.cssText = `left:${e.clientX - rect.left}px;top:${e.clientY - rect.top}px`;
    target.appendChild(circle);
    circle.addEventListener('animationend', () => circle.remove(), { once: true });
  }, []);

  // Stable context value — an inline literal here invalidated every
  // useConfetti consumer on each Layout render.
  const confettiContextValue = useMemo(
    () => ({ trigger: (x?: number, y?: number) => confettiRef.current?.trigger(x, y) }),
    [],
  );

  return (
    <ConfettiContext.Provider value={confettiContextValue}>
      <div
        className="fixed inset-0 text-gray-800 overflow-hidden flex flex-col"
        style={{
          // Use the dynamic viewport so the app extends to the full screen as
          // browser chrome (URL bar, gesture nav) collapses on scroll.
          height: '100dvh',
          width: '100vw',
          // Gradient bleeds edge-to-edge under the status bar and gesture pill
          // so there is no hard color band where browser chrome meets the app.
          background: 'var(--theme-bg-main, linear-gradient(168deg, #F8E7EC 0%, #EBD4DB 50%, #DEBFC9 100%))',
          color: 'var(--color-text-primary, #2D1F25)',
        }}
        onPointerDown={handleRipple}
      >
        {/* No paused prop — AmbientVisuals reads <html data-transitioning>
            directly so toggling it during a navigation no longer breaks
            Layout's React.memo and forces a re-render of every keep-alive
            shell underneath. */}
        <AmbientVisuals />

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
          // max-w-md mx-auto caps the content to a phone-width column even
          // when previewed on a desktop browser. Without it, cards sprawl
          // edge-to-edge on wide viewports — looks broken even though the
          // app targets phones.
          className="lenis-wrapper flex-1 min-h-0 relative z-10 w-full max-w-md mx-auto"
          style={{
            background: 'transparent',
            overflowAnchor: 'none',
            overscrollBehaviorY: 'none',
            scrollPaddingBottom: 'calc(8rem + var(--lior-keyboard-height, 0px))',
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)',
            // Named View-Transition layer. Lives HERE (the viewport-clipped
            // scroll container) rather than on the inner content wrapper so
            // push/pop snapshots rasterize one viewport-sized texture instead
            // of the full multi-thousand-px content height — the difference
            // between a fluid 120fps slide and a multi-frame raster stall on
            // phones. Nav + ambient layers sit outside and stay live.
            viewTransitionName: 'main-view',
          } as React.CSSProperties}
        >
          <div
            className="lenis-content pt-safe pb-32"
            style={{
              minHeight: '100%',
              contain: 'paint',
              isolation: 'isolate',
            }}
          >
            {children}
          </div>
        </main>

        {/* Global overlays — these sit above the scroll layer */}
        <TogetherMode />
        <OfflineNotice />
        <BottomNav currentView={currentView} setView={setView} notifications={notifications} />
        <DebugOverlay />
        <DynamicToast />
        {/* PhysicsConfetti + TouchTrailCanvas are deferred until after first
            paint settles. They were previously stealing 5–15ms from the
            initial frame budget for canvases the user can't even see yet. */}
        <DeferredOverlays ref={confettiRef} />
      </div>
    </ConfettiContext.Provider>
  );
}) as React.FC<LayoutProps>;

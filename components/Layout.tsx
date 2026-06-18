import React, { useRef, useEffect, useLayoutEffect, createContext, useContext, memo, useCallback, useMemo } from 'react';
import { BottomNav } from './BottomNav';
import { AmbientVisuals } from './AmbientVisuals';
import { TogetherMode } from './TogetherMode';
import { DebugOverlay } from './DebugOverlay';
import { DynamicToast } from './DynamicToast';
import { DeferredOverlays } from './DeferredOverlays';
import type { ConfettiHandle } from './PhysicsConfetti';
import { OfflineNotice } from './OfflineNotice';
import { ViewState } from '../types';
import { shouldPauseAmbientMotionForView } from '../utils/ambientMotion';

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

const VIEW_SURFACES: Partial<Record<ViewState, string>> = {
  'private-space': '#f1edf3',
  // Pulse is an immersive near-black screen. Without a matching surface the
  // pink app background showed through the content column's bottom padding,
  // so the page looked like it ended abruptly mid-screen.
  'aura-signal': '#050508',
};

// Views that hide the bottom tab bar. (Pulse keeps the nav — its dock orb is
// lifted clear of it and the dark canvas bleeds behind it; hiding it left a
// black gutter band and the bar abruptly vanishing.)
const HIDE_NAV_VIEWS = new Set<ViewState>([]);

export const ConfettiContext = createContext<{ trigger: (x?: number, y?: number) => void }>({
  trigger: () => {},
});
export const useConfetti = () => useContext(ConfettiContext);

export const Layout: React.FC<LayoutProps> = memo(({ children, currentView, setView, registerScrollRef, notifications }) => {
  // wrapperRef = overflow:hidden clip container for the app's main scroll root.
  const wrapperRef  = useRef<HTMLElement>(null);
  const confettiRef = useRef<ConfettiHandle>(null);
  const viewSurface = VIEW_SURFACES[currentView] ?? 'transparent';

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (shouldPauseAmbientMotionForView(currentView)) {
      root.dataset.ambientMotionPaused = '1';
    } else {
      delete root.dataset.ambientMotionPaused;
    }
    return () => {
      delete root.dataset.ambientMotionPaused;
    };
  }, [currentView]);

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

  // Global ink-ripple on deliberate .spring-press taps. Click fires after
  // browser gesture cancellation, so scrolling across buttons will not ripple.
  const handleRipple = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
        onClick={handleRipple}
      >
        {/* No paused prop — AmbientVisuals reads <html data-transitioning>
            directly so toggling it during a navigation no longer breaks
            Layout's React.memo and forces a re-render of every keep-alive
            shell underneath. */}
        <AmbientVisuals />

        {/* Vignette — promoted to its own compositor layer so the scrolling
            content underneath does not invalidate the painted radial
            gradients every frame. The vignette never moves, but without a
            transform hint the browser repaints it during the scroll. */}
        <div
          className="fixed inset-0 pointer-events-none z-[2]"
          aria-hidden="true"
          style={{
            background: 'var(--theme-vignette, radial-gradient(ellipse 120% 80% at 50% -10%, rgba(251,207,232,0.14) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(249,168,212,0.08) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(251,207,232,0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(244,114,182,0.05) 0%, transparent 50%))',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            contain: 'strict',
            // Reserve intrinsic size so the layer is sized at compositor time
            // without needing layout from the document tree.
            width: '100vw',
            height: '100dvh',
            top: 0,
            left: 0,
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
            background: viewSurface,
            overflowAnchor: 'none',
            overscrollBehaviorY: 'none',
            scrollPaddingBottom: 'calc(8rem + var(--lior-keyboard-height, 0px))',
            // NOTE: do NOT set transform/translateZ/backfaceVisibility here.
            // On iOS WKWebView those promote the scroll container to a
            // composited layer that fights with native momentum scrolling —
            // it's what was causing posts to "blink" the moment a finger
            // touched them mid-scroll. Native -webkit-overflow-scrolling:touch
            // already handles GPU scroll without help.
          }}
        >
          <div
            className="lenis-content pt-safe pb-32"
            style={{
              minHeight: '100%',
              background: viewSurface,
              // contain:paint limits paint to this box — children that scroll
              // do NOT invalidate the rest of the viewport's paint tree.
              contain: 'paint',
              isolation: 'isolate',
              // backface hide → keeps the WebView's compositor from creating a
              // fresh layer when a child temporarily promotes itself with a
              // transform (e.g. during transition snapshots).
              backfaceVisibility: 'hidden',
            }}
          >
            {children}
          </div>
        </main>

        <div
          data-lior-motion-veil="true"
          className="fixed inset-0 pointer-events-none z-[45]"
          aria-hidden="true"
          style={{
            background: [
              'linear-gradient(104deg, transparent 4%, rgba(255,255,255,0.28) 45%, rgba(249,168,212,0.18) 50%, transparent 74%)',
              'linear-gradient(104deg, transparent 18%, rgba(255,236,244,0.18) 52%, transparent 82%)',
            ].join(', '),
            contain: 'strict',
          }}
        />

        {/* Global overlays — these sit above the scroll layer */}
        <TogetherMode />
        <OfflineNotice />
        {!HIDE_NAV_VIEWS.has(currentView) && (
          <BottomNav currentView={currentView} setView={setView} notifications={notifications} />
        )}
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

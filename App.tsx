import React, { Suspense, useState, useEffect, useCallback, useRef, createContext, useContext, useLayoutEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Heart } from 'lucide-react';
import { Onboarding } from './components/Onboarding';
import { ViewState, TransitionDirection, ROOT_TABS, NavigationOptions } from './types';
import { TransitionEngine } from './utils/TransitionEngine';
import type { EngineDirection } from './utils/TransitionEngine';
import { NativeShellService } from './services/nativeShell';


// Navigation context for back navigation
export const NavigationContext = createContext<{
  navigateTo: (view: ViewState, options?: NavigationOptions) => void;
  goBack: () => void;
  canGoBack: boolean;
  currentView: ViewState;
}>({
  navigateTo: () => {},
  goBack: () => {},
  canGoBack: false,
  currentView: 'home',
});
export const useNavigation = () => useContext(NavigationContext);
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { ViewTransition } from './components/ViewTransition';
import { Auth } from './views/Auth';
import { SyncService, syncEventTarget } from './services/sync';
import { StorageService, storageEventTarget } from './services/storage';
import { ThemeService, THEMES, ThemeId } from './services/theme';
import { SupabaseService } from './services/supabase';
import { Haptics } from './services/haptics';
import { Audio } from './services/audio';
import { DiagnosticsService } from './services/diagnostics';
import { NotificationsService } from './services/notifications';
import { AnimatePresence, motion } from 'framer-motion'; // Added for AuraSignalReceiver
import { AppLaunchOverlay } from './components/AppLaunchOverlay';
import { DevPanel } from './components/DevPanel';
import { WhatsNew } from './components/WhatsNew';
import { CoachmarkProvider, useCoachmark } from './components/CoachmarkSystem';
import { FeatureDiscovery } from './services/featureDiscovery';
import { InternalAdminService } from './services/internalAdmin';
import { getViewComponent, isViewModuleLoaded, preloadViewModule, preloadViewModules } from './views/viewRegistry';
import { bootstrapE2ELocalState, getE2EInitialView, isE2EAppMode } from './services/e2eHarness';

const hasCompletedOnboarding = () => StorageService.hasCompletedOnboarding();

const COMMON_NAV_PRELOADS: ViewState[] = [
  'add-memory',
  'timeline',
  'daily-moments',
  'us',
  'profile',
  'sync',
  'countdowns',
  'open-when',
  'dinner-decider',
  'mood-calendar',
  'bonsai-bloom',
  'private-space',
  'time-capsule',
  'surprises',
  'daily-video',
  'weekly-recap',
];

/** Inner component — must live inside CoachmarkProvider to access context */
const CoachmarkTourScheduler: React.FC<{ shouldTrigger: boolean; onTriggered: () => void }> = ({ shouldTrigger, onTriggered }) => {
  const { triggerTour } = useCoachmark();
  useEffect(() => {
    if (!shouldTrigger) return;
    const t = setTimeout(() => {
      triggerTour();
      onTriggered();
    }, 2600);
    return () => clearTimeout(t);
  }, [shouldTrigger, triggerTour, onTriggered]);
  return null;
};

// Onboarding is now in components/Onboarding.tsx

const RouteLoader = () => (
  <div
    className="min-h-screen flex flex-col items-center justify-center gap-6 overflow-hidden"
    style={{ background: 'var(--theme-bg-main)', color: 'var(--color-text-primary)' }}
  >
    <div className="absolute inset-0" style={{ background: 'var(--theme-vignette)', opacity: 0.95 }} />
    <div className="relative">
      <div
        className="absolute inset-0 rounded-full animate-breathe-glow"
        style={{
          background: 'radial-gradient(circle, rgba(var(--theme-particle-2-rgb),0.34) 0%, transparent 70%)',
          transform: 'scale(2.9)',
        }}
      />
      <div className="w-24 h-24 rounded-[1.75rem] liquid-glass flex items-center justify-center relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.34), transparent 55%)' }}
        />
        <Heart
          size={34}
          className="relative z-10"
          fill="currentColor"
          style={{ opacity: 0.95, color: 'var(--color-nav-active)', animation: 'ui-breathe 1.8s ease-in-out infinite' }}
        />
      </div>
    </div>
    <div className="relative z-10 text-center">
      <p className="font-serif text-[1.45rem] tracking-[0.28em]">LIOR</p>
      <p className="mt-2 text-[0.72rem] font-semibold uppercase tracking-[0.26em]" style={{ color: 'var(--color-text-secondary)' }}>
        Waking the room softly
      </p>
    </div>
  </div>
);

const RouteFallback = () => null;

// Main App Component with Default Export
const App = () => {
  const e2eMode = isE2EAppMode();
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [, setTransitionDir] = useState<TransitionDirection>('tab');
  const historyStack = useRef<ViewState[]>([]);
  const scrollPositions = useRef<Record<string, number>>({});
  const pendingScrollRestore = useRef<{ view: ViewState; y: number } | null>(null);
  const transitionLockRef = useRef(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const pendingNavigationMetricRef = useRef<{ view: ViewState; direction: TransitionDirection; startedAt: number } | null>(null);
  // Tracks current view synchronously for pre-transition direction calculation.
  // Must be updated BEFORE state changes so direction is resolved correctly.
  const currentViewRef = useRef<ViewState>('home');

  // ── Keep-alive tab registry ─────────────────────────────────────────────
  // The REF is the source of truth so navigation callbacks never close over
  // state — that keeps navigateTo/runNavigation referentially stable for the
  // app's lifetime. (Previously runNavigation depended on the mountedTabs
  // STATE, so its identity churned when a tab mounted, which re-ran the giant
  // bootstrap effect — re-fetching the Supabase session, re-subscribing auth,
  // restarting the native shell — on the FIRST visit to every tab. That was
  // the single biggest tab-switch stall in the app.)
  const mountedTabsRef = useRef<Set<ViewState>>(new Set(['home']));
  const [mountedTabs, setMountedTabs] = useState<Set<ViewState>>(() => mountedTabsRef.current);
  const mountTab = useCallback((tab: ViewState) => {
    if (!ROOT_TABS.includes(tab) || mountedTabsRef.current.has(tab)) return;
    const next = new Set(mountedTabsRef.current);
    next.add(tab);
    mountedTabsRef.current = next;
    setMountedTabs(next);
  }, []);

  // Register main scroll container from Layout
  const registerScrollRef = useCallback((el: HTMLElement | null) => {
    mainScrollRef.current = el;
  }, []);

  const getCurrentScroll = useCallback(() => {
    return mainScrollRef.current?.scrollTop ?? 0;
  }, []);

  const restoreScroll = useCallback((y: number, immediate = true) => {
    mainScrollRef.current?.scrollTo({
      top: y,
      behavior: immediate ? 'auto' : 'smooth',
    });
  }, []);

  useLayoutEffect(() => {
    const pending = pendingScrollRestore.current;
    if (!pending || pending.view !== currentView) return;
    restoreScroll(pending.y, true);
    pendingScrollRestore.current = null;
  }, [currentView, restoreScroll]);

  // Gesture-back: TransitionEngine fires this after the swipe-exit animation.
  // We only update React state here — the engine owns the fade-in animation.
  useEffect(() => {
    const handler = () => {
      if (historyStack.current.length === 0) return;
      const prev        = currentViewRef.current;
      const destination = historyStack.current.pop() ?? 'home';
      scrollPositions.current[prev] = getCurrentScroll();
      currentViewRef.current        = destination;
      flushSync(() => {
        setTransitionDir('pop');
        setCurrentView(destination);
      });
    };
    window.addEventListener('te:gesture-back', handler);
    return () => window.removeEventListener('te:gesture-back', handler);
  }, [getCurrentScroll]);

  // ── Module preload + shell pre-mount on prefetch ────────────────────────
  // Fired on pointerdown. For ROOT_TABS we also pre-mount the keep-alive
  // shell (hidden) so the lazy mount and first render happen during the
  // finger-down window — by pointerup the switch is a pure CSS class flip.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: string; views?: string[] }>).detail;
      const hintedViews = (detail?.views?.length ? detail.views : detail?.view ? [detail.view] : [])
        .filter((view): view is ViewState => Boolean(view) && view !== currentViewRef.current)
        .filter((view, index, list) => list.indexOf(view) === index)
        .slice(0, 3);
      for (const view of hintedViews) {
        if (ROOT_TABS.includes(view) && isViewModuleLoaded(view)) mountTab(view);
      }
      void preloadViewModules(hintedViews);
    };
    window.addEventListener('te:prefetch', handler);
    return () => window.removeEventListener('te:prefetch', handler);
  }, [mountTab]);

  const finalizeNavigation = useCallback(() => {
    const metric = pendingNavigationMetricRef.current;
    if (metric) {
      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      DiagnosticsService.recordNavigation(metric.view, metric.direction, Math.round(finishedAt - metric.startedAt));
      pendingNavigationMetricRef.current = null;
    }
    transitionLockRef.current = false;
  }, []);

  // ── Fast tab transition ─────────────────────────────────────────────────
  // Tab-to-tab is a single state commit; the shells' class flip happens in a
  // layout effect and the cached element identities mean React reconciles
  // essentially nothing. No flushSync, no View Transition, no lock window —
  // this is what makes tab taps land on the very next frame, iOS-style.
  const runTabTransition = useCallback((destination: ViewState, startedAt?: number) => {
    pendingNavigationMetricRef.current = {
      view: destination,
      direction: 'tab',
      startedAt: startedAt ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    };
    setTransitionDir('tab');
    setCurrentView(destination);
    requestAnimationFrame(finalizeNavigation);
  }, [finalizeNavigation]);

  const runNavigation = useCallback((destination: ViewState, dir: TransitionDirection, startedAt?: number) => {
    pendingScrollRestore.current = {
      view: destination,
      y: scrollPositions.current[destination] ?? 0,
    };

    // Tab-to-tab ALWAYS takes the keep-alive fast path — including first
    // visits (the shell mounts in the same commit; the module is preloaded
    // by navigateTo before we get here, and the registry's synchronous
    // thenable means no Suspense round-trip).
    if (dir === 'tab' && ROOT_TABS.includes(destination) && ROOT_TABS.includes(currentViewRef.current)) {
      mountTab(destination);
      runTabTransition(destination, startedAt);
      return;
    }

    transitionLockRef.current = true;
    pendingNavigationMetricRef.current = {
      view: destination,
      direction: dir,
      startedAt: startedAt ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    };

    // Pop/push INTO a tab: mount its shell before the transition snapshot so
    // the commit renders real content (the pending state update is flushed
    // by the flushSync inside commit).
    if (ROOT_TABS.includes(destination)) mountTab(destination);

    TransitionEngine.navigate(
      dir as EngineDirection,
      () => {
        flushSync(() => {
          setTransitionDir(dir);
          setCurrentView(destination);
        });
      },
      () => {
        requestAnimationFrame(finalizeNavigation);
      },
    );
  }, [finalizeNavigation, mountTab, runTabTransition]);

  const navigateTo = useCallback((view: ViewState, options: NavigationOptions = {}) => {
    const prev = currentViewRef.current;
    if (prev === view || transitionLockRef.current) return;

    // ── Resolve direction before the transition snapshot ─────────────────────
    let dir: TransitionDirection = 'tab';
    if (view === 'add-memory') dir = 'modal';
    else if (ROOT_TABS.includes(view) && ROOT_TABS.includes(prev)) dir = 'tab';
    else dir = 'push';

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const applyNavigationRefs = () => {
      // Save scroll and update history synchronously (ref mutations, no re-render)
      scrollPositions.current[prev] = getCurrentScroll();
      if (!ROOT_TABS.includes(view)) {
        historyStack.current.push(prev);
        if (historyStack.current.length > 20) historyStack.current.shift();
      } else {
        historyStack.current = [];
      }
      currentViewRef.current = view;
    };

    const commitNavigation = () => {
      applyNavigationRefs();

      // ── View Transitions API: captures old/new DOM snapshots around setState ──
      // flushSync makes React update the DOM synchronously inside the VT callback
      // so the browser captures the correct before/after states.
      runNavigation(view, dir, startedAt);
    };

    if (options.instant) {
      applyNavigationRefs();
      pendingScrollRestore.current = {
        view,
        y: scrollPositions.current[view] ?? 0,
      };
      if (ROOT_TABS.includes(view)) mountTab(view);
      flushSync(() => {
        setTransitionDir(dir);
        setCurrentView(view);
      });
      transitionLockRef.current = false;
      return;
    }

    if (!isViewModuleLoaded(view)) {
      transitionLockRef.current = true;
      void preloadViewModule(view)
        .catch((error) => {
          DiagnosticsService.recordError('navigation.preload', error, { view });
        })
        .finally(() => {
          // Commit immediately — the synchronous-thenable registry mounts the
          // freshly parsed module without a Suspense round-trip, so there is
          // nothing to wait a frame for.
          transitionLockRef.current = false;
          commitNavigation();
        });
      return;
    }

    commitNavigation();
  }, [getCurrentScroll, mountTab, runNavigation]);

  const goBack = useCallback(() => {
    if (transitionLockRef.current) return;
    const prev        = currentViewRef.current;
    const destination = historyStack.current.pop() ?? 'home';

    scrollPositions.current[prev] = getCurrentScroll();
    currentViewRef.current        = destination;
    runNavigation(destination, 'pop');
  }, [getCurrentScroll, runNavigation]);

  const canGoBack = historyStack.current.length > 0;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [launchReady, setLaunchReady] = useState(e2eMode);
  const [showLaunchOverlay, setShowLaunchOverlay] = useState(!e2eMode);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [scheduleTour, setScheduleTour] = useState(false);

  useEffect(() => {
    if (e2eMode) return;
    const launchTimer = window.setTimeout(() => setLaunchReady(true), 1350);
    return () => window.clearTimeout(launchTimer);
  }, [e2eMode]);

  useEffect(() => {
    DiagnosticsService.start();
  }, []);

  useEffect(() => {
    if (isInitialized && launchReady) {
      setShowLaunchOverlay(false);
    }
  }, [isInitialized, launchReady]);

  useEffect(() => {
    if (!isInitialized || showOnboarding || (!e2eMode && !isAuthenticated && SupabaseService.isConfigured())) return;
    if (typeof window === 'undefined') return;

    const scheduleIdle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({
      didTimeout: false,
      timeRemaining: () => 0,
    }), 900));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const idleId = scheduleIdle(() => {
      void preloadViewModules(COMMON_NAV_PRELOADS);
    }, { timeout: 2400 });

    return () => cancelIdle(idleId as number);
  }, [e2eMode, isAuthenticated, isInitialized, showOnboarding]);

  useEffect(() => {
    if (!isInitialized || showOnboarding || (!e2eMode && !isAuthenticated && SupabaseService.isConfigured())) return;
    void NotificationsService.applySchedule().catch((error) => {
      DiagnosticsService.recordError('notifications.schedule', error);
    });
  }, [e2eMode, isAuthenticated, isInitialized, showOnboarding]);

  useEffect(() => {
    let disposed = false;
    let authSubscription: { unsubscribe: () => void } | null = null;
    let whatsNewTimer: number | null = null;
    let removeResumeListener: (() => void) | null = null;
    let removeShellListener: (() => void) | null = null;
    let wasOnline = NativeShellService.getState().isOnline;

    const initializeSync = async () => {
      try {
        await SyncService.init();
      } catch (syncError) {
        console.error("Sync Initialization failed:", syncError);
        DiagnosticsService.recordError('sync.init', syncError);
      }
    };

    const initializeApp = async () => {
      let hasOnboardedAfterBootstrap = false;
      try {
        // 1. Initialize Storage and DB
        await StorageService.init();
        if (disposed) return;

        if (e2eMode) {
          bootstrapE2ELocalState();
        }

        // 2. Read the local profile for theme/bootstrap defaults.
        const profile = StorageService.getCoupleProfile();

        // 3. Apply theme from URL override first, then fallback to stored profile theme.
        const params = new URLSearchParams(window.location.search);
        const forcedTheme = params.get('theme');
        const hasForcedTheme = !!forcedTheme && (forcedTheme in THEMES);
        const themeToApply = (hasForcedTheme ? forcedTheme : (profile.theme || 'rose')) as ThemeId;

        ThemeService.applyTheme(themeToApply);

        if (hasForcedTheme) {
          const cleanedUrl = new URL(window.location.href);
          cleanedUrl.searchParams.delete('theme');
          window.history.replaceState({}, '', cleanedUrl.toString());
        }

        if (e2eMode) {
          const initialView = getE2EInitialView();
          hasOnboardedAfterBootstrap = true;
          SyncService.reset();
          if (!disposed) {
            setIsAuthenticated(true);
            setShowOnboarding(false);
            setShowLaunchOverlay(false);
            if (initialView) {
              currentViewRef.current = initialView;
              setCurrentView(initialView);
            }
          }
          return;
        }

        // 4. Initialize Cloud Services (Supabase Auth)
        if (SupabaseService.init()) {
          try {
            const session = await SupabaseService.getSession();
            if (disposed) return;

            SupabaseService.setCachedUserId(session?.user?.id || null);
            StorageService.activateAccount(session?.user?.id || null);
            setIsAuthenticated(Boolean(session));

            // Listen for realtime auth changes
            const { data: { subscription } } = SupabaseService.client!.auth.onAuthStateChange((_event, session) => {
              void (async () => {
                if (disposed) return;
                SupabaseService.setCachedUserId(session?.user?.id || null);
                StorageService.activateAccount(session?.user?.id || null);
                setIsAuthenticated(Boolean(session));

                if (session) {
                  await initializeSync();
                  if (!disposed) {
                    setShowOnboarding(!hasCompletedOnboarding());
                  }
                } else {
                  if (!disposed) {
                    setShowOnboarding(false);
                  }
                  SyncService.reset();
                }
              })();
            });
            authSubscription = subscription;

            if (session) {
              await initializeSync();
              hasOnboardedAfterBootstrap = hasCompletedOnboarding();
              if (!disposed) {
                setShowOnboarding(!hasOnboardedAfterBootstrap);
              }
            } else {
              hasOnboardedAfterBootstrap = false;
              if (!disposed) {
                setShowOnboarding(false);
              }
              SyncService.reset();
            }
          } catch (authError) {
            console.error("Supabase Auth failed:", authError);
            DiagnosticsService.recordError('supabase.auth', authError);
            SupabaseService.setCachedUserId(null);
            if (!disposed) {
              setIsAuthenticated(false);
              setShowOnboarding(false);
            }
            SyncService.reset();
          }
        } else {
          hasOnboardedAfterBootstrap = hasCompletedOnboarding();
          if (!disposed) {
            setShowOnboarding(!hasOnboardedAfterBootstrap);
          }
          SyncService.reset();
        }
      } catch (err) {
        console.error("Initialization error:", err);
        DiagnosticsService.recordError('app.init', err);
      } finally {
        if (!disposed) {
          setIsInitialized(true);
        }
        // Show What's New for returning users who haven't seen this version yet
        if (!disposed && !e2eMode && hasOnboardedAfterBootstrap && !FeatureDiscovery.hasSeenCurrentVersion()) {
          whatsNewTimer = window.setTimeout(() => {
            if (!disposed) setShowWhatsNew(true);
          }, 1800);
        }
        // Hide native splash screen after content is ready, with a brief
        // delay so the first paint is composited before the splash fades.
        if (!disposed) {
          requestAnimationFrame(() => {
            void NativeShellService.markReady();
          });
        }
      }
    };

    initializeApp();

    NativeShellService.start({
      onHardwareBack: () => {
        // Dispatch to open modals first.
        const event = new CustomEvent('lior:hardware-back', { cancelable: true });
        window.dispatchEvent(event);
        if (event.defaultPrevented) return true;

        if (historyStack.current.length > 0 && !transitionLockRef.current) {
          const prev        = currentViewRef.current;
          const destination = historyStack.current.pop() ?? 'home';

          scrollPositions.current[prev] = getCurrentScroll();
          currentViewRef.current        = destination;
          runNavigation(destination, 'pop');
          return true;
        }

        // Already at root — minimize the app (Android pattern).
        NativeShellService.minimizeApp();
        return true;
      },
    });

    removeResumeListener = NativeShellService.onResume(() => {
      const shell = NativeShellService.getState();
      if (shell.isOnline && SyncService.isConnected) {
        void SyncService.refreshFromCloud();
      }
    });
    removeShellListener = NativeShellService.subscribe((shell) => {
      if (!wasOnline && shell.isOnline && SyncService.isConnected) {
        void SyncService.refreshFromCloud();
      }
      wasOnline = shell.isOnline;
    });

    return () => {
      disposed = true;
      authSubscription?.unsubscribe();
      if (whatsNewTimer !== null) {
        window.clearTimeout(whatsNewTimer);
      }
      removeResumeListener?.();
      removeShellListener?.();
      NativeShellService.stop();
    };
  }, [e2eMode, getCurrentScroll, runNavigation]);


  const handleOnboardingSelect = (_me: string, _partner: string) => {
    // Profile + lior_onboarded flag are saved inside the Onboarding component
    setShowOnboarding(false);
    // Schedule the coachmark tour for brand-new users
    setScheduleTour(true);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // ── Keep-alive tab tree ─────────────────────────────────────────────────
  // Render every visited ROOT_TAB inside its own keep-alive shell. Only the
  // active one is visible; the others have `display:none` (state preserved,
  // effects continue, paint cost zero).
  //
  // Two invariants make tab switches near-free:
  //  1. The tab's React ELEMENT is created exactly once and cached — stable
  //     element identity lets React bail out of the entire subtree, so a
  //     switch reconciles ~nothing. (Previously every switch recreated all
  //     elements and synchronously re-rendered EVERY mounted view.)
  //  2. is-active/is-cached + inert/aria-hidden are applied imperatively in
  //     a layout effect, so the shells' JSX doesn't depend on currentView.
  // Safe because navigateTo is referentially stable for the app's lifetime.
  const tabElementCache = useRef(new Map<ViewState, React.ReactElement>());
  const keepAliveTabs = useMemo(() => {
    return Array.from(mountedTabs).map((tab) => {
      let element = tabElementCache.current.get(tab);
      if (!element) {
        const TabView = getViewComponent(tab);
        element = <TabView setView={navigateTo} />;
        tabElementCache.current.set(tab, element);
      }
      const isActive = tab === currentViewRef.current;
      return (
        <div
          key={tab}
          data-keep-alive-tab={tab}
          className={`keep-alive-shell ${isActive ? 'is-active' : 'is-cached'}`}
        >
          {/* Per-shell boundary: a (pre-)mounting tab that suspends only
              blanks its own hidden shell, never the visible tree. */}
          <Suspense fallback={null}>{element}</Suspense>
        </div>
      );
    });
  }, [mountedTabs, navigateTo]);

  // Imperative shell activation — runs before paint within the same commit
  // (and inside flushSync for View Transition snapshots).
  useLayoutEffect(() => {
    const shells = document.querySelectorAll<HTMLElement>('[data-keep-alive-tab]');
    shells.forEach((el) => {
      const tab = el.dataset.keepAliveTab;
      if (!tab || tab === '__overlay__') return;
      const isActive = tab === currentView;
      el.classList.toggle('is-active', isActive);
      el.classList.toggle('is-cached', !isActive);
      el.toggleAttribute('inert', !isActive);
      if (isActive) {
        el.removeAttribute('aria-hidden');
      } else {
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }, [currentView, mountedTabs]);

  // Non-tab view (push/pop destinations like sync, settings, etc.)
  // Mounts/unmounts normally — these are not on the hot path.
  const overlayView = useMemo(() => {
    if (ROOT_TABS.includes(currentView)) return null;
    const ActiveView = getViewComponent(currentView);
    return <ActiveView setView={navigateTo} />;
  }, [currentView, navigateTo]);

  // Stable context value — navigateTo/goBack never change identity; the
  // object itself only changes when currentView/canGoBack actually change.
  const navigationContextValue = useMemo(
    () => ({ navigateTo, goBack, canGoBack, currentView }),
    [navigateTo, goBack, canGoBack, currentView],
  );

  // Global Loading State
  if (!isInitialized) {
    return <RouteLoader />;
  }

  // Cloud Authentication Check
  if (!e2eMode && !isAuthenticated && SupabaseService.isConfigured()) {
    const AuthOverlayView = currentView === 'privacy-policy'
      ? getViewComponent('privacy-policy')
      : getViewComponent('terms-of-service');

    return (
      <ErrorBoundary>
        <Auth
          onLogin={handleLoginSuccess}
          onPrivacyPolicy={() => setCurrentView('privacy-policy')}
          onTerms={() => setCurrentView('terms-of-service')}
        />
        {(currentView === 'privacy-policy' || currentView === 'terms-of-service') && (
          <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--theme-bg-main)' }}>
            <Suspense fallback={<RouteLoader />}>
              <AuthOverlayView setView={navigateTo} onBack={() => setCurrentView('home')} />
            </Suspense>
          </div>
        )}
      </ErrorBoundary>
    );
  }

  // First-time Onboarding Check
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingSelect} />;
  }

  return (
    <>
      <NavigationContext.Provider value={navigationContextValue}>
        <CoachmarkProvider currentView={currentView} navigateTo={navigateTo}>
          <ErrorBoundary>
            <Layout currentView={currentView} setView={navigateTo} registerScrollRef={registerScrollRef}>
              <Suspense fallback={<RouteFallback />}>
                <ViewTransition viewKey={currentView}>
                  {/* Keep-alive: every visited tab stays mounted forever.
                      Switching between tabs is a CSS visibility flip — no
                      React unmount, no Suspense roundtrip, no fresh mount
                      cost. This is what makes tab nav feel native. */}
                  {keepAliveTabs}
                  {/* Non-tab views (push/pop destinations) render on top.
                      They mount/unmount normally since they're not hot-path. */}
                  {overlayView && (
                    <div className="keep-alive-shell is-active" data-keep-alive-tab="__overlay__">
                      <Suspense fallback={null}>{overlayView}</Suspense>
                    </div>
                  )}
                </ViewTransition>
              </Suspense>
            </Layout>
            <AuraSignalReceiver />
            <AnimatePresence>
              {showLaunchOverlay && <AppLaunchOverlay />}
            </AnimatePresence>
            <AnimatePresence>
              {showWhatsNew && (
                <WhatsNew onClose={() => {
                  setShowWhatsNew(false);
                  setScheduleTour(true);
                }} />
              )}
            </AnimatePresence>
            <CoachmarkTourScheduler
              shouldTrigger={scheduleTour}
              onTriggered={() => setScheduleTour(false)}
            />
          </ErrorBoundary>
        </CoachmarkProvider>
      </NavigationContext.Provider>
      {import.meta.env.DEV && <DevPanel actions={[
        {
          label: '▶ Replay splash screen',
          action: () => {
            setShowLaunchOverlay(true);
            setTimeout(() => setShowLaunchOverlay(false), 2200);
          },
        },
        {
          label: '📰 Show What\'s New',
          action: () => setShowWhatsNew(true),
        },
        {
          label: '🗺 Trigger coachmark tour',
          action: () => {
            FeatureDiscovery.resetAll();
            setScheduleTour(true);
          },
        },
        {
          label: '🏠 Go to Home',
          action: () => navigateTo('home'),
        },
        {
          label: '⚠ Clear onboarding flag',
          action: () => {
            StorageService.clearOnboardingCompletion();
            window.location.reload();
          },
          danger: true,
        },
        {
          label: '🔍 Debug memory media fields',
          action: () => {
            const mems = StorageService.getMemories();
            if (mems.length === 0) {
              console.warn('[MediaDebug] No memories found');
              return;
            }
            mems.slice(0, 3).forEach((m: any, i: number) => {
              console.log(`[MediaDebug] Memory ${i} (${m.id}):`, {
                imageId: m.imageId || null,
                storagePath: m.storagePath || null,
                hasInlineImage: !!(m.image && m.image.length > 0),
                inlineImageLen: m.image ? m.image.length : 0,
                videoId: m.videoId || null,
                videoStoragePath: m.videoStoragePath || null,
                hasInlineVideo: !!(m.video && m.video.length > 0),
              });
            });
            console.log(`[MediaDebug] Total memories: ${mems.length}`);
          },
        },
        {
          label: '🔄 Recover images from cloud',
          action: async () => {
            console.log('[MediaDebug] Starting cloud image recovery...');
            try {
              await StorageService.recoverImagesFromCloud();
              console.log('[MediaDebug] Recovery complete');
            } catch (e) {
              console.error('[MediaDebug] Recovery failed', e);
            }
          },
        },
        {
          label: 'Open storage console',
          action: () => navigateTo('storage-console'),
        },
        {
          label: InternalAdminService.isOverrideEnabled() ? 'Disable admin override' : 'Enable admin override',
          action: () => {
            const next = !InternalAdminService.isOverrideEnabled();
            InternalAdminService.setOverride(next);
            console.log(`[Admin] Internal admin override ${next ? 'enabled' : 'disabled'}`);
          },
        },
      ]} />}
    </>
  );
};

const AuraSignalReceiver = () => {
  const [incoming, setIncoming] = useState<{ id?: string, color: string, title: string, subtitle?: string, message: string, afterglow?: string } | null>(null);

  // Check Offine Inbox on mount and storage updates
  useEffect(() => {
    const checkInbox = () => {
      const profile = StorageService.getCoupleProfile();
      if (profile?.missedAuras && profile.missedAuras.length > 0) {
        // Find signals targeted at ME
        const myMissed = profile.missedAuras.filter((a: any) => a.target === profile.myName);
        if (myMissed.length > 0) {
          const latest = myMissed[myMissed.length - 1]; // Show most recent
          setIncoming({ ...latest.payload, id: latest.id });
        }
      }
    };
    checkInbox();
    storageEventTarget.addEventListener('storage-update', checkInbox);
    return () => storageEventTarget.removeEventListener('storage-update', checkInbox);
  }, []);

  // Handle Realtime incoming signals
  useEffect(() => {
    const handleSignal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.signalType === 'AURA_SIGNAL' && detail.payload) {
        setIncoming(detail.payload);
        Haptics.doubleBeat();
        Audio.play('heartbeat');

        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
           new Notification('Lior - New Aura', {
               body: detail.payload.title, 
               icon: '/icon.svg',
               silent: false
           });
        }
        
        setTimeout(() => setIncoming(null), 6000); // Auto-dismiss
      }
    };
    syncEventTarget.addEventListener('signal-received', handleSignal);
    return () => syncEventTarget.removeEventListener('signal-received', handleSignal);
  }, []);

  const dismiss = () => {
    if (incoming?.id) {
       StorageService.removeMissedAura(incoming.id);
    }
    setIncoming(null);
  };

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          onClick={dismiss}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-8 backdrop-blur-xl"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
        >
          {/* Incoming Aura Liquid Background */}
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 z-0 opacity-50 blur-[100px] pointer-events-none mix-blend-screen"
            style={{ backgroundColor: incoming.color }}
          />

          <motion.div 
            initial={{ y: 50, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20 }}
            className="relative z-10 flex flex-col items-center text-center max-w-sm"
          >
            <div 
              className="w-24 h-24 rounded-full mb-8 shadow-2xl animate-pulse-slow"
              style={{ backgroundColor: incoming.color, boxShadow: `0 0 80px ${incoming.color}` }}
            />
            <h2 className="font-serif font-bold text-4xl text-white mb-3 tracking-tight drop-shadow-md">
              {incoming.title}
            </h2>
            {incoming.subtitle && (
              <p className="text-sm uppercase tracking-[0.28em] text-white/45 font-semibold mb-3">
                {incoming.subtitle}
              </p>
            )}
            <p className="text-lg text-white/80 font-medium leading-relaxed drop-shadow-sm">
              {incoming.message}
            </p>
            {incoming.afterglow && (
              <p className="mt-5 text-sm text-white/60 font-medium max-w-xs">
                {incoming.afterglow}
              </p>
            )}
            <p className="mt-12 text-xs text-white/40 uppercase tracking-widest font-bold">Tap to dismiss</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default App;

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

export const NavigationActionsContext = createContext<{
  navigateTo: (view: ViewState, options?: NavigationOptions) => void;
  goBack: () => void;
  canGoBack: boolean;
}>({
  navigateTo: () => {},
  goBack: () => {},
  canGoBack: false,
});
export const useNavigationActions = () => useContext(NavigationActionsContext);
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
import { remoteErrorSink } from './services/errorSink';
import { FrameHealthService } from './services/frameHealth';
import { NotificationsService } from './services/notifications';
import { AnimatePresence, motion } from 'framer-motion'; // Added for AuraSignalReceiver
import { AppLaunchOverlay } from './components/AppLaunchOverlay';
import { DevPanel } from './components/DevPanel';
import { CoachmarkProvider, useCoachmark } from './components/CoachmarkSystem';
import { FeatureDiscovery } from './services/featureDiscovery';
import { InternalAdminService } from './services/internalAdmin';
import { scheduleIdleTask } from './utils/scheduler';
import { toast } from './utils/toast';
import { getViewComponent, isViewModuleLoaded, preloadViewModule, preloadViewModulesSequential } from './views/viewRegistry';
import { bootstrapE2ELocalState, getE2EInitialView, isE2EAppMode } from './services/e2eHarness';
import { ShareTargetService } from './services/shareTarget';
import { Capacitor } from '@capacitor/core';

const hasCompletedOnboarding = () => StorageService.hasCompletedOnboarding();

// ── Cold-launch state restoration ──────────────────────────────────────────
// Native apps reopen where you left them, even after process death. Persist
// the last root tab and boot straight into it. Non-tab views (push/pop
// destinations) intentionally fall back to their parent tab.
const LAST_TAB_KEY = 'lior_last_root_tab';

const restoreLastRootTab = (): ViewState => {
  if (isE2EAppMode()) return 'home';
  try {
    const stored = window.localStorage.getItem(LAST_TAB_KEY) as ViewState | null;
    return stored && ROOT_TABS.includes(stored) ? stored : 'home';
  } catch {
    return 'home';
  }
};

// Launcher shortcut / deep-link routes: com.lior.app://shortcut/<key>
const SHORTCUT_VIEWS: Partial<Record<string, ViewState>> = {
  'add-memory': 'add-memory',
  'daily-moments': 'daily-moments',
};

// Views a notification tap may navigate to. Payload values outside this
// list (malformed pushes, future kinds) fall back to doing nothing.
const NOTIFICATION_VIEWS = new Set<ViewState>([
  'home', 'us', 'timeline', 'daily-moments', 'profile', 'add-memory',
  'weekly-recap', 'daily-video', 'open-when', 'surprises', 'time-capsule',
  'mood-calendar', 'voice-notes', 'partner-intelligence',
]);

const WhatsNew = React.lazy(() =>
  import('./components/WhatsNew').then((module) => ({ default: module.WhatsNew })),
);

const CORE_NAV_PRELOADS: ViewState[] = [
  'add-memory',
  'timeline',
  'daily-moments',
  'us',
];

const SECONDARY_NAV_PRELOADS: ViewState[] = [
  'profile',
  'sync',
  'countdowns',
  'open-when',
  'dinner-decider',
];

const T_KEEP_ALIVE_TAB = 240;

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

const KeepAliveTabContent = React.memo(({
  tab,
  setView,
}: {
  tab: ViewState;
  setView: (view: ViewState, options?: NavigationOptions) => void;
}) => {
  const TabView = getViewComponent(tab);
  return <TabView setView={setView} />;
});
KeepAliveTabContent.displayName = 'KeepAliveTabContent';

const KeepAliveTabShell = React.memo(({
  tab,
  isActive,
  setView,
}: {
  tab: ViewState;
  isActive: boolean;
  setView: (view: ViewState, options?: NavigationOptions) => void;
}) => {
  return (
    <div
      data-keep-alive-tab={tab}
      className={`keep-alive-shell ${isActive ? 'is-active' : 'is-cached'}`}
      aria-hidden={!isActive}
      inert={isActive ? undefined : true}
    >
      {/* Per-shell boundaries: a tab that suspends only blanks its own
          shell, and a tab that THROWS (e.g. a failed chunk after a
          redeploy) is contained here — one broken tab can never take down
          the visible tree or the bottom nav. */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <KeepAliveTabContent tab={tab} setView={setView} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
});
KeepAliveTabShell.displayName = 'KeepAliveTabShell';

// Main App Component with Default Export
const App = () => {
  const e2eMode = isE2EAppMode();
  const [initialView] = useState<ViewState>(restoreLastRootTab);
  const [currentView, setCurrentView] = useState<ViewState>(initialView);
  const historyStack = useRef<ViewState[]>([]);
  const scrollPositions = useRef<Record<string, number>>({});
  const pendingScrollRestore = useRef<{ view: ViewState; y: number } | null>(null);
  const transitionLockRef = useRef(false);
  const tabTransitionTokenRef = useRef(0);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const pendingNavigationMetricRef = useRef<{ view: ViewState; direction: TransitionDirection; startedAt: number } | null>(null);
  // Tracks current view synchronously for pre-transition direction calculation.
  // Must be updated BEFORE state changes so direction is resolved correctly.
  const currentViewRef = useRef<ViewState>(initialView);

  // ── Keep-alive tab cache ────────────────────────────────────────────────
  // Every ROOT_TAB visited at least once stays mounted in the DOM. Switching
  // between cached tabs becomes a CSS visibility flip — no React unmount, no
  // re-render of the just-mounted tree, no Suspense boundary work, no
  // fresh useState/useEffect cost. Same React instance survives every
  // back-and-forth (Home → Us → Home is now genuinely free).
  const [mountedTabs, setMountedTabs] = useState<Set<ViewState>>(() => new Set([initialView]));
  const mountedTabsRef = useRef<Set<ViewState>>(new Set([initialView]));
  const markTabMounted = useCallback((view: ViewState) => {
    if (!ROOT_TABS.includes(view)) return;
    setMountedTabs((prev) => {
      if (prev.has(view)) {
        mountedTabsRef.current = prev;
        return prev;
      }
      const next = new Set(prev);
      next.add(view);
      mountedTabsRef.current = next;
      return next;
    });
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
        markTabMounted(destination);
        setCurrentView(destination);
      });
    };
    window.addEventListener('te:gesture-back', handler);
    return () => window.removeEventListener('te:gesture-back', handler);
  }, [getCurrentScroll, markTabMounted]);

  // ── Module preload on prefetch ──────────────────────────────────────────
  // Keep-alive tab cache obviates the need to pre-mount React trees, but we
  // still preload the JS modules for non-tab destinations on pointerdown so
  // their lazy chunks are parsed by the time the user lifts their finger.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: string; views?: string[] }>).detail;
      const hintedViews = (detail?.views?.length ? detail.views : detail?.view ? [detail.view] : [])
        .filter((view): view is ViewState => Boolean(view) && view !== currentViewRef.current)
        .filter((view, index, list) => list.indexOf(view) === index)
        .slice(0, 3);
      void preloadViewModulesSequential(hintedViews);
    };
    window.addEventListener('te:prefetch', handler);
    return () => window.removeEventListener('te:prefetch', handler);
  }, []);

  // Monotonic navigation token: finalize callbacks capture the token of the
  // navigation that scheduled them and no-op if a newer navigation started
  // since. Without this, the lock-free tab path's deferred finalize (the
  // T_KEEP_ALIVE_TAB timeout) could fire mid-View-Transition of a FOLLOWING
  // push and clear ITS lock — letting a third navigation slip into a busy
  // TransitionEngine and permanently desync the lock.
  const navTokenRef = useRef(0);

  // A tap that lands while a transition holds the lock must NOT be swallowed:
  // the engine path keeps the lock for the whole animation (240–360ms) while
  // the destination content is already visible, so rapid sequential taps
  // routinely arrive inside that window. We park the latest such request
  // (last tap wins) and replay it the moment the lock releases — otherwise
  // the tap is dropped with no retry and the shell stays on the old tab.
  const pendingNavigationRef = useRef<{ view: ViewState; options: NavigationOptions } | null>(null);
  const navigateToRef = useRef<(view: ViewState, options?: NavigationOptions) => void>(() => {});

  // Rapid hardware/edge back presses routinely arrive while a pop animation
  // still holds the transition lock (~300ms). Dropping them feels broken;
  // letting them fall through to minimize closed the whole app. Instead we
  // count the extra backs queued behind the lock and replay them one per
  // animation as it releases — each gesture pops exactly one level.
  const pendingBackRef = useRef(0);
  const performBackRef = useRef<() => void>(() => {});

  const drainPendingNavigation = useCallback(() => {
    const pending = pendingNavigationRef.current;
    if (!pending) return;
    pendingNavigationRef.current = null;
    if (pending.view === currentViewRef.current) return;
    navigateToRef.current(pending.view, pending.options);
  }, []);

  // Replay one queued back press, if any. Returns true when it started a
  // navigation (which re-arms the lock and will finalize → drain the next one),
  // so the caller knows a transition is in flight again.
  const drainPendingBack = useCallback((): boolean => {
    if (pendingBackRef.current <= 0) return false;
    if (historyStack.current.length === 0) {
      // Unwound to the root tab while backs were still queued — nothing left to
      // pop, so discard the surplus rather than bouncing off 'home'.
      pendingBackRef.current = 0;
      return false;
    }
    pendingBackRef.current -= 1;
    performBackRef.current();
    return true;
  }, []);

  const finalizeNavigation = useCallback((token: number) => {
    if (token !== navTokenRef.current) return;
    const metric = pendingNavigationMetricRef.current;
    if (metric) {
      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      DiagnosticsService.recordNavigation(metric.view, metric.direction, Math.round(finishedAt - metric.startedAt));
      pendingNavigationMetricRef.current = null;
    }
    transitionLockRef.current = false;
    // Queued back presses take priority over a parked forward tap: a user
    // spamming back wants to keep unwinding the stack one screen at a time.
    if (drainPendingBack()) return;
    drainPendingNavigation();
  }, [drainPendingBack, drainPendingNavigation]);

  useEffect(() => {
    mountedTabsRef.current = mountedTabs;
  }, [mountedTabs]);

  useEffect(() => {
    markTabMounted(currentView);
  }, [currentView, markTabMounted]);

  // ── Fast tab transition (CSS-only crossfade) ────────────────────────────
  // For tab-to-tab switches, we don't need View Transitions API or DOM
  // cloning — both views are already mounted side-by-side. We just toggle
  // CSS classes to crossfade between them. This is the path that gives the
  // app its native feel: no flushSync, no JS work, no main-thread block.
  const runTabTransition = useCallback((destination: ViewState, startedAt?: number) => {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const tabTransitionToken = tabTransitionTokenRef.current + 1;
    tabTransitionTokenRef.current = tabTransitionToken;
    if (root) root.dataset.tabTransitioning = '1';

    const navToken = ++navTokenRef.current;
    transitionLockRef.current = true;
    pendingNavigationMetricRef.current = {
      view: destination,
      direction: 'tab',
      startedAt: startedAt ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    };

    markTabMounted(destination);
    setCurrentView(destination);
    transitionLockRef.current = false;

    // Keep the metric window aligned with the CSS animation, but do not keep
    // tab navigation locked: the compositor animation can be interrupted and
    // restarted cleanly, and rapid taps should never feel swallowed.
    window.setTimeout(() => {
      finalizeNavigation(navToken);
      if (root && tabTransitionTokenRef.current === tabTransitionToken) {
        delete root.dataset.tabTransitioning;
      }
    }, T_KEEP_ALIVE_TAB);
  }, [finalizeNavigation, markTabMounted]);

  const runNavigation = useCallback((destination: ViewState, dir: TransitionDirection, startedAt?: number) => {
    pendingScrollRestore.current = {
      view: destination,
      y: scrollPositions.current[destination] ?? 0,
    };

    // Fast path: tab-to-tab between already-cached views.
    if (dir === 'tab' && mountedTabsRef.current.has(destination) && ROOT_TABS.includes(currentViewRef.current)) {
      runTabTransition(destination, startedAt);
      return;
    }

    const navToken = ++navTokenRef.current;
    transitionLockRef.current = true;
    pendingNavigationMetricRef.current = {
      view: destination,
      direction: dir,
      startedAt: startedAt ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    };

    const accepted = TransitionEngine.navigate(
      dir as EngineDirection,
      () => {
        flushSync(() => {
          markTabMounted(destination);
          setCurrentView(destination);
        });
      },
      () => {
        requestAnimationFrame(() => finalizeNavigation(navToken));
      },
    );
    if (!accepted) {
      // Engine refused (already mid-animation): commit without animation
      // rather than leaving the lock held forever waiting for a completion
      // callback that will never fire.
      flushSync(() => {
        markTabMounted(destination);
        setCurrentView(destination);
      });
      finalizeNavigation(navToken);
    }
  }, [finalizeNavigation, markTabMounted, runTabTransition]);

  const navigateTo = useCallback((view: ViewState, options: NavigationOptions = {}) => {
    const prev = currentViewRef.current;
    if (prev === view) {
      // Tapping the tab we're on (or already transitioning to) means "stay
      // here" — it also cancels any switch parked behind the lock.
      pendingNavigationRef.current = null;
      return;
    }
    // A fresh forward intent supersedes any back presses queued behind the
    // lock — stop unwinding the stack once the user has chosen a destination.
    pendingBackRef.current = 0;
    if (transitionLockRef.current) {
      pendingNavigationRef.current = { view, options };
      return;
    }
    pendingNavigationRef.current = null;

    // ── Resolve direction before the transition snapshot ─────────────────────
    let dir: TransitionDirection = 'tab';
    if (view === 'add-memory') dir = 'modal';
    // Any exit from the composer sheet is a dismissal — slide it back down
    // (iOS sheet), never a forward push.
    else if (prev === 'add-memory') dir = 'modal-close';
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
      flushSync(() => {
        markTabMounted(view);
        setCurrentView(view);
      });
      transitionLockRef.current = false;
      return;
    }

    if (!isViewModuleLoaded(view)) {
      transitionLockRef.current = true;
      void preloadViewModule(view)
        .then(() => {
          requestAnimationFrame(() => {
            transitionLockRef.current = false;
            // A back gesture pressed while the chunk loaded wins over the
            // forward intent: honour it (cancelling this navigation) instead
            // of committing a destination the user is trying to leave. This
            // also keeps pendingBackRef from stranding on this lock, which
            // never reaches finalizeNavigation.
            if (drainPendingBack()) return;
            if (pendingNavigationRef.current) {
              // A newer tap arrived while the chunk loaded — honour it
              // instead of committing this stale destination first.
              drainPendingNavigation();
              return;
            }
            commitNavigation();
          });
        })
        .catch((error) => {
          // Chunk failed (redeploy rotated hashes / offline). STAY on the
          // current view: committing would mount a rejected lazy and feed
          // the error to an ErrorBoundary. The registry never caches
          // rejections, so the next tap retries cleanly.
          DiagnosticsService.recordError('navigation.preload', error, { view });
          transitionLockRef.current = false;
          toast.show("Couldn't open that screen — check your connection", 'error');
          // Replay a back queued during the failed load rather than leaving it
          // stranded on a lock that will never finalize.
          if (drainPendingBack()) return;
          drainPendingNavigation();
        });
      return;
    }

    commitNavigation();
  }, [drainPendingBack, drainPendingNavigation, getCurrentScroll, runNavigation]);

  useEffect(() => {
    navigateToRef.current = navigateTo;
  }, [navigateTo]);

  // Pop one level off the in-app history and animate back to it. Shared by the
  // UI back control, the hardware back button, and the queued-back replay.
  const performBack = useCallback(() => {
    const prev        = currentViewRef.current;
    const destination = historyStack.current.pop() ?? 'home';

    scrollPositions.current[prev] = getCurrentScroll();
    currentViewRef.current        = destination;
    // Leaving the composer sheet slides DOWN (iOS sheet dismissal) while the
    // screen beneath settles back — not a sideways pop.
    runNavigation(destination, prev === 'add-memory' ? 'modal-close' : 'pop');
  }, [getCurrentScroll, runNavigation]);

  useEffect(() => {
    performBackRef.current = performBack;
  }, [performBack]);

  const goBack = useCallback(() => {
    if (transitionLockRef.current) {
      // Mid-animation: queue the press (capped at the history depth) so it is
      // replayed when the lock releases instead of being dropped — same
      // behaviour as the hardware back button.
      if (historyStack.current.length > pendingBackRef.current) {
        pendingBackRef.current += 1;
      }
      return;
    }
    performBack();
  }, [performBack]);

  const canGoBack = historyStack.current.length > 0;
  const navigationActionsValue = useMemo(() => ({
    navigateTo,
    goBack,
    canGoBack,
  }), [navigateTo, goBack, canGoBack]);
  const navigationValue = useMemo(() => ({
    ...navigationActionsValue,
    currentView,
  }), [navigationActionsValue, currentView]);

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
    DiagnosticsService.setRemoteSink(remoteErrorSink);
    DiagnosticsService.start();
    FrameHealthService.start();
  }, []);

  useEffect(() => {
    if (isInitialized && launchReady) {
      setShowLaunchOverlay(false);
    }
  }, [isInitialized, launchReady]);

  useEffect(() => {
    if (!isInitialized || showOnboarding || (!e2eMode && !isAuthenticated)) return;
    if (typeof window === 'undefined') return;

    const cancelers: Array<() => void> = [];

    const scheduleIdlePreload = (views: ViewState[], timeout: number, delay: number) => {
      cancelers.push(scheduleIdleTask(() => {
        void preloadViewModulesSequential(views);
      }, { timeout, delay }));
    };

    scheduleIdlePreload(CORE_NAV_PRELOADS, 1600, 700);
    scheduleIdlePreload(SECONDARY_NAV_PRELOADS, 3200, 3600);

    return () => {
      cancelers.forEach((cancel) => cancel());
    };
  }, [e2eMode, isAuthenticated, isInitialized, showOnboarding]);

  // ── Persist the active root tab for cold-launch restoration ─────────────
  useEffect(() => {
    if (e2eMode || !ROOT_TABS.includes(currentView)) return;
    try {
      window.localStorage.setItem(LAST_TAB_KEY, currentView);
    } catch {
      // Storage quota/private-mode failures must never break navigation.
    }
  }, [currentView, e2eMode]);

  // ── Native entry points: launcher shortcuts + system share target ───────
  useEffect(() => {
    if (!isInitialized || showOnboarding || (!e2eMode && !isAuthenticated)) return;
    if (!Capacitor.isNativePlatform()) return;

    const routeUrl = (url: string) => {
      const match = url.match(/^com\.lior\.app:\/\/shortcut\/([\w-]+)/);
      const view = match ? SHORTCUT_VIEWS[match[1]] : undefined;
      if (view) navigateTo(view);
    };

    // Photos shared into Lior land in Add Memory with the image staged.
    const stopShareTarget = ShareTargetService.start(() => navigateTo('add-memory'));

    let disposed = false;
    let urlListener: { remove: () => Promise<void> } | null = null;
    let stopNotificationTaps: (() => void) | null = null;
    void (async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');
        // Cold start from a shortcut: the URL arrives as the launch URL,
        // before any listener could have been attached.
        const launch = await CapacitorApp.getLaunchUrl();
        if (!disposed && launch?.url) routeUrl(launch.url);
        const handle = await CapacitorApp.addListener('appUrlOpen', (event) => routeUrl(event.url));
        if (disposed) void handle.remove();
        else urlListener = handle;
      } catch (error: unknown) {
        DiagnosticsService.recordError('shortcuts.url_listener', error);
      }
    })();

    // Tapping a reminder or partner push lands on the relevant screen
    // instead of wherever the app last was.
    void (async () => {
      try {
        const stop = await NotificationsService.bindTapRouting((view) => {
          if (NOTIFICATION_VIEWS.has(view as ViewState)) navigateTo(view as ViewState);
        });
        if (disposed) stop();
        else stopNotificationTaps = stop;
      } catch (error: unknown) {
        DiagnosticsService.recordError('notifications.tap_routing', error);
      }
    })();

    return () => {
      disposed = true;
      stopShareTarget();
      stopNotificationTaps?.();
      void urlListener?.remove();
    };
  }, [e2eMode, isAuthenticated, isInitialized, showOnboarding, navigateTo]);

  useEffect(() => {
    if (!isInitialized || showOnboarding || (!e2eMode && !isAuthenticated)) return;
    return scheduleIdleTask(() => {
      void NotificationsService.applySchedule().catch((error) => {
        DiagnosticsService.recordError('notifications.schedule', error);
      });
      // Register this device for push so partner nudges can be delivered.
      void NotificationsService.registerPushToken().catch((error) => {
        DiagnosticsService.recordError('notifications.push_register', error);
      });
    }, { timeout: 3200, delay: 1200 });
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

    // Onboarding gate: trust the SERVER as source of truth, with the device-local
    // flag as a fast path. This is what stops a reinstall / new device / relogin
    // from re-triggering onboarding when the couple has already onboarded — the
    // local profile is empty on a fresh device until sync rehydrates, but
    // relationship_facts.onboarding_done (via get_my_relationship) already knows.
    const resolveOnboarded = async (): Promise<boolean> => {
      if (hasCompletedOnboarding()) return true;
      try {
        const rel = await SupabaseService.getMyRelationship();
        if (rel?.onboardingDone) {
          StorageService.markOnboardingComplete();
          return true;
        }
      } catch {
        // Server truth unavailable (offline / pre-migration) — fall back to local gate.
      }
      return false;
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
                  const onboarded = await resolveOnboarded();
                  if (!disposed) {
                    setShowOnboarding(!onboarded);
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
              hasOnboardedAfterBootstrap = await resolveOnboarded();
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
          hasOnboardedAfterBootstrap = false;
          if (!disposed) {
            setIsAuthenticated(false);
            setShowOnboarding(false);
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

        // A pop animation still owns the screen (~300ms). A second back gesture
        // landing inside that window must NOT fall through to minimize — that
        // is the bug that closed the whole app on rapid back presses. Queue it
        // (capped at the remaining history) to replay when the lock releases,
        // and swallow the event either way so the app is never backgrounded
        // mid-transition.
        if (transitionLockRef.current) {
          if (historyStack.current.length > pendingBackRef.current) {
            pendingBackRef.current += 1;
          }
          return true;
        }

        if (historyStack.current.length > 0) {
          // Shared sheet-aware pop (modal-close for the composer, else 'pop').
          performBackRef.current();
          return true;
        }

        // Already at root and idle — minimize the app (Android pattern).
        NativeShellService.minimizeApp();
        return true;
      },
    });

    // On resume (app foregrounded) and on network recovery, ask SyncService to
    // RECONNECT — not just reconcile. The realtime socket dies silently while
    // backgrounded, and the old `&& SyncService.isConnected` guard made these a
    // no-op precisely when the socket was dead (isConnected never flipped false).
    // resume() rebuilds the subscription if needed, then reconciles + flushes
    // the offline outbox. This is what keeps the app feeling live after reopen.
    removeResumeListener = NativeShellService.onResume(() => {
      const shell = NativeShellService.getState();
      if (shell.isOnline) {
        void SyncService.resume();
      }
    });
    removeShellListener = NativeShellService.subscribe((shell) => {
      if (!wasOnline && shell.isOnline) {
        void SyncService.resume();
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
    // Profile + lior_onboarded flag are saved inside the Onboarding component.
    // Also record completion on the SERVER so a future reinstall / new device
    // never re-triggers onboarding (fire-and-forget; safe no-op pre-migration).
    void SupabaseService.markOnboardingComplete();
    setShowOnboarding(false);
    // Schedule the coachmark tour for brand-new users
    setScheduleTour(true);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // ── Keep-alive tab tree ─────────────────────────────────────────────────
  // Render every visited ROOT_TAB inside its own keep-alive shell. Only the
  // active one is visible; cached tabs sit off-flow and invisible so returning
  // to a heavy page does not pay the cold display:none layout cost again.
  // Non-tab views render in a separate overlay slot below.
  const visibleMountedTabs = useMemo(() => {
    const next = new Set(mountedTabs);
    if (ROOT_TABS.includes(currentView)) next.add(currentView);
    return Array.from(next);
  }, [currentView, mountedTabs]);

  const keepAliveTabs = useMemo(() => {
    return visibleMountedTabs.map((tab) => (
      <KeepAliveTabShell
        key={tab}
        tab={tab}
        isActive={tab === currentView}
        setView={navigateTo}
      />
    ));
  }, [visibleMountedTabs, currentView, navigateTo]);

  // Non-tab view (push/pop destinations like sync, settings, etc.)
  // Mounts/unmounts normally — these are not on the hot path.
  const overlayView = useMemo(() => {
    if (ROOT_TABS.includes(currentView)) return null;
    const ActiveView = getViewComponent(currentView);
    return <ActiveView setView={navigateTo} />;
  }, [currentView, navigateTo]);

  // Global Loading State
  if (!isInitialized) {
    return <RouteLoader />;
  }

  // Cloud Authentication Check
  if (!e2eMode && !isAuthenticated) {
    const AuthOverlayView = currentView === 'privacy-policy'
      ? getViewComponent('privacy-policy')
      : getViewComponent('terms-of-service');

    // currentViewRef must stay in lockstep with currentView even on these
    // direct setCurrentView paths — navigateTo's prev===view guard reads the
    // ref, and a divergence here (e.g. signing in while the policy overlay
    // is open) made the Home tab a dead no-op after login.
    const showAuthOverlay = (view: ViewState) => {
      currentViewRef.current = view;
      setCurrentView(view);
    };

    return (
      <ErrorBoundary>
        <Auth
          onLogin={handleLoginSuccess}
          onPrivacyPolicy={() => showAuthOverlay('privacy-policy')}
          onTerms={() => showAuthOverlay('terms-of-service')}
        />
        {(currentView === 'privacy-policy' || currentView === 'terms-of-service') && (
          <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--theme-bg-main)' }}>
            <Suspense fallback={<RouteLoader />}>
              <AuthOverlayView setView={navigateTo} onBack={() => showAuthOverlay('home')} />
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
      <NavigationActionsContext.Provider value={navigationActionsValue}>
        <NavigationContext.Provider value={navigationValue}>
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
                        {overlayView}
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
                  <Suspense fallback={null}>
                    <WhatsNew onClose={() => {
                      setShowWhatsNew(false);
                      setScheduleTour(true);
                    }} />
                  </Suspense>
                )}
              </AnimatePresence>
              <CoachmarkTourScheduler
                shouldTrigger={scheduleTour}
                onTriggered={() => setScheduleTour(false)}
              />
            </ErrorBoundary>
          </CoachmarkProvider>
        </NavigationContext.Provider>
      </NavigationActionsContext.Provider>
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
              DiagnosticsService.recordInfo('media-debug', 'No memories found');
              return;
            }
            mems.slice(0, 3).forEach((m: any, i: number) => {
              DiagnosticsService.recordInfo('media-debug', `Memory ${i} (${m.id})`, {
                imageId: m.imageId || null,
                storagePath: m.storagePath || null,
                hasInlineImage: !!(m.image && m.image.length > 0),
                inlineImageLen: m.image ? m.image.length : 0,
                videoId: m.videoId || null,
                videoStoragePath: m.videoStoragePath || null,
                hasInlineVideo: !!(m.video && m.video.length > 0),
              });
            });
            DiagnosticsService.recordInfo('media-debug', `Total memories: ${mems.length}`);
          },
        },
        {
          label: '🔄 Recover images from cloud',
          action: async () => {
            DiagnosticsService.recordInfo('media-debug', 'Starting cloud image recovery');
            try {
              await StorageService.recoverImagesFromCloud();
              DiagnosticsService.recordInfo('media-debug', 'Recovery complete');
            } catch (e) {
              DiagnosticsService.recordError('media-debug', e);
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
            DiagnosticsService.recordInfo('admin', `Internal admin override ${next ? 'enabled' : 'disabled'}`);
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
               icon: '/notification-icon.png',
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

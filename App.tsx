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
import { Analytics } from './services/analytics';
import { initObservability } from './services/observability';
import { FrameHealthService } from './services/frameHealth';
import { NotificationsService } from './services/notifications';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'; // Added for AuraSignalReceiver
import { AppLaunchOverlay } from './components/AppLaunchOverlay';
import { DevPanel } from './components/DevPanel';
import { CoachmarkProvider, useCoachmark } from './components/CoachmarkSystem';
import { FeatureDiscovery } from './services/featureDiscovery';
import { scheduleIdleTask } from './utils/scheduler';
import { toast } from './utils/toast';
import { ALL_VIEW_IDS, getViewComponent, isViewModuleLoaded, preloadViewModule, preloadViewModulesSequential } from './views/viewRegistry';
import { bootstrapE2ELocalState, getE2EInitialView, isE2EAppMode } from './services/e2eHarness';
import { ShareTargetService } from './services/shareTarget';
import { PairingService } from './services/pairing';
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

// ── Pair-invite deep links ─────────────────────────────────────────────────
// A tappable invite delivers the 8-char pairing code via:
//   • native  →  com.lior.app://claim?code=XXXX
//   • web     →  https://<origin>/claim?code=XXXX  (or ?invite=XXXX)
// We must NOT confuse this with the OAuth PKCE redirect, which also carries a
// `code` param. They are disambiguated as follows:
//   • The OAuth callback path is `auth/callback` (native) / carries a `state`
//     param (web) — an invite link never has `state`.
//   • A bare ?code= is only treated as an invite when there is no `state`,
//     it is not on the auth/callback path, AND it normalises to a valid
//     8-char alphanumeric code. OAuth codes are long and contain separators.
// Returns the normalised 8-char code, or null when the URL is not an invite.
const INVITE_CODE_RE = /^[A-Z0-9]{8}$/;
const normalizeInviteCode = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const code = raw.replace(/^LIOR:/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  return INVITE_CODE_RE.test(code) ? code : null;
};

const parseInviteCodeFromUrl = (rawUrl: string): string | null => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const path = `${url.host}${url.pathname}`.toLowerCase();
  // The OAuth callback is never an invite, even though it carries ?code=.
  if (path.includes('auth/callback')) return null;

  const params = url.searchParams;
  // A password-recovery link also carries ?code= — never treat it as an invite.
  if (params.get('type') === 'recovery') return null;
  // Explicit invite param always wins (?invite=XXXX), regardless of path.
  const explicit = normalizeInviteCode(params.get('invite'));
  if (explicit) return explicit;

  const isClaimPath = path.includes('claim');
  const hasOAuthState = params.has('state');
  const codeParam = params.get('code');

  // A `code` param is an invite when it's on a /claim path, OR when there's
  // no OAuth `state` alongside it (PKCE always includes `state`) and it
  // shapes up as a valid 8-char pairing code.
  if (codeParam && (isClaimPath || !hasOAuthState)) {
    return normalizeInviteCode(codeParam);
  }
  return null;
};

// Views a notification tap may navigate to. Payload values outside this
// list (malformed pushes, future kinds) fall back to doing nothing.
const NOTIFICATION_VIEWS = new Set<ViewState>([
  'home', 'us', 'timeline', 'daily-moments', 'profile', 'add-memory',
  'weekly-recap', 'daily-video', 'open-when', 'surprises', 'time-capsule',
  'voice-notes', 'daily-drop',
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

// Everything the user can reach — just the whole registry, warmed last at the
// lowest priority. Re-listing the views already warmed by the core/secondary
// batches is a no-op (preload() caches its promise), and preloadViewModulesSequential
// dedupes, yields to main between each, and drops HEAVY_PREFETCH_VIEWS on low-end
// devices — so this stays off the critical path while guaranteeing every tile's
// chunk is parsed before it's tapped (no cold-fetch pause, no blank-3D flash).
const TERTIARY_NAV_PRELOADS: ViewState[] = ALL_VIEW_IDS;

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

  // ── Deferred overlay unmount (smooth back) ──────────────────────────────
  // Non-tab detail views live in the __overlay__ slot. Unmounting a heavy detail
  // view (its effect teardown + DOM removal) INSIDE the synchronous flushSync
  // commit blocked the back animation: the main thread froze for the whole
  // transition (no frames painted), then the destination "snapped" in — the same
  // on the back button and the edge-swipe because both commit the same way.
  // So the overlay slot is decoupled from currentView. Opening a detail mounts it
  // at once (it must paint in step with the transition); returning to a tab keeps
  // the outgoing detail mounted-but-hidden (is-cached) through the animation and
  // drops it a beat later, off the hot path. currentView / the lock / history are
  // never touched here, so navigation correctness is unaffected — this only moves
  // the overlay's UNMOUNT off the synchronous commit.
  const [overlaySlotView, setOverlaySlotView] = useState<ViewState | null>(
    () => (ROOT_TABS.includes(initialView) ? null : initialView),
  );
  const overlayPruneTimerRef = useRef<number | null>(null);
  const commitView = useCallback((destination: ViewState) => {
    markTabMounted(destination);
    setCurrentView(destination);
    if (overlayPruneTimerRef.current !== null) {
      window.clearTimeout(overlayPruneTimerRef.current);
      overlayPruneTimerRef.current = null;
    }
    if (!ROOT_TABS.includes(destination)) {
      // Opening / moving to a detail view — mount it now so it paints in step.
      setOverlaySlotView(destination);
    } else {
      // Returning to a tab — keep the outgoing detail mounted (hidden via the
      // is-cached class) through the animation, then unmount once it settles, so
      // its teardown never blocks the transition frames.
      overlayPruneTimerRef.current = window.setTimeout(() => {
        overlayPruneTimerRef.current = null;
        // Skip if a newer nav has since re-opened a detail.
        if (ROOT_TABS.includes(currentViewRef.current)) setOverlaySlotView(null);
      }, T_KEEP_ALIVE_TAB + 160);
    }
  }, [markTabMounted]);
  useEffect(() => () => {
    if (overlayPruneTimerRef.current !== null) window.clearTimeout(overlayPruneTimerRef.current);
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
      // Restore the destination's saved scroll on swipe-back too. The button /
      // hardware-back path does this via runNavigation; the gesture path commits
      // state directly, so without this the shared scroller stayed at the
      // outgoing view's offset and swiping back landed at the wrong position.
      pendingScrollRestore.current = {
        view: destination,
        y: scrollPositions.current[destination] ?? 0,
      };
      flushSync(() => {
        commitView(destination);
      });
    };
    window.addEventListener('te:gesture-back', handler);
    return () => window.removeEventListener('te:gesture-back', handler);
  }, [getCurrentScroll, commitView]);

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

  // Expose the active route on <html data-route> so the persistent ambient layer
  // can keep the 3D blob always-on for Home (and follow the user's toggle
  // elsewhere) without prop-drilling through Layout's memo.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.route = currentView;
    }
  }, [currentView]);

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
          commitView(destination);
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
        commitView(destination);
      });
      finalizeNavigation(navToken);
    }
  }, [finalizeNavigation, commitView, runTabTransition]);

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
    // Returning from a pushed detail/sub-screen to a root tab is a CLOSE, not a
    // forward push — animate it as a pop (the detail slides off to the right to
    // reveal the tab beneath). This makes back/close affordances that call
    // setView('home') instead of goBack() still read as "going back" rather
    // than a wrong-way slam-in from the right. Opening (root -> detail) stays push.
    else if (ROOT_TABS.includes(view) && !ROOT_TABS.includes(prev)) dir = 'pop';
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
        commitView(view);
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
  }, [drainPendingBack, drainPendingNavigation, getCurrentScroll, runNavigation, commitView]);

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
    // Telemetry (all no-op unless the relevant env keys are set): crash
    // monitoring (Sentry) + product analytics (PostHog + first-party app_events).
    initObservability();
    Analytics.init();
    Analytics.track('app_open', { reason: 'launch' });
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
    // Warm the long tail last + at the lowest priority so every tile a user can
    // reach is parsed before they get to it — no cold-fetch pause, no blank gap.
    scheduleIdlePreload(TERTIARY_NAV_PRELOADS, 6000, 6500);

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

  // ── Pair-invite deep link: route the receiver into the claim flow ───────
  // When an authenticated user has a pending invite code (captured from a
  // tappable link below, possibly before they signed in), send them to the
  // Sync/Pairing hub which auto-claims it. Onboarding is forced off so a
  // solo-but-unpaired receiver can claim immediately instead of being parked
  // on the welcome screen. Sync clears the code after a successful claim.
  const consumePendingInvite = useCallback(() => {
    if (StorageService.getPendingInviteCode() == null) return;
    setShowOnboarding(false);
    navigateTo('sync');
  }, [navigateTo]);

  // ── Capture an invite code from the launch URL / appUrlOpen ─────────────
  // Always-on (independent of auth) so a logged-out receiver's code survives
  // the sign-up/sign-in round trip. The pending code is consumed once a
  // session exists (here when already authed, or via consumePendingInvite
  // fired from the auth listener after the next SIGNED_IN).
  useEffect(() => {
    if (e2eMode || typeof window === 'undefined') return;

    const captureFromUrl = (rawUrl: string): boolean => {
      const code = parseInviteCodeFromUrl(rawUrl);
      if (!code) return false;
      StorageService.setPendingInviteCode(code);
      return true;
    };

    // 1. Web: the code may already be in the page URL on load. Capture it and
    //    strip it from the address bar so a refresh / share doesn't re-trigger.
    let capturedFromPageUrl = false;
    try {
      capturedFromPageUrl = captureFromUrl(window.location.href);
      if (capturedFromPageUrl) {
        const cleaned = new URL(window.location.href);
        ['code', 'invite', 'state'].forEach((k) => cleaned.searchParams.delete(k));
        const cleanedPath = cleaned.pathname.replace(/\/claim\/?$/i, '/') || '/';
        window.history.replaceState({}, document.title, cleanedPath + cleaned.search);
      }
    } catch {
      // Non-critical — fall through to the native path.
    }

    // 2. If already signed in, route into the claim flow right away.
    if ((capturedFromPageUrl || StorageService.getPendingInviteCode() != null)
        && isAuthenticated && isInitialized) {
      consumePendingInvite();
    }

    // 3. Native: cold-start launch URL + live appUrlOpen events.
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let urlListener: { remove: () => Promise<void> } | null = null;
    void (async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');
        const launch = await CapacitorApp.getLaunchUrl();
        if (!disposed && launch?.url && captureFromUrl(launch.url) && isAuthenticated && isInitialized) {
          consumePendingInvite();
        }
        const handle = await CapacitorApp.addListener('appUrlOpen', (event) => {
          if (captureFromUrl(event.url) && isAuthenticated && isInitialized) {
            consumePendingInvite();
          }
        });
        if (disposed) void handle.remove();
        else urlListener = handle;
      } catch (error: unknown) {
        DiagnosticsService.recordError('pairing.invite_link', error);
      }
    })();

    return () => {
      disposed = true;
      void urlListener?.remove();
    };
  }, [consumePendingInvite, e2eMode, isAuthenticated, isInitialized]);

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
      // NON-prompting at startup (the default): both calls only schedule /
      // register when permission is ALREADY granted, never firing a cold OS
      // prompt. The ask now happens at the highest-consent moment — the first
      // mutual reveal (DailyQuestion → PrimingModal), which passes prompt:true.
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

        // Boot apply is instant — no 600ms crossfade on the loader. index.tsx
        // already seeded the saved theme before first paint, so a cross-fade here
        // would only be rose→same-theme noise.
        ThemeService.applyTheme(themeToApply, { instant: true });

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
              // Non-tab views render in the overlay slot; without this the
              // e2e `?view=` deep-link mounts nothing (blank main).
              if (!ROOT_TABS.includes(initialView)) setOverlaySlotView(initialView);
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
            const { data: { subscription } } = SupabaseService.client!.auth.onAuthStateChange((event, session) => {
              void (async () => {
                if (disposed) return;
                SupabaseService.setCachedUserId(session?.user?.id || null);
                StorageService.activateAccount(session?.user?.id || null);
                setIsAuthenticated(Boolean(session));

                if (session) {
                  await initializeSync();
                  // Only (re)evaluate the onboarding gate on a GENUINE sign-in.
                  // onAuthStateChange also fires for TOKEN_REFRESHED / USER_UPDATED
                  // (routinely, on resume and on the periodic token refresh) — and
                  // resolveOnboarded() can transiently return false when the server
                  // is briefly unreachable, which would flash the full-screen
                  // Onboarding over a live, already-onboarded session. The cold-init
                  // path below owns the first gate; the listener must not re-gate an
                  // established session.
                  if (event === 'SIGNED_IN') {
                    const onboarded = await resolveOnboarded();
                    if (!disposed) {
                      // A pending invite (captured from a deep link before sign-in)
                      // takes priority: route straight into the claim flow even if
                      // the receiver hasn't "onboarded" yet, so a solo-but-unpaired
                      // account can link immediately. Sync clears the code on success.
                      if (StorageService.getPendingInviteCode() != null) {
                        setShowOnboarding(false);
                        navigateToRef.current('sync');
                      } else {
                        setShowOnboarding(!onboarded);
                      }
                    }
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
                // Cold start while authenticated with a pending invite (e.g. a
                // logged-in user tapped a web /claim link): route into the claim
                // flow regardless of onboarding state.
                if (StorageService.getPendingInviteCode() != null) {
                  setShowOnboarding(false);
                  navigateToRef.current('sync');
                } else {
                  setShowOnboarding(!hasOnboardedAfterBootstrap);
                }
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
      Analytics.track('app_open', { reason: 'resume' });
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

  // "Invite your partner" path: the Onboarding component has already finalized
  // (profile + lior_onboarded persisted locally) BEFORE this fires, so we run
  // the same server-side completion as the skip path and then route straight
  // into the pairing hub. Onboarding is guaranteed authenticated at this point
  // (showOnboarding only flips true inside an authed session), so Sync's
  // PairingService can create an invite immediately.
  const handleOnboardingPairNow = (me: string, partner: string) => {
    handleOnboardingSelect(me, partner);
    navigateTo('sync');
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
    if (overlaySlotView === null) return null;
    const ActiveView = getViewComponent(overlaySlotView);
    return <ActiveView setView={navigateTo} />;
  }, [overlaySlotView, navigateTo]);
  // The overlay is visible (is-active) only while its view IS the current view.
  // After a back to a tab it lingers one beat as is-cached (hidden, off-flow) so
  // its unmount can happen off the transition's critical path — see commitView.
  const overlayLingering = overlayView !== null && ROOT_TABS.includes(currentView);

  // Dev-only standalone preview of the onboarding flow. Open the app with
  // ?onboarding=1 to view it in isolation — bypasses init + the cloud-auth gate,
  // so it works even when Supabase isn't configured in this checkout. Reloads to
  // a clean URL on finish/exit. Inert in production builds.
  if (import.meta.env.DEV && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('onboarding') === '1') {
    const exitOnboardingPreview = () => { window.location.href = window.location.pathname; };
    return (
      <ErrorBoundary>
        <Onboarding onComplete={exitOnboardingPreview} onPairNow={exitOnboardingPreview} />
      </ErrorBoundary>
    );
  }

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
    return <Onboarding onComplete={handleOnboardingSelect} onPairNow={handleOnboardingPairNow} />;
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
                      <div
                        className={`keep-alive-shell ${overlayLingering ? 'is-cached' : 'is-active'}`}
                        data-keep-alive-tab="__overlay__"
                        aria-hidden={overlayLingering ? true : undefined}
                        inert={overlayLingering ? true : undefined}
                      >
                        {/* Own Suspense boundary. Without it, a pushed view that
                            suspends during commit (the gesture-back / instant paths
                            flushSync without the preload gate) bubbled to the
                            app-level <Suspense fallback={RouteFallback}> above and
                            blanked EVERY keep-alive tab for a frame — the "whole
                            elements disappear and reappear" flash. */}
                        <Suspense fallback={null}>{overlayView}</Suspense>
                      </div>
                    )}
                  </ViewTransition>
                </Suspense>
              </Layout>
              <AuraSignalReceiver setView={navigateTo} />
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
        // The "admin override" DevPanel action was removed: it called
        // InternalAdminService.isOverrideEnabled()/setOverride(), which were
        // deliberately deleted from the service (client-side override was a
        // security bypass — see services/internalAdmin.ts). The stale calls
        // white-screened the dev build via `undefined is not a function`.
      ]} />}
    </>
  );
};

const AuraSignalReceiver = ({ setView }: { setView: (view: ViewState) => void }) => {
  const reduce = useReducedMotion() ?? false;
  const [incoming, setIncoming] = useState<{ id?: string, color: string, title: string, subtitle?: string, message: string, afterglow?: string } | null>(null);
  // Auras already shown (or dismissed) this session, keyed by the id now threaded
  // end-to-end across BOTH delivery paths (realtime broadcast + the offline-inbox
  // twin synced via couple_profile). One id ⇒ the same logical aura can never
  // double-pop, and dismiss() can purge the persisted twin.
  const shownIds = useRef<Set<string>>(new Set());
  const dismissTimerRef = useRef<number | null>(null);
  const dismissBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  // Clearing the overlay also removes any matching persisted inbox entry so it
  // can't re-surface. Functional setState reads the live overlay without a stale
  // `incoming` capture, keeping the callback stable.
  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) { window.clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null; }
    setIncoming((current) => {
      if (current?.id) StorageService.removeMissedAura(current.id);
      return null;
    });
  }, []);

  // Auto-dismiss timer — longer than the old 6s so the message + afterglow can
  // actually be read. Re-armed per aura; cleared on dismiss/unmount.
  const armAutoDismiss = useCallback(() => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(() => dismiss(), 9000);
  }, [dismiss]);

  // "Send one back" — close the overlay and open Pulse so the loop is reciprocal.
  const sendOneBack = useCallback(() => {
    dismiss();
    setView('aura-signal');
  }, [dismiss, setView]);

  // Check the offline inbox on mount + storage updates.
  useEffect(() => {
    const checkInbox = () => {
      const profile = StorageService.getCoupleProfile();
      if (!profile?.missedAuras || profile.missedAuras.length === 0) return;
      const myId = StorageService.getMyUserId();
      // Signals addressed to ME — by stable user id, with a name fallback for
      // legacy/in-flight entries — not already shown/dismissed this session.
      const myMissed = profile.missedAuras.filter(
        (a: any) => (a.target === myId || a.target === profile.myName) && !shownIds.current.has(a.id),
      );
      if (myMissed.length === 0) return;
      // Oldest first (array preserves send order) so earlier missed feelings are
      // not stranded. Don't clobber one already on screen — the
      // storage-update→checkInbox loop advances the queue as each is dismissed.
      setIncoming((current) => {
        if (current) return current;
        const next = myMissed[0];
        shownIds.current.add(next.id);
        armAutoDismiss();
        return { ...next.payload, id: next.id };
      });
    };
    checkInbox();
    storageEventTarget.addEventListener('storage-update', checkInbox);
    return () => storageEventTarget.removeEventListener('storage-update', checkInbox);
  }, [armAutoDismiss]);

  // Handle realtime incoming signals.
  useEffect(() => {
    const handleSignal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.signalType !== 'AURA_SIGNAL' || !detail.payload) return;
      const p = detail.payload;
      // Ignore our own echo (only matters if broadcast self-delivery is enabled).
      const myId = StorageService.getMyUserId();
      if (p.from && myId && p.from === myId) return;
      // Dedupe across the realtime + inbox paths via the shared id.
      if (p.id) {
        if (shownIds.current.has(p.id)) return;
        shownIds.current.add(p.id);
      }
      setIncoming(p);
      Haptics.doubleBeat();
      Audio.play('heartbeat');
      armAutoDismiss();
      // OS notification when backgrounded — routed through NotificationsService so
      // native (Capacitor LocalNotifications) and web both work; the raw web
      // Notification API was a no-op inside the native WebView.
      if (document.hidden) {
        const body = p.message ? `${p.title} — ${p.message}` : p.title;
        void NotificationsService.fireImmediate('Lior — New Pulse', body, 'aura');
      }
    };
    syncEventTarget.addEventListener('signal-received', handleSignal);
    return () => {
      syncEventTarget.removeEventListener('signal-received', handleSignal);
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    };
  }, [armAutoDismiss]);

  // Modal a11y: Escape to close, move focus into the dialog on open, restore it
  // on close. (A lightweight pattern — no full focus-trap, which would fight the
  // AnimatePresence/auto-dismiss lifecycle.)
  useEffect(() => {
    if (!incoming) return;
    prevFocusRef.current = document.activeElement;
    const focusId = window.setTimeout(() => dismissBtnRef.current?.focus(), 60);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusId);
      window.removeEventListener('keydown', onKey);
      const prev = prevFocusRef.current as HTMLElement | null;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [incoming, dismiss]);

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          key={incoming.id ?? incoming.title}
          role="alertdialog"
          aria-modal="true"
          aria-label={`A Pulse from your partner: ${incoming.title}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          onClick={dismiss}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-8"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}
        >
          {/* Incoming aura glow — normal blend over the near-black scrim (NOT
              mix-blend-screen, which forced a per-frame backdrop re-read = the
              GPU flicker class already fixed on the sender). Static under reduced
              motion. backdrop-blur dropped: the solid 0.88 scrim already hides the
              page, so the blur was pure GPU cost. */}
          <motion.div
            aria-hidden
            animate={reduce ? { opacity: 0.6 } : { scale: [1, 1.18, 1], opacity: [0.55, 0.8, 0.55] }}
            transition={reduce ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 z-0 blur-[100px] pointer-events-none"
            style={{ backgroundColor: incoming.color, opacity: 0.6 }}
          />

          <motion.div
            initial={{ y: 50, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -50, scale: 0.9 }}
            transition={reduce ? { duration: 0.2 } : { type: 'spring', damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 flex flex-col items-center text-center max-w-sm"
          >
            <div
              className="w-24 h-24 rounded-full mb-8 shadow-2xl"
              style={{ backgroundColor: incoming.color, boxShadow: `0 0 80px ${incoming.color}` }}
            />
            <h2 className="font-serif font-bold text-4xl text-white mb-3 tracking-tight drop-shadow-md">
              {incoming.title}
            </h2>
            {incoming.subtitle && (
              <p className="text-sm uppercase tracking-[0.28em] text-white/60 font-semibold mb-3">
                {incoming.subtitle}
              </p>
            )}
            <p className="text-lg text-white/85 font-medium leading-relaxed drop-shadow-sm">
              {incoming.message}
            </p>
            {incoming.afterglow && (
              <p className="mt-5 text-sm text-white/65 font-medium max-w-xs">
                {incoming.afterglow}
              </p>
            )}
            <div className="mt-10 flex items-center gap-3">
              <button
                onClick={sendOneBack}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-white"
                style={{ background: incoming.color, boxShadow: `0 8px 24px -6px ${incoming.color}` }}
              >
                Send one back
              </button>
              <button
                ref={dismissBtnRef}
                onClick={dismiss}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-white/75"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default App;

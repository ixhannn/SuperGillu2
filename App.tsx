import React, { useState, useEffect, useCallback, useRef, createContext, useContext, useLayoutEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Heart } from 'lucide-react';
import { Onboarding } from './components/Onboarding';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { ViewState, TransitionDirection, ROOT_TABS } from './types';
import { TransitionEngine } from './utils/TransitionEngine';
import type { EngineDirection } from './utils/TransitionEngine';


// Navigation context for back navigation
export const NavigationContext = createContext<{
  navigateTo: (view: ViewState) => void;
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
import { Home } from './views/Home';
import { AddMemory } from './views/AddMemory';
import { MemoryTimeline } from './views/MemoryTimeline';
import { SpecialDates } from './views/SpecialDates';
import { Notes } from './views/Notes';
import { OpenWhen } from './views/OpenWhen';
import { Sync } from './views/Sync';
import { DailyMoments } from './views/DailyMoments';
import { DinnerDecider } from './views/DinnerDecider';
import { Profile } from './views/Profile';
import { QuietMode } from './views/QuietMode';
import { KeepsakeBox } from './views/KeepsakeBox';
import { ViewTransition } from './components/ViewTransition';
import { Countdowns } from './views/Countdowns';
import { MoodCalendar } from './views/MoodCalendar';
import { Auth } from './views/Auth';
import { AuraRewind } from './views/AuraRewind';
import { AuraSignal } from './views/AuraSignal';
import { PresenceRoom } from './views/PresenceRoom';
import { BonsaiBloom } from './views/BonsaiBloom';
import { Us } from './views/Us';
import { OurRoom } from './views/OurRoom';
import { Canvas } from './views/Canvas';
import { PrivacyPolicy } from './views/PrivacyPolicy';
import { TermsOfService } from './views/TermsOfService';
import { TimeCapsuleView } from './views/TimeCapsule';
import { SurprisesView } from './views/Surprises';
import { VoiceNotesView } from './views/VoiceNotes';
import { YearInReviewView } from './views/YearInReview';
import { PartnerIntelligenceView } from './views/PartnerIntelligenceView';
import { DailyVideoView } from './views/DailyVideoView';
import { WeeklyRecapView } from './views/WeeklyRecapView';
import { SyncService, syncEventTarget } from './services/sync';
import { StorageService, storageEventTarget } from './services/storage';
import { ThemeService, THEMES, ThemeId } from './services/theme';
import { SupabaseService } from './services/supabase';
import { Haptics } from './services/haptics';
import { Audio } from './services/audio';
import { AnimatePresence, motion } from 'framer-motion'; // Added for AuraSignalReceiver
import { AppLaunchOverlay } from './components/AppLaunchOverlay';
import { DevPanel } from './components/DevPanel';
import { WhatsNew } from './components/WhatsNew';
import { CoachmarkProvider, useCoachmark } from './components/CoachmarkSystem';
import { FeatureDiscovery } from './services/featureDiscovery';

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

// Main App Component with Default Export
const App = () => {
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [transitionDir, setTransitionDir] = useState<TransitionDirection>('tab');
  const [isSwitchingView, setIsSwitchingView] = useState(false);
  const historyStack = useRef<ViewState[]>([]);
  const scrollPositions = useRef<Record<string, number>>({});
  const pendingScrollRestore = useRef<{ view: ViewState; y: number } | null>(null);
  const transitionLockRef = useRef(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  // Tracks current view synchronously for pre-transition direction calculation.
  // Must be updated BEFORE state changes so direction is resolved correctly.
  const currentViewRef = useRef<ViewState>('home');

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

  // Predictive prefetch: BottomNav fires this on pointerdown before finger lifts.
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent<{ view: string }>).detail?.view as ViewState | undefined;
      if (view && view !== currentViewRef.current) setPrefetchView(view);
    };
    window.addEventListener('te:prefetch', handler);
    return () => window.removeEventListener('te:prefetch', handler);
  }, []);

  const finalizeNavigation = useCallback(() => {
    transitionLockRef.current = false;
    setIsSwitchingView(false);
  }, []);

  const runNavigation = useCallback((destination: ViewState, dir: TransitionDirection) => {
    pendingScrollRestore.current = {
      view: destination,
      y: scrollPositions.current[destination] ?? 0,
    };
    transitionLockRef.current = true;
    setIsSwitchingView(true);

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
  }, [finalizeNavigation]);

  const navigateTo = useCallback((view: ViewState) => {
    const prev = currentViewRef.current;
    if (prev === view || transitionLockRef.current) return;

    // ── Resolve direction before the transition snapshot ─────────────────────
    let dir: TransitionDirection = 'tab';
    if (view === 'add-memory') dir = 'modal';
    else if (ROOT_TABS.includes(view) && ROOT_TABS.includes(prev)) dir = 'tab';
    else dir = 'push';

    // Save scroll and update history synchronously (ref mutations, no re-render)
    scrollPositions.current[prev] = getCurrentScroll();
    if (!ROOT_TABS.includes(view)) {
      historyStack.current.push(prev);
      if (historyStack.current.length > 20) historyStack.current.shift();
    } else {
      historyStack.current = [];
    }
    currentViewRef.current = view;

    // ── View Transitions API: captures old/new DOM snapshots around setState ──
    // flushSync makes React update the DOM synchronously inside the VT callback
    // so the browser captures the correct before/after states.
    runNavigation(view, dir);
  }, [getCurrentScroll, runNavigation]);

  const goBack = useCallback(() => {
    if (transitionLockRef.current) return;
    const prev        = currentViewRef.current;
    const destination = historyStack.current.pop() ?? 'home';

    scrollPositions.current[prev] = getCurrentScroll();
    currentViewRef.current        = destination;
    runNavigation(destination, 'pop');
  }, [getCurrentScroll, runNavigation]);

  const canGoBack = historyStack.current.length > 0;

  const [prefetchView, setPrefetchView] = useState<ViewState | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [launchReady, setLaunchReady] = useState(false);
  const [showLaunchOverlay, setShowLaunchOverlay] = useState(true);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [scheduleTour, setScheduleTour] = useState(false);

  useEffect(() => {
    const launchTimer = window.setTimeout(() => setLaunchReady(true), 1350);
    return () => window.clearTimeout(launchTimer);
  }, []);

  useEffect(() => {
    if (isInitialized && launchReady) {
      setShowLaunchOverlay(false);
    }
  }, [isInitialized, launchReady]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 1. Initialize Storage and DB
        await StorageService.init();

        // 2. Check for Onboarding status
        const profile = StorageService.getCoupleProfile();
        const hasOnboarded = localStorage.getItem('lior_onboarded') === 'true' || localStorage.getItem('lior_manual_override') === 'true';
        setShowOnboarding(!hasOnboarded);

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

        // 4. Initialize Cloud Services (Supabase Auth)
        if (SupabaseService.init()) {
          try {
            const { data: { session } } = await SupabaseService.client!.auth.getSession();
            SupabaseService.setCachedUserId(session?.user?.id || null);
            setIsAuthenticated(!!session);

            // Listen for realtime auth changes
            SupabaseService.client!.auth.onAuthStateChange((event, session) => {
              SupabaseService.setCachedUserId(session?.user?.id || null);
              setIsAuthenticated(!!session);
              if (session) {
                SyncService.init().catch((syncError) => {
                  console.error("Sync Initialization failed:", syncError);
                });
              }
            });
          } catch (authError) {
            console.error("Supabase Auth failed:", authError);
            SupabaseService.setCachedUserId(null);
            setIsAuthenticated(false);
          }
        }

        // 5. Initialize Sync (Realtime Channels)
        if (SupabaseService.isConfigured()) {
          try {
            await SyncService.init();
          } catch (syncError) {
            console.error("Sync Initialization failed:", syncError);
          }
        }
      } catch (err) {
        console.error("Initialization error:", err);
      } finally {
        setIsInitialized(true);
        // Show What's New for returning users who haven't seen this version yet
        const hasOnboarded = localStorage.getItem('lior_onboarded') === 'true';
        if (hasOnboarded && !FeatureDiscovery.hasSeenCurrentVersion()) {
          setTimeout(() => setShowWhatsNew(true), 1800);
        }
        // Hide native splash screen after content is ready, with a brief
        // delay so the first paint is composited before the splash fades.
        if (Capacitor.isNativePlatform()) {
          requestAnimationFrame(() => {
            import('@capacitor/splash-screen').then(({ SplashScreen }) => {
              SplashScreen.hide({ fadeOutDuration: 200 });
            }).catch(() => {});
          });
        }
      }
    };

    initializeApp();

    // ── Android hardware back button ──
    // Intercept the native back gesture/button so it navigates within the app
    // instead of closing the WebView entirely (default Capacitor behavior).
    if (Capacitor.isNativePlatform()) {
      const backHandler = CapacitorApp.addListener('backButton', ({ canGoBack: webCanGoBack }) => {
        // Dispatch to open modals first
        const event = new CustomEvent('lior:hardware-back', { cancelable: true });
        window.dispatchEvent(event);
        if (event.defaultPrevented) return;

        if (historyStack.current.length > 0 && !transitionLockRef.current) {
          const prev        = currentViewRef.current;
          const destination = historyStack.current.pop() ?? 'home';

          scrollPositions.current[prev] = getCurrentScroll();
          currentViewRef.current        = destination;
          runNavigation(destination, 'pop');
        } else {
          // Already at root — minimize the app (Android pattern)
          CapacitorApp.minimizeApp();
        }
      });

      // ── StatusBar: edge-to-edge transparent overlay ──
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
        StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      }).catch(() => {});

      // ── Keyboard: configure Android resize behavior ──
      import('@capacitor/keyboard').then(({ Keyboard, KeyboardResize }) => {
        Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {});
        Keyboard.setScroll({ isDisabled: false }).catch(() => {});
      }).catch(() => {});

      return () => { backHandler.then(h => h.remove()); };
    }
  }, [getCurrentScroll, runNavigation]);


  const handleOnboardingSelect = (_me: string, _partner: string) => {
    // Profile + lior_onboarded flag are saved inside the Onboarding component
    setShowOnboarding(false);
    // Schedule the coachmark tour for brand-new users
    setScheduleTour(true);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // useMemo must be called unconditionally (Rules of Hooks) — before any early returns
  const renderedView = useMemo(() => {
    switch (currentView) {
      case 'home':          return <Home setView={navigateTo} />;
      case 'add-memory':    return <AddMemory setView={navigateTo} />;
      case 'timeline':      return <MemoryTimeline setView={navigateTo} />;
      case 'special-dates': return <SpecialDates setView={navigateTo} />;
      case 'notes':         return <Notes setView={navigateTo} />;
      case 'open-when':     return <OpenWhen setView={navigateTo} />;
      case 'sync':          return <Sync setView={navigateTo} />;
      case 'daily-moments': return <DailyMoments setView={navigateTo} />;
      case 'dinner-decider':return <DinnerDecider setView={navigateTo} />;
      case 'profile':       return <Profile setView={navigateTo} />;
      case 'quiet-mode':    return <QuietMode setView={navigateTo} />;
      case 'keepsakes':     return <KeepsakeBox setView={navigateTo} />;
      case 'countdowns':    return <Countdowns setView={navigateTo} />;
      case 'mood-calendar': return <MoodCalendar setView={navigateTo} />;
      case 'aura-rewind':   return <AuraRewind setView={navigateTo} />;
      case 'aura-signal':   return <AuraSignal setView={navigateTo} />;
      case 'presence-room': return <PresenceRoom setView={navigateTo} />;
      case 'bonsai-bloom':  return <BonsaiBloom setView={navigateTo} />;
      case 'us':            return <Us setView={navigateTo} />;
      case 'our-room':      return <OurRoom setView={navigateTo} />;
      case 'canvas':        return <Canvas setView={navigateTo} />;
      case 'privacy-policy': return <PrivacyPolicy setView={navigateTo} />;
      case 'terms-of-service': return <TermsOfService setView={navigateTo} />;
      case 'time-capsule':  return <TimeCapsuleView setView={navigateTo} />;
      case 'surprises':     return <SurprisesView setView={navigateTo} />;
      case 'voice-notes':   return <VoiceNotesView setView={navigateTo} />;
      case 'year-in-review': return <YearInReviewView setView={navigateTo} />;
      case 'partner-intelligence': return <PartnerIntelligenceView setView={navigateTo} />;
      case 'daily-video': return <DailyVideoView setView={navigateTo} />;
      case 'weekly-recap': return <WeeklyRecapView setView={navigateTo} />;
      default:              return <Home setView={navigateTo} />;
    }
  }, [currentView, navigateTo]);

  // Pre-render high-probability nav targets silently (finger-on-tab → head-start).
  const getPrefetchContent = useCallback((view: ViewState): React.ReactNode => {
    switch (view) {
      case 'home':          return <Home setView={navigateTo} />;
      case 'us':            return <Us setView={navigateTo} />;
      case 'timeline':      return <MemoryTimeline setView={navigateTo} />;
      case 'daily-moments': return <DailyMoments setView={navigateTo} />;
      default: return null;
    }
  }, [navigateTo]);

  // Global Loading State
  if (!isInitialized) {
    return <RouteLoader />;
  }

  // Cloud Authentication Check
  if (!isAuthenticated && SupabaseService.isConfigured()) {
    return (
      <ErrorBoundary>
        <Auth
          onLogin={handleLoginSuccess}
          onPrivacyPolicy={() => setCurrentView('privacy-policy')}
          onTerms={() => setCurrentView('terms-of-service')}
        />
        {(currentView === 'privacy-policy' || currentView === 'terms-of-service') && (
          <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--theme-bg-main)' }}>
            {currentView === 'privacy-policy'
              ? <PrivacyPolicy setView={navigateTo} onBack={() => setCurrentView('home')} />
              : <TermsOfService setView={navigateTo} onBack={() => setCurrentView('home')} />}
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
      <NavigationContext.Provider value={{ navigateTo, goBack, canGoBack, currentView }}>
        <CoachmarkProvider>
          <ErrorBoundary>
            <Layout currentView={currentView} setView={navigateTo} registerScrollRef={registerScrollRef} isSwitchingView={isSwitchingView}>
              <ViewTransition viewKey={currentView} transitionDirection={transitionDir}>
                {renderedView}
              </ViewTransition>
            </Layout>
            <AuraSignalReceiver />
            {/* Predictive prefetch ghost — hidden, zero layout impact */}
            {prefetchView && prefetchView !== currentView && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', visibility: 'hidden',
                  pointerEvents: 'none', width: 0, height: 0, overflow: 'hidden',
                }}
              >
                {getPrefetchContent(prefetchView)}
              </div>
            )}
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
      <DevPanel actions={[
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
            localStorage.removeItem('lior_onboarded');
            localStorage.removeItem('lior_manual_override');
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
      ]} />
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

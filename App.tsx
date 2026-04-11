import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { flushSync } from 'react-dom';
import { Heart } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { ViewState, TransitionDirection, ROOT_TABS } from './types';
import { LenisScroll } from './services/LenisScroll';
import { navigateWithTransition } from './utils/gesture';


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
import { SyncService, syncEventTarget } from './services/sync';
import { StorageService, storageEventTarget } from './services/storage';
import { ThemeService, THEMES, ThemeId } from './services/theme';
import { SupabaseService } from './services/supabase';
import { Haptics } from './services/haptics';
import { Audio } from './services/audio';
import { AnimatePresence, motion } from 'framer-motion'; // Added for AuraSignalReceiver
import { AppLaunchOverlay } from './components/AppLaunchOverlay';

// Onboarding component for first-time identity selection
const Onboarding = ({ onSelect }: { onSelect: (me: string, partner: string) => void }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden animate-fade-in"
      style={{ background: 'var(--theme-bg-main)', color: 'var(--color-text-primary)' }}>
      <div className="absolute top-[-10%] right-[-10%] w-72 h-72 rounded-full blur-3xl animate-pulse" style={{ background: 'var(--theme-orb-1)' }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-72 h-72 rounded-full blur-3xl animate-pulse" style={{ background: 'var(--theme-orb-2)', animationDelay: '1s' }} />

      <div className="relative z-10 text-center w-full max-sm:max-w-xs">
        <div className="w-20 h-20 bg-white rounded-full mx-auto mb-8 shadow-elevated flex items-center justify-center text-lior-500 animate-pop-in border-[3px] border-lior-100/60">
          <Heart size={40} fill="currentColor" className="animate-pulse-slow" />
        </div>

        <h1 className="text-headline font-serif mb-2" style={{ color: 'var(--color-text-primary)' }}>Almost there</h1>
        <p className="mb-12 font-medium text-sm" style={{ color: 'var(--color-text-secondary)' }}>One last step.<br />Who are you?</p>

        <div className="grid gap-3.5 w-full">
          <button
            onClick={() => onSelect('Tulika', 'Ishan')}
            className="w-full p-4 rounded-[1.25rem] glass-card-hero flex items-center gap-4 transition-all group spring-press"
          >
            <div className="w-12 h-12 rounded-full bg-lior-50 flex items-center justify-center text-2xl transition-transform">👩🏻</div>
            <div className="text-left">
              <span className="block font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>Tulika</span>
              <span className="text-micro tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Switch to your profile</span>
            </div>
          </button>

          <button
            onClick={() => onSelect('Ishan', 'Tulika')}
            className="w-full p-4 rounded-[1.25rem] glass-card-hero flex items-center gap-4 transition-all group spring-press"
          >
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-2xl transition-transform">👨🏻</div>
            <div className="text-left">
              <span className="block font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>Ishan</span>
              <span className="text-micro tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Switch to your profile</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const historyStack = useRef<ViewState[]>([]);
  const scrollPositions = useRef<Record<string, number>>({});
  const mainScrollRef = useRef<HTMLElement | null>(null);
  // Tracks current view synchronously for pre-transition direction calculation.
  // Must be updated BEFORE state changes so direction is resolved correctly.
  const currentViewRef = useRef<ViewState>('home');

  // Register main scroll container from Layout
  const registerScrollRef = useCallback((el: HTMLElement | null) => {
    mainScrollRef.current = el;
  }, []);

  const getCurrentScroll = useCallback(() => {
    if (LenisScroll.isReady) {
      return LenisScroll.scroll;
    }

    return mainScrollRef.current?.scrollTop ?? 0;
  }, []);

  const restoreScroll = useCallback((y: number, immediate = true) => {
    if (LenisScroll.isReady) {
      LenisScroll.scrollTo(y, { immediate });
      return;
    }

    mainScrollRef.current?.scrollTo({
      top: y,
      behavior: immediate ? 'auto' : 'smooth',
    });
  }, []);

  const navigateTo = useCallback((view: ViewState) => {
    const prev = currentViewRef.current;
    if (prev === view) return;

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
    navigateWithTransition(
      () => {
        setCurrentView(view);
        setTransitionDir(dir);
      },
      dir,
      flushSync,
    );

    // Restore scroll after the transition has painted (both VT and FM paths)
    requestAnimationFrame(() => {
      setTimeout(() => {
        const targetY = scrollPositions.current[view] ?? 0;
        restoreScroll(targetY, true);
      }, 10);
    });
  }, [getCurrentScroll, restoreScroll]);

  const goBack = useCallback(() => {
    const prev        = currentViewRef.current;
    const destination = historyStack.current.pop() ?? 'home';

    scrollPositions.current[prev] = getCurrentScroll();
    currentViewRef.current        = destination;

    navigateWithTransition(
      () => {
        setCurrentView(destination);
        setTransitionDir('pop');
      },
      'pop',
      flushSync,
    );

    requestAnimationFrame(() => {
      setTimeout(() => {
        const targetY = scrollPositions.current[destination] ?? 0;
        restoreScroll(targetY, true);
      }, 10);
    });
  }, [getCurrentScroll, restoreScroll]);

  const canGoBack = historyStack.current.length > 0;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [launchReady, setLaunchReady] = useState(false);
  const [showLaunchOverlay, setShowLaunchOverlay] = useState(true);

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

        if (historyStack.current.length > 0) {
          const prev        = currentViewRef.current;
          const destination = historyStack.current.pop() ?? 'home';

          scrollPositions.current[prev] = getCurrentScroll();
          currentViewRef.current        = destination;

          navigateWithTransition(
            () => {
              setCurrentView(destination);
              setTransitionDir('pop');
            },
            'pop',
            flushSync,
          );

          requestAnimationFrame(() => {
            setTimeout(() => {
              const targetY = scrollPositions.current[destination] ?? 0;
              restoreScroll(targetY, true);
            }, 10);
          });
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
  }, [getCurrentScroll, restoreScroll]);


  const handleOnboardingSelect = (me: string, partner: string) => {
    const current = StorageService.getCoupleProfile();
    StorageService.saveCoupleProfile({ ...current, myName: me, partnerName: partner });
    localStorage.setItem('lior_onboarded', 'true');
    setShowOnboarding(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

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
    return <Onboarding onSelect={handleOnboardingSelect} />;
  }

  // Simple Router based on viewState
  const renderView = () => {
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
      default:              return <Home setView={navigateTo} />;
    }
  };

  return (
    <NavigationContext.Provider value={{ navigateTo, goBack, canGoBack, currentView }}>
      <ErrorBoundary>
        <Layout currentView={currentView} setView={navigateTo} registerScrollRef={registerScrollRef}>
          <ViewTransition viewKey={currentView} transitionDirection={transitionDir}>
            {renderView()}
          </ViewTransition>
        </Layout>
        <AuraSignalReceiver />
        <AnimatePresence>
          {showLaunchOverlay && <AppLaunchOverlay />}
        </AnimatePresence>
      </ErrorBoundary>
    </NavigationContext.Provider>
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

import React, { useState, useEffect, useCallback } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { ViewState } from './types';
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
import { BonsaiBloom } from './views/BonsaiBloom';
import { SyncService, syncEventTarget } from './services/sync';
import { StorageService, storageEventTarget } from './services/storage';
import { ThemeService } from './services/theme';
import { SupabaseService } from './services/supabase';
import { AnimatePresence, motion } from 'framer-motion'; // Added for AuraSignalReceiver

// Onboarding component for first-time identity selection
const Onboarding = ({ onSelect }: { onSelect: (me: string, partner: string) => void }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden animate-fade-in"
      style={{ background: 'linear-gradient(168deg, #0f0a12 0%, #150d1a 30%, #1a0e1e 55%, #120a18 75%, #0d0810 100%)' }}>
      <div className="absolute top-[-10%] right-[-10%] w-72 h-72 bg-tulika-500/15 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-72 h-72 bg-violet-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="relative z-10 text-center w-full max-sm:max-w-xs">
        <div className="w-20 h-20 bg-white rounded-full mx-auto mb-8 shadow-elevated flex items-center justify-center text-tulika-500 animate-pop-in border-[3px] border-tulika-100/60">
          <Heart size={40} fill="currentColor" className="animate-pulse-slow" />
        </div>

        <h1 className="text-headline font-serif text-gray-100 mb-2">Almost there</h1>
        <p className="text-gray-400 mb-12 font-medium text-sm">One last step.<br />Who are you?</p>

        <div className="grid gap-3.5 w-full">
          <button
            onClick={() => onSelect('Tulika', 'Ishan')}
            className="w-full p-4 rounded-[1.25rem] glass-card-hero flex items-center gap-4 transition-all group spring-press"
          >
            <div className="w-12 h-12 rounded-full bg-tulika-50 flex items-center justify-center text-2xl transition-transform">👩🏻</div>
            <div className="text-left">
              <span className="block font-bold text-gray-100 text-base">Tulika</span>
              <span className="text-micro text-gray-400 tracking-wider">Switch to your profile</span>
            </div>
          </button>

          <button
            onClick={() => onSelect('Ishan', 'Tulika')}
            className="w-full p-4 rounded-[1.25rem] glass-card-hero flex items-center gap-4 transition-all group spring-press"
          >
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-2xl transition-transform">👨🏻</div>
            <div className="text-left">
              <span className="block font-bold text-gray-100 text-base">Ishan</span>
              <span className="text-micro text-gray-400 tracking-wider">Switch to your profile</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// Main App Component with Default Export
const App = () => {
  const [currentView, setCurrentView] = useState<ViewState>('home');

  // Trigger chromatic aberration on every view change
  const navigateTo = useCallback((view: ViewState) => {
    setCurrentView(view);
  }, []);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 1. Initialize Storage and DB
        await StorageService.init();

        // 2. Check for Onboarding status
        const profile = StorageService.getCoupleProfile();
        const hasOnboarded = localStorage.getItem('tulika_onboarded') === 'true' || localStorage.getItem('tulika_manual_override') === 'true';
        setShowOnboarding(!hasOnboarded);

        // 3. Apply stored theme
        ThemeService.applyTheme(profile.theme || 'rose');

        // 4. Initialize Cloud Services (Supabase Auth)
        if (SupabaseService.init()) {
          try {
            const { data: { session } } = await SupabaseService.client!.auth.getSession();
            setIsAuthenticated(!!session);

            // Listen for realtime auth changes
            SupabaseService.client!.auth.onAuthStateChange((event, session) => {
              setIsAuthenticated(!!session);
            });
          } catch (authError) {
            console.error("Supabase Auth failed:", authError);
            setIsAuthenticated(false);
          }
        }

        // 5. Initialize Sync (Realtime Channels)
        try {
          await SyncService.init();
        } catch (syncError) {
          console.error("Sync Initialization failed:", syncError);
        }
      } catch (err) {
        console.error("Initialization error:", err);
      } finally {
        setIsInitialized(true);
      }
    };

    initializeApp();
  }, []);

  const handleOnboardingSelect = (me: string, partner: string) => {
    const current = StorageService.getCoupleProfile();
    StorageService.saveCoupleProfile({ ...current, myName: me, partnerName: partner });
    localStorage.setItem('tulika_onboarded', 'true');
    setShowOnboarding(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // Global Loading State
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(168deg, #0f0a12 0%, #150d1a 30%, #1a0e1e 55%, #0d0810 100%)' }}>
        <div className="relative">
          <Heart size={44} className="text-tulika-200 animate-ping absolute inset-0" fill="currentColor" />
          <Heart size={44} className="text-tulika-500 relative z-10 animate-pulse" fill="currentColor" />
        </div>
        <p className="mt-8 text-tulika-600 font-serif font-bold tracking-widest uppercase text-micro animate-pulse">
          Opening Your Vault
        </p>
      </div>
    );
  }

  // Cloud Authentication Check
  if (!isAuthenticated && SupabaseService.isConfigured()) {
    return <Auth onLogin={handleLoginSuccess} />;
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
      case 'bonsai-bloom':  return <BonsaiBloom setView={navigateTo} />;
      default:              return <Home setView={navigateTo} />;
    }
  };

  return (
    <>
      <Layout currentView={currentView} setView={navigateTo}>
        <ViewTransition viewKey={currentView}>
          {renderView()}
        </ViewTransition>
      </Layout>
      <AuraSignalReceiver />
    </>
  );
};

const AuraSignalReceiver = () => {
  const [incoming, setIncoming] = useState<{ id?: string, color: string, title: string, message: string } | null>(null);

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
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]); 
        
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
           new Notification('Tulika - New Aura', { 
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
            <p className="text-lg text-white/80 font-medium leading-relaxed drop-shadow-sm">
              {incoming.message}
            </p>
            <p className="mt-12 text-xs text-white/40 uppercase tracking-widest font-bold">Tap to dismiss</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default App;


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
import { SyncService } from './services/sync';
import { StorageService, storageEventTarget } from './services/storage';
import { ThemeService } from './services/theme';
import { SupabaseService } from './services/supabase';

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
      default:              return <Home setView={navigateTo} />;
    }
  };

  return (
    <Layout currentView={currentView} setView={navigateTo}>
      <ViewTransition viewKey={currentView}>
        {renderView()}
      </ViewTransition>
    </Layout>
  );
};

export default App;

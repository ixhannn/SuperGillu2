
import React, { useState, useEffect } from 'react';
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
import { SyncService } from './services/sync';
import { StorageService, storageEventTarget } from './services/storage';
import { ThemeService } from './services/theme';
import { SupabaseService } from './services/supabase';

// Onboarding component for first-time identity selection
const Onboarding = ({ onSelect }: { onSelect: (me: string, partner: string) => void }) => {
  return (
    <div className="min-h-screen bg-tulika-50 flex flex-col items-center justify-center p-6 relative overflow-hidden animate-fade-in">
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-tulika-200 rounded-full blur-3xl opacity-50 animate-pulse"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-purple-200 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="relative z-10 text-center w-full max-sm:max-w-xs">
        <div className="w-24 h-24 bg-white rounded-full mx-auto mb-8 shadow-xl flex items-center justify-center text-tulika-500 animate-pop-in border-4 border-tulika-100">
          <Heart size={48} fill="currentColor" className="animate-pulse-slow" />
        </div>

        <h1 className="text-4xl font-serif font-bold text-gray-800 mb-3">Almost there</h1>
        <p className="text-gray-500 mb-12 font-medium">One last step.<br />Who are you?</p>

        <div className="grid gap-4 w-full">
          <button
            onClick={() => onSelect('Tulika', 'Ishan')}
            className="w-full p-4 rounded-2xl bg-white border-2 border-tulika-100 hover:border-tulika-500 flex items-center gap-4 transition-all group active:scale-95 shadow-sm"
          >
            <div className="w-12 h-12 rounded-full bg-tulika-50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">👩🏻</div>
            <div className="text-left">
              <span className="block font-bold text-gray-800 text-lg">Tulika</span>
              <span className="text-xs text-gray-400">Switch to your profile</span>
            </div>
          </button>

          <button
            onClick={() => onSelect('Ishan', 'Tulika')}
            className="w-full p-4 rounded-2xl bg-white border-2 border-blue-100 hover:border-blue-500 flex items-center gap-4 transition-all group active:scale-95 shadow-sm"
          >
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">👨🏻</div>
            <div className="text-left">
              <span className="block font-bold text-gray-800 text-lg">Ishan</span>
              <span className="text-xs text-gray-400">Switch to your profile</span>
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
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
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
        const { data: { session } } = await SupabaseService.client!.auth.getSession();
        setIsAuthenticated(!!session);

        // Listen for realtime auth changes
        SupabaseService.client!.auth.onAuthStateChange((event, session) => {
          setIsAuthenticated(!!session);
        });
      }

      // 5. Initialize Sync (Realtime Channels)
      await SyncService.init();

      setIsInitialized(true);
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
      <div className="min-h-screen bg-tulika-50 flex flex-col items-center justify-center">
        <div className="relative">
          <Heart size={48} className="text-tulika-200 animate-ping absolute inset-0" fill="currentColor" />
          <Heart size={48} className="text-tulika-500 relative z-10 animate-pulse" fill="currentColor" />
        </div>
        <p className="mt-8 text-tulika-600 font-serif font-bold tracking-widest uppercase text-xs animate-pulse">
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
      case 'home': return <Home setView={setCurrentView} />;
      case 'add-memory': return <AddMemory setView={setCurrentView} />;
      case 'timeline': return <MemoryTimeline setView={setCurrentView} />;
      case 'special-dates': return <SpecialDates setView={setCurrentView} />;
      case 'notes': return <Notes setView={setCurrentView} />;
      case 'open-when': return <OpenWhen setView={setCurrentView} />;
      case 'sync': return <Sync setView={setCurrentView} />;
      case 'daily-moments': return <DailyMoments setView={setCurrentView} />;
      case 'dinner-decider': return <DinnerDecider setView={setCurrentView} />;
      case 'profile': return <Profile setView={setCurrentView} />;
      case 'quiet-mode': return <QuietMode setView={setCurrentView} />;
      case 'keepsakes': return <KeepsakeBox setView={setCurrentView} />;
      case 'countdowns': return <Countdowns setView={setCurrentView} />;
      case 'mood-calendar': return <MoodCalendar setView={setCurrentView} />;
      default: return <Home setView={setCurrentView} />;
    }
  };

  return (
    <Layout currentView={currentView} setView={setCurrentView}>
      <ViewTransition viewKey={currentView}>
        {renderView()}
      </ViewTransition>
    </Layout>
  );
};

export default App;

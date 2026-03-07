import React, { useMemo } from 'react';
import { Home, Plus, Gift, Archive, Sparkles, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState } from '../types';
import { MagneticButton } from './MagneticButton';

interface BottomNavProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  notifications?: {
    timeline?: boolean;
    moments?: boolean;
    keepsakes?: boolean;
  };
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, setView, notifications }) => {
  const navItems = useMemo(() => [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'keepsakes', icon: Gift, label: 'Box', hasNotification: notifications?.keepsakes },
    { id: 'add-memory', icon: Plus, label: 'Add' },
    { id: 'daily-moments', icon: Sparkles, label: 'Moments', hasNotification: notifications?.moments },
    { id: 'timeline', icon: Archive, label: 'Memories', hasNotification: notifications?.timeline },
  ], [notifications]);

  const activeIndex = useMemo(() => {
    const idx = navItems.findIndex(item => item.id === currentView);
    return idx === -1 ? 0 : idx;
  }, [currentView, navItems]);

  return (
    <div className="fixed bottom-0 left-0 right-0 px-6 pb-safe z-50 pointer-events-none">
      <div className="max-w-md mx-auto mb-6 pointer-events-auto relative">

        {/* Glass Navigation Bar with Gooey Filter applied */}
        <div
          className="relative bg-white/85 backdrop-blur-2xl rounded-[2.5rem] flex items-center justify-between p-1.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)] border border-white/60"
          style={{ filter: 'url(#goo)' }}
        >

          {/* We remove the CSS-based morphing pill here as framer-motion handles it per-button */}

          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;

            return (
              <MagneticButton
                key={item.id}
                onClick={() => setView(item.id as any)}
                className="relative flex flex-col items-center justify-center flex-1 py-3 group z-10 outline-none spring-press"
                aria-label={item.label}
                strength={0.2}
              >
                <div className={`relative transition-all duration-500 ease-spring-bounce ${isActive
                  ? 'scale-110 -translate-y-0.5'
                  : 'scale-100 opacity-30 hover:opacity-60 hover:-translate-y-0.5'
                  }`}>
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={`transition-colors duration-300 ${isActive ? 'text-tulika-600' : 'text-gray-600'}`}
                    fill={isActive ? 'currentColor' : 'none'}
                    fillOpacity={isActive ? 0.2 : 0}
                  />

                  {/* Notification Pulsing Heart */}
                  {item.hasNotification && !isActive && (
                    <div className="absolute -top-1.5 -right-1.5 filter drop-shadow-sm">
                      <Heart
                        size={10}
                        className="text-tulika-500 fill-tulika-500 animate-breathe"
                      />
                    </div>
                  )}
                </div>

                {/* Active Indicator Morphing Pill (Framer Motion) */}
                {isActive && (
                  <motion.div
                    layoutId="active-nav-pill"
                    className="absolute inset-y-1.5 inset-x-0 bg-gradient-to-b from-gray-50 to-gray-100/80 rounded-full -z-10"
                    style={{ boxShadow: '0 2px 12px -2px rgba(244, 63, 94, 0.12), inset 0 1px 0 rgba(255,255,255,0.8)' }}
                    transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                  />
                )}

                {/* Active dot with spring bounce */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className="absolute bottom-1 w-1 h-1 bg-tulika-500 rounded-full"
                    />
                  )}
                </AnimatePresence>
              </MagneticButton>
            );
          })}
        </div>
      </div>
    </div>
  );
};
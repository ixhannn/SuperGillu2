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
    { id: 'add-memory', icon: Plus, label: 'Add', isCenter: true },
    { id: 'daily-moments', icon: Sparkles, label: 'Moments', hasNotification: notifications?.moments },
    { id: 'timeline', icon: Archive, label: 'Memories', hasNotification: notifications?.timeline },
  ], [notifications]);

  return (
    <div className="fixed bottom-0 left-0 right-0 px-5 pb-safe z-50 pointer-events-none">
      <div className="max-w-md mx-auto mb-5 pointer-events-auto">
        <div className="relative glass-nav rounded-[2rem] flex items-center justify-around px-2 py-1">

          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;

            return (
              <MagneticButton
                key={item.id}
                onClick={() => setView(item.id as any)}
                className="relative flex flex-col items-center justify-center py-2.5 px-3 group z-10 outline-none"
                aria-label={item.label}
                strength={0.15}
              >
                {/* Center "Add" button — elevated pill */}
                {item.isCenter ? (
                  <motion.div
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-br from-tulika-500 to-tulika-600 shadow-glow-rose'
                        : 'bg-gradient-to-br from-tulika-400 to-tulika-500 shadow-lg shadow-tulika-200/40'
                    }`}
                  >
                    <Plus size={22} strokeWidth={2.5} className="text-white" />
                  </motion.div>
                ) : (
                  <>
                    <div className={`relative transition-all duration-400 ease-spring ${
                      isActive ? '-translate-y-0.5' : 'opacity-35'
                    }`}>
                      <Icon
                        size={21}
                        strokeWidth={isActive ? 2.5 : 1.8}
                        className={`transition-colors duration-300 ${isActive ? 'text-tulika-600' : 'text-warmgray-600'}`}
                        fill={isActive ? 'currentColor' : 'none'}
                        fillOpacity={isActive ? 0.15 : 0}
                      />

                      {/* Notification heart */}
                      {item.hasNotification && !isActive && (
                        <div className="absolute -top-1 -right-1.5">
                          <Heart size={8} className="text-tulika-500 fill-tulika-500 animate-breathe" />
                        </div>
                      )}
                    </div>

                    {/* Label */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.span
                          initial={{ opacity: 0, y: 4, scale: 0.8 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 2, scale: 0.9 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          className="text-micro text-tulika-600 mt-0.5 tracking-wider"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Active pill background */}
                    {isActive && (
                      <motion.div
                        layoutId="nav-active-pill"
                        className="absolute inset-1 bg-tulika-50/60 rounded-2xl -z-10"
                        transition={{ type: 'spring', stiffness: 280, damping: 28, mass: 0.7 }}
                      />
                    )}
                  </>
                )}
              </MagneticButton>
            );
          })}
        </div>
      </div>
    </div>
  );
};

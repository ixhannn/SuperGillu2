import React, { useMemo, memo } from 'react';
import { Home, Plus, Gift, Archive, Sparkles, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState } from '../types';

interface BottomNavProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  notifications?: {
    timeline?: boolean;
    moments?: boolean;
    keepsakes?: boolean;
  };
}

export const BottomNav: React.FC<BottomNavProps> = memo(({ currentView, setView, notifications }) => {
  const navItems = useMemo(() => [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'keepsakes', icon: Gift, label: 'Box', hasNotification: notifications?.keepsakes },
    { id: 'add-memory', icon: Plus, label: 'Add', isCenter: true },
    { id: 'daily-moments', icon: Sparkles, label: 'Moments', hasNotification: notifications?.moments },
    { id: 'timeline', icon: Archive, label: 'Memories', hasNotification: notifications?.timeline },
  ], [notifications]);

  return (
    <div className="fixed bottom-0 left-0 right-0 px-4 pb-safe z-50 pointer-events-none">
      <div className="max-w-md mx-auto mb-4 pointer-events-auto">
        <div
          className="relative rounded-[1.75rem] flex items-center justify-around px-1.5 py-1.5"
            style={{
            background: 'linear-gradient(135deg, rgba(232,160,176,0.15) 0%, rgba(255,255,255,0.95) 50%, rgba(232,160,176,0.12) 100%)',
            backdropFilter: 'blur(32px) saturate(160%)',
            WebkitBackdropFilter: 'blur(32px) saturate(160%)',
            border: '1px solid rgba(255,255,255,0.8)',
            boxShadow: `
              inset 0 1px 0 rgba(255,255,255,0.9),
              inset 0 -1px 0 rgba(255,255,255,0.4),
              0 8px 32px rgba(232,160,176,0.25),
              0 2px 8px rgba(232,160,176,0.1)
            `,
          }}
        >
          {/* Specular highlight — top edge refraction */}
          <div
            className="absolute top-0 left-6 right-6 h-[1px] rounded-full pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.8) 70%, transparent 100%)',
            }}
          />

          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as any)}
                className="relative flex flex-col items-center justify-center py-2 px-3 outline-none min-w-[52px] min-h-[48px]"
                aria-label={item.label}
              >
                {item.isCenter ? (
                  <motion.div
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="w-12 h-12 rounded-[1.1rem] flex items-center justify-center relative"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
                        : 'linear-gradient(135deg, rgba(236,72,153,0.85) 0%, rgba(219,39,119,0.85) 100%)',
                      boxShadow: isActive
                        ? '0 4px 20px rgba(251,207,232,0.35), 0 2px 8px rgba(251,207,232,0.2), inset 0 1px 0 rgba(255,255,255,0.25)'
                        : '0 4px 16px rgba(251,207,232,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
                    }}
                  >
                    <Plus size={22} strokeWidth={2.5} className="text-white" />
                  </motion.div>
                ) : (
                  <>
                    <div className="relative">
                      <Icon
                        size={21}
                        strokeWidth={isActive ? 2.5 : 1.8}
                        className="transition-all duration-300"
                        style={{
                          color: isActive ? 'rgba(75, 85, 99, 0.95)' : 'rgba(107, 114, 128, 0.45)', /* gray-600 and gray-500 */
                        }}
                        fill={isActive ? 'currentColor' : 'none'}
                        fillOpacity={isActive ? 0.08 : 0}
                      />

                      {item.hasNotification && !isActive && (
                        <div className="absolute -top-0.5 -right-1">
                          <Heart size={7} className="text-tulika-400 fill-tulika-400 animate-breathe" />
                        </div>
                      )}
                    </div>

                    <AnimatePresence>
                      {isActive && (
                        <motion.span
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 2 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                          className="text-[9px] font-semibold tracking-[0.05em] mt-0.5"
                          style={{ color: 'rgba(75, 85, 99, 0.9)' }}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Active indicator — glowing pill behind icon */}
                    {isActive && (
                      <motion.div
                        layoutId="nav-active-pill"
                        className="absolute inset-0.5 -z-10 rounded-2xl"
                        style={{
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.04)',
                          boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.02), 0 2px 8px rgba(232,160,176,0.1)',
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.7 }}
                      />
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}) as React.FC<BottomNavProps>;

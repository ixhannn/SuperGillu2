import React, { useMemo, memo, useCallback, useRef, useEffect } from 'react';
import { Home, Plus, Archive, Sparkles, Heart, Users } from 'lucide-react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { ViewState } from '../types';
import { Audio } from '../services/audio';

interface BottomNavProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  notifications?: {
    timeline?: boolean;
    moments?: boolean;
    keepsakes?: boolean;
  };
}

// Fixed square — eliminates all width animation, zero layout triggers
const SZ = 52;

export const BottomNav: React.FC<BottomNavProps> = memo(({ currentView, setView, notifications }) => {
  const navRef  = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // translateX + scaleX/Y are the ONLY values that change per frame.
  // Both are GPU-composited transforms. Zero layout recalculation.
  const pillX  = useMotionValue(0);
  const pillSX = useMotionValue(1);
  const pillSY = useMotionValue(1);

  const navItems = useMemo(() => [
    { id: 'home',          icon: Home,     label: 'Home' },
    { id: 'us',            icon: Users,    label: 'Us' },
    { id: 'add-memory',    icon: Plus,     label: 'Add',     isCenter: true },
    { id: 'daily-moments', icon: Sparkles, label: 'Moments', hasNotification: notifications?.moments },
    { id: 'timeline',      icon: Archive,  label: 'Memories',hasNotification: notifications?.timeline },
  ], [notifications]);

  // Returns the x center-offset for the indicator under a button
  const getTargetX = useCallback((id: string): number | null => {
    const btn = btnRefs.current[id];
    const nav = navRef.current;
    if (!btn || !nav) return null;
    const nr = nav.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    // Center the SZ×SZ indicator on the button
    return br.left - nr.left + (br.width - SZ) / 2;
  }, []);

  const snapPill = useCallback((id: string) => {
    if (id === 'add-memory') return;
    const x = getTargetX(id);
    if (x === null) return;
    pillX.set(x);
    pillSX.set(1);
    pillSY.set(1);
  }, [pillX, pillSX, pillSY, getTargetX]);

  const animPill = useCallback((id: string) => {
    if (id === 'add-memory') return;
    const targetX = getTargetX(id);
    if (targetX === null) return;

    const dist = Math.abs(targetX - pillX.get());

    // ── Position spring ── GPU translateX, never triggers layout
    animate(pillX, targetX, {
      type:       'spring',
      stiffness:  360,
      damping:    24,
      mass:       0.55,
      restDelta:  0.5,
    });

    // ── Squash & stretch ── GPU scaleX/Y, liquid rubber-ball physics
    const peakX = Math.min(1 + dist / 160, 1.40);
    const peakY = Math.max(1 - dist / 260, 0.72);

    animate(pillSX, [1, peakX, 0.88, 1.05, 1], {
      duration: 0.46,
      times:    [0, 0.20, 0.56, 0.76, 1],
    });
    animate(pillSY, [1, peakY, 1.14, 0.96, 1], {
      duration: 0.46,
      times:    [0, 0.20, 0.56, 0.76, 1],
    });
  }, [pillX, pillSX, pillSY, getTargetX]);

  // Double-RAF: guarantees flex layout is painted before first measurement
  useEffect(() => {
    let r1: number, r2: number;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => snapPill(currentView));
    });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { animPill(currentView); }, [currentView, animPill]);

  const handleNavTap = useCallback((id: string) => {
    Audio.play(id === 'add-memory' ? 'press' : 'navSwitch');
    setView(id as ViewState);
  }, [setView]);

  const isAddActive = currentView === 'add-memory';

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-safe z-50 pointer-events-none"
         style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
      <div className="pointer-events-auto">
        <div
          ref={navRef}
          className="relative flex items-center"
          style={{
            height:       72,
            borderRadius: 9999,
            // Warm cream — matches reference palette
            background:   'rgba(253, 250, 245, 0.94)',
            backdropFilter:       'blur(28px) saturate(150%)',
            WebkitBackdropFilter: 'blur(28px) saturate(150%)',
            border:     '1px solid rgba(225, 210, 180, 0.65)',
            boxShadow:  [
              '0 12px 40px rgba(100, 70, 15, 0.14)',
              '0 4px 12px rgba(0,0,0,0.07)',
              'inset 0 1px 0 rgba(255,255,255,0.92)',
            ].join(', '),
            paddingLeft:  10,
            paddingRight: 10,
            gap:          0,
          }}
        >
          {/* ── Gold-ring squircle indicator ───────────────────────────────
               • Fixed SZ×SZ — no width change ever
               • x + scaleX/Y — pure compositor transforms
               • Gold gradient ring: outer bg + padding + white inner fill
               • Elevation via layered box-shadows
               • Hides (opacity 0) when Add tab is active
          ──────────────────────────────────────────────────────────────── */}
          <motion.div
            aria-hidden="true"
            className="absolute pointer-events-none"
            animate={{ opacity: isAddActive ? 0 : 1 }}
            transition={{ duration: 0.12 }}
            style={{
              x:            pillX,
              scaleX:       pillSX,
              scaleY:       pillSY,
              top:          (72 - SZ) / 2,   // vertically centered
              width:        SZ,
              height:       SZ,
              borderRadius: 16,
              willChange:   'transform',
              // ── Gold metallic ring via gradient background + padding ──
              background: [
                'linear-gradient(155deg,',
                '  #f4e090 0%,',
                '  #d4a030 25%,',
                '  #966010 58%,',
                '  #c8a035 82%,',
                '  #ead878 100%',
                ')',
              ].join(''),
              padding: '2.5px',
              boxShadow: [
                '0 10px 32px rgba(140, 90, 5, 0.32)',  // warm gold drop shadow
                '0 4px 12px rgba(0,0,0,0.16)',          // general elevation
                '0 1px 3px rgba(0,0,0,0.10)',           // close contact shadow
              ].join(', '),
            }}
          >
            {/* White/cream inner surface */}
            <div
              style={{
                width:        '100%',
                height:       '100%',
                borderRadius: 13.5,
                background:   'linear-gradient(148deg, #ffffff 0%, #f8f2e8 100%)',
                boxShadow: [
                  'inset 0 1.5px 2px rgba(255,255,255,1)',    // top specular
                  'inset 0 -1px 2px rgba(150,110,30,0.06)',   // subtle warm base
                ].join(', '),
              }}
            />
          </motion.div>

          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon     = item.icon;

            return (
              <button
                key={item.id}
                ref={el => { btnRefs.current[item.id] = el; }}
                onClick={() => handleNavTap(item.id)}
                className="relative flex items-center justify-center outline-none touch-manipulation"
                style={{ width: 64, height: 64, zIndex: 1, flexShrink: 0 }}
                aria-label={item.label}
                {...(item.id === 'daily-moments' ? { 'data-coachmark': 'daily-moments' } : {})}
              >
                {item.isCenter ? (
                  /* ── Add / FAB button ──────────────────────────────────
                      Rose-gradient squircle, always elevated.
                      Does not participate in the gold indicator.
                  ───────────────────────────────────────────────────────── */
                  <motion.div
                    data-coachmark="center-fab"
                    whileTap={{ scale: 0.87 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                    style={{
                      width:        SZ,
                      height:       SZ,
                      borderRadius: 16,
                      display:      'flex',
                      alignItems:   'center',
                      justifyContent: 'center',
                      background: isAddActive
                        ? 'linear-gradient(135deg, #e8365a 0%, #c41840 100%)'
                        : 'linear-gradient(135deg, rgba(232,54,90,0.88) 0%, rgba(196,24,64,0.88) 100%)',
                      boxShadow: isAddActive
                        ? '0 8px 28px rgba(232,54,90,0.38), 0 3px 10px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.22)'
                        : '0 4px 18px rgba(232,54,90,0.26), inset 0 1px 0 rgba(255,255,255,0.18)',
                    }}
                  >
                    <Plus size={22} strokeWidth={2.5} color="#ffffff" />
                  </motion.div>
                ) : (
                  /* ── Regular tab icon ──────────────────────────────────
                      Activation:   spring pop-up
                      Deactivation: instant (70 ms) — eliminates "stays lit"
                  ───────────────────────────────────────────────────────── */
                  <motion.div
                    className="relative flex items-center justify-center"
                    animate={isActive ? { scale: 1, y: 0 } : { scale: 0.88, y: 0 }}
                    transition={
                      isActive
                        ? { type: 'spring', stiffness: 520, damping: 26 }
                        : { duration: 0.07 }
                    }
                  >
                    <Icon
                      size={22}
                      strokeWidth={isActive ? 2.2 : 1.65}
                      fill={isActive ? 'currentColor' : 'none'}
                      fillOpacity={isActive ? 0.10 : 0}
                      style={{
                        // Warm dark brown active (matches reference) / muted taupe inactive
                        color: isActive
                          ? 'rgba(72, 48, 8, 0.90)'
                          : 'rgba(155, 130, 95, 0.60)',
                        transition: 'color 0.07s linear',
                      }}
                    />
                    {item.hasNotification && !isActive && (
                      <div className="absolute -top-1 -right-1">
                        <Heart size={7} className="text-lior-400 fill-lior-400 animate-breathe" />
                      </div>
                    )}
                  </motion.div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}) as React.FC<BottomNavProps>;

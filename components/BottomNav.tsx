import React, { useMemo, memo, useCallback, useRef, useEffect } from 'react';
import { Home, Plus, Archive, Sparkles, Heart, Users } from 'lucide-react';
import { motion } from 'framer-motion';
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

const IND   = 56;   // indicator size
const BTN   = 64;   // button slot
const NAV_H = 76;   // bar height
const RING  = 3;    // gold ring thickness

// Spring-like cubic-bezier: fast start, overshoots ~8%, settles cleanly.
// This runs inside WAAPI on the compositor thread — immune to JS jank.
const SPRING_EASE = 'cubic-bezier(0.34, 1.38, 0.64, 1)';
const SPRING_MS   = 420;

export const BottomNav: React.FC<BottomNavProps> = memo(({ currentView, setView, notifications }) => {
  const navRef  = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // WAAPI animation handle — lets us read the live position on interruption
  const waapiAnim = useRef<Animation | null>(null);
  // Last committed X (fallback if matrix read fails)
  const committedX = useRef<number>(0);

  const navItems = useMemo(() => [
    { id: 'home',          icon: Home,     label: 'Home' },
    { id: 'us',            icon: Users,    label: 'Us' },
    { id: 'add-memory',    icon: Plus,     label: 'Add',     isCenter: true },
    { id: 'daily-moments', icon: Sparkles, label: 'Moments', hasNotification: notifications?.moments },
    { id: 'timeline',      icon: Archive,  label: 'Memories',hasNotification: notifications?.timeline },
  ], [notifications]);

  /** Pixel offset from nav's left padding-edge to center the indicator on `id`. */
  const getX = useCallback((id: string): number | null => {
    const btn = btnRefs.current[id];
    const nav = navRef.current;
    if (!btn || !nav) return null;
    const nr = nav.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    // subtract 1 for the nav's 1px border (getBoundingClientRect = border-box,
    // but left:0 on absolute = padding-edge, 1px inside)
    return (br.left - nr.left - 1) + (br.width - IND) / 2;
  }, []);

  const movePill = useCallback((id: string, instant = false) => {
    const pill = pillRef.current;
    if (!pill) return;

    // Hide the pill for the Add tab (it has its own always-visible squircle)
    if (id === 'add-memory') {
      pill.style.opacity = '0';
      return;
    }
    pill.style.opacity = '1';

    const tx = getX(id);
    if (tx === null) return;

    // ── Snap (no animation) ───────────────────────────────────────────────
    if (instant) {
      waapiAnim.current?.cancel();
      waapiAnim.current = null;
      pill.style.transform = `translateX(${tx}px)`;
      committedX.current = tx;
      return;
    }

    // ── Smooth interruption ───────────────────────────────────────────────
    // Read the pill's LIVE position from the compositor (mid-animation aware).
    let fromX = committedX.current;
    if (waapiAnim.current?.playState === 'running') {
      try {
        const m = new DOMMatrix(getComputedStyle(pill).transform);
        if (isFinite(m.m41)) fromX = m.m41;
      } catch (_) { /* fallback to committedX */ }
    }

    // Commit the current position to inline style before cancelling.
    // Without this, cancel() snaps the element back to its pre-animation state.
    pill.style.transform = `translateX(${fromX}px)`;
    waapiAnim.current?.cancel();

    // ── WAAPI: pure compositor-thread animation ───────────────────────────
    // JS main thread can be totally blocked (React re-rendering the new view)
    // and this animation continues at the device's native frame rate (120fps).
    waapiAnim.current = pill.animate(
      [
        { transform: `translateX(${fromX}px)` },
        { transform: `translateX(${tx}px)` },
      ],
      {
        duration:  SPRING_MS,
        easing:    SPRING_EASE,
        fill:      'forwards',
        composite: 'replace',
      }
    );

    // On finish: commit so the next interruption reads correctly
    waapiAnim.current.onfinish = () => {
      pill.style.transform = `translateX(${tx}px)`;
      committedX.current = tx;
      waapiAnim.current?.cancel();   // remove fill state
      waapiAnim.current = null;
    };

    committedX.current = tx;
  }, [getX]);

  // Double-RAF: guarantees flex layout is fully painted before we measure
  useEffect(() => {
    let r1: number, r2: number;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => movePill(currentView, true));
    });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { movePill(currentView); }, [currentView, movePill]);

  const handleNavTap = useCallback((id: string) => {
    Audio.play(id === 'add-memory' ? 'press' : 'navSwitch');
    setView(id as ViewState);
  }, [setView]);

  const isAddActive = currentView === 'add-memory';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
    >
      <div className="pointer-events-auto">
        <div
          ref={navRef}
          className="relative flex items-center"
          style={{
            height:       NAV_H,
            borderRadius: 9999,
            paddingLeft:  10,
            paddingRight: 10,
            background:   'var(--theme-nav-glass-bg)',
            border:       '1px solid var(--theme-nav-glass-border)',
            boxShadow: [
              '0 20px 60px rgba(232, 160, 176, 0.22)',
              '0 8px 24px rgba(232, 160, 176, 0.14)',
              '0 2px 6px rgba(0, 0, 0, 0.06)',
              'inset 0 1.5px 0 rgba(255, 255, 255, 0.98)',
              'inset 0 -1px 0 rgba(232, 160, 176, 0.12)',
            ].join(', '),
          }}
        >
          {/* ── Pink glass indicator ──────────────────────────────────────
               Plain div — no framer-motion, no React subscriptions.
               Position animated via WAAPI (compositor thread).
               Opacity via CSS transition (also compositor thread).
               left:0 pins the translateX origin to the nav padding-edge.
               will-change:transform → browser pre-allocates compositor layer.
          ──────────────────────────────────────────────────────────────── */}
          <div
            ref={pillRef}
            aria-hidden="true"
            style={{
              position:     'absolute',
              left:         0,
              top:          `calc(50% - ${IND / 2}px)`,
              width:        IND,
              height:       IND,
              borderRadius: 16,
              willChange:   'transform, opacity',
              opacity:      1,
              // Opacity: CSS transition (compositor) — no JS needed
              transition:   'opacity 0.15s ease-out',
              // Pink glass border ring
              border:     `${RING}px solid transparent`,
              background: [
                'linear-gradient(150deg, rgba(255,255,255,0.96) 0%, rgba(255,235,242,0.92) 100%) padding-box',
                'linear-gradient(150deg, rgba(251,207,232,0.7) 0%, rgba(196,104,126,0.55) 50%, rgba(251,207,232,0.7) 100%) border-box',
              ].join(', '),
              boxShadow: [
                '0 8px 28px rgba(232, 160, 176, 0.38)',
                '0 4px 12px rgba(0, 0, 0, 0.08)',
                '0 1px 4px rgba(0, 0, 0, 0.06)',
                'inset 0 1.5px 1px rgba(255, 255, 255, 0.96)',
              ].join(', '),
            }}
          />

          {/* ── Buttons ──────────────────────────────────────────────────── */}
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon     = item.icon;

            return (
              <button
                key={item.id}
                ref={el => { btnRefs.current[item.id] = el; }}
                onPointerDown={() => {
                  // Fire before finger lifts — gives React time to pre-render destination
                  window.dispatchEvent(new CustomEvent('te:prefetch', { detail: { view: item.id } }));
                }}
                onClick={() => handleNavTap(item.id)}
                className="relative flex items-center justify-center outline-none touch-manipulation select-none"
                style={{ width: BTN, height: BTN, zIndex: 1, flexShrink: 0 }}
                aria-label={item.label}
                {...(item.id === 'daily-moments' ? { 'data-coachmark': 'daily-moments' } : {})}
              >
                {item.isCenter ? (
                  /* Pink FAB — always elevated, never behind the glass indicator */
                  <motion.div
                    data-coachmark="center-fab"
                    whileTap={{ scale: 0.87 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                    style={{
                      width:          IND,
                      height:         IND,
                      borderRadius:   16,
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      border:         'none',
                      background: isAddActive
                        ? 'var(--theme-nav-center-bg-active)'
                        : 'var(--theme-nav-center-bg-inactive)',
                      boxShadow: isAddActive
                        ? 'var(--theme-nav-center-shadow-active)'
                        : 'var(--theme-nav-center-shadow-inactive)',
                    }}
                  >
                    <Plus size={22} strokeWidth={2.5} color="rgba(255,255,255,0.96)" />
                  </motion.div>

                ) : (
                  /* Regular icon — framer-motion spring only fires once per switch */
                  <motion.div
                    className="relative flex items-center justify-center"
                    animate={isActive ? { scale: 1 } : { scale: 0.84 }}
                    transition={
                      isActive
                        ? { type: 'spring', stiffness: 500, damping: 26 }
                        : { duration: 0.06 }
                    }
                  >
                    <Icon
                      size={21}
                      strokeWidth={isActive ? 2.2 : 1.55}
                      fill={isActive ? 'currentColor' : 'none'}
                      fillOpacity={isActive ? 0.10 : 0}
                      style={{
                        color: isActive
                          ? 'var(--color-nav-active)'
                          : 'var(--color-text-secondary)',
                        transition: 'color 0.06s linear',
                      }}
                    />
                    {item.hasNotification && !isActive && (
                      <div className="absolute -top-0.5 -right-0.5">
                        <Heart size={6} className="text-lior-400 fill-lior-400 animate-breathe" />
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

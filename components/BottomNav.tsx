import React, { useMemo, memo, useCallback, useRef, useEffect } from 'react';
import { Home, Plus, Archive, Sparkles, Heart, Users } from 'lucide-react';
import { ViewState } from '../types';
import { Audio } from '../services/audio';
import { Haptics } from '../services/haptics';
import { useNativeShell } from '../hooks/useNativeShell';

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
const BTN   = 60;   // button slot
const NAV_H = 76;   // bar height

// Smooth deceleration without overshoot; keep nav movement calm and predictable.
// This runs inside WAAPI on the compositor thread — immune to JS jank.
const SPRING_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPRING_MS   = 420;

export const BottomNav: React.FC<BottomNavProps> = memo(({ currentView, setView, notifications }) => {
  const navRef  = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { keyboardOpen } = useNativeShell();

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
    void (id === 'add-memory' ? Haptics.press() : Haptics.softTap());
    if (currentView === 'private-space' && id === 'add-memory') {
      window.dispatchEvent(new CustomEvent('private-space:add'));
      return;
    }
    setView(id as ViewState);
  }, [currentView, setView]);

  const isAddActive = currentView === 'add-memory' || currentView === 'private-space';

  return (
    <div
      data-tour-occluder="bottom-nav"
      data-skip-blur-on-transition="true"
      className="fixed bottom-0 left-0 right-0 z-[60] flex justify-center pointer-events-none"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)',
        willChange: 'transform',
        transform: keyboardOpen ? 'translate3d(0, calc(100% + 24px), 0)' : 'translateZ(0)',
        opacity: keyboardOpen ? 0 : 1,
        transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease-out',
        backfaceVisibility: 'hidden',
        contain: 'layout paint style',
        isolation: 'isolate',
      }}
    >
      <div
        className="pointer-events-auto"
        style={{
          width: 'min(calc(100vw - 36px), 372px)',
          willChange: 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      >
        <div
          ref={navRef}
          className="relative flex items-center"
          style={{
            height:       NAV_H,
            width:        '100%',
            borderRadius: 32,
            paddingLeft:  12,
            paddingRight: 12,
            // Baked frosted look — no live backdrop-filter blur. The previous
            // blur(22px) on a fixed element re-rasterised the bar every scroll
            // frame, dropping FPS into the 40s on mid-range phones. This
            // multi-stop gradient + inner highlight + tinted shadow reads as
            // glass without any per-frame GPU work.
            background: [
              'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(252,247,250,0.88) 40%, rgba(244,238,247,0.84) 100%)',
              'radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.55) 0%, transparent 70%)',
            ].join(', '),
            boxShadow: [
              '0 12px 28px rgba(90,82,102,0.10)',
              '0 2px 6px rgba(90,82,102,0.05)',
              'inset 0 1px 0 rgba(255,255,255,0.95)',
              'inset 0 -1px 0 rgba(174,154,194,0.08)',
            ].join(', '),
            border: '1px solid rgba(255,255,255,0.62)',
            willChange: 'transform',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            contain: 'layout paint style',
          }}
        >
          {/* ── Neumorphic active pill ─────────────────────────────────── */}
          <div
            ref={pillRef}
            aria-hidden="true"
            style={{
              position:     'absolute',
              left:         0,
              top:          `calc(50% - ${IND / 2}px)`,
              width:        IND,
              height:       IND,
              borderRadius: 999,
              willChange:   'transform, opacity',
              opacity:      1,
              transition:   'opacity 0.15s ease-out',
              background:   'linear-gradient(145deg, #ffffff, #f6f3fa)',
              boxShadow: [
                '0 6px 14px rgba(90,82,102,0.12)',
                '0 2px 6px rgba(90,82,102,0.06)',
                'inset 0 1.5px 0 rgba(255,255,255,0.98)',
                'inset 0 -1px 0 rgba(174,154,194,0.10)',
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
                  if (!(currentView === 'private-space' && item.id === 'add-memory')) {
                    window.dispatchEvent(new CustomEvent('te:prefetch', { detail: { view: item.id } }));
                  }
                }}
                onClick={() => handleNavTap(item.id)}
                className="relative flex items-center justify-center outline-none touch-manipulation select-none"
                style={{ width: BTN, height: BTN, zIndex: 1, flex: '1 1 0', minWidth: 0 }}
                aria-label={currentView === 'private-space' && item.id === 'add-memory' ? 'Add private item' : item.label}
                {...(item.id === 'daily-moments' ? { 'data-coachmark': 'daily-moments' } : {})}
              >
                {item.isCenter ? (
                  /* Add orb — neumorphic raised with pastel halo (active).
                     CSS transition on transform replaces framer-motion's
                     whileTap spring; identical feel at zero JS cost. */
                  <div
                    data-coachmark="center-fab"
                    className="relative bn-fab"
                    style={{
                      width:          IND,
                      height:         IND,
                      borderRadius:   999,
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      background:     'linear-gradient(145deg, #ffffff, #f6f3fa)',
                      boxShadow: isAddActive
                        ? [
                            '0 10px 20px rgba(90,82,102,0.14)',
                            '0 3px 8px rgba(90,82,102,0.07)',
                            'inset 0 1.5px 0 rgba(255,255,255,0.98)',
                            'inset 0 -1px 0 rgba(174,154,194,0.10)',
                          ].join(', ')
                        : [
                            '0 6px 14px rgba(90,82,102,0.10)',
                            '0 2px 5px rgba(90,82,102,0.05)',
                            'inset 0 1.5px 0 rgba(255,255,255,0.96)',
                          ].join(', '),
                    }}
                  >
                    <Plus size={22} strokeWidth={2.1} color={isAddActive ? '#8e78a2' : '#a89cb8'} />
                  </div>

                ) : (
                  /* Regular icon — pure CSS spring on transform (compositor
                     thread). No framer-motion solver, no per-frame React
                     reconciliation. The .bn-icon class declares the cubic
                     easing that mimics the stiffness/damping spring. */
                  <div
                    className={`relative flex items-center justify-center bn-icon ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.15 : 1.7}
                      fill={isActive ? 'currentColor' : 'none'}
                      fillOpacity={isActive ? 0.1 : 0}
                      style={{
                        color: isActive ? '#8e78a2' : '#a89cb8',
                        transition: 'color 0.06s linear',
                      }}
                    />
                    {item.hasNotification && !isActive && (
                      <div className="absolute -top-0.5 -right-0.5">
                        <Heart size={6} className="text-lior-400 fill-lior-400 animate-breathe" />
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}) as React.FC<BottomNavProps>;

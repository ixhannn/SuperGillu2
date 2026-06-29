import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import type { ViewState } from '../types';
import { StorageService } from '../services/storage';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { daysTogetherFrom } from '../shared/dateOnly.js';
import { EASE_SILK, sheetVariants, scrimVariants, prefersReducedMotion } from '../utils/motion';
import { initPremiumSky, type SkyState } from '../components/premium/worlds/premiumSky';
import {
  PW_FEATURES,
  GemGlyph,
  LockGlyph,
  ChevronGlyph,
  type PremiumFeature,
} from '../components/premium/worlds/glyphs';
import '../styles/premium-worlds.css';

interface PremiumWorldsProps {
  setView: (view: ViewState) => void;
}

/* The screen ships in the design's resting "dusk / indigo" atmosphere. The
 * prototype's Tweaks panel (atmosphere / accent / font switching) is a design
 * tool and is intentionally not part of the production screen. */
const ATMOSPHERE = 'dusk';
const ACCENT = 'indigo';
const ACCENT_HEXES: [string, string, string] = ['#8b8ff6', '#c4b5fd', '#f4a9d0'];

/* The design's title font (Hanken Grotesk) is not in the app's global font set.
 * Inject it once, lazily, when this premium screen first mounts — keeping it off
 * every other screen's first-paint font budget. */
const HANKEN_HREF =
  'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap';
let hankenRequested = false;
function ensureHankenFont(): void {
  if (hankenRequested || typeof document === 'undefined') return;
  hankenRequested = true;
  if (document.querySelector(`link[href="${HANKEN_HREF}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HANKEN_HREF;
  document.head.appendChild(link);
}

const initialOf = (name: string | undefined, fallback: string): string => {
  const ch = name?.trim()?.[0];
  return ch ? ch.toUpperCase() : fallback;
};

/* Entrance — the design's copyIn (rise + fade), expressed as a framer stagger
 * so it honours reduced-motion automatically via the resting variant. */
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
};
const riseVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_SILK } },
};

const BackChevron: React.FC = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const PremiumWorlds: React.FC<PremiumWorldsProps> = ({ setView }) => {
  const skyRef = useRef<HTMLCanvasElement>(null);
  const skyState = useRef<SkyState>({ hexes: ACCENT_HEXES, motion: 7, dawn: ATMOSPHERE !== 'dusk' });

  const [profile] = useState(() => StorageService.getCoupleProfile());
  const [selected, setSelected] = useState<PremiumFeature | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => { ensureHankenFont(); }, []);
  useEffect(() => {
    const stop = initPremiumSky(skyRef.current, skyState.current);
    return stop;
  }, []);

  const initials = useMemo<[string, string]>(
    () => [initialOf(profile.myName, 'Y'), initialOf(profile.partnerName, '&')],
    [profile.myName, profile.partnerName],
  );
  const days = useMemo(() => {
    const n = daysTogetherFrom(profile.anniversaryDate);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [profile.anniversaryDate]);

  const goBack = useCallback(() => {
    feedback.tap();
    setView('home');
  }, [setView]);

  const openFeature = useCallback((feature: PremiumFeature, e: React.MouseEvent<HTMLButtonElement>) => {
    feedback.tap();
    triggerRef.current = e.currentTarget;
    setSelected(feature);
  }, []);
  const closeSheet = useCallback(() => {
    feedback.tapSilent();
    setSelected(null);
  }, []);

  const notifyMe = useCallback((feature: PremiumFeature) => {
    feedback.confirm();
    toast.show(`We'll let you know the moment ${feature.title} opens.`, 'bell');
    setSelected(null);
  }, []);

  // ── Modal a11y: lock the background (inert), trap focus in the sheet, close on
  // Escape, and restore focus to the tile that opened it. ──────────────────────
  useEffect(() => {
    const content = contentRef.current;
    if (!selected) {
      if (content) content.inert = false;
      return;
    }
    if (content) content.inert = true;

    const focusablesIn = (root: HTMLElement | null): HTMLElement[] =>
      root
        ? Array.from(root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          )).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
        : [];

    // Move focus into the sheet once it has mounted/painted.
    const focusTimer = window.setTimeout(() => {
      const first = focusablesIn(sheetRef.current)[0];
      (first ?? sheetRef.current)?.focus?.();
    }, 60);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusablesIn(sheetRef.current);
      if (f.length === 0) { e.preventDefault(); return; }
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? f.indexOf(active) : -1;
      if (e.shiftKey && idx <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (idx === -1 || idx === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      if (content) content.inert = false;
    };
  }, [selected, closeSheet]);

  // Restore focus to the opener after the sheet closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (selected) { wasOpen.current = true; return; }
    if (wasOpen.current) {
      wasOpen.current = false;
      const el = triggerRef.current;
      triggerRef.current = null;
      window.setTimeout(() => el?.focus?.(), 0);
    }
  }, [selected]);

  const reduced = prefersReducedMotion();
  const animProps = reduced
    ? {}
    : { variants: containerVariants, initial: 'hidden' as const, animate: 'visible' as const };

  return (
    <div className="pw-root" data-atmo={ATMOSPHERE} data-accent={ACCENT}>
      <div className="pw-aurora" aria-hidden />
      <canvas className="pw-sky" ref={skyRef} aria-hidden />
      <div className="pw-vignette" aria-hidden />
      <div className="pw-toplight" aria-hidden />
      <div className="pw-grain" aria-hidden />

      <div className="pw-content" ref={contentRef}>
        <div className="pw-topnav">
          <button type="button" className="pw-navbtn" onClick={goBack} aria-label="Go back">
            <BackChevron />
          </button>
          <span className="pw-eyebrow">
            <span className="pw-gem"><GemGlyph /></span>
            Premium
          </span>
          <span className="pw-navspacer" aria-hidden />
        </div>

        <div className="pw-body">
          <motion.div className="pw-bento" {...animProps}>
            <div className="pw-bento-head">
              <motion.h1 variants={reduced ? undefined : riseVariants}>Your World</motion.h1>
              <motion.p variants={reduced ? undefined : riseVariants}>
                Three premium spaces, growing with the two of you.
              </motion.p>
            </div>

            <div className="pw-grid">
              <motion.div className="pw-tile pw-hero" variants={reduced ? undefined : riseVariants}>
                <span className="pw-mesh" aria-hidden />
                <span className="pw-sheen" aria-hidden />
                <span className="pw-veil" aria-hidden />
                <div className="pw-heroorbs">
                  <span className="pw-ho a">{initials[0]}</span>
                  <span className="pw-ho b">{initials[1]}</span>
                </div>
                <div className="pw-herometa">
                  <span className="pw-hk">Your bond</span>
                  {days >= 1
                    ? <b>{days.toLocaleString()}<i>{days === 1 ? 'day' : 'days'}</i></b>
                    : <b>Day<i>one</i></b>}
                  <span className="pw-hs">together &amp; counting</span>
                </div>
              </motion.div>

              {PW_FEATURES.map((f, i) => {
                const Glyph = f.glyph;
                const span2 = i === 0;
                return (
                  <motion.button
                    type="button"
                    key={f.id}
                    className={'pw-tile pw-feat' + (span2 ? ' pw-span2' : '')}
                    data-feat={f.id}
                    onClick={(e) => openFeature(f, e)}
                    aria-label={`${f.title} — coming soon`}
                    aria-haspopup="dialog"
                    variants={reduced ? undefined : riseVariants}
                  >
                    <span className="pw-mesh" aria-hidden />
                    <span className="pw-sheen" aria-hidden />
                    <span className="pw-veil" aria-hidden />
                    <span className="pw-orb">
                      <Glyph s={26} />
                    </span>
                    <span className="pw-tilebody">
                      <span className="pw-soon"><span className="pw-lk"><LockGlyph s={9} /></span> Soon</span>
                      <span className="pw-title">{f.title}</span>
                      <span className="pw-desc">{f.short}</span>
                    </span>
                    <span className="pw-go"><ChevronGlyph s={15} /></span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {selected && (
            <React.Fragment>
              <motion.div
                className="pw-scrim"
                variants={scrimVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                onClick={closeSheet}
                aria-hidden
              />
              <motion.div
                ref={sheetRef}
                tabIndex={-1}
                className="pw-sheet"
                style={{ '--fa': selected.aura } as React.CSSProperties}
                variants={sheetVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                role="dialog"
                aria-modal="true"
                aria-label={selected.title}
              >
              <span className="pw-grip" aria-hidden />
              <span className="pw-shglow" aria-hidden />
              <div className="pw-shtop">
                <div className="pw-shglyph"><selected.glyph s={26} /></div>
                <div>
                  <h3>{selected.title}</h3>
                  <span className="pw-shsoon"><LockGlyph s={10} /> Coming soon</span>
                </div>
              </div>
              <p>{selected.long}</p>
              <button type="button" className="pw-cta" onClick={() => notifyMe(selected)}>
                <LockGlyph s={14} /> Notify me when it opens
              </button>
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default PremiumWorlds;

/**
 * CoachmarkSystem - first-run guided tour with route awareness.
 *
 * Design goals:
 * - move to the correct route before presenting a step
 * - avoid broken spotlights when targets are occluded by the nav, keyboard, or another layer
 * - fall back to richer card steps when a live spotlight is not safe to show
 * - keep copy consistent: what it is, why it matters, what to do now
 * - prefer action-led CTAs instead of passive "Next" buttons
 */

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { FeatureDiscovery } from '../services/featureDiscovery';
import { Haptics } from '../services/haptics';
import { CoachmarkInsights, buildCoachmarkPreloadViews } from '../services/coachmarkInsights.js';
import { NavigationOptions, ViewState } from '../types';
import { readThemeRgbTriplet, readThemeVar } from '../utils/themeVars';
import { observeDocumentAttributes } from '../utils/documentObserverBus';
import { useRelationship } from '../hooks/useRelationship';

export type CoachmarkMode = 'spotlight' | 'card';
type PreviewKind =
  | 'capture'
  | 'moments'
  | 'countdowns'
  | 'letters'
  | 'bonsai'
  | 'aura'
  | 'themes'
  | 'music';
type BubblePlacement = 'above' | 'below';

export interface CoachmarkDef {
  key: string;
  title: string;
  emoji: string;
  mode?: CoachmarkMode;
  route?: ViewState;
  actionView?: ViewState;
  actionLabel: string;
  actionAdvanceDelay?: number;
  calloutPosition?: 'above' | 'below' | 'auto';
  accentColor?: string;
  gradient?: string;
  where?: string;
  preview: PreviewKind;
  whatIs: string;
  whyItMatters: string;
  doThisNow: string;
  fallbackToCard?: boolean;
}

export const COACHMARKS: CoachmarkDef[] = [
  {
    key: 'center-fab',
    title: 'Capture every moment',
    emoji: '📸',
    actionLabel: 'Open composer',
    actionView: 'add-memory',
    calloutPosition: 'above',
    accentColor: '#fb7185',
    gradient: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
    where: 'Bottom nav',
    preview: 'capture',
    whatIs: 'This is the fastest way to add a memory, note, or feeling from anywhere in the app.',
    whyItMatters: 'The app gets better as your shared story fills up. This is the button you will use most.',
    doThisNow: 'Tap it once so you know where new memories start.',
    fallbackToCard: true,
  },
  {
    key: 'daily-moments',
    title: 'Daily Moments',
    emoji: '🌆',
    actionLabel: 'Open Daily Moments',
    actionView: 'daily-moments',
    calloutPosition: 'above',
    accentColor: '#38bdf8',
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
    where: 'Bottom nav',
    preview: 'moments',
    whatIs: 'Daily Moments is your private 24-hour story for the two of you.',
    whyItMatters: 'It captures the tiny things that matter today without turning everything into permanent archive.',
    doThisNow: 'Open it and imagine the kind of everyday photo you would drop here first.',
    fallbackToCard: true,
  },
  {
    key: 'countdowns',
    title: 'Count down together',
    emoji: '⏳',
    route: 'home',
    actionLabel: 'Open countdowns',
    actionView: 'countdowns',
    calloutPosition: 'below',
    accentColor: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
    where: 'Home',
    preview: 'countdowns',
    whatIs: 'This card keeps your next important date or plan visible at a glance.',
    whyItMatters: 'Shared anticipation creates rhythm. Trips, anniversaries, and plans feel closer when you see them often.',
    doThisNow: 'Open countdowns and picture the first event you would add.',
    fallbackToCard: true,
  },
  {
    key: 'open-when',
    title: 'Open When letters',
    emoji: '💌',
    route: 'home',
    actionLabel: 'Open letters',
    actionView: 'open-when',
    calloutPosition: 'below',
    accentColor: '#60a5fa',
    gradient: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
    where: 'Home',
    preview: 'letters',
    whatIs: 'Open When lets you write letters for specific moods or moments.',
    whyItMatters: 'It gives comfort in advance. The right note can already be waiting when one of you needs it.',
    doThisNow: 'Open the feature and think of one message worth saving for later.',
    fallbackToCard: true,
  },
  {
    key: 'bonsai',
    title: 'Your shared Bonsai',
    emoji: '🌱',
    route: 'home',
    actionLabel: 'See the bonsai',
    actionView: 'bonsai-bloom',
    calloutPosition: 'below',
    accentColor: '#34d399',
    gradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
    where: 'Home',
    preview: 'bonsai',
    whatIs: 'A calm little tree that quietly grows the longer you’ve been together.',
    whyItMatters: 'It’s a quiet place to glance at — nothing to tend, just your time together made visible.',
    doThisNow: 'Open the bonsai whenever you’d like a calm look at how far you’ve come.',
    fallbackToCard: true,
  },
  {
    key: 'aura-signal',
    title: 'Pulse',
    emoji: '✨',
    mode: 'card',
    route: 'us',
    actionLabel: 'Try Pulse',
    actionView: 'aura-signal',
    actionAdvanceDelay: 260,
    accentColor: '#818cf8',
    gradient: 'linear-gradient(140deg, #1e1b4b 0%, #4f46e5 45%, #fbbf24 100%)',
    where: 'Us -> Pulse',
    preview: 'aura',
    whatIs: 'Pulse is a soft, wordless ping you can send instantly.',
    whyItMatters: 'Not every moment needs a message. Sometimes a small signal says enough.',
    doThisNow: 'Send one safe test signal so you know how quickly it feels.',
  },
  {
    key: 'theme-picker',
    title: 'Make it feel like you',
    emoji: '🎨',
    mode: 'card',
    route: 'profile',
    actionLabel: 'Open Aesthetic Studio',
    actionView: 'profile',
    accentColor: '#a855f7',
    gradient: 'linear-gradient(140deg, #2d1b4e 0%, #7c3aed 45%, #ec4899 100%)',
    where: 'Profile -> Aesthetic Studio',
    preview: 'themes',
    whatIs: 'Aesthetic Studio changes the whole mood of your shared space with handcrafted themes.',
    whyItMatters: 'A visual tone changes how the app feels every day, not just how it looks once.',
    doThisNow: 'Open the studio and notice how different palettes change the room instantly.',
  },
  {
    key: 'together-music',
    title: 'Your song, always playing',
    emoji: '🎵',
    mode: 'card',
    route: 'profile',
    actionLabel: 'Open music setup',
    actionView: 'profile',
    accentColor: '#f97316',
    gradient: 'linear-gradient(140deg, #1c1917 0%, #c2410c 45%, #fbbf24 100%)',
    where: 'Profile -> Aesthetic Studio',
    preview: 'music',
    whatIs: 'Together Music lets you upload the track that belongs to both of you.',
    whyItMatters: 'A shared song changes the emotional texture of the app more than any single visual setting.',
    doThisNow: 'Open the setup so you know where your soundtrack lives when you are ready.',
  },
];

// Short, playful one-liners — the whole pitch for a feature in a single breath.
const TAGLINES: Record<string, string> = {
  'center-fab': 'Tap the ➕ to save a photo, note, or feeling in seconds. ✨',
  'daily-moments': 'Drop a little photo story that quietly disappears by midnight. 🌙',
  'countdowns': 'Pin your next big day in sight and savour the build-up together. ⏳',
  'open-when': 'Write letters now that unlock on the exact day they’re needed. 💌',
  'bonsai': 'A calm little tree that quietly grows with your days together. 🌱',
  'aura-signal': 'Send a wordless “thinking of you” that lands on their phone instantly. 💫',
  'theme-picker': 'Repaint your whole shared space with a handcrafted theme. 🎨',
  'together-music': 'Pick the one song that belongs to just the two of you. 🎶',
};

// Solo overrides — shown before a partner is linked, so the tour never promises
// a "two of you" experience the user can't reach yet. Only keys whose default
// copy assumes a present partner need an entry; everything else falls through to
// TAGLINES unchanged.
const SOLO_TAGLINES: Record<string, string> = {
  'daily-moments': 'Drop a little photo story that quietly disappears by midnight — ready to share once you connect. 🌙',
  'countdowns': 'Pin your next big day in sight and savour the build-up — together once you connect. ⏳',
  'bonsai': 'A calm little tree that quietly grows with your days together, once you connect. 🌱',
  'aura-signal': 'A wordless “thinking of you” you can send the moment you connect. 💫',
  'theme-picker': 'Repaint your whole space with a handcrafted theme — ready to share once you connect. 🎨',
  'together-music': 'Pick the song that will belong to just the two of you once you connect. 🎶',
};

const taglineFor = (def: CoachmarkDef, isLinked: boolean): string => {
  if (!isLinked && SOLO_TAGLINES[def.key]) return SOLO_TAGLINES[def.key];
  return TAGLINES[def.key] ?? def.whatIs;
};

interface CoachmarkCtx {
  triggerCoachmark: (key: string) => void;
  triggerTour: () => void;
  dismissAll: () => void;
}

const CoachmarkContext = createContext<CoachmarkCtx>({
  triggerCoachmark: () => {},
  triggerTour: () => {},
  dismissAll: () => {},
});

export const useCoachmark = () => useContext(CoachmarkContext);

const SPOTLIGHT_PAD = 12;
const TARGET_WAIT_MS = 80;
const TARGET_WAIT_ATTEMPTS = 4;
const ROUTE_WAIT_ATTEMPTS = 8;
const ROUTE_WAIT_MS = 70;
const SLOW_ROUTE_WAIT_MS = 280;

interface SpotlightState {
  rect: DOMRect;
  def: CoachmarkDef;
}

interface ActiveStep {
  def: CoachmarkDef;
  queue: CoachmarkDef[];
  stepIndex: number;
  total: number;
  renderMode: CoachmarkMode;
  spotlight: SpotlightState | null;
  shownAt: number;
  enterMode: 'start' | 'next' | 'upgrade';
}

interface DeferredResume {
  queue: CoachmarkDef[];
  stepIndex: number;
  total: number;
  waitForExitFrom: ViewState;
  celebrateOnExit: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

const settleUi = async (frames = 2) => {
  for (let i = 0; i < frames; i += 1) {
    await nextFrame();
  }
};

const findCoachmarkTarget = (key: string) =>
  document.querySelector<HTMLElement>(`[data-coachmark="${key}"]`);

const getOcclusionBounds = () => {
  const visualTop = window.visualViewport?.offsetTop ?? 0;
  const visualBottom = window.visualViewport
    ? window.visualViewport.offsetTop + window.visualViewport.height
    : window.innerHeight;
  const navTop = document
    .querySelector<HTMLElement>('[data-tour-occluder="bottom-nav"]')
    ?.getBoundingClientRect().top;

  return {
    top: visualTop + 16,
    bottom: Math.min(navTop ?? window.innerHeight, visualBottom) - 16,
  };
};

const clampPoint = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const targetIsUncovered = (target: HTMLElement, rect: DOMRect) => {
  const bounds = getOcclusionBounds();
  if (rect.top < bounds.top || rect.bottom > bounds.bottom) return false;
  if (rect.width <= 0 || rect.height <= 0) return false;

  const sampleXs = [rect.left + rect.width * 0.25, rect.left + rect.width * 0.5, rect.left + rect.width * 0.75];
  const sampleYs = [rect.top + rect.height * 0.25, rect.top + rect.height * 0.5, rect.top + rect.height * 0.75];

  for (const x of sampleXs) {
    for (const y of sampleYs) {
      const clampedX = clampPoint(x, 8, window.innerWidth - 8);
      const clampedY = clampPoint(y, 8, window.innerHeight - 8);
      const topElement = document.elementFromPoint(clampedX, clampedY);
      if (!topElement) return false;
      if (target === topElement || target.contains(topElement)) return true;
    }
  }

  return false;
};

const measureSpotlight = (def: CoachmarkDef): SpotlightState | null => {
  const target = findCoachmarkTarget(def.key);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (!targetIsUncovered(target, rect)) return null;
  return { rect, def };
};

const ensureSpotlightReady = async (def: CoachmarkDef): Promise<{ spotlight: SpotlightState | null; reason: 'ready' | 'missing' | 'occluded' }> => {
  let sawTarget = false;
  let occluded = false;

  for (let attempt = 0; attempt < TARGET_WAIT_ATTEMPTS; attempt += 1) {
    const target = findCoachmarkTarget(def.key);
    if (!target) {
      await sleep(TARGET_WAIT_MS);
      continue;
    }

    sawTarget = true;
    let rect = target.getBoundingClientRect();
    const bounds = getOcclusionBounds();
    const targetCenter = rect.top + rect.height / 2;
    const safeCenter = bounds.top + (bounds.bottom - bounds.top) / 2;

    if (rect.top < bounds.top + 12 || rect.bottom > bounds.bottom - 12) {
      if (attempt === 0 && Math.abs(targetCenter - safeCenter) > 28) {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      } else {
        const delta = targetCenter - safeCenter;
        window.scrollBy({ top: delta, behavior: 'auto' });
      }
      await settleUi();
      rect = target.getBoundingClientRect();
    }

    if (targetIsUncovered(target, rect)) {
      return { spotlight: { rect, def }, reason: 'ready' };
    }

    occluded = true;
    await sleep(TARGET_WAIT_MS);
  }

  return { spotlight: null, reason: occluded || sawTarget ? 'occluded' : 'missing' };
};

const chooseSpotlightLayout = (rect: DOMRect, preferred?: 'above' | 'below' | 'auto') => {
  const bounds = getOcclusionBounds();
  const availableAbove = rect.top - bounds.top - 16;
  const availableBelow = bounds.bottom - rect.bottom - 16;
  const compact = rect.width > window.innerWidth * 0.52 || Math.min(availableAbove, availableBelow) < 190 || window.innerWidth < 390;
  const preferredPlacement: BubblePlacement = preferred && preferred !== 'auto'
    ? preferred
    : availableBelow >= availableAbove
      ? 'below'
      : 'above';
  const minHeight = compact ? 200 : 238;
  const placement: BubblePlacement =
    preferredPlacement === 'below' && availableBelow >= minHeight
      ? 'below'
      : preferredPlacement === 'above' && availableAbove >= minHeight
        ? 'above'
        : availableBelow >= availableAbove
          ? 'below'
          : 'above';

  return {
    bounds,
    compact,
    placement,
    bubbleWidth: compact ? Math.min(274, window.innerWidth - 32) : Math.min(324, window.innerWidth - 32),
  };
};

// Playful stretch-dots — the active step elongates into a pill.
const ProgressBar: React.FC<{ step: number; total: number; accent?: string }> = ({ step, total, accent }) => {
  const a = accent || '#e879f9';
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ width: i === step ? 20 : 6, opacity: i <= step ? 1 : 0.32 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          style={{
            height: 6,
            borderRadius: 100,
            display: 'block',
            background: i <= step ? a : 'rgba(0,0,0,0.16)',
            boxShadow: i === step ? `0 0 8px ${a}88` : 'none',
          }}
        />
      ))}
    </div>
  );
};

const STEP_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const getCardPanelMotion = (enterMode: ActiveStep['enterMode']) => {
  if (enterMode === 'next') {
    return {
      initial: { opacity: 0, x: 20, y: 6, scale: 0.985 },
      animate: { opacity: 1, x: 0, y: 0, scale: 1 },
      exit: { opacity: 0, x: -18, y: -4, scale: 0.985 },
      transition: { duration: 0.26, ease: STEP_EASE },
    };
  }

  if (enterMode === 'upgrade') {
    return {
      initial: { opacity: 0, y: 10, scale: 0.975 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: -6, scale: 0.985 },
      transition: { duration: 0.22, ease: STEP_EASE },
    };
  }

  return {
    initial: { opacity: 0, y: 28, scale: 0.955 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -10, scale: 0.985 },
    transition: { duration: 0.3, ease: STEP_EASE },
  };
};

const getSpotlightBubbleMotion = (enterMode: ActiveStep['enterMode'], placement: BubblePlacement) => {
  if (enterMode === 'next') {
    return {
      initial: { opacity: 0, x: 18, y: placement === 'above' ? 6 : -6, scale: 0.985 },
      animate: { opacity: 1, x: 0, y: 0, scale: 1 },
      exit: { opacity: 0, x: -14, scale: 0.985 },
      transition: { duration: 0.24, ease: STEP_EASE },
    };
  }

  if (enterMode === 'upgrade') {
    return {
      initial: { opacity: 0, y: placement === 'above' ? 6 : -6, scale: 0.97 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, scale: 0.985 },
      transition: { duration: 0.2, ease: STEP_EASE },
    };
  }

  return {
    initial: { opacity: 0, y: placement === 'above' ? 12 : -12, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: placement === 'above' ? -8 : 8, scale: 0.985 },
    transition: { duration: 0.28, ease: STEP_EASE },
  };
};

interface PreviewTheme {
  bgMain: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  particleRgb: string;
  accentRgb: string;
  centerBg: string;
  floatingAccent: string;
}

const getPreviewTheme = (accent: string): PreviewTheme => ({
  bgMain: readThemeVar('--theme-bg-main', 'linear-gradient(180deg, #1c1320, #120d16)'),
  surface: readThemeVar('--color-surface', 'rgba(255,255,255,0.08)'),
  border: readThemeVar('--theme-nav-glass-border', 'rgba(255,255,255,0.12)'),
  textPrimary: readThemeVar('--color-text-primary', '#ffffff'),
  textSecondary: readThemeVar('--color-text-secondary', 'rgba(255,255,255,0.72)'),
  particleRgb: readThemeRgbTriplet('--theme-particle-2-rgb', '251,113,133'),
  accentRgb: readThemeRgbTriplet('--theme-floating-accent', '251,113,133'),
  centerBg: readThemeVar('--theme-nav-center-bg-active', accent),
  floatingAccent: readThemeVar('--theme-floating-accent', accent),
});

// Refined feature emblem — a frosted tile wrapped in a colored gradient ring,
// with the glyph crisp on near-white, a glossy sheen, an accent wash and a soft
// glow. Floats calmly (no wobble). GPU-only motion, flicker-free.
const HeroPreview: React.FC<{ accent: string; gradient?: string; emoji?: string; large?: boolean }> = ({ accent, gradient, emoji, large = false }) => {
  const wrap = large ? 152 : 78;
  const tile = large ? 110 : 62;
  const glyph = large ? 56 : 32;
  const radius = large ? 32 : 19;
  const ring = large ? 3 : 2;
  const grad = gradient ?? `linear-gradient(145deg, ${accent} 0%, ${accent}bf 100%)`;
  const dots = [
    { top: '2%', left: '18%', s: 9 },
    { top: '14%', left: '82%', s: 6 },
    { top: '70%', left: '6%', s: 7 },
    { top: '80%', left: '85%', s: 10 },
  ];
  return (
    <div style={{ position: 'relative', width: '100%', height: wrap, display: 'grid', placeItems: 'center' }}>
      {/* layered ambient glow */}
      <div style={{ position: 'absolute', width: large ? 168 : 100, height: large ? 168 : 100, borderRadius: '50%', background: `radial-gradient(circle, ${accent}33 0%, transparent 68%)`, pointerEvents: 'none' }} />
      {/* floating confetti (large only) */}
      {large && dots.map((d, i) => (
        <motion.span
          key={i}
          animate={{ y: [0, -7, 0], opacity: [0.4, 0.95, 0.4] }}
          transition={{ duration: 2.8 + i * 0.45, repeat: Infinity, ease: 'easeInOut', delay: i * 0.35 }}
          style={{ position: 'absolute', top: d.top, left: d.left, width: d.s, height: d.s, borderRadius: '50%', background: i % 2 ? accent : `${accent}80`, pointerEvents: 'none' }}
        />
      ))}
      {/* gradient-ring frosted tile (padding-box trick) */}
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'relative',
          width: tile, height: tile, borderRadius: radius, padding: ring,
          background: grad,
          boxShadow: `0 22px 44px ${accent}55, 0 6px 14px ${accent}38`,
        }}
      >
        {/* inner frosted face */}
        <div
          style={{
            position: 'relative',
            width: '100%', height: '100%',
            borderRadius: radius - ring,
            background: 'linear-gradient(160deg, #ffffff 0%, #fdf4f8 100%)',
            display: 'grid', placeItems: 'center', overflow: 'hidden',
            boxShadow: 'inset 0 1px 0 #fff',
          }}
        >
          {/* accent tint wash */}
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 100% at 50% 0%, ${accent}22 0%, transparent 62%)`, pointerEvents: 'none' }} />
          {/* glossy sheen */}
          <div style={{ position: 'absolute', insetInline: 0, top: 0, height: '46%', background: 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, transparent 100%)', pointerEvents: 'none' }} />
          <span style={{ position: 'relative', fontSize: glyph, lineHeight: 1, filter: `drop-shadow(0 3px 6px ${accent}55)` }}>{emoji ?? '✨'}</span>
        </div>
      </motion.div>
    </div>
  );
};

const FeaturePreview: React.FC<{ kind: PreviewKind; accent: string; large?: boolean; emoji?: string; gradient?: string }> = ({ accent, large = false, emoji, gradient }) => {
  return <HeroPreview accent={accent} gradient={gradient} emoji={emoji} large={large} />;
};

const CopyBlock: React.FC<{ label: string; text: string; accent: string }> = ({ label, text, accent }) => (
  <div style={{ position: 'relative', paddingLeft: 12 }}>
    <span style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: 3, borderRadius: 100, background: `linear-gradient(180deg, ${accent}, ${accent}44)` }} />
    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, marginBottom: 3 }}>
      {label}
    </p>
    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: 0 }}>
      {text}
    </p>
  </div>
);

const StepChrome: React.FC<{
  def: CoachmarkDef;
  stepIndex: number;
  total: number;
  children: React.ReactNode;
  onSkip: () => void;
}> = ({ def, stepIndex, total, children, onSkip }) => {
  const accent = def.accentColor ?? '#e879f9';
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent }}>
          {String(stepIndex + 1).padStart(2, '0')} · {String(total).padStart(2, '0')}
        </span>
        <button onClick={onSkip} style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', opacity: 0.75, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          Skip tour
        </button>
      </div>
      <ProgressBar step={stepIndex} total={total} accent={accent} />
      {children}
    </>
  );
};

const SpotlightStep: React.FC<{
  state: SpotlightState;
  stepIndex: number;
  total: number;
  onAction: () => void;
  onNext: () => void;
  onSkip: () => void;
  pendingIntent: 'next' | 'action' | null;
  enterMode: ActiveStep['enterMode'];
  isLinked: boolean;
}> = ({ state, stepIndex, total, onAction, onNext, onSkip, pendingIntent, enterMode, isLinked }) => {
  const { rect, def } = state;
  const accent = def.accentColor ?? '#e879f9';
  const actionBusy = pendingIntent === 'action';
  const nextBusy = pendingIntent === 'next';
  const controlsDisabled = pendingIntent !== null;
  const sL = rect.left - SPOTLIGHT_PAD;
  const sT = rect.top - SPOTLIGHT_PAD;
  const sW = rect.width + SPOTLIGHT_PAD * 2;
  const sH = rect.height + SPOTLIGHT_PAD * 2;
  const sR = Math.min(sW / 2, sH / 2, 32);
  const { compact, placement, bubbleWidth } = chooseSpotlightLayout(rect, def.calloutPosition);
  const bubbleMotion = getSpotlightBubbleMotion(enterMode, placement);
  const bounds = getOcclusionBounds();
  const bubbleLeft = Math.max(16, Math.min(sL + sW / 2 - bubbleWidth / 2, window.innerWidth - bubbleWidth - 16));
  const bubbleTop = placement === 'below' ? Math.min(sT + sH + 16, bounds.bottom - (compact ? 220 : 260)) : undefined;
  const bubbleBottom = placement === 'above' ? Math.max(window.innerHeight - sT + 16, window.innerHeight - bounds.bottom + 16) : undefined;
  const arrowLeft = Math.max(16, Math.min(sL + sW / 2 - bubbleLeft - 5, bubbleWidth - 26));

  return createPortal(
    <motion.div
      key={def.key}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: STEP_EASE }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483640 }}
    >
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <mask id={`cm-mask-${def.key}`}>
            <rect width="100%" height="100%" fill="white" />
            <rect x={sL} y={sT} width={sW} height={sH} rx={sR} ry={sR} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(28,15,26,0.52)" mask={`url(#cm-mask-${def.key})`} />
      </svg>

      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.88, 0.22, 0.88] }}
        transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          left: sL - 7,
          top: sT - 7,
          width: sW + 14,
          height: sH + 14,
          borderRadius: sR + 7,
          border: `1.5px solid ${accent}`,
          boxShadow: `0 0 26px ${accent}66, 0 0 48px ${accent}22`,
          pointerEvents: 'none',
        }}
      />

      <motion.div
        initial={bubbleMotion.initial}
        animate={bubbleMotion.animate}
        exit={bubbleMotion.exit}
        transition={bubbleMotion.transition}
        style={{
          position: 'absolute',
          left: bubbleLeft,
          width: bubbleWidth,
          ...(placement === 'below' ? { top: bubbleTop } : { bottom: bubbleBottom }),
          background: 'linear-gradient(172deg, rgba(255,255,255,0.985) 0%, rgba(255,249,251,0.965) 100%)',
          borderRadius: 24,
          padding: compact ? '15px 15px 16px' : '16px 17px 17px',
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: `0 26px 64px rgba(45,18,42,0.4), 0 0 0 1px ${accent}1f, inset 0 1px 0 rgba(255,255,255,0.95)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: arrowLeft,
            ...(placement === 'above' ? { bottom: -5 } : { top: -5 }),
            width: 10,
            height: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              background: 'rgba(255,250,252,0.98)',
              border: '1px solid rgba(0,0,0,0.05)',
              ...(placement === 'above'
                ? { bottom: 1, transform: 'rotate(45deg)', transformOrigin: 'bottom center' }
                : { top: 1, transform: 'rotate(45deg)', transformOrigin: 'top center' }),
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ProgressBar step={stepIndex} total={total} accent={accent} />
          <button disabled={controlsDisabled} onClick={onSkip} style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', opacity: controlsDisabled ? 0.4 : 0.7, background: 'none', border: 'none', cursor: controlsDisabled ? 'progress' : 'pointer', padding: 0 }}>
            Skip
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 72, flexShrink: 0 }}>
            <FeaturePreview kind={def.preview} accent={accent} emoji={def.emoji} gradient={def.gradient} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.15, margin: 0 }}>{def.title}</p>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '5px 0 0' }}>{taglineFor(def, isLinked)}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            disabled={controlsDisabled}
            onClick={onAction}
            onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.97)'}
            onPointerUp={(event) => event.currentTarget.style.transform = ''}
            onPointerLeave={(event) => event.currentTarget.style.transform = ''}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 14,
              background: def.gradient ?? `linear-gradient(135deg, ${accent} 0%, #a855f7 100%)`,
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              cursor: controlsDisabled ? 'progress' : 'pointer',
              boxShadow: `0 8px 22px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.35)`,
              opacity: controlsDisabled && !actionBusy ? 0.72 : 1,
              transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
            }}
          >
            {actionBusy ? 'Opening…' : def.actionLabel}
          </button>
          <button
            disabled={controlsDisabled}
            onClick={onNext}
            onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.97)'}
            onPointerUp={(event) => event.currentTarget.style.transform = ''}
            onPointerLeave={(event) => event.currentTarget.style.transform = ''}
            style={{
              padding: '12px 16px',
              borderRadius: 14,
              background: 'rgba(0,0,0,0.045)',
              border: '1px solid rgba(0,0,0,0.08)',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              fontWeight: 700,
              cursor: controlsDisabled ? 'progress' : 'pointer',
              opacity: controlsDisabled && !nextBusy ? 0.64 : 1,
              transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
            }}
          >
            {nextBusy ? '…' : 'Next'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
};

const CardStep: React.FC<{
  def: CoachmarkDef;
  stepIndex: number;
  total: number;
  onAction: () => void;
  onNext: () => void;
  onSkip: () => void;
  pendingIntent: 'next' | 'action' | null;
  enterMode: ActiveStep['enterMode'];
  isLinked: boolean;
}> = ({ def, stepIndex, total, onAction, onNext, onSkip, pendingIntent, enterMode, isLinked }) => {
  const accent = def.accentColor ?? '#a855f7';
  const actionBusy = pendingIntent === 'action';
  const nextBusy = pendingIntent === 'next';
  const controlsDisabled = pendingIntent !== null;
  const panelMotion = getCardPanelMotion(enterMode);

  return createPortal(
    <motion.div
      key={def.key}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: STEP_EASE }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483640,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at 50% 30%, rgba(38,24,44,0.86) 0%, rgba(10,6,14,0.92) 72%)',
      }}
    >
      <motion.div
        initial={panelMotion.initial}
        animate={panelMotion.animate}
        exit={panelMotion.exit}
        transition={panelMotion.transition}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 30,
          overflow: 'hidden',
          background: 'linear-gradient(172deg, rgba(255,255,255,0.985) 0%, rgba(255,248,251,0.965) 100%)',
          boxShadow: `0 44px 100px rgba(45,18,42,0.45), 0 0 0 1px rgba(255,255,255,0.8), 0 22px 60px ${accent}33`,
        }}
      >
        <div style={{ padding: '16px 22px 22px' }}>
          {/* top: playful dots + skip */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <ProgressBar step={stepIndex} total={total} accent={accent} />
            <button disabled={controlsDisabled} onClick={onSkip} style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', opacity: controlsDisabled ? 0.4 : 0.7, background: 'none', border: 'none', cursor: controlsDisabled ? 'progress' : 'pointer', padding: 0 }}>
              Skip
            </button>
          </div>

          {/* emblem */}
          <div style={{ marginTop: 6 }}>
            <FeaturePreview kind={def.preview} accent={accent} emoji={def.emoji} gradient={def.gradient} large />
          </div>

          {/* title + playful one-liner */}
          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.1, letterSpacing: '-0.01em', margin: 0 }}>{def.title}</h2>
            <p style={{ fontSize: 15.5, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '9px auto 0', maxWidth: '17.5rem' }}>{taglineFor(def, isLinked)}</p>
          </div>

          {/* where pill */}
          {def.where && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: accent, background: `${accent}14`, border: `1px solid ${accent}2e`, borderRadius: 999, padding: '6px 13px' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
                {def.where}
              </span>
            </div>
          )}

          {/* actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              disabled={controlsDisabled}
              onClick={onAction}
              onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.97)'}
              onPointerUp={(event) => event.currentTarget.style.transform = ''}
              onPointerLeave={(event) => event.currentTarget.style.transform = ''}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: 16,
                background: def.gradient ?? `linear-gradient(135deg, ${accent}, #a855f7)`,
                border: 'none',
                color: '#fff',
                fontSize: 14.5,
                fontWeight: 800,
                cursor: controlsDisabled ? 'progress' : 'pointer',
                boxShadow: `0 10px 26px ${accent}59, inset 0 1px 0 rgba(255,255,255,0.4)`,
                opacity: controlsDisabled && !actionBusy ? 0.72 : 1,
                transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
              }}
            >
              {actionBusy ? 'Opening…' : def.actionLabel}
            </button>
            <button
              disabled={controlsDisabled}
              onClick={onNext}
              onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.97)'}
              onPointerUp={(event) => event.currentTarget.style.transform = ''}
              onPointerLeave={(event) => event.currentTarget.style.transform = ''}
              style={{
                minWidth: 92,
                padding: '14px',
                borderRadius: 16,
                background: 'rgba(0,0,0,0.045)',
                border: '1px solid rgba(0,0,0,0.08)',
                color: 'var(--color-text-secondary)',
                fontSize: 14.5,
                fontWeight: 700,
                cursor: controlsDisabled ? 'progress' : 'pointer',
                opacity: controlsDisabled && !nextBusy ? 0.64 : 1,
                transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
              }}
            >
              {nextBusy ? '…' : 'Next'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
};

const CelebrationStep: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483640,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--theme-bg-main)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
    >
      <motion.div
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 18, stiffness: 240 }}
        style={{ position: 'relative', textAlign: 'center', padding: '0 40px' }}
      >
        {/* floating hearts rising once */}
        {Array.from({ length: 7 }).map((_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 30, x: -120 + i * 40 }}
            animate={{ opacity: [0, 0.9, 0], y: -130 }}
            transition={{ delay: 0.2 + i * 0.12, duration: 2.2, ease: 'easeOut' }}
            style={{ position: 'absolute', left: '50%', top: '38%', fontSize: 13 + (i % 3) * 6, pointerEvents: 'none' }}
          >
            💗
          </motion.span>
        ))}
        {/* glowing medallion */}
        <motion.div
          initial={{ scale: 0, rotate: -16 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 220, delay: 0.05 }}
          style={{
            width: 104, height: 104, borderRadius: '50%', margin: '0 auto 24px',
            display: 'grid', placeItems: 'center', position: 'relative',
            background: 'linear-gradient(150deg, #ff8fb1 0%, #c4687e 100%)',
            boxShadow: '0 0 50px rgba(196,104,126,0.6), 0 18px 44px rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.4)',
            fontSize: 46, lineHeight: 1,
          }}
        >
          ✨
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 30, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, letterSpacing: '-0.01em' }}
        >
          You&apos;re all set
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.65, maxWidth: 300, margin: '0 auto' }}
        >
          You know the shape of the app now. The rest is yours to fill together.
        </motion.p>
      </motion.div>
    </motion.div>,
    document.body,
  );
};

interface CoachmarkProviderProps {
  children: React.ReactNode;
  currentView: ViewState;
  navigateTo: (view: ViewState, options?: NavigationOptions) => void;
}

export const CoachmarkProvider: React.FC<CoachmarkProviderProps> = ({ children, currentView, navigateTo }) => {
  // Solo (unlinked) users get partner-neutral tour copy so the tour never
  // promises a "two of you" experience they can't reach until they connect.
  const { isLinked } = useRelationship();
  const [active, setActive] = useState<ActiveStep | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<'next' | 'action' | null>(null);
  const activeRef = useRef<ActiveStep | null>(null);
  const currentViewRef = useRef<ViewState>(currentView);
  const pendingIntentRef = useRef<'next' | 'action' | null>(null);
  const deferredResumeRef = useRef<DeferredResume | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useLayoutEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const setPending = useCallback((intent: 'next' | 'action' | null) => {
    pendingIntentRef.current = intent;
    setPendingIntent(intent);
  }, []);

  const ensureRoute = useCallback(async (route?: ViewState, key?: string) => {
    if (!route || currentViewRef.current === route) return true;
    const startedAt = Date.now();
    navigateTo(route, { instant: true });
    await settleUi();

    for (let attempt = 0; attempt < ROUTE_WAIT_ATTEMPTS; attempt += 1) {
      if (currentViewRef.current === route) {
        await settleUi();
        const durationMs = Date.now() - startedAt;
        if (durationMs >= SLOW_ROUTE_WAIT_MS) {
          CoachmarkInsights.record({ type: 'route_wait', key, route: currentViewRef.current, targetRoute: route, durationMs });
        }
        return true;
      }
      await sleep(ROUTE_WAIT_MS);
    }

    const durationMs = Date.now() - startedAt;
    CoachmarkInsights.record({ type: 'route_wait', key, route: currentViewRef.current, targetRoute: route, durationMs });
    return currentViewRef.current === route;
  }, [navigateTo]);

  const createImmediateStep = useCallback((
    def: CoachmarkDef,
    queue: CoachmarkDef[],
    stepIndex: number,
    total: number,
    enterMode: ActiveStep['enterMode'],
  ): ActiveStep => {
    const shownAt = Date.now();
    // The tour now presents polished full cards only. Spotlights revealed the
    // live (busy) screen behind a scrim, which felt jarring — the "where" pill
    // and the action button still guide the user to each feature.
    return { def, queue, stepIndex, total, renderMode: 'card', spotlight: null, shownAt, enterMode };
  }, []);

  const showStepImmediately = useCallback((
    def: CoachmarkDef,
    queue: CoachmarkDef[],
    stepIndex: number,
    total: number,
    enterMode: ActiveStep['enterMode'],
  ) => {
    Haptics.press?.();
    const step = createImmediateStep(def, queue, stepIndex, total, enterMode);
    flushSync(() => {
      setCelebrating(false);
      setActive(step);
    });
  }, [createImmediateStep]);

  const closeCurrentStep = useCallback((def: CoachmarkDef, reason?: 'step_skipped' | 'step_action_clicked') => {
    FeatureDiscovery.markCoachmarkSeen(def.key);
    if (reason === 'step_skipped') {
      CoachmarkInsights.record({ type: 'step_skipped', key: def.key, route: currentViewRef.current });
    }
    flushSync(() => {
      setActive(null);
    });
  }, []);

  const advance = useCallback(() => {
    if (pendingIntentRef.current) return;
    setPending('next');

    void (async () => {
      const current = activeRef.current;
      if (!current) {
        setPending(null);
        return;
      }

      try {
        closeCurrentStep(current.def);
        const remaining = current.queue.slice(1);

        if (remaining.length === 0) {
          CoachmarkInsights.record({ type: 'advance_complete', key: current.def.key, durationMs: Date.now() - current.shownAt });
          setCelebrating(true);
          return;
        }

        CoachmarkInsights.record({ type: 'advance_complete', key: current.def.key, durationMs: Date.now() - current.shownAt });
        showStepImmediately(
          remaining[0],
          remaining,
          current.stepIndex + 1,
          current.total,
          'next',
        );
      } finally {
        setPending(null);
      }
    })();
  }, [closeCurrentStep, setPending, showStepImmediately]);

  const runAction = useCallback((def: CoachmarkDef) => {
    if (pendingIntentRef.current) return;
    setPending('action');

    void (async () => {
      try {
        const current = activeRef.current;
        if (!current) return;

        CoachmarkInsights.record({ type: 'step_action_clicked', key: def.key, route: currentViewRef.current, targetRoute: def.actionView ?? def.route });
        const remaining = current.queue.slice(1);
        // Only watch for a route exit when the action actually navigates away.
        // When actionView matches the current view (e.g. theme-picker/together-
        // music open a sub-panel of Profile while already on Profile), no exit
        // ever fires, so we must advance the tour synchronously here instead of
        // arming a deferred resume that would never resolve.
        const willNavigate = !!def.actionView && def.actionView !== currentViewRef.current;
        const nextStepIndex = current.stepIndex + 1;
        const nextTotal = current.total;
        closeCurrentStep(def);

        if (willNavigate) {
          deferredResumeRef.current = {
            queue: remaining,
            stepIndex: nextStepIndex,
            total: nextTotal,
            waitForExitFrom: def.actionView as ViewState,
            celebrateOnExit: remaining.length === 0,
          };
          await settleUi(2);
          navigateTo(def.actionView!, { instant: true });
          await settleUi();
          if (def.actionAdvanceDelay) {
            await sleep(Math.min(def.actionAdvanceDelay, 120));
          }
        } else if (remaining.length === 0) {
          setCelebrating(true);
        } else {
          showStepImmediately(remaining[0], remaining, nextStepIndex, nextTotal, 'next');
        }
      } finally {
        setPending(null);
      }
    })();
  }, [closeCurrentStep, navigateTo, setPending, showStepImmediately]);

  useEffect(() => {
    const deferred = deferredResumeRef.current;
    if (!deferred) return;
    if (currentView === deferred.waitForExitFrom) return;
    if (activeRef.current) return;

    deferredResumeRef.current = null;

    if (deferred.celebrateOnExit || deferred.queue.length === 0) {
      setCelebrating(true);
      return;
    }

    showStepImmediately(
      deferred.queue[0],
      deferred.queue,
      deferred.stepIndex,
      deferred.total,
      'next',
    );
  }, [currentView, showStepImmediately]);

  const dismissAll = useCallback(() => {
    Haptics.softTap?.();
    const current = activeRef.current;
    if (current) {
      closeCurrentStep(current.def, 'step_skipped');
    }
    deferredResumeRef.current = null;
    setPending(null);
    FeatureDiscovery.markAllCoachmarksSeen();
    setCelebrating(false);
  }, [closeCurrentStep, setPending]);

  const triggerTour = useCallback(() => {
    if (FeatureDiscovery.areAllCoachmarksSeen()) return;
    const unseen = COACHMARKS.filter((coachmark) => !FeatureDiscovery.isCoachmarkSeen(coachmark.key));
    if (unseen.length === 0) return;

    deferredResumeRef.current = null;
    setPending(null);
    setCelebrating(false);
    showStepImmediately(unseen[0], unseen, 0, unseen.length, 'start');
  }, [setPending, showStepImmediately]);

  const triggerCoachmark = useCallback((key: string) => {
    if (FeatureDiscovery.isCoachmarkSeen(key) || FeatureDiscovery.areAllCoachmarksSeen()) return;
    const def = COACHMARKS.find((coachmark) => coachmark.key === key);
    if (!def) return;

    deferredResumeRef.current = null;
    setPending(null);
    setCelebrating(false);
    showStepImmediately(def, [def], 0, 1, 'start');
  }, [setPending, showStepImmediately]);

  useEffect(() => {
    if (!active) return;
    CoachmarkInsights.record({ type: 'step_shown', key: active.def.key, renderMode: active.renderMode, route: currentViewRef.current });

    const preloadViews = buildCoachmarkPreloadViews(active.def, active.queue.slice(1), currentViewRef.current);
    if (preloadViews.length > 0) {
      window.dispatchEvent(new CustomEvent('te:prefetch', {
        detail: { views: preloadViews },
      }));
    }
  }, [active?.def.key, active?.shownAt, active?.renderMode]);

  useEffect(() => {
    if (active?.renderMode !== 'spotlight') return;

    const scrollRoot = document.querySelector<HTMLElement>('main.lenis-wrapper');

    const recalc = () => {
      const nextSpotlight = measureSpotlight(active.def);
      if (!nextSpotlight) return;
      setActive((prev) => {
        if (!prev || prev.def.key !== active.def.key) return prev;
        return { ...prev, spotlight: nextSpotlight };
      });
    };

    const handleViewportChange = () => window.requestAnimationFrame(recalc);

    scrollRoot?.addEventListener('scroll', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange, { passive: true });
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);

    return () => {
      scrollRoot?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [active?.def, active?.renderMode]);

  // Stable context value — the callbacks are already useCallback-stable, so
  // memoizing the wrapper object stops every consumer from re-rendering on
  // each tab switch (CoachmarkProvider re-renders whenever currentView moves).
  const coachmarkContextValue = useMemo(
    () => ({ triggerCoachmark, triggerTour, dismissAll }),
    [triggerCoachmark, triggerTour, dismissAll],
  );

  return (
    <CoachmarkContext.Provider value={coachmarkContextValue}>
      {children}
      <LayoutGroup id="coachmark-flow">
        <AnimatePresence initial={false}>
          {celebrating ? (
            <CelebrationStep key="celebration" onDone={() => setCelebrating(false)} />
          ) : active ? (
            active.renderMode === 'spotlight' && active.spotlight ? (
              <SpotlightStep
                key={active.def.key}
                state={active.spotlight}
                stepIndex={active.stepIndex}
                total={active.total}
                pendingIntent={pendingIntent}
                enterMode={active.enterMode}
                isLinked={isLinked}
                onAction={() => runAction(active.def)}
                onNext={advance}
                onSkip={dismissAll}
              />
            ) : (
              <CardStep
                key={active.def.key}
                def={active.def}
                stepIndex={active.stepIndex}
                total={active.total}
                pendingIntent={pendingIntent}
                enterMode={active.enterMode}
                isLinked={isLinked}
                onAction={() => runAction(active.def)}
                onNext={advance}
                onSkip={dismissAll}
              />
            )
          ) : null}
        </AnimatePresence>
      </LayoutGroup>
    </CoachmarkContext.Provider>
  );
};

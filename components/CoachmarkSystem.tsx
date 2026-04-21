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

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { FeatureDiscovery } from '../services/featureDiscovery';
import { Haptics } from '../services/haptics';
import { CoachmarkInsights, buildCoachmarkPreloadViews } from '../services/coachmarkInsights.js';
import { NavigationOptions, ViewState } from '../types';
import { readThemeRgbTriplet, readThemeVar } from '../utils/themeVars';

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
    whatIs: 'The bonsai grows as the relationship fills with memories and care.',
    whyItMatters: 'It turns progress into something you can feel visually instead of burying it in stats.',
    doThisNow: 'Open the bonsai once so you know where your shared growth lives.',
    fallbackToCard: true,
  },
  {
    key: 'aura-signal',
    title: 'Aura Signal',
    emoji: '✨',
    mode: 'card',
    route: 'us',
    actionLabel: 'Try Aura Signal',
    actionView: 'aura-signal',
    actionAdvanceDelay: 260,
    accentColor: '#818cf8',
    gradient: 'linear-gradient(140deg, #1e1b4b 0%, #4f46e5 45%, #fbbf24 100%)',
    where: 'Us -> Aura Signal',
    preview: 'aura',
    whatIs: 'Aura Signal is a soft, wordless ping you can send instantly.',
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

const ProgressBar: React.FC<{ step: number; total: number; accent?: string }> = ({ step, total, accent }) => (
  <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 100, overflow: 'hidden' }}>
    <motion.div
      key={step}
      initial={{ width: `${(step / total) * 100}%` }}
      animate={{ width: `${((step + 1) / total) * 100}%` }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{
        height: '100%',
        borderRadius: 100,
        background: accent
          ? `linear-gradient(90deg, ${accent}88, ${accent})`
          : 'linear-gradient(90deg, #e879f9, #a855f7)',
      }}
    />
  </div>
);

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

const usePreviewTheme = (accent: string) => {
  const [theme, setTheme] = useState<PreviewTheme>(() => getPreviewTheme(accent));

  useEffect(() => {
    const sync = () => setTheme(getPreviewTheme(accent));
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme', 'class'],
    });

    return () => observer.disconnect();
  }, [accent]);

  return theme;
};

const FeaturePreview: React.FC<{ kind: PreviewKind; accent: string; large?: boolean }> = ({ kind, accent, large = false }) => {
  const theme = usePreviewTheme(accent);
  const frameHeight = large ? 172 : 118;
  const shellRadius = large ? 24 : 18;
  const titleSize = large ? 12 : 10;
  const labelSize = large ? 9 : 8;
  const bodySize = large ? 10 : 9;
  const lineColor = `rgba(${theme.particleRgb},0.16)`;
  const accentGlow = `rgba(${theme.accentRgb},0.24)`;

  const shellStyle: React.CSSProperties = {
    position: 'relative',
    height: frameHeight,
    width: '100%',
    overflow: 'hidden',
    borderRadius: shellRadius,
    background: `${theme.bgMain}, linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))`,
    border: `1px solid ${theme.border}`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 30px rgba(0,0,0,0.18), 0 0 0 1px ${lineColor}`,
  };

  const chromeStyle: React.CSSProperties = {
    position: 'absolute',
    inset: large ? 10 : 8,
    borderRadius: large ? 18 : 14,
    background: 'rgba(9,10,15,0.32)',
    border: `1px solid ${lineColor}`,
    overflow: 'hidden',
  };

  const eyebrowStyle: React.CSSProperties = {
    fontSize: labelSize,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    fontWeight: 800,
    color: theme.textSecondary,
    lineHeight: 1,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: titleSize,
    fontWeight: 800,
    color: theme.textPrimary,
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  };

  const bodyStyle: React.CSSProperties = {
    fontSize: bodySize,
    color: theme.textSecondary,
    lineHeight: 1.35,
  };

  if (kind === 'capture') {
    return (
      <div style={shellStyle}>
        <div style={chromeStyle}>
          <div style={{ position: 'absolute', left: 12, right: 12, top: 12, display: 'flex', gap: 6 }}>
            {['memory', 'note', 'photo'].map((label, index) => (
              <div
                key={label}
                style={{
                  padding: '5px 8px',
                  borderRadius: 999,
                  background: index === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                  color: theme.textPrimary,
                  fontSize: labelSize,
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 16, height: large ? 56 : 42, borderRadius: 18, background: 'rgba(255,255,255,0.08)', border: `1px solid ${lineColor}` }} />
          <motion.div
            animate={{ scale: [1, 1.08, 1], boxShadow: [`0 10px 22px ${accentGlow}`, `0 16px 32px ${accentGlow}`, `0 10px 22px ${accentGlow}`] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: large ? 22 : 18,
              width: large ? 54 : 42,
              height: large ? 54 : 42,
              transform: 'translateX(-50%)',
              borderRadius: 999,
              background: theme.centerBg,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <div style={{ width: large ? 22 : 18, height: 4, borderRadius: 999, background: '#fff', position: 'absolute' }} />
            <div style={{ width: 4, height: large ? 22 : 18, borderRadius: 999, background: '#fff', position: 'absolute' }} />
          </motion.div>
        </div>
      </div>
    );
  }

  if (kind === 'moments') {
    return (
      <div style={shellStyle}>
        <div style={chromeStyle}>
          <div style={{ position: 'absolute', left: 12, right: 12, top: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={eyebrowStyle}>daily moments</div>
              <div style={titleStyle}>today, together</div>
            </div>
            <div style={{ width: large ? 28 : 22, height: large ? 28 : 22, borderRadius: 999, background: 'rgba(255,255,255,0.18)' }} />
          </div>
          <motion.div
            animate={{ scale: [1, 1.03, 1], y: [0, -2, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              left: 12,
              top: large ? 46 : 40,
              width: large ? '58%' : '56%',
              height: large ? 94 : 62,
              borderRadius: 20,
              background: `linear-gradient(150deg, rgba(${theme.accentRgb},0.96), rgba(${theme.particleRgb},0.7))`,
            }}
          />
          <div style={{ position: 'absolute', right: 12, top: large ? 48 : 42, width: large ? 62 : 48, height: large ? 80 : 54, borderRadius: 18, background: 'rgba(255,255,255,0.08)', border: `1px solid ${lineColor}`, padding: 8 }}>
            <div style={{ ...eyebrowStyle, marginBottom: 6 }}>comments</div>
            <div style={{ ...bodyStyle, marginBottom: 4 }}>you two felt this</div>
            <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.16)', marginBottom: 4 }} />
            <div style={{ height: 4, width: '72%', borderRadius: 999, background: 'rgba(255,255,255,0.12)' }} />
          </div>
          <motion.div
            animate={{ x: [0, 18, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: 12, bottom: 12, width: large ? 52 : 42, height: 3, borderRadius: 999, background: '#fff' }}
          />
          <div style={{ position: 'absolute', left: 70, right: 12, bottom: 12, height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.14)' }} />
        </div>
      </div>
    );
  }

  if (kind === 'countdowns') {
    return (
      <div style={shellStyle}>
        <div style={{ ...chromeStyle, padding: large ? 14 : 12 }}>
          <div style={eyebrowStyle}>next date</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
            <div style={{ fontSize: large ? 38 : 28, fontWeight: 900, lineHeight: 0.95, color: theme.textPrimary, letterSpacing: '-0.05em' }}>
              12
            </div>
            <div style={{ ...bodyStyle, textAlign: 'right' }}>
              days until
              <br />
              beach trip
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ ...titleStyle, fontSize: bodySize + 1 }}>Saturday sunset</div>
              <div style={{ padding: '4px 8px', borderRadius: 999, background: `rgba(${theme.accentRgb},0.16)`, color: accent, fontSize: labelSize, fontWeight: 800 }}>soon</div>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: ['54%', '68%', '54%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ height: '100%', borderRadius: 999, background: theme.centerBg }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'letters') {
    return (
      <div style={shellStyle}>
        <div style={chromeStyle}>
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: large ? '22px 18px 18px' : '18px 14px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', border: `1px solid ${lineColor}`, padding: large ? 16 : 12 }}
          >
            <div style={{ ...eyebrowStyle, color: accent, marginBottom: 8 }}>open when</div>
            <div style={{ fontSize: large ? 15 : 12, fontWeight: 700, color: theme.textPrimary, fontFamily: 'Georgia, Times, serif', marginBottom: 8 }}>
              you need a softer day
            </div>
            <div style={{ ...bodyStyle, fontFamily: 'Georgia, Times, serif' }}>
              read this when you want my voice to arrive before I do.
            </div>
          </motion.div>
          <div style={{ position: 'absolute', left: '18%', right: '18%', top: large ? 22 : 18, height: large ? 40 : 30, clipPath: 'polygon(0 0, 50% 72%, 100% 0)', background: `linear-gradient(180deg, ${accent}, rgba(${theme.accentRgb},0.58))` }} />
        </div>
      </div>
    );
  }

  if (kind === 'bonsai') {
    return (
      <div style={shellStyle}>
        <div style={chromeStyle}>
          <div style={{ position: 'absolute', left: 12, top: 12, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', color: theme.textPrimary, fontSize: labelSize, fontWeight: 800 }}>
            growth 72%
          </div>
          <motion.div
            animate={{ scaleY: [1, 1.08, 1] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: '50%', bottom: 34, width: 8, height: large ? 56 : 42, transform: 'translateX(-50%)', transformOrigin: 'bottom center', borderRadius: 999, background: '#8b5a2b' }}
          />
          <motion.div
            animate={{ rotate: [-4, 6, -4] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: '49%', bottom: large ? 68 : 56, width: large ? 34 : 24, height: large ? 28 : 20, transformOrigin: 'bottom left', background: 'linear-gradient(145deg, #86efac, #22c55e)', borderRadius: '70% 30% 70% 30%' }}
          />
          <motion.div
            animate={{ rotate: [4, -6, 4] }}
            transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: '39%', bottom: large ? 76 : 60, width: large ? 34 : 24, height: large ? 28 : 20, transformOrigin: 'bottom right', background: 'linear-gradient(145deg, #bbf7d0, #16a34a)', borderRadius: '30% 70% 30% 70%' }}
          />
          <div style={{ position: 'absolute', left: '34%', right: '34%', bottom: 14, height: large ? 26 : 20, borderRadius: '18px 18px 24px 24px', background: 'linear-gradient(180deg, #6b4f3b, #433126)' }} />
          <div style={{ position: 'absolute', right: 12, bottom: 16, textAlign: 'right' }}>
            <div style={eyebrowStyle}>watered</div>
            <div style={titleStyle}>2 / 2</div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'aura') {
    return (
      <div style={shellStyle}>
        <div style={chromeStyle}>
          <div style={{ position: 'absolute', left: 12, right: 12, top: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={eyebrowStyle}>aura signal</div>
            <div style={{ ...bodyStyle, fontSize: labelSize }}>hold + send</div>
          </div>
          {[0, 1, 2].map((ring) => (
            <motion.div
              key={ring}
              animate={{ scale: [0.74, 1.22, 1.22], opacity: [0.42, 0, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: ring * 0.5 }}
              style={{ position: 'absolute', left: '50%', top: '54%', width: large ? 92 : 72, height: large ? 92 : 72, transform: 'translate(-50%, -50%)', borderRadius: '50%', border: `1.5px solid ${accent}` }}
            />
          ))}
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: '50%', top: '54%', width: large ? 40 : 34, height: large ? 40 : 34, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: theme.floatingAccent, boxShadow: `0 10px 28px ${accentGlow}` }}
          />
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, textAlign: 'center', ...bodyStyle }}>
            a soft ping lands instantly
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'themes') {
    return (
      <div style={shellStyle}>
        <div style={{ ...chromeStyle, padding: large ? 14 : 12 }}>
          <div style={eyebrowStyle}>aesthetic studio</div>
          <div style={{ ...titleStyle, marginTop: 4 }}>tone sets the room</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {[
              [readThemeVar('--color-lior-200', '#fecdd3'), readThemeVar('--color-lior-400', '#fb7185'), readThemeVar('--color-lior-600', '#e11d48')],
              [readThemeVar('--theme-floating-rim', '#fbcfe8'), readThemeVar('--theme-floating-accent', '#fda4af'), accent],
              [readThemeVar('--theme-nav-icon-active', '#475569'), readThemeVar('--theme-nav-center-bg-active', accent), readThemeVar('--theme-bg-overlay', '#ffffff')],
            ].map((colors, index) => (
              <motion.div
                key={`${colors[0]}-${index}`}
                animate={{ y: [0, index === 1 ? -8 : -4, 0] }}
                transition={{ duration: 2.8 + index * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ flex: 1, height: large ? 92 : 62, borderRadius: 18, background: `linear-gradient(180deg, ${colors[0]}, ${colors[1]} 58%, ${colors[2]})`, boxShadow: '0 10px 24px rgba(0,0,0,0.18)' }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={{ ...chromeStyle, padding: large ? 14 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: large ? 34 : 28, height: large ? 34 : 28, borderRadius: 14, background: `rgba(${theme.accentRgb},0.14)`, display: 'grid', placeItems: 'center' }}>
            <div style={{ width: large ? 14 : 12, height: large ? 14 : 12, borderRadius: 999, background: accent }} />
          </div>
          <div>
            <div style={eyebrowStyle}>together music</div>
            <div style={titleStyle}>your song stays close</div>
          </div>
        </div>
        <div style={{ marginTop: 14, borderRadius: 18, background: 'rgba(255,255,255,0.08)', border: `1px solid ${lineColor}`, padding: large ? 12 : 10 }}>
          <div style={{ ...bodyStyle, marginBottom: 8 }}>midnight train home</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: large ? 38 : 28 }}>
            {[14, 32, 18, 26, 38, 20, 30].map((height, index) => (
              <motion.div
                key={height}
                animate={{ height: [height * 0.5, height, height * 0.65] }}
                transition={{ duration: 1.1 + index * 0.08, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 6, borderRadius: 999, background: index % 2 === 0 ? accent : 'rgba(255,255,255,0.7)' }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CopyBlock: React.FC<{ label: string; text: string; accent: string }> = ({ label, text, accent }) => (
  <div>
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${accent}c9`, marginBottom: 3 }}>
      {label}
    </p>
    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', lineHeight: 1.55 }}>
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
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'monospace', color: `${accent}cc` }}>
          {stepIndex + 1} / {total}
        </span>
        <button onClick={onSkip} style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace', padding: 0 }}>
          skip tour
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
}> = ({ state, stepIndex, total, onAction, onNext, onSkip, pendingIntent, enterMode }) => {
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
        <rect width="100%" height="100%" fill="rgba(5,2,8,0.84)" mask={`url(#cm-mask-${def.key})`} />
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
        layout
        layoutId="coachmark-panel"
        initial={bubbleMotion.initial}
        animate={bubbleMotion.animate}
        exit={bubbleMotion.exit}
        transition={bubbleMotion.transition}
        style={{
          position: 'absolute',
          left: bubbleLeft,
          width: bubbleWidth,
          ...(placement === 'below' ? { top: bubbleTop } : { bottom: bubbleBottom }),
          background: 'linear-gradient(180deg, rgba(12,8,18,0.98) 0%, rgba(8,5,12,0.98) 100%)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRadius: 24,
          padding: compact ? '14px 14px 15px' : '15px 16px 16px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
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
              background: 'rgba(12,8,18,0.98)',
              border: '1px solid rgba(255,255,255,0.09)',
              ...(placement === 'above'
                ? { bottom: 1, transform: 'rotate(45deg)', transformOrigin: 'bottom center' }
                : { top: 1, transform: 'rotate(45deg)', transformOrigin: 'top center' }),
            }}
          />
        </div>

        <StepChrome def={def} stepIndex={stepIndex} total={total} onSkip={onSkip}>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: compact ? '1fr' : '108px 1fr', gap: 12, alignItems: 'start' }}>
            <motion.div layout="position" layoutId="coachmark-preview-shell">
              <FeaturePreview kind={def.preview} accent={accent} />
            </motion.div>
            <div>
              <motion.div layout="position" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{def.emoji}</span>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{def.title}</p>
                  {def.where && (
                    <p style={{ fontSize: 11, color: `${accent}dd`, fontFamily: 'monospace', marginTop: 2 }}>{def.where}</p>
                  )}
                </div>
              </motion.div>
              <div style={{ display: 'grid', gap: 8 }}>
                <CopyBlock label="What it is" text={def.whatIs} accent={accent} />
                <CopyBlock label="Why it matters" text={def.whyItMatters} accent={accent} />
                <CopyBlock label="Do now" text={def.doThisNow} accent={accent} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              disabled={controlsDisabled}
              onClick={onAction}
              onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.985)'}
              onPointerUp={(event) => event.currentTarget.style.transform = ''}
              onPointerLeave={(event) => event.currentTarget.style.transform = ''}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 12,
                background: def.gradient ?? `linear-gradient(135deg, ${accent} 0%, #a855f7 100%)`,
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: controlsDisabled ? 'progress' : 'pointer',
                letterSpacing: '0.02em',
                boxShadow: `0 3px 14px ${accent}55`,
                opacity: controlsDisabled && !actionBusy ? 0.72 : 1,
                transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
              }}
            >
              {actionBusy ? 'Opening...' : def.actionLabel}
            </button>
            <button
              disabled={controlsDisabled}
              onClick={onNext}
              onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.985)'}
              onPointerUp={(event) => event.currentTarget.style.transform = ''}
              onPointerLeave={(event) => event.currentTarget.style.transform = ''}
              style={{
                padding: '10px 12px',
                minWidth: 92,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.84)',
                fontSize: 13,
                fontWeight: 700,
                cursor: controlsDisabled ? 'progress' : 'pointer',
                opacity: controlsDisabled && !nextBusy ? 0.64 : 1,
                transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
              }}
            >
              {nextBusy ? 'Moving...' : 'Next'}
            </button>
          </div>
        </StepChrome>
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
}> = ({ def, stepIndex, total, onAction, onNext, onSkip, pendingIntent, enterMode }) => {
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
        background: 'rgba(5,2,8,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <motion.div
        layout
        layoutId="coachmark-panel"
        initial={panelMotion.initial}
        animate={panelMotion.animate}
        exit={panelMotion.exit}
        transition={panelMotion.transition}
        style={{
          width: '100%',
          maxWidth: 352,
          borderRadius: 28,
          overflow: 'hidden',
          background: '#0d080f',
          boxShadow: `0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08), 0 0 48px ${accent}18`,
        }}
      >
        <div
          style={{
            padding: '16px 16px 18px',
            background: def.gradient ?? 'linear-gradient(140deg,#2d1b4e,#a855f7)',
          }}
        >
          <StepChrome def={def} stepIndex={stepIndex} total={total} onSkip={onSkip}>
            <motion.div layout="position" layoutId="coachmark-preview-shell" style={{ marginTop: 12 }}>
              <FeaturePreview kind={def.preview} accent={accent} large />
            </motion.div>
          </StepChrome>
        </div>

        <div style={{ padding: '16px 18px 18px' }}>
          <motion.div layout="position" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 24, lineHeight: 1 }}>{def.emoji}</span>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.01em', margin: 0 }}>{def.title}</h2>
              {def.where && (
                <p style={{ fontSize: 11, color: `${accent}cc`, fontFamily: 'monospace', marginTop: 4 }}>{def.where}</p>
              )}
            </div>
          </motion.div>

          <div style={{ display: 'grid', gap: 10 }}>
            <CopyBlock label="What it is" text={def.whatIs} accent={accent} />
            <CopyBlock label="Why it matters" text={def.whyItMatters} accent={accent} />
            <CopyBlock label="Do now" text={def.doThisNow} accent={accent} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              disabled={controlsDisabled}
              onClick={onAction}
              onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.985)'}
              onPointerUp={(event) => event.currentTarget.style.transform = ''}
              onPointerLeave={(event) => event.currentTarget.style.transform = ''}
              style={{
                flex: 1,
                padding: '13px',
                borderRadius: 14,
                background: def.gradient ?? `linear-gradient(135deg, ${accent}, #a855f7)`,
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 800,
                cursor: controlsDisabled ? 'progress' : 'pointer',
                letterSpacing: '0.01em',
                boxShadow: `0 6px 24px ${accent}44`,
                textShadow: '0 1px 3px rgba(0,0,0,0.25)',
                opacity: controlsDisabled && !actionBusy ? 0.72 : 1,
                transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
              }}
            >
              {actionBusy ? 'Opening...' : def.actionLabel}
            </button>
            <button
              disabled={controlsDisabled}
              onClick={onNext}
              onPointerDown={(event) => event.currentTarget.style.transform = 'scale(0.985)'}
              onPointerUp={(event) => event.currentTarget.style.transform = ''}
              onPointerLeave={(event) => event.currentTarget.style.transform = ''}
              style={{
                minWidth: 96,
                padding: '13px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.82)',
                fontSize: 14,
                fontWeight: 700,
                cursor: controlsDisabled ? 'progress' : 'pointer',
                opacity: controlsDisabled && !nextBusy ? 0.64 : 1,
                transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
              }}
            >
              {nextBusy ? 'Moving...' : 'Next'}
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
        background: 'rgba(5,2,8,0.88)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 18, stiffness: 280 }}
        style={{ textAlign: 'center', padding: '0 40px' }}
      >
        <motion.div
          animate={{ rotate: [0, -8, 8, -5, 5, 0] }}
          transition={{ delay: 0.3, duration: 0.7 }}
          style={{ fontSize: 72, marginBottom: 20, display: 'block', lineHeight: 1 }}
        >
          🎉
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}
        >
          You&apos;re all set
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          style={{ fontSize: 15, color: 'rgba(255,255,255,0.54)', lineHeight: 1.6 }}
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

    if ((def.mode ?? 'spotlight') === 'spotlight' && (!def.route || def.route === currentViewRef.current)) {
      const spotlight = measureSpotlight(def);
      if (spotlight) {
        return { def, queue, stepIndex, total, renderMode: 'spotlight', spotlight, shownAt, enterMode };
      }
    }

    return { def, queue, stepIndex, total, renderMode: 'card', spotlight: null, shownAt, enterMode };
  }, []);

  const enhanceStep = useCallback((step: ActiveStep) => {
    if ((step.def.mode ?? 'spotlight') === 'card' || step.renderMode === 'spotlight') return;

    void (async () => {
      await settleUi(2);
      const routeReady = await ensureRoute(step.def.route, step.def.key);
      if (!routeReady) return;

      const spotlightResult = await ensureSpotlightReady(step.def);
      if (spotlightResult.spotlight) {
        setActive((prev) => {
          if (!prev || prev.def.key !== step.def.key || prev.shownAt !== step.shownAt) return prev;
          return { ...prev, renderMode: 'spotlight', spotlight: spotlightResult.spotlight, enterMode: 'upgrade' };
        });
        return;
      }

      if (step.def.fallbackToCard) {
        CoachmarkInsights.record({ type: 'fallback_card', key: step.def.key, reason: spotlightResult.reason });
      }
      if (spotlightResult.reason === 'occluded') {
        CoachmarkInsights.record({ type: 'occlusion_failure', key: step.def.key });
      }
    })();
  }, [ensureRoute]);

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
    enhanceStep(step);
  }, [createImmediateStep, enhanceStep]);

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
        const waitForExitFrom = (def.actionView ?? currentViewRef.current) as ViewState;
        deferredResumeRef.current = {
          queue: remaining,
          stepIndex: current.stepIndex + 1,
          total: current.total,
          waitForExitFrom,
          celebrateOnExit: remaining.length === 0,
        };
        closeCurrentStep(def);

        if (def.actionView && def.actionView !== currentViewRef.current) {
          await settleUi(2);
          navigateTo(def.actionView, { instant: true });
          await settleUi();
          if (def.actionAdvanceDelay) {
            await sleep(Math.min(def.actionAdvanceDelay, 120));
          }
        }
      } finally {
        setPending(null);
      }
    })();
  }, [closeCurrentStep, navigateTo, setPending]);

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

  return (
    <CoachmarkContext.Provider value={{ triggerCoachmark, triggerTour, dismissAll }}>
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

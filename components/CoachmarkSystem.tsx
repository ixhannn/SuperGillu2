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

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FeatureDiscovery } from '../services/featureDiscovery';
import { Haptics } from '../services/haptics';
import { ViewState } from '../types';

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
const TARGET_WAIT_MS = 140;
const TARGET_WAIT_ATTEMPTS = 10;
const ROUTE_WAIT_ATTEMPTS = 16;
const ROUTE_WAIT_MS = 100;

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
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

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

const ensureSpotlightReady = async (def: CoachmarkDef): Promise<SpotlightState | null> => {
  for (let attempt = 0; attempt < TARGET_WAIT_ATTEMPTS; attempt += 1) {
    const target = findCoachmarkTarget(def.key);
    if (!target) {
      await sleep(TARGET_WAIT_MS);
      continue;
    }

    let rect = target.getBoundingClientRect();
    const bounds = getOcclusionBounds();
    const targetCenter = rect.top + rect.height / 2;
    const safeCenter = bounds.top + (bounds.bottom - bounds.top) / 2;

    if (rect.top < bounds.top + 12 || rect.bottom > bounds.bottom - 12) {
      const delta = targetCenter - safeCenter;
      window.scrollBy({ top: delta, behavior: attempt === 0 ? 'smooth' : 'auto' });
      await sleep(attempt === 0 ? 260 : TARGET_WAIT_MS);
      rect = target.getBoundingClientRect();
    }

    if (targetIsUncovered(target, rect)) {
      return { rect, def };
    }

    await sleep(TARGET_WAIT_MS);
  }

  return null;
};

const chooseSpotlightLayout = (rect: DOMRect, preferred?: 'above' | 'below' | 'auto') => {
  const bounds = getOcclusionBounds();
  const availableAbove = rect.top - bounds.top - 16;
  const availableBelow = bounds.bottom - rect.bottom - 16;
  const compact = rect.width > window.innerWidth * 0.52 || Math.min(availableAbove, availableBelow) < 190 || window.innerWidth < 390;
  const preferredPlacement = preferred && preferred !== 'auto'
    ? preferred
    : availableBelow >= availableAbove
      ? 'below'
      : 'above';
  const minHeight = compact ? 200 : 238;
  const placement =
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

const FeaturePreview: React.FC<{ kind: PreviewKind; accent: string; large?: boolean }> = ({ kind, accent, large = false }) => {
  const frameHeight = large ? 172 : 118;
  const shellRadius = large ? 24 : 18;

  const shellStyle: React.CSSProperties = {
    position: 'relative',
    height: frameHeight,
    width: '100%',
    overflow: 'hidden',
    borderRadius: shellRadius,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
  };

  if (kind === 'capture') {
    return (
      <div style={shellStyle}>
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.14, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: '22% 27%', borderRadius: 32, background: `${accent}55`, filter: 'blur(20px)' }}
        />
        <div style={{ position: 'absolute', inset: '18% 26%', borderRadius: 28, background: 'rgba(9,10,15,0.32)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ position: 'absolute', inset: 12, borderRadius: 18, background: 'linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))' }} />
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: '50%', top: '50%', width: large ? 54 : 42, height: large ? 54 : 42, transform: 'translate(-50%, -50%)', borderRadius: 999, background: accent, boxShadow: `0 8px 24px ${accent}55` }}
          />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: large ? 22 : 18, height: 4, transform: 'translate(-50%, -50%)', borderRadius: 999, background: '#fff' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 4, height: large ? 22 : 18, transform: 'translate(-50%, -50%)', borderRadius: 999, background: '#fff' }} />
        </div>
      </div>
    );
  }

  if (kind === 'moments') {
    return (
      <div style={shellStyle}>
        <motion.div
          animate={{ x: [0, 10, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '16%', top: '14%', width: '40%', height: '58%', borderRadius: 22, background: 'linear-gradient(150deg, rgba(253,186,116,0.88), rgba(96,165,250,0.8))', boxShadow: '0 14px 30px rgba(0,0,0,0.2)' }}
        />
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', right: '16%', top: '22%', width: '36%', height: '50%', borderRadius: 20, background: 'linear-gradient(160deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.12)' }}
        />
        <motion.div
          animate={{ opacity: [0.32, 1, 0.32] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '18%', top: '18%', width: large ? 14 : 12, height: large ? 14 : 12, borderRadius: 999, background: '#fff' }}
        />
        <div style={{ position: 'absolute', left: '18%', right: '18%', bottom: '14%', height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.12)' }} />
      </div>
    );
  }

  if (kind === 'countdowns') {
    return (
      <div style={shellStyle}>
        <div style={{ position: 'absolute', inset: '18% 14%', borderRadius: 24, background: 'rgba(9,10,15,0.28)', border: '1px solid rgba(255,255,255,0.1)' }} />
        <motion.div
          animate={{ width: ['38%', '62%', '38%'] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '20%', top: '36%', height: 10, borderRadius: 999, background: accent }}
        />
        <div style={{ position: 'absolute', left: '20%', top: '24%', width: 56, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.18)' }} />
        <div style={{ position: 'absolute', left: '20%', right: '20%', bottom: '22%', height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.1)' }} />
        <motion.div
          animate={{ x: [0, 12, 0] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', right: '22%', top: '24%', width: large ? 34 : 28, height: large ? 34 : 28, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: `1px solid ${accent}` }}
        />
      </div>
    );
  }

  if (kind === 'letters') {
    return (
      <div style={shellStyle}>
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '18%', right: '18%', top: '26%', height: '42%', borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.16)' }}
        />
        <div style={{ position: 'absolute', left: '18%', right: '18%', top: '26%', height: '42%', clipPath: 'polygon(0 0, 50% 55%, 100% 0)', background: `${accent}66` }} />
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
          style={{ position: 'absolute', left: '28%', right: '28%', top: '22%', height: '24%', borderRadius: 12, background: 'rgba(255,255,255,0.92)' }}
        />
      </div>
    );
  }

  if (kind === 'bonsai') {
    return (
      <div style={shellStyle}>
        <motion.div
          animate={{ scaleY: [1, 1.08, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '50%', bottom: '28%', width: 8, height: '28%', transformOrigin: 'bottom center', transform: 'translateX(-50%)', borderRadius: 999, background: '#8b5a2b' }}
        />
        <motion.div
          animate={{ rotate: [-4, 6, -4] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '50%', bottom: '46%', width: '18%', height: '18%', transformOrigin: 'bottom left', background: 'linear-gradient(145deg, #86efac, #22c55e)', borderRadius: '70% 30% 70% 30%' }}
        />
        <motion.div
          animate={{ rotate: [4, -6, 4] }}
          transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '44%', bottom: '52%', width: '18%', height: '18%', transformOrigin: 'bottom right', background: 'linear-gradient(145deg, #86efac, #16a34a)', borderRadius: '30% 70% 30% 70%' }}
        />
        <div style={{ position: 'absolute', left: '34%', right: '34%', bottom: '14%', height: '16%', borderRadius: '18px 18px 24px 24px', background: 'linear-gradient(180deg, #6b4f3b, #433126)' }} />
      </div>
    );
  }

  if (kind === 'aura') {
    return (
      <div style={shellStyle}>
        {[0, 1, 2].map((ring) => (
          <motion.div
            key={ring}
            animate={{ scale: [0.72, 1.18, 1.18], opacity: [0.42, 0, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: ring * 0.55 }}
            style={{ position: 'absolute', left: '50%', top: '50%', width: large ? 108 : 82, height: large ? 108 : 82, transform: 'translate(-50%, -50%)', borderRadius: '50%', border: `1.5px solid ${accent}` }}
          />
        ))}
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: large ? 42 : 34, height: large ? 42 : 34, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: accent, boxShadow: `0 10px 26px ${accent}66` }}
        />
      </div>
    );
  }

  if (kind === 'themes') {
    return (
      <div style={shellStyle}>
        {[
          { left: '16%', colors: ['#fca5a5', '#fb7185', '#f43f5e'] },
          { left: '41%', colors: ['#c4b5fd', '#8b5cf6', '#6d28d9'] },
          { left: '66%', colors: ['#93c5fd', '#38bdf8', '#0ea5e9'] },
        ].map((swatch, index) => (
          <motion.div
            key={swatch.left}
            animate={{ y: [0, index % 2 === 0 ? -7 : -3, 0] }}
            transition={{ duration: 3 + index * 0.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: swatch.left, top: '18%', width: '18%', height: '52%', borderRadius: 20, background: `linear-gradient(180deg, ${swatch.colors[0]}, ${swatch.colors[1]} 55%, ${swatch.colors[2]})`, boxShadow: '0 14px 28px rgba(0,0,0,0.18)' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={{ position: 'absolute', left: '18%', right: '18%', bottom: '20%', height: '36%', borderRadius: 24, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }} />
      {[0, 1, 2, 3, 4].map((bar) => (
        <motion.div
          key={bar}
          animate={{ height: [`${18 + bar * 6}%`, `${40 + (bar % 3) * 12}%`, `${20 + bar * 4}%`] }}
          transition={{ duration: 1.2 + bar * 0.14, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: `${28 + bar * 10}%`, bottom: '28%', width: 8, borderRadius: 999, background: bar % 2 === 0 ? accent : 'rgba(255,255,255,0.72)' }}
        />
      ))}
      <motion.div
        animate={{ x: [0, 8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', right: '18%', top: '18%', width: large ? 24 : 20, height: large ? 24 : 20, borderRadius: 999, background: `${accent}44`, border: `1px solid ${accent}` }}
      />
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
}> = ({ state, stepIndex, total, onAction, onNext, onSkip }) => {
  const { rect, def } = state;
  const accent = def.accentColor ?? '#e879f9';
  const sL = rect.left - SPOTLIGHT_PAD;
  const sT = rect.top - SPOTLIGHT_PAD;
  const sW = rect.width + SPOTLIGHT_PAD * 2;
  const sH = rect.height + SPOTLIGHT_PAD * 2;
  const sR = Math.min(sW / 2, sH / 2, 32);
  const { compact, placement, bubbleWidth } = chooseSpotlightLayout(rect, def.calloutPosition);
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
      transition={{ duration: 0.18 }}
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
        initial={{ opacity: 0, y: placement === 'above' ? 12 : -12, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 340, delay: 0.06 }}
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
            <FeaturePreview kind={def.preview} accent={accent} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{def.emoji}</span>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{def.title}</p>
                  {def.where && (
                    <p style={{ fontSize: 11, color: `${accent}dd`, fontFamily: 'monospace', marginTop: 2 }}>{def.where}</p>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <CopyBlock label="What it is" text={def.whatIs} accent={accent} />
                <CopyBlock label="Why it matters" text={def.whyItMatters} accent={accent} />
                <CopyBlock label="Do now" text={def.doThisNow} accent={accent} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              onClick={onAction}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 12,
                background: def.gradient ?? `linear-gradient(135deg, ${accent} 0%, #a855f7 100%)`,
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.02em',
                boxShadow: `0 3px 14px ${accent}55`,
              }}
            >
              {def.actionLabel}
            </button>
            <button
              onClick={onNext}
              style={{
                padding: '10px 12px',
                minWidth: 92,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.84)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Next
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
}> = ({ def, stepIndex, total, onAction, onNext, onSkip }) => {
  const accent = def.accentColor ?? '#a855f7';

  return createPortal(
    <motion.div
      key={def.key}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
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
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
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
            <div style={{ marginTop: 12 }}>
              <FeaturePreview kind={def.preview} accent={accent} large />
            </div>
          </StepChrome>
        </div>

        <div style={{ padding: '16px 18px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 24, lineHeight: 1 }}>{def.emoji}</span>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.01em', margin: 0 }}>{def.title}</h2>
              {def.where && (
                <p style={{ fontSize: 11, color: `${accent}cc`, fontFamily: 'monospace', marginTop: 4 }}>{def.where}</p>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <CopyBlock label="What it is" text={def.whatIs} accent={accent} />
            <CopyBlock label="Why it matters" text={def.whyItMatters} accent={accent} />
            <CopyBlock label="Do now" text={def.doThisNow} accent={accent} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={onAction}
              style={{
                flex: 1,
                padding: '13px',
                borderRadius: 14,
                background: def.gradient ?? `linear-gradient(135deg, ${accent}, #a855f7)`,
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                boxShadow: `0 6px 24px ${accent}44`,
                textShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            >
              {def.actionLabel}
            </button>
            <button
              onClick={onNext}
              style={{
                minWidth: 96,
                padding: '13px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.82)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Next
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
  navigateTo: (view: ViewState) => void;
}

export const CoachmarkProvider: React.FC<CoachmarkProviderProps> = ({ children, currentView, navigateTo }) => {
  const [active, setActive] = useState<ActiveStep | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const activeRef = useRef<ActiveStep | null>(null);
  const currentViewRef = useRef<ViewState>(currentView);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const ensureRoute = useCallback(async (route?: ViewState) => {
    if (!route || currentViewRef.current === route) return true;
    navigateTo(route);

    for (let attempt = 0; attempt < ROUTE_WAIT_ATTEMPTS; attempt += 1) {
      if (currentViewRef.current === route) {
        await sleep(120);
        return true;
      }
      await sleep(ROUTE_WAIT_MS);
    }

    return currentViewRef.current === route;
  }, [navigateTo]);

  const resolveStep = useCallback(async (
    def: CoachmarkDef,
    queue: CoachmarkDef[],
    stepIndex: number,
    total: number,
  ): Promise<ActiveStep | null> => {
    const routeReady = await ensureRoute(def.route);
    if (!routeReady) return null;

    Haptics.press?.();

    if ((def.mode ?? 'spotlight') === 'card') {
      return { def, queue, stepIndex, total, renderMode: 'card', spotlight: null };
    }

    const spotlight = await ensureSpotlightReady(def);
    if (spotlight) {
      return { def, queue, stepIndex, total, renderMode: 'spotlight', spotlight };
    }

    if (def.fallbackToCard) {
      return { def, queue, stepIndex, total, renderMode: 'card', spotlight: null };
    }

    return null;
  }, [ensureRoute]);

  const advance = useCallback(() => {
    void (async () => {
      const current = activeRef.current;
      if (!current) return;

      FeatureDiscovery.markCoachmarkSeen(current.def.key);
      const remaining = current.queue.slice(1);

      if (remaining.length === 0) {
        setActive(null);
        setCelebrating(true);
        return;
      }

      for (let i = 0; i < remaining.length; i += 1) {
        const next = await resolveStep(
          remaining[i],
          remaining.slice(i),
          current.stepIndex + i + 1,
          current.total,
        );

        if (next) {
          setActive(next);
          return;
        }
      }

      setActive(null);
      setCelebrating(true);
    })();
  }, [resolveStep]);

  const runAction = useCallback((def: CoachmarkDef) => {
    void (async () => {
      if (def.actionView) {
        navigateTo(def.actionView);
        await sleep(def.actionAdvanceDelay ?? 180);
      }
      advance();
    })();
  }, [advance, navigateTo]);

  const dismissAll = useCallback(() => {
    Haptics.softTap?.();
    const current = activeRef.current;
    if (current) {
      FeatureDiscovery.markCoachmarkSeen(current.def.key);
    }
    setActive(null);
    FeatureDiscovery.markAllCoachmarksSeen();
    setCelebrating(false);
  }, []);

  const triggerTour = useCallback(() => {
    void (async () => {
      if (FeatureDiscovery.areAllCoachmarksSeen()) return;
      const unseen = COACHMARKS.filter((coachmark) => !FeatureDiscovery.isCoachmarkSeen(coachmark.key));
      if (unseen.length === 0) return;

      for (let i = 0; i < unseen.length; i += 1) {
        const step = await resolveStep(unseen[i], unseen.slice(i), i, unseen.length);
        if (step) {
          setCelebrating(false);
          setActive(step);
          return;
        }
      }
    })();
  }, [resolveStep]);

  const triggerCoachmark = useCallback((key: string) => {
    void (async () => {
      if (FeatureDiscovery.isCoachmarkSeen(key) || FeatureDiscovery.areAllCoachmarksSeen()) return;
      const def = COACHMARKS.find((coachmark) => coachmark.key === key);
      if (!def) return;

      const step = await resolveStep(def, [def], 0, 1);
      if (step) {
        setCelebrating(false);
        setActive(step);
      }
    })();
  }, [resolveStep]);

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
      <AnimatePresence mode="wait">
        {celebrating ? (
          <CelebrationStep key="celebration" onDone={() => setCelebrating(false)} />
        ) : active ? (
          active.renderMode === 'spotlight' && active.spotlight ? (
            <SpotlightStep
              key={active.def.key}
              state={active.spotlight}
              stepIndex={active.stepIndex}
              total={active.total}
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
              onAction={() => runAction(active.def)}
              onNext={advance}
              onSkip={dismissAll}
            />
          )
        ) : null}
      </AnimatePresence>
    </CoachmarkContext.Provider>
  );
};

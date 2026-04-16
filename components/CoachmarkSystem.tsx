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

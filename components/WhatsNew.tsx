/**
 * WhatsNew - refined release highlights surface.
 *
 * The old version leaned heavily on decoration and gesture-only navigation.
 * This version keeps motion, but makes the hierarchy, controls, and pacing
 * much more intentional so the screen feels premium instead of noisy.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence, PanInfo, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Gift,
  Hourglass,
  Mic,
  Sparkles,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FeatureDiscovery } from '../services/featureDiscovery';
import { Haptics } from '../services/haptics';

interface Feature {
  key: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  routeHint: string;
  highlights: string[];
  gradient: string;
  glow: string;
  accent: string;
}

const FEATURES: Feature[] = [
  {
    key: 'video',
    icon: Clapperboard,
    eyebrow: 'Premium',
    title: 'Video Memories',
    description:
      'Add motion to the moments that matter. Save short videos to your timeline, daily memories, and keepsake vault.',
    routeHint: 'Timeline, Daily Moments, Keepsakes',
    highlights: ['Short clips', 'Private to both of you', 'Works with your story archive'],
    gradient: 'linear-gradient(145deg, #27131d 0%, #6b2142 46%, #f76792 100%)',
    glow: 'radial-gradient(circle at 20% 20%, rgba(247,103,146,0.42), transparent 56%)',
    accent: '#f76792',
  },
  {
    key: 'timecapsule',
    icon: Hourglass,
    eyebrow: 'New',
    title: 'Time Capsule',
    description:
      'Write to your future selves, seal it today, and let the app unlock it exactly when the moment arrives.',
    routeHint: 'Us, private rituals',
    highlights: ['Delayed delivery', 'One shared unlock date', 'Built for milestone moments'],
    gradient: 'linear-gradient(145deg, #16132a 0%, #50308c 52%, #b78cff 100%)',
    glow: 'radial-gradient(circle at 18% 18%, rgba(183,140,255,0.38), transparent 56%)',
    accent: '#b78cff',
  },
  {
    key: 'surprises',
    icon: Gift,
    eyebrow: 'New',
    title: 'Surprises',
    description:
      'Hide plans, notes, and sweet little reveals for a future date. The app keeps the secret until it is time.',
    routeHint: 'Special moments, future reveals',
    highlights: ['Scheduled reveal', 'Playful setup', 'Feels intentional, not gimmicky'],
    gradient: 'linear-gradient(145deg, #22160a 0%, #8f4d12 48%, #ffd166 100%)',
    glow: 'radial-gradient(circle at 22% 16%, rgba(255,209,102,0.38), transparent 58%)',
    accent: '#ffb84d',
  },
  {
    key: 'voicenotes',
    icon: Mic,
    eyebrow: 'New',
    title: 'Voice Notes',
    description:
      'Leave something they can hear, not just read. Record a voice note they can replay whenever they need you.',
    routeHint: 'Messages that sound like you',
    highlights: ['Quick recording', 'More personal than text', 'Replay whenever it matters'],
    gradient: 'linear-gradient(145deg, #091b24 0%, #0f4c68 50%, #5fd6ff 100%)',
    glow: 'radial-gradient(circle at 24% 18%, rgba(95,214,255,0.38), transparent 56%)',
    accent: '#5fd6ff',
  },
  {
    key: 'yearinreview',
    icon: Sparkles,
    eyebrow: 'New',
    title: 'Year in Review',
    description:
      'A more beautiful way to look back. See the habits, milestones, memories, and little signals that shaped your year together.',
    routeHint: 'Premium reflection feature',
    highlights: ['Storytelling recap', 'Shared stats', 'Designed to feel celebratory'],
    gradient: 'linear-gradient(145deg, #0f1a17 0%, #0e5f4b 48%, #6be6bf 100%)',
    glow: 'radial-gradient(circle at 18% 18%, rgba(107,230,191,0.38), transparent 56%)',
    accent: '#6be6bf',
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 64 : -64,
    opacity: 0,
    scale: 0.96,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, damping: 26, stiffness: 290, mass: 0.92 },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -64 : 64,
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const },
  }),
};

const FeatureStage: React.FC<{ feature: Feature; reducedMotion: boolean }> = ({ feature, reducedMotion }) => {
  const Icon = feature.icon;

  return (
    <div
      className="relative overflow-hidden rounded-[2rem] border border-white/12"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 20px 60px rgba(0,0,0,0.28)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: feature.glow }} />
      <div className="absolute inset-x-0 top-0 h-px bg-white/20" />

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className="inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em]"
              style={{
                color: 'rgba(255,255,255,0.72)',
                borderColor: 'rgba(255,255,255,0.14)',
                background: 'rgba(9,10,15,0.22)',
              }}
            >
              {feature.eyebrow}
            </div>
            <h2 className="mt-4 font-serif text-[2rem] leading-[1.02] text-white">{feature.title}</h2>
            <p className="mt-3 text-[14px] leading-6 text-white/72">{feature.description}</p>
          </div>

          <motion.div
            animate={
              reducedMotion
                ? undefined
                : { y: [0, -5, 0], rotate: [0, -3, 0, 3, 0] }
            }
            transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
            className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.35rem]"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)',
              border: '1px solid rgba(255,255,255,0.16)',
              boxShadow: '0 14px 30px rgba(0,0,0,0.2)',
            }}
          >
            <div
              className="absolute inset-0 rounded-[1.35rem]"
              style={{ background: 'linear-gradient(140deg, rgba(255,255,255,0.24), transparent 60%)' }}
            />
            <Icon size={28} strokeWidth={2.2} color={feature.accent} className="relative z-10" />
          </motion.div>
        </div>

        <div className="mt-5 grid grid-cols-[1.15fr_0.85fr] gap-3">
          <div
            className="rounded-[1.6rem] border p-4"
            style={{
              background: 'rgba(7,8,12,0.2)',
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Highlights</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {feature.highlights.map((item) => (
                <span
                  key={item}
                  className="rounded-full border px-3 py-1.5 text-[11px] font-semibold text-white/78"
                  style={{
                    borderColor: 'rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  {item}
                </span>
              ))}
            </div>

            <div
              className="mt-4 rounded-[1.25rem] border px-3 py-3"
              style={{
                borderColor: 'rgba(255,255,255,0.1)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Where to find it</p>
              <p className="mt-2 text-[12px] font-semibold text-white/84">{feature.routeHint}</p>
            </div>
          </div>

          <div className="relative min-h-[200px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/14">
            <motion.div
              animate={
                reducedMotion
                  ? undefined
                  : { y: [0, -6, 0], rotate: [0, -1.5, 0, 1.5, 0] }
              }
              transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut', delay: 0.25 }}
              className="absolute left-1/2 top-8 h-[144px] w-[92px] -translate-x-1/2 rounded-[1.45rem] border border-white/14"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))',
                boxShadow: '0 18px 34px rgba(0,0,0,0.22)',
              }}
            >
              <div className="absolute inset-x-3 top-3 h-3 rounded-full bg-white/14" />
              <div className="absolute inset-x-3 top-9 h-[52px] rounded-[1rem]" style={{ background: feature.gradient }} />
              <div className="absolute inset-x-3 bottom-12 h-2 rounded-full bg-white/12" />
              <div className="absolute inset-x-3 bottom-7 h-2 rounded-full bg-white/8" />
            </motion.div>

            <motion.div
              animate={reducedMotion ? undefined : { x: [0, 6, 0] }}
              transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute bottom-5 left-4 right-4 rounded-[1.15rem] border border-white/10 px-3 py-3"
              style={{ background: 'rgba(8,10,15,0.28)', backdropFilter: 'blur(14px)' }}
            >
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: feature.accent }} />
                <div className="h-2.5 flex-1 rounded-full bg-white/12" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-2 rounded-full bg-white/12" />
                <div className="h-2 w-3/4 rounded-full bg-white/10" />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface WhatsNewProps {
  onClose: () => void;
}

export const WhatsNew: React.FC<WhatsNewProps> = ({ onClose }) => {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const reducedMotion = useReducedMotion();

  const feature = FEATURES[index];
  const isFirst = index === 0;
  const isLast = index === FEATURES.length - 1;

  const progressLabel = useMemo(
    () => `${String(index + 1).padStart(2, '0')} / ${String(FEATURES.length).padStart(2, '0')}`,
    [index],
  );

  const markSeenAndClose = useCallback(async () => {
    FeatureDiscovery.markCurrentVersionSeen();
    await Haptics.softTap();
    onClose();
  }, [onClose]);

  const goNext = useCallback(async () => {
    await Haptics.select();
    if (isLast) {
      FeatureDiscovery.markCurrentVersionSeen();
      await Haptics.success();
      onClose();
      return;
    }

    setDirection(1);
    setIndex((current) => Math.min(current + 1, FEATURES.length - 1));
  }, [isLast, onClose]);

  const goPrev = useCallback(async () => {
    if (isFirst) return;
    await Haptics.select();
    setDirection(-1);
    setIndex((current) => Math.max(current - 1, 0));
  }, [isFirst]);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const velocity = Math.abs(info.velocity.x);
      const offset = info.offset.x;

      if (offset < -96 || (offset < -52 && velocity > 500)) {
        void goNext();
        return;
      }

      if (offset > 96 || (offset > 52 && velocity > 500)) {
        void goPrev();
      }
    },
    [goNext, goPrev],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] overflow-hidden"
      style={{ background: '#09080d' }}
    >
      <motion.div
        key={`${feature.key}-backdrop`}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.03 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reducedMotion ? 0.2 : 0.45 }}
        className="absolute inset-0"
        style={{ background: feature.gradient }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at top, rgba(255,255,255,0.2), transparent 34%), linear-gradient(180deg, rgba(8,10,15,0.14) 0%, rgba(8,10,15,0.72) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px]"
        style={{ background: feature.glow, filter: 'blur(24px)', opacity: 0.95 }}
      />

      <div className="relative z-10 flex h-full flex-col px-4 pt-safe sm:px-6">
        <div className="flex items-center justify-between gap-4 px-1 pt-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-white/52">What&apos;s new</p>
            <h1 className="mt-2 font-serif text-[1.45rem] leading-none text-white">Fresh things to explore together</h1>
          </div>

          <button
            type="button"
            onClick={() => void markSeenAndClose()}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/12 text-white/78"
            style={{ backdropFilter: 'blur(18px)' }}
            aria-label="Close what's new"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 px-1">
          <div className="flex flex-1 gap-2">
            {FEATURES.map((item, itemIndex) => (
              <div
                key={item.key}
                className="h-[4px] flex-1 overflow-hidden rounded-full bg-white/14"
                aria-hidden="true"
              >
                <motion.div
                  animate={{
                    width:
                      itemIndex < index
                        ? '100%'
                        : itemIndex === index
                          ? '100%'
                          : '0%',
                  }}
                  transition={{ duration: 0.28 }}
                  className="h-full rounded-full"
                  style={{ background: itemIndex <= index ? 'rgba(255,255,255,0.95)' : 'transparent' }}
                />
              </div>
            ))}
          </div>
          <span className="text-[11px] font-bold tracking-[0.22em] text-white/52">{progressLabel}</span>
        </div>

        <div className="flex flex-1 items-center py-6">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={feature.key}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.08}
              onDragEnd={handleDragEnd}
              className="w-full"
              style={{ touchAction: 'pan-y' }}
            >
              <FeatureStage feature={feature} reducedMotion={!!reducedMotion} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div
          className="mb-6 rounded-[1.75rem] border border-white/10 p-3"
          style={{ background: 'rgba(7,8,12,0.22)', backdropFilter: 'blur(18px)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void goPrev()}
              disabled={isFirst}
              className="inline-flex h-12 min-w-[112px] items-center justify-center gap-2 rounded-[1.1rem] border border-white/12 bg-white/6 px-4 text-sm font-semibold text-white transition disabled:cursor-default disabled:opacity-35"
            >
              <ArrowLeft size={16} strokeWidth={2.2} />
              Back
            </button>

            <button
              type="button"
              onClick={() => void goNext()}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[1.1rem] px-4 text-sm font-bold text-[#100d15]"
              style={{
                background: 'rgba(255,255,255,0.96)',
                boxShadow: '0 16px 32px rgba(0,0,0,0.2)',
              }}
            >
              {isLast ? 'Start exploring' : 'Next feature'}
              <ArrowRight size={16} strokeWidth={2.4} />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 px-1">
            <p className="text-[12px] text-white/45">{isLast ? 'You are ready to jump in.' : 'Swipe or use the buttons to move through the release.'}</p>
            <button
              type="button"
              onClick={() => void markSeenAndClose()}
              className="text-[12px] font-semibold text-white/58"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

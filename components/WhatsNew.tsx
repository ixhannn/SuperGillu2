/**
 * WhatsNew - refined release highlights surface.
 *
 * Goals:
 * - only surface meaningful feature drops, not every build
 * - feel premium on small screens instead of cramped
 * - show data-shaped previews instead of decorative placeholders
 * - keep transitions immediate and easy to scan
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
import { APP_VERSION } from '../appVersion';
import { FeatureDiscovery } from '../services/featureDiscovery';
import { Haptics } from '../services/haptics';

interface Feature {
  key: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  what: string;
  where: string;
  metricA: string;
  metricB: string;
  accent: string;
  tint: string;
}

const FEATURES: Feature[] = [
  {
    key: 'video',
    icon: Clapperboard,
    eyebrow: 'Premium',
    title: 'Video Memories',
    what: 'Save short clips beside your photos and keepsakes.',
    where: 'Timeline, Daily Moments, Keepsakes',
    metricA: '12s clip',
    metricB: 'HD keepsake',
    accent: '#b66f86',
    tint: '#f7e8ee',
  },
  {
    key: 'timecapsule',
    icon: Hourglass,
    eyebrow: 'New',
    title: 'Time Capsule',
    what: 'Lock a note and reopen it on a future date.',
    where: 'Us, milestone rituals',
    metricA: '1 locked note',
    metricB: 'Opens Jun 14',
    accent: '#8177b8',
    tint: '#ece9f8',
  },
  {
    key: 'surprises',
    icon: Gift,
    eyebrow: 'New',
    title: 'Surprises',
    what: 'Hide a plan or note until the reveal day.',
    where: 'Future plans, little reveals',
    metricA: '1 hidden plan',
    metricB: 'Reveal Friday',
    accent: '#b98745',
    tint: '#f7edda',
  },
  {
    key: 'voicenotes',
    icon: Mic,
    eyebrow: 'New',
    title: 'Voice Notes',
    what: 'Send a short note they can hear again later.',
    where: 'Voice Notes',
    metricA: '0:28 note',
    metricB: 'Played 3x',
    accent: '#4d8fa5',
    tint: '#e2f1f4',
  },
  {
    key: 'yearinreview',
    icon: Sparkles,
    eyebrow: 'New',
    title: 'Year in Review',
    what: 'Review the moments and rituals that shaped the year.',
    where: 'Reflection and recap surfaces',
    metricA: '84 memories',
    metricB: '92% sync',
    accent: '#5f9b82',
    tint: '#e3f2eb',
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 36 : -36,
    opacity: 0,
    scale: 0.985,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      damping: 24,
      stiffness: 260,
      mass: 0.82,
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -32 : 32,
    opacity: 0,
    scale: 0.985,
    transition: { duration: 0.16, ease: [0.32, 0, 0.67, 0] as const },
  }),
};

const DetailLine: React.FC<{ label: string; body: string; accent: string }> = ({ label, body, accent }) => (
  <div
    className="flex gap-2 rounded-[0.75rem] px-2.5 py-2"
    style={{ background: `linear-gradient(135deg, ${accent}10, rgba(255,255,255,0.64))` }}
  >
    <p className="w-11 shrink-0 text-[10px] font-medium" style={{ color: accent }}>{label}</p>
    <p className="text-[12px] leading-5" style={{ color: '#374151' }}>{body}</p>
  </div>
);

const TinyPreview: React.FC<{ feature: Feature; reducedMotion: boolean }> = ({ feature, reducedMotion }) => (
  <motion.div
    className="rounded-[0.85rem] p-2.5"
    initial={reducedMotion ? false : { opacity: 0, y: 6 }}
    animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    style={{
      background: `linear-gradient(135deg, ${feature.accent}14, ${feature.tint})`,
      border: `1px solid ${feature.accent}22`,
    }}
  >
    <div className="flex items-center gap-2">
      <motion.div
        className="flex h-8 w-8 items-center justify-center rounded-[0.65rem]"
        animate={reducedMotion ? undefined : { rotate: [0, -3, 0, 3, 0], scale: [1, 1.04, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: 'rgba(255,255,255,0.58)' }}
      >
        <feature.icon size={15} color={feature.accent} />
      </motion.div>
      <p className="text-[11px] font-medium" style={{ color: '#334155' }}>{feature.metricA} / {feature.metricB}</p>
    </div>
    <div className="mt-2.5 space-y-1.5">
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.76)' }} />
      <motion.div
        animate={reducedMotion ? undefined : { scaleX: [0.58, 0.74, 0.58] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        className="h-1.5 w-full origin-left rounded-full"
        style={{ background: feature.accent }}
      />
      <div className="h-1.5 w-2/3 rounded-full" style={{ background: 'rgba(255,255,255,0.62)' }} />
    </div>
  </motion.div>
);

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

  const progressScale = useMemo(
    () => (index + 1) / FEATURES.length,
    [index],
  );

  const markSeenAndClose = useCallback(() => {
    FeatureDiscovery.markCurrentVersionSeen();
    onClose();
    void Haptics.softTap();
  }, [onClose]);

  const jumpTo = useCallback((nextIndex: number) => {
    if (nextIndex === index) return;
    setDirection(nextIndex > index ? 1 : -1);
    setIndex(nextIndex);
    void Haptics.select();
  }, [index]);

  const goNext = useCallback(() => {
    if (isLast) {
      FeatureDiscovery.markCurrentVersionSeen();
      onClose();
      void Haptics.success();
      return;
    }

    setDirection(1);
    setIndex((current) => Math.min(current + 1, FEATURES.length - 1));
    void Haptics.select();
  }, [isLast, onClose]);

  const goPrev = useCallback(() => {
    if (isFirst) return;
    setDirection(-1);
    setIndex((current) => Math.max(current - 1, 0));
    void Haptics.select();
  }, [isFirst]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] overflow-y-auto"
      style={{
        background: `linear-gradient(135deg, ${feature.tint} 0%, #f4efe8 46%, #e8f3f2 100%)`,
        overscrollBehavior: 'contain',
      }}
    >
      <div
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-4"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 16px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        }}
      >
        <div
          className="relative my-auto overflow-hidden rounded-[0.9rem] border"
          style={{
            borderColor: 'rgba(136,145,160,0.22)',
            background: `linear-gradient(150deg, ${feature.tint}b8, rgba(255,255,255,0.8))`,
            boxShadow: `0 12px 32px ${feature.accent}1f`,
            backdropFilter: 'blur(18px)',
          }}
        >
          <div
            className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full"
            style={{ background: `radial-gradient(circle, ${feature.accent}40 0%, transparent 70%)` }}
          />
          <div className="border-b px-3 py-2.5" style={{ borderColor: 'rgba(136,145,160,0.16)', background: 'rgba(255,255,255,0.26)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em]" style={{ borderColor: `${feature.accent}40`, color: '#475569', background: 'rgba(255,255,255,0.58)' }}>
                    What&apos;s new
                  </span>
                  <span className="rounded-full px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em]" style={{ background: `${feature.accent}1f`, color: '#475569' }}>
                    v{APP_VERSION}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <motion.span
                    className="h-2 w-2 rounded-full"
                    animate={reducedMotion ? undefined : { scale: [1, 1.35, 1], opacity: [0.65, 1, 0.65] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ background: feature.accent }}
                  />
                  <h1 className="font-serif text-[1.05rem] leading-[1.1]" style={{ color: '#1f2937' }}>
                  New features
                  </h1>
                </div>
              </div>

              <motion.button
                type="button"
                onClick={markSeenAndClose}
                whileTap={reducedMotion ? undefined : { scale: 0.94 }}
                whileHover={reducedMotion ? undefined : { y: -1 }}
                className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: 'rgba(136,145,160,0.2)', color: '#64748b', background: 'rgba(255,255,255,0.46)' }}
                aria-label="Close what's new"
              >
                <X size={15} strokeWidth={2.2} />
              </motion.button>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <div className="relative h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.56)' }}>
                <motion.div
                  animate={{ scaleX: progressScale }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
                  style={{ background: feature.accent }}
                />
              </div>
              <span className="text-[10px] font-semibold" style={{ color: feature.accent }}>{progressLabel}</span>
            </div>

            <div className="mt-2 flex justify-center gap-1">
              {FEATURES.map((item, itemIndex) => {
                const active = itemIndex === index;
                return (
                  <motion.button
                    key={item.key}
                    type="button"
                    onClick={() => jumpTo(itemIndex)}
                    whileTap={reducedMotion ? undefined : { scale: 0.9 }}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-full"
                    aria-label={`Show ${item.title}`}
                    aria-current={active ? 'step' : undefined}
                  >
                    <motion.span
                      className="block rounded-full transition"
                      animate={active && !reducedMotion ? { scale: [1, 1.18, 1] } : undefined}
                      transition={{ duration: 0.3 }}
                      style={{
                        width: active ? 18 : 6,
                        height: 6,
                        background: active ? item.accent : 'rgba(105,115,134,0.28)',
                      }}
                    />
                    </motion.button>
                  );
                })}
            </div>
          </div>

          <div className="p-3">
            <AnimatePresence custom={direction} initial={false} mode="wait">
              <motion.div
                key={feature.key}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="grid gap-2.5"
              >
                <motion.div
                  className="rounded-[0.85rem] p-2.5"
                  whileHover={reducedMotion ? undefined : { y: -1 }}
                  style={{
                    background: `linear-gradient(135deg, ${feature.accent}12, ${feature.tint}, rgba(255,255,255,0.34))`,
                    border: `1px solid ${feature.accent}22`,
                  }}
                >
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em]"
                    style={{ background: 'rgba(255,255,255,0.62)', color: feature.accent }}
                  >
                    {feature.eyebrow}
                  </span>
                  <h2 className="mt-1.5 font-serif text-[1.1rem] leading-[1.1]" style={{ color: '#1f2937' }}>
                    {feature.title}
                  </h2>
                  <div className="mt-2 grid gap-1.5">
                    <DetailLine label="New" body={feature.what} accent={feature.accent} />
                  </div>
                  <div className="mt-2 rounded-[0.75rem] px-2.5 py-2" style={{ background: `linear-gradient(135deg, ${feature.accent}0f, rgba(255,255,255,0.56))` }}>
                    <p className="text-[10px] font-medium" style={{ color: '#64748b' }}>Open</p>
                    <p className="mt-0.5 text-[12px] font-medium" style={{ color: '#1f2937' }}>{feature.where}</p>
                  </div>
                </motion.div>
                <TinyPreview feature={feature} reducedMotion={!!reducedMotion} />
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="border-t px-3 py-2.5" style={{ borderColor: 'rgba(136,145,160,0.16)', background: 'rgba(255,255,255,0.32)' }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px]" style={{ color: '#475569' }}>
                {isLast ? 'All set.' : 'Quick tour.'}
              </p>
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={goPrev}
                  disabled={isFirst}
                  whileTap={reducedMotion || isFirst ? undefined : { scale: 0.96 }}
                  whileHover={reducedMotion || isFirst ? undefined : { y: -1 }}
                  className="inline-flex min-h-11 min-w-[74px] items-center justify-center gap-1 rounded-[0.75rem] border px-2 text-[12px] font-medium transition disabled:cursor-default disabled:opacity-35"
                  style={{ borderColor: 'rgba(136,145,160,0.22)', color: '#475569', background: 'rgba(255,255,255,0.48)' }}
                >
                  <ArrowLeft size={13} strokeWidth={2.2} />
                  Back
                </motion.button>
                <motion.button
                  type="button"
                  onClick={goNext}
                  whileTap={reducedMotion ? undefined : { scale: 0.96 }}
                  whileHover={reducedMotion ? undefined : { y: -1 }}
                  className="inline-flex min-h-11 min-w-[90px] items-center justify-center gap-1 rounded-[0.75rem] px-3 text-[12px] font-medium"
                  style={{
                    color: '#29313d',
                    background: `linear-gradient(135deg, ${feature.tint}, rgba(255,255,255,0.54))`,
                    border: `1px solid ${feature.accent}55`,
                    boxShadow: `0 4px 14px ${feature.accent}24`,
                  }}
                >
                  {isLast ? 'Done' : 'Next'}
                  <ArrowRight size={13} strokeWidth={2.4} />
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

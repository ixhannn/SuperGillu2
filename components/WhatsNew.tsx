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

type PreviewKind = 'video' | 'timecapsule' | 'surprises' | 'voicenotes' | 'yearinreview';

interface Feature {
  key: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  what: string;
  why: string;
  where: string;
  bullets: string[];
  metricA: string;
  metricB: string;
  previewKind: PreviewKind;
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
    what: 'Capture short moving moments across your timeline, daily drops, and keepsake vault.',
    why: 'Some memories lose their feeling when reduced to a still frame. Motion restores tone, energy, and presence.',
    where: 'Timeline, Daily Moments, Keepsakes',
    bullets: ['Clip-first storytelling', 'Private to your shared space', 'Fits existing memory flows'],
    metricA: '12s clip',
    metricB: 'HD keepsake',
    previewKind: 'video',
    gradient: 'linear-gradient(145deg, #231018 0%, #69213f 44%, #ff7fa7 100%)',
    glow: 'radial-gradient(circle at 18% 18%, rgba(255,127,167,0.42), transparent 58%)',
    accent: '#ff7fa7',
  },
  {
    key: 'timecapsule',
    icon: Hourglass,
    eyebrow: 'New',
    title: 'Time Capsule',
    what: 'Write something today, lock it, and let it reopen at the exact future moment you choose.',
    why: 'It turns anticipation into part of the experience instead of making every message immediately consumable.',
    where: 'Us, milestone rituals',
    bullets: ['Scheduled unlock', 'Shared future reveal', 'Built for anniversaries and promises'],
    metricA: '1 locked note',
    metricB: 'Opens Jun 14',
    previewKind: 'timecapsule',
    gradient: 'linear-gradient(145deg, #171426 0%, #493186 50%, #baa0ff 100%)',
    glow: 'radial-gradient(circle at 18% 18%, rgba(186,160,255,0.4), transparent 56%)',
    accent: '#baa0ff',
  },
  {
    key: 'surprises',
    icon: Gift,
    eyebrow: 'New',
    title: 'Surprises',
    what: 'Prepare hidden reveals, plans, or notes that stay secret until the chosen date arrives.',
    why: 'It makes the app feel playful and intentional by giving future moments a real setup instead of a plain reminder.',
    where: 'Future plans, little reveals',
    bullets: ['Secret until reveal', 'Date-based delivery', 'Designed for delight, not clutter'],
    metricA: '1 hidden plan',
    metricB: 'Reveal Friday',
    previewKind: 'surprises',
    gradient: 'linear-gradient(145deg, #22170a 0%, #8c4e18 48%, #ffd676 100%)',
    glow: 'radial-gradient(circle at 22% 16%, rgba(255,214,118,0.38), transparent 58%)',
    accent: '#ffd676',
  },
  {
    key: 'voicenotes',
    icon: Mic,
    eyebrow: 'New',
    title: 'Voice Notes',
    what: 'Leave something they can hear, not just read, and replay when they miss your voice.',
    why: 'Audio carries reassurance and tone much faster than text, especially for quiet check-ins and intimate moments.',
    where: 'Voice Notes',
    bullets: ['Fast record and send', 'Replay anytime', 'More personal than text'],
    metricA: '0:28 note',
    metricB: 'Played 3x',
    previewKind: 'voicenotes',
    gradient: 'linear-gradient(145deg, #0a1a24 0%, #0f4d67 50%, #6fe1ff 100%)',
    glow: 'radial-gradient(circle at 24% 18%, rgba(111,225,255,0.4), transparent 56%)',
    accent: '#6fe1ff',
  },
  {
    key: 'yearinreview',
    icon: Sparkles,
    eyebrow: 'New',
    title: 'Year in Review',
    what: 'See the memories, rituals, moods, and milestones that shaped your year together.',
    why: 'It reframes accumulated activity into a shared story, which gives premium reflection features a clearer emotional payoff.',
    where: 'Reflection and recap surfaces',
    bullets: ['Story-first recap', 'Shared stats', 'Celebratory visual rhythm'],
    metricA: '84 memories',
    metricB: '92% sync',
    previewKind: 'yearinreview',
    gradient: 'linear-gradient(145deg, #0c1a16 0%, #0e5e4b 46%, #79efc7 100%)',
    glow: 'radial-gradient(circle at 18% 18%, rgba(121,239,199,0.38), transparent 56%)',
    accent: '#79efc7',
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

const floatingTransition = {
  duration: 4.6,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

const SectionCard: React.FC<{ label: string; body: string; accent: string }> = ({ label, body, accent }) => (
  <div
    className="rounded-[1.35rem] border p-4 sm:p-4.5"
    style={{
      background: 'linear-gradient(180deg, rgba(255,250,246,0.96), rgba(255,244,238,0.92))',
      borderColor: 'rgba(126,68,80,0.12)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 10px 24px rgba(42,24,33,0.08)',
    }}
  >
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
      <p className="text-[11px] font-bold uppercase tracking-[0.26em]" style={{ color: 'rgba(102,68,77,0.72)' }}>{label}</p>
    </div>
    <p className="mt-3 text-[14px] leading-6" style={{ color: '#2b1c25' }}>{body}</p>
  </div>
);

const FeatureMetrics: React.FC<{ feature: Feature }> = ({ feature }) => (
  <div className="grid grid-cols-2 gap-3">
    {[feature.metricA, feature.metricB].map((metric) => (
      <div
        key={metric}
        className="rounded-[1.2rem] border px-4 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(255,250,246,0.94), rgba(255,244,238,0.9))',
          borderColor: 'rgba(126,68,80,0.12)',
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(102,68,77,0.68)' }}>Snapshot</p>
        <p className="mt-2 text-[14px] font-semibold" style={{ color: '#241720' }}>{metric}</p>
      </div>
    ))}
  </div>
);

const MiniFeaturePreview: React.FC<{ feature: Feature; reducedMotion: boolean }> = ({ feature, reducedMotion }) => {
  if (feature.previewKind === 'video') {
    return (
      <div className="relative h-[218px] sm:h-[340px]">
        <motion.div
          animate={reducedMotion ? undefined : { y: [0, -6, 0], rotate: [0, -1.25, 0, 1.25, 0] }}
          transition={floatingTransition}
          className="absolute left-1/2 top-3 h-[176px] w-[106px] -translate-x-1/2 rounded-[1.55rem] border sm:top-4 sm:h-[208px] sm:w-[124px] sm:rounded-[1.75rem]"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.07))',
            borderColor: 'rgba(255,255,255,0.16)',
            boxShadow: '0 22px 48px rgba(0,0,0,0.3)',
          }}
        >
          <div className="absolute inset-x-4 top-4 h-3 rounded-full bg-white/18" />
          <div className="absolute inset-x-3 top-10 h-[104px] overflow-hidden rounded-[1.2rem]" style={{ background: feature.gradient }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.28),transparent_48%)]" />
            <motion.div
              animate={reducedMotion ? undefined : { scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/24 backdrop-blur-sm">
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '8px solid transparent',
                    borderBottom: '8px solid transparent',
                    borderLeft: `14px solid ${feature.accent}`,
                    marginLeft: 4,
                  }}
                />
              </div>
            </motion.div>
          </div>
          <div className="absolute inset-x-4 bottom-14 h-2 rounded-full bg-white/14" />
          <div className="absolute inset-x-4 bottom-9 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ background: feature.accent }} />
            <div className="h-2 flex-1 rounded-full bg-white/10" />
            <div className="h-2 w-6 rounded-full bg-white/10" />
          </div>
        </motion.div>

        <motion.div
          animate={reducedMotion ? undefined : { x: [0, 6, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-3 left-0 right-0 mx-auto w-[90%] rounded-[1.2rem] border p-3 sm:bottom-5 sm:w-[88%] sm:rounded-[1.4rem] sm:p-4"
          style={{
            background: 'rgba(255,250,246,0.84)',
            borderColor: 'rgba(109,70,84,0.12)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] sm:text-[11px]" style={{ color: 'rgba(96,66,75,0.74)' }}>Clip ready</p>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'rgba(122,84,98,0.08)', color: '#261922' }}>
              0:12
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-2 rounded-full" style={{ background: 'rgba(94,66,78,0.16)' }} />
            <div className="h-2 w-4/5 rounded-full" style={{ background: 'rgba(94,66,78,0.11)' }} />
          </div>
        </motion.div>
      </div>
    );
  }

  if (feature.previewKind === 'timecapsule') {
    return (
      <div className="relative h-[218px] sm:h-[340px]">
        <motion.div
          animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
          transition={floatingTransition}
          className="absolute left-1/2 top-4 w-[90%] -translate-x-1/2 rounded-[1.45rem] border p-4 sm:top-6 sm:w-[88%] sm:rounded-[1.7rem] sm:p-5"
          style={{
            background: 'linear-gradient(180deg, rgba(255,250,246,0.9), rgba(255,244,238,0.82))',
            borderColor: 'rgba(126,68,80,0.12)',
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] sm:text-[11px]" style={{ color: 'rgba(96,66,75,0.74)' }}>Locked message</p>
            <span className="rounded-full px-3 py-1 text-[10px] font-semibold" style={{ background: 'rgba(122,84,98,0.08)', color: '#261922' }}>
              Jun 14
            </span>
          </div>
          <div className="mt-4 rounded-[1.35rem] p-4" style={{ background: feature.gradient }}>
            <div className="h-3 w-24 rounded-full bg-white/20" />
            <div className="mt-3 h-2 rounded-full bg-white/18" />
            <div className="mt-2 h-2 w-4/5 rounded-full bg-white/14" />
            <div className="mt-2 h-2 w-2/3 rounded-full bg-white/12" />
          </div>
        </motion.div>

        <div className="absolute bottom-4 left-1/2 flex w-[88%] -translate-x-1/2 items-center justify-between rounded-[1.15rem] border px-3 py-2.5 sm:bottom-8 sm:w-[84%] sm:rounded-[1.35rem] sm:px-4 sm:py-3" style={{
          background: 'rgba(255,250,246,0.84)',
          borderColor: 'rgba(109,70,84,0.12)',
          backdropFilter: 'blur(14px)',
        }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(96,66,75,0.72)' }}>Unlock path</p>
            <p className="mt-1 text-[12px] font-semibold sm:text-[13px]" style={{ color: '#241720' }}>Today → sealed → reveal</p>
          </div>
          <motion.div
            animate={reducedMotion ? undefined : { rotate: [0, 180, 360] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="flex h-11 w-11 items-center justify-center rounded-full border"
            style={{ borderColor: 'rgba(109,70,84,0.12)', background: 'rgba(122,84,98,0.06)' }}
          >
            <Hourglass size={18} color={feature.accent} />
          </motion.div>
        </div>
      </div>
    );
  }

  if (feature.previewKind === 'surprises') {
    return (
      <div className="relative h-[218px] sm:h-[340px]">
        <motion.div
          animate={reducedMotion ? undefined : { scale: [1, 1.018, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/2 top-4 w-[88%] -translate-x-1/2 rounded-[1.35rem] border p-3 sm:top-7 sm:w-[80%] sm:rounded-[1.6rem] sm:p-4"
          style={{
            background: 'rgba(255,250,246,0.88)',
            borderColor: 'rgba(126,68,80,0.12)',
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              animate={reducedMotion ? undefined : { rotate: [0, -4, 0], y: [0, -4, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              className="rounded-[1.25rem] p-4"
              style={{ background: feature.gradient }}
            >
              <div className="mx-auto h-10 w-10 rounded-full border border-white/30" />
              <div className="mt-4 h-2 rounded-full bg-white/22" />
              <div className="mt-2 h-2 w-4/5 rounded-full bg-white/18" />
            </motion.div>
            <div className="rounded-[1.05rem] border p-3 sm:rounded-[1.25rem] sm:p-4" style={{ borderColor: 'rgba(109,70,84,0.12)', background: 'rgba(255,255,255,0.74)' }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(96,66,75,0.72)' }}>Hidden until</p>
              <p className="mt-2 text-[22px] font-serif sm:mt-3 sm:text-[24px]" style={{ color: '#241720' }}>Fri</p>
              <div className="mt-3 h-2 rounded-full" style={{ background: 'rgba(94,66,78,0.12)' }} />
              <div className="mt-2 h-2 w-2/3 rounded-full" style={{ background: 'rgba(94,66,78,0.1)' }} />
            </div>
          </div>
        </motion.div>

        <motion.div
          animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
          className="absolute bottom-4 left-1/2 flex w-[90%] -translate-x-1/2 items-center justify-between rounded-[1.15rem] border px-3 py-2.5 sm:bottom-8 sm:w-[86%] sm:rounded-[1.35rem] sm:px-4 sm:py-3"
          style={{
            background: 'rgba(255,250,246,0.84)',
            borderColor: 'rgba(109,70,84,0.12)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(96,66,75,0.72)' }}>Reveal state</p>
            <p className="mt-1 text-[12px] font-semibold sm:text-[13px]" style={{ color: '#241720' }}>Hidden now, opens later</p>
          </div>
          <Gift size={20} color={feature.accent} />
        </motion.div>
      </div>
    );
  }

  if (feature.previewKind === 'voicenotes') {
    return (
      <div className="relative h-[218px] sm:h-[340px]">
        <div className="absolute inset-x-0 top-4 mx-auto w-[90%] rounded-[1.45rem] border p-4 sm:top-7 sm:w-[88%] sm:rounded-[1.7rem] sm:p-5" style={{
          background: 'linear-gradient(180deg, rgba(255,250,246,0.92), rgba(255,244,238,0.84))',
          borderColor: 'rgba(126,68,80,0.12)',
        }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] sm:text-[11px]" style={{ color: 'rgba(96,66,75,0.72)' }}>Voice note</p>
              <p className="mt-1 text-[15px] font-semibold sm:text-[16px]" style={{ color: '#241720' }}>Saved for tonight</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'rgba(122,84,98,0.08)' }}>
              <Mic size={18} color={feature.accent} />
            </div>
          </div>

          <div className="mt-6 flex h-[118px] items-end justify-between gap-1.5">
            {Array.from({ length: 19 }, (_, index) => {
              const height = 20 + ((index * 17) % 70);
              return (
                <motion.span
                  key={index}
                  animate={reducedMotion ? undefined : { height: [height, height + 18, height] }}
                  transition={{
                    duration: 1.25 + ((index % 4) * 0.18),
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: index * 0.03,
                  }}
                  className="block w-full rounded-full"
                  style={{
                    height,
                    background: index % 3 === 0 ? feature.accent : 'rgba(94,66,78,0.18)',
                    maxWidth: 8,
                  }}
                />
              );
            })}
          </div>
        </div>

        <motion.div
          animate={reducedMotion ? undefined : { x: [0, 8, 0] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-4 left-1/2 flex w-[86%] -translate-x-1/2 items-center gap-3 rounded-[1.15rem] border px-3 py-2.5 sm:bottom-7 sm:w-[82%] sm:rounded-[1.25rem] sm:px-4 sm:py-3"
          style={{
            background: 'rgba(255,250,246,0.84)',
            borderColor: 'rgba(109,70,84,0.12)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: feature.accent }} />
          <div className="h-2 flex-1 rounded-full" style={{ background: 'rgba(94,66,78,0.14)' }} />
          <p className="text-[11px] font-semibold" style={{ color: '#241720' }}>0:28</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative h-[218px] sm:h-[340px]">
      <motion.div
        animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
        transition={floatingTransition}
        className="absolute inset-x-0 top-4 mx-auto w-[90%] rounded-[1.45rem] border p-4 sm:top-5 sm:w-[88%] sm:rounded-[1.75rem] sm:p-5"
        style={{
          background: 'linear-gradient(180deg, rgba(255,250,246,0.92), rgba(255,244,238,0.84))',
          borderColor: 'rgba(126,68,80,0.12)',
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[1.25rem] p-4" style={{ background: feature.gradient }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/56">Memories</p>
            <p className="mt-4 text-[2rem] font-serif leading-none text-white">84</p>
            <div className="mt-3 h-2 rounded-full bg-white/18" />
          </div>
          <div className="rounded-[1.05rem] border p-3 sm:rounded-[1.25rem] sm:p-4" style={{ borderColor: 'rgba(109,70,84,0.12)', background: 'rgba(255,255,255,0.74)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(96,66,75,0.72)' }}>Aura sync</p>
            <p className="mt-3 text-[1.75rem] font-serif leading-none sm:mt-4 sm:text-[2rem]" style={{ color: '#241720' }}>92%</p>
            <div className="mt-3 h-2 rounded-full" style={{ background: 'rgba(94,66,78,0.12)' }} />
          </div>
        </div>

        <div className="mt-4 rounded-[1.05rem] border p-3 sm:rounded-[1.25rem] sm:p-4" style={{ borderColor: 'rgba(109,70,84,0.12)', background: 'rgba(255,255,255,0.78)' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(96,66,75,0.72)' }}>Year rhythm</p>
          <div className="mt-4 flex items-end gap-2">
            {[44, 58, 50, 82, 68, 91, 76].map((value, index) => (
              <motion.div
                key={index}
                animate={reducedMotion ? undefined : { height: [`${value - 10}%`, `${value}%`, `${value - 10}%`] }}
                transition={{ duration: 2.8 + index * 0.12, repeat: Infinity, ease: 'easeInOut', delay: index * 0.08 }}
                className="flex-1 rounded-t-[0.8rem]"
                style={{ height: `${value}%`, minHeight: 30, background: index === 4 ? feature.accent : 'rgba(94,66,78,0.18)' }}
              />
            ))}
          </div>
        </div>
      </motion.div>
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

  const progressWidth = useMemo(
    () => `${((index + 1) / FEATURES.length) * 100}%`,
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
      style={{ background: '#140f16', overscrollBehavior: 'contain' }}
    >
      <motion.div
        key={`${feature.key}-backdrop`}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.02 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reducedMotion ? 0.18 : 0.34 }}
        className="absolute inset-0"
        style={{ background: feature.gradient }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at top, rgba(255,255,255,0.24), transparent 30%), linear-gradient(180deg, rgba(32,16,24,0.12) 0%, rgba(32,16,24,0.44) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px]"
        style={{ background: feature.glow, filter: 'blur(28px)', opacity: 0.95 }}
      />

      <div
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-4 sm:px-6"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 16px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        }}
      >
        <div
          className="my-auto overflow-hidden rounded-[1.65rem] border sm:rounded-[2rem]"
          style={{
            borderColor: 'rgba(255,255,255,0.14)',
            background: 'linear-gradient(180deg, rgba(255,250,246,0.16), rgba(255,242,236,0.1))',
            boxShadow: '0 30px 90px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.16)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div className="border-b px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-6" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.26em] text-white/62">
                    What&apos;s new
                  </span>
                  <span className="rounded-full bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/52">
                    v{APP_VERSION}
                  </span>
                </div>
                <h1 className="mt-3 max-w-[14ch] font-serif text-[1.55rem] leading-[0.95] text-white sm:max-w-none sm:text-[2.4rem]">
                  New things worth actually exploring
                </h1>
                <p className="mt-3 max-w-[58ch] text-[13px] leading-5 text-white/78 sm:text-[15px] sm:leading-6">
                  A cleaner walkthrough of the latest feature drop, with previews that mirror the real product patterns instead of generic promo cards.
                </p>
              </div>

              <button
                type="button"
                onClick={markSeenAndClose}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/12 text-white/78"
                style={{ backdropFilter: 'blur(18px)' }}
                aria-label="Close what's new"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-white/22">
                <motion.div
                  animate={{ width: progressWidth }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: 'rgba(255,250,246,0.98)' }}
                />
              </div>
              <span className="text-[11px] font-bold tracking-[0.24em] text-white/72">{progressLabel}</span>
            </div>

            <div className="mt-5 -mx-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <div className="flex min-w-max gap-2 px-1">
                {FEATURES.map((item, itemIndex) => {
                  const Icon = item.icon;
                  const active = itemIndex === index;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => jumpTo(itemIndex)}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-left transition"
                      style={{
                        borderColor: active ? 'rgba(255,248,242,0.4)' : 'rgba(255,248,242,0.16)',
                        background: active ? 'rgba(255,248,242,0.22)' : 'rgba(255,248,242,0.08)',
                        color: active ? '#fff8f3' : 'rgba(255,248,242,0.8)',
                      }}
                    >
                      <Icon size={14} strokeWidth={2.2} color={active ? item.accent : 'currentColor'} />
                      <span className="whitespace-nowrap text-[12px] font-semibold">{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <AnimatePresence custom={direction} initial={false} mode="wait">
              <motion.div
                key={feature.key}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
              className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:gap-6"
            >
                <section className="order-2 lg:order-1">
                  <div
                    className="rounded-[1.4rem] border p-4 sm:rounded-[1.8rem] sm:p-6"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,250,246,0.97), rgba(255,244,238,0.93))',
                      borderColor: 'rgba(126,68,80,0.12)',
                      boxShadow: '0 18px 42px rgba(42,24,33,0.08)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em]"
                        style={{
                          borderColor: 'rgba(126,68,80,0.12)',
                          background: 'rgba(122,84,98,0.06)',
                          color: 'rgba(96,66,75,0.78)',
                        }}
                      >
                        {feature.eyebrow}
                      </span>
                    </div>

                    <h2 className="mt-3 font-serif text-[1.6rem] leading-[0.98] sm:mt-4 sm:text-[2.5rem]" style={{ color: '#1f141c' }}>
                      {feature.title}
                    </h2>

                    <div className="mt-5 grid gap-3">
                      <SectionCard label="What it is" body={feature.what} accent={feature.accent} />
                      <SectionCard label="Why it matters" body={feature.why} accent={feature.accent} />
                      <SectionCard label="Where to find it" body={feature.where} accent={feature.accent} />
                    </div>

                    <div className="mt-5">
                      <FeatureMetrics feature={feature} />
                    </div>

                    <div className="mt-5 rounded-[1.35rem] border p-4" style={{
                      background: 'rgba(255,255,255,0.7)',
                      borderColor: 'rgba(126,68,80,0.12)',
                    }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(96,66,75,0.72)' }}>At a glance</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {feature.bullets.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                            style={{
                              borderColor: 'rgba(126,68,80,0.12)',
                              background: 'rgba(122,84,98,0.06)',
                              color: '#2a1b24',
                            }}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="order-1 lg:order-2">
                  <div
                    className="relative overflow-hidden rounded-[1.4rem] border p-3 sm:rounded-[1.9rem] sm:p-5"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,250,246,0.9), rgba(255,242,236,0.76))',
                      borderColor: 'rgba(126,68,80,0.12)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 18px 40px rgba(42,24,33,0.08)',
                    }}
                  >
                    <div className="absolute inset-0 pointer-events-none" style={{ background: feature.glow }} />
                    <div className="relative">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(96,66,75,0.72)' }}>Feature preview</p>
                          <p className="mt-1 text-[13px] font-semibold sm:text-[14px]" style={{ color: '#2a1b24' }}>Small, but shaped like the real thing</p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border" style={{
                          borderColor: 'rgba(126,68,80,0.12)',
                          background: 'rgba(255,255,255,0.58)',
                        }}>
                          <feature.icon size={20} strokeWidth={2.2} color={feature.accent} />
                        </div>
                      </div>

                      <div
                        className="mt-4 rounded-[1.25rem] border sm:rounded-[1.6rem]"
                        style={{
                          borderColor: 'rgba(126,68,80,0.12)',
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,246,241,0.86))',
                        }}
                      >
                        <MiniFeaturePreview feature={feature} reducedMotion={!!reducedMotion} />
                      </div>
                    </div>
                  </div>
                </section>
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            className="border-t px-4 pb-4 pt-4 sm:px-6 sm:pb-5"
            style={{
              borderColor: 'rgba(255,255,255,0.12)',
              background: 'linear-gradient(180deg, rgba(255,250,246,0.08), rgba(255,240,234,0.12))',
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] leading-5 text-white/76">
                {isLast
                  ? 'That is the full feature drop. This will stay hidden until the next release highlight set changes.'
                  : 'Use the chips or the buttons below. Navigation is immediate so the panel feels responsive on mobile too.'}
              </p>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={isFirst}
                  className="inline-flex h-11 min-w-[100px] items-center justify-center gap-2 rounded-[1rem] border px-4 text-sm font-semibold text-white transition disabled:cursor-default disabled:opacity-35 sm:h-12 sm:min-w-[108px] sm:rounded-[1.1rem]"
                  style={{ borderColor: 'rgba(255,248,242,0.18)', background: 'rgba(255,248,242,0.1)' }}
                >
                  <ArrowLeft size={16} strokeWidth={2.2} />
                  Back
                </button>

                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-[1rem] px-4 text-sm font-bold sm:h-12 sm:min-w-[156px] sm:rounded-[1.1rem] sm:px-5"
                  style={{
                    color: '#2a1722',
                    background: 'linear-gradient(180deg, rgba(255,250,246,0.98), rgba(255,240,234,0.94))',
                    boxShadow: '0 16px 30px rgba(39,20,28,0.16)',
                  }}
                >
                  {isLast ? 'Start exploring' : 'Next feature'}
                  <ArrowRight size={16} strokeWidth={2.4} />
                </button>

                <button
                  type="button"
                  onClick={markSeenAndClose}
                  className="hidden text-[12px] font-semibold text-white/78 sm:inline-flex"
                >
                  Skip
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={markSeenAndClose}
              className="mt-3 text-[12px] font-semibold text-white/78 sm:hidden"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

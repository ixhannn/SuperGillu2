/**
 * WhatsNew — luminous release-highlights showcase.
 *
 * Design language (shared with the guided tour): a layered glass medallion
 * floating over a glowing accent field, editorial serif display type, segmented
 * progress, and an accent-tinted CTA.
 *
 * Performance: the background (theme + two static blurred orbs) is painted ONCE
 * and never swapped between slides — no full-screen repaint, no flicker. Every
 * transition animates transform + opacity only. The single ambient motion (the
 * medallion float) is GPU-only and disabled under reduced-motion.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  Gift,
  Hourglass,
  MapPin,
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
  accent: string;
  accentDeep: string;
}

const FEATURES: Feature[] = [
  {
    key: 'video',
    icon: Clapperboard,
    eyebrow: 'Premium',
    title: 'Video Memories',
    what: 'Save short clips right beside your photos and keepsakes — the little moments a still frame could never hold.',
    where: 'Timeline · Daily Moments · Keepsakes',
    accent: '#d4637a',
    accentDeep: '#a83f5c',
  },
  {
    key: 'timecapsule',
    icon: Hourglass,
    eyebrow: 'New',
    title: 'Time Capsule',
    what: 'Lock a note today and let it reopen on a future date — a message from your past self, waiting for you both.',
    where: 'Us · milestone rituals',
    accent: '#7c72bf',
    accentDeep: '#564b9b',
  },
  {
    key: 'surprises',
    icon: Gift,
    eyebrow: 'New',
    title: 'Surprises',
    what: 'Hide a plan or a sweet note and keep it sealed until the reveal day arrives. Anticipation is half the joy.',
    where: 'Us · future plans',
    accent: '#c0883e',
    accentDeep: '#94621f',
  },
  {
    key: 'voicenotes',
    icon: Mic,
    eyebrow: 'New',
    title: 'Voice Notes',
    what: 'Send a few seconds of your voice they can play back any time — a goodnight, a laugh, an "I miss you".',
    where: 'Voice Notes',
    accent: '#3f93ab',
    accentDeep: '#256d83',
  },
  {
    key: 'yearinreview',
    icon: Sparkles,
    eyebrow: 'New',
    title: 'Year in Review',
    what: 'A cinematic look back at the memories, moods and rituals that shaped your year together.',
    where: 'Reflection · recap surfaces',
    accent: '#4f9b7f',
    accentDeep: '#2f7459',
  },
];

const SLIDE_SPRING = { type: 'spring' as const, stiffness: 300, damping: 32, mass: 0.85 };

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 46 : -46, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: SLIDE_SPRING },
  exit: (dir: number) => ({ x: dir > 0 ? -46 : 46, opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const } }),
};

// ── Layered glass medallion ──────────────────────────────────────────────────
const Medallion: React.FC<{ feature: Feature; reduced: boolean }> = ({ feature, reduced }) => {
  const Icon = feature.icon;
  return (
    <div style={{ position: 'relative', width: 184, height: 184, display: 'grid', placeItems: 'center' }}>
      {/* soft outer glow */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, ${feature.accent}3d 0%, transparent 64%)` }} />
      {/* concentric rings */}
      <div style={{ position: 'absolute', width: 178, height: 178, borderRadius: '50%', border: `1px solid ${feature.accent}26` }} />
      <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', border: `1px solid ${feature.accent}33` }} />
      {/* floating gradient disc */}
      <motion.div
        animate={reduced ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'relative',
          width: 116, height: 116, borderRadius: '50%',
          background: `linear-gradient(150deg, ${feature.accent} 0%, ${feature.accentDeep} 100%)`,
          display: 'grid', placeItems: 'center',
          boxShadow: `0 22px 50px ${feature.accent}66, 0 0 0 8px rgba(255,255,255,0.5), inset 0 2px 0 rgba(255,255,255,0.45)`,
        }}
      >
        {/* sheen */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 46%)' }} />
        <Icon size={50} color="#fff" strokeWidth={1.7} style={{ position: 'relative' }} />
      </motion.div>
      {/* sparkle accent */}
      <div style={{ position: 'absolute', top: 26, right: 30, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'grid', placeItems: 'center', boxShadow: `0 6px 16px ${feature.accent}55` }}>
        <Sparkles size={15} style={{ color: feature.accent }} />
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
  const reduced = !!useReducedMotion();

  const feature = FEATURES[index];
  const total = FEATURES.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const counter = useMemo(
    () => `${String(index + 1).padStart(2, '0')} · ${String(total).padStart(2, '0')}`,
    [index, total],
  );

  const finish = useCallback(() => {
    FeatureDiscovery.markCurrentVersionSeen();
    void Haptics.success();
    onClose();
  }, [onClose]);

  const skip = useCallback(() => {
    FeatureDiscovery.markCurrentVersionSeen();
    void Haptics.softTap();
    onClose();
  }, [onClose]);

  const goTo = useCallback((next: number) => {
    if (next < 0 || next > total - 1 || next === index) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
    void Haptics.select();
  }, [index, total]);

  const goNext = useCallback(() => {
    if (isLast) { finish(); return; }
    setDirection(1);
    setIndex((c) => Math.min(c + 1, total - 1));
    void Haptics.select();
  }, [isLast, total, finish]);

  const goPrev = useCallback(() => {
    if (isFirst) return;
    setDirection(-1);
    setIndex((c) => Math.max(c - 1, 0));
    void Haptics.select();
  }, [isFirst]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="fixed inset-0 z-[500] flex flex-col overflow-hidden"
      style={{ background: 'var(--theme-bg-main)', color: 'var(--color-text-primary)' }}
    >
      {/* ── Ambient depth — static blurred orbs (painted once) ── */}
      <div aria-hidden className="pointer-events-none absolute -top-[16%] -right-[14%] h-[44vh] w-[44vh] rounded-full" style={{ background: 'var(--theme-orb-1)', filter: 'blur(95px)', opacity: 0.6 }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-[15%] -left-[16%] h-[42vh] w-[42vh] rounded-full" style={{ background: 'var(--theme-orb-2)', filter: 'blur(95px)', opacity: 0.5 }} />

      <div
        className="relative z-10 mx-auto flex h-full w-full max-w-[440px] flex-col px-6"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 18px)', paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--color-text-secondary)' }}>
              What's New
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
              style={{ background: `${feature.accent}1f`, color: feature.accent, transition: 'background 0.32s, color 0.32s' }}
            >
              v{APP_VERSION}
            </span>
          </div>
          <motion.button
            type="button"
            onClick={skip}
            whileTap={reduced ? undefined : { scale: 0.9 }}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.78)', color: 'var(--color-text-secondary)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            aria-label="Close"
          >
            <X size={17} strokeWidth={2.4} />
          </motion.button>
        </div>

        {/* ── Stage ── */}
        <div className="relative flex flex-1 items-center">
          <AnimatePresence custom={direction} initial={false} mode="wait">
            <motion.div
              key={feature.key}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              drag={reduced ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragEnd={(_, info) => {
                if (info.offset.x < -70) goNext();
                else if (info.offset.x > 70) goPrev();
              }}
              className="w-full"
              style={{ willChange: 'transform, opacity', touchAction: 'pan-y' }}
            >
              <div className="flex justify-center">
                <Medallion feature={feature} reduced={reduced} />
              </div>

              <p className="mt-7 text-center text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: feature.accent }}>
                {feature.eyebrow}
              </p>

              <h1 className="mt-2 text-center font-serif leading-[1.06]" style={{ fontSize: '2.5rem', color: 'var(--color-text-primary)' }}>
                {feature.title}
              </h1>

              <p className="mx-auto mt-4 max-w-[19.5rem] text-center text-[15.5px] leading-[1.6]" style={{ color: 'var(--color-text-secondary)' }}>
                {feature.what}
              </p>

              <div className="mt-7 flex justify-center">
                <div
                  className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
                  style={{ background: `linear-gradient(135deg, ${feature.accent}1f, rgba(255,255,255,0.5))`, border: `1px solid ${feature.accent}33` }}
                >
                  <MapPin size={15} style={{ color: feature.accent, flexShrink: 0 }} />
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {feature.where}
                  </span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0">
          {/* Segmented progress */}
          <div className="mb-5 flex items-center gap-1.5">
            {FEATURES.map((item, i) => (
              <button
                key={item.key}
                type="button"
                onClick={() => goTo(i)}
                className="flex-1 py-2"
                aria-label={`Go to ${item.title}`}
                aria-current={i === index ? 'step' : undefined}
              >
                <span className="block h-[5px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(120,120,135,0.22)' }}>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: i <= index ? '100%' : '0%',
                      background: `linear-gradient(90deg, ${feature.accent}cc, ${feature.accent})`,
                      transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
                    }}
                  />
                </span>
              </button>
            ))}
          </div>

          {/* Nav */}
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              whileTap={reduced || isFirst ? undefined : { scale: 0.96 }}
              className="flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-2xl disabled:opacity-30"
              style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.78)', color: 'var(--color-text-secondary)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
              aria-label="Previous"
            >
              <ArrowLeft size={20} strokeWidth={2.4} />
            </motion.button>

            <motion.button
              type="button"
              onClick={goNext}
              whileTap={reduced ? undefined : { scale: 0.97 }}
              className="relative flex h-[54px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl text-[16px] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, ${feature.accent} 0%, ${feature.accentDeep} 100%)`,
                boxShadow: `0 12px 30px ${feature.accent}59, inset 0 1px 0 rgba(255,255,255,0.35)`,
                transition: 'background 0.32s ease, box-shadow 0.32s ease',
              }}
            >
              {isLast ? 'Start exploring' : 'Next'}
              {isLast ? <Check size={19} strokeWidth={2.6} /> : <ArrowRight size={19} strokeWidth={2.6} />}
            </motion.button>
          </div>

          {/* Counter / skip */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12px] font-bold tracking-[0.1em]" style={{ color: 'var(--color-text-secondary)' }}>
              {counter}
            </span>
            {!isLast && (
              <button type="button" onClick={skip} className="text-[13px] font-semibold" style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none' }}>
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

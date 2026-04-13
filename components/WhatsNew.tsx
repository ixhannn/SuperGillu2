/**
 * WhatsNew — full-screen swipeable feature introduction.
 *
 * Each new feature gets its own full-screen card with a gradient background,
 * floating decorative elements, and a swipe/tap navigation. No scroll bugs.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { FeatureDiscovery } from '../services/featureDiscovery';
import { Haptics } from '../services/haptics';

// ─── Feature definitions ──────────────────────────────────────────────────────

interface Feature {
    key: string;
    emoji: string;                // big hero emoji
    floaters: string[];           // decorative floating emojis
    bg: [string, string];         // gradient from → to
    accentColor: string;          // button + pill accent
    label: string;
    title: string;
    description: string;
}

const FEATURES: Feature[] = [
    {
        key: 'video',
        emoji: '🎬',
        floaters: ['🎥', '✨', '📸', '💖', '🌟'],
        bg: ['#ff6b9d', '#c44569'],
        accentColor: '#c44569',
        label: 'Premium',
        title: 'Video Memories',
        description: 'Capture moments that move. Add short videos to your timeline, daily moments, and keepsake vault — bring your love story to life.',
    },
    {
        key: 'timecapsule',
        emoji: '⏳',
        floaters: ['💌', '⭐', '🔮', '🌙', '💫'],
        bg: ['#a18cd1', '#c56cd6'],
        accentColor: '#8b5cf6',
        label: 'New',
        title: 'Time Capsule',
        description: 'Write a letter to your future selves. Seal it today, set an unlock date, and rediscover it together when the moment arrives.',
    },
    {
        key: 'surprises',
        emoji: '🎁',
        floaters: ['🎉', '💝', '🌟', '🥳', '✨'],
        bg: ['#f7971e', '#ffd200'],
        accentColor: '#d97706',
        label: 'New',
        title: 'Surprises',
        description: 'Plan something they\'ll never see coming. Hide a note, a plan, a secret — it reveals itself automatically on the date you set.',
    },
    {
        key: 'voicenotes',
        emoji: '🎙️',
        floaters: ['🎵', '🎶', '💬', '🔊', '💙'],
        bg: ['#4facfe', '#00d4ff'],
        accentColor: '#0284c7',
        label: 'New',
        title: 'Voice Notes',
        description: 'Leave a message that sounds like you. Record your voice — they can replay it whenever they need to hear it.',
    },
    {
        key: 'yearinreview',
        emoji: '🏆',
        floaters: ['🌿', '💚', '📊', '🎯', '✨'],
        bg: ['#43e97b', '#38f9d7'],
        accentColor: '#059669',
        label: 'New',
        title: 'Year in Review',
        description: 'Your love story by the numbers — memories logged, moods shared, streaks kept, and the moments that defined your year.',
    },
];

// ─── Floating decorations ─────────────────────────────────────────────────────

const POSITIONS = [
    { top: '8%',  left: '10%' },
    { top: '14%', right: '12%' },
    { top: '28%', left: '6%' },
    { top: '22%', right: '8%' },
    { top: '42%', right: '5%' },
];

const FloatingDecor: React.FC<{ emojis: string[]; featureKey: string }> = ({ emojis, featureKey }) => (
    <>
        {emojis.map((emoji, i) => (
            <motion.div
                key={`${featureKey}-${i}`}
                initial={{ opacity: 0, scale: 0, rotate: -15 }}
                animate={{
                    opacity: [0, 0.85, 0.85, 0],
                    scale: [0.4, 1, 1, 0.6],
                    y: [0, -8, -4, -12],
                    rotate: [-10 + i * 6, 5, -5, 10],
                }}
                transition={{
                    duration: 3.5,
                    delay: 0.3 + i * 0.18,
                    ease: 'easeInOut',
                    repeat: Infinity,
                    repeatDelay: 1.2 + i * 0.3,
                }}
                style={{
                    position: 'absolute',
                    fontSize: 22 + (i % 2) * 6,
                    pointerEvents: 'none',
                    ...POSITIONS[i],
                }}
            >
                {emoji}
            </motion.div>
        ))}
    </>
);

// ─── Slide variants ───────────────────────────────────────────────────────────

const slideVariants = {
    enter: (dir: number) => ({
        x: dir > 0 ? 340 : -340,
        opacity: 0,
        scale: 0.88,
    }),
    center: {
        x: 0,
        opacity: 1,
        scale: 1,
        transition: { type: 'spring' as const, damping: 28, stiffness: 300, mass: 0.85 },
    },
    exit: (dir: number) => ({
        x: dir > 0 ? -340 : 340,
        opacity: 0,
        scale: 0.88,
        transition: { duration: 0.2, ease: 'easeIn' as const },
    }),
};

// ─── Main component ───────────────────────────────────────────────────────────

interface WhatsNewProps {
    onClose: () => void;
}

export const WhatsNew: React.FC<WhatsNewProps> = ({ onClose }) => {
    const [index, setIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const feature = FEATURES[index];
    const isLast = index === FEATURES.length - 1;

    const goNext = useCallback(async () => {
        await Haptics.select();
        if (isLast) {
            FeatureDiscovery.markCurrentVersionSeen();
            await Haptics.success();
            onClose();
        } else {
            setDirection(1);
            setIndex((i) => i + 1);
        }
    }, [isLast, onClose]);

    const goPrev = useCallback(() => {
        if (index > 0) {
            Haptics.select();
            setDirection(-1);
            setIndex((i) => i - 1);
        }
    }, [index]);

    const handleDismiss = useCallback(async () => {
        FeatureDiscovery.markCurrentVersionSeen();
        await Haptics.softTap();
        onClose();
    }, [onClose]);

    const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
        const threshold = 60;
        if (info.offset.x < -threshold) {
            goNext();
        } else if (info.offset.x > threshold && index > 0) {
            goPrev();
        }
    }, [goNext, goPrev, index]);

    const bgGradient = `linear-gradient(145deg, ${feature.bg[0]} 0%, ${feature.bg[1]} 100%)`;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] flex flex-col"
            style={{ touchAction: 'none' }}
        >
            {/* Animated gradient background */}
            <AnimatePresence mode="sync">
                <motion.div
                    key={feature.key + '-bg'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45 }}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: bgGradient,
                    }}
                />
            </AnimatePresence>

            {/* Soft vignette at bottom for text readability */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0) 35%, rgba(0,0,0,0.38) 100%)',
                pointerEvents: 'none',
            }} />

            {/* Floating decorations */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <AnimatePresence mode="wait">
                    <FloatingDecor key={feature.key} emojis={feature.floaters} featureKey={feature.key} />
                </AnimatePresence>
            </div>

            {/* Top bar: progress + skip */}
            <div className="relative z-10 flex items-center gap-2 px-5 pt-safe pt-12">
                {FEATURES.map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            flex: i === index ? 3 : 1,
                            opacity: i <= index ? 1 : 0.35,
                        }}
                        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                        style={{
                            height: 3,
                            borderRadius: 100,
                            background: 'rgba(255,255,255,0.9)',
                        }}
                    />
                ))}
                <button
                    onClick={handleDismiss}
                    className="ml-2 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)' }}
                    aria-label="Skip"
                >
                    <X size={14} strokeWidth={2.5} color="rgba(255,255,255,0.9)" />
                </button>
            </div>

            {/* Hero card — swipeable */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
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
                        dragElastic={0.18}
                        onDragEnd={handleDragEnd}
                        className="w-full max-w-[340px] flex flex-col items-center text-center"
                        style={{ cursor: 'grab' }}
                    >
                        {/* Big emoji orb */}
                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                            className="mb-8 relative"
                        >
                            {/* Glow ring */}
                            <motion.div
                                animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.15, 0.4] }}
                                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                                style={{
                                    position: 'absolute',
                                    inset: -20,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.35)',
                                    filter: 'blur(18px)',
                                    pointerEvents: 'none',
                                }}
                            />
                            <div style={{
                                width: 112,
                                height: 112,
                                borderRadius: '2rem',
                                background: 'rgba(255,255,255,0.22)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1.5px solid rgba(255,255,255,0.45)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
                                position: 'relative',
                            }}>
                                {/* Shimmer */}
                                <div style={{
                                    position: 'absolute', inset: 0, borderRadius: '2rem',
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 55%)',
                                }} />
                                <span style={{ fontSize: 52, lineHeight: 1, position: 'relative', zIndex: 1 }}>
                                    {feature.emoji}
                                </span>
                            </div>
                        </motion.div>

                        {/* Label pill */}
                        <div className="mb-4 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
                            style={{
                                background: 'rgba(255,255,255,0.22)',
                                color: 'rgba(255,255,255,0.95)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255,255,255,0.3)',
                            }}>
                            {feature.label}
                        </div>

                        {/* Title */}
                        <h2 className="font-serif text-[2rem] leading-tight mb-4" style={{ color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.2)' }}>
                            {feature.title}
                        </h2>

                        {/* Description */}
                        <p className="text-[15px] leading-relaxed max-w-[290px]"
                            style={{ color: 'rgba(255,255,255,0.88)', textShadow: '0 1px 8px rgba(0,0,0,0.18)' }}>
                            {feature.description}
                        </p>
                    </motion.div>
                </AnimatePresence>

                {/* Swipe hint */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.55 }}
                    transition={{ delay: 1.2 }}
                    className="mt-8 text-[12px] font-medium tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                    {isLast ? '' : 'swipe to continue'}
                </motion.p>
            </div>

            {/* Bottom: dot progress + CTA button */}
            <div className="relative z-10 px-6 pb-safe" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}>
                {/* Dot indicators */}
                <div className="flex justify-center gap-2 mb-6">
                    {FEATURES.map((_, i) => (
                        <motion.div
                            key={i}
                            animate={{
                                width: i === index ? 20 : 7,
                                opacity: i === index ? 1 : 0.38,
                            }}
                            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                            style={{
                                height: 7,
                                borderRadius: 100,
                                background: 'rgba(255,255,255,0.9)',
                            }}
                        />
                    ))}
                </div>

                {/* CTA */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={goNext}
                    className="w-full py-[18px] rounded-2xl font-bold text-[16px] flex items-center justify-center gap-2.5"
                    style={{
                        background: 'rgba(255,255,255,0.95)',
                        color: feature.accentColor,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
                        border: 'none',
                        letterSpacing: '0.01em',
                    }}
                >
                    {isLast ? "Let's go!" : 'Next'}
                    <ArrowRight size={18} strokeWidth={2.5} />
                </motion.button>
            </div>
        </motion.div>
    );
};

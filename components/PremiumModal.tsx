import React, { useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue, type PanInfo } from 'framer-motion';
import { CalendarHeart, ChevronRight, Clapperboard, Crown, Flame, Gem, Gift, Heart, Infinity as InfinityIcon, Sparkles } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { StorageService } from '../services/storage';
import { Analytics } from '../services/analytics';
import { useNavigation } from '../App';
import '../styles/premium-hub.css';

export type PremiumFeatureContext = 'video' | 'voice' | 'capsule' | 'surprise' | 'memory' | 'daily' | 'generic';

interface PremiumModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Tailors the headline to the limit the user just hit. */
    featureContext?: PremiumFeatureContext;
}

const CONTEXT_COPY: Record<PremiumFeatureContext, { title: string; sub: string }> = {
    video: {
        title: 'Video belongs in your story',
        sub: 'Videos in memories, keepsakes & daily moments are part of Lior Gold.',
    },
    voice: {
        title: 'Your free voice notes are full',
        sub: 'Keep every “I love you” — Gold makes voice notes unlimited.',
    },
    capsule: {
        title: 'More letters for the future',
        sub: 'Your 3 free sealed letters are used. Gold removes the limit.',
    },
    surprise: {
        title: 'Keep the surprises coming',
        sub: 'Your 3 free surprises are scheduled. Gold makes them unlimited.',
    },
    memory: {
        title: 'Your memory vault is full',
        sub: '50 free memories reached — Gold gives you an unlimited vault.',
    },
    daily: {
        title: 'Today is overflowing',
        sub: '30 free moments shared today — Gold removes the daily cap.',
    },
    generic: {
        title: 'Unlock everything, together',
        sub: 'Your film, date nights, duets, missions — and an unlimited vault.',
    },
};

const SHEET_FEATURES = [
    { icon: Clapperboard, label: 'Our Story film', desc: 'Your whole relationship, retold as a premiere', tint: '#ff5c7c' },
    { icon: CalendarHeart, label: 'Date Studio, Depths & Duets', desc: 'Date decks, real-talk cards & a two-pen journal', tint: '#fb7185' },
    { icon: Flame, label: 'Love Missions', desc: 'Three small missions a week, tuned to them', tint: '#ec4899' },
    { icon: Gem, label: 'Heirlooms', desc: 'Collectible art, struck on your milestones', tint: '#e8c97d' },
    { icon: Gift, label: 'Unlimited everything', desc: 'Voice notes, letters, surprises & memories', tint: '#ff5c7c' },
];

const SHEET_SPRING = { type: 'spring', stiffness: 400, damping: 41, mass: 1 } as const;

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose, featureContext = 'generic' }) => {
    const { navigateTo } = useNavigation();
    const copy = CONTEXT_COPY[featureContext] ?? CONTEXT_COPY.generic;

    React.useEffect(() => {
        if (!isOpen) return;
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [isOpen, onClose]);

    const handleUpgrade = useCallback(() => {
        // Visual response first — the close animation starts this frame; the
        // synchronous profile read/serialize is deferred past the next paint
        // so it can't stall the exit spring.
        feedback.celebrate();
        Analytics.track('premium_tap');
        onClose();
        requestAnimationFrame(() => {
            const profile = StorageService.getCoupleProfile();
            StorageService.saveCoupleProfile({
                ...profile,
                isPremium: true,
                premiumSince: profile.premiumSince ?? new Date().toISOString(),
            });
            toast.show('Welcome to Lior Gold 👑', 'success');
            // Let any mounted premium surface (GoldGate, deck locks, meters)
            // refresh without waiting for a remount or focus event.
            window.dispatchEvent(new CustomEvent('lior:premium-changed'));
        });
    }, [onClose]);

    const handleExplore = useCallback(() => {
        feedback.tap();
        onClose();
        navigateTo('premium');
    }, [navigateTo, onClose]);

    // Pan-based pull-to-dismiss (drag + exit on the same node breaks
    // AnimatePresence unmounting, so the sheet is panned manually).
    const sheetY = useMotionValue(0);

    // A close mid-pan would leave sheetY offset and the next open would
    // start displaced — style motion values win over `animate` targets.
    React.useEffect(() => {
        if (!isOpen) sheetY.set(0);
    }, [isOpen, sheetY]);

    const handlePan = useCallback((_: unknown, info: PanInfo) => {
        sheetY.set(info.offset.y > 0 ? info.offset.y : info.offset.y * 0.06);
    }, [sheetY]);

    const handlePanEnd = useCallback((_: unknown, info: PanInfo) => {
        if (info.offset.y > 130 || info.velocity.y > 700) {
            feedback.tap();
            onClose();
        } else {
            animate(sheetY, 0, { type: 'spring', stiffness: 420, damping: 34 });
        }
    }, [onClose, sheetY]);

    // Portal OUTSIDE AnimatePresence: React 19 portals are not valid elements,
    // so AnimatePresence would silently drop a portal child and render nothing.
    return ReactDOM.createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[200] flex items-end justify-center"
                    onClick={onClose}
                >
                    {/* Static 18px blur — opacity 1, never animated. Animating opacity
                        over a full-viewport backdrop-filter makes the compositor
                        re-resolve the blur every frame (the open/close stutter on
                        mid/low-end WebViews). As a static sibling it resolves once and
                        stays mounted through the exit, so it never snaps; only the
                        cheap tint scrim below fades. */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
                    />
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.22 } }}
                        style={{ backgroundColor: 'rgba(13,7,15,0.66)' }}
                    />
                    <motion.div
                        initial={{ y: '104%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '104%', transition: { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] } }}
                        transition={SHEET_SPRING}
                        onPan={handlePan}
                        onPanEnd={handlePanEnd}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Lior Gold membership"
                        className="lp-stage relative w-full max-w-[440px] overflow-hidden"
                        style={{
                            y: sheetY,
                            borderRadius: '32px 32px 0 0',
                            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                            touchAction: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Ambient layers */}
                        <div className="lp-aurora">
                            <div className="lp-aurora__blob lp-aurora__blob--gold" style={{ width: 320, height: 320, top: -120 }} />
                            <div className="lp-aurora__blob lp-aurora__blob--rose" style={{ width: 300, height: 300 }} />
                        </div>
                        <div className="lp-grain" />

                        {/* Gold hairline */}
                        <div className="absolute top-0 left-0 right-0 h-px z-10 bg-gradient-to-r from-transparent via-rose-300/50 to-transparent" />

                        <div className="relative z-10 px-6 pt-3 pb-7">
                            {/* Drag handle */}
                            <div className="flex justify-center mb-5">
                                <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,248,248,0.18)' }} />
                            </div>

                            {/* Hero */}
                            <div className="flex flex-col items-center text-center mb-6">
                                <motion.div
                                    initial={{ scale: 0.4, opacity: 0, rotate: -14 }}
                                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.08 }}
                                    className="lp-emblem mb-4"
                                >
                                    <div className="lp-orbit"><span className="lp-orbit__spark" /></div>
                                    <div
                                        className="relative flex items-center justify-center w-[58px] h-[58px] rounded-[19px]"
                                        style={{
                                            background: 'linear-gradient(140deg, rgba(255,92,124,0.22) 0%, rgba(185,138,62,0.34) 100%)',
                                            border: '1px solid rgba(255,92,124,0.4)',
                                            boxShadow: '0 14px 38px rgba(255,92,124,0.16), inset 0 1px 0 rgba(255,255,255,0.25)',
                                        }}
                                    >
                                        <Crown size={26} strokeWidth={1.7} style={{ color: '#ff5c7c' }} />
                                    </div>
                                </motion.div>

                                <motion.h2
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.13 }}
                                    className="font-serif text-[1.55rem] leading-tight"
                                    style={{ color: 'rgba(255,251,250,0.96)', letterSpacing: '-0.02em' }}
                                >
                                    {copy.title}
                                </motion.h2>
                                <motion.p
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.19 }}
                                    className="mt-2 max-w-[32ch] text-[12.5px] leading-relaxed"
                                    style={{ color: 'rgba(255,248,248,0.5)' }}
                                >
                                    {copy.sub}
                                </motion.p>
                            </div>

                            {/* Feature rows */}
                            <div className="flex flex-col gap-2 mb-5">
                                {SHEET_FEATURES.map((feat, i) => {
                                    const Icon = feat.icon;
                                    return (
                                        <motion.div
                                            key={feat.label}
                                            initial={{ opacity: 0, x: -18 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.2 + i * 0.05 }}
                                            className="flex items-center gap-3.5 px-4 py-3 rounded-2xl"
                                            style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.07)' }}
                                        >
                                            <div
                                                className="flex w-9 h-9 shrink-0 items-center justify-center rounded-xl"
                                                style={{ background: `${feat.tint}1c`, border: `1px solid ${feat.tint}38` }}
                                            >
                                                <Icon size={16} style={{ color: feat.tint }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold leading-tight" style={{ color: 'rgba(255,251,250,0.9)' }}>{feat.label}</p>
                                                <p className="mt-0.5 text-[10.5px] leading-tight" style={{ color: 'rgba(255,248,248,0.38)' }}>{feat.desc}</p>
                                            </div>
                                            <InfinityIcon size={13} strokeWidth={2.4} className="shrink-0" style={{ color: 'rgba(255,92,124,0.6)' }} />
                                        </motion.div>
                                    );
                                })}
                            </div>

                            {/* Founding couples note */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.48 }}
                                className="flex items-start gap-2.5 px-4 py-3 rounded-2xl mb-5"
                                style={{ background: 'rgba(255,92,124,0.06)', border: '1px solid rgba(255,92,124,0.16)' }}
                            >
                                <Sparkles size={13} className="shrink-0 mt-0.5" style={{ color: '#ff5c7c' }} />
                                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,248,248,0.55)' }}>
                                    <span className="font-semibold" style={{ color: '#f3cd86' }}>Founding couples offer</span> — Gold is free during early access.
                                </p>
                            </motion.div>

                            {/* Actions */}
                            <motion.div
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.54 }}
                                className="flex flex-col gap-2"
                            >
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: 'spring', stiffness: 560, damping: 30 }}
                                    onClick={handleUpgrade}
                                    className="lp-cta w-full h-[54px] rounded-2xl font-bold text-[15px] tracking-wide"
                                    style={{
                                        background: 'linear-gradient(135deg, #ff5c7c 0%, #8b5cf6 100%)',
                                        color: '#ffffff',
                                        boxShadow: '0 12px 36px rgba(255,92,124,0.28), inset 0 1px 0 rgba(255,255,255,0.45)',
                                    }}
                                >
                                    Unlock Lior Gold
                                </motion.button>

                                <button
                                    onClick={handleExplore}
                                    className="w-full py-3 rounded-2xl flex items-center justify-center gap-1.5 text-[13px] font-semibold active:scale-95 transition-transform"
                                    style={{ color: 'rgba(255,92,124,0.85)' }}
                                >
                                    See everything Gold unlocks
                                    <ChevronRight size={14} strokeWidth={2.4} />
                                </button>

                                <button
                                    onClick={() => { feedback.tap(); onClose(); }}
                                    className="w-full py-2.5 text-[13px] font-medium active:scale-95 transition-transform"
                                    style={{ color: 'rgba(255,248,248,0.32)' }}
                                >
                                    Not now
                                </button>
                            </motion.div>

                            {/* Love note */}
                            <div className="mt-3 flex items-center justify-center gap-2">
                                <Heart size={10} style={{ color: 'rgba(236,72,153,0.55)' }} fill="currentColor" strokeWidth={0} />
                                <p className="text-[10.5px]" style={{ color: 'rgba(255,248,248,0.28)' }}>
                                    Built for the two of you. Always.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue, useReducedMotion, type PanInfo } from 'framer-motion';
import { Check, Clock, Plus, Trash2, X } from 'lucide-react';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_PRESS_SPRING,
    GOLD_SOFT_SPRING,
    GoldCTA,
    GoldSectionHeader,
    goldRise,
    goldStagger,
} from '../components/premium/GoldKit';
import { PremiumModal } from '../components/PremiumModal';
import type { Surprise, ViewState } from '../types';
import { StorageService } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { useTapOrigin } from '../hooks/useTapOrigin';
import { listRemoveExit } from '../utils/motion';
import '../styles/premium-hub.css';

interface SurprisesViewProps {
    setView: (view: ViewState) => void;
}

const ACCENT = '#8b5cf6';
const ACCENT_LIGHT = '#c4b5fd';
const FREE_SURPRISE_LIMIT = 3;

const EMOJIS = ['🎁', '💌', '🌹', '✨', '🥂', '🍰', '🎟️', '🌙', '💝', '🧸'];

/* ── Gift-wrap building blocks (ribbon + wax seal) ──────────────────── */

const RIBBON_H: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(246,199,104,0.20) 0%, rgba(217,156,62,0.10) 100%)',
    borderTop: '1px solid rgba(246,199,104,0.26)',
    borderBottom: '1px solid rgba(185,138,62,0.22)',
};

const RIBBON_V: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(246,199,104,0.20) 0%, rgba(217,156,62,0.10) 100%)',
    borderLeft: '1px solid rgba(246,199,104,0.26)',
    borderRight: '1px solid rgba(185,138,62,0.22)',
};

const SEAL_STYLE: React.CSSProperties = {
    background: 'radial-gradient(circle at 35% 30%, #fdeec9 0%, #e9b765 55%, #d99c3e 100%)',
    border: '1px solid rgba(255,246,222,0.55)',
    boxShadow: '0 8px 26px rgba(217,156,62,0.4), inset 0 1px 0 rgba(255,250,235,0.6)',
};

const FIELD_STYLE: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: GOLD.textHigh,
    caretColor: GOLD.primary,
};

/* ── Time helpers ───────────────────────────────────────────────────── */

const startOfDayMs = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const countdownLabel = (iso: string): string => {
    const target = new Date(iso);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return 'any moment';
    const dayDiff = Math.round((startOfDayMs(target) - startOfDayMs(now)) / 86_400_000);
    if (dayDiff <= 0) {
        if (target.getHours() >= 18) return 'tonight';
        const hours = Math.max(1, Math.ceil(diffMs / 3_600_000));
        return hours === 1 ? 'within the hour' : `in ${hours} hours`;
    }
    if (dayDiff === 1) return 'tomorrow';
    if (dayDiff < 14) return `in ${dayDiff} days`;
    return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatOpens = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const formatOpened = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* ── Burst particles (same recipe as views/Premium.tsx UnlockBurst) ─── */

const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 76 + (i % 5) * 18;
    return {
        dx: `${Math.round(Math.cos(angle) * dist)}px`,
        dy: `${Math.round(Math.sin(angle) * dist * 0.85)}px`,
        delay: `${(i % 6) * 0.035}s`,
    };
});

const UnlockBurst: React.FC = () => (
    <div className="lp-burst">
        {BURST_PARTICLES.map((p, i) => (
            <span
                key={i}
                className="lp-burst__p"
                style={{ '--dx': p.dx, '--dy': p.dy, animationDelay: p.delay } as React.CSSProperties}
            />
        ))}
    </div>
);

/* ── Free-tier meter (informative only, mirrors the limit gate) ─────── */

const FreeMeter: React.FC<{ pending: number }> = ({ pending }) => {
    const used = Math.min(pending, FREE_SURPRISE_LIMIT);
    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
                {Array.from({ length: FREE_SURPRISE_LIMIT }, (_, i) => (
                    <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                            background: i < used ? GOLD.primary : 'rgba(255,255,255,0.14)',
                            boxShadow: i < used ? '0 0 6px rgba(246,199,104,0.5)' : 'none',
                        }}
                    />
                ))}
            </div>
            <span className="text-[10px] font-semibold" style={{ color: GOLD.textLow }}>
                {used} of {FREE_SURPRISE_LIMIT} free surprises sealed
            </span>
        </div>
    );
};

/* ── Sealed parcel card (scheduled surprise) ────────────────────────── */

interface SurpriseCardProps {
    surprise: Surprise;
    onDelete: (id: string) => void;
}

const SealedCard: React.FC<SurpriseCardProps> = ({ surprise, onDelete }) => (
    <motion.div
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={listRemoveExit}
        transition={GOLD_SOFT_SPRING}
        className="relative overflow-hidden rounded-[1.6rem]"
        style={{
            background: 'linear-gradient(150deg, rgba(139,92,246,0.20) 0%, rgba(109,72,190,0.10) 48%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(139,92,246,0.32)',
        }}
    >
        {/* Ribbon cross */}
        <div aria-hidden="true" className="absolute left-0 right-0 pointer-events-none" style={{ top: '50%', height: 12, marginTop: -6, ...RIBBON_H }} />
        <div aria-hidden="true" className="absolute top-0 bottom-0 pointer-events-none" style={{ right: 58, width: 12, ...RIBBON_V }} />
        <div className="lp-holo-sheen" />

        {/* Wax seal with the emoji peeking through */}
        <div
            aria-hidden="true"
            className="absolute flex items-center justify-center rounded-full pointer-events-none"
            style={{ top: '50%', right: 41, width: 46, height: 46, marginTop: -23, ...SEAL_STYLE }}
        >
            <span className="text-[21px] leading-none" style={{ transform: 'translateY(1px)' }}>{surprise.emoji || '🎁'}</span>
        </div>

        <div className="relative z-10 py-[18px] pl-5 pr-[112px]">
            <span
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[9px] font-bold uppercase tracking-[0.14em]"
                style={{ background: 'rgba(139,92,246,0.20)', border: '1px solid rgba(139,92,246,0.42)', color: ACCENT_LIGHT }}
            >
                <Clock size={9} strokeWidth={2.6} />
                {countdownLabel(surprise.scheduledFor)}
            </span>
            <h3 className="mt-2 font-serif text-[1.1rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                {surprise.title}
            </h3>
            <p className="mt-1 text-[11px]" style={{ color: GOLD.textLow }}>
                Sealed · opens {formatOpens(surprise.scheduledFor)}
            </p>
        </div>

        <button
            onClick={() => { feedback.tap(); onDelete(surprise.id); }}
            aria-label="Delete surprise"
            className="absolute top-2.5 right-2.5 z-10 p-1.5 opacity-35 active:scale-90 transition-transform"
        >
            <Trash2 size={13} style={{ color: GOLD.textMid }} />
        </button>
    </motion.div>
);

/* ── Opened history card (delivered surprise) ───────────────────────── */

const OpenedCard: React.FC<SurpriseCardProps> = ({ surprise, onDelete }) => (
    <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={listRemoveExit}
        transition={GOLD_SOFT_SPRING}
        className="flex items-start gap-3.5 rounded-[1.4rem] p-4"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
        <div
            className="flex w-10 h-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
            <span className="text-[18px] leading-none opacity-80">{surprise.emoji || '🎁'}</span>
        </div>
        <div className="flex-1 min-w-0">
            <h4 className="text-[13.5px] font-semibold leading-tight" style={{ color: 'rgba(255,250,242,0.85)' }}>
                {surprise.title}
            </h4>
            <p className="mt-1 text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: GOLD.textMid }}>
                {surprise.message}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
                <Check size={11} strokeWidth={2.8} style={{ color: 'rgba(246,199,104,0.6)' }} />
                <span className="text-[10.5px]" style={{ color: GOLD.textLow }}>
                    Opened {formatOpened(surprise.deliveredAt || surprise.scheduledFor)}
                </span>
            </div>
        </div>
        <button
            onClick={() => { feedback.tap(); onDelete(surprise.id); }}
            aria-label="Delete surprise"
            className="p-1.5 shrink-0 opacity-35 active:scale-90 transition-transform"
        >
            <Trash2 size={13} style={{ color: GOLD.textMid }} />
        </button>
    </motion.div>
);

/* ── Empty-state parcel glyph ───────────────────────────────────────── */

const EmptyParcel: React.FC = () => (
    <div className="relative lp-float" style={{ width: 108, height: 108 }}>
        <div
            aria-hidden="true"
            className="absolute -inset-7 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)', filter: 'blur(18px)' }}
        />
        <div
            className="relative w-full h-full overflow-hidden rounded-[22px]"
            style={{
                background: 'linear-gradient(160deg, rgba(139,92,246,0.30) 0%, rgba(91,56,166,0.18) 50%, rgba(40,24,64,0.42) 100%)',
                border: '1px solid rgba(168,134,255,0.35)',
                boxShadow: '0 18px 44px rgba(76,29,149,0.3)',
            }}
        >
            <div className="absolute top-0 bottom-0" style={{ left: '50%', width: 14, marginLeft: -7, ...RIBBON_V }} />
            <div className="absolute left-0 right-0" style={{ top: '50%', height: 14, marginTop: -7, ...RIBBON_H }} />
            <div className="lp-holo-sheen" />
        </div>
        <div
            className="absolute flex items-center justify-center rounded-full"
            style={{ left: '50%', top: '50%', width: 46, height: 46, marginLeft: -23, marginTop: -23, ...SEAL_STYLE }}
        >
            <span className="text-[20px] leading-none">🎁</span>
        </div>
    </div>
);

/* ── Reveal ceremony (full-screen, portal) ──────────────────────────── */

const sealedStageVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
    exit: {},
};

const fadeChildVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: GOLD_SOFT_SPRING },
    exit: { opacity: 0, y: -10, transition: { duration: 0.22 } },
};

const parcelEnterVariants = {
    hidden: { opacity: 0, scale: 0.8, y: 26 },
    visible: { opacity: 1, scale: 1, y: 0, transition: GOLD_SOFT_SPRING },
};

const lidVariants = {
    exit: { y: -130, rotate: -12, opacity: 0, transition: GOLD_SOFT_SPRING },
};

const bodyVariants = {
    exit: { y: 34, scale: 0.92, opacity: 0, transition: GOLD_SOFT_SPRING },
};

const sealVariants = {
    exit: { y: -28, scale: 1.3, opacity: 0, transition: GOLD_SOFT_SPRING },
};

const emojiPopVariants = {
    hidden: { scale: 0.2, opacity: 0, rotate: -14, y: 12 },
    visible: { scale: 1, opacity: 1, rotate: 0, y: 0, transition: GOLD_SOFT_SPRING },
};

interface CeremonyStageProps {
    surprise: Surprise;
    onClose: () => void;
}

const CeremonyStage: React.FC<CeremonyStageProps> = ({ surprise, onClose }) => {
    const [opened, setOpened] = useState(false);
    const reducedMotion = useReducedMotion();
    // Grow the full-screen reveal OUT OF the parcel/card that was tapped instead
    // of scaling from screen centre — matches the route-open bloom. Falls back to
    // centre when the reveal fires programmatically (a due surprise with no fresh
    // tap) or under reduced motion.
    const { ref: stageRef, origin } = useTapOrigin<HTMLDivElement>(true);

    useEffect(() => {
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [onClose]);

    const handleOpen = () => {
        // The reveal IS the reward — a subtle escalating milestone co-timed with
        // the open animation. (Was firing celebrate() on mount, which double-fired
        // under StrictMode and on every remount.)
        setOpened(true);
        feedback.milestone();
    };

    const sealedOn = new Date(surprise.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    return (
        <motion.div
            ref={stageRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={GOLD_SOFT_SPRING}
            role="dialog"
            aria-modal="true"
            aria-label="A surprise for you"
            className="lp-stage fixed inset-0 z-[300] overflow-y-auto"
            style={{ transformOrigin: origin }}
        >
            {/* Ambient layers */}
            <div className="lp-aurora">
                <div className="lp-aurora__blob lp-aurora__blob--gold" />
                <div className="lp-aurora__blob lp-aurora__blob--rose" />
                <div
                    className="lp-aurora__blob lp-aurora__blob--violet"
                    style={{ background: `radial-gradient(circle, ${ACCENT}42 0%, transparent 65%)` }}
                />
            </div>
            <div className="lp-grain" />

            <div className="relative z-10 min-h-full flex flex-col items-center justify-center px-6 py-14">
                <AnimatePresence mode="wait">
                    {!opened ? (
                        <motion.div
                            key="sealed"
                            variants={sealedStageVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="flex flex-col items-center text-center"
                        >
                            <motion.span
                                variants={fadeChildVariants}
                                className="text-[10px] font-bold uppercase tracking-[0.34em]"
                                style={{ color: GOLD.eyebrow }}
                            >
                                A surprise for you
                            </motion.span>

                            {/* The parcel */}
                            <motion.button
                                variants={parcelEnterVariants}
                                whileTap={{ scale: 0.96 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={handleOpen}
                                aria-label="Open the surprise"
                                className="relative mt-10"
                                style={{ width: 176, height: 172 }}
                            >
                                <div
                                    aria-hidden="true"
                                    className="absolute -inset-10 rounded-full pointer-events-none"
                                    style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.30) 0%, transparent 70%)', filter: 'blur(26px)' }}
                                />

                                {/* Box body */}
                                <motion.div
                                    variants={bodyVariants}
                                    className="absolute left-0 right-0 bottom-0 overflow-hidden"
                                    style={{
                                        top: 46,
                                        borderRadius: '12px 12px 24px 24px',
                                        background: 'linear-gradient(160deg, rgba(139,92,246,0.34) 0%, rgba(91,56,166,0.22) 50%, rgba(40,24,64,0.5) 100%)',
                                        border: '1px solid rgba(168,134,255,0.4)',
                                        boxShadow: '0 26px 60px rgba(76,29,149,0.35)',
                                    }}
                                >
                                    <div className="absolute top-0 bottom-0" style={{ left: '50%', width: 18, marginLeft: -9, ...RIBBON_V }} />
                                    <div className="absolute left-0 right-0" style={{ top: '50%', height: 16, marginTop: -8, ...RIBBON_H }} />
                                    <div className="lp-holo-sheen" />
                                </motion.div>

                                {/* Lid + bow */}
                                <motion.div
                                    variants={lidVariants}
                                    className="absolute"
                                    style={{
                                        top: 0,
                                        left: -10,
                                        right: -10,
                                        height: 52,
                                        borderRadius: 14,
                                        background: 'linear-gradient(160deg, rgba(168,134,255,0.46) 0%, rgba(109,72,200,0.34) 100%)',
                                        border: '1px solid rgba(186,158,255,0.45)',
                                        boxShadow: '0 10px 30px rgba(76,29,149,0.3)',
                                    }}
                                >
                                    <div className="absolute top-0 bottom-0" style={{ left: '50%', width: 18, marginLeft: -9, ...RIBBON_V }} />
                                    <div
                                        aria-hidden="true"
                                        className="absolute rounded-full"
                                        style={{
                                            top: -11, left: '50%', marginLeft: -30, width: 26, height: 15,
                                            transform: 'rotate(-22deg)',
                                            background: 'linear-gradient(135deg, rgba(246,199,104,0.5), rgba(217,156,62,0.28))',
                                            border: '1px solid rgba(246,199,104,0.45)',
                                        }}
                                    />
                                    <div
                                        aria-hidden="true"
                                        className="absolute rounded-full"
                                        style={{
                                            top: -11, left: '50%', marginLeft: 4, width: 26, height: 15,
                                            transform: 'rotate(22deg)',
                                            background: 'linear-gradient(225deg, rgba(246,199,104,0.5), rgba(217,156,62,0.28))',
                                            border: '1px solid rgba(246,199,104,0.45)',
                                        }}
                                    />
                                    <div
                                        aria-hidden="true"
                                        className="absolute rounded-full"
                                        style={{ top: -8, left: '50%', marginLeft: -8, width: 16, height: 16, ...SEAL_STYLE }}
                                    />
                                </motion.div>

                                {/* Emoji wax seal */}
                                <motion.div
                                    variants={sealVariants}
                                    className="absolute flex items-center justify-center rounded-full"
                                    style={{ left: '50%', top: 108, width: 58, height: 58, marginLeft: -29, marginTop: -29, ...SEAL_STYLE }}
                                >
                                    <span className="text-[26px] leading-none">{surprise.emoji || '🎁'}</span>
                                </motion.div>
                            </motion.button>

                            <motion.p
                                variants={fadeChildVariants}
                                className="mt-10 font-serif text-[1.35rem] leading-snug max-w-[22ch]"
                                style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                            >
                                Someone chose this exact moment for you.
                            </motion.p>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={reducedMotion ? { opacity: 0.6 } : { opacity: [0.35, 0.75, 0.35] }}
                                transition={reducedMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                className="mt-3 text-[11px] font-bold uppercase tracking-[0.22em]"
                                style={{ color: 'rgba(255,246,230,0.55)' }}
                            >
                                Tap to open
                            </motion.p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="opened"
                            variants={goldStagger}
                            initial="hidden"
                            animate="visible"
                            className="relative w-full max-w-[340px] flex flex-col items-center text-center"
                        >
                            <UnlockBurst />
                            <motion.div variants={emojiPopVariants} className="text-[64px] leading-none">
                                {surprise.emoji || '🎁'}
                            </motion.div>
                            <motion.span
                                variants={goldRise}
                                className="mt-6 text-[10px] font-bold uppercase tracking-[0.3em]"
                                style={{ color: GOLD.eyebrow }}
                            >
                                Sealed {sealedOn} · opened today
                            </motion.span>
                            <motion.h2
                                variants={goldRise}
                                className="mt-3 font-serif text-[1.85rem] leading-[1.08]"
                                style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                            >
                                {surprise.title}
                            </motion.h2>
                            <motion.div
                                variants={goldRise}
                                className="mt-5 w-full rounded-[1.4rem] px-5 py-5"
                                style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
                            >
                                <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-left" style={{ color: 'rgba(255,250,242,0.88)' }}>
                                    {surprise.message}
                                </p>
                            </motion.div>
                            <motion.div variants={goldRise} className="mt-7 w-full">
                                <GoldCTA onClick={() => { feedback.tap(); onClose(); }}>Keep it</GoldCTA>
                                <p className="mt-3 text-[11px]" style={{ color: GOLD.textLow }}>
                                    Saved under Opened — yours to reread.
                                </p>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

/** Portal OUTSIDE AnimatePresence — React 19 portals are not valid elements. */
const SurpriseCeremony: React.FC<{ surprise: Surprise | null; onClose: () => void }> = ({ surprise, onClose }) =>
    ReactDOM.createPortal(
        <AnimatePresence>
            {surprise && <CeremonyStage key={surprise.id} surprise={surprise} onClose={onClose} />}
        </AnimatePresence>,
        document.body
    );

/* ── Create sheet (gold bottom sheet, portal + pan-dismiss) ─────────── */

interface CreateSheetProps {
    open: boolean;
    onClose: () => void;
    /** Suspends the hardware-back handler while the paywall sits on top. */
    backSuspended: boolean;
    title: string;
    onTitleChange: (v: string) => void;
    message: string;
    onMessageChange: (v: string) => void;
    scheduledFor: string;
    onScheduledForChange: (v: string) => void;
    emoji: string;
    onEmojiChange: (v: string) => void;
    minDateTime: string;
    isSaving: boolean;
    onSave: () => void;
    isPremium: boolean;
    pendingCount: number;
}

const CreateSheet: React.FC<CreateSheetProps> = ({
    open, onClose, backSuspended,
    title, onTitleChange,
    message, onMessageChange,
    scheduledFor, onScheduledForChange,
    emoji, onEmojiChange,
    minDateTime, isSaving, onSave, isPremium, pendingCount,
}) => {
    // Pan-based pull-to-dismiss (drag + exit on the same node breaks
    // AnimatePresence unmounting, so the sheet is panned manually).
    const sheetY = useMotionValue(0);

    useEffect(() => {
        if (!open) sheetY.set(0);
    }, [open, sheetY]);

    useEffect(() => {
        if (!open) return;
        const handleBack = (e: Event) => {
            if (backSuspended) return;
            e.preventDefault();
            onClose();
        };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [open, backSuspended, onClose]);

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

    const canSave = !isSaving && !!title.trim() && !!message.trim() && !!scheduledFor;

    // Portal OUTSIDE AnimatePresence: React 19 portals are not valid elements,
    // so AnimatePresence would silently drop a portal child and render nothing.
    return ReactDOM.createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.22 } }}
                    className="fixed inset-0 z-[180] flex items-end justify-center"
                    style={{ backgroundColor: 'rgba(13,7,15,0.66)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: '104%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '104%', transition: { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] } }}
                        transition={GOLD_SOFT_SPRING}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Plan a surprise"
                        className="lp-stage relative w-full max-w-[440px] overflow-hidden flex flex-col"
                        style={{
                            y: sheetY,
                            borderRadius: '32px 32px 0 0',
                            maxHeight: '88vh',
                            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Ambient layers */}
                        <div className="lp-aurora">
                            <div className="lp-aurora__blob lp-aurora__blob--gold" style={{ width: 300, height: 300, top: -120 }} />
                            <div
                                className="lp-aurora__blob lp-aurora__blob--violet"
                                style={{ width: 280, height: 280, top: 40, background: `radial-gradient(circle, ${ACCENT}38 0%, transparent 65%)` }}
                            />
                        </div>
                        <div className="lp-grain" />

                        {/* Gold hairline */}
                        <div className="absolute top-0 left-0 right-0 h-px z-10 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

                        {/* Pan zone: drag handle + heading */}
                        <motion.div onPan={handlePan} onPanEnd={handlePanEnd} className="relative z-10 px-6 pt-3 pb-2" style={{ touchAction: 'none' }}>
                            <div className="flex justify-center mb-4">
                                <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,246,230,0.18)' }} />
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="font-serif text-[1.45rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                        Plan a surprise
                                    </h2>
                                    <p className="mt-1 text-[12px]" style={{ color: GOLD.textMid }}>
                                        It stays sealed until the minute you choose.
                                    </p>
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.86 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={() => { feedback.tap(); onClose(); }}
                                    aria-label="Close"
                                    className="lp-glass w-9 h-9 shrink-0 rounded-full flex items-center justify-center"
                                    style={{ color: 'rgba(255,246,230,0.8)' }}
                                >
                                    <X size={15} strokeWidth={2.4} />
                                </motion.button>
                            </div>
                        </motion.div>

                        {/* Form */}
                        <div data-lenis-prevent className="lenis-inner relative z-10 flex-1 overflow-y-auto px-6 pt-4 pb-7">
                            <div className="flex flex-col gap-5">
                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: GOLD.textLow }}>
                                        Seal
                                    </span>
                                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                                        {EMOJIS.map((em) => {
                                            const selected = emoji === em;
                                            return (
                                                <motion.button
                                                    key={em}
                                                    whileTap={{ scale: 0.9 }}
                                                    transition={GOLD_PRESS_SPRING}
                                                    onClick={() => { feedback.tap(); onEmojiChange(em); }}
                                                    aria-label={`Seal with ${em}`}
                                                    aria-pressed={selected}
                                                    className="w-11 h-11 shrink-0 rounded-[14px] text-[20px] flex items-center justify-center"
                                                    style={{
                                                        background: selected ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.05)',
                                                        border: selected ? '1px solid rgba(246,199,104,0.6)' : '1px solid rgba(255,255,255,0.09)',
                                                        boxShadow: selected ? '0 6px 18px rgba(139,92,246,0.28)' : 'none',
                                                    }}
                                                >
                                                    {em}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: GOLD.textLow }}>
                                        Title
                                    </span>
                                    <input
                                        value={title}
                                        onChange={(e) => onTitleChange(e.target.value)}
                                        placeholder="Name it — “open me at midnight”"
                                        className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                        style={FIELD_STYLE}
                                    />
                                </div>

                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: GOLD.textLow }}>
                                        Message
                                    </span>
                                    <textarea
                                        value={message}
                                        onChange={(e) => onMessageChange(e.target.value)}
                                        placeholder="The words they'll find inside…"
                                        rows={4}
                                        className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none resize-none leading-relaxed"
                                        style={FIELD_STYLE}
                                    />
                                </div>

                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: GOLD.textLow }}>
                                        Opens at
                                    </span>
                                    <input
                                        type="datetime-local"
                                        value={scheduledFor}
                                        min={minDateTime}
                                        onChange={(e) => onScheduledForChange(e.target.value)}
                                        className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                        style={{ ...FIELD_STYLE, colorScheme: 'dark' }}
                                    />
                                </div>

                                <div>
                                    <GoldCTA onClick={onSave} disabled={!canSave}>
                                        {isSaving ? 'Sealing…' : 'Schedule the surprise'}
                                    </GoldCTA>
                                    {!isPremium && (
                                        <p className="mt-3 text-center text-[10.5px]" style={{ color: GOLD.textLow }}>
                                            {Math.min(pendingCount, FREE_SURPRISE_LIMIT)} of {FREE_SURPRISE_LIMIT} free surprises sealed
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

/* ── Main view ──────────────────────────────────────────────────────── */

export const SurprisesView: React.FC<SurprisesViewProps> = ({ setView }) => {
    const [surprises, setSurprises] = useState<Surprise[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [activeSurprise, setActiveSurprise] = useState<Surprise | null>(null);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('🎁');
    const [isSaving, setIsSaving] = useState(false);

    const loadAndCheck = useCallback(() => {
        const all = StorageService.getSurprises();
        const now = new Date();
        // Find first undelivered due surprise to reveal
        const due = all.find((s) => !s.delivered && new Date(s.scheduledFor) <= now);
        if (due) {
            StorageService.markSurpriseDelivered(due.id);
            setActiveSurprise(due);
        }
        setSurprises(StorageService.getSurprises());
    }, []);

    useEffect(() => { loadAndCheck(); }, [loadAndCheck]);

    const handleSave = async () => {
        if (!title.trim() || !message.trim() || !scheduledFor) return;

        const profile = StorageService.getCoupleProfile();
        const pending = surprises.filter((s) => !s.delivered);
        if (!profile.isPremium && pending.length >= FREE_SURPRISE_LIMIT) {
            setShowPremiumModal(true);
            return;
        }

        setIsSaving(true);

        const newSurprise: Surprise = {
            id: generateId(),
            senderId: StorageService.getDeviceId(),
            title: title.trim(),
            message: message.trim(),
            emoji: selectedEmoji,
            scheduledFor: new Date(scheduledFor).toISOString(),
            createdAt: new Date().toISOString(),
            delivered: false,
        };

        await StorageService.saveSurprise(newSurprise);
        setSurprises(StorageService.getSurprises());

        setTitle(''); setMessage(''); setScheduledFor(''); setSelectedEmoji('🎁');
        setShowForm(false);
        setIsSaving(false);
        feedback.tap();
        toast.show('Surprise scheduled! 🎉', 'success');
    };

    const handleDelete = async (id: string) => {
        await StorageService.deleteSurprise(id);
        setSurprises(prev => prev.filter(s => s.id !== id));
    };

    const upcoming = surprises.filter((s) => !s.delivered);
    const delivered = surprises.filter((s) => s.delivered);
    const profile = StorageService.getCoupleProfile();
    const isPremium = !!profile.isPremium;
    const canCreate = isPremium || upcoming.length < FREE_SURPRISE_LIMIT;

    const minDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

    const handleAdd = () => {
        feedback.tap();
        if (canCreate) setShowForm(true);
        else setShowPremiumModal(true);
    };

    return (
        <GoldShell
            eyebrow="Surprises"
            accent={ACCENT}
            rightSlot={
                <motion.button
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.05 }}
                    whileTap={{ scale: 0.86 }}
                    onClick={handleAdd}
                    aria-label="Schedule a surprise"
                    className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ color: 'rgba(255,246,230,0.85)' }}
                >
                    <Plus size={18} strokeWidth={2.4} />
                </motion.button>
            }
        >
            <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                {!isPremium && (
                    <motion.div variants={goldRise} className="mt-2 flex justify-end">
                        <FreeMeter pending={upcoming.length} />
                    </motion.div>
                )}

                {surprises.length === 0 && (
                    <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-12 pb-6">
                        <EmptyParcel />
                        <h2 className="mt-9 font-serif text-[1.7rem] leading-[1.1]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                            Plant a little<br />ambush of joy
                        </h2>
                        <p className="mt-3 max-w-[28ch] text-[13px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            Write something sweet, seal it, and pick the exact minute it springs open — date night, a dreary Tuesday, 12:01 on their birthday.
                        </p>
                        <div className="mt-8 w-full max-w-[250px]">
                            <GoldCTA onClick={() => { feedback.tap(); setShowForm(true); }}>
                                Seal the first surprise
                            </GoldCTA>
                        </div>
                    </motion.div>
                )}

                {upcoming.length > 0 && (
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="Sealed & waiting" className="mt-7 mb-4" />
                        <div className="flex flex-col gap-3">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {upcoming.map((s) => (
                                    <SealedCard key={s.id} surprise={s} onDelete={handleDelete} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}

                {delivered.length > 0 && (
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="Opened" className="mt-9 mb-4" />
                        <div className="flex flex-col gap-2.5">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {delivered.map((s) => (
                                    <OpenedCard key={s.id} surprise={s} onDelete={handleDelete} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </motion.div>

            <CreateSheet
                open={showForm}
                onClose={() => setShowForm(false)}
                backSuspended={showPremiumModal}
                title={title}
                onTitleChange={setTitle}
                message={message}
                onMessageChange={setMessage}
                scheduledFor={scheduledFor}
                onScheduledForChange={setScheduledFor}
                emoji={selectedEmoji}
                onEmojiChange={setSelectedEmoji}
                minDateTime={minDateTime}
                isSaving={isSaving}
                onSave={handleSave}
                isPremium={isPremium}
                pendingCount={upcoming.length}
            />

            <SurpriseCeremony
                surprise={activeSurprise}
                onClose={() => { setActiveSurprise(null); setSurprises(StorageService.getSurprises()); }}
            />

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} featureContext="surprise" />
        </GoldShell>
    );
};

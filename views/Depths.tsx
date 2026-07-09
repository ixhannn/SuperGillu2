import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, useReducedMotion, type PanInfo } from 'framer-motion';
import { Heart, Lock, X } from 'lucide-react';
import type { DepthsState, ViewState } from '../types';
import { Analytics } from '../services/analytics';
import { StorageService } from '../services/storage';
import { PremiumFeaturesStore } from '../services/premiumFeatures';
import { DEPTHS_DECKS, type DepthsDeck, type DepthsQuestion } from '../content/depthsDecks';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_SOFT_SPRING,
    GOLD_PRESS_SPRING,
    goldRise,
    goldStagger,
    GoldSectionHeader,
} from '../components/premium/GoldKit';
import { PremiumModal } from '../components/PremiumModal';
import { feedback } from '../utils/feedback';
import '../styles/premium-hub.css';

const ACCENT = '#5eead4';
const FREE_DECK_ID = 'beginnings';

interface DepthsViewProps {
    setView: (view: ViewState) => void;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

const shuffleQuestions = (questions: DepthsQuestion[]): DepthsQuestion[] => {
    const order = [...questions];
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
};

interface IndexedQuestion {
    id: string;
    text: string;
    glyph: string;
    deckName: string;
}

const QUESTION_INDEX: ReadonlyMap<string, IndexedQuestion> = new Map(
    DEPTHS_DECKS.flatMap((deck) =>
        deck.questions.map((q) => [q.id, { id: q.id, text: q.text, glyph: deck.glyph, deckName: deck.name }] as const)
    )
);

/* ── Celebration burst (same pattern as views/Premium.tsx) ──────────── */

const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 76 + (i % 5) * 18;
    return {
        dx: `${Math.round(Math.cos(angle) * dist)}px`,
        dy: `${Math.round(Math.sin(angle) * dist * 0.85)}px`,
        delay: `${(i % 6) * 0.035}s`,
    };
});

const SessionBurst: React.FC = () => (
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

/* ── Question text — soft spring word cascade ───────────────────────── */

const cascadeContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.042, delayChildren: 0.05 } },
};

const cascadeWord = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: GOLD_SOFT_SPRING },
};

const QuestionCascade: React.FC<{ text: string }> = ({ text }) => {
    const reducedMotion = useReducedMotion();
    const fontSize = text.length > 110 ? 'clamp(1.55rem, 6.2vw, 1.9rem)' : 'clamp(1.9rem, 7.5vw, 2.4rem)';
    const textStyle: React.CSSProperties = {
        fontSize,
        letterSpacing: '-0.02em',
        lineHeight: 1.18,
        color: 'rgba(255,252,246,0.97)',
        textShadow: '0 2px 24px rgba(0,0,0,0.28)',
    };

    if (reducedMotion) {
        return (
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.25 } }}
                className="font-serif text-center"
                style={textStyle}
            >
                {text}
            </motion.p>
        );
    }

    return (
        <motion.p
            variants={cascadeContainer}
            initial="hidden"
            animate="visible"
            className="font-serif text-center"
            style={textStyle}
        >
            {text.split(' ').map((word, i) => (
                <motion.span
                    key={`${i}-${word}`}
                    variants={cascadeWord}
                    className="inline-block"
                    style={{ marginRight: '0.26em' }}
                >
                    {word}
                </motion.span>
            ))}
        </motion.p>
    );
};

/* ── Session player — full-screen portal overlay ────────────────────── */

interface SessionOverlayProps {
    deck: DepthsDeck;
    myName: string;
    partnerName: string;
    favorites: string[];
    onToggleFavorite: (questionId: string) => void;
    onComplete: (deckId: string) => void;
    onClose: () => void;
}

const SessionOverlay: React.FC<SessionOverlayProps> = ({
    deck,
    myName,
    partnerName,
    favorites,
    onToggleFavorite,
    onComplete,
    onClose,
}) => {
    const reducedMotion = useReducedMotion();
    const [order, setOrder] = useState<DepthsQuestion[]>(() => shuffleQuestions(deck.questions));
    const [index, setIndex] = useState(0);
    const [phase, setPhase] = useState<'cards' | 'done'>('cards');
    const [starter] = useState(() => (Math.random() < 0.5 ? 0 : 1));
    const completedRef = useRef(false);
    const panMutedRef = useRef(false);
    const panResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (panResetTimerRef.current) clearTimeout(panResetTimerRef.current);
    }, []);

    // Hardware back closes the session while it is open.
    useEffect(() => {
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [onClose]);

    const advance = useCallback(() => {
        if (phase !== 'cards') return;
        feedback.tap();
        if (index + 1 >= order.length) {
            setPhase('done');
            if (!completedRef.current) {
                completedRef.current = true;
                onComplete(deck.id);
            }
        } else {
            setIndex((i) => i + 1);
        }
    }, [phase, index, order.length, onComplete, deck.id]);

    // Tap anywhere advances — unless this release was the end of a pan.
    const handleTap = useCallback(() => {
        if (panMutedRef.current) return;
        advance();
    }, [advance]);

    const handlePan = useCallback((_: unknown, info: PanInfo) => {
        if (Math.abs(info.offset.y) > 12 || Math.abs(info.offset.x) > 12) {
            panMutedRef.current = true;
        }
    }, []);

    const handlePanEnd = useCallback((_: unknown, info: PanInfo) => {
        if (info.offset.y < -64 || info.velocity.y < -620) advance();
        if (panResetTimerRef.current) clearTimeout(panResetTimerRef.current);
        panResetTimerRef.current = setTimeout(() => { panMutedRef.current = false; }, 160);
    }, [advance]);

    const handleReplay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        feedback.tap();
        setOrder(shuffleQuestions(deck.questions));
        setIndex(0);
        setPhase('cards');
        completedRef.current = false;
    }, [deck.questions]);

    const question = phase === 'cards' ? order[index] : undefined;
    const answerer = (index + starter) % 2 === 0 ? myName : partnerName;
    const isFavorite = question ? favorites.includes(question.id) : false;
    const keptThisDeck = order.filter((q) => favorites.includes(q.id));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.22 } }}
            onClick={handleTap}
            onPan={handlePan}
            onPanEnd={handlePanEnd}
            role="dialog"
            aria-modal="true"
            aria-label={`${deck.name} — conversation session`}
            className="fixed inset-0 z-[190] overflow-hidden flex flex-col"
            style={{
                background: `linear-gradient(168deg, ${deck.gradient[0]} 0%, ${deck.gradient[1]} 100%)`,
                touchAction: 'none',
            }}
        >
            {/* Ambient drift + grain + legibility vignette */}
            <div className="lp-aurora">
                <div
                    className="lp-aurora__blob lp-aurora__blob--gold"
                    style={{ background: `radial-gradient(circle, ${deck.gradient[0]}66 0%, transparent 65%)`, width: 360, height: 360 }}
                />
                <div
                    className="lp-aurora__blob lp-aurora__blob--rose"
                    style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 65%)' }}
                />
            </div>
            <div className="lp-grain" />
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(130% 95% at 50% 0%, transparent 32%, rgba(8,4,10,0.52) 100%)' }}
            />

            {/* Top bar */}
            <div
                className="relative z-10 flex items-center justify-between px-5"
                style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
            >
                <motion.button
                    whileTap={{ scale: 0.86 }}
                    transition={GOLD_PRESS_SPRING}
                    onClick={(e) => { e.stopPropagation(); feedback.tap(); onClose(); }}
                    aria-label="End session"
                    className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ color: 'rgba(255,252,246,0.88)' }}
                >
                    <X size={17} strokeWidth={2.4} />
                </motion.button>
                <span
                    className="text-[10px] font-bold uppercase tracking-[0.34em]"
                    style={{ color: 'rgba(255,252,246,0.62)' }}
                >
                    {deck.name}
                </span>
                {phase === 'cards' && question ? (
                    <motion.button
                        whileTap={{ scale: 0.8 }}
                        transition={GOLD_PRESS_SPRING}
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(question.id); }}
                        aria-label={isFavorite ? 'Remove from kept questions' : 'Keep this question'}
                        aria-pressed={isFavorite}
                        className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    >
                        <Heart
                            size={16}
                            strokeWidth={isFavorite ? 0 : 2.2}
                            fill={isFavorite ? GOLD.primary : 'none'}
                            style={{ color: isFavorite ? GOLD.primary : 'rgba(255,252,246,0.72)' }}
                        />
                    </motion.button>
                ) : (
                    <div className="w-10 h-10" aria-hidden="true" />
                )}
            </div>

            {/* Center stage */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-7 text-center">
                <AnimatePresence mode="wait" initial={false}>
                    {phase === 'cards' && question ? (
                        <motion.div
                            key={question.id}
                            exit={{ opacity: 0, y: -18, transition: { duration: 0.16 } }}
                            className="flex flex-col items-center w-full max-w-[420px]"
                        >
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1, transition: { duration: 0.3 } }}
                                className="mb-5 text-[11px] font-bold tracking-[0.32em]"
                                style={{ color: 'rgba(255,252,246,0.55)' }}
                            >
                                {index + 1} — {order.length}
                            </motion.span>
                            <QuestionCascade text={question.text} />
                            <motion.span
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ ...GOLD_SOFT_SPRING, delay: reducedMotion ? 0 : 0.22 }}
                                className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full"
                                style={{
                                    background: 'rgba(0,0,0,0.26)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD.primary }} />
                                <span className="text-[11.5px] font-semibold tracking-wide" style={{ color: 'rgba(255,252,246,0.92)' }}>
                                    {answerer} answers
                                </span>
                            </motion.span>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="end"
                            initial={{ opacity: 0, y: 24, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1, transition: GOLD_SOFT_SPRING }}
                            exit={{ opacity: 0, transition: { duration: 0.16 } }}
                            className="relative flex flex-col items-center w-full max-w-[340px]"
                        >
                            <SessionBurst />
                            <span className="text-[40px] leading-none" aria-hidden="true">{deck.glyph}</span>
                            <h2
                                className="mt-4 font-serif"
                                style={{
                                    fontSize: 'clamp(1.7rem, 7vw, 2.1rem)',
                                    letterSpacing: '-0.02em',
                                    lineHeight: 1.15,
                                    color: 'rgba(255,252,246,0.97)',
                                }}
                            >
                                {order.length} questions explored
                            </h2>
                            <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: 'rgba(255,252,246,0.6)' }}>
                                Time spent on each other, not a feed.
                            </p>

                            {keptThisDeck.length > 0 && (
                                <div className="mt-6 w-full text-left">
                                    <p
                                        className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.3em]"
                                        style={{ color: 'rgba(255,252,246,0.55)' }}
                                    >
                                        Kept for later
                                    </p>
                                    <div
                                        className="flex flex-col gap-2 max-h-[190px] overflow-y-auto pr-1"
                                        style={{ touchAction: 'pan-y' }}
                                    >
                                        {keptThisDeck.map((q) => (
                                            <div
                                                key={q.id}
                                                className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
                                                style={{ background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.14)' }}
                                            >
                                                <Heart
                                                    size={12}
                                                    strokeWidth={0}
                                                    fill={GOLD.primary}
                                                    className="shrink-0 mt-0.5"
                                                    style={{ color: GOLD.primary }}
                                                />
                                                <p className="text-[12px] leading-snug" style={{ color: 'rgba(255,252,246,0.85)' }}>
                                                    {q.text}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-7 w-full flex flex-col gap-2">
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={handleReplay}
                                    className="w-full h-[52px] rounded-2xl font-bold text-[14.5px] tracking-wide"
                                    style={{
                                        background: 'rgba(255,250,242,0.94)',
                                        color: '#231413',
                                        boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                                    }}
                                >
                                    Play again
                                </motion.button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); feedback.tap(); onClose(); }}
                                    className="w-full py-3 text-[13px] font-semibold active:scale-95 transition-transform"
                                    style={{ color: 'rgba(255,252,246,0.68)' }}
                                >
                                    Back to decks
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Progress + hint */}
            {phase === 'cards' && (
                <div
                    className="relative z-10 px-7"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)' }}
                >
                    <p className="mb-4 text-center text-[10.5px]" style={{ color: 'rgba(255,252,246,0.45)' }}>
                        Tap anywhere or swipe up for the next question
                    </p>
                    <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.16)' }}>
                        <motion.div
                            initial={false}
                            animate={{ width: `${((index + 1) / order.length) * 100}%` }}
                            transition={GOLD_SOFT_SPRING}
                            className="h-full rounded-full"
                            style={{ background: 'rgba(255,250,242,0.85)' }}
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
};

/* ── Main view ──────────────────────────────────────────────────────── */

export const DepthsView: React.FC<DepthsViewProps> = ({ setView }) => {
    const profile = useMemo(() => StorageService.getCoupleProfile(), []);
    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Your love';

    const [isPremium, setIsPremium] = useState<boolean>(() => !!profile.isPremium);
    const [depthsState, setDepthsState] = useState<DepthsState>(() => PremiumFeaturesStore.getDepthsState());
    const [activeDeck, setActiveDeck] = useState<DepthsDeck | null>(null);
    const [paywallOpen, setPaywallOpen] = useState(false);

    const handleToggleFavorite = useCallback((questionId: string) => {
        feedback.tap();
        // Merge against the freshly-synced profile state, not React-local prev, so a
        // favorite that arrived via cloud sync but isn't yet in local state isn't dropped.
        const base = PremiumFeaturesStore.getDepthsState();
        const kept = base.favorites.includes(questionId);
        const next: DepthsState = {
            ...base,
            favorites: kept ? base.favorites.filter((id) => id !== questionId) : [...base.favorites, questionId],
        };
        PremiumFeaturesStore.saveDepthsState(next);
        setDepthsState(next);
    }, []);

    const handleComplete = useCallback((deckId: string) => {
        feedback.celebrate();
        const base = PremiumFeaturesStore.getDepthsState();
        const next: DepthsState = {
            ...base,
            completedSessions: base.completedSessions + 1,
            lastDeckId: deckId,
        };
        PremiumFeaturesStore.saveDepthsState(next);
        Analytics.feature('depths_complete');
        setDepthsState(next);
    }, []);

    const handleOpenDeck = useCallback((deck: DepthsDeck) => {
        feedback.tap();
        if (deck.id !== FREE_DECK_ID && !isPremium) {
            setPaywallOpen(true);
            return;
        }
        const base = PremiumFeaturesStore.getDepthsState();
        const next: DepthsState = { ...base, lastDeckId: deck.id };
        PremiumFeaturesStore.saveDepthsState(next);
        setDepthsState(next);
        setActiveDeck(deck);
    }, [isPremium]);

    const handleCloseSession = useCallback(() => setActiveDeck(null), []);

    const handlePaywallClose = useCallback(() => {
        setPaywallOpen(false);
        setIsPremium(!!StorageService.getCoupleProfile().isPremium);
    }, []);

    const keptQuestions = useMemo(
        () =>
            depthsState.favorites
                .map((id) => QUESTION_INDEX.get(id))
                .filter((q): q is IndexedQuestion => !!q),
        [depthsState.favorites]
    );

    return (
        <>
            <GoldShell eyebrow="Depths" accent={ACCENT}>
                <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                    {/* Hero */}
                    <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-7 pb-7">
                        <h1 className="font-serif text-[2rem] leading-[1.08]" style={{ letterSpacing: '-0.02em' }}>
                            <span style={{ color: GOLD.textHigh }}>Twenty minutes of</span>
                            <br />
                            <span style={{ color: ACCENT }}>actually looking at each other</span>
                        </h1>
                        <p className="mt-3.5 max-w-[32ch] text-[13.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            Pick a deck, pass the phone, answer out loud. They run light to deep — start where it’s easy.
                        </p>
                    </motion.div>

                    {/* Stats row */}
                    <motion.div variants={goldRise} className="grid grid-cols-2 gap-2.5">
                        {[
                            { value: depthsState.completedSessions, label: 'Sessions played' },
                            { value: depthsState.favorites.length, label: 'Questions kept' },
                        ].map((stat) => (
                            <div key={stat.label} className="lp-glass rounded-2xl px-3 py-4 text-center">
                                <span className="block font-serif text-[1.6rem] leading-none" style={{ color: GOLD.textHigh }}>
                                    {stat.value}
                                </span>
                                <span
                                    className="mt-1.5 block text-[9.5px] font-bold uppercase tracking-[0.16em]"
                                    style={{ color: GOLD.textLow }}
                                >
                                    {stat.label}
                                </span>
                            </div>
                        ))}
                    </motion.div>

                    {/* Deck shelf */}
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="The decks" />
                    </motion.div>

                    <div className="grid grid-cols-2 gap-3">
                        {DEPTHS_DECKS.map((deck) => {
                            const locked = deck.id !== FREE_DECK_ID && !isPremium;
                            const lastPlayed = depthsState.lastDeckId === deck.id;
                            return (
                                <motion.button
                                    key={deck.id}
                                    variants={goldRise}
                                    whileTap={{ scale: 0.96 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={() => handleOpenDeck(deck)}
                                    className="relative overflow-hidden rounded-[1.5rem] p-4 text-left aspect-[4/5] flex flex-col justify-between"
                                    style={{
                                        background: `linear-gradient(165deg, ${deck.gradient[0]} 0%, ${deck.gradient[1]} 100%)`,
                                        border: '1px solid rgba(255,255,255,0.12)',
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 pointer-events-none"
                                        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 32%, rgba(0,0,0,0.36) 100%)' }}
                                    />
                                    {locked && (
                                        <span
                                            className="absolute top-3 right-3 z-10 flex w-6 h-6 items-center justify-center rounded-full"
                                            style={{ background: 'rgba(18,9,4,0.55)', border: '1px solid rgba(246,199,104,0.55)' }}
                                        >
                                            <Lock size={10} strokeWidth={2.6} style={{ color: GOLD.primary }} />
                                        </span>
                                    )}
                                    {!isPremium && deck.id === FREE_DECK_ID && (
                                        <span
                                            className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-[0.14em]"
                                            style={{
                                                background: 'rgba(94,234,212,0.16)',
                                                border: '1px solid rgba(94,234,212,0.4)',
                                                color: ACCENT,
                                            }}
                                        >
                                            Free
                                        </span>
                                    )}
                                    <span className="relative z-10 text-[26px] leading-none" aria-hidden="true">
                                        {deck.glyph}
                                    </span>
                                    <div className="relative z-10">
                                        <h3
                                            className="font-serif text-[1.12rem] leading-tight"
                                            style={{ color: 'rgba(255,252,246,0.97)', letterSpacing: '-0.02em' }}
                                        >
                                            {deck.name}
                                        </h3>
                                        <p className="mt-1 text-[10.5px] leading-snug" style={{ color: 'rgba(255,255,255,0.68)' }}>
                                            {deck.tagline}
                                        </p>
                                        <span
                                            className="mt-2.5 inline-flex px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.14em]"
                                            style={{ background: 'rgba(0,0,0,0.28)', color: 'rgba(255,255,255,0.75)' }}
                                        >
                                            {deck.questions.length} questions{lastPlayed ? ' · last played' : ''}
                                        </span>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Kept questions */}
                    {keptQuestions.length > 0 ? (
                        <>
                            <motion.div variants={goldRise}>
                                <GoldSectionHeader label="Kept questions" />
                            </motion.div>
                            <motion.div variants={goldRise} className="flex flex-col gap-2">
                                {keptQuestions.map((q) => (
                                    <div
                                        key={q.id}
                                        className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
                                        style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
                                    >
                                        <span className="text-[16px] leading-none mt-0.5" aria-hidden="true">{q.glyph}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12.5px] leading-snug" style={{ color: GOLD.textHigh }}>
                                                {q.text}
                                            </p>
                                            <p
                                                className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.16em]"
                                                style={{ color: GOLD.textLow }}
                                            >
                                                {q.deckName}
                                            </p>
                                        </div>
                                        <motion.button
                                            whileTap={{ scale: 0.8 }}
                                            transition={GOLD_PRESS_SPRING}
                                            onClick={() => handleToggleFavorite(q.id)}
                                            aria-label="Remove from kept questions"
                                            className="shrink-0 p-1"
                                        >
                                            <Heart size={15} strokeWidth={0} fill={GOLD.primary} style={{ color: GOLD.primary }} />
                                        </motion.button>
                                    </div>
                                ))}
                            </motion.div>
                        </>
                    ) : (
                        <motion.div variants={goldRise} className="mt-8 text-center">
                            <p className="text-[11px]" style={{ color: GOLD.textLow }}>
                                Heart a question mid-game and it’ll wait for you here.
                            </p>
                        </motion.div>
                    )}
                </motion.div>
            </GoldShell>

            {/* Session player — portal outside AnimatePresence (React 19 rule) */}
            {ReactDOM.createPortal(
                <AnimatePresence>
                    {activeDeck && (
                        <SessionOverlay
                            key={activeDeck.id}
                            deck={activeDeck}
                            myName={myName}
                            partnerName={partnerName}
                            favorites={depthsState.favorites}
                            onToggleFavorite={handleToggleFavorite}
                            onComplete={handleComplete}
                            onClose={handleCloseSession}
                        />
                    )}
                </AnimatePresence>,
                document.body
            )}

            <PremiumModal isOpen={paywallOpen} onClose={handlePaywallClose} featureContext="generic" />
        </>
    );
};

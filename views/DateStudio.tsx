import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, Heart } from 'lucide-react';
import type { DatePlan, ViewState } from '../types';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_PRESS_SPRING,
    GoldCard,
    GoldGate,
    goldRise,
    goldStagger,
} from '../components/premium/GoldKit';
import { DateDeck } from '../components/premium/date-studio/DateDeck';
import { PlannerSection } from '../components/premium/date-studio/PlannerSection';
import { PremiumModal } from '../components/PremiumModal';
import { DATE_CATEGORIES, DATE_IDEAS, type DateCategory, type DateIdea } from '../content/dateIdeas';
import { PremiumFeaturesStore } from '../services/premiumFeatures';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';

const ACCENT = '#fb7185';
const FLIP_BACK_MS = 430;

interface Props {
    setView: (view: ViewState) => void;
}

type Filter = 'all' | DateCategory;

/* ── Blurred sample behind the GoldGate for free users ──────────────── */

const PlannerPreview: React.FC = () => (
    <div className="flex flex-col gap-3">
        <div className="lp-foil">
            <div
                className="rounded-[27px] p-5"
                style={{ background: 'linear-gradient(150deg, #221026 0%, #160a18 100%)' }}
            >
                <div className="flex items-center gap-3.5">
                    <span className="text-[26px]" aria-hidden="true">🧺</span>
                    <div>
                        <p className="font-serif text-[1.2rem]" style={{ color: GOLD.textHigh }}>The Floor Picnic</p>
                        <p className="mt-0.5 text-[11px]" style={{ color: GOLD.textLow }}>Tonight · candles found</p>
                    </div>
                </div>
            </div>
        </div>
        {[
            { emoji: '🌇', title: 'Sunset Chase', chip: 'in 3 days' },
            { emoji: '🕯️', title: 'The Five Questions', chip: 'in 6 days' },
        ].map((row) => (
            <GoldCard key={row.title} className="p-4">
                <div className="flex items-center gap-3">
                    <span className="text-[20px]" aria-hidden="true">{row.emoji}</span>
                    <p className="flex-1 text-[13px] font-semibold" style={{ color: GOLD.textHigh }}>{row.title}</p>
                    <span
                        className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.12em]"
                        style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}3d`, color: ACCENT }}
                    >
                        {row.chip}
                    </span>
                </div>
            </GoldCard>
        ))}
    </div>
);

/* ── Main view ──────────────────────────────────────────────────────── */

export const DateStudioView: React.FC<Props> = ({ setView }) => {
    const reducedMotion = useReducedMotion();

    const [isPremium, setIsPremium] = useState<boolean>(() => PremiumFeaturesStore.isPremium());
    const [plans, setPlans] = useState<DatePlan[]>(() => PremiumFeaturesStore.getDatePlans());
    const [filter, setFilter] = useState<Filter>('all');
    const [drawn, setDrawn] = useState<DateIdea | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [drawnIds, setDrawnIds] = useState<string[]>([]);
    const [paywallOpen, setPaywallOpen] = useState(false);
    const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

    const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flippingRef = useRef(false);
    const deckRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => () => {
        if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    }, []);

    /* GoldGate / PremiumModal unlock Gold without notifying the parent,
       so re-check the profile on focus, visibility and key interactions. */
    const refreshPremium = useCallback(() => {
        setIsPremium(PremiumFeaturesStore.isPremium());
    }, []);

    useEffect(() => {
        window.addEventListener('focus', refreshPremium);
        document.addEventListener('visibilitychange', refreshPremium);
        return () => {
            window.removeEventListener('focus', refreshPremium);
            document.removeEventListener('visibilitychange', refreshPremium);
        };
    }, [refreshPremium]);

    /* ── Deck pool ──────────────────────────────────────────────────── */

    const pool = useMemo(
        () => (filter === 'all' ? DATE_IDEAS : DATE_IDEAS.filter((i) => i.category === filter)),
        [filter],
    );
    const remaining = useMemo(
        () => pool.filter((i) => !drawnIds.includes(i.id)).length,
        [pool, drawnIds],
    );

    const pickIdea = useCallback((excludeId?: string): DateIdea | null => {
        if (pool.length === 0) return null;
        let available = pool.filter((i) => !drawnIds.includes(i.id) && i.id !== excludeId);
        let nextDrawnIds = drawnIds;
        if (available.length === 0) {
            const poolIds = new Set(pool.map((i) => i.id));
            nextDrawnIds = drawnIds.filter((id) => !poolIds.has(id));
            available = pool.filter((i) => i.id !== excludeId);
            if (available.length === 0) available = pool;
            toast.show('Every card is back in the deck ✨', 'info');
        }
        const idea = available[Math.floor(Math.random() * available.length)];
        setDrawnIds([...nextDrawnIds, idea.id]);
        return idea;
    }, [pool, drawnIds]);

    const handleDraw = useCallback(() => {
        if (flippingRef.current) return;
        feedback.tap();
        refreshPremium();
        const idea = pickIdea();
        if (!idea) return;
        setDrawn(idea);
        setRevealed(true);
    }, [pickIdea, refreshPremium]);

    /** Flip the card face-down, then run `after` once it lands in the deck. */
    const flipBackThen = useCallback((after: () => void) => {
        if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
        if (reducedMotion) {
            setRevealed(false);
            after();
            return;
        }
        flippingRef.current = true;
        setRevealed(false);
        flipTimerRef.current = setTimeout(() => {
            flippingRef.current = false;
            after();
        }, FLIP_BACK_MS);
    }, [reducedMotion]);

    const handleDrawAgain = useCallback(() => {
        const currentId = drawn?.id;
        flipBackThen(() => {
            const idea = pickIdea(currentId);
            if (!idea) return;
            setDrawn(idea);
            setRevealed(true);
        });
    }, [drawn, flipBackThen, pickIdea]);

    const handleFilter = useCallback((next: Filter) => {
        if (next === filter || flippingRef.current) return;
        feedback.tap();
        refreshPremium();
        setFilter(next);
        if (revealed) {
            flipBackThen(() => setDrawn(null));
        }
    }, [filter, revealed, flipBackThen, refreshPremium]);

    /* ── Plans ──────────────────────────────────────────────────────── */

    const savePlans = useCallback((next: DatePlan[]) => {
        setPlans(next);
        PremiumFeaturesStore.saveDatePlans(next);
    }, []);

    const handleKeep = useCallback(() => {
        if (!drawn) return;
        const premiumNow = PremiumFeaturesStore.isPremium();
        setIsPremium(premiumNow);
        if (!premiumNow) {
            feedback.tap();
            setPaywallOpen(true);
            return;
        }
        feedback.interact();
        const plan: DatePlan = {
            id: generateId(),
            ideaId: drawn.id,
            title: drawn.title,
            emoji: drawn.emoji,
            category: drawn.category,
            createdAt: new Date().toISOString(),
        };
        // Re-base on the fresh store so a plan the partner added/edited after this
        // view mounted isn't dropped by writing back a stale local array.
        savePlans([...PremiumFeaturesStore.getDatePlans(), plan]);
        toast.show('Kept — it’s a date 🌙', 'success');
        flipBackThen(() => setDrawn(null));
    }, [drawn, plans, savePlans, flipBackThen]);

    const handleUpdate = useCallback((id: string, patch: Partial<DatePlan>) => {
        savePlans(PremiumFeaturesStore.getDatePlans().map((p) => (p.id === id ? { ...p, ...patch } : p)));
    }, [savePlans]);

    const handleComplete = useCallback((id: string) => {
        feedback.celebrate();
        savePlans(PremiumFeaturesStore.getDatePlans().map((p) => (p.id === id ? { ...p, completedAt: new Date().toISOString() } : p)));
        setJustCompletedId(id);
        toast.show('One for the books 💫', 'success');
    }, [plans, savePlans]);

    const handleRemove = useCallback((id: string) => {
        feedback.tap();
        // Delete from the FRESH store so the removal applies to current state
        // (and a partner's just-synced plan isn't dropped as a side effect).
        savePlans(PremiumFeaturesStore.getDatePlans().filter((p) => p.id !== id));
        toast.show('Returned to the deck', 'info');
    }, [plans, savePlans]);

    const handleSaveMemory = useCallback(() => {
        setView('add-memory');
    }, [setView]);

    const handleDrawFirst = useCallback(() => {
        deckRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        if (!revealed) handleDraw();
    }, [revealed, handleDraw, reducedMotion]);

    /* ── Render ─────────────────────────────────────────────────────── */

    return (
        <GoldShell eyebrow="Date Studio" accent={ACCENT}>
            <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                {/* Hero */}
                <motion.div variants={goldRise} className="pt-6 pb-6 text-center">
                    <h1 className="font-serif text-[1.95rem] leading-[1.08]" style={{ letterSpacing: '-0.02em' }}>
                        <span style={{ color: GOLD.textHigh }}>Never again,</span>
                        <br />
                        <span className="lp-shimmer-text">“what should we do tonight?”</span>
                    </h1>
                    <p className="mt-3 mx-auto max-w-[31ch] text-[13px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        Seventy-two dates in one deck. Draw a card, keep the good ones, live them.
                    </p>
                </motion.div>

                {/* Category filters */}
                <motion.div
                    variants={goldRise}
                    className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1"
                >
                    {([{ id: 'all' as const, label: 'All', emoji: '✨', tint: GOLD.primary }, ...DATE_CATEGORIES]).map((cat) => {
                        const selected = filter === cat.id;
                        return (
                            <motion.button
                                key={cat.id}
                                whileTap={{ scale: 0.94 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={() => handleFilter(cat.id)}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11.5px] font-semibold"
                                style={
                                    selected
                                        ? { background: `${cat.tint}1f`, border: `1px solid ${cat.tint}66`, color: cat.tint }
                                        : {
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.09)',
                                            color: 'rgba(255,246,230,0.55)',
                                        }
                                }
                            >
                                <span aria-hidden="true">{cat.emoji}</span>
                                {cat.label}
                            </motion.button>
                        );
                    })}
                </motion.div>

                {/* The deck */}
                <motion.div variants={goldRise} ref={deckRef} className="mt-6">
                    <DateDeck
                        idea={drawn}
                        revealed={revealed}
                        remaining={remaining}
                        total={pool.length}
                        onDraw={handleDraw}
                        onDrawAgain={handleDrawAgain}
                        onKeep={handleKeep}
                    />
                </motion.div>

                {/* Tonight + planner (Gold) */}
                <motion.div variants={goldRise} className="mt-2">
                    <GoldGate
                        locked={!isPremium}
                        title="Plan it, live it"
                        sub="Keep the cards you love, schedule the night, and look back on every date you’ve lived."
                        featureContext="generic"
                    >
                        {isPremium ? (
                            <PlannerSection
                                plans={plans}
                                accent={ACCENT}
                                justCompletedId={justCompletedId}
                                onUpdate={handleUpdate}
                                onComplete={handleComplete}
                                onRemove={handleRemove}
                                onSaveMemory={handleSaveMemory}
                                onDrawFirst={handleDrawFirst}
                            />
                        ) : (
                            <div className="mt-10">
                                <div className="mb-4 flex items-center gap-3">
                                    <span
                                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.3em]"
                                        style={{ color: GOLD.eyebrow }}
                                    >
                                        <CalendarClock size={11} />
                                        The planner
                                    </span>
                                    <div
                                        className="flex-1 h-px"
                                        style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }}
                                    />
                                </div>
                                <PlannerPreview />
                            </div>
                        )}
                    </GoldGate>
                </motion.div>

                {/* Footer */}
                <motion.div variants={goldRise} className="mt-10 flex items-center justify-center gap-2">
                    <Heart size={11} style={{ color: 'rgba(236,72,153,0.6)' }} fill="currentColor" strokeWidth={0} />
                    <span className="text-[11px]" style={{ color: 'rgba(255,246,230,0.3)' }}>
                        Go on — the dishes can wait.
                    </span>
                </motion.div>
            </motion.div>

            <PremiumModal
                isOpen={paywallOpen}
                onClose={() => { setPaywallOpen(false); refreshPremium(); }}
                featureContext="generic"
            />
        </GoldShell>
    );
};

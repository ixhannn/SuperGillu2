import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, Check, ChevronRight, Sparkles, Trash2 } from 'lucide-react';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING, GoldCard, GoldSectionHeader } from '../GoldKit';
import { DATE_CATEGORIES, DATE_IDEAS } from '../../../content/dateIdeas';
import type { DatePlan } from '../../../types';
import { feedback } from '../../../utils/feedback';

/**
 * Date Studio planner — the pinned "Tonight" plan, the scheduled queue,
 * and the dates already lived. Rendered only when Gold is unlocked
 * (views/DateStudio.tsx swaps in a blurred preview behind GoldGate otherwise).
 */

interface PlannerSectionProps {
    plans: DatePlan[];
    accent: string;
    justCompletedId: string | null;
    onUpdate: (id: string, patch: Partial<DatePlan>) => void;
    onComplete: (id: string) => void;
    onRemove: (id: string) => void;
    onSaveMemory: () => void;
    onDrawFirst: () => void;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

const tintFor = (category: string): string =>
    DATE_CATEGORIES.find((c) => c.id === category)?.tint ?? GOLD.primary;

const descFor = (ideaId?: string): string | undefined =>
    ideaId ? DATE_IDEAS.find((i) => i.id === ideaId)?.desc : undefined;

const isoToLocalInput = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const localInputToIso = (value: string): string | undefined => {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

const countdownLabel = (iso: string): string => {
    const target = new Date(iso);
    if (Number.isNaN(target.getTime())) return '';
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(target) - startOfDay(new Date())) / 86400000);
    if (days < 0) return 'it’s time';
    if (days === 0) return 'tonight';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
};

const fmtCompleted = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const INPUT_STYLE: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: GOLD.textHigh,
    colorScheme: 'dark',
    outline: 'none',
};

/* ── Celebration burst (lp-burst pattern from views/Premium.tsx) ────── */

const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 76 + (i % 5) * 18;
    return {
        dx: `${Math.round(Math.cos(angle) * dist)}px`,
        dy: `${Math.round(Math.sin(angle) * dist * 0.85)}px`,
        delay: `${(i % 6) * 0.035}s`,
    };
});

const CelebrationBurst: React.FC = () => (
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

/* ── Shared action row (Done + tap-twice remove) ────────────────────── */

const PlanActions: React.FC<{
    plan: DatePlan;
    armed: boolean;
    onComplete: (id: string) => void;
    onRemoveTap: (id: string) => void;
}> = ({ plan, armed, onComplete, onRemoveTap }) => (
    <div className="flex gap-2">
        <motion.button
            whileTap={{ scale: 0.96 }}
            transition={GOLD_PRESS_SPRING}
            onClick={() => onComplete(plan.id)}
            className="flex-1 h-[44px] rounded-xl inline-flex items-center justify-center gap-2 text-[12.5px] font-bold"
            style={{
                background: 'rgba(246,199,104,0.13)',
                border: '1px solid rgba(246,199,104,0.36)',
                color: GOLD.primary,
            }}
        >
            <Check size={14} strokeWidth={3} />
            Done ✓
        </motion.button>
        <motion.button
            whileTap={{ scale: 0.96 }}
            transition={GOLD_PRESS_SPRING}
            onClick={() => onRemoveTap(plan.id)}
            aria-label={armed ? 'Tap again to remove' : 'Remove plan'}
            className="h-[44px] rounded-xl inline-flex items-center justify-center text-[11.5px] font-bold"
            style={{
                width: armed ? 72 : 48,
                background: armed ? 'rgba(248,113,113,0.13)' : 'rgba(255,255,255,0.05)',
                border: armed ? '1px solid rgba(248,113,113,0.42)' : '1px solid rgba(255,255,255,0.1)',
                color: armed ? '#fda4af' : 'rgba(255,246,230,0.42)',
            }}
        >
            {armed ? 'Sure?' : <Trash2 size={15} strokeWidth={2.2} />}
        </motion.button>
    </div>
);

/* ── Tonight (the pinned plan) ──────────────────────────────────────── */

const TonightCard: React.FC<{
    plan: DatePlan;
    armed: boolean;
    onUpdate: (id: string, patch: Partial<DatePlan>) => void;
    onComplete: (id: string) => void;
    onRemoveTap: (id: string) => void;
}> = ({ plan, armed, onUpdate, onComplete, onRemoveTap }) => {
    const [noteDraft, setNoteDraft] = useState(plan.note ?? '');
    const tint = tintFor(plan.category);
    const desc = descFor(plan.ideaId);

    useEffect(() => {
        setNoteDraft(plan.note ?? '');
        // Re-sync only when the pinned plan changes identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan.id]);

    const commitNote = () => {
        const trimmed = noteDraft.trim();
        if (trimmed === (plan.note ?? '')) return;
        onUpdate(plan.id, { note: trimmed || undefined });
    };

    return (
        <div className="lp-foil">
            <div
                className="relative overflow-hidden rounded-[27px] p-5"
                style={{ background: 'linear-gradient(150deg, #221026 0%, #160a18 100%)' }}
            >
                <div
                    className="lp-float absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl pointer-events-none"
                    style={{ background: `radial-gradient(circle, ${tint}26 0%, transparent 70%)` }}
                />
                <div className="relative z-10">
                    <div className="flex items-start gap-3.5">
                        <div
                            className="flex w-12 h-12 shrink-0 items-center justify-center rounded-2xl text-[22px]"
                            style={{ background: `${tint}1c`, border: `1px solid ${tint}3d` }}
                            aria-hidden="true"
                        >
                            {plan.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3
                                className="font-serif text-[1.25rem] leading-tight"
                                style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                            >
                                {plan.title}
                            </h3>
                            {plan.scheduledFor && (
                                <span
                                    className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.14em]"
                                    style={{ background: `${tint}1a`, border: `1px solid ${tint}3d`, color: tint }}
                                >
                                    <CalendarClock size={10} strokeWidth={2.4} />
                                    {countdownLabel(plan.scheduledFor)}
                                </span>
                            )}
                        </div>
                    </div>

                    {desc && (
                        <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            {desc}
                        </p>
                    )}

                    <div className="mt-4 flex flex-col gap-3">
                        <label className="block">
                            <span
                                className="block text-[9.5px] font-bold uppercase tracking-[0.22em] mb-1.5"
                                style={{ color: GOLD.eyebrow }}
                            >
                                When
                            </span>
                            <input
                                type="datetime-local"
                                value={isoToLocalInput(plan.scheduledFor)}
                                onChange={(e) => {
                                    feedback.tap();
                                    onUpdate(plan.id, { scheduledFor: localInputToIso(e.target.value) });
                                }}
                                className="w-full rounded-xl px-3.5 py-3 text-[13px]"
                                style={INPUT_STYLE}
                            />
                        </label>
                        <label className="block">
                            <span
                                className="block text-[9.5px] font-bold uppercase tracking-[0.22em] mb-1.5"
                                style={{ color: GOLD.eyebrow }}
                            >
                                Note to selves
                            </span>
                            <input
                                type="text"
                                value={noteDraft}
                                maxLength={120}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                onBlur={commitNote}
                                placeholder="One line — “no phones at the table”"
                                className="w-full rounded-xl px-3.5 py-3 text-[13px]"
                                style={INPUT_STYLE}
                            />
                        </label>
                    </div>

                    <div className="mt-4">
                        <PlanActions plan={plan} armed={armed} onComplete={onComplete} onRemoveTap={onRemoveTap} />
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ── Planned row ────────────────────────────────────────────────────── */

const PlannedRow: React.FC<{
    plan: DatePlan;
    armed: boolean;
    onUpdate: (id: string, patch: Partial<DatePlan>) => void;
    onComplete: (id: string) => void;
    onRemoveTap: (id: string) => void;
}> = ({ plan, armed, onUpdate, onComplete, onRemoveTap }) => {
    const tint = tintFor(plan.category);
    return (
        <GoldCard tint={tint} className="p-4">
            <div className="flex items-start gap-3">
                <div
                    className="flex w-10 h-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                    style={{ background: `${tint}1c`, border: `1px solid ${tint}38` }}
                    aria-hidden="true"
                >
                    {plan.emoji}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[13.5px] font-semibold leading-tight truncate" style={{ color: GOLD.textHigh }}>
                            {plan.title}
                        </h4>
                        <span
                            className="shrink-0 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.12em]"
                            style={
                                plan.scheduledFor
                                    ? { background: `${tint}1a`, border: `1px solid ${tint}3d`, color: tint }
                                    : {
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(255,246,230,0.42)',
                                    }
                            }
                        >
                            {plan.scheduledFor ? countdownLabel(plan.scheduledFor) : 'pick a night'}
                        </span>
                    </div>
                    {plan.note && (
                        <p className="mt-1 text-[11px] leading-snug truncate" style={{ color: GOLD.textLow }}>
                            “{plan.note}”
                        </p>
                    )}
                </div>
            </div>

            <input
                type="datetime-local"
                aria-label={`Schedule ${plan.title}`}
                value={isoToLocalInput(plan.scheduledFor)}
                onChange={(e) => {
                    feedback.tap();
                    onUpdate(plan.id, { scheduledFor: localInputToIso(e.target.value) });
                }}
                className="mt-3 w-full rounded-xl px-3.5 py-2.5 text-[12.5px]"
                style={INPUT_STYLE}
            />

            <div className="mt-3">
                <PlanActions plan={plan} armed={armed} onComplete={onComplete} onRemoveTap={onRemoveTap} />
            </div>
        </GoldCard>
    );
};

/* ── Memory row ─────────────────────────────────────────────────────── */

const MemoryRow: React.FC<{
    plan: DatePlan;
    justCompleted: boolean;
    accent: string;
    onSaveMemory: () => void;
}> = ({ plan, justCompleted, accent, onSaveMemory }) => (
    <div className="relative">
        {justCompleted && <CelebrationBurst />}
        <GoldCard className="px-4 py-3.5">
            <div className="flex items-center gap-3">
                <span className="text-[20px]" aria-hidden="true">{plan.emoji}</span>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-tight truncate" style={{ color: GOLD.textHigh }}>
                        {plan.title}
                    </p>
                    <p className="mt-0.5 text-[10.5px]" style={{ color: GOLD.textLow }}>
                        {plan.completedAt ? `Lived ${fmtCompleted(plan.completedAt)}` : 'Lived'}
                    </p>
                </div>
                <span
                    className="flex w-7 h-7 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'rgba(246,199,104,0.13)', border: '1px solid rgba(246,199,104,0.36)' }}
                >
                    <Check size={13} strokeWidth={3} style={{ color: GOLD.primary }} />
                </span>
            </div>
            {justCompleted && (
                <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.35 }}
                    onClick={() => { feedback.tap(); onSaveMemory(); }}
                    className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold"
                    style={{ color: accent }}
                >
                    Save it as a memory
                    <ChevronRight size={13} strokeWidth={2.6} />
                </motion.button>
            )}
        </GoldCard>
    </div>
);

/* ── The section ────────────────────────────────────────────────────── */

export const PlannerSection: React.FC<PlannerSectionProps> = ({
    plans,
    accent,
    justCompletedId,
    onUpdate,
    onComplete,
    onRemove,
    onSaveMemory,
    onDrawFirst,
}) => {
    const [armedId, setArmedId] = useState<string | null>(null);
    const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (armTimerRef.current) clearTimeout(armTimerRef.current);
    }, []);

    const handleRemoveTap = (id: string) => {
        if (armTimerRef.current) clearTimeout(armTimerRef.current);
        if (armedId === id) {
            setArmedId(null);
            onRemove(id);
            return;
        }
        feedback.tap();
        setArmedId(id);
        armTimerRef.current = setTimeout(() => setArmedId(null), 2600);
    };

    const { tonight, planned, memories } = useMemo(() => {
        const active = plans.filter((p) => !p.completedAt);
        const pinned = active.length
            ? [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
            : undefined;
        const rest = active.filter((p) => p.id !== pinned?.id);
        const scheduled = rest
            .filter((p) => p.scheduledFor)
            .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
        const unscheduled = rest
            .filter((p) => !p.scheduledFor)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const lived = plans
            .filter((p) => p.completedAt)
            .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
        return { tonight: pinned, planned: [...scheduled, ...unscheduled], memories: lived };
    }, [plans]);

    if (plans.length === 0) {
        return (
            <>
                <GoldSectionHeader label="The planner" />
                <GoldCard className="p-7">
                    <div className="flex flex-col items-center text-center">
                        <div
                            className="flex w-12 h-12 items-center justify-center rounded-2xl mb-4"
                            style={{ background: `${accent}1c`, border: `1px solid ${accent}3d` }}
                        >
                            <Sparkles size={20} style={{ color: accent }} />
                        </div>
                        <p className="font-serif text-[1.2rem] leading-tight" style={{ color: GOLD.textHigh }}>
                            Your first date night awaits
                        </p>
                        <p className="mt-2 max-w-[30ch] text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            Draw from the deck above — when a card feels like the two of you, keep it and it lands here.
                        </p>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={onDrawFirst}
                            className="mt-5 px-5 h-[44px] rounded-xl text-[13px] font-bold inline-flex items-center gap-2"
                            style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: 'rgba(255,246,230,0.75)',
                            }}
                        >
                            <Sparkles size={14} />
                            Draw your first card
                        </motion.button>
                    </div>
                </GoldCard>
            </>
        );
    }

    return (
        <>
            {tonight && (
                <>
                    <GoldSectionHeader label="Tonight" />
                    <TonightCard
                        plan={tonight}
                        armed={armedId === tonight.id}
                        onUpdate={onUpdate}
                        onComplete={onComplete}
                        onRemoveTap={handleRemoveTap}
                    />
                </>
            )}

            {planned.length > 0 && (
                <>
                    <GoldSectionHeader label="Planned" />
                    <div className="flex flex-col gap-3">
                        <AnimatePresence initial={false}>
                            {planned.map((plan) => (
                                <motion.div
                                    key={plan.id}
                                    initial={{ opacity: 0, y: 14, scale: 0.985 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.96 }}
                                    transition={GOLD_SOFT_SPRING}
                                >
                                    <PlannedRow
                                        plan={plan}
                                        armed={armedId === plan.id}
                                        onUpdate={onUpdate}
                                        onComplete={onComplete}
                                        onRemoveTap={handleRemoveTap}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </>
            )}

            {memories.length > 0 && (
                <>
                    <GoldSectionHeader label="Memories made" />
                    <div className="flex flex-col gap-2.5">
                        {memories.map((plan) => (
                            <MemoryRow
                                key={plan.id}
                                plan={plan}
                                justCompleted={plan.id === justCompletedId}
                                accent={accent}
                                onSaveMemory={onSaveMemory}
                            />
                        ))}
                    </div>
                </>
            )}
        </>
    );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import { Archive, ChevronDown, ChevronRight, Feather, PenLine, Shuffle } from 'lucide-react';
import type { DuetAnswer, DuetEntry, ViewState } from '../types';
import { StorageService } from '../services/storage';
import { PremiumFeaturesStore, seededIndex } from '../services/premiumFeatures';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_PRESS_SPRING,
    GOLD_SOFT_SPRING,
    GoldCard,
    GoldCTA,
    GoldSectionHeader,
    goldRise,
    goldStagger,
} from '../components/premium/GoldKit';
import { PremiumModal } from '../components/PremiumModal';
import { WaxSeal } from '../components/premium/duet-journal/WaxSeal';
import { ComposeSheet } from '../components/premium/duet-journal/ComposeSheet';
import { DuetSpread } from '../components/premium/duet-journal/DuetSpread';
import { DUET_PROMPTS, MOOD_LABELS, MOOD_TINTS, type DuetPrompt } from '../content/duetPrompts';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';

const ACCENT = '#c4b5fd';
const FREE_DUETS = 3;

type CeremonyPhase = 'idle' | 'sealed' | 'cracking' | 'open';

interface DuetJournalViewProps {
    setView: (view: ViewState) => void;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

const formatDay = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const formatClock = (iso: string): string =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Seeded three-card hand: skips used prompts, prefers distinct moods. */
const dealHand = (entries: DuetEntry[], salt: number): DuetPrompt[] => {
    const used = new Set(entries.map((e) => e.prompt));
    const fresh = DUET_PROMPTS.filter((p) => !used.has(p.text));
    const source = fresh.length >= 3 ? fresh : DUET_PROMPTS;
    const seed = `duet:${entries.length}:${salt}`;
    const picks: DuetPrompt[] = [];
    const moods = new Set<string>();
    for (let i = 0; picks.length < 3 && i < source.length * 3; i++) {
        const candidate = source[seededIndex(`${seed}:${i}`, source.length)];
        if (picks.some((p) => p.id === candidate.id)) continue;
        if (moods.has(candidate.mood) && i < source.length * 2) continue;
        picks.push(candidate);
        moods.add(candidate.mood);
    }
    for (const candidate of source) {
        if (picks.length >= 3) break;
        if (!picks.some((p) => p.id === candidate.id)) picks.push(candidate);
    }
    return picks;
};

/* ── Unlock burst (Premium.tsx pattern, copied locally) ─────────────── */

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

/* ── Small pieces ───────────────────────────────────────────────────── */

const MoodChip: React.FC<{ mood: DuetPrompt['mood'] }> = ({ mood }) => (
    <span
        className="inline-flex px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]"
        style={{ background: `${MOOD_TINTS[mood]}1c`, border: `1px solid ${MOOD_TINTS[mood]}38`, color: MOOD_TINTS[mood] }}
    >
        {MOOD_LABELS[mood]}
    </span>
);

const FreeMeter: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
    const pct = Math.min(1, used / limit);
    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,246,230,0.4)' }}>
                    {used} of {limit} free duets
                </span>
                {pct >= 1 && (
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>Full</span>
                )}
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, pct * 100)}%` }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}cc)` }}
                />
            </div>
        </div>
    );
};

/* ── Answer slot: empty pen / sealed wax ────────────────────────────── */

interface AnswerSlotProps {
    name: string;
    answer?: DuetAnswer;
    cracked: boolean;
    hint: string;
    locked: boolean;
    onWrite: () => void;
}

const AnswerSlot: React.FC<AnswerSlotProps> = ({ name, answer, cracked, hint, locked, onWrite }) => (
    <AnimatePresence mode="wait" initial={false}>
        {answer ? (
            <motion.div
                key="sealed"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={GOLD_SOFT_SPRING}
                className="relative overflow-hidden rounded-[1.25rem] px-4 py-4"
                style={{ background: 'rgba(255,250,242,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
                <div className="lp-holo-sheen" />
                <div className="relative flex items-center gap-4">
                    {/* Ghost lines — decorative, never the real text */}
                    <div className="flex-1 flex flex-col gap-2.5 py-1.5" aria-hidden="true" style={{ filter: 'blur(5px)', opacity: 0.75 }}>
                        {[88, 96, 62].map((w, i) => (
                            <div
                                key={i}
                                className="h-[7px] rounded-full"
                                style={{ width: `${w}%`, background: 'linear-gradient(90deg, rgba(255,250,242,0.18), rgba(255,250,242,0.06))' }}
                            />
                        ))}
                    </div>
                    <motion.div
                        initial={{ scale: 1.7, opacity: 0, rotate: 8 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        transition={{ ...GOLD_PRESS_SPRING, delay: 0.12 }}
                        className="shrink-0"
                    >
                        <WaxSeal initial={name.charAt(0).toUpperCase() || '&'} size={54} cracked={cracked} />
                    </motion.div>
                </div>
                <p className="relative mt-2 text-[11px] font-medium" style={{ color: GOLD.textLow }}>
                    {name} has sealed theirs · {formatClock(answer.writtenAt)}
                </p>
            </motion.div>
        ) : (
            <motion.button
                key="empty"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                whileTap={locked ? undefined : { scale: 0.97 }}
                transition={GOLD_SOFT_SPRING}
                onClick={locked ? undefined : onWrite}
                disabled={locked}
                aria-label={`Write ${name}'s answer`}
                className="w-full rounded-[1.25rem] px-4 py-4 text-left flex items-center gap-3.5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.16)' }}
            >
                <div
                    className="flex w-10 h-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${ACCENT}1c`, border: `1px solid ${ACCENT}38` }}
                >
                    <PenLine size={17} style={{ color: ACCENT }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold" style={{ color: GOLD.textHigh }}>{name}</p>
                    <p className="mt-0.5 text-[11px] leading-snug" style={{ color: GOLD.textLow }}>{hint}</p>
                </div>
                <ChevronRight size={15} className="shrink-0" style={{ color: 'rgba(255,246,230,0.28)' }} />
            </motion.button>
        )}
    </AnimatePresence>
);

/* ── Active duet card ───────────────────────────────────────────────── */

interface ActiveDuetCardProps {
    entry: DuetEntry;
    phase: CeremonyPhase;
    myName: string;
    partnerName: string;
    onWrite: (name: string) => void;
    onTuck: () => void;
    onSetAside: () => void;
}

const ActiveDuetCard: React.FC<ActiveDuetCardProps> = ({ entry, phase, myName, partnerName, onWrite, onTuck, onSetAside }) => {
    const promptMeta = DUET_PROMPTS.find((p) => p.text === entry.prompt);
    const revealed = !!entry.revealedAt;
    const showWriting = !revealed || phase === 'sealed' || phase === 'cracking';
    const cracking = phase === 'cracking';
    const count = Object.keys(entry.answers).length;

    const statusCopy = revealed
        ? 'Both sealed. Breaking the wax…'
        : count === 0
            ? 'You each write without seeing the other’s. Answers seal the moment they’re saved.'
            : `Waiting on ${entry.answers[myName] ? partnerName : myName} — no peeking possible.`;

    const hintFor = (otherName: string, otherSealed: boolean): string =>
        otherSealed
            ? `${otherName} can’t see a word of what you write.`
            : 'Tap to write — it seals the moment you save.';

    return (
        <GoldCard tint={ACCENT} className="p-5">
            <div className="flex items-center justify-between">
                {promptMeta ? <MoodChip mood={promptMeta.mood} /> : <span />}
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: GOLD.textLow }}>
                    {formatDay(entry.createdAt)}
                </span>
            </div>

            <p className="font-serif mt-3 text-[1.3rem] leading-[1.25]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                {entry.prompt}
            </p>

            <div className="mt-5">
                <AnimatePresence mode="wait" initial={false}>
                    {showWriting ? (
                        <motion.div
                            key="writing"
                            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.25 } }}
                            className="relative flex flex-col gap-3"
                        >
                            <AnswerSlot
                                name={myName}
                                answer={entry.answers[myName]}
                                cracked={cracking}
                                hint={hintFor(partnerName, !!entry.answers[partnerName])}
                                locked={revealed}
                                onWrite={() => onWrite(myName)}
                            />
                            <AnswerSlot
                                name={partnerName}
                                answer={entry.answers[partnerName]}
                                cracked={cracking}
                                hint={hintFor(myName, !!entry.answers[myName])}
                                locked={revealed}
                                onWrite={() => onWrite(partnerName)}
                            />
                            {cracking && <UnlockBurst />}
                        </motion.div>
                    ) : (
                        <motion.div key="spread" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <DuetSpread entry={entry} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {showWriting && (
                <p className="mt-4 text-[11px] leading-relaxed text-center" style={{ color: revealed ? GOLD.light : GOLD.textLow }}>
                    {statusCopy}
                </p>
            )}

            {showWriting && !revealed && (
                <div className="mt-1 flex justify-end">
                    <button
                        onClick={onSetAside}
                        className="py-1.5 px-2 text-[11px] font-medium active:scale-95 transition-transform"
                        style={{ color: 'rgba(255,246,230,0.3)' }}
                    >
                        Save for later
                    </button>
                </div>
            )}

            {!showWriting && (
                <div className="mt-5 flex justify-center">
                    <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={GOLD_PRESS_SPRING}
                        onClick={onTuck}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,246,230,0.7)' }}
                    >
                        <Archive size={13} />
                        Tuck onto the shelf
                    </motion.button>
                </div>
            )}
        </GoldCard>
    );
};

/* ── Shelf spine (archive row) ──────────────────────────────────────── */

interface ShelfSpineProps {
    entry: DuetEntry;
    expanded: boolean;
    onToggle: () => void;
    onResume: () => void;
}

const ShelfSpine: React.FC<ShelfSpineProps> = ({ entry, expanded, onToggle, onResume }) => {
    const sealedCount = Object.keys(entry.answers).length;
    const revealed = !!entry.revealedAt;
    const writers = Object.keys(entry.answers);

    return (
        <motion.div
            variants={goldRise}
            className="rounded-[1.4rem] overflow-hidden"
            style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
        >
            <button
                onClick={onToggle}
                aria-expanded={expanded}
                className="w-full px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
                <div className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                    {[0, 1].map((i) => (
                        <span
                            key={i}
                            className="block w-[11px] h-[11px] rounded-full"
                            style={
                                i < sealedCount
                                    ? { background: 'radial-gradient(circle at 35% 30%, #fdeec9, #d99c3e)', boxShadow: '0 0 6px rgba(246,199,104,0.45)' }
                                    : { border: '1px solid rgba(255,255,255,0.22)' }
                            }
                        />
                    ))}
                </div>
                <div className="flex-1 min-w-0">
                    <p
                        className="text-[12.5px] font-medium leading-snug"
                        style={{
                            color: 'rgba(255,250,242,0.85)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {entry.prompt}
                    </p>
                    <p
                        className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: revealed ? GOLD.textLow : `${ACCENT}cc` }}
                    >
                        {revealed
                            ? `Revealed ${formatDay(entry.revealedAt ?? entry.createdAt)}`
                            : sealedCount === 0 ? 'Unwritten' : 'Still sealed'}
                    </p>
                </div>
                <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={GOLD_SOFT_SPRING} className="shrink-0">
                    <ChevronDown size={15} style={{ color: 'rgba(255,246,230,0.3)' }} />
                </motion.div>
            </button>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        key="expansion"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.18 } }}
                        transition={GOLD_SOFT_SPRING}
                        className="px-4 pb-4"
                    >
                        {revealed ? (
                            <DuetSpread entry={entry} />
                        ) : (
                            <div
                                className="rounded-[1.25rem] px-4 py-5 flex flex-col items-center text-center"
                                style={{ background: 'rgba(255,250,242,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}
                            >
                                <WaxSeal initial="&" size={44} />
                                <p className="mt-3 text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>
                                    {sealedCount === 1
                                        ? `${writers[0]} has sealed theirs — one pen to go.`
                                        : 'Neither of you has written yet.'}
                                </p>
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={onResume}
                                    className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold"
                                    style={{ background: `${ACCENT}1c`, border: `1px solid ${ACCENT}40`, color: ACCENT }}
                                >
                                    <PenLine size={13} />
                                    Pick it back up
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/* ── Deal-stage card variants ───────────────────────────────────────── */

const dealCardVariants: Variants = {
    hidden: (i: number) => ({ opacity: 0, y: 30, rotate: i === 0 ? -2 : i === 1 ? 1.6 : -1 }),
    visible: { opacity: 1, y: 0, rotate: 0, transition: GOLD_SOFT_SPRING },
};

/* ── Main view ──────────────────────────────────────────────────────── */

export const DuetJournalView: React.FC<DuetJournalViewProps> = ({ setView }) => {
    const reducedMotion = useReducedMotion();
    const profile = useMemo(() => StorageService.getCoupleProfile(), []);
    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Your love';

    const [entries, setEntries] = useState<DuetEntry[]>(() => PremiumFeaturesStore.getDuetEntries());
    const [isPremium, setIsPremium] = useState(() => !!profile.isPremium);
    const [openId, setOpenId] = useState<string | null>(() => {
        const list = PremiumFeaturesStore.getDuetEntries();
        return [...list].reverse().find((e) => !e.revealedAt)?.id ?? null;
    });
    const [phase, setPhase] = useState<CeremonyPhase>('idle');
    const [dealing, setDealing] = useState(false);
    const [dealSalt, setDealSalt] = useState(0);
    const [composeFor, setComposeFor] = useState<string | null>(null);
    const [paywallOpen, setPaywallOpen] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const timersRef = useRef<number[]>([]);
    useEffect(() => () => {
        timersRef.current.forEach((t) => clearTimeout(t));
    }, []);

    const active = useMemo(
        () => (openId ? entries.find((e) => e.id === openId) ?? null : null),
        [entries, openId],
    );

    const shelf = useMemo(
        () => entries
            .filter((e) => e.id !== openId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        [entries, openId],
    );

    const hand = useMemo(() => dealHand(entries, dealSalt), [entries, dealSalt]);

    const persist = useCallback((next: DuetEntry[]) => {
        PremiumFeaturesStore.saveDuetEntries(next);
        setEntries(PremiumFeaturesStore.getDuetEntries());
    }, []);

    const handleNewDuet = useCallback(() => {
        feedback.tap();
        const premiumNow = !!StorageService.getCoupleProfile().isPremium;
        if (!premiumNow && entries.length >= FREE_DUETS) {
            setPaywallOpen(true);
            return;
        }
        setDealSalt((s) => s + 1);
        setDealing(true);
    }, [entries.length]);

    const handleChoose = useCallback((prompt: DuetPrompt) => {
        feedback.tap();
        const entry: DuetEntry = {
            id: generateId(),
            prompt: prompt.text,
            answers: {},
            createdAt: new Date().toISOString(),
        };
        persist([...entries, entry]);
        setOpenId(entry.id);
        setPhase('idle');
        setDealing(false);
        setExpandedId(null);
    }, [entries, persist]);

    const handleSeal = useCallback((text: string) => {
        if (!active || !composeFor) return;
        const writtenAt = new Date().toISOString();
        const nextAnswers: Record<string, DuetAnswer> = {
            ...active.answers,
            [composeFor]: { text, writtenAt },
        };
        const complete = Object.keys(nextAnswers).length >= 2;
        const updated: DuetEntry = {
            ...active,
            answers: nextAnswers,
            ...(complete ? { revealedAt: writtenAt } : {}),
        };
        persist(entries.map((e) => (e.id === active.id ? updated : e)));
        setComposeFor(null);

        if (!complete) {
            feedback.tap();
            const other = composeFor === myName ? partnerName : myName;
            toast.show(`Sealed. Pass the phone to ${other}.`, 'success');
            return;
        }

        // Reveal ceremony: stamp → beat → crack → unfold.
        if (reducedMotion) {
            feedback.celebrate();
            setPhase('open');
            return;
        }
        setPhase('sealed');
        timersRef.current.push(window.setTimeout(() => {
            setPhase('cracking');
            feedback.celebrate();
        }, 700));
        timersRef.current.push(window.setTimeout(() => setPhase('open'), 1650));
    }, [active, composeFor, entries, myName, partnerName, persist, reducedMotion]);

    const handleTuck = useCallback(() => {
        feedback.tap();
        setOpenId(null);
        setPhase('idle');
    }, []);

    const handleSetAside = useCallback(() => {
        feedback.tap();
        setOpenId(null);
        setPhase('idle');
        toast.show('Tucked away — pick it up from the shelf anytime.', 'info');
    }, []);

    const handleResume = useCallback((id: string) => {
        feedback.tap();
        setOpenId(id);
        setPhase('idle');
        setDealing(false);
        setExpandedId(null);
    }, []);

    const handleWrite = useCallback((name: string) => {
        feedback.tap();
        setComposeFor(name);
    }, []);

    const handlePaywallClose = useCallback(() => {
        setPaywallOpen(false);
        setIsPremium(!!StorageService.getCoupleProfile().isPremium);
    }, []);

    return (
        <GoldShell eyebrow="Duet Journal" accent={ACCENT}>
            <motion.div initial="hidden" animate="visible" variants={goldStagger} className="pt-2">
                {/* ── Hero ──────────────────────────────────────────── */}
                <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-6 pb-7">
                    <div
                        className="lp-float mb-5 flex w-[60px] h-[60px] items-center justify-center rounded-[20px]"
                        style={{
                            background: `linear-gradient(140deg, ${ACCENT}29 0%, ${ACCENT}14 100%)`,
                            border: `1px solid ${ACCENT}45`,
                            boxShadow: `0 16px 44px ${ACCENT}24`,
                        }}
                    >
                        <Feather size={26} strokeWidth={1.8} style={{ color: ACCENT }} />
                    </div>
                    <h1 className="font-serif text-[2.1rem] leading-[1.06]" style={{ letterSpacing: '-0.02em' }}>
                        <span style={{ color: GOLD.textHigh }}>One prompt,</span>
                        <br />
                        <span className="lp-shimmer-text">two pens</span>
                    </h1>
                    <p className="mt-3 max-w-[30ch] text-[13.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        Answer apart — every word seals the moment it’s written. The page only opens when you’ve both finished.
                    </p>
                </motion.div>

                {/* ── Stage: active duet / dealing / begin ──────────── */}
                <motion.div variants={goldRise}>
                    <AnimatePresence mode="wait" initial={false}>
                        {active ? (
                            <motion.div
                                key={`active-${active.id}`}
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                                transition={GOLD_SOFT_SPRING}
                            >
                                <ActiveDuetCard
                                    entry={active}
                                    phase={phase}
                                    myName={myName}
                                    partnerName={partnerName}
                                    onWrite={handleWrite}
                                    onTuck={handleTuck}
                                    onSetAside={handleSetAside}
                                />
                            </motion.div>
                        ) : dealing ? (
                            <motion.div
                                key="deal"
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                                transition={GOLD_SOFT_SPRING}
                            >
                                <div className="text-center mb-4">
                                    <h2 className="font-serif text-[1.35rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                        Pick tonight’s prompt
                                    </h2>
                                    <p className="mt-1 text-[11.5px]" style={{ color: GOLD.textLow }}>
                                        Three cards from the deck. Choose one — the others go back.
                                    </p>
                                </div>
                                <motion.div
                                    key={`hand-${dealSalt}`}
                                    initial="hidden"
                                    animate="visible"
                                    variants={goldStagger}
                                    className="flex flex-col gap-3"
                                >
                                    {hand.map((prompt, i) => (
                                        <motion.button
                                            key={prompt.id}
                                            custom={i}
                                            variants={dealCardVariants}
                                            whileTap={{ scale: 0.97 }}
                                            transition={GOLD_PRESS_SPRING}
                                            onClick={() => handleChoose(prompt)}
                                            className="relative overflow-hidden w-full text-left rounded-[1.4rem] p-5"
                                            style={{ background: GOLD.cardBg, border: `1px solid ${MOOD_TINTS[prompt.mood]}33` }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <MoodChip mood={prompt.mood} />
                                                <ChevronRight size={15} style={{ color: 'rgba(255,246,230,0.28)' }} />
                                            </div>
                                            <p className="font-serif mt-3 text-[1.08rem] leading-snug" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                                                {prompt.text}
                                            </p>
                                        </motion.button>
                                    ))}
                                </motion.div>
                                <div className="mt-4 flex items-center justify-center gap-5">
                                    <button
                                        onClick={() => { feedback.tap(); setDealSalt((s) => s + 1); }}
                                        className="inline-flex items-center gap-1.5 py-2 text-[12px] font-semibold active:scale-95 transition-transform"
                                        style={{ color: `${ACCENT}cc` }}
                                    >
                                        <Shuffle size={13} />
                                        Deal three more
                                    </button>
                                    <button
                                        onClick={() => { feedback.tap(); setDealing(false); }}
                                        className="py-2 text-[12px] font-medium active:scale-95 transition-transform"
                                        style={{ color: 'rgba(255,246,230,0.32)' }}
                                    >
                                        Not tonight
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="begin"
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                                transition={GOLD_SOFT_SPRING}
                            >
                                <GoldCard tint={ACCENT} className="p-6">
                                    <div className="flex flex-col items-center text-center">
                                        <div className="flex items-center gap-2.5" aria-hidden="true">
                                            <PenLine size={18} style={{ color: `${ACCENT}b0`, transform: 'rotate(-8deg)' }} />
                                            <span className="font-serif text-[1rem]" style={{ color: '#e9b765' }}>&amp;</span>
                                            <PenLine size={18} style={{ color: `${ACCENT}b0`, transform: 'rotate(8deg) scaleX(-1)' }} />
                                        </div>
                                        <h2 className="font-serif mt-4 text-[1.45rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                            {entries.length > 0 ? 'Ready for another?' : 'Your first duet awaits'}
                                        </h2>
                                        <p className="mt-2 max-w-[30ch] text-[12.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                                            Choose one prompt. You each write blind, and the spread opens only when both seals are pressed.
                                        </p>
                                        <div className="mt-5 w-full">
                                            <GoldCTA onClick={handleNewDuet}>Deal the cards</GoldCTA>
                                        </div>
                                        {!isPremium && (
                                            <div className="mt-4 w-full px-1">
                                                <FreeMeter used={Math.min(entries.length, FREE_DUETS)} limit={FREE_DUETS} />
                                            </div>
                                        )}
                                    </div>
                                </GoldCard>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* ── The shelf ─────────────────────────────────────── */}
                {shelf.length > 0 && (
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="The shelf" />
                        <div className="flex flex-col gap-2.5">
                            {shelf.map((entry) => (
                                <ShelfSpine
                                    key={entry.id}
                                    entry={entry}
                                    expanded={expandedId === entry.id}
                                    onToggle={() => {
                                        feedback.tap();
                                        setExpandedId((cur) => (cur === entry.id ? null : entry.id));
                                    }}
                                    onResume={() => handleResume(entry.id)}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* ── Footer ────────────────────────────────────────── */}
                <motion.div variants={goldRise} className="mt-10 flex items-center justify-center gap-2">
                    <Feather size={11} style={{ color: `${ACCENT}99` }} />
                    <span className="text-[11px]" style={{ color: 'rgba(255,246,230,0.3)' }}>
                        Written apart, kept together.
                    </span>
                </motion.div>
            </motion.div>

            {/* Sheets & paywall */}
            <ComposeSheet
                open={!!composeFor && !!active && !active.revealedAt}
                authorName={composeFor ?? ''}
                prompt={active?.prompt ?? ''}
                accent={ACCENT}
                onClose={() => setComposeFor(null)}
                onSeal={handleSeal}
            />
            <PremiumModal isOpen={paywallOpen} onClose={handlePaywallClose} featureContext="generic" />
        </GoldShell>
    );
};

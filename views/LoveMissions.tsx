import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, Heart, Sparkles } from 'lucide-react';
import type { CoupleProfile, LoveLanguageType, MissionRecord, MissionState, ViewState } from '../types';
import { StorageService, storageEventTarget, type StorageUpdateDetail } from '../services/storage';
import { PremiumFeaturesStore, mondayOf, seededIndex } from '../services/premiumFeatures';
import { RelationshipModelService } from '../services/relationshipModel';
import { MISSION_POOL, type MissionTemplate } from '../content/missions';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_PRESS_SPRING,
    GOLD_SOFT_SPRING,
    GoldCard,
    GoldGate,
    GoldSectionHeader,
    goldRise,
    goldStagger,
} from '../components/premium/GoldKit';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import '../styles/premium-hub.css';

interface LoveMissionsProps {
    setView: (view: ViewState) => void;
}

const ACCENT = '#ec4899';

/** Past mission records kept on the profile (7 weeks × 3 missions). */
const HISTORY_RECORD_CAP = 21;

const ALL_LANGUAGES: LoveLanguageType[] = [
    'words_of_affirmation',
    'quality_time',
    'acts_of_service',
    'physical_touch',
    'gifts',
];

const LANGUAGE_META: Record<MissionTemplate['language'], { label: string; tint: string }> = {
    words_of_affirmation: { label: 'Kind words', tint: '#60a5fa' },
    quality_time: { label: 'Quality time', tint: '#34d399' },
    acts_of_service: { label: 'Acts of care', tint: '#fbbf24' },
    physical_touch: { label: 'Touch', tint: '#f43f5e' },
    gifts: { label: 'Gifts', tint: '#a78bfa' },
    any: { label: 'Wildcard', tint: ACCENT },
};

/* ── Week helpers ───────────────────────────────────────────────────── */

const previousMonday = (weekStart: string): string => {
    const [y, m, d] = weekStart.split('-').map(Number);
    return mondayOf(new Date(y, (m ?? 1) - 1, (d ?? 1) - 7));
};

const formatWeekRange = (weekStart: string): string => {
    const [y, m, d] = weekStart.split('-').map(Number);
    const start = new Date(y, (m ?? 1) - 1, d ?? 1);
    const end = new Date(y, (m ?? 1) - 1, (d ?? 1) + 6);
    const startMonth = start.toLocaleDateString(undefined, { month: 'short' });
    const endMonth = end.toLocaleDateString(undefined, { month: 'short' });
    return startMonth === endMonth
        ? `${start.getDate()}–${end.getDate()} ${endMonth}`
        : `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
};

/* ── Deterministic weekly generation ────────────────────────────────── */

/** Seeded pick that walks forward past already-picked (and, softly, last week's) ids. */
const pickFromPool = (
    pool: MissionTemplate[],
    seed: string,
    picked: Set<string>,
    lastWeekIds: Set<string>,
): MissionTemplate => {
    const start = seededIndex(seed, pool.length);
    for (let i = 0; i < pool.length; i++) {
        const candidate = pool[(start + i) % pool.length];
        if (!picked.has(candidate.id) && !lastWeekIds.has(candidate.id)) return candidate;
    }
    for (let i = 0; i < pool.length; i++) {
        const candidate = pool[(start + i) % pool.length];
        if (!picked.has(candidate.id)) return candidate;
    }
    return pool[start];
};

/**
 * Builds the active week. Pure — persisting is the caller's job.
 *
 * Selection: deterministic via seededIndex(weekStart + couple identity + slot),
 * so both partners derive the same three missions. When the Love Tracker
 * knows the partner's primary love language, two of three picks come from
 * that language and the third is a wildcard; otherwise one wildcard plus
 * two seeded-random languages.
 *
 * Streak: weekStreak counts consecutive weeks with ≥1 completion. It is
 * carried into a new week only when the previous Monday's week saw a
 * completion (it then increments on this week's first completion); a
 * fully missed week resets it to 0.
 */
const buildWeek = (prev: MissionState | undefined, profile: CoupleProfile): MissionState => {
    const weekStart = mondayOf();
    const identity = profile.coupleId ?? `${profile.myName ?? ''}+${profile.partnerName ?? ''}`;
    const seedBase = `${weekStart}|${identity}`;

    const partnerLanguage = RelationshipModelService.getPartnerLoveLanguage();
    const primary = partnerLanguage && partnerLanguage.confidence > 0 ? partnerLanguage.primary : null;

    let slotLanguages: Array<LoveLanguageType | 'any'>;
    if (primary) {
        slotLanguages = [primary, primary, 'any'];
    } else {
        const first = seededIndex(`${seedBase}|langA`, ALL_LANGUAGES.length);
        let second = seededIndex(`${seedBase}|langB`, ALL_LANGUAGES.length);
        if (second === first) second = (second + 1) % ALL_LANGUAGES.length;
        slotLanguages = ['any', ALL_LANGUAGES[first], ALL_LANGUAGES[second]];
    }

    const lastWeekIds = new Set(
        (prev?.missions ?? []).filter((m) => m.weekStart === prev?.weekStart).map((m) => m.id),
    );
    const picked = new Set<string>();
    const missions: MissionRecord[] = slotLanguages.map((language, slot) => {
        const pool = MISSION_POOL.filter((t) => t.language === language);
        const template = pickFromPool(pool, `${seedBase}|slot${slot}`, picked, lastWeekIds);
        picked.add(template.id);
        return {
            id: template.id,
            weekStart,
            title: template.title,
            detail: template.detail,
            language: template.language,
        };
    });

    const streakSurvives = !!prev && prev.lastCompletedWeek === previousMonday(weekStart);

    return {
        weekStart,
        missions: [...(prev?.missions ?? []).slice(-HISTORY_RECORD_CAP), ...missions],
        completedTotal: prev?.completedTotal ?? 0,
        weekStreak: streakSurvives && prev ? prev.weekStreak : 0,
        lastCompletedWeek: prev?.lastCompletedWeek,
    };
};

/* ── Celebration burst (lp-burst pattern, see views/Premium.tsx) ────── */

const BURST_PARTICLES = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const dist = 70 + (i % 5) * 16;
    return {
        dx: `${Math.round(Math.cos(angle) * dist)}px`,
        dy: `${Math.round(Math.sin(angle) * dist * 0.85)}px`,
        delay: `${(i % 6) * 0.035}s`,
    };
});

const CompleteBurst: React.FC = () => (
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

/* ── Progress ring ──────────────────────────────────────────────────── */

const RING_SIZE = 92;
const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const ProgressRing: React.FC<{ completed: number; total: number }> = ({ completed, total }) => {
    const reducedMotion = useReducedMotion();
    const offset = RING_CIRCUMFERENCE * (1 - Math.min(1, completed / total));
    const center = RING_SIZE / 2;

    return (
        <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
                <defs>
                    <linearGradient id="lm-ring-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fdeec9" />
                        <stop offset="55%" stopColor="#f6c768" />
                        <stop offset="100%" stopColor="#d99c3e" />
                    </linearGradient>
                </defs>
                <circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
                <motion.circle
                    cx={center}
                    cy={center}
                    r={RING_RADIUS}
                    fill="none"
                    stroke="url(#lm-ring-gold)"
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                    animate={{ strokeDashoffset: offset }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                    transform={`rotate(-90 ${center} ${center})`}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" aria-label={`${completed} of ${total} missions done`}>
                <span className="font-serif text-[1.3rem] leading-none" style={{ color: GOLD.textHigh }}>
                    {completed}
                    <span style={{ color: GOLD.textLow }}>/{total}</span>
                </span>
                <span className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD.textLow }}>
                    done
                </span>
            </div>
        </div>
    );
};

/* ── Quest card ─────────────────────────────────────────────────────── */

interface MissionCardProps {
    record: MissionRecord;
    index: number;
    bursting: boolean;
    myName: string;
    partnerName: string;
    onComplete: (record: MissionRecord) => void;
    onFelt: (record: MissionRecord) => void;
}

const MissionCard: React.FC<MissionCardProps> = ({ record, index, bursting, myName, partnerName, onComplete, onFelt }) => {
    const meta = LANGUAGE_META[record.language] ?? LANGUAGE_META.any;
    const done = !!record.completedAt;
    const witnessName = record.completedBy === myName ? partnerName : myName;
    const doneDay = record.completedAt
        ? new Date(record.completedAt).toLocaleDateString(undefined, { weekday: 'long' })
        : '';

    return (
        <div className={done ? 'lp-foil' : undefined}>
            <div
                className="relative overflow-hidden p-5"
                style={{
                    borderRadius: done ? 27 : '1.6rem',
                    background: done ? 'linear-gradient(150deg, #221026 0%, #160a18 100%)' : GOLD.cardBg,
                    border: done ? '1px solid transparent' : `1px solid ${meta.tint}33`,
                }}
            >
                {bursting && <CompleteBurst />}
                <div
                    className="lp-float absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl pointer-events-none"
                    style={{ background: `radial-gradient(circle, ${meta.tint}29 0%, transparent 70%)` }}
                />

                <div className="relative z-10">
                    <div className="flex items-center justify-between">
                        <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.16em]"
                            style={{ background: `${meta.tint}1c`, border: `1px solid ${meta.tint}3d`, color: meta.tint }}
                        >
                            {meta.label}
                        </span>
                        <span className="text-[10px] font-bold tracking-[0.24em]" style={{ color: 'rgba(255,246,230,0.25)' }}>
                            0{index + 1}
                        </span>
                    </div>

                    <h3
                        className="mt-3.5 font-serif text-[1.32rem] leading-snug"
                        style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                    >
                        {record.title}
                    </h3>
                    <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        {record.detail}
                    </p>

                    <AnimatePresence mode="wait" initial={false}>
                        {done ? (
                            <motion.div
                                key="done"
                                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={GOLD_SOFT_SPRING}
                                className="mt-5 flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <span
                                        className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]"
                                        style={{ color: GOLD.primary }}
                                    >
                                        <Check size={12} strokeWidth={3} />
                                        Done · {record.completedBy}
                                    </span>
                                    {doneDay && (
                                        <span className="mt-1 block text-[10.5px]" style={{ color: GOLD.textLow }}>
                                            on {doneDay}
                                        </span>
                                    )}
                                </div>
                                {record.feltAt ? (
                                    <span
                                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold"
                                        style={{
                                            background: 'rgba(236,72,153,0.16)',
                                            border: '1px solid rgba(236,72,153,0.45)',
                                            color: '#f9a8d4',
                                        }}
                                    >
                                        <Heart size={11} fill="currentColor" strokeWidth={0} />
                                        {record.feltBy} felt it
                                    </span>
                                ) : (
                                    <motion.button
                                        whileTap={{ scale: 0.94 }}
                                        transition={GOLD_PRESS_SPRING}
                                        onClick={() => onFelt(record)}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold"
                                        style={{
                                            background: 'rgba(236,72,153,0.09)',
                                            border: '1px solid rgba(236,72,153,0.35)',
                                            color: '#f9a8d4',
                                        }}
                                    >
                                        {witnessName} felt it
                                        <Heart size={11} strokeWidth={2.2} />
                                    </motion.button>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="todo"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={GOLD_SOFT_SPRING}
                                className="mt-5 flex items-center justify-between gap-3"
                            >
                                <span className="text-[10.5px] leading-snug" style={{ color: GOLD.textLow }}>
                                    Done in real life? Seal it here.
                                </span>
                                <motion.button
                                    whileTap={{ scale: 0.88 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={() => onComplete(record)}
                                    aria-label={`Mark "${record.title}" complete`}
                                    className="flex w-12 h-12 shrink-0 items-center justify-center rounded-full"
                                    style={{
                                        background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                        color: GOLD.inkOnGold,
                                        boxShadow: '0 10px 26px rgba(246,199,104,0.3), inset 0 1px 0 rgba(255,246,222,0.45)',
                                    }}
                                >
                                    <Check size={20} strokeWidth={3} />
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

/* ── Main view ──────────────────────────────────────────────────────── */

export const LoveMissionsView: React.FC<LoveMissionsProps> = ({ setView }) => {
    const [profile, setProfile] = useState<CoupleProfile>(() => StorageService.getCoupleProfile());
    const [missionState, setMissionState] = useState<MissionState>(() => {
        const stored = PremiumFeaturesStore.getMissionState();
        if (stored && stored.weekStart === mondayOf()) return stored;
        return buildWeek(stored, StorageService.getCoupleProfile());
    });
    const [burstId, setBurstId] = useState<string | null>(null);
    const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Your love';
    const isPremium = !!profile.isPremium;

    // Persist a freshly generated week once, on mount (generation itself is pure).
    useEffect(() => {
        const stored = PremiumFeaturesStore.getMissionState();
        if (!stored || stored.weekStart !== missionState.weekStart) {
            PremiumFeaturesStore.saveMissionState(missionState);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reflect profile saves made elsewhere — the GoldGate paywall unlocking
    // premium, or partner mission completions arriving via cloud sync.
    useEffect(() => {
        const handleUpdate = (e: Event) => {
            const detail = (e as CustomEvent<StorageUpdateDetail>).detail;
            if (detail?.table !== 'couple_profile') return;
            const fresh = StorageService.getCoupleProfile();
            setProfile(fresh);
            const storedMissions = fresh.missionState;
            if (storedMissions && storedMissions.weekStart === mondayOf()) {
                setMissionState((current) =>
                    JSON.stringify(storedMissions) === JSON.stringify(current) ? current : storedMissions,
                );
            }
        };
        storageEventTarget.addEventListener('storage-update', handleUpdate);
        return () => storageEventTarget.removeEventListener('storage-update', handleUpdate);
    }, []);

    useEffect(() => () => {
        if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    }, []);

    const weekMissions = useMemo(
        () => missionState.missions.filter((m) => m.weekStart === missionState.weekStart),
        [missionState],
    );
    const completedThisWeek = weekMissions.filter((m) => m.completedAt).length;

    // Two cards sharing a non-wildcard language means the week was tuned
    // to the partner's primary love language.
    const tunedMeta = useMemo(() => {
        if (weekMissions.length < 2) return null;
        const [a, b] = weekMissions;
        return a.language !== 'any' && a.language === b.language ? LANGUAGE_META[a.language] : null;
    }, [weekMissions]);

    const pastWeeks = useMemo(() => {
        const grouped = new Map<string, MissionRecord[]>();
        for (const m of missionState.missions) {
            if (m.weekStart === missionState.weekStart) continue;
            grouped.set(m.weekStart, [...(grouped.get(m.weekStart) ?? []), m]);
        }
        return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    }, [missionState]);

    const handleComplete = useCallback((record: MissionRecord) => {
        if (record.completedAt) return;
        const now = new Date().toISOString();
        const firstOfWeek = missionState.lastCompletedWeek !== missionState.weekStart;
        const nextStreak = firstOfWeek ? missionState.weekStreak + 1 : missionState.weekStreak;
        const next: MissionState = {
            ...missionState,
            missions: missionState.missions.map((m) =>
                m.weekStart === missionState.weekStart && m.id === record.id
                    ? { ...m, completedBy: myName, completedAt: now }
                    : m,
            ),
            completedTotal: missionState.completedTotal + 1,
            weekStreak: nextStreak,
            lastCompletedWeek: missionState.weekStart,
        };
        PremiumFeaturesStore.saveMissionState(next);
        setMissionState(next);
        setBurstId(record.id);
        if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
        burstTimerRef.current = setTimeout(() => setBurstId(null), 1200);
        feedback.celebrate();
        toast.show(
            firstOfWeek && nextStreak > 1 ? `That makes ${nextStreak} weeks in a row 🔥` : 'Mission complete ♥',
            'success',
        );
    }, [missionState, myName]);

    const handleFelt = useCallback((record: MissionRecord) => {
        if (!record.completedAt || record.feltAt) return;
        const feltBy = record.completedBy === myName ? partnerName : myName;
        const next: MissionState = {
            ...missionState,
            missions: missionState.missions.map((m) =>
                m.weekStart === missionState.weekStart && m.id === record.id
                    ? { ...m, feltBy, feltAt: new Date().toISOString() }
                    : m,
            ),
        };
        PremiumFeaturesStore.saveMissionState(next);
        setMissionState(next);
        feedback.tap();
        toast.show(`${feltBy} felt it — that's the whole point`, 'success');
    }, [missionState, myName, partnerName]);

    return (
        <GoldShell eyebrow="Love Missions" accent={ACCENT}>
            <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                {/* ── Week header ───────────────────────────────────── */}
                <motion.div variants={goldRise} className="pt-7">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                                This week
                            </span>
                            <h1
                                className="mt-2 font-serif text-[1.9rem] leading-[1.05]"
                                style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                            >
                                {formatWeekRange(missionState.weekStart)}
                            </h1>
                            <p className="mt-2.5 max-w-[24ch] text-[12.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                                Three small missions. Love, made of verbs.
                            </p>
                        </div>
                        <ProgressRing completed={completedThisWeek} total={3} />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <div
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                            style={{ background: 'rgba(246,199,104,0.08)', border: '1px solid rgba(246,199,104,0.22)' }}
                        >
                            <span className="text-[12px] leading-none" aria-hidden="true">🔥</span>
                            <span
                                className={`text-[11px] font-bold ${missionState.weekStreak > 0 ? 'lp-shimmer-text' : ''}`}
                                style={missionState.weekStreak > 0 ? undefined : { color: GOLD.textLow }}
                            >
                                ×{missionState.weekStreak}
                            </span>
                            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD.textLow }}>
                                week streak
                            </span>
                        </div>
                        {missionState.completedTotal > 0 && (
                            <div className="lp-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full">
                                <Check size={11} strokeWidth={3} style={{ color: GOLD.primary }} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD.textMid }}>
                                    {missionState.completedTotal} all-time
                                </span>
                            </div>
                        )}
                    </div>

                    {tunedMeta && (
                        <p className="mt-3.5 inline-flex items-center gap-1.5 text-[11px]" style={{ color: GOLD.textLow }}>
                            <Heart size={10} fill="currentColor" strokeWidth={0} style={{ color: 'rgba(236,72,153,0.65)' }} />
                            Tuned to how {partnerName} receives love · {tunedMeta.label.toLowerCase()}
                        </p>
                    )}
                </motion.div>

                {/* ── The three missions ────────────────────────────── */}
                <motion.div variants={goldRise}>
                    <GoldSectionHeader label="Your three missions" className="mt-8 mb-4" />
                </motion.div>

                {weekMissions[0] && (
                    <motion.div variants={goldRise}>
                        <MissionCard
                            record={weekMissions[0]}
                            index={0}
                            bursting={burstId === weekMissions[0].id}
                            myName={myName}
                            partnerName={partnerName}
                            onComplete={handleComplete}
                            onFelt={handleFelt}
                        />
                    </motion.div>
                )}

                <motion.div variants={goldRise} className="mt-3.5">
                    <GoldGate
                        locked={!isPremium}
                        title="Three missions, every week"
                        sub={`Gold opens all three weekly missions — tuned to how ${partnerName} receives love, renewed every Monday.`}
                        featureContext="generic"
                    >
                        <div className="flex flex-col gap-3.5">
                            {weekMissions.slice(1).map((record, i) => (
                                <MissionCard
                                    key={`${record.weekStart}-${record.id}`}
                                    record={record}
                                    index={i + 1}
                                    bursting={burstId === record.id}
                                    myName={myName}
                                    partnerName={partnerName}
                                    onComplete={handleComplete}
                                    onFelt={handleFelt}
                                />
                            ))}
                        </div>
                    </GoldGate>
                </motion.div>

                <motion.div variants={goldRise} className="mt-4 flex items-center justify-center gap-2">
                    <Sparkles size={11} style={{ color: 'rgba(246,199,104,0.6)' }} />
                    <span className="text-[11px]" style={{ color: GOLD.textLow }}>
                        Fresh missions arrive every Monday.
                    </span>
                </motion.div>

                {/* ── Past weeks ────────────────────────────────────── */}
                <motion.div variants={goldRise}>
                    <GoldSectionHeader label="Past weeks" />
                </motion.div>

                <motion.div variants={goldRise}>
                    {pastWeeks.length === 0 ? (
                        <GoldCard className="px-5 py-6 text-center">
                            <p className="text-[12.5px] leading-relaxed" style={{ color: GOLD.textLow }}>
                                This is week one. Your history will gather here, Monday by Monday.
                            </p>
                        </GoldCard>
                    ) : (
                        <GoldCard className="p-0">
                            {pastWeeks.map(([weekStart, records], rowIndex) => {
                                const doneCount = records.filter((m) => m.completedAt).length;
                                return (
                                    <div
                                        key={weekStart}
                                        className="flex items-center justify-between px-5 py-3.5"
                                        style={{
                                            borderBottom:
                                                rowIndex < pastWeeks.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                        }}
                                    >
                                        <span className="text-[12.5px] font-medium" style={{ color: 'rgba(255,250,242,0.82)' }}>
                                            {formatWeekRange(weekStart)}
                                        </span>
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex items-center gap-1.5">
                                                {records.map((m) => (
                                                    <span
                                                        key={`${weekStart}-${m.id}`}
                                                        className="w-[7px] h-[7px] rounded-full"
                                                        style={{
                                                            background: m.completedAt
                                                                ? `linear-gradient(135deg, ${GOLD.primary}, ${GOLD.deep})`
                                                                : 'rgba(255,255,255,0.12)',
                                                            boxShadow: m.completedAt ? '0 0 6px rgba(246,199,104,0.5)' : 'none',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-[11px] font-semibold tabular-nums" style={{ color: GOLD.light }}>
                                                {doneCount}/3
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </GoldCard>
                    )}
                </motion.div>

                {/* ── Footer ────────────────────────────────────────── */}
                <motion.div variants={goldRise} className="mt-10 flex items-center justify-center gap-2">
                    <Heart size={11} style={{ color: 'rgba(236,72,153,0.6)' }} fill="currentColor" strokeWidth={0} />
                    <span className="text-[11px]" style={{ color: 'rgba(255,246,230,0.3)' }}>
                        Small things, done weekly, become the relationship.
                    </span>
                </motion.div>
            </motion.div>
        </GoldShell>
    );
};

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Feather, Heart, Sparkles } from 'lucide-react';
import type {
    DeepInsight,
    EmotionalRhythm,
    InsightTone,
    RelationshipModel,
    ResponsePattern,
    ViewState,
} from '../types';
import { PartnerIntelligenceService } from '../services/partnerIntelligence';
import { RelationshipSignals, signalEventTarget } from '../services/relationshipSignals';
import { RelationshipModelService, modelEventTarget } from '../services/relationshipModel';
import { InsightEngine, insightEventTarget, checkAndGenerateDeepInsights } from '../services/insightEngine';
import { InsightCard } from '../components/InsightCard';
import { PulseCheckSheet } from '../components/PulseCheckSheet';
import { WeeklyReflectionSheet } from '../components/WeeklyReflection';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_PRESS_SPRING,
    GOLD_SOFT_SPRING,
    GoldSectionHeader,
    goldRise,
    goldStagger,
} from '../components/premium/GoldKit';
import { feedback } from '../utils/feedback';
import { shouldGateHeavyView } from '../utils/runtimeProfile';
import '../styles/gold-partner-intelligence.css';

interface PartnerIntelligenceViewProps {
    setView: (view: ViewState) => void;
}

const ACCENT = '#8b5cf6';

const getProfileNames = () => {
    try {
        const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
        return {
            myName: profile.myName || 'You',
            partnerName: profile.partnerName || 'Partner',
        };
    } catch { return { myName: 'You', partnerName: 'Partner' }; }
};

const LazyPartnerIntelligenceVisuals = React.lazy(() =>
    import('../components/partner-intelligence/PartnerIntelligenceVisuals').then((module) => ({
        default: module.PartnerIntelligenceVisuals,
    })),
);

/* ── Observatory metadata ───────────────────────────────────────────── */

const PHASE_META: Record<string, { label: string; color: string; description: string }> = {
    discovering: { label: 'Discovering', color: '#93c5fd', description: 'Learning who you are together' },
    honeymoon: { label: 'Honeymoon', color: '#f472b6', description: 'Everything feels new and alive' },
    deepening: { label: 'Deepening', color: '#a78bfa', description: 'Growing into something real' },
    challenging: { label: 'Challenging', color: '#fbbf24', description: `A season of friction — that’s normal` },
    renewing: { label: 'Renewing', color: '#34d399', description: 'Finding your way back to each other' },
    settling: { label: 'Settling In', color: '#93c5fd', description: 'Building a steady foundation' },
};

const TONE_HUES: Record<InsightTone, string> = {
    warm: '#f6c768',
    gentle: '#93c5fd',
    curious: '#5eead4',
    celebratory: '#fb7185',
};

const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

const TIME_PHRASE: Record<EmotionalRhythm['bestTimeOfDay'], string> = {
    morning: 'in the morning',
    afternoon: 'in the afternoon',
    evening: 'in the evening',
    night: 'late at night',
};

const TREND_META: Record<ResponsePattern['latencyTrend'], { glyph: string; word: string; color: string }> = {
    faster: { glyph: '↗', word: 'quicker lately', color: '#34d399' },
    stable: { glyph: '→', word: 'steady', color: '#93c5fd' },
    slower: { glyph: '↘', word: 'slower lately', color: '#fbbf24' },
};

const humanizeLatency = (ms: number): string => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return 'within moments';
    if (minutes < 60) return `in ~${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `in ~${hours} hr`;
    return `in ~${Math.round(hours / 24)} d`;
};

/* ── Constellation hero ─────────────────────────────────────────────── */

function ConstellationHero({
    model,
    myName,
    partnerName,
}: {
    model: RelationshipModel | null;
    myName: string;
    partnerName: string;
}) {
    const meta = model ? (PHASE_META[model.currentPhase] || PHASE_META.settling) : null;
    const showPhase = !!model && model.dataConfidence >= 0.2;

    // The gap between the two stars maps to closeness: the closer you
    // are, the closer they sit on the sky. Pure presentation.
    const closeness = Math.max(0, Math.min(100, model?.closenessScore.current ?? 50));
    const gap = 62 - (closeness / 100) * 32;
    const x1 = 50 - gap / 2;
    const x2 = 50 + gap / 2;

    return (
        <div className="gpi-sky">
            <div className="gpi-sky__flecks" aria-hidden="true" />

            {/* Star field */}
            <div className="relative h-[168px]">
                <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id="gpi-thread-grad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor="rgba(246,199,104,0.06)" />
                            <stop offset="0.5" stopColor="rgba(246,199,104,0.75)" />
                            <stop offset="1" stopColor="rgba(196,181,253,0.45)" />
                        </linearGradient>
                    </defs>
                    <motion.path
                        d={`M ${x1} 46 Q 50 58 ${x2} 46`}
                        fill="none"
                        stroke="url(#gpi-thread-grad)"
                        strokeWidth={1.1}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.9 }}
                    />
                </svg>

                <div className="gpi-star" style={{ left: `${x1}%` }}>
                    <motion.span
                        className="gpi-star__glow"
                        initial={{ opacity: 0, scale: 0.3 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...GOLD_SOFT_SPRING, delay: 0.18 }}
                    >
                        <span className="gpi-star__core" />
                    </motion.span>
                    <motion.span
                        className="gpi-star__label"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.55 }}
                    >
                        {myName}
                    </motion.span>
                </div>

                <div className="gpi-star gpi-star--violet" style={{ left: `${x2}%` }}>
                    <motion.span
                        className="gpi-star__glow"
                        initial={{ opacity: 0, scale: 0.3 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...GOLD_SOFT_SPRING, delay: 0.3 }}
                    >
                        <span className="gpi-star__core" />
                    </motion.span>
                    <motion.span
                        className="gpi-star__label"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.65 }}
                    >
                        {partnerName}
                    </motion.span>
                </div>
            </div>

            {/* Observatory copy */}
            <div className="relative px-6 pb-6 pt-1 text-center">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                    {showPhase ? 'Current reading' : 'First light'}
                </p>
                {showPhase && meta ? (
                    <>
                        <h2
                            className="mt-2 font-serif text-[1.65rem] leading-tight"
                            style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                        >
                            Currently: <em style={{ color: meta.color }}>{meta.label.toLowerCase()}</em>
                        </h2>
                        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            {meta.description}
                        </p>
                    </>
                ) : (
                    <>
                        <h2
                            className="mt-2 font-serif text-[1.65rem] leading-tight"
                            style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                        >
                            Still charting your sky
                        </h2>
                        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            A few evenings of check-ins will bring your constellation into focus.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Pulse Check Prompt ──────────────────────────────────────────────── */

function PulseCheckPrompt({ onOpen }: { onOpen: () => void }) {
    const hasPulsedToday = RelationshipSignals.getTodaysPulseCheck() !== null;
    if (hasPulsedToday) return null;

    return (
        <motion.button
            variants={goldRise}
            whileTap={{ scale: 0.97 }}
            transition={GOLD_PRESS_SPRING}
            onClick={() => { feedback.tap(); onOpen(); }}
            className="lp-holo-sheen relative overflow-hidden w-full rounded-[1.6rem] p-5 text-left"
            style={{
                background: 'linear-gradient(145deg, rgba(246,199,104,0.1) 0%, rgba(255,255,255,0.02) 55%)',
                border: '1px solid rgba(246,199,104,0.35)',
            }}
        >
            <div className="relative z-10 flex items-center gap-4">
                <div
                    className="flex w-11 h-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: 'rgba(236,72,153,0.14)', border: '1px solid rgba(236,72,153,0.32)' }}
                >
                    <Heart size={19} style={{ color: '#fb7185' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD.eyebrow }}>
                        Tonight&rsquo;s observation
                    </p>
                    <p className="mt-1 font-serif text-[1.05rem] leading-tight" style={{ color: GOLD.textHigh }}>
                        How did today feel?
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: GOLD.textLow }}>
                        One small check-in, and the whole sky sharpens.
                    </p>
                </div>
                <ChevronRight size={16} style={{ color: 'rgba(255,246,230,0.3)' }} />
            </div>
        </motion.button>
    );
}

/* ── Weekly Reflection Prompt ────────────────────────────────────────── */

function ReflectionPrompt({ onOpen }: { onOpen: () => void }) {
    return (
        <motion.button
            variants={goldRise}
            whileTap={{ scale: 0.97 }}
            transition={GOLD_PRESS_SPRING}
            onClick={() => { feedback.tap(); onOpen(); }}
            className="relative overflow-hidden w-full rounded-[1.6rem] p-5 text-left"
            style={{
                background: 'linear-gradient(145deg, rgba(139,92,246,0.12) 0%, rgba(255,255,255,0.02) 60%)',
                border: '1px solid rgba(139,92,246,0.32)',
            }}
        >
            <div className="relative z-10 flex items-center gap-4">
                <div
                    className="flex w-11 h-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.35)' }}
                >
                    <Feather size={18} style={{ color: '#c4b5fd' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD.eyebrow }}>
                        Weekly ritual
                    </p>
                    <p className="mt-1 font-serif text-[1.05rem] leading-tight" style={{ color: GOLD.textHigh }}>
                        Close the week together
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: GOLD.textLow }}>
                        Best moment + what felt hard this week
                    </p>
                </div>
                <ChevronRight size={16} style={{ color: 'rgba(255,246,230,0.3)' }} />
            </div>
        </motion.button>
    );
}

/* ── System Message ──────────────────────────────────────────────────── */

function SystemMessageCard({ message }: { message: { text: string; emoji: string } }) {
    return (
        <motion.div variants={goldRise} className="gpi-panel px-5 py-5 text-center">
            <span
                className="text-lg block mb-2"
                style={{ color: GOLD.primary, textShadow: '0 0 14px rgba(246,199,104,0.55)' }}
            >
                {message.emoji}
            </span>
            <p className="text-[12px] leading-relaxed mx-auto max-w-[34ch]" style={{ color: GOLD.textMid }}>
                {message.text}
            </p>
        </motion.div>
    );
}

/* ── Insight Stream ──────────────────────────────────────────────────── */

function InsightStream({
    insights,
    onAction,
}: {
    insights: DeepInsight[];
    onAction: (insight: DeepInsight) => void;
}) {
    if (insights.length === 0) {
        return (
            <motion.div variants={goldRise} className="gpi-panel px-6 py-7 text-center">
                <span
                    className="text-xl block mb-2.5"
                    style={{ color: GOLD.primary, textShadow: '0 0 16px rgba(246,199,104,0.55)' }}
                >
                    ◈
                </span>
                <p className="text-[12px] leading-relaxed mx-auto max-w-[32ch]" style={{ color: GOLD.textMid }}>
                    The sky is still gathering light. Keep checking in — your first reading is forming.
                </p>
            </motion.div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
                {insights.map((insight) => (
                    <motion.div
                        key={insight.id}
                        layout
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12, scale: 0.96 }}
                        transition={GOLD_SOFT_SPRING}
                        className="gpi-insight gpi-retheme"
                        style={{ '--gpi-tone': TONE_HUES[insight.tone] ?? GOLD.primary } as React.CSSProperties}
                    >
                        <InsightCard
                            insight={insight}
                            onAction={() => onAction(insight)}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

/* ── Balance instrument (reciprocity) ────────────────────────────────── */

function ReciprocityGauge({ model }: { model: RelationshipModel }) {
    const score = model.reciprocityScore;
    const names = getProfileNames();
    const direction = model.asymmetryDirection;

    const percent = Math.round(score * 100);
    const label = percent >= 80 ? 'Balanced' : percent >= 60 ? 'Slightly asymmetric' : 'Unbalanced';
    const color = percent >= 80 ? '#34d399' : percent >= 60 ? '#fbbf24' : '#f87171';
    const needleAngle = (percent / 100) * 180 - 90;

    return (
        <motion.div variants={goldRise} className="gpi-panel p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(246,199,104,0.65)' }}>
                        Balance
                    </span>
                    <div className="gpi-ticks w-12" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-semibold shrink-0" style={{ color }}>{label}</span>
            </div>

            {/* Gold dial — the needle is the only animated part (transform) */}
            <div className="relative mx-auto" style={{ width: 170, height: 92 }}>
                <svg viewBox="0 0 170 92" className="absolute inset-0 w-full h-full" aria-hidden="true">
                    <defs>
                        <linearGradient id="gpi-dial-grad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor="#d99c3e" />
                            <stop offset="1" stopColor="#f6c768" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M 17 84 A 68 68 0 0 1 153 84"
                        fill="none"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="7"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 17 84 A 68 68 0 0 1 153 84"
                        fill="none"
                        stroke="url(#gpi-dial-grad)"
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={`${Math.max(2, (percent / 100) * 213.6)} 999`}
                        opacity="0.95"
                    />
                    <line x1="85" y1="12" x2="85" y2="20" stroke="rgba(246,199,104,0.4)" strokeWidth="1.5" />
                </svg>
                <motion.div
                    className="absolute left-1/2 rounded-full"
                    style={{
                        width: 2,
                        height: 56,
                        bottom: 8,
                        marginLeft: -1,
                        transformOrigin: '50% 100%',
                        background: 'linear-gradient(180deg, #fdeec9 0%, rgba(253,238,201,0.05) 100%)',
                    }}
                    initial={{ rotate: -90 }}
                    animate={{ rotate: needleAngle }}
                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.3 }}
                />
                <div
                    className="absolute left-1/2 -translate-x-1/2"
                    style={{
                        bottom: 4,
                        width: 9,
                        height: 9,
                        borderRadius: 999,
                        background: 'radial-gradient(circle at 35% 35%, #fdeec9, #d99c3e)',
                        boxShadow: '0 0 8px rgba(246,199,104,0.6)',
                    }}
                />
            </div>
            <p className="text-center mb-4">
                <span className="font-serif text-[1.45rem] leading-none" style={{ color: GOLD.textHigh }}>{percent}</span>
                <span className="text-[11px] ml-0.5" style={{ color: GOLD.textLow }}>%</span>
            </p>

            {/* Tug bar — computation unchanged from the original gauge */}
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] w-14 text-right truncate" style={{ color: GOLD.textLow }}>
                    {names.myName}
                </span>
                <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <motion.div
                        initial={{ width: '50%' }}
                        animate={{ width: `${50 + (direction === 'me' ? (1 - score) * 25 : -(1 - score) * 25)}%` }}
                        transition={{ duration: 0.8 }}
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.85), rgba(217,156,62,0.55))' }}
                    />
                </div>
                <span className="text-[9px] w-14 truncate" style={{ color: GOLD.textLow }}>
                    {names.partnerName}
                </span>
            </div>

            <p className="text-[10px] text-center" style={{ color: GOLD.textLow }}>
                How evenly you initiate, respond, and show up
            </p>
        </motion.div>
    );
}

/* ── Rhythm instrument ──────────────────────────────────────────────── */

function RhythmPanel({
    model,
    myName,
    partnerName,
}: {
    model: RelationshipModel;
    myName: string;
    partnerName: string;
}) {
    const rows = [
        { name: myName, rhythm: model.partners[0]?.emotionalRhythm },
        { name: partnerName, rhythm: model.partners[1]?.emotionalRhythm },
    ].flatMap((row) => (
        row.rhythm && row.rhythm.confidence >= 0.3 && row.rhythm.bestDays.length > 0
            ? [{ name: row.name, rhythm: row.rhythm }]
            : []
    ));

    return (
        <motion.div variants={goldRise} className="gpi-panel p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(246,199,104,0.65)' }}>
                    Rhythm
                </span>
                <div className="gpi-ticks flex-1" aria-hidden="true" />
            </div>
            {rows.length > 0 ? (
                <div className="flex flex-col gap-3">
                    {rows.map((row) => (
                        <div key={row.name}>
                            <p className="text-[10px] font-semibold truncate" style={{ color: GOLD.light }}>
                                {row.name}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug" style={{ color: GOLD.textMid }}>
                                Brightest on {DAY_NAMES[row.rhythm.bestDays[0]] ?? 'weekends'},{' '}
                                {TIME_PHRASE[row.rhythm.bestTimeOfDay] ?? 'in the evening'}
                            </p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[11px] leading-snug" style={{ color: GOLD.textLow }}>
                    Still tuning — a week of check-ins sharpens this dial.
                </p>
            )}
        </motion.div>
    );
}

/* ── Response instrument ────────────────────────────────────────────── */

function ResponsePanel({
    model,
    myName,
    partnerName,
}: {
    model: RelationshipModel;
    myName: string;
    partnerName: string;
}) {
    const rows = [
        { name: myName, pattern: model.partners[0]?.responsePattern },
        { name: partnerName, pattern: model.partners[1]?.responsePattern },
    ].flatMap((row) => (
        row.pattern && row.pattern.confidence >= 0.3 && row.pattern.avgLatencyMs > 0
            ? [{ name: row.name, pattern: row.pattern }]
            : []
    ));

    return (
        <motion.div variants={goldRise} className="gpi-panel p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(246,199,104,0.65)' }}>
                    Response
                </span>
                <div className="gpi-ticks flex-1" aria-hidden="true" />
            </div>
            {rows.length > 0 ? (
                <div className="flex flex-col gap-3">
                    {rows.map((row) => {
                        const trend = TREND_META[row.pattern.latencyTrend] ?? TREND_META.stable;
                        return (
                            <div key={row.name}>
                                <p className="text-[10px] font-semibold truncate" style={{ color: GOLD.light }}>
                                    {row.name}
                                </p>
                                <p className="mt-0.5 text-[11px] leading-snug" style={{ color: GOLD.textMid }}>
                                    Answers {humanizeLatency(row.pattern.avgLatencyMs)}
                                </p>
                                <p className="mt-0.5 text-[10px] font-medium" style={{ color: trend.color }}>
                                    {trend.glyph} {trend.word}
                                </p>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-[11px] leading-snug" style={{ color: GOLD.textLow }}>
                    No echoes timed yet — replies will register here.
                </p>
            )}
        </motion.div>
    );
}

/* ── Growth Timeline (moments that shone) ───────────────────────────── */

function GrowthTimeline({ moments }: { moments: DeepInsight[] }) {
    if (moments.length === 0) return null;

    return (
        <motion.div variants={goldRise} className="gpi-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(246,199,104,0.65)' }}>
                    Moments that shone
                </span>
                <div className="gpi-ticks flex-1" aria-hidden="true" />
            </div>
            <div className="gpi-log">
                {moments.map((c, i) => (
                    <motion.div
                        key={c.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...GOLD_SOFT_SPRING, delay: i * 0.06 }}
                        className="gpi-log__entry"
                    >
                        <span className="gpi-log__dot" aria-hidden="true">✦</span>
                        <p className="text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            {c.insightText}
                        </p>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

/* ── Visual analytics gate + fallback ───────────────────────────────── */

function VisualAnalyticsGate({ onLoad }: { onLoad: () => void }) {
    return (
        <motion.button
            variants={goldRise}
            whileTap={{ scale: 0.97 }}
            transition={GOLD_PRESS_SPRING}
            onClick={() => { feedback.tap(); onLoad(); }}
            className="gpi-panel w-full p-5 text-left"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(246,199,104,0.65)' }}>
                        Heavier instruments
                    </p>
                    <p className="mt-1.5 text-[13.5px] font-semibold" style={{ color: GOLD.textHigh }}>
                        Load visual breakdown
                    </p>
                    <p className="mt-1 text-[11px] leading-snug" style={{ color: GOLD.textLow }}>
                        The charts stay docked on this device until you ask for them.
                    </p>
                </div>
                <ChevronRight size={16} className="shrink-0" style={{ color: 'rgba(255,246,230,0.3)' }} />
            </div>
        </motion.button>
    );
}

function VisualAnalyticsFallback() {
    return (
        <div className="gpi-panel px-5 py-6 text-center">
            <p className="text-[12px]" style={{ color: GOLD.textMid }}>Polishing the lenses…</p>
        </div>
    );
}

/* ── Main View ──────────────────────────────────────────────────────── */

export const PartnerIntelligenceView: React.FC<PartnerIntelligenceViewProps> = ({ setView }) => {
    const [model, setModel] = useState<RelationshipModel | null>(null);
    const [insights, setInsights] = useState<DeepInsight[]>([]);
    const [showPulse, setShowPulse] = useState(false);
    const [showReflection, setShowReflection] = useState(false);
    const [isReady, setIsReady] = useState(false);
    // Product contract ("heavy views stay gated on mobile"): recharts stays
    // behind a tap on mobile-class/native devices; auto-loads elsewhere.
    const [visualsEnabled, setVisualsEnabled] = useState<boolean>(() => !shouldGateHeavyView());

    const names = getProfileNames();

    const refresh = useCallback(() => {
        setModel(RelationshipModelService.getModel());
        setInsights(InsightEngine.getRecentInsights(20));
    }, []);

    useEffect(() => {
        // Warm-cache seed: on a repeat visit the relationship model is already in
        // memory, so paint the constellation immediately instead of flashing the
        // full-screen "Reading your sky…" loader while the async re-init re-runs.
        // A genuine cold first run (getModel() === null) still shows the loader.
        if (RelationshipModelService.getModel()) {
            refresh();
            setIsReady(true);
        }
        const initAll = async () => {
            await Promise.all([
                RelationshipSignals.init(),
                PartnerIntelligenceService.init(),
            ]);
            await RelationshipModelService.init();
            await InsightEngine.init();
            await RelationshipModelService.compute();
            checkAndGenerateDeepInsights();
            refresh();
            setIsReady(true);
        };
        initAll();

        const handleModelUpdate = () => refresh();
        const handleInsightUpdate = () => refresh();
        const handleSignalUpdate = () => refresh();

        modelEventTarget.addEventListener('model-update', handleModelUpdate);
        insightEventTarget.addEventListener('insight-update', handleInsightUpdate);
        signalEventTarget.addEventListener('signal-update', handleSignalUpdate);

        return () => {
            modelEventTarget.removeEventListener('model-update', handleModelUpdate);
            insightEventTarget.removeEventListener('insight-update', handleInsightUpdate);
            signalEventTarget.removeEventListener('signal-update', handleSignalUpdate);
        };
    }, [refresh]);

    const handleInsightAction = useCallback(async (insight: DeepInsight) => {
        await InsightEngine.markActedOn(insight.id);
        if (insight.suggestedAction?.targetView) {
            setView(insight.suggestedAction.targetView as ViewState);
        }
    }, [setView]);

    const handlePulseComplete = useCallback(() => {
        setShowPulse(false);
        refresh();
    }, [refresh]);

    const handleReflectionComplete = useCallback(() => {
        setShowReflection(false);
        refresh();
    }, [refresh]);

    // Mark insights as seen when scrolled into view
    useEffect(() => {
        if (!isReady) return;
        const unseen = insights.filter(i => !i.seenAt);
        if (unseen.length > 0) {
            const timer = setTimeout(() => {
                unseen.forEach(i => InsightEngine.markSeen(i.id));
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [insights, isReady]);

    // Hardware back closes an open sheet instead of leaving the view.
    useEffect(() => {
        if (!showPulse && !showReflection) return;
        const handleBack = (e: Event) => {
            e.preventDefault();
            setShowPulse(false);
            setShowReflection(false);
        };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [showPulse, showReflection]);

    const reflectionDue = isReady
        && RelationshipSignals.isReflectionTime()
        && !RelationshipSignals.hasReflectedThisWeek();

    const shineMoments = isReady
        ? InsightEngine.getAllInsights()
            .filter(i => i.category === 'celebration' && i.seenAt)
            .slice(0, 5)
        : [];

    return (
        <GoldShell eyebrow="Love Tracker" accent={ACCENT}>
            {!isReady ? (
                <div className="flex flex-col items-center justify-center pt-28 pb-16 text-center">
                    <span className="gpi-loading-star" aria-hidden="true">✦</span>
                    <p className="mt-4 font-serif text-[1.15rem]" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                        Reading your sky…
                    </p>
                    <p className="mt-1.5 text-[11.5px]" style={{ color: GOLD.textLow }}>
                        Gathering the signals between you
                    </p>
                </div>
            ) : (
                <motion.div initial="hidden" animate="visible" variants={goldStagger} className="pt-4">
                    {/* ── Constellation hero ─────────────────────────── */}
                    <motion.div variants={goldRise}>
                        <ConstellationHero model={model} myName={names.myName} partnerName={names.partnerName} />
                    </motion.div>

                    {/* ── Tonight's log ──────────────────────────────── */}
                    <div className="mt-3 flex flex-col gap-3">
                        <PulseCheckPrompt onOpen={() => setShowPulse(true)} />
                        {model && model.dataConfidence < 0.15 && (
                            <SystemMessageCard
                                message={{
                                    emoji: '✦',
                                    text: 'Welcome to your observatory. It starts quiet — a few days of check-ins will surface your first real reading. Every signal compounds.',
                                }}
                            />
                        )}
                    </div>

                    {/* ── Tonight's reading ──────────────────────────── */}
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="Tonight's reading" />
                    </motion.div>
                    <InsightStream insights={insights} onAction={handleInsightAction} />

                    {/* ── Patterns ───────────────────────────────────── */}
                    {model && (
                        <>
                            <motion.div variants={goldRise}>
                                <GoldSectionHeader label="Patterns" />
                            </motion.div>
                            <div className="flex flex-col gap-3">
                                {model.dataConfidence >= 0.3 && (
                                    <ReciprocityGauge model={model} />
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <RhythmPanel model={model} myName={names.myName} partnerName={names.partnerName} />
                                    <ResponsePanel model={model} myName={names.myName} partnerName={names.partnerName} />
                                </div>
                                {visualsEnabled ? (
                                    <Suspense fallback={<VisualAnalyticsFallback />}>
                                        <LazyPartnerIntelligenceVisuals
                                            model={model}
                                            myName={names.myName}
                                            partnerName={names.partnerName}
                                        />
                                    </Suspense>
                                ) : (
                                    <VisualAnalyticsGate onLoad={() => setVisualsEnabled(true)} />
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Rituals & signals ──────────────────────────── */}
                    {(reflectionDue || shineMoments.length > 0) && (
                        <motion.div variants={goldRise}>
                            <GoldSectionHeader label="Rituals & signals" />
                        </motion.div>
                    )}
                    <div className="flex flex-col gap-3">
                        {reflectionDue && (
                            <ReflectionPrompt onOpen={() => setShowReflection(true)} />
                        )}
                        <GrowthTimeline moments={shineMoments} />
                    </div>

                    {/* ── Footer ─────────────────────────────────────── */}
                    <motion.div variants={goldRise} className="mt-10 flex items-center justify-center gap-2">
                        <Sparkles size={11} style={{ color: 'rgba(246,199,104,0.6)' }} />
                        <span className="text-[11px]" style={{ color: 'rgba(255,246,230,0.3)' }}>
                            The sky rewrites itself nightly. Keep looking up together.
                        </span>
                    </motion.div>
                </motion.div>
            )}

            {/* Bottom sheets — fixed overlays, rethemed for the dark stage */}
            <div className="gpi-retheme">
                <AnimatePresence>
                    {showPulse && (
                        <PulseCheckSheet
                            onComplete={handlePulseComplete}
                            onClose={() => setShowPulse(false)}
                        />
                    )}
                </AnimatePresence>
                <AnimatePresence>
                    {showReflection && (
                        <WeeklyReflectionSheet
                            onComplete={handleReflectionComplete}
                            onClose={() => setShowReflection(false)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </GoldShell>
    );
};

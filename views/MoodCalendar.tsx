/**
 * Aura Board — couple's living mood canvas.
 *
 * A redesign of the previous calendar-grid mood tracker into a feature that
 * earns its place in the app:
 *
 *   1. AURA ORB        — a large, breathing gradient orb that visually blends
 *                        both partners' current moods into one shared aura.
 *                        Tap → poetic reading + tonight's prompt.
 *   2. PULSE STRIP     — last 7 days as paired ribbons (you on top, partner on
 *                        bottom). Reads as a heartbeat trace coloured by mood.
 *   3. HARMONY CARD    — sync score for the week + one-line interpretation.
 *   4. CALENDAR        — month grid with dual-tone gradient pills per day.
 *                        Tap a day → reveals both moods + notes.
 *   5. CHECK-IN SHEET  — circular mood wheel grouped by emotional family,
 *                        intensity slider (1–5), free-form note.
 *
 * Stays inside the existing MoodEntry data shape (only adds optional
 * `intensity` for richer visuals). Every entry is keyed by display name so
 * existing data renders unchanged.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ViewState, MoodEntry, CoupleProfile } from '../types';
import { StorageService } from '../services/storage';
import { generateId } from '../utils/ids';
import { ChevronLeft, ChevronRight, Plus, MessageCircle, TrendingUp, Sparkles, X, Heart } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { feedback } from '../utils/feedback';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    eachDayOfInterval,
    isSameDay,
    isToday,
    parseISO,
    endOfMonth,
    subDays,
    startOfDay,
} from 'date-fns';

interface MoodCalendarProps {
    setView: (view: ViewState) => void;
}

// ── Mood palette ──────────────────────────────────────────────────────────
interface MoodTheme {
    color: string;
    gradient: string;
    /** Two stops we blend with another mood to make the couple aura. */
    auraStops: [string, string];
    emoji: string;
    /** UI label override when the key isn't already user-friendly. */
    label?: string;
    /** Family bucket: drives the wheel's grouping. */
    family: 'warm' | 'bright' | 'calm' | 'tender' | 'low';
}

const moodThemes: Record<string, MoodTheme> = {
    loved:      { color: '#f472b6', gradient: 'from-pink-500 to-rose-400',     auraStops: ['#fb7185', '#f472b6'], emoji: '🥰', family: 'tender' },
    romantic:   { color: '#fb7185', gradient: 'from-rose-500 to-pink-400',     auraStops: ['#fb7185', '#f9a8d4'], emoji: '💕', family: 'tender' },
    tender:     { color: '#f9a8d4', gradient: 'from-pink-300 to-rose-300',     auraStops: ['#f9a8d4', '#fbcfe8'], emoji: '💗', family: 'tender' },
    grateful:   { color: '#f59e0b', gradient: 'from-amber-500 to-orange-300',  auraStops: ['#fbbf24', '#f59e0b'], emoji: '🙏', family: 'warm' },
    joyful:     { color: '#fbbf24', gradient: 'from-yellow-400 to-amber-300',  auraStops: ['#fde68a', '#fbbf24'], emoji: '✨', family: 'bright' },
    happy:      { color: '#fbbf24', gradient: 'from-amber-400 to-yellow-300',  auraStops: ['#fcd34d', '#fbbf24'], emoji: '😊', family: 'bright' },
    excited:    { color: '#fb923c', gradient: 'from-orange-500 to-amber-400',  auraStops: ['#fb923c', '#f97316'], emoji: '🤩', family: 'bright' },
    playful:    { color: '#38bdf8', gradient: 'from-sky-400 to-cyan-300',      auraStops: ['#7dd3fc', '#38bdf8'], emoji: '😝', family: 'bright' },
    peaceful:   { color: '#7dd3fc', gradient: 'from-cyan-300 to-sky-300',      auraStops: ['#bae6fd', '#7dd3fc'], emoji: '☮️', family: 'calm' },
    calm:       { color: '#7dd3fc', gradient: 'from-sky-400 to-cyan-300',      auraStops: ['#7dd3fc', '#a5f3fc'], emoji: '😌', family: 'calm' },
    content:    { color: '#86efac', gradient: 'from-emerald-300 to-teal-300',  auraStops: ['#86efac', '#5eead4'], emoji: '😊', family: 'calm' },
    thoughtful: { color: '#a78bfa', gradient: 'from-violet-400 to-indigo-300', auraStops: ['#c4b5fd', '#a78bfa'], emoji: '🤔', family: 'calm' },
    reflective: { color: '#c4b5fd', gradient: 'from-purple-300 to-indigo-300', auraStops: ['#c4b5fd', '#ddd6fe'], emoji: '💭', family: 'calm' },
    quiet:      { color: '#a5b4fc', gradient: 'from-indigo-300 to-slate-300',  auraStops: ['#a5b4fc', '#cbd5e1'], emoji: '🤫', family: 'low' },
    tired:      { color: '#94a3b8', gradient: 'from-slate-400 to-blue-300',    auraStops: ['#94a3b8', '#a5b4fc'], emoji: '😴', family: 'low' },
    meh:        { color: '#cbd5e1', gradient: 'from-slate-300 to-slate-200',   auraStops: ['#cbd5e1', '#e2e8f0'], emoji: '😐', family: 'low' },
    stressed:   { color: '#f97316', gradient: 'from-orange-500 to-red-400',    auraStops: ['#f97316', '#ef4444'], emoji: '😤', family: 'warm' },
    sad:        { color: '#818cf8', gradient: 'from-indigo-500 to-blue-400',   auraStops: ['#818cf8', '#93c5fd'], emoji: '🥺', family: 'low' },
    anxious:    { color: '#a78bfa', gradient: 'from-violet-500 to-purple-400', auraStops: ['#a78bfa', '#c4b5fd'], emoji: '😰', family: 'low' },
    frustrated: { color: '#fb7185', gradient: 'from-rose-500 to-orange-400',   auraStops: ['#fb7185', '#fb923c'], emoji: '😣', family: 'warm' },
    lonely:     { color: '#93c5fd', gradient: 'from-blue-400 to-indigo-400',   auraStops: ['#93c5fd', '#a5b4fc'], emoji: '💔', family: 'low' },
    angry:      { color: '#ef4444', gradient: 'from-red-600 to-orange-500',    auraStops: ['#ef4444', '#f97316'], emoji: '😠', family: 'warm' },
    relaxed:    { color: '#7dd3fc', gradient: 'from-sky-400 to-cyan-300',      auraStops: ['#7dd3fc', '#a5f3fc'], emoji: '😌', label: 'calm', family: 'calm' },
    default:    { color: '#d1d5db', gradient: 'from-slate-300 to-slate-200',   auraStops: ['#e2e8f0', '#cbd5e1'], emoji: '✨', family: 'low' },
};

// Mood wheel layout: ordered by emotional family.
const wheelOrder: string[] = [
    'joyful', 'happy', 'excited', 'playful',           // bright
    'loved', 'romantic', 'tender', 'grateful',         // tender + warm crossover
    'calm', 'peaceful', 'content', 'thoughtful',       // calm
    'quiet', 'tired', 'meh',                           // low
    'sad', 'lonely', 'anxious',                        // low/anxious
    'stressed', 'frustrated', 'angry',                 // warm
];

const normalizeMoodKey = (value?: string | null): string => {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!key) return 'default';
    if (key === 'great') return 'joyful';
    if (key === 'good') return 'happy';
    if (key === 'okay') return 'content';
    if (key === 'bad') return 'sad';
    return moodThemes[key] ? key : 'default';
};

const getMoodTheme = (value?: string | null): MoodTheme => moodThemes[normalizeMoodKey(value)] || moodThemes.default;

const parseMoodDate = (value: unknown): Date | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = parseISO(value);
    return Number.isFinite(date.getTime()) ? date : null;
};

// ── Aura blending helpers ─────────────────────────────────────────────────
/**
 * Builds a 4-stop conic-style gradient that blends both partners' moods into
 * one orb. Falls back gracefully when one or both moods are missing.
 */
const buildAuraGradient = (myMood?: string | null, partnerMood?: string | null): string => {
    const me = getMoodTheme(myMood);
    const them = getMoodTheme(partnerMood);
    const [a1, a2] = me.auraStops;
    const [b1, b2] = them.auraStops;
    return `conic-gradient(from 220deg at 55% 45%, ${a1} 0deg, ${a2} 90deg, ${b1} 180deg, ${b2} 270deg, ${a1} 360deg)`;
};

/**
 * Returns 0–100. Higher = same mood family / same emotional valence.
 * The interpretation is intentionally generous — emotional partners don't
 * have to feel identical, they have to be in the same room.
 */
const computeHarmony = (entries: MoodEntry[], me: string, them: string, days = 7): number => {
    if (!me || !them) return 0;
    const cutoff = subDays(new Date(), days).getTime();
    const buckets = new Map<string, { mine?: MoodTheme; theirs?: MoodTheme }>();
    for (const e of entries) {
        const ts = parseMoodDate(e.timestamp)?.getTime();
        if (!ts || ts < cutoff) continue;
        const key = format(new Date(ts), 'yyyy-MM-dd');
        const slot = buckets.get(key) ?? {};
        const theme = getMoodTheme(e.mood);
        if (e.userId === me)   slot.mine = theme;
        if (e.userId === them) slot.theirs = theme;
        buckets.set(key, slot);
    }
    let total = 0;
    let count = 0;
    for (const { mine, theirs } of buckets.values()) {
        if (!mine || !theirs) continue;
        count++;
        if (mine.family === theirs.family) total += 100;
        else if ((mine.family === 'tender' && theirs.family === 'calm') || (mine.family === 'calm' && theirs.family === 'tender')) total += 80;
        else if ((mine.family === 'warm' && theirs.family === 'bright') || (mine.family === 'bright' && theirs.family === 'warm')) total += 70;
        else if (mine.family === 'low' && theirs.family !== 'low') total += 40;
        else if (mine.family !== theirs.family) total += 30;
    }
    return count === 0 ? 0 : Math.round(total / count);
};

const harmonyReading = (score: number, hasBoth: boolean): string => {
    if (!hasBoth) return 'Both of you tap in to bloom your aura';
    if (score >= 90) return 'Your auras are mirrored this week';
    if (score >= 75) return 'You\'re moving in the same key';
    if (score >= 55) return 'Different shades of the same light';
    if (score >= 35) return 'You meet each other from different rooms';
    return 'Your week is asking for a bridge';
};

const poeticReading = (mine?: string | null, theirs?: string | null): string => {
    if (!mine && !theirs) return 'Tap below to share your pulse';
    if (mine && !theirs) return `You\'re feeling ${mine}. Send a whisper to bring them in`;
    if (!mine && theirs) return `They\'re feeling ${theirs}. How about you?`;
    const a = getMoodTheme(mine).family;
    const b = getMoodTheme(theirs).family;
    if (a === b) return `You\'re both in the ${a} family today`;
    if (a === 'tender' || b === 'tender') return 'Soft and steady — tender harmony';
    if (a === 'low' && b === 'bright') return 'One of you needs a little of the other\'s light';
    if (a === 'bright' && b === 'low') return 'Be the warmth they\'re looking for';
    return `${mine} meets ${theirs} — a quiet duet`;
};

const checkInPrompts = [
    'What softened your day today?',
    'One word for the last hour?',
    'Where did you feel them with you?',
    'What do you want to bring home?',
    'A gentle thing you noticed?',
];
const dayPrompt = (date: Date) => checkInPrompts[Math.abs(startOfDay(date).getDate()) % checkInPrompts.length];

// ── Aura Orb hero ─────────────────────────────────────────────────────────
const AuraOrb: React.FC<{
    myMood?: string | null;
    partnerMood?: string | null;
    myName: string;
    partnerName: string;
    onTap: () => void;
}> = ({ myMood, partnerMood, myName, partnerName, onTap }) => {
    const gradient = useMemo(() => buildAuraGradient(myMood, partnerMood), [myMood, partnerMood]);
    const myTheme = getMoodTheme(myMood);
    const theirTheme = getMoodTheme(partnerMood);
    const both = !!(myMood && partnerMood);
    const mineColor = myTheme.color;
    const theirColor = theirTheme.color;

    return (
        <button
            type="button"
            onClick={onTap}
            className="block w-full relative overflow-hidden rounded-[2.5rem] spring-press"
            style={{
                background: `radial-gradient(140% 80% at 50% 0%, ${mineColor}1A 0%, transparent 50%), radial-gradient(140% 80% at 50% 100%, ${theirColor}1A 0%, transparent 50%), linear-gradient(180deg, rgba(255,255,255,0.72), rgba(252,247,250,0.48))`,
                border: '1px solid rgba(255,255,255,0.72)',
                boxShadow: `0 26px 52px ${mineColor}22, 0 12px 24px rgba(90,82,102,0.10), inset 0 1px 0 rgba(255,255,255,0.98)`,
            }}
        >
            {/* Aurora wash — soft mood-tinted bands behind the orb */}
            <div
                className="absolute inset-0 pointer-events-none"
                aria-hidden
                style={{
                    background: `radial-gradient(60% 80% at 20% 30%, ${mineColor}1F 0%, transparent 60%), radial-gradient(60% 80% at 80% 70%, ${theirColor}1F 0%, transparent 60%)`,
                    filter: 'blur(32px)',
                }}
            />

            <div className="px-5 pt-7 pb-7 flex flex-col items-center relative z-10">
                {/* Orb container */}
                <div className="relative w-[220px] h-[220px] mb-5">
                    {/* Layer 0 — far halo, very blurred + slow drift */}
                    <motion.div
                        className="absolute inset-[-44px] rounded-full"
                        style={{ background: gradient, filter: 'blur(48px)', opacity: 0.55 }}
                        animate={{ rotate: -360, scale: [1, 1.08, 1] }}
                        transition={{
                            rotate: { duration: 38, repeat: Infinity, ease: 'linear' },
                            scale:  { duration: 8, repeat: Infinity, ease: 'easeInOut' },
                        }}
                    />

                    {/* Layer 1 — middle halo, opposite rotation */}
                    <motion.div
                        className="absolute inset-[-18px] rounded-full"
                        style={{ background: gradient, filter: 'blur(22px)', opacity: 0.7 }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                    />

                    {/* Layer 2 — main aura body */}
                    <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ background: gradient, filter: 'blur(2px)' }}
                        animate={{ rotate: -360, scale: [1, 1.035, 1] }}
                        transition={{
                            rotate: { duration: 18, repeat: Infinity, ease: 'linear' },
                            scale:  { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
                        }}
                    />

                    {/* Layer 3 — inner liquid swirl (counter-rotating, smaller) */}
                    <motion.div
                        className="absolute inset-[18px] rounded-full"
                        style={{
                            background: `conic-gradient(from 40deg, ${mineColor}AA, ${theirColor}AA, ${mineColor}AA)`,
                            filter: 'blur(8px)',
                            mixBlendMode: 'soft-light',
                            opacity: 0.85,
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                    />

                    {/* Layer 4 — glass top highlight (drifting slowly) */}
                    <motion.div
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{
                            background: 'radial-gradient(ellipse 55% 38% at 35% 22%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.18) 40%, transparent 60%)',
                            mixBlendMode: 'screen',
                        }}
                        animate={{ x: [0, 6, 0], y: [0, -3, 0] }}
                        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* Layer 5 — outermost rim glow */}
                    <div
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{
                            boxShadow: `inset 0 0 30px rgba(255,255,255,0.45), inset 0 0 2px rgba(255,255,255,0.95)`,
                        }}
                    />

                    {/* Pulse ring — emanating outward when both have logged */}
                    {both && (
                        <motion.div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            style={{ border: `1.5px solid ${mineColor}`, opacity: 0 }}
                            animate={{ scale: [1, 1.45], opacity: [0.55, 0] }}
                            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut' }}
                        />
                    )}
                    {both && (
                        <motion.div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            style={{ border: `1.5px solid ${theirColor}`, opacity: 0 }}
                            animate={{ scale: [1, 1.45], opacity: [0.45, 0] }}
                            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut', delay: 1.6 }}
                        />
                    )}

                    {/* Avatars at the equator */}
                    <div className="absolute inset-0 flex items-center justify-between px-2">
                        <motion.span
                            className="w-14 h-14 rounded-full flex items-center justify-center text-xl relative"
                            style={{
                                background: 'rgba(255,255,255,0.92)',
                                border: '2px solid rgba(255,255,255,0.95)',
                                boxShadow: `0 10px 22px ${mineColor}55, inset 0 1px 0 rgba(255,255,255,1)`,
                                backdropFilter: 'blur(10px)',
                            }}
                            animate={myMood ? { scale: [1, 1.045, 1] } : {}}
                            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            {myMood ? myTheme.emoji : '?'}
                        </motion.span>
                        <motion.span
                            className="w-14 h-14 rounded-full flex items-center justify-center text-xl relative"
                            style={{
                                background: 'rgba(255,255,255,0.92)',
                                border: '2px solid rgba(255,255,255,0.95)',
                                boxShadow: `0 10px 22px ${theirColor}55, inset 0 1px 0 rgba(255,255,255,1)`,
                                backdropFilter: 'blur(10px)',
                            }}
                            animate={partnerMood ? { scale: [1, 1.045, 1] } : {}}
                            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
                        >
                            {partnerMood ? theirTheme.emoji : '?'}
                        </motion.span>
                    </div>
                </div>

                {/* Names + state line */}
                <div className="text-center max-w-[300px]">
                    <p className="text-[10px] uppercase tracking-[0.24em] font-black mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                        {myName} <span className="opacity-50 mx-1">·</span> {partnerName}
                    </p>
                    <p className="font-serif text-[1.2rem] leading-[1.3] px-2" style={{ color: 'var(--color-text-primary)' }}>
                        {poeticReading(myMood ? (myTheme.label || normalizeMoodKey(myMood)) : null, partnerMood ? (theirTheme.label || normalizeMoodKey(partnerMood)) : null)}
                    </p>
                    <p className="text-[11px] mt-2 italic" style={{ color: 'var(--color-text-secondary)' }}>
                        {both ? 'Tap to deepen the reading' : 'Tap below to share your pulse'}
                    </p>
                </div>
            </div>
        </button>
    );
};

// ── Pulse Flow — last 7 days as flowing SVG trace ─────────────────────────
/**
 * Maps mood → a vertical position 0–1 on the trace based on emotional valence.
 * Higher = brighter / more elevated, lower = quieter / more inward.
 */
const moodValence = (theme: MoodTheme | null): number | null => {
    if (!theme) return null;
    switch (theme.family) {
        case 'bright': return 0.85;
        case 'tender': return 0.72;
        case 'warm':   return 0.55;
        case 'calm':   return 0.45;
        case 'low':    return 0.22;
    }
};

interface PulsePoint {
    x: number;
    y: number | null;
    color: string;
    label: string;
    today: boolean;
    dayLabel: string;
}

/**
 * Builds an SVG smooth path through a series of points using a Catmull-Rom
 * style cubic spline. Skips null gaps gracefully (paints two separate paths
 * either side). Returns a single `d` string.
 */
const buildSmoothPath = (pts: PulsePoint[], width: number, height: number): string => {
    const valid = pts.filter((p) => p.y !== null) as Array<PulsePoint & { y: number }>;
    if (valid.length === 0) return '';
    const px = (p: PulsePoint & { y: number }) => p.x * width;
    const py = (p: PulsePoint & { y: number }) => (1 - p.y) * height;
    if (valid.length === 1) return `M ${px(valid[0])} ${py(valid[0])} L ${px(valid[0]) + 1} ${py(valid[0])}`;

    let d = `M ${px(valid[0])} ${py(valid[0])}`;
    for (let i = 0; i < valid.length - 1; i++) {
        const p0 = valid[Math.max(0, i - 1)];
        const p1 = valid[i];
        const p2 = valid[i + 1];
        const p3 = valid[Math.min(valid.length - 1, i + 2)];
        const c1x = px(p1) + (px(p2) - px(p0)) / 6;
        const c1y = py(p1) + (py(p2) - py(p0)) / 6;
        const c2x = px(p2) - (px(p3) - px(p1)) / 6;
        const c2y = py(p2) - (py(p3) - py(p1)) / 6;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${px(p2)} ${py(p2)}`;
    }
    return d;
};

const PulseStrip: React.FC<{
    entries: MoodEntry[];
    me: string;
    them: string;
}> = ({ entries, me, them }) => {
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i)), []);

    const { minePoints, theirsPoints, mineColor, theirColor } = useMemo(() => {
        const mine: PulsePoint[] = [];
        const theirs: PulsePoint[] = [];
        let mc = '#f472b6';
        let tc = '#a78bfa';
        days.forEach((day, idx) => {
            const x = idx / (days.length - 1);
            const dayEntries = entries.filter((e) => {
                const d = parseMoodDate(e.timestamp);
                return d ? isSameDay(d, day) : false;
            });
            const mineEntry = dayEntries.find((e) => e.userId === me);
            const theirsEntry = dayEntries.find((e) => e.userId === them);
            const mineTheme = mineEntry ? getMoodTheme(mineEntry.mood) : null;
            const theirsTheme = theirsEntry ? getMoodTheme(theirsEntry.mood) : null;
            if (mineTheme) mc = mineTheme.color;
            if (theirsTheme) tc = theirsTheme.color;
            const today = isToday(day);
            const dayLabel = format(day, 'EEEEE');
            mine.push({ x, y: moodValence(mineTheme), color: mineTheme?.color ?? '#cbd5e1', label: mineEntry?.mood ?? '', today, dayLabel });
            theirs.push({ x, y: moodValence(theirsTheme), color: theirsTheme?.color ?? '#cbd5e1', label: theirsEntry?.mood ?? '', today, dayLabel });
        });
        return { minePoints: mine, theirsPoints: theirs, mineColor: mc, theirColor: tc };
    }, [entries, me, them, days]);

    const W = 320;
    const H = 96;
    const minePath = buildSmoothPath(minePoints, W, H);
    const theirsPath = buildSmoothPath(theirsPoints, W, H);

    return (
        <div className="rounded-[1.75rem] p-4 relative overflow-hidden" style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(252,247,250,0.45))',
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 12px 28px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
        }}>
            {/* Soft tinted aurora tied to current mood pair */}
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none opacity-50"
                style={{ background: `radial-gradient(60% 80% at 20% 100%, ${mineColor}1F 0%, transparent 60%), radial-gradient(60% 80% at 80% 0%, ${theirColor}1F 0%, transparent 60%)` }}
            />

            <div className="flex items-center justify-between mb-2 px-1 relative z-10">
                <span className="text-[10px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>Pulse · 7 Days</span>
                <span className="flex items-center gap-2 text-[10px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: mineColor, boxShadow: `0 0 6px ${mineColor}` }} /> You</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: theirColor, boxShadow: `0 0 6px ${theirColor}` }} /> Them</span>
                </span>
            </div>

            {/* SVG flow */}
            <div className="relative">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[96px] block" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="mineGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={mineColor} stopOpacity="0.7" />
                            <stop offset="100%" stopColor={mineColor} />
                        </linearGradient>
                        <linearGradient id="theirsGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={theirColor} stopOpacity="0.7" />
                            <stop offset="100%" stopColor={theirColor} />
                        </linearGradient>
                        <linearGradient id="mineFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={mineColor} stopOpacity="0.32" />
                            <stop offset="100%" stopColor={mineColor} stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="theirsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theirColor} stopOpacity="0.32" />
                            <stop offset="100%" stopColor={theirColor} stopOpacity="0" />
                        </linearGradient>
                        <filter id="pulseGlow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2.5" />
                        </filter>
                    </defs>

                    {/* Faint horizontal guide lines */}
                    {[0.25, 0.5, 0.75].map((g) => (
                        <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="rgba(0,0,0,0.05)" strokeDasharray="2 4" />
                    ))}

                    {/* Mine — fill, glow trail, main stroke */}
                    {minePath && (
                        <>
                            <path d={`${minePath} L ${W} ${H} L 0 ${H} Z`} fill="url(#mineFill)" />
                            <path d={minePath} fill="none" stroke={mineColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.32" filter="url(#pulseGlow)" />
                            <path d={minePath} fill="none" stroke="url(#mineGrad)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </>
                    )}

                    {/* Theirs — same treatment */}
                    {theirsPath && (
                        <>
                            <path d={`${theirsPath} L ${W} ${H} L 0 ${H} Z`} fill="url(#theirsFill)" />
                            <path d={theirsPath} fill="none" stroke={theirColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.32" filter="url(#pulseGlow)" />
                            <path d={theirsPath} fill="none" stroke="url(#theirsGrad)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </>
                    )}

                    {/* Day node dots */}
                    {minePoints.map((p, i) => (
                        p.y !== null && (
                            <g key={`m-${i}`}>
                                <circle cx={p.x * W} cy={(1 - (p.y as number)) * H} r="5.5" fill={p.color} opacity="0.32" />
                                <circle cx={p.x * W} cy={(1 - (p.y as number)) * H} r="3" fill={p.color} stroke="#fff" strokeWidth="1.5" />
                            </g>
                        )
                    ))}
                    {theirsPoints.map((p, i) => (
                        p.y !== null && (
                            <g key={`t-${i}`}>
                                <circle cx={p.x * W} cy={(1 - (p.y as number)) * H} r="5.5" fill={p.color} opacity="0.32" />
                                <circle cx={p.x * W} cy={(1 - (p.y as number)) * H} r="3" fill={p.color} stroke="#fff" strokeWidth="1.5" />
                            </g>
                        )
                    ))}
                </svg>

                {/* Day labels */}
                <div className="flex items-center justify-between mt-2 px-0">
                    {minePoints.map((p, i) => (
                        <span
                            key={i}
                            className={`text-[9px] flex-1 text-center ${p.today ? 'font-black' : 'font-bold'}`}
                            style={{ color: p.today ? 'var(--color-nav-active)' : 'var(--color-text-secondary)' }}
                        >
                            {p.dayLabel}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Count-up hook (cinematic score reveal) ────────────────────────────────
const useCountUp = (target: number, durationMs = 1100): number => {
    const [val, setVal] = useState(0);
    useEffect(() => {
        let raf = 0;
        const start = performance.now();
        const initial = 0;
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - t, 3);
            setVal(Math.round(initial + (target - initial) * eased));
            if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target, durationMs]);
    return val;
};

// ── Harmony Card ──────────────────────────────────────────────────────────
const HarmonyCard: React.FC<{
    score: number;
    reading: string;
    bothActive: boolean;
    mineColor: string;
    theirColor: string;
    onRewind: () => void;
}> = ({ score, reading, bothActive, mineColor, theirColor, onRewind }) => {
    const animated = useCountUp(bothActive ? score : 0);
    // Map score → label tag
    const scoreLabel = !bothActive ? 'Awaiting'
        : score >= 90 ? 'Mirrored'
        : score >= 75 ? 'In sync'
        : score >= 55 ? 'Adjacent'
        : score >= 35 ? 'Distant'
        : 'Bridge';

    return (
        <div
            className="rounded-[1.75rem] p-5 flex items-center gap-4 relative overflow-hidden"
            style={{
                background: `radial-gradient(120% 80% at 0% 0%, ${mineColor}10 0%, transparent 60%), radial-gradient(120% 80% at 100% 100%, ${theirColor}10 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.65), rgba(252,247,250,0.45))`,
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 12px 28px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
        >
            {/* Animated dial — orbital dots + count-up */}
            <div className="relative w-[80px] h-[80px] flex-shrink-0">
                <svg viewBox="0 0 80 80" className="w-full h-full">
                    <defs>
                        <linearGradient id="harmonyGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={mineColor} />
                            <stop offset="100%" stopColor={theirColor} />
                        </linearGradient>
                        <filter id="dialGlow" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur stdDeviation="3" />
                        </filter>
                    </defs>

                    {/* Track */}
                    <circle cx="40" cy="40" r="33" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />

                    {/* Glow ring underneath the arc */}
                    <circle
                        cx="40" cy="40" r="33"
                        fill="none"
                        stroke="url(#harmonyGrad)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${(animated / 100) * 207.3} 207.3`}
                        transform="rotate(-90 40 40)"
                        opacity="0.35"
                        filter="url(#dialGlow)"
                    />
                    {/* Main arc */}
                    <circle
                        cx="40" cy="40" r="33"
                        fill="none"
                        stroke="url(#harmonyGrad)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${(animated / 100) * 207.3} 207.3`}
                        transform="rotate(-90 40 40)"
                    />
                </svg>

                {/* Two counter-rotating orbital dots — couple metaphor */}
                {bothActive && (
                    <>
                        <motion.div
                            className="absolute top-1/2 left-1/2 w-2.5 h-2.5 rounded-full"
                            style={{
                                background: mineColor,
                                boxShadow: `0 0 8px ${mineColor}`,
                                marginTop: -5,
                                marginLeft: -5,
                                originX: 0.5,
                                originY: 0.5,
                            }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
                        >
                            <div style={{ transform: 'translateY(-30px)' }} className="w-2.5 h-2.5 rounded-full" />
                        </motion.div>
                    </>
                )}

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-serif text-2xl font-black leading-none" style={{ color: 'var(--color-text-primary)' }}>
                        {bothActive ? animated : '—'}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                        of 100
                    </span>
                </div>
            </div>

            <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={11} style={{ color: 'var(--color-text-secondary)' }} />
                    <span className="text-[9px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>
                        Harmony · 7d
                    </span>
                    <span className="ml-auto text-[9px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full"
                        style={{
                            background: `linear-gradient(135deg, ${mineColor}, ${theirColor})`,
                            color: '#fff',
                            letterSpacing: '0.16em',
                        }}>
                        {scoreLabel}
                    </span>
                </div>
                <p className="font-serif text-[0.95rem] leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                    {reading}
                </p>
            </div>

            <button
                onClick={onRewind}
                aria-label="Open Aura Rewind"
                className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center spring-press relative z-10"
                style={{
                    background: `linear-gradient(135deg, ${mineColor}1A, ${theirColor}1A)`,
                    color: 'var(--color-nav-active)',
                    border: `1px solid ${mineColor}33`,
                }}
            >
                <TrendingUp size={18} />
            </button>
        </div>
    );
};

// ── Insight engine — the "real meaning" layer ─────────────────────────────
/**
 * Reads the last 30 days of entries and surfaces 1–3 patterns the couple can
 * actually act on. Each insight is short, grounded in concrete data (count of
 * days, day-of-week bias, alignment streak), and never speculative. Returns
 * an empty list when there's not enough signal — silence beats fortune-cookie.
 */
interface AuraInsight {
    id: string;
    icon: 'sync' | 'trend' | 'streak' | 'support' | 'pattern';
    headline: string;
    detail: string;
    tone: 'warm' | 'caring' | 'celebratory' | 'gentle';
}

const dayOfWeekLabel = (n: number): string => ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][n] || '';

const generateInsights = (
    entries: MoodEntry[],
    me: string,
    them: string,
): AuraInsight[] => {
    if (!me || !them || entries.length < 3) return [];
    const out: AuraInsight[] = [];
    const cutoff30 = subDays(new Date(), 30).getTime();
    const recent = entries.filter((e) => {
        const t = parseMoodDate(e.timestamp)?.getTime();
        return t && t >= cutoff30;
    });

    // ── 1. Bonded streak — consecutive days BOTH logged ──
    const dayKeys = new Set(recent.map((e) => format(parseMoodDate(e.timestamp)!, 'yyyy-MM-dd')));
    const sortedDays = Array.from(dayKeys).sort().reverse();
    let streak = 0;
    let cursor = startOfDay(new Date()).getTime();
    for (const dk of sortedDays) {
        const dDate = parseISO(dk).getTime();
        if (dDate > cursor) continue;
        const dayMine = recent.some((e) => e.userId === me && format(parseMoodDate(e.timestamp)!, 'yyyy-MM-dd') === dk);
        const dayTheirs = recent.some((e) => e.userId === them && format(parseMoodDate(e.timestamp)!, 'yyyy-MM-dd') === dk);
        if (dayMine && dayTheirs && Math.abs(dDate - cursor) < 86400_000 * 1.5) {
            streak++;
            cursor = dDate - 86400_000 * 0.5;
        } else if (dDate < cursor - 86400_000 * 1.5) {
            break;
        }
    }
    if (streak >= 3) {
        out.push({
            id: 'streak',
            icon: 'streak',
            headline: `${streak}-day bonded streak`,
            detail: `You\'ve both shown up for ${streak} days in a row. The aura's getting brighter.`,
            tone: 'celebratory',
        });
    }

    // ── 2. Dominant family this week ──
    const cutoff7 = subDays(new Date(), 7).getTime();
    const week = recent.filter((e) => parseMoodDate(e.timestamp)!.getTime() >= cutoff7);
    const familyTally = new Map<string, number>();
    for (const e of week) {
        const f = getMoodTheme(e.mood).family;
        familyTally.set(f, (familyTally.get(f) ?? 0) + 1);
    }
    if (familyTally.size > 0 && week.length >= 4) {
        const sorted = Array.from(familyTally.entries()).sort((a, b) => b[1] - a[1]);
        const [topFamily, topCount] = sorted[0];
        const share = topCount / week.length;
        if (share >= 0.5) {
            const familyText: Record<string, string> = {
                bright: 'bright energy',
                tender: 'tenderness',
                warm: 'intensity',
                calm: 'calm',
                low: 'quieter feelings',
            };
            out.push({
                id: 'dominant',
                icon: 'trend',
                headline: `This week: ${familyText[topFamily] || topFamily}`,
                detail: `${Math.round(share * 100)}% of your check-ins fell here. ${topFamily === 'low' ? 'Be tender with each other.' : 'Lean in.'}`,
                tone: topFamily === 'low' ? 'caring' : 'warm',
            });
        }
    }

    // ── 3. Day-of-week bias — patterns over 30 days ──
    if (recent.length >= 12) {
        const valenceByDow: number[] = Array.from({ length: 7 }, () => 0);
        const countByDow: number[] = Array.from({ length: 7 }, () => 0);
        for (const e of recent) {
            const dow = parseMoodDate(e.timestamp)!.getDay();
            const v = moodValence(getMoodTheme(e.mood)) ?? 0.5;
            valenceByDow[dow] += v;
            countByDow[dow]++;
        }
        const avgs = valenceByDow.map((v, i) => (countByDow[i] >= 2 ? v / countByDow[i] : null));
        let highIdx = -1; let highV = 0;
        let lowIdx = -1; let lowV = 1;
        avgs.forEach((v, i) => {
            if (v === null) return;
            if (v > highV) { highV = v; highIdx = i; }
            if (v < lowV) { lowV = v; lowIdx = i; }
        });
        if (highIdx !== -1 && highV - lowV > 0.25) {
            out.push({
                id: 'dow',
                icon: 'pattern',
                headline: `${dayOfWeekLabel(highIdx)} lift you both`,
                detail: `Your auras tend to brighten on ${dayOfWeekLabel(highIdx).toLowerCase()}. Plan something around that.`,
                tone: 'gentle',
            });
        }
    }

    // ── 4. Showing up for them — when they're low and you've been bright ──
    const last5 = recent.filter((e) => parseMoodDate(e.timestamp)!.getTime() >= subDays(new Date(), 5).getTime());
    let supportCount = 0;
    const dayMap = new Map<string, { mine?: MoodTheme; theirs?: MoodTheme }>();
    for (const e of last5) {
        const k = format(parseMoodDate(e.timestamp)!, 'yyyy-MM-dd');
        const slot = dayMap.get(k) ?? {};
        if (e.userId === me)   slot.mine = getMoodTheme(e.mood);
        if (e.userId === them) slot.theirs = getMoodTheme(e.mood);
        dayMap.set(k, slot);
    }
    for (const { mine, theirs } of dayMap.values()) {
        if (theirs?.family === 'low' && (mine?.family === 'bright' || mine?.family === 'tender' || mine?.family === 'calm')) supportCount++;
    }
    if (supportCount >= 2) {
        out.push({
            id: 'support',
            icon: 'support',
            headline: `You\'ve been their light ${supportCount}× recently`,
            detail: `When their mood dipped, yours stayed steady. That\'s the work.`,
            tone: 'caring',
        });
    }

    return out.slice(0, 3);
};

const insightIcon = (kind: AuraInsight['icon']) => {
    switch (kind) {
        case 'streak':  return '🔥';
        case 'trend':   return '🌊';
        case 'sync':    return '✨';
        case 'support': return '🫂';
        case 'pattern': return '📈';
    }
};

const insightTint = (tone: AuraInsight['tone']) => {
    switch (tone) {
        case 'warm':         return ['#fb7185', '#fbbf24'] as const;
        case 'caring':       return ['#a78bfa', '#f9a8d4'] as const;
        case 'celebratory':  return ['#f472b6', '#fbbf24'] as const;
        case 'gentle':       return ['#7dd3fc', '#a78bfa'] as const;
    }
};

const InsightsCard: React.FC<{ insights: AuraInsight[] }> = ({ insights }) => {
    if (insights.length === 0) return null;
    return (
        <div
            className="rounded-[1.75rem] p-5 relative overflow-hidden"
            style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(252,247,250,0.45))',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 12px 28px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
        >
            <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-pink-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>
                    What we noticed
                </span>
            </div>
            <div className="space-y-2.5">
                {insights.map((ins) => {
                    const [a, b] = insightTint(ins.tone);
                    return (
                        <div
                            key={ins.id}
                            className="flex gap-3 p-3 rounded-2xl"
                            style={{
                                background: `linear-gradient(135deg, ${a}14, ${b}10)`,
                                border: `1px solid ${a}22`,
                            }}
                        >
                            <div
                                className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, ${a}, ${b})`,
                                    boxShadow: `0 6px 14px ${a}44`,
                                }}
                            >
                                {insightIcon(ins.icon)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-serif text-[0.95rem] font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                                    {ins.headline}
                                </p>
                                <p className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                                    {ins.detail}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Bridge Card — a small concrete action when moods diverge today ────────
interface BridgeAction {
    headline: string;
    detail: string;
    cta: string;
}

const generateBridge = (
    mineMood: string | undefined | null,
    theirMood: string | undefined | null,
    myName: string,
    partnerName: string,
): BridgeAction | null => {
    if (!mineMood || !theirMood) return null;
    const mine = getMoodTheme(mineMood);
    const theirs = getMoodTheme(theirMood);
    if (mine.family === theirs.family) return null;

    if (theirs.family === 'low' && (mine.family === 'bright' || mine.family === 'calm' || mine.family === 'tender')) {
        return {
            headline: `${partnerName} is feeling quieter today`,
            detail: `Send them one small thing that lifted you. They\'ll feel held.`,
            cta: 'Send a whisper',
        };
    }
    if (mine.family === 'low' && (theirs.family === 'bright' || theirs.family === 'tender')) {
        return {
            headline: `Let them in today`,
            detail: `${partnerName} is bright — share what\'s heavy. They want to be there.`,
            cta: 'Tell them',
        };
    }
    if (mine.family === 'warm' || theirs.family === 'warm') {
        const stressedName = mine.family === 'warm' ? 'You' : partnerName;
        return {
            headline: `${stressedName === 'You' ? 'You\'re' : `${stressedName} is`} carrying something hot`,
            detail: 'Step into something soft together — a walk, a song, a slow breath.',
            cta: 'Take a moment',
        };
    }
    return {
        headline: 'You\'re on different frequencies',
        detail: `${myName} is ${mine.label || normalizeMoodKey(mineMood)}, ${partnerName} is ${theirs.label || normalizeMoodKey(theirMood)}. Bridge it with a small ritual.`,
        cta: 'Start the bridge',
    };
};

const BridgeCard: React.FC<{ bridge: BridgeAction | null; onAction: () => void; mineColor: string; theirColor: string }> = ({ bridge, onAction, mineColor, theirColor }) => {
    if (!bridge) return null;
    return (
        <div
            className="rounded-[1.75rem] p-5 relative overflow-hidden"
            style={{
                background: `linear-gradient(135deg, ${mineColor}14 0%, ${theirColor}14 100%), linear-gradient(180deg, rgba(255,255,255,0.72), rgba(252,247,250,0.52))`,
                border: `1px solid ${mineColor}33`,
                boxShadow: `0 14px 30px ${mineColor}22, inset 0 1px 0 rgba(255,255,255,0.95)`,
            }}
        >
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>
                    Tonight\'s bridge
                </span>
            </div>
            <p className="font-serif text-[1.05rem] leading-snug font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {bridge.headline}
            </p>
            <p className="text-sm italic mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {bridge.detail}
            </p>
            <button
                onClick={onAction}
                className="mt-4 w-full py-3 rounded-2xl font-black text-xs uppercase tracking-[0.18em] text-white spring-press"
                style={{
                    background: `linear-gradient(135deg, ${mineColor}, ${theirColor})`,
                    boxShadow: `0 10px 20px ${mineColor}44`,
                }}
            >
                {bridge.cta}
            </button>
        </div>
    );
};

// ── Whispers — recent notes from check-ins ────────────────────────────────
const WhispersThread: React.FC<{ entries: MoodEntry[]; me: string; them: string }> = ({ entries, me, them }) => {
    const recent = useMemo(() => {
        return entries
            .filter((e) => e.note && e.note.trim().length > 0)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 4);
    }, [entries]);

    if (recent.length === 0) return null;

    return (
        <div
            className="rounded-[1.75rem] p-5"
            style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(252,247,250,0.45))',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 12px 28px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
        >
            <div className="flex items-center gap-2 mb-3">
                <MessageCircle size={13} className="text-pink-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>
                    Recent whispers
                </span>
            </div>
            <div className="space-y-2.5">
                {recent.map((e) => {
                    const theme = getMoodTheme(e.mood);
                    const mine = e.userId === me;
                    return (
                        <div
                            key={e.id}
                            className="flex gap-3 p-3 rounded-2xl"
                            style={{
                                background: `linear-gradient(135deg, ${theme.color}10, ${theme.color}06)`,
                                border: `1px solid ${theme.color}22`,
                            }}
                        >
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, ${theme.auraStops[0]}, ${theme.auraStops[1]})`,
                                    boxShadow: `0 4px 10px ${theme.color}55`,
                                }}
                            >
                                {theme.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: theme.color }}>
                                        {mine ? 'You' : (e.userId === them ? 'Them' : e.userId)}
                                    </span>
                                    <span className="text-[9px]" style={{ color: 'var(--color-text-secondary)' }}>
                                        {format(new Date(e.timestamp), 'MMM d')}
                                    </span>
                                </div>
                                <p className="font-serif italic text-[0.92rem] leading-snug mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                                    "{e.note}"
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Day Detail Modal ──────────────────────────────────────────────────────
const DayDetailModal: React.FC<{
    date: Date;
    entries: MoodEntry[];
    me: string;
    them: string;
    onClose: () => void;
}> = ({ date, entries, me, them, onClose }) => {
    const mine = entries.find((e) => e.userId === me);
    const theirs = entries.find((e) => e.userId === them);
    const mineTheme = mine ? getMoodTheme(mine.mood) : null;
    const theirsTheme = theirs ? getMoodTheme(theirs.mood) : null;

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 220 }}
                className="rounded-t-[2.5rem] w-full max-w-md p-6 relative shadow-2xl"
                style={{
                    background: 'color-mix(in srgb, var(--color-surface) 96%, transparent)',
                    border: '1px solid rgba(244,114,182,0.18)',
                    paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-1.5 rounded-full mx-auto mb-5" style={{ background: 'rgba(0,0,0,0.10)' }} />

                <div className="flex items-center justify-between mb-5">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>
                            {format(date, 'EEEE')}
                        </p>
                        <h3 className="font-serif text-2xl" style={{ color: 'var(--color-text-primary)' }}>
                            {format(date, 'MMMM d, yyyy')}
                        </h3>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center spring-press" aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                <div className="space-y-3">
                    {[{ side: 'You',          entry: mine,   theme: mineTheme,   isMine: true },
                      { side: 'Your partner', entry: theirs, theme: theirsTheme, isMine: false }].map(({ side, entry, theme, isMine }) => {
                        const filled = !!(entry && theme);

                        // ── EMPTY STATE — pretty placeholder, not a sad gray dot.
                        // Dashed avatar ring, mute body, optional Nudge CTA when
                        // it's the partner who hasn't logged.
                        if (!filled) {
                            return (
                                <div
                                    key={side}
                                    className="rounded-2xl p-4 relative overflow-hidden"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.7), rgba(252,247,250,0.55))',
                                        border: '1px dashed rgba(0,0,0,0.10)',
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="w-10 h-10 rounded-full flex items-center justify-center text-base"
                                            style={{
                                                background: 'rgba(0,0,0,0.04)',
                                                border: '1.5px dashed rgba(0,0,0,0.18)',
                                                color: 'rgba(0,0,0,0.32)',
                                            }}
                                            aria-hidden
                                        >
                                            ·
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>{side}</p>
                                            <p className="font-serif text-[0.95rem]" style={{ color: 'var(--color-text-secondary)' }}>
                                                {isMine ? 'You haven\'t logged yet' : 'Quietly absent'}
                                            </p>
                                        </div>
                                        {!isMine && isToday(date) && (
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="text-[10px] font-black uppercase tracking-[0.18em] px-3 py-2 rounded-full text-white spring-press"
                                                style={{
                                                    background: 'linear-gradient(135deg, #f472b6, #fb7185)',
                                                    boxShadow: '0 6px 14px rgba(244,114,182,0.35)',
                                                }}
                                            >
                                                Nudge
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // ── FILLED STATE — rich card with mood gradient backdrop,
                        // intensity pips, and the note quoted in serif italic.
                        return (
                            <div
                                key={side}
                                className="rounded-2xl p-4 relative overflow-hidden"
                                style={{
                                    background: `linear-gradient(135deg, ${theme!.auraStops[0]}28, ${theme!.auraStops[1]}14)`,
                                    border: `1px solid ${theme!.color}33`,
                                    boxShadow: `0 6px 18px ${theme!.color}22`,
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <span
                                        className="w-11 h-11 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                                        style={{
                                            background: `linear-gradient(135deg, ${theme!.auraStops[0]}, ${theme!.auraStops[1]})`,
                                            boxShadow: `0 6px 14px ${theme!.color}55, inset 0 1px 0 rgba(255,255,255,0.5)`,
                                        }}
                                    >
                                        {theme!.emoji}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: theme!.color }}>{side}</p>
                                        <p className="font-serif text-[1.05rem] capitalize font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                                            {theme!.label || normalizeMoodKey(entry!.mood)}
                                        </p>
                                    </div>
                                    {entry!.intensity && (
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-[8px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
                                                Intensity
                                            </span>
                                            <div className="flex gap-0.5">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <span
                                                        key={n}
                                                        className="w-1.5 h-3 rounded-sm"
                                                        style={{
                                                            background: n <= entry!.intensity!
                                                                ? `linear-gradient(180deg, ${theme!.auraStops[0]}, ${theme!.auraStops[1]})`
                                                                : 'rgba(0,0,0,0.08)',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {entry!.note && (
                                    <p className="text-[0.92rem] italic mt-3 leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                                        "{entry!.note}"
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
};

// ── Mood Wheel Check-In ───────────────────────────────────────────────────
const CheckInSheet: React.FC<{
    onSave: (mood: string, intensity: number, note: string) => void;
    onClose: () => void;
    todayPrompt: string;
}> = ({ onSave, onClose, todayPrompt }) => {
    const [selectedMood, setSelectedMood] = useState<string>('happy');
    const [intensity, setIntensity] = useState(3);
    const [note, setNote] = useState('');
    const selectedTheme = getMoodTheme(selectedMood);

    const groups = useMemo(() => {
        const order: Array<MoodTheme['family']> = ['bright', 'tender', 'warm', 'calm', 'low'];
        const labels: Record<MoodTheme['family'], string> = {
            bright: 'Bright',
            tender: 'Tender',
            warm:   'Warm',
            calm:   'Calm',
            low:    'Quiet',
        };
        // Color dot per family — picks the first mood's color so the family
        // strip has a recognisable visual identity at a glance.
        const familyColors: Record<MoodTheme['family'], string> = {
            bright: '#fbbf24',
            tender: '#f9a8d4',
            warm:   '#fb7185',
            calm:   '#7dd3fc',
            low:    '#a5b4fc',
        };
        return order.map((family) => ({
            family,
            label: labels[family],
            color: familyColors[family],
            moods: wheelOrder.filter((k) => moodThemes[k]?.family === family),
        }));
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="rounded-t-[2.5rem] w-full max-w-md relative shadow-2xl overflow-y-auto"
                style={{
                    background: 'color-mix(in srgb, var(--color-surface) 96%, transparent)',
                    border: '1px solid rgba(244,114,182,0.18)',
                    paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
                    maxHeight: '90dvh',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Live preview header — recolours with the selected mood */}
                <div
                    className="relative px-6 pt-6 pb-5 transition-colors duration-300"
                    style={{
                        background: `linear-gradient(135deg, ${selectedTheme.auraStops[0]}33, ${selectedTheme.auraStops[1]}11)`,
                    }}
                >
                    <div className="w-12 h-1.5 rounded-full mx-auto mb-4" style={{ background: 'rgba(0,0,0,0.10)' }} />
                    <div className="flex items-center gap-4">
                        <div
                            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-[0_10px_24px_rgba(90,82,102,0.14)]"
                            style={{ background: `linear-gradient(135deg, ${selectedTheme.auraStops[0]}, ${selectedTheme.auraStops[1]})` }}
                        >
                            {selectedTheme.emoji}
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>
                                Right now
                            </p>
                            <p className="font-serif text-2xl capitalize" style={{ color: 'var(--color-text-primary)' }}>
                                {selectedTheme.label || selectedMood}
                            </p>
                        </div>
                    </div>
                    <p className="mt-3 text-sm italic" style={{ color: 'var(--color-text-secondary)' }}>{todayPrompt}</p>
                </div>

                {/* Wheel — grouped by emotional family */}
                <div className="px-5 py-5 space-y-5">
                    {groups.map(({ family, label, color, moods }) => (
                        <div key={family}>
                            {/* Family label gets a colored dot + a faint divider line so
                                the wheel feels grouped, not just a label-stack. */}
                            <div className="flex items-center gap-2 mb-2.5 px-1">
                                <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: color, boxShadow: `0 0 0 2px ${color}22, 0 0 6px ${color}66` }}
                                />
                                <span className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--color-text-secondary)' }}>
                                    {label}
                                </span>
                                <span className="flex-1 h-px ml-1" style={{ background: `linear-gradient(90deg, ${color}33 0%, transparent 100%)` }} />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {moods.map((key) => {
                                    const theme = moodThemes[key];
                                    const active = selectedMood === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => { feedback.tap(); setSelectedMood(key); }}
                                            className="spring-press transition-all flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full"
                                            style={{
                                                // Selected: SOFT mood gradient base + colored ring + glow.
                                                // Inactive: white frosted with subtle border.
                                                // The earlier solid-fill selected state turned the
                                                // emoji into an awkward circle-on-color shape.
                                                background: active
                                                    ? `linear-gradient(135deg, ${theme.auraStops[0]}33, ${theme.auraStops[1]}1A)`
                                                    : 'rgba(255,255,255,0.85)',
                                                color: 'var(--color-text-primary)',
                                                border: active
                                                    ? `1.5px solid ${theme.color}`
                                                    : '1px solid rgba(0,0,0,0.06)',
                                                boxShadow: active
                                                    ? `0 6px 14px ${theme.color}33, inset 0 1px 0 rgba(255,255,255,0.95)`
                                                    : '0 1px 2px rgba(90,82,102,0.04)',
                                                fontWeight: active ? 700 : 500,
                                            }}
                                        >
                                            {/* Emoji in a clean white halo so it never looks "clipped"
                                                regardless of selection state. */}
                                            <span
                                                className="w-7 h-7 rounded-full flex items-center justify-center text-base"
                                                style={{
                                                    background: active
                                                        ? `linear-gradient(135deg, ${theme.auraStops[0]}, ${theme.auraStops[1]})`
                                                        : '#fff',
                                                    boxShadow: active
                                                        ? `0 3px 8px ${theme.color}55, inset 0 1px 0 rgba(255,255,255,0.55)`
                                                        : `0 1px 3px rgba(90,82,102,0.10)`,
                                                }}
                                            >
                                                {theme.emoji}
                                            </span>
                                            <span className="text-[12px] capitalize leading-none">{theme.label || key}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Intensity slider */}
                <div className="px-6 pb-2">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.20em]" style={{ color: 'var(--color-text-secondary)' }}>Intensity</span>
                        <span className="text-xs font-bold" style={{ color: selectedTheme.color }}>
                            {['Whisper', 'Soft', 'Steady', 'Strong', 'Vivid'][intensity - 1]}
                        </span>
                    </div>
                    <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => { feedback.tap(); setIntensity(n); }}
                                className="flex-1 h-9 rounded-xl transition-all"
                                style={{
                                    background: n <= intensity
                                        ? `linear-gradient(135deg, ${selectedTheme.auraStops[0]}, ${selectedTheme.auraStops[1]})`
                                        : 'rgba(0,0,0,0.05)',
                                    boxShadow: n <= intensity ? `0 4px 10px ${selectedTheme.color}33` : undefined,
                                    transform: n === intensity ? 'translateY(-1px)' : 'translateY(0)',
                                }}
                                aria-label={`Intensity ${n}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Note */}
                <div className="px-6 py-4">
                    <div className="relative">
                        <div className="absolute top-3.5 left-3.5" style={{ color: 'var(--color-text-secondary)' }}>
                            <MessageCircle size={16} />
                        </div>
                        <textarea
                            className="w-full rounded-2xl p-3 pl-10 text-sm outline-none focus:ring-2 focus:ring-pink-300 transition-all italic"
                            style={{
                                background: 'rgba(0,0,0,0.04)',
                                border: '1px solid rgba(0,0,0,0.06)',
                                color: 'var(--color-text-primary)',
                                resize: 'none',
                            }}
                            placeholder="A tiny note for them... (optional)"
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </div>

                {/* Sticky save */}
                <div className="px-5 pb-1">
                    <button
                        type="button"
                        onClick={() => { feedback.celebrate(); onSave(selectedMood, intensity, note.trim()); }}
                        className="w-full py-4 rounded-2xl font-black tracking-widest uppercase text-white spring-press"
                        style={{
                            background: `linear-gradient(135deg, ${selectedTheme.auraStops[0]}, ${selectedTheme.auraStops[1]})`,
                            boxShadow: `0 12px 28px ${selectedTheme.color}55`,
                        }}
                    >
                        <span className="inline-flex items-center gap-2 text-sm"><Heart size={14} fill="currentColor" /> Send my aura</span>
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ── Main view ─────────────────────────────────────────────────────────────
export const MoodCalendar: React.FC<MoodCalendarProps> = ({ setView }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
    const [profile, setProfile] = useState<CoupleProfile | null>(null);
    const [isCheckingIn, setIsCheckingIn] = useState(false);
    const [detailDate, setDetailDate] = useState<Date | null>(null);
    const myName = profile?.myName?.trim() || 'You';
    const partnerName = profile?.partnerName?.trim() || 'Partner';

    useEffect(() => {
        setMoodEntries(StorageService.getMoodEntries());
        setProfile(StorageService.getCoupleProfile());
    }, []);

    const myMood = useMemo(() => {
        return moodEntries
            .filter((e) => e.userId === myName && parseMoodDate(e.timestamp))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    }, [moodEntries, myName]);

    const partnerMood = useMemo(() => {
        return moodEntries
            .filter((e) => e.userId === partnerName && parseMoodDate(e.timestamp))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    }, [moodEntries, partnerName]);

    const harmony = useMemo(() => computeHarmony(moodEntries, myName, partnerName), [moodEntries, myName, partnerName]);
    const insights = useMemo(() => generateInsights(moodEntries, myName, partnerName), [moodEntries, myName, partnerName]);
    const bridge = useMemo(() => generateBridge(myMood?.mood, partnerMood?.mood, myName, partnerName), [myMood?.mood, partnerMood?.mood, myName, partnerName]);

    const handleCheckIn = useCallback((mood: string, intensity: number, note: string) => {
        const entry: MoodEntry = {
            id: generateId(),
            userId: myName,
            mood,
            timestamp: new Date().toISOString(),
            note: note || undefined,
            intensity,
        };
        StorageService.saveMoodEntry(entry);
        setMoodEntries((prev) => [...prev, entry]);
        setIsCheckingIn(false);
    }, [myName]);

    const monthStart = startOfMonth(currentDate);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentDate) });
    const paddingDays = Array.from({ length: monthStart.getDay() }).map((_, i) => i);

    const detailEntries = useMemo(() => {
        if (!detailDate) return [];
        return moodEntries.filter((e) => {
            const d = parseMoodDate(e.timestamp);
            return d ? isSameDay(d, detailDate) : false;
        });
    }, [moodEntries, detailDate]);

    const myColor = getMoodTheme(myMood?.mood).color;
    const theirColor = getMoodTheme(partnerMood?.mood).color;

    // Stagger config — fades each card up on view mount, mesmerizing without
    // being slow. Same easing curve the rest of the app uses for cohesion.
    const stagger = {
        container: { animate: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } },
        item: {
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 280, damping: 26 } },
        },
    };

    return (
        <div className="px-4 pt-4 pb-32 relative">
            {/* ── Ambient aurora wash ──────────────────────────────────────
               A pair of soft mood-tinted radial pools that breathe behind the
               whole view. They re-tint based on the current mood pair so the
               entire screen feels alive without distracting from the cards. */}
            <div aria-hidden className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <motion.div
                    className="absolute"
                    style={{
                        top: '-10%',
                        left: '-15%',
                        width: '70vw',
                        height: '70vw',
                        background: `radial-gradient(circle, ${myColor}33 0%, ${myColor}12 35%, transparent 60%)`,
                        filter: 'blur(60px)',
                        borderRadius: '50%',
                    }}
                    animate={{ scale: [1, 1.08, 1], x: [0, 10, 0], y: [0, -6, 0] }}
                    transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute"
                    style={{
                        bottom: '-10%',
                        right: '-15%',
                        width: '60vw',
                        height: '60vw',
                        background: `radial-gradient(circle, ${theirColor}33 0%, ${theirColor}12 35%, transparent 60%)`,
                        filter: 'blur(60px)',
                        borderRadius: '50%',
                    }}
                    animate={{ scale: [1, 1.10, 1], x: [0, -8, 0], y: [0, 6, 0] }}
                    transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                />
            </div>

            <ViewHeader
                title="Aura Board"
                subtitle="Your shared pulse"
                onBack={() => setView('home')}
                variant="simple"
                borderless
            />

            <motion.div
                className="space-y-5 relative z-10"
                initial="initial"
                animate="animate"
                variants={stagger.container}
            >
                {/* SECTION 1 — HERO. Orb + names + primary "Log mood" CTA.
                    Nothing competes for attention here; this is the anchor of
                    the whole view. */}
                <motion.div variants={stagger.item} className="space-y-3">
                    <AuraOrb
                        myMood={myMood?.mood}
                        partnerMood={partnerMood?.mood}
                        myName={myName}
                        partnerName={partnerName}
                        onTap={() => setIsCheckingIn(true)}
                    />
                    {/* Primary CTA below the orb — replaces the floating FAB
                        and surfaces a single clear action for the user. */}
                    <button
                        type="button"
                        onClick={() => setIsCheckingIn(true)}
                        className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.20em] text-white spring-press flex items-center justify-center gap-2"
                        style={{
                            background: `linear-gradient(135deg, ${myColor}, ${theirColor})`,
                            boxShadow: `0 12px 26px ${myColor}55, inset 0 1px 0 rgba(255,255,255,0.45)`,
                        }}
                    >
                        <Plus size={15} strokeWidth={2.6} />
                        {myMood && isToday(parseMoodDate(myMood.timestamp) ?? new Date(0)) ? 'Update today\'s mood' : 'Log today\'s mood'}
                    </button>
                </motion.div>

                {/* SECTION 2 — PULSE FLOW. Compact 7-day rhythm. */}
                <motion.div variants={stagger.item}>
                    <PulseStrip entries={moodEntries} me={myName} them={partnerName} />
                </motion.div>

            {/* SECTION 3 — MONTH CALENDAR. Harmony score + Reflect button live
                inline in the header so the week's score and deeper analysis
                are reachable without adding more cards to the stack. */}
            <motion.main
                variants={stagger.item}
                className="rounded-[1.75rem] p-5"
                style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(252,247,250,0.45))',
                    border: '1px solid rgba(255,255,255,0.7)',
                    boxShadow: '0 12px 28px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
                }}
            >
                {/* Top row — month + nav */}
                <div className="flex justify-between items-center mb-2">
                    <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {format(currentDate, 'MMMM yyyy')}
                    </h2>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                            aria-label="Previous month"
                            className="w-9 h-9 flex items-center justify-center rounded-full spring-press"
                            style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--color-text-secondary)' }}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                            aria-label="Next month"
                            className="w-9 h-9 flex items-center justify-center rounded-full spring-press"
                            style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--color-text-secondary)' }}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>

                {/* Inline harmony chip + reflect — replaces the standalone
                    HarmonyCard, BridgeCard, InsightsCard, WhispersThread.
                    Score is glanceable, deep analysis is one tap away. */}
                <div className="flex items-center gap-2 mb-4 -mt-1">
                    {!!(myMood && partnerMood) && (
                        <span
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.18em] text-white"
                            style={{
                                background: `linear-gradient(135deg, ${myColor}, ${theirColor})`,
                                boxShadow: `0 4px 10px ${myColor}44`,
                            }}
                        >
                            <Sparkles size={10} />
                            {harmony}<span className="opacity-70">/100</span> harmony
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setView('aura-rewind')}
                        className="ml-auto flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] px-3 py-1 rounded-full spring-press"
                        style={{
                            background: 'rgba(244,114,182,0.10)',
                            color: 'var(--color-nav-active)',
                            border: '1px solid rgba(244,114,182,0.20)',
                        }}
                    >
                        <TrendingUp size={11} /> Reflect
                    </button>
                </div>

                <div className="grid grid-cols-7 gap-2 mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-center" style={{ color: 'var(--color-text-secondary)' }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                    {paddingDays.map((p) => <div key={`p-${p}`} />)}
                    {daysInMonth.map((day) => {
                        const dayEntries = moodEntries.filter((e) => {
                            const d = parseMoodDate(e.timestamp);
                            return d ? isSameDay(d, day) : false;
                        });
                        const mine = dayEntries.find((e) => e.userId === myName);
                        const theirs = dayEntries.find((e) => e.userId === partnerName);
                        const mineTheme = mine ? getMoodTheme(mine.mood) : null;
                        const theirsTheme = theirs ? getMoodTheme(theirs.mood) : null;
                        const today = isToday(day);
                        const hasAny = !!(mine || theirs);
                        const synced = !!(mineTheme && theirsTheme && mineTheme.family === theirsTheme.family);
                        const isFuture = day.getTime() > Date.now();

                        // ── Cell base style — solid white, clear borders.
                        // The earlier transparent style read as a loading skeleton.
                        let bg = '#ffffff';
                        let border = '1px solid rgba(0,0,0,0.06)';
                        let boxShadow = '0 1px 2px rgba(90,82,102,0.04)';
                        let numberColor = 'var(--color-text-primary)';
                        let numberWeight: number = 600;

                        if (isFuture) {
                            bg = 'rgba(255,255,255,0.55)';
                            border = '1px dashed rgba(0,0,0,0.06)';
                            boxShadow = 'none';
                            numberColor = 'rgba(0,0,0,0.24)';
                            numberWeight = 500;
                        } else if (today) {
                            // Today filled like iOS — high contrast pink chip.
                            bg = `linear-gradient(135deg, #f472b6, #fb7185)`;
                            border = '1px solid rgba(244,114,182,0.55)';
                            boxShadow = '0 6px 16px rgba(244,114,182,0.35), inset 0 1px 0 rgba(255,255,255,0.4)';
                            numberColor = '#ffffff';
                            numberWeight = 800;
                        } else if (synced && mineTheme) {
                            border = `1px solid ${mineTheme.color}77`;
                            boxShadow = `0 2px 8px ${mineTheme.color}22, inset 0 0 0 1px rgba(255,255,255,0.85)`;
                        } else if (hasAny) {
                            border = '1px solid rgba(0,0,0,0.08)';
                            boxShadow = '0 2px 6px rgba(90,82,102,0.08), inset 0 0 0 1px rgba(255,255,255,0.85)';
                        }

                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => hasAny && setDetailDate(day)}
                                disabled={isFuture}
                                className={`aspect-square rounded-xl relative transition-all spring-press ${hasAny ? 'cursor-pointer' : 'cursor-default'}`}
                                style={{ background: bg, border, boxShadow }}
                                aria-label={hasAny ? `${format(day, 'PPP')} — view moods` : format(day, 'PPP')}
                            >
                                {/* Mood backlight — yours from the top-left, theirs
                                    from the bottom-right. Skipped for "today" since
                                    today already has a solid filled background. */}
                                {!today && mineTheme && (
                                    <span
                                        aria-hidden
                                        className="absolute inset-0 rounded-xl pointer-events-none"
                                        style={{
                                            background: `radial-gradient(110% 110% at 0% 0%, ${mineTheme.color}66 0%, ${mineTheme.color}1A 38%, transparent 70%)`,
                                        }}
                                    />
                                )}
                                {!today && theirsTheme && (
                                    <span
                                        aria-hidden
                                        className="absolute inset-0 rounded-xl pointer-events-none"
                                        style={{
                                            background: `radial-gradient(110% 110% at 100% 100%, ${theirsTheme.color}66 0%, ${theirsTheme.color}1A 38%, transparent 70%)`,
                                        }}
                                    />
                                )}

                                {/* Day number — always primary */}
                                <span
                                    className="absolute inset-0 flex items-center justify-center text-[13px] z-10 leading-none"
                                    style={{
                                        color: numberColor,
                                        fontWeight: numberWeight,
                                        textShadow: today ? '0 1px 2px rgba(0,0,0,0.18)' : undefined,
                                    }}
                                >
                                    {format(day, 'd')}
                                </span>

                                {/* Two tiny attribution dots — top corners.
                                    Crisp, ringed so they read as "two people logged"
                                    not visual noise. Hidden on "today" to keep its
                                    chip clean. */}
                                {hasAny && !today && (
                                    <div className="absolute top-1 left-0 right-0 flex items-center justify-between px-1.5 pointer-events-none z-10">
                                        <span
                                            className="w-1.5 h-1.5 rounded-full"
                                            style={{
                                                background: mineTheme ? mineTheme.color : 'transparent',
                                                boxShadow: mineTheme ? `0 0 0 1.5px #fff, 0 0 4px ${mineTheme.color}AA` : undefined,
                                                opacity: mineTheme ? 1 : 0,
                                            }}
                                        />
                                        <span
                                            className="w-1.5 h-1.5 rounded-full"
                                            style={{
                                                background: theirsTheme ? theirsTheme.color : 'transparent',
                                                boxShadow: theirsTheme ? `0 0 0 1.5px #fff, 0 0 4px ${theirsTheme.color}AA` : undefined,
                                                opacity: theirsTheme ? 1 : 0,
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Today's small bottom dot — extra "you are here" cue */}
                                {today && (
                                    <span
                                        aria-hidden
                                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/95 z-10"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Legend — explains the system without being crowded */}
                <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-2 mt-5 pt-4 border-t border-black/5">
                    <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: myColor, boxShadow: `0 0 0 1.5px #fff, 0 0 4px ${myColor}AA` }} />
                        You
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: theirColor, boxShadow: `0 0 0 1.5px #fff, 0 0 4px ${theirColor}AA` }} />
                        Them
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="w-2.5 h-2.5 rounded-md" style={{ background: '#fff', border: `1px solid ${myColor}77`, boxShadow: `0 0 6px ${myColor}33` }} />
                        Synced
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="w-2.5 h-2.5 rounded-md" style={{ background: 'linear-gradient(135deg, #f472b6, #fb7185)', boxShadow: '0 2px 6px rgba(244,114,182,0.4)' }} />
                        Today
                    </span>
                </div>
            </motion.main>
            </motion.div>

            {/* No floating Pulse FAB — primary CTA lives beneath the orb so
                the action is always anchored to the visual that explains it.
                Removes a competing focal point at the bottom of the screen. */}

            <AnimatePresence>
                {isCheckingIn && (
                    <CheckInSheet
                        onSave={handleCheckIn}
                        onClose={() => setIsCheckingIn(false)}
                        todayPrompt={dayPrompt(new Date())}
                    />
                )}
                {detailDate && (
                    <DayDetailModal
                        date={detailDate}
                        entries={detailEntries}
                        me={myName}
                        them={partnerName}
                        onClose={() => setDetailDate(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

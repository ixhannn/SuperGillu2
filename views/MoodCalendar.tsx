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

    return (
        <button
            type="button"
            onClick={onTap}
            className="block w-full relative overflow-hidden rounded-[2.25rem] spring-press"
            style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(252,247,250,0.42))',
                border: '1px solid rgba(255,255,255,0.65)',
                boxShadow: '0 18px 38px rgba(90,82,102,0.10), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
        >
            <div className="px-5 pt-5 pb-6 flex flex-col items-center">
                {/* Orb */}
                <div className="relative w-[180px] h-[180px] mb-4">
                    {/* Outer halo — slowly counter-rotates the inner aura */}
                    <motion.div
                        className="absolute inset-[-22px] rounded-full opacity-70"
                        style={{ background: gradient, filter: 'blur(28px)' }}
                        animate={{ rotate: -360 }}
                        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
                    />
                    {/* Inner aura — the visible orb */}
                    <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ background: gradient, filter: 'blur(2px)' }}
                        animate={{ rotate: 360, scale: [1, 1.04, 1] }}
                        transition={{
                            rotate: { duration: 18, repeat: Infinity, ease: 'linear' },
                            scale:  { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
                        }}
                    />
                    {/* Glass highlight */}
                    <div
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{
                            background: 'radial-gradient(ellipse 50% 35% at 35% 25%, rgba(255,255,255,0.55) 0%, transparent 60%)',
                            mixBlendMode: 'soft-light',
                        }}
                    />
                    {/* Avatars at the equator */}
                    <div className="absolute inset-0 flex items-center justify-between px-3">
                        <span className="w-12 h-12 rounded-full bg-white/85 border-2 border-white shadow-[0_8px_18px_rgba(90,82,102,0.18)] flex items-center justify-center text-xl">
                            {myMood ? myTheme.emoji : '?'}
                        </span>
                        <span className="w-12 h-12 rounded-full bg-white/85 border-2 border-white shadow-[0_8px_18px_rgba(90,82,102,0.18)] flex items-center justify-center text-xl">
                            {partnerMood ? theirTheme.emoji : '?'}
                        </span>
                    </div>
                </div>

                {/* Names + state line */}
                <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                        {myName} <span className="opacity-50 px-1">·</span> {partnerName}
                    </p>
                    <p className="font-serif text-lg leading-snug px-4" style={{ color: 'var(--color-text-primary)' }}>
                        {poeticReading(myMood ? (myTheme.label || normalizeMoodKey(myMood)) : null, partnerMood ? (theirTheme.label || normalizeMoodKey(partnerMood)) : null)}
                    </p>
                    <p className="text-[11px] mt-1.5 italic" style={{ color: 'var(--color-text-secondary)' }}>
                        {both ? 'Tap the orb for tonight\'s prompt' : 'Tap below to share your pulse'}
                    </p>
                </div>
            </div>
        </button>
    );
};

// ── Pulse Strip — last 7 days ─────────────────────────────────────────────
const PulseStrip: React.FC<{
    entries: MoodEntry[];
    me: string;
    them: string;
}> = ({ entries, me, them }) => {
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i)), []);

    return (
        <div className="rounded-[1.75rem] p-4" style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(252,247,250,0.40))',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 10px 24px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
        }}>
            <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>Last 7 Days</span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>You / Them</span>
            </div>

            <div className="flex items-end justify-between gap-1.5">
                {days.map((day) => {
                    const dayEntries = entries.filter((e) => {
                        const d = parseMoodDate(e.timestamp);
                        return d ? isSameDay(d, day) : false;
                    });
                    const mine = dayEntries.find((e) => e.userId === me);
                    const theirs = dayEntries.find((e) => e.userId === them);
                    const mineTheme = mine ? getMoodTheme(mine.mood) : null;
                    const theirsTheme = theirs ? getMoodTheme(theirs.mood) : null;
                    const today = isToday(day);

                    return (
                        <div key={day.toISOString()} className="flex flex-col items-center flex-1 min-w-0 gap-1">
                            {/* Stacked ribbons: mine on top, theirs on bottom */}
                            <div className="w-full flex flex-col gap-0.5">
                                <div
                                    className="w-full h-7 rounded-md"
                                    style={{
                                        background: mineTheme
                                            ? `linear-gradient(135deg, ${mineTheme.auraStops[0]}, ${mineTheme.auraStops[1]})`
                                            : 'rgba(0,0,0,0.04)',
                                        boxShadow: mineTheme ? '0 2px 6px rgba(90,82,102,0.10)' : undefined,
                                    }}
                                />
                                <div
                                    className="w-full h-7 rounded-md"
                                    style={{
                                        background: theirsTheme
                                            ? `linear-gradient(135deg, ${theirsTheme.auraStops[0]}, ${theirsTheme.auraStops[1]})`
                                            : 'rgba(0,0,0,0.04)',
                                        boxShadow: theirsTheme ? '0 2px 6px rgba(90,82,102,0.10)' : undefined,
                                    }}
                                />
                            </div>
                            <span
                                className={`text-[9px] font-bold ${today ? 'font-black' : ''}`}
                                style={{ color: today ? 'var(--color-nav-active)' : 'var(--color-text-secondary)' }}
                            >
                                {format(day, 'EEEEE')}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Harmony Card ──────────────────────────────────────────────────────────
const HarmonyCard: React.FC<{ score: number; reading: string; bothActive: boolean; onRewind: () => void }> = ({ score, reading, bothActive, onRewind }) => {
    return (
        <div
            className="rounded-[1.75rem] p-5 flex items-center gap-4"
            style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(252,247,250,0.40))',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 10px 24px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
        >
            {/* Circular score dial */}
            <div className="relative w-[68px] h-[68px] flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
                    <circle
                        cx="18" cy="18" r="15"
                        fill="none"
                        stroke="url(#harmonyGrad)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${(score / 100) * 94.25} 94.25`}
                    />
                    <defs>
                        <linearGradient id="harmonyGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#f472b6" />
                            <stop offset="100%" stopColor="#fbbf24" />
                        </linearGradient>
                    </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-serif text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {bothActive ? score : '—'}
                    </span>
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles size={11} style={{ color: 'var(--color-text-secondary)' }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
                        Harmony · 7d
                    </span>
                </div>
                <p className="font-serif text-sm leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                    {reading}
                </p>
            </div>

            <button
                onClick={onRewind}
                aria-label="Open Aura Rewind"
                className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center spring-press"
                style={{
                    background: 'rgba(244,114,182,0.10)',
                    color: 'var(--color-nav-active)',
                    border: '1px solid rgba(244,114,182,0.20)',
                }}
            >
                <TrendingUp size={18} />
            </button>
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
                    {[{ side: 'You',           entry: mine,   theme: mineTheme },
                      { side: 'Your partner',  entry: theirs, theme: theirsTheme }].map(({ side, entry, theme }) => (
                        <div
                            key={side}
                            className="rounded-2xl p-4"
                            style={{
                                background: theme ? `linear-gradient(135deg, ${theme.auraStops[0]}22, ${theme.auraStops[1]}11)` : 'rgba(0,0,0,0.04)',
                                border: '1px solid rgba(255,255,255,0.55)',
                            }}
                        >
                            <div className="flex items-center gap-3 mb-1">
                                <span
                                    className="w-10 h-10 rounded-full bg-white shadow-[0_4px_10px_rgba(90,82,102,0.10)] flex items-center justify-center text-xl"
                                >{theme ? theme.emoji : '·'}</span>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>{side}</p>
                                    <p className="font-serif text-base" style={{ color: 'var(--color-text-primary)' }}>
                                        {entry ? (theme?.label || normalizeMoodKey(entry.mood)) : 'No mood logged'}
                                    </p>
                                </div>
                                {entry?.intensity && (
                                    <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                                        Intensity {entry.intensity}/5
                                    </span>
                                )}
                            </div>
                            {entry?.note && (
                                <p className="text-sm italic mt-2 pl-13 leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>"{entry.note}"</p>
                            )}
                        </div>
                    ))}
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
        return order.map((family) => ({
            family,
            label: labels[family],
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
                <div className="px-5 py-5 space-y-4">
                    {groups.map(({ family, label, moods }) => (
                        <div key={family}>
                            <p className="text-[10px] font-black uppercase tracking-[0.20em] mb-2 px-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
                            <div className="flex flex-wrap gap-2">
                                {moods.map((key) => {
                                    const theme = moodThemes[key];
                                    const active = selectedMood === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => { feedback.tap(); setSelectedMood(key); }}
                                            className="spring-press transition-all flex items-center gap-1.5 px-3 py-2 rounded-full"
                                            style={{
                                                background: active
                                                    ? `linear-gradient(135deg, ${theme.auraStops[0]}, ${theme.auraStops[1]})`
                                                    : 'rgba(0,0,0,0.04)',
                                                color: active ? '#fff' : 'var(--color-text-primary)',
                                                border: active ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(0,0,0,0.06)',
                                                boxShadow: active ? `0 6px 14px ${theme.color}55` : undefined,
                                                transform: active ? 'scale(1.04)' : 'scale(1)',
                                                fontWeight: active ? 700 : 500,
                                            }}
                                        >
                                            <span className="text-base leading-none">{theme.emoji}</span>
                                            <span className="text-xs capitalize">{theme.label || key}</span>
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

    return (
        <div className="px-4 pt-4 pb-32 relative space-y-4">
            <ViewHeader
                title="Aura Board"
                subtitle="Your shared pulse"
                onBack={() => setView('home')}
                variant="simple"
                borderless
            />

            {/* HERO — Aura Orb */}
            <AuraOrb
                myMood={myMood?.mood}
                partnerMood={partnerMood?.mood}
                myName={myName}
                partnerName={partnerName}
                onTap={() => setIsCheckingIn(true)}
            />

            {/* PULSE — last 7 days */}
            <PulseStrip entries={moodEntries} me={myName} them={partnerName} />

            {/* HARMONY — sync score */}
            <HarmonyCard
                score={harmony}
                reading={harmonyReading(harmony, !!(myMood && partnerMood))}
                bothActive={!!(myMood && partnerMood)}
                onRewind={() => setView('aura-rewind')}
            />

            {/* CALENDAR — month grid with dual-tone pills */}
            <main
                className="rounded-[1.75rem] p-5"
                style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(252,247,250,0.40))',
                    border: '1px solid rgba(255,255,255,0.6)',
                    boxShadow: '0 10px 24px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
                }}
            >
                <div className="flex justify-between items-center mb-4">
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

                <div className="grid grid-cols-7 gap-2 mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-center" style={{ color: 'var(--color-text-secondary)' }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-2">
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

                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => hasAny && setDetailDate(day)}
                                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all spring-press ${hasAny ? 'cursor-pointer' : 'cursor-default'}`}
                                style={{
                                    background: hasAny
                                        ? `linear-gradient(135deg, ${(mineTheme || theirsTheme)!.auraStops[0]}, ${(theirsTheme || mineTheme)!.auraStops[1]})`
                                        : (today ? 'rgba(244,114,182,0.10)' : 'rgba(0,0,0,0.03)'),
                                    border: today ? '1.5px solid rgba(244,114,182,0.45)' : '1px solid transparent',
                                    boxShadow: hasAny ? '0 4px 10px rgba(90,82,102,0.08)' : undefined,
                                }}
                                aria-label={hasAny ? `${format(day, 'PPP')} — view moods` : format(day, 'PPP')}
                            >
                                <span
                                    className="text-[11px] font-bold"
                                    style={{
                                        color: hasAny ? '#fff' : (today ? 'var(--color-nav-active)' : 'var(--color-text-secondary)'),
                                        textShadow: hasAny ? '0 1px 2px rgba(0,0,0,0.18)' : undefined,
                                    }}
                                >
                                    {format(day, 'd')}
                                </span>
                                {hasAny && (
                                    <div className="flex gap-0.5 mt-0.5">
                                        {mineTheme && <span className="w-1 h-1 rounded-full bg-white/85" />}
                                        {theirsTheme && <span className="w-1 h-1 rounded-full bg-white/55" />}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </main>

            {/* Float pulse FAB — secondary entry to check-in */}
            <button
                type="button"
                onClick={() => setIsCheckingIn(true)}
                className="fixed bottom-28 right-5 z-30 px-5 py-3.5 rounded-full font-black uppercase tracking-[0.16em] text-xs flex items-center gap-2 spring-press text-white"
                style={{
                    background: 'linear-gradient(135deg, #f472b6 0%, #fb7185 100%)',
                    boxShadow: '0 16px 32px rgba(244,114,182,0.40), 0 4px 10px rgba(244,114,182,0.20)',
                }}
                aria-label="Add today's pulse"
            >
                <Plus size={16} strokeWidth={2.5} /> Pulse
            </button>

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

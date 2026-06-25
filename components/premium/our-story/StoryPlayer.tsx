import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { Crown, Flame, Heart, Lock, X } from 'lucide-react';
import { GOLD, GOLD_PRESS_SPRING, goldRise, goldStagger } from '../GoldKit';
import { feedback } from '../../../utils/feedback';
import {
    CHAPTER_MS,
    FREE_CHAPTER_LIMIT,
    type GateChapter,
    type PlayableChapter,
    type StoryFilm,
} from './chapters';
import '../../../styles/premium-hub.css';

/**
 * STORY PLAYER — full-screen, tap-through premiere of the couple's film.
 * Rendered through a portal (portal OUTSIDE AnimatePresence — React 19
 * portals are not valid elements, so AnimatePresence would drop them).
 */

interface StoryPlayerProps {
    open: boolean;
    film: StoryFilm;
    isPremium: boolean;
    onClose: () => void;
    /** Free user tapped unlock on the gate slide — close player, open paywall. */
    onUnlock: () => void;
}

/* ── Palettes: every chapter kind owns a deep-gradient mood ─────────── */

interface SlidePalette {
    bg: string;
    accent: string;
    soft: string;
}

const PALETTES: Record<'ember' | 'rose' | 'violet' | 'ink', SlidePalette> = {
    ember: {
        bg: 'radial-gradient(130% 90% at 50% 0%, rgba(122,74,22,0.5) 0%, transparent 58%), linear-gradient(170deg, #20130a 0%, #120a05 55%, #1a1008 100%)',
        accent: '#f6c768',
        soft: 'rgba(246,199,104,0.16)',
    },
    rose: {
        bg: 'radial-gradient(130% 90% at 80% 0%, rgba(157,42,82,0.45) 0%, transparent 60%), linear-gradient(165deg, #260d1a 0%, #140710 55%, #200b16 100%)',
        accent: '#fb7185',
        soft: 'rgba(251,113,133,0.15)',
    },
    violet: {
        bg: 'radial-gradient(130% 90% at 20% 0%, rgba(96,60,180,0.42) 0%, transparent 60%), linear-gradient(168deg, #1c1130 0%, #0e0818 55%, #170d26 100%)',
        accent: '#a78bfa',
        soft: 'rgba(167,139,250,0.15)',
    },
    ink: {
        bg: 'radial-gradient(130% 90% at 50% 100%, rgba(40,62,110,0.4) 0%, transparent 60%), linear-gradient(172deg, #0d1119 0%, #090b12 55%, #0e1320 100%)',
        accent: '#93c5fd',
        soft: 'rgba(147,197,253,0.13)',
    },
};

const PALETTE_FOR: Record<PlayableChapter['kind'], keyof typeof PALETTES> = {
    'title': 'ember',
    'began': 'rose',
    'first-memory': 'violet',
    'numbers': 'ink',
    'mood-weather': 'rose',
    'streak': 'ember',
    'voices': 'violet',
    'line': 'ink',
    'dates': 'rose',
    'latest': 'violet',
    'daily-ritual': 'rose',
    'tonight': 'violet',
    'outro': 'ember',
    'gate': 'ember',
};

/* ── Small shared pieces ────────────────────────────────────────────── */

/** Mount-triggered counter (slides mount fresh, so no in-view gating). */
const CountUp: React.FC<{ value: number; className?: string; style?: React.CSSProperties }> = ({ value, className, style }) => {
    const reduced = useReducedMotion();
    const [display, setDisplay] = useState(() => (reduced ? value : 0));

    useEffect(() => {
        if (reduced) {
            setDisplay(value);
            return;
        }
        const controls = animate(0, value, {
            duration: 1.4,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (v) => setDisplay(Math.round(v)),
        });
        return () => controls.stop();
    }, [value, reduced]);

    // tabular-nums + a width reserved on the FINAL value keep the number from
    // growing/shifting as it ramps 0→value (and snapping at the 1,000 comma).
    // text-align is inherited from each slide's container (numbers/streak =
    // center, voices = left, dates = right), so the reserved box stays aligned.
    return (
        <span
            className={className}
            style={{
                ...style,
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum" 1',
                display: 'inline-block',
                minWidth: `${value.toLocaleString().length}ch`,
            }}
        >
            {display.toLocaleString()}
        </span>
    );
};

/** Floating dust motes — deterministic per slide, CSS-animated, cheap. */
const Dust: React.FC<{ seed: number; tint: string }> = ({ seed, tint }) => {
    const motes = useMemo(() => Array.from({ length: 9 }, (_, i) => {
        const r = (n: number) => {
            const x = Math.sin(seed * 97.13 + i * 13.7 + n * 5.31) * 10000;
            return x - Math.floor(x);
        };
        return {
            left: `${6 + r(1) * 88}%`,
            top: `${10 + r(2) * 76}%`,
            size: 2.5 + r(3) * 2.5,
            delay: `${(r(4) * 3).toFixed(2)}s`,
            duration: `${(4 + r(5) * 3).toFixed(2)}s`,
            opacity: 0.2 + r(6) * 0.35,
        };
    }), [seed]);

    return (
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {motes.map((m, i) => (
                <span
                    key={i}
                    className="lp-float absolute rounded-full"
                    style={{
                        left: m.left,
                        top: m.top,
                        width: m.size,
                        height: m.size,
                        background: tint,
                        opacity: m.opacity,
                        animationDelay: m.delay,
                        animationDuration: m.duration,
                    }}
                />
            ))}
        </div>
    );
};

/** Celebration burst — same particle pattern as the Premium hub unlock. */
const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 76 + (i % 5) * 18;
    return {
        dx: `${Math.round(Math.cos(angle) * dist)}px`,
        dy: `${Math.round(Math.sin(angle) * dist * 0.85)}px`,
        delay: `${(i % 6) * 0.035}s`,
    };
});

const OutroBurst: React.FC = () => (
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

/** Answer bubble for the daily-ritual slide — mirrors DailyQuestion's
    AnswerBubble, retoned for the dark film palette. */
const RitualAnswer: React.FC<{ label: string; answer: string; accent: string; soft: string; isMe: boolean }> = ({ label, answer, accent, soft, isMe }) => (
    <div
        className="rounded-2xl px-4 py-3"
        style={{
            background: isMe ? soft : 'rgba(255,255,255,0.05)',
            border: isMe ? `1px solid ${accent}33` : '1px solid rgba(255,255,255,0.08)',
        }}
    >
        <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] mb-1.5" style={{ color: isMe ? `${accent}e6` : GOLD.textLow }}>
            {label}
        </p>
        <p className="font-serif text-[13.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
            {answer || '—'}
        </p>
    </div>
);

const SceneTag: React.FC<{ index: number; label: string; accent: string }> = ({ index, label, accent }) => (
    <motion.p
        variants={goldRise}
        className="text-[10px] font-bold uppercase tracking-[0.3em]"
        style={{ color: `${accent}d9` }}
    >
        Scene {String(index + 1).padStart(2, '0')} · {label}
    </motion.p>
);

/** Decorative still-waveform for the voices chapter. */
const WAVE_HEIGHTS = [10, 22, 14, 30, 18, 36, 24, 12, 28, 16, 34, 20, 26, 13, 31, 17];

const VoiceWave: React.FC<{ accent: string }> = ({ accent }) => (
    <motion.div variants={goldRise} className="flex items-end gap-[4px] h-10 mb-6" aria-hidden="true">
        {WAVE_HEIGHTS.map((h, i) => (
            <span
                key={i}
                className="lp-float rounded-full"
                style={{
                    width: 3,
                    height: h,
                    background: accent,
                    opacity: 0.6,
                    animationDelay: `${(i * 0.13).toFixed(2)}s`,
                    animationDuration: `${(3 + (i % 4) * 0.6).toFixed(1)}s`,
                }}
            />
        ))}
    </motion.div>
);

const stopPress = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
};

/* ── Per-kind slide layouts (varied alignment, scale & rhythm) ──────── */

interface SlideProps {
    chapter: PlayableChapter;
    index: number;
    accent: string;
    soft: string;
    onUnlock: () => void;
    onCloseRequest: () => void;
    onOutroSeen: () => void;
}

const SlideContent: React.FC<SlideProps> = ({ chapter, index, accent, soft, onUnlock, onCloseRequest, onOutroSeen }) => {
    const eyebrowStyle: React.CSSProperties = { color: `${accent}d9` };
    const footStyle: React.CSSProperties = { color: GOLD.textLow };

    switch (chapter.kind) {
        case 'title':
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <motion.p variants={goldRise} className="text-[10px] font-bold uppercase tracking-[0.42em]" style={eyebrowStyle}>
                        A Lior Original
                    </motion.p>
                    <motion.h2 variants={goldRise} className="font-serif text-[2.6rem] leading-[1.06] mt-7" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        {chapter.myName}
                    </motion.h2>
                    <motion.span variants={goldRise} className="font-serif italic text-[1.5rem] leading-none my-1.5" style={{ color: accent }}>
                        &
                    </motion.span>
                    <motion.h2 variants={goldRise} className="font-serif text-[2.6rem] leading-[1.06]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        {chapter.partnerName}
                    </motion.h2>
                    <motion.p variants={goldRise} className="mt-7 text-[13.5px]" style={{ color: GOLD.textMid }}>
                        {chapter.days > 0
                            ? <><CountUp value={chapter.days} className="font-semibold" style={{ color: GOLD.textHigh }} /> days in the making</>
                            : 'A story just beginning'}
                    </motion.p>
                    <motion.p variants={goldRise} className="mt-12 text-[9.5px] font-bold uppercase tracking-[0.34em]" style={footStyle}>
                        Now showing
                    </motion.p>
                </div>
            );

        case 'began':
            return (
                <div className="flex-1 flex flex-col justify-end items-start text-left pb-6">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.h2 variants={goldRise} className="font-serif text-[2.3rem] leading-[1.12] mt-4" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        {chapter.dateLabel}
                    </motion.h2>
                    <motion.p variants={goldRise} className="mt-4 max-w-[30ch] text-[14px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        A square on a calendar that had no idea what it was about to become.
                    </motion.p>
                    {chapter.days > 0 && (
                        <motion.p variants={goldRise} className="mt-6 text-[13px]" style={footStyle}>
                            <CountUp value={chapter.days} className="font-serif text-[1.5rem] align-middle mr-2" style={{ color: accent }} />
                            days ago — and counting.
                        </motion.p>
                    )}
                </div>
            );

        case 'first-memory':
            return (
                <div className="flex-1 flex flex-col justify-end items-start text-left pb-6">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.blockquote variants={goldRise} className="font-serif italic text-[1.55rem] leading-[1.3] mt-5" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                        “{chapter.excerpt}”
                    </motion.blockquote>
                    {chapter.dateLabel && (
                        <motion.p variants={goldRise} className="mt-5 text-[12px] font-semibold" style={{ color: `${accent}cc` }}>
                            {chapter.dateLabel}
                        </motion.p>
                    )}
                    <motion.p variants={goldRise} className="mt-2 text-[12px]" style={footStyle}>
                        The first thing you decided to keep.
                    </motion.p>
                </div>
            );

        case 'numbers':
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.h2 variants={goldRise} className="font-serif text-[1.8rem] leading-tight mt-4 mb-8" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        What you&rsquo;ve kept
                    </motion.h2>
                    <div className="grid grid-cols-2 gap-x-10 gap-y-8 w-full max-w-[300px]">
                        {chapter.stats.map((stat) => (
                            <motion.div key={stat.label} variants={goldRise}>
                                <CountUp value={stat.value} className="block font-serif text-[2.3rem] leading-none" style={{ color: accent }} />
                                <span className="mt-2 block text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD.textLow }}>
                                    {stat.label}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                    <motion.p variants={goldRise} className="mt-10 text-[12px]" style={footStyle}>
                        Counted today. Still counting.
                    </motion.p>
                </div>
            );

        case 'mood-weather':
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.div variants={goldRise} className="flex items-center gap-4 mt-7" aria-hidden="true">
                        {chapter.tops.map((t, i) => (
                            <span
                                key={t.name}
                                className="lp-float text-[2.1rem] leading-none"
                                style={{ animationDelay: `${i * 0.5}s`, animationDuration: `${4.6 + i * 0.7}s` }}
                            >
                                {t.emoji}
                            </span>
                        ))}
                    </motion.div>
                    <motion.h2 variants={goldRise} className="font-serif text-[1.7rem] leading-[1.25] mt-6 max-w-[22ch]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        {chapter.report}
                    </motion.h2>
                    <motion.div variants={goldRise} className="flex flex-wrap items-center justify-center gap-2 mt-7">
                        {chapter.tops.map((t) => (
                            <span
                                key={t.name}
                                className="px-3 py-1.5 rounded-full text-[10.5px] font-semibold capitalize"
                                style={{ background: soft, border: `1px solid ${accent}38`, color: GOLD.textHigh }}
                            >
                                {t.name} × {t.count}
                            </span>
                        ))}
                    </motion.div>
                    <motion.p variants={goldRise} className="mt-8 text-[12px]" style={footStyle}>
                        Your forecast, logged one mood at a time.
                    </motion.p>
                </div>
            );

        case 'streak':
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.div variants={goldRise} className="mt-7">
                        <Flame size={30} strokeWidth={1.6} style={{ color: accent }} />
                    </motion.div>
                    <motion.div variants={goldRise} className="mt-3">
                        <CountUp value={chapter.best} className="font-serif text-[4.6rem] leading-none" style={{ color: GOLD.textHigh, letterSpacing: '-0.03em' }} />
                    </motion.div>
                    <motion.p variants={goldRise} className="mt-3 text-[14px]" style={{ color: GOLD.textMid }}>
                        days in a row, both of you showing up.
                    </motion.p>
                    <motion.p variants={goldRise} className="mt-6 max-w-[26ch] text-[12px] leading-relaxed" style={footStyle}>
                        {chapter.current >= 2
                            ? `Your longest fire — and the current one is ${chapter.current} days and burning.`
                            : 'Your longest fire, lit one check-in at a time.'}
                    </motion.p>
                </div>
            );

        case 'voices':
            return (
                <div className="flex-1 flex flex-col justify-end items-start text-left pb-6">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <div className="mt-6" />
                    <VoiceWave accent={accent} />
                    <motion.div variants={goldRise}>
                        {chapter.minutes >= 1 ? (
                            <>
                                <CountUp value={chapter.minutes} className="font-serif text-[3.4rem] leading-none" style={{ color: GOLD.textHigh, letterSpacing: '-0.03em' }} />
                                <p className="mt-2 text-[14px]" style={{ color: GOLD.textMid }}>
                                    minutes of you two, out loud.
                                </p>
                            </>
                        ) : (
                            <>
                                <CountUp value={chapter.count} className="font-serif text-[3.4rem] leading-none" style={{ color: GOLD.textHigh, letterSpacing: '-0.03em' }} />
                                <p className="mt-2 text-[14px]" style={{ color: GOLD.textMid }}>
                                    voice notes, kept like letters.
                                </p>
                            </>
                        )}
                    </motion.div>
                    <motion.p variants={goldRise} className="mt-5 text-[12px]" style={footStyle}>
                        {chapter.count === 1
                            ? 'One recording — saying what text never could.'
                            : `${chapter.count} recordings — saying what text never could.`}
                    </motion.p>
                </div>
            );

        case 'line':
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <motion.span variants={goldRise} className="font-serif text-[4rem] leading-[0.5] mb-6" style={{ color: accent }} aria-hidden="true">
                        “
                    </motion.span>
                    <motion.blockquote variants={goldRise} className="font-serif italic text-[1.45rem] leading-[1.35] max-w-[26ch]" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                        {chapter.excerpt}
                    </motion.blockquote>
                    {chapter.dateLabel && (
                        <motion.p variants={goldRise} className="mt-6 text-[11.5px] font-semibold" style={{ color: `${accent}cc` }}>
                            {chapter.dateLabel}
                        </motion.p>
                    )}
                    <motion.p variants={goldRise} className="mt-2 text-[12px]" style={footStyle}>
                        Worth keeping. So you did.
                    </motion.p>
                </div>
            );

        case 'dates':
            return (
                <div className="flex-1 flex flex-col items-end justify-center text-right">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.div variants={goldRise} className="mt-6">
                        <CountUp value={chapter.count} className="font-serif text-[3.6rem] leading-none" style={{ color: GOLD.textHigh, letterSpacing: '-0.03em' }} />
                    </motion.div>
                    <motion.p variants={goldRise} className="mt-2 text-[14px]" style={{ color: GOLD.textMid }}>
                        {chapter.count === 1 ? 'day you keep circled.' : 'days you keep circled.'}
                    </motion.p>
                    <motion.div variants={goldRise} className="mt-8 px-4 py-3.5 rounded-2xl text-right" style={{ background: soft, border: `1px solid ${accent}30` }}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em]" style={eyebrowStyle}>Next up</p>
                        <p className="mt-1.5 font-serif text-[1.15rem] leading-tight" style={{ color: GOLD.textHigh }}>{chapter.nextTitle}</p>
                        <p className="mt-1 text-[11.5px]" style={{ color: GOLD.textMid }}>
                            {chapter.nextLabel}
                            {chapter.daysUntil === 0 ? ' · today' : chapter.daysUntil === 1 ? ' · tomorrow' : ` · in ${chapter.daysUntil} days`}
                        </p>
                    </motion.div>
                    <motion.p variants={goldRise} className="mt-7 text-[12px]" style={footStyle}>
                        Some days get circled before they arrive.
                    </motion.p>
                </div>
            );

        case 'latest':
            return (
                <div className="flex-1 flex flex-col justify-end items-start text-left pb-6">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.blockquote variants={goldRise} className="font-serif italic text-[1.5rem] leading-[1.32] mt-5" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                        “{chapter.excerpt}”
                    </motion.blockquote>
                    <motion.p variants={goldRise} className="mt-5 text-[12px] font-semibold" style={{ color: `${accent}cc` }}>
                        {chapter.daysAgo === 0 ? 'Written today' : chapter.daysAgo === 1 ? 'Written yesterday' : `Written ${chapter.daysAgo} days ago`}
                    </motion.p>
                    <motion.p variants={goldRise} className="mt-2 text-[12px]" style={footStyle}>
                        The most recent page. For now.
                    </motion.p>
                </div>
            );

        case 'daily-ritual': {
            const revealedLabel = chapter.daysAgo === 0
                ? 'Revealed today'
                : chapter.daysAgo === 1
                    ? 'Revealed yesterday'
                    : `Revealed ${chapter.daysAgo} days ago`;
            return (
                <div className="flex-1 flex flex-col justify-end items-start text-left pb-6">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.p variants={goldRise} className="font-serif italic text-[1.5rem] leading-[1.3] mt-5" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                        {chapter.question}
                    </motion.p>
                    <motion.div variants={goldRise} className="mt-6 w-full space-y-2.5">
                        <RitualAnswer label="You" answer={chapter.myAnswer} accent={accent} soft={soft} isMe />
                        <RitualAnswer label="Them" answer={chapter.partnerAnswer} accent={accent} soft={soft} isMe={false} />
                    </motion.div>
                    <motion.p variants={goldRise} className="mt-5 text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: `${accent}b3` }}>
                        {revealedLabel}
                    </motion.p>
                </div>
            );
        }

        case 'tonight':
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <SceneTag index={index} label={chapter.slate} accent={accent} />
                    <motion.h2 variants={goldRise} className="font-serif text-[2rem] leading-[1.18] mt-6 max-w-[16ch]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        Tonight would make a good scene.
                    </motion.h2>
                    <motion.p variants={goldRise} className="mt-5 max-w-[26ch] text-[13px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        Add one memory after the credits — this film only gets longer.
                    </motion.p>
                </div>
            );

        case 'outro':
            return <OutroSlide chapter={chapter} accent={accent} onOutroSeen={onOutroSeen} />;

        case 'gate':
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <motion.div
                        variants={goldRise}
                        className="flex w-14 h-14 items-center justify-center rounded-2xl mb-6"
                        style={{ background: 'rgba(246,199,104,0.15)', border: '1px solid rgba(246,199,104,0.4)' }}
                    >
                        <Crown size={26} strokeWidth={1.7} style={{ color: GOLD.primary }} />
                    </motion.div>
                    <motion.h2 variants={goldRise} className="font-serif text-[1.9rem] leading-[1.18] max-w-[15ch]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        The rest of your story is waiting
                    </motion.h2>
                    <motion.p variants={goldRise} className="mt-4 max-w-[27ch] text-[13px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        {chapter.remaining === 1
                            ? 'One more scene, already cut from your real life.'
                            : `${chapter.remaining} more scenes, already cut from your real life.`}
                    </motion.p>
                    <motion.div variants={goldRise} className="mt-8 w-full max-w-[280px]">
                        <motion.button
                            {...stopPress}
                            whileTap={{ scale: 0.96 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={() => { feedback.tap(); onUnlock(); }}
                            className="lp-cta w-full h-[50px] rounded-2xl font-bold text-[14px] inline-flex items-center justify-center gap-2"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                color: GOLD.inkOnGold,
                                boxShadow: '0 12px 32px rgba(246,199,104,0.26), inset 0 1px 0 rgba(255,246,222,0.45)',
                            }}
                        >
                            <Lock size={14} strokeWidth={2.4} />
                            Unlock Lior Gold
                        </motion.button>
                        <button
                            {...stopPress}
                            onClick={() => { feedback.tap(); onCloseRequest(); }}
                            className="mt-2 w-full py-3 text-[12.5px] font-medium active:scale-95 transition-transform"
                            style={{ color: GOLD.textLow }}
                        >
                            Not tonight
                        </button>
                    </motion.div>
                </div>
            );

        default:
            return null;
    }
};

const OutroSlide: React.FC<{ chapter: Extract<PlayableChapter, { kind: 'outro' }>; accent: string; onOutroSeen: () => void }> = ({ chapter, accent, onOutroSeen }) => {
    useEffect(() => {
        onOutroSeen();
        // Celebrate once per premiere — guarded by the player's ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="relative flex-1 flex flex-col items-center justify-center text-center">
            <OutroBurst />
            <motion.h2 variants={goldRise} className="font-serif text-[2.2rem] leading-[1.16] max-w-[14ch]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                …and you&rsquo;re still writing it.
            </motion.h2>
            <motion.div variants={goldRise} className="mt-8 flex items-center gap-2.5">
                <span className="h-px w-8" style={{ background: `${accent}55` }} />
                <Heart size={12} style={{ color: accent }} fill="currentColor" strokeWidth={0} />
                <span className="h-px w-8" style={{ background: `${accent}55` }} />
            </motion.div>
            <motion.p variants={goldRise} className="mt-4 text-[13px] font-medium" style={{ color: GOLD.textMid }}>
                {chapter.myName} &amp; {chapter.partnerName}
            </motion.p>
            <motion.p variants={goldRise} className="mt-12 text-[9.5px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.textLow }}>
                Lior Gold · Made from real life
            </motion.p>
        </div>
    );
};

/* ── The player ─────────────────────────────────────────────────────── */

export const StoryPlayer: React.FC<StoryPlayerProps> = ({ open, film, isPremium, onClose, onUnlock }) => {
    const reduced = useReducedMotion();
    const [index, setIndex] = useState(0);
    const progressMv = useMotionValue(0);
    const pausedRef = useRef(false);
    const pressRef = useRef<{ t: number; x: number } | null>(null);
    const celebratedRef = useRef(false);

    const playerChapters = useMemo<PlayableChapter[]>(() => {
        if (isPremium || film.chapters.length <= FREE_CHAPTER_LIMIT) return film.chapters;
        const gate: GateChapter = {
            id: 'ch-gate',
            kind: 'gate',
            slate: 'Lior Gold',
            remaining: film.chapters.length - FREE_CHAPTER_LIMIT,
        };
        return [...film.chapters.slice(0, FREE_CHAPTER_LIMIT), gate];
    }, [film, isPremium]);

    const chapter = playerChapters[Math.min(index, playerChapters.length - 1)];
    const palette = PALETTES[PALETTE_FOR[chapter?.kind ?? 'title']];
    const isLast = index >= playerChapters.length - 1;

    /* Rewind to the start whenever the player closes (invisible reset). */
    useEffect(() => {
        if (!open) {
            setIndex(0);
            pausedRef.current = false;
            pressRef.current = null;
            celebratedRef.current = false;
        }
    }, [open]);

    /* Hardware back closes the premiere while open. */
    useEffect(() => {
        if (!open) return;
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [open, onClose]);

    /* Auto-advance: a single rAF loop drives the active bar via a motion
       value (no per-frame React renders). Holding pauses; reduced motion
       disables auto-advance entirely (manual taps only). */
    useEffect(() => {
        if (!open) return;
        if (reduced) {
            progressMv.set(1);
            return;
        }
        progressMv.set(0);
        let raf = 0;
        let last = performance.now();
        let elapsed = 0;
        const tick = (now: number) => {
            const dt = Math.min(64, now - last);
            last = now;
            if (!pausedRef.current) {
                elapsed += dt;
                const p = Math.min(1, elapsed / CHAPTER_MS);
                progressMv.set(p);
                if (p >= 1) {
                    // Final chapter (outro or gate) holds on screen.
                    if (index < playerChapters.length - 1) {
                        setIndex((i) => Math.min(i + 1, playerChapters.length - 1));
                    }
                    return;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [open, index, reduced, playerChapters, progressMv]);

    const goNext = useCallback(() => {
        if (!chapter) return;
        if (chapter.kind === 'gate') return; // unlock CTA is the only way forward
        feedback.tap();
        if (isLast) {
            onClose();
            return;
        }
        setIndex((i) => Math.min(i + 1, playerChapters.length - 1));
    }, [chapter, isLast, onClose, playerChapters.length]);

    const goPrev = useCallback(() => {
        if (index === 0) return;
        feedback.tap();
        setIndex((i) => Math.max(0, i - 1));
    }, [index]);

    /* Press-and-hold pauses; a short tap navigates by screen third. */
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        pressRef.current = { t: performance.now(), x: e.clientX };
        pausedRef.current = true;
    }, []);

    const handlePointerUp = useCallback(() => {
        const press = pressRef.current;
        pressRef.current = null;
        pausedRef.current = false;
        if (!press) return;
        if (performance.now() - press.t < 260) {
            const w = window.innerWidth || 1;
            if (press.x < w / 3) goPrev();
            else if (press.x > (2 * w) / 3) goNext();
        }
    }, [goNext, goPrev]);

    const handlePointerCancel = useCallback(() => {
        pressRef.current = null;
        pausedRef.current = false;
    }, []);

    const handleOutroSeen = useCallback(() => {
        if (celebratedRef.current) return;
        celebratedRef.current = true;
        feedback.celebrate();
    }, []);

    const handleClose = useCallback(() => {
        feedback.tap();
        onClose();
    }, [onClose]);

    // Portal OUTSIDE AnimatePresence — React 19 portals are not valid
    // elements, so AnimatePresence would silently drop a portal child.
    return ReactDOM.createPortal(
        <AnimatePresence>
            {open && chapter && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.24 } }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Our Story premiere"
                    className="fixed inset-0 z-[190] overflow-hidden"
                    style={{ background: '#0b060d', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onPointerLeave={handlePointerCancel}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {/* Palette cross-dissolve (film style) */}
                    <AnimatePresence initial={false}>
                        <motion.div
                            key={chapter.id}
                            className="absolute inset-0"
                            style={{ background: palette.bg }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45, ease: 'easeOut' }}
                        />
                    </AnimatePresence>
                    <div className="lp-grain" />

                    {/* Slide content */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={chapter.id}
                            variants={goldStagger}
                            initial="hidden"
                            animate="visible"
                            exit={{ opacity: 0, transition: { duration: 0.16 } }}
                            className="absolute inset-0 z-10 flex flex-col px-8 mx-auto w-full max-w-[480px]"
                            style={{
                                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 92px)',
                                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
                            }}
                        >
                            <Dust seed={index + 1} tint={palette.accent} />
                            <SlideContent
                                chapter={chapter}
                                index={index}
                                accent={palette.accent}
                                soft={palette.soft}
                                onUnlock={onUnlock}
                                onCloseRequest={onClose}
                                onOutroSeen={handleOutroSeen}
                            />
                        </motion.div>
                    </AnimatePresence>

                    {/* Segmented progress + header chrome */}
                    <div
                        className="absolute top-0 left-0 right-0 z-30 px-3"
                        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
                    >
                        <div className="flex gap-1">
                            {playerChapters.map((c, i) => (
                                <div
                                    key={c.id}
                                    className="flex-1 h-[3px] rounded-full overflow-hidden"
                                    style={{ background: 'rgba(255,255,255,0.16)' }}
                                >
                                    {i < index && (
                                        <div className="h-full w-full rounded-full" style={{ background: 'rgba(255,250,242,0.92)' }} />
                                    )}
                                    {i === index && (
                                        <motion.div
                                            className="h-full w-full rounded-full"
                                            style={{ scaleX: progressMv, transformOrigin: '0% 50%', background: 'rgba(255,250,242,0.92)' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 px-2 flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-[0.34em]" style={{ color: 'rgba(255,246,230,0.4)' }}>
                                Our Story
                            </span>
                            <motion.button
                                {...stopPress}
                                whileTap={{ scale: 0.86 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={handleClose}
                                aria-label="Close the premiere"
                                className="lp-glass w-9 h-9 rounded-full flex items-center justify-center"
                                style={{ color: 'rgba(255,246,230,0.85)' }}
                            >
                                <X size={15} strokeWidth={2.4} />
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

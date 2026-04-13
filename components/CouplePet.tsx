import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Memory, Note, UserStatus, PetStats } from '../types';
import { StorageService } from '../services/storage';
import { syncEventTarget, SyncService } from '../services/sync';
import { PetAIService } from '../services/pet';
import {
    Utensils, Settings, X, Sparkles, Store, Heart, Moon,
    ChevronLeft, Zap, RefreshCw, Clock3,
} from 'lucide-react';
import { PetShop } from './PetShop';
import { PetCharacter, PetMood, PetType } from './PetCharacter';
import { feedback } from '../utils/feedback';
import { motion, AnimatePresence, useAnimation, useReducedMotion } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                         */
/* ═══════════════════════════════════════════════════════════════ */
interface CouplePetProps {
    memories: Memory[];
    notes: Note[];
    status: UserStatus;
    partnerName: string;
    onClose?: () => void;
}

const PET_TYPES = [
    { id: 'bear',  emoji: '🔥', label: 'Ember'     },
    { id: 'dog',   emoji: '💨', label: 'Breeze'    },
    { id: 'cat',   emoji: '🌙', label: 'Moonlight' },
    { id: 'bunny', emoji: '🌸', label: 'Blossom'   },
];

/* ═══════════════════════════════════════════════════════════════ */
/*  SCENE THEMES — atmospheric palettes per environment           */
/* ═══════════════════════════════════════════════════════════════ */
const SCENE_THEMES = {
    default: {
        isDark: false,
        bg: 'linear-gradient(168deg, #FDF2F5 0%, #F8E7EC 40%, #FCEEF2 100%)',
        auroraA: '#F9A8D4', auroraB: '#FBCDD5', auroraC: '#FFE4EA',
        pedestalGlow: 'rgba(249,168,212,0.22)',
        groundBg: 'linear-gradient(180deg, transparent 0%, rgba(253,242,245,0.3) 40%, rgba(248,231,236,0.7) 100%)',
        accent: '#ec4899', accentSoft: 'rgba(236,72,153,0.12)',
        particleColors: ['#FBCDD5', '#F9A8D4', '#FFE4EA', '#FDF2F5', '#fda4af'],
        glowColor: 'rgba(249,168,212,0.14)',
        textPrimary: '#2D1F25', textSecondary: '#9B7B84',
        trayBg: 'rgba(255,255,255,0.82)', trayBorder: 'rgba(232,160,176,0.18)',
        fadeTo: 'rgba(253,252,251,0.6)',
    },
    env_space: {
        isDark: false,
        bg: 'linear-gradient(168deg, #F0F0FF 0%, #E8E8F8 40%, #F4F2FF 100%)',
        auroraA: '#C4B5FF', auroraB: '#A5B4FC', auroraC: '#E0E7FF',
        pedestalGlow: 'rgba(165,180,252,0.22)',
        groundBg: 'linear-gradient(180deg, transparent 0%, rgba(240,240,255,0.3) 40%, rgba(232,232,248,0.7) 100%)',
        accent: '#7C3AED', accentSoft: 'rgba(124,58,237,0.12)',
        particleColors: ['#E0E7FF', '#C4B5FF', '#A5B4FC', '#DDD6FE', '#C7D2FE'],
        glowColor: 'rgba(165,180,252,0.14)',
        textPrimary: '#1E1B3A', textSecondary: '#7C7996',
        trayBg: 'rgba(255,255,255,0.82)', trayBorder: 'rgba(165,180,252,0.2)',
        fadeTo: 'rgba(244,242,255,0.6)',
    },
    env_beach: {
        isDark: false,
        bg: 'linear-gradient(168deg, #FFF8ED 0%, #FEF3E2 40%, #FFFAF0 100%)',
        auroraA: '#FCD34D', auroraB: '#93C5FD', auroraC: '#FDE68A',
        pedestalGlow: 'rgba(252,211,77,0.2)',
        groundBg: 'linear-gradient(180deg, transparent 0%, rgba(255,248,237,0.3) 40%, rgba(254,243,226,0.7) 100%)',
        accent: '#D97706', accentSoft: 'rgba(217,119,6,0.12)',
        particleColors: ['#FDE68A', '#FCD34D', '#93C5FD', '#BAE6FD', '#FEF3C7'],
        glowColor: 'rgba(252,211,77,0.14)',
        textPrimary: '#292524', textSecondary: '#92815A',
        trayBg: 'rgba(255,255,255,0.82)', trayBorder: 'rgba(252,211,77,0.2)',
        fadeTo: 'rgba(255,250,240,0.6)',
    },
    env_forest: {
        isDark: false,
        bg: 'linear-gradient(168deg, #ECFDF5 0%, #D1FAE5 40%, #F0FDF4 100%)',
        auroraA: '#6EE7B7', auroraB: '#34D399', auroraC: '#A7F3D0',
        pedestalGlow: 'rgba(52,211,153,0.2)',
        groundBg: 'linear-gradient(180deg, transparent 0%, rgba(236,253,245,0.3) 40%, rgba(209,250,229,0.7) 100%)',
        accent: '#059669', accentSoft: 'rgba(5,150,105,0.12)',
        particleColors: ['#A7F3D0', '#6EE7B7', '#34D399', '#D1FAE5', '#ECFDF5'],
        glowColor: 'rgba(110,231,183,0.14)',
        textPrimary: '#064E3B', textSecondary: '#6B917E',
        trayBg: 'rgba(255,255,255,0.82)', trayBorder: 'rgba(110,231,183,0.2)',
        fadeTo: 'rgba(240,253,244,0.6)',
    },
};

type SceneTheme = (typeof SCENE_THEMES)['default'];

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS                                                         */
/* ═══════════════════════════════════════════════════════════════ */
const useTypewriter = (text: string, speed = 22) => {
    const [displayed, setDisplayed] = useState('');
    const prevRef = useRef('');
    useEffect(() => {
        if (text === prevRef.current) return;
        prevRef.current = text;
        setDisplayed('');
        if (!text) return;
        let i = 0;
        const timer = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) clearInterval(timer);
        }, speed);
        return () => clearInterval(timer);
    }, [text, speed]);
    return displayed;
};

/* ═══════════════════════════════════════════════════════════════ */
/*  FLOATING ORBS — layered ambient particle system               */
/* ═══════════════════════════════════════════════════════════════ */
const FloatingOrbs = React.memo(({ theme, sleeping, reduceMotion }: { theme: SceneTheme; sleeping?: boolean; reduceMotion?: boolean }) => {
    if (reduceMotion) return null;

    const orbs = useMemo(() => Array.from({ length: 22 }, (_, i) => {
        const isLarge = i < 4;
        const isMedium = i >= 4 && i < 10;
        return {
            id: i,
            x: 2 + Math.random() * 96,
            y: 2 + Math.random() * 90,
            size: isLarge ? 14 + Math.random() * 20 : isMedium ? 5 + Math.random() * 8 : 2 + Math.random() * 4,
            dur: isLarge ? 14 + Math.random() * 10 : isMedium ? 8 + Math.random() * 7 : 5 + Math.random() * 6,
            delay: Math.random() * 8,
            color: theme.particleColors[i % theme.particleColors.length],
            blur: isLarge ? 12 : isMedium ? 4 : 1,
            opacityMax: sleeping ? 0.12 : isLarge ? 0.18 : isMedium ? 0.5 : 0.75,
            driftX: (Math.random() - 0.5) * (isLarge ? 40 : 16),
            driftY: isLarge ? -20 - Math.random() * 30 : -10 - Math.random() * 20,
            diamond: !isLarge && Math.random() > 0.6,
        };
    }), [theme.particleColors, sleeping]);

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
            {orbs.map(o => (
                <motion.div
                    key={o.id}
                    className="absolute"
                    style={{
                        left: `${o.x}%`, top: `${o.y}%`,
                        width: o.size, height: o.size,
                        borderRadius: o.diamond ? '2px' : '50%',
                        background: o.color,
                        filter: `blur(${o.blur}px)`,
                        rotate: o.diamond ? 45 : 0,
                    }}
                    animate={{
                        opacity: [0, o.opacityMax, o.opacityMax * 0.5, o.opacityMax, 0],
                        y: [0, o.driftY * 0.3, o.driftY * 0.6, o.driftY],
                        x: [0, o.driftX * 0.3, o.driftX * 0.7, o.driftX],
                        scale: [0.4, 1.1, 0.9, 1.2, 0.3],
                    }}
                    transition={{ duration: o.dur, delay: o.delay, repeat: Infinity, ease: 'easeInOut' }}
                />
            ))}
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════ */
/*  ENVIRONMENT DECORATIONS                                       */
/* ═══════════════════════════════════════════════════════════════ */
const EnvDecorations = React.memo(({ envKey, reduceMotion }: { envKey: string; reduceMotion?: boolean }) => {
    if (reduceMotion) return null;

    const stars = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
        id: i, x: Math.random() * 100, y: Math.random() * 75,
        size: 0.8 + Math.random() * 2.5, dur: 1.5 + Math.random() * 3.5, delay: Math.random() * 6,
    })), []);
    const spores = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
        id: i, x: 6 + Math.random() * 88, dur: 7 + Math.random() * 7, delay: Math.random() * 8,
        sway: (Math.random() - 0.5) * 40,
    })), []);
    const sparks = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
        id: i, x: 8 + Math.random() * 84, dur: 6 + Math.random() * 7, delay: Math.random() * 8,
        drift: (Math.random() - 0.5) * 28,
    })), []);

    if (envKey === 'env_space' || envKey === 'default') return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
            {stars.map(s => (
                <motion.div key={s.id} className="absolute rounded-full"
                    style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, background: '#F9A8D4' }}
                    animate={{ opacity: [0.08, 0.4, 0.08], scale: [0.6, 1.4, 0.6] }}
                    transition={{ duration: s.dur, delay: s.delay, repeat: Infinity }}
                />
            ))}
        </div>
    );

    if (envKey === 'env_beach') return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
            {sparks.map(spark => (
                <motion.div
                    key={spark.id}
                    className="absolute rounded-full"
                    style={{
                        left: `${spark.x}%`,
                        bottom: '16%',
                        width: 3,
                        height: 3,
                        background: '#FCD34D',
                        boxShadow: '0 0 14px rgba(252,211,77,0.4)',
                    }}
                    animate={{
                        y: [0, -120],
                        x: [0, spark.drift],
                        opacity: [0, 0.8, 0],
                        scale: [0.8, 1.2, 0.5],
                    }}
                    transition={{ duration: spark.dur, delay: spark.delay, repeat: Infinity, ease: 'easeOut' }}
                />
            ))}
        </div>
    );

    if (envKey === 'env_forest') return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
            {spores.map(spore => (
                <motion.div key={spore.id} className="absolute rounded-full"
                    style={{ left: `${spore.x}%`, bottom: '12%', width: 5, height: 5, opacity: 0, background: '#34D399', boxShadow: '0 0 16px rgba(52,211,153,0.3)' }}
                    animate={{ y: [0, -180], opacity: [0, 0.35, 0], x: [0, spore.sway, spore.sway * 0.4], scale: [0.7, 1.2, 0.5] }}
                    transition={{ duration: spore.dur, delay: spore.delay, repeat: Infinity, ease: 'easeOut' }}
                />
            ))}
        </div>
    );

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
            {stars.map(s => (
                <motion.div key={s.id} className="absolute rounded-full"
                    style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size + 0.4, height: s.size + 0.4, background: '#FBCDD5' }}
                    animate={{ opacity: [0.06, 0.3, 0.06], scale: [0.8, 1.25, 0.8] }}
                    transition={{ duration: s.dur + 1, delay: s.delay, repeat: Infinity }}
                />
            ))}
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════ */
/*  LEVEL-UP CELEBRATION                                          */
/* ═══════════════════════════════════════════════════════════════ */
const LevelUpCelebration = ({ level, accent, onDone }: { level: number; accent: string; onDone: () => void }) => {
    const pieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 350,
        y: -(80 + Math.random() * 200),
        rot: (Math.random() - 0.5) * 500,
        size: 4 + Math.random() * 10,
        color: ['#F9A8D4', '#FCD34D', '#6EE7B7', '#C4B5FF', '#FBCDD5', accent][i % 6],
        delay: Math.random() * 0.4,
        diamond: Math.random() > 0.5,
    })), [accent]);

    useEffect(() => {
        const t = setTimeout(onDone, 3500);
        return () => clearTimeout(t);
    }, [onDone]);

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
        >
            {/* Full-screen flash */}
            <motion.div className="absolute inset-0"
                initial={{ opacity: 0.6 }} animate={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                style={{ background: `radial-gradient(circle, ${accent}40 0%, transparent 60%)` }}
            />
            {pieces.map(p => (
                <motion.div key={p.id} className="absolute"
                    style={{
                        width: p.size, height: p.size,
                        borderRadius: p.diamond ? '2px' : '50%',
                        background: p.color, top: '50%', left: '50%',
                        rotate: p.diamond ? 45 : 0,
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                    animate={{ x: p.x, y: p.y, opacity: 0, scale: [0, 1.4, 1], rotate: p.rot }}
                    transition={{ duration: 1.8, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
                />
            ))}
            <motion.div
                initial={{ scale: 0.3, opacity: 0, y: 40 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.3 } }}
                transition={{ type: 'spring', damping: 14, stiffness: 260, delay: 0.12 }}
                className="text-center px-12 py-8 rounded-[2rem]"
                style={{
                    background: 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(32px)',
                    WebkitBackdropFilter: 'blur(32px)',
                    boxShadow: `0 24px 80px rgba(232,160,176,0.18), 0 0 40px ${accent}15`,
                    border: `1px solid rgba(255,255,255,0.9)`,
                }}
            >
                <motion.div className="text-6xl mb-3"
                    animate={{ rotate: [0, -15, 15, -8, 8, 0], scale: [1, 1.3, 1] }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    style={{ filter: `drop-shadow(0 0 18px ${accent}35)` }}
                >✦</motion.div>
                <p className="font-bold text-[11px] uppercase tracking-[0.2em] mb-1" style={{ color: accent }}>Level Up!</p>
                <p className="font-serif font-bold text-5xl" style={{ color: '#2D1F25' }}>Level {level}</p>
                <p className="text-[13px] mt-2 font-medium" style={{ color: '#9B7B84' }}>Your bond grows stronger</p>
            </motion.div>
        </motion.div>,
        document.body
    );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  MICRO-COMPONENTS — effects & indicators                       */
/* ═══════════════════════════════════════════════════════════════ */
const GroundRipple = ({ rippleKey, color }: { rippleKey: number; color: string }) => (
    <AnimatePresence>
        {rippleKey > 0 && (
            <motion.div key={rippleKey} className="absolute pointer-events-none"
                style={{
                    bottom: -4, left: '10%', width: '80%', height: 18,
                    borderRadius: '50%', border: `2px solid ${color}`,
                }}
                initial={{ opacity: 0.7, scaleX: 0.4, scaleY: 0.5 }}
                animate={{ opacity: 0, scaleX: 2.5, scaleY: 2 }}
                exit={{}}
                transition={{ duration: 0.8, ease: 'easeOut' }}
            />
        )}
    </AnimatePresence>
);

const PetFlash = ({ flash, color }: { flash: boolean; color: string }) => (
    <AnimatePresence>
        {flash && (
            <motion.div className="absolute inset-0 pointer-events-none z-50"
                initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} exit={{}}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                style={{ background: `radial-gradient(ellipse at 50% 45%, ${color}35 0%, transparent 60%)` }}
            />
        )}
    </AnimatePresence>
);

const HeartBurst = ({ active, color = '#7ce3ff' }: { active: boolean; color?: string }) => {
    const hearts = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 150,
        yEnd: -(50 + Math.random() * 90),
        size: 10 + Math.random() * 16,
        delay: i * 0.035,
        rotate: (Math.random() - 0.5) * 60,
    })), []);
    return (
        <AnimatePresence>
            {active && hearts.map(h => (
                <motion.div key={h.id}
                    initial={{ opacity: 0.95, y: 0, x: 0, scale: 0, rotate: 0 }}
                    animate={{ opacity: [0.95, 0.85, 0], y: h.yEnd, x: h.x, scale: [0, 1.3, 0.6], rotate: h.rotate }}
                    exit={{}}
                    transition={{ duration: 1.1, delay: h.delay, ease: [0.32, 0.72, 0, 1] }}
                    className="absolute pointer-events-none select-none"
                    style={{ top: '30%', left: '50%', marginTop: -h.size / 2, marginLeft: -h.size / 2 }}
                >
                    <Heart size={h.size} fill={color} stroke="none"
                        style={{ filter: `drop-shadow(0 3px 8px ${color}66)` }} />
                </motion.div>
            ))}
        </AnimatePresence>
    );
};

const CoinFloat = ({ coinFloat }: { coinFloat: { key: number; amount: number } | null }) => (
    <AnimatePresence>
        {coinFloat && (
            <motion.div key={coinFloat.key}
                initial={{ opacity: 1, y: 0, scale: 0.6 }}
                animate={{ opacity: 0, y: -70, scale: 1.2 }}
                exit={{}}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="absolute pointer-events-none select-none z-30 font-black"
                style={{ top: '2%', left: '50%', transform: 'translateX(-50%)', fontSize: 15, color: '#d97706',
                    textShadow: '0 2px 8px rgba(217,119,6,0.3)' }}
            >+{coinFloat.amount} ✦</motion.div>
        )}
    </AnimatePresence>
);

const VitalityPips = ({ happiness, color }: { happiness: number; color: string }) => (
    <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, i) => {
            const filled = i < Math.ceil(happiness / 20);
            return (
                <motion.div
                    key={i}
                    className="rounded-full"
                    style={{
                        width: filled ? 8 : 5,
                        height: filled ? 8 : 5,
                        background: filled ? color : 'rgba(0,0,0,0.07)',
                        boxShadow: filled ? `0 0 8px ${color}aa` : 'none',
                    }}
                    animate={filled ? { scale: [1, 1.25, 1], opacity: [0.75, 1, 0.75] } : {}}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                />
            );
        })}
    </div>
);

const OrbitMeter = ({ size, progress, accent, muted }: { size: number; progress: number; accent: string; muted: string }) => {
    const radius = (size / 2) - 8;
    const circumference = 2 * Math.PI * radius;
    const clampedProgress = Math.max(3, Math.min(progress, 100));
    const gradientId = `orbit-meter-${accent.replace(/[^a-z0-9]/gi, '')}-${size}`;

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="absolute inset-0 pointer-events-none overflow-visible"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
                    <stop offset="60%" stopColor={accent} stopOpacity="1" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.92" />
                </linearGradient>
            </defs>
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={muted}
                strokeWidth="1.25"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={muted}
                strokeWidth="1"
                strokeDasharray="3.5 8.5"
                opacity="0.55"
            />
            <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference - ((clampedProgress / 100) * circumference) }}
                transition={{ type: 'spring', stiffness: 70, damping: 18 }}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ filter: `drop-shadow(0 0 10px ${accent}55)` }}
            />
        </svg>
    );
};

interface ActionOrbProps {
    label: string;
    detail?: string;
    icon: React.ReactNode;
    primary?: boolean;
    compact?: boolean;
    accent: string;
    surfaceStyle: React.CSSProperties;
    textColor: string;
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
    onMouseUp?: React.MouseEventHandler<HTMLButtonElement>;
    onTouchStart?: React.TouchEventHandler<HTMLButtonElement>;
    onTouchEnd?: React.TouchEventHandler<HTMLButtonElement>;
}

const ActionOrb = ({
    label,
    detail,
    icon,
    primary = false,
    compact = false,
    accent,
    surfaceStyle,
    textColor,
    disabled,
    ...props
}: ActionOrbProps) => {
    const buttonSize = primary ? (compact ? 62 : 70) : (compact ? 48 : 54);
    const buttonWidth = primary ? (compact ? 66 : 74) : (compact ? 52 : 58);

    return (
        <motion.button
            type="button"
            disabled={disabled}
            aria-label={detail ? `${label}. ${detail}` : label}
            className="relative flex min-w-0 flex-col items-center gap-1"
            style={{
                opacity: disabled ? 0.34 : 1,
                width: buttonWidth,
                flexShrink: 0,
            }}
            whileTap={{ scale: 0.86 }}
            {...props}
        >
            <div className="relative">
                <motion.div
                    className="flex items-center justify-center rounded-full"
                    style={primary ? {
                        width: buttonSize,
                        height: buttonSize,
                        background: `linear-gradient(155deg, ${accent}, ${accent}cc)`,
                        border: `1.5px solid ${accent}70`,
                        boxShadow: `0 12px 28px ${accent}45, 0 0 0 1px ${accent}25`,
                    } : {
                        ...surfaceStyle,
                        width: buttonSize,
                        height: buttonSize,
                        boxShadow: `0 4px 14px rgba(232,160,176,0.10), 0 0 0 1px ${accent}12`,
                    }}
                >
                    {icon}
                </motion.div>
                {primary && !disabled && (
                    <motion.div
                        className="absolute inset-[-5px] rounded-full pointer-events-none"
                        style={{ boxShadow: `0 0 24px ${accent}32` }}
                        animate={{ opacity: [0.24, 0.55, 0.24], scale: [1, 1.08, 1] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                )}
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-center leading-none"
                style={{ color: primary ? accent : textColor, opacity: primary ? 1 : 0.75 }}>
                {label}
            </span>
            {detail && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-center leading-none"
                    style={{ color: textColor, opacity: 0.38 }}>
                    {detail}
                </span>
            )}
        </motion.button>
    );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT — The Sanctuary                                */
/* ═══════════════════════════════════════════════════════════════ */
export const CouplePet: React.FC<CouplePetProps> = ({ memories, notes, status, partnerName, onClose }) => {
    /* ── STATE ─────────────────────────────────────────────────── */
    const [stats, setStats] = useState<PetStats>(StorageService.getPetStats());
    const [action, setAction] = useState<'idle' | 'petting' | 'feeding' | 'nudge'>('idle');
    const [heartBurst, setHeartBurst] = useState(false);
    const [dialogue, setDialogue] = useState('');
    const [isAILoading, setIsAILoading] = useState(false);
    const [isFlashback, setIsFlashback] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showShop, setShowShop] = useState(false);
    const [editName, setEditName] = useState(stats.name);
    const [editType, setEditType] = useState(stats.type);
    const [coinFloat, setCoinFloat] = useState<{ key: number; amount: number } | null>(null);
    const [rippleKey, setRippleKey] = useState(0);
    const [flash, setFlash] = useState(false);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [celebLevel, setCelebLevel] = useState(1);
    const [viewport, setViewport] = useState(() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 390,
        height: typeof window !== 'undefined' ? window.innerHeight : 844,
    }));
    const reduceMotion = useReducedMotion();

    const petControls = useAnimation();
    const lastCoinEarned = useRef(0);
    const nudgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statsRef = useRef(stats);
    const memoriesRef = useRef(memories);
    const notesRef = useRef(notes);
    const aiLoadingRef = useRef(isAILoading);
    const triggerPettingRef = useRef<() => void>(() => undefined);
    const triggerNudgeRef = useRef<() => void>(() => undefined);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevLevelRef = useRef<number | null>(null);
    statsRef.current = stats;
    memoriesRef.current = memories;
    notesRef.current = notes;
    aiLoadingRef.current = isAILoading;

    /* ── DERIVED ───────────────────────────────────────────────── */
    const xp = Math.max(stats.xp, (memories.length * 15) + (notes.length * 8));
    const level = Math.floor(xp / 100) + 1;
    const xpIntoLevel = xp % 100;
    const stage = level > 5 ? 'Guardian' : level > 3 ? 'Adult' : level > 1 ? 'Child' : 'Baby';
    const hoursSinceFed = Math.max(0, (Date.now() - new Date(stats.lastFed).getTime()) / (1000 * 3600));
    const isHungry = hoursSinceFed > 24;
    const isSleeping = status.state === 'sleeping';
    const envKey = (stats.equipped.environment || 'default') as keyof typeof SCENE_THEMES;
    const theme = SCENE_THEMES[envKey] || SCENE_THEMES.default;
    const isDark = theme.isDark;

    const petMood: PetMood = isSleeping ? 'sleeping'
        : (action === 'petting' || action === 'feeding') ? 'excited'
        : isHungry ? 'sad'
        : stats.happiness >= 70 ? 'happy'
        : stats.happiness >= 40 ? 'neutral'
        : 'sad';

    const happinessColor = isHungry
        ? '#f87171'
        : stats.happiness >= 70 ? '#4ade80'
        : stats.happiness >= 40 ? '#fbbf24'
        : '#f87171';

    const textColor = theme.textPrimary;
    const textSec = theme.textSecondary;
    const hoursSincePetted = (Date.now() - new Date(stats.lastPetted || stats.lastFed).getTime()) / (1000 * 3600);
    const isActiveToday = hoursSincePetted < 24;
    const typedDialogue = useTypewriter(dialogue, 20);
    const progressPercent = Math.max(6, xpIntoLevel);
    const bondState = xpIntoLevel >= 80 ? 'Radiant bond' : xpIntoLevel >= 45 ? 'Blooming bond' : 'Awakening bond';
    const worldLabel = envKey === 'env_space'
        ? 'Astral Chamber'
        : envKey === 'env_beach'
        ? 'Tidal Moon Sanctuary'
        : envKey === 'env_forest'
        ? 'Nocturne Grove'
        : 'Moonlit Sanctuary';
    const moodTone = isSleeping
        ? 'Dreaming under the moon'
        : isHungry
        ? 'Needs a little care'
        : petMood === 'excited'
        ? 'Buzzing with affection'
        : petMood === 'happy'
        ? 'Glowing with joy'
        : 'Resting in calm orbit';
    const feedTone = isHungry ? 'Feed now' : `${Math.max(0, Math.floor(hoursSinceFed))}h since feeding`;
    const activityTone = isActiveToday ? 'Active today' : 'Quiet today';

    /* ── MOOD ──────────────────────────────────────────────────── */
    const moodEmoji = isSleeping ? '🌙'
        : petMood === 'excited' ? '🤩'
        : petMood === 'happy' ? '😊'
        : isHungry ? '🍽️'
        : petMood === 'sad' ? '😢'
        : '😐';
    const moodLabel = isSleeping ? 'Sleeping'
        : petMood === 'excited' ? 'Excited!'
        : petMood === 'happy' ? 'Happy'
        : isHungry ? 'Hungry'
        : petMood === 'sad' ? 'Sad'
        : 'Content';

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
        updateViewport();
        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, []);

    /* ── EFFECTS ───────────────────────────────────────────────── */
    useEffect(() => {
        if (prevLevelRef.current === null) { prevLevelRef.current = level; return; }
        if (level > prevLevelRef.current) {
            prevLevelRef.current = level;
            setCelebLevel(level);
            setShowLevelUp(true);
        }
    }, [level]);

    const runIdleLoop = useCallback(() => {
        if (action !== 'idle') return;
        const doIdle = async () => {
            const r = Math.random();
            if (isSleeping) {
                await petControls.start({ scaleX: [1, 1.01, 1], scaleY: [1, 0.99, 1], y: [0, -1, 0], transition: { duration: 3.5, ease: 'easeInOut' } });
            } else if (r > 0.85) {
                await petControls.start({ rotate: [0, -4, 0], transition: { duration: 1.1, ease: 'easeInOut' } });
            } else if (r > 0.7) {
                await petControls.start({ rotate: [-2.5, 2.5, -1.5, 1, 0], transition: { duration: 0.5, ease: 'easeInOut' } });
            } else if (r > 0.45) {
                await petControls.start({ y: [0, -8, 0], transition: { duration: 2.2, ease: 'easeInOut' } });
            } else {
                await petControls.start({ scaleX: [1, 1.03, 1], scaleY: [1, 0.97, 1], y: [0, 1, 0], transition: { duration: 2.5, ease: 'easeInOut' } });
            }
            idleTimerRef.current = setTimeout(doIdle, 500 + Math.random() * 2200);
        };
        idleTimerRef.current = setTimeout(doIdle, 400 + Math.random() * 800);
    }, [action, isSleeping, petControls]);

    useEffect(() => {
        runIdleLoop();
        return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
    }, [runIdleLoop]);

    const refreshAI = useCallback(async (nextStats?: PetStats) => {
        if (aiLoadingRef.current) return;
        aiLoadingRef.current = true;
        setIsAILoading(true);
        const profile = StorageService.getCoupleProfile();
        const res = await PetAIService.generateDialogue(
            nextStats ?? statsRef.current,
            profile,
            memoriesRef.current.slice(0, 10),
            notesRef.current.slice(0, 10),
        );
        setDialogue(res.text);
        setIsFlashback(res.isFlashback);
        aiLoadingRef.current = false;
        setIsAILoading(false);
    }, []);

    useEffect(() => {
        const stored = StorageService.getPetStats();
        statsRef.current = stored;
        setStats(stored);
        setEditName(stored.name);
        setEditType(stored.type);
        refreshAI(stored);
    }, [refreshAI]);

    useEffect(() => {
        const handleSignal = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail.signalType === 'PET_ACTION') {
                const { actionType, partner } = detail.payload;
                setDialogue(`${partner} just ${actionType === 'feed' ? 'gave me a treat' : 'petted me'}! 🥰`);
                if (actionType === 'pet') triggerPettingRef.current();
            } else if (detail.signalType === 'PET_NUDGE') {
                setDialogue(`${(detail.payload as any).partner} is thinking of you! *Nudge nudge*`);
                triggerNudgeRef.current();
            } else if (detail.signalType === 'PET_HUNGER_ALERT') {
                setDialogue('My glow is fading... please feed me!');
            }
        };
        syncEventTarget.addEventListener('signal-received', handleSignal);
        return () => syncEventTarget.removeEventListener('signal-received', handleSignal);
    }, []);

    useEffect(() => {
        if (hoursSinceFed > 24) {
            const interval = setInterval(() => {
                const current = statsRef.current;
                if (current.happiness <= 0) return;
                const newStats = { ...current, happiness: Math.max(0, current.happiness - 1) };
                statsRef.current = newStats;
                setStats(newStats);
                StorageService.savePetStats(newStats);
                if (Math.random() > 0.9) SyncService.sendSignal('PET_HUNGER_ALERT', { level: 'starving' });
            }, 60000);
            return () => clearInterval(interval);
        }
    }, [hoursSinceFed]);

    /* ── HANDLERS ──────────────────────────────────────────────── */
    const triggerPetting = useCallback(async () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        setAction('petting');
        setHeartBurst(true);
        setFlash(true);
        setTimeout(() => setFlash(false), 550);
        await petControls.start({ scaleX: 1.2, scaleY: 0.8, y: 8, rotate: 0, transition: { duration: 0.08, ease: 'easeIn' } });
        await petControls.start({ scaleX: 0.85, scaleY: 1.22, y: -18, transition: { type: 'spring', stiffness: 700, damping: 10 } });
        await petControls.start({ scaleX: 1.06, scaleY: 0.94, y: 3, transition: { type: 'spring', stiffness: 420, damping: 14 } });
        await petControls.start({ scaleX: 1, scaleY: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 280, damping: 18 } });
        setRippleKey(k => k + 1);
        setHeartBurst(false);
        setAction('idle');
    }, [petControls]);

    const triggerNudge = useCallback(async () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        setAction('nudge');
        await petControls.start({
            x: [-9, 9, -7, 7, -4, 4, 0],
            scaleX: [1.05, 0.95, 1.04, 0.96, 1.02, 0.98, 1],
            scaleY: [0.95, 1.05, 0.96, 1.04, 0.98, 1.02, 1],
            transition: { duration: 0.5, ease: 'easeInOut' },
        });
        setRippleKey(k => k + 1);
        setAction('idle');
    }, [petControls]);
    useEffect(() => {
        triggerPettingRef.current = triggerPetting;
        triggerNudgeRef.current = triggerNudge;
    }, [triggerNudge, triggerPetting]);

    useEffect(() => {
        return () => {
            if (nudgeTimeoutRef.current) clearTimeout(nudgeTimeoutRef.current);
        };
    }, []);

    const handlePet = useCallback(async () => {
        if (isSleeping) return;
        if (navigator.vibrate) navigator.vibrate(40);
        feedback.tap();
        const now = Date.now();
        let coinsEarned = 0;
        if (now - lastCoinEarned.current > 5000) {
            coinsEarned = 5;
            lastCoinEarned.current = now;
            setCoinFloat({ key: now, amount: coinsEarned });
        }
        const currentStats = statsRef.current;
        const newStats = {
            ...currentStats,
            lastPetted: new Date().toISOString(),
            happiness: Math.min(100, currentStats.happiness + 5),
            coins: currentStats.coins + coinsEarned,
        };
        statsRef.current = newStats;
        setStats(newStats);
        StorageService.savePetStats(newStats);
        SyncService.sendSignal('PET_ACTION', { actionType: 'pet', partner: StorageService.getCoupleProfile().myName });
        if (Math.random() > 0.75) refreshAI(newStats);
        triggerPetting();
    }, [isSleeping, refreshAI, triggerPetting]);

    const handleNudgeStart = useCallback(() => {
        if (isSleeping) return;
        nudgeTimeoutRef.current = setTimeout(async () => {
            SyncService.sendSignal('PET_NUDGE', { partner: StorageService.getCoupleProfile().myName });
            setDialogue(`Sending a poke to ${partnerName}...`);
            if (navigator.vibrate) navigator.vibrate(200);
            const currentStats = statsRef.current;
            const newStats = { ...currentStats, coins: currentStats.coins + 10 };
            statsRef.current = newStats;
            setStats(newStats);
            StorageService.savePetStats(newStats);
            triggerNudge();
        }, 800);
    }, [isSleeping, partnerName, triggerNudge]);

    const handleNudgeEnd = useCallback(() => {
        if (nudgeTimeoutRef.current) clearTimeout(nudgeTimeoutRef.current);
    }, []);

    const handleFeed = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isSleeping || action === 'feeding') return;
        feedback.playPop();
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        setAction('feeding');
        const now = Date.now();
        let coinsEarned = 0;
        if (now - lastCoinEarned.current > 5000) {
            coinsEarned = 5;
            lastCoinEarned.current = now;
            setCoinFloat({ key: now, amount: coinsEarned });
        }
        const currentStats = statsRef.current;
        const newStats = {
            ...currentStats,
            lastFed: new Date().toISOString(),
            happiness: Math.min(100, currentStats.happiness + 15),
            coins: currentStats.coins + coinsEarned,
        };
        statsRef.current = newStats;
        setStats(newStats);
        StorageService.savePetStats(newStats);
        SyncService.sendSignal('PET_ACTION', { actionType: 'feed', partner: StorageService.getCoupleProfile().myName });
        await petControls.start({ scaleX: 1.1, scaleY: 0.9, y: 4, transition: { duration: 0.1 } });
        await petControls.start({
            scaleY: [0.9, 1.08, 0.92, 1.06, 0.95, 1.03, 1],
            scaleX: [1.1, 0.92, 1.08, 0.94, 1.06, 0.97, 1],
            y: [4, -5, 2, -3, 1, -1, 0],
            transition: { duration: 0.8, ease: 'easeInOut' },
        });
        await petControls.start({ scaleX: 0.88, scaleY: 1.18, y: -16, transition: { type: 'spring', stiffness: 520, damping: 10 } });
        await petControls.start({ scaleX: 1, scaleY: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 260, damping: 18 } });
        setRippleKey(k => k + 1);
        setAction('idle');
        refreshAI(newStats);
    }, [action, isSleeping, petControls, refreshAI]);

    const saveSettings = () => {
        const newStats = { ...statsRef.current, name: editName, type: editType };
        statsRef.current = newStats;
        setStats(newStats);
        StorageService.savePetStats(newStats);
        setShowSettings(false);
    };

    /* ── SURFACES (kept for settings modal) ────────────────────── */
    const glassSurface = useMemo<React.CSSProperties>(() => ({
        background: theme.trayBg,
        backdropFilter: 'blur(40px) saturate(140%)',
        WebkitBackdropFilter: 'blur(40px) saturate(140%)',
        border: `1px solid ${theme.trayBorder}`,
    }), [theme.trayBg, theme.trayBorder]);

    /* ═══════════════════════════════════════════════════════════ */
    /*  R E N D E R                                               */
    /* ═══════════════════════════════════════════════════════════ */
    const petSize = 230;

    return createPortal(
        <>
            {/* ── FULL SCREEN BACKDROP ── */}
            <motion.div
                className="fixed inset-0 z-[60] select-none flex justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28 }}
                style={{ background: '#0d0610', touchAction: 'manipulation' }}
            >
                {/* Mobile-width content column */}
                <div className="relative flex flex-col w-full overflow-hidden" style={{ maxWidth: 390 }}>

                    {/* Atmospheric glow — stays within column */}
                    <motion.div className="pointer-events-none absolute inset-x-0"
                        style={{
                            top: '4%', height: '54%',
                            background: `radial-gradient(ellipse at 50% 45%, ${theme.accent}30 0%, transparent 70%)`,
                            filter: 'blur(40px)',
                        }}
                        animate={reduceMotion ? {} : { opacity: [0.65, 1, 0.65], scale: [1, 1.04, 1] }}
                        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    {isHungry && !isSleeping && (
                        <motion.div className="pointer-events-none absolute inset-0"
                            animate={{ opacity: [0, 0.16, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ background: 'radial-gradient(circle at 50% 38%, rgba(239,68,68,0.22) 0%, transparent 55%)' }}
                        />
                    )}
                    <PetFlash flash={flash} color={theme.accent} />

                    {/* ── TOP ZONE: header + title + pet ── */}
                    <div
                        className="flex flex-col shrink-0"
                        style={{
                            paddingTop: 'max(env(safe-area-inset-top, 0px), 14px)',
                            height: '58%',
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 pb-1 shrink-0">
                            <motion.button
                                type="button"
                                onClick={onClose}
                                className="liquid-glass-btn flex items-center gap-1.5 px-4 h-9 rounded-full text-white"
                                style={{ fontSize: 13, fontWeight: 600 }}
                                whileTap={{ scale: 0.91 }}
                            >
                                <ChevronLeft size={14} />
                                <span>Back</span>
                            </motion.button>

                            <div className="liquid-glass flex items-center gap-0.5 rounded-full p-1" style={{ overflow: 'hidden' }}>
                                <motion.button type="button" onClick={() => setShowSettings(true)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-white/70"
                                    whileTap={{ scale: 0.88 }}>
                                    <Settings size={13} />
                                </motion.button>
                                <motion.button type="button" onClick={onClose}
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-white/70"
                                    whileTap={{ scale: 0.88 }}>
                                    <X size={13} />
                                </motion.button>
                            </div>
                        </div>

                        {/* Name + subtitle */}
                        <div className="text-center px-6 pt-2 pb-1 shrink-0">
                            <h1 className="text-[26px] font-bold tracking-tight leading-none text-white">
                                {stats.name}
                            </h1>
                            <p className="mt-1 text-[12px] text-white/35">{stage} · {moodLabel}</p>
                        </div>

                        {/* Pet hero */}
                        <div className="flex flex-1 items-center justify-center overflow-hidden">
                            <motion.div
                                className="relative flex items-center justify-center"
                                style={{ width: petSize + 80, height: petSize + 80 }}
                                initial={{ opacity: 0, scale: 0.82, y: 16 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ duration: 0.58, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {/* Outer halo */}
                                <motion.div className="absolute inset-[-8%] rounded-full pointer-events-none"
                                    style={{
                                        background: `radial-gradient(circle, ${theme.accent}18 0%, transparent 68%)`,
                                        filter: 'blur(20px)',
                                    }}
                                    animate={reduceMotion ? {} : {
                                        opacity: petMood === 'excited' ? [0.55, 1, 0.55] : [0.3, 0.6, 0.3],
                                        scale:   petMood === 'excited' ? [1, 1.13, 1]    : [1, 1.06, 1],
                                    }}
                                    transition={{ duration: petMood === 'excited' ? 1.5 : 4.5, repeat: Infinity }}
                                />
                                {/* Glow ring */}
                                <motion.div className="absolute rounded-full pointer-events-none"
                                    style={{
                                        inset: '16%',
                                        border: `1px solid ${theme.accent}22`,
                                    }}
                                    animate={reduceMotion ? {} : { opacity: [0.3, 0.7, 0.3] }}
                                    transition={{ duration: 3.5, repeat: Infinity }}
                                />
                                {/* Floor shadow */}
                                <div className="absolute pointer-events-none"
                                    style={{
                                        bottom: '9%', left: '24%', width: '52%', height: 14,
                                        borderRadius: '50%',
                                        background: `radial-gradient(ellipse, ${theme.accent}38 0%, transparent 72%)`,
                                        filter: 'blur(8px)',
                                    }}
                                />
                                <CoinFloat coinFloat={coinFloat} />
                                <HeartBurst active={heartBurst} color={theme.accent} />
                                <PetCharacter
                                    type={stats.type as PetType}
                                    mood={petMood}
                                    controls={petControls}
                                    equippedHat={stats.equipped.hat}
                                    equippedAccessory={stats.equipped.accessory}
                                    level={level}
                                    size={petSize}
                                    onClick={handlePet}
                                    onMouseDown={handleNudgeStart}
                                    onMouseUp={handleNudgeEnd}
                                    onTouchStart={handleNudgeStart}
                                    onTouchEnd={handleNudgeEnd}
                                />
                            </motion.div>
                        </div>
                    </div>

                    {/* ── BOTTOM PANEL: liquid glass sheet ── */}
                    <motion.div
                        className="flex flex-col flex-1"
                        style={{
                            borderRadius: '26px 26px 0 0',
                            background: 'rgba(255,255,255,0.07)',
                            backdropFilter: 'blur(48px) saturate(180%) brightness(1.1)',
                            WebkitBackdropFilter: 'blur(48px) saturate(180%) brightness(1.1)',
                            borderTop: '1.5px solid rgba(255,255,255,0.20)',
                            borderLeft: '1px solid rgba(255,255,255,0.10)',
                            borderRight: '1px solid rgba(255,255,255,0.10)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.13), 0 -12px 48px rgba(0,0,0,0.32)',
                            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)',
                        }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.42, delay: 0.16 }}
                    >
                        {/* Whisper bubble */}
                        <AnimatePresence>
                            {(typedDialogue || isAILoading) && (
                                <motion.div
                                    key="whisper"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden shrink-0"
                                >
                                    <button type="button" onClick={() => void refreshAI()}
                                        className="w-full px-5 pt-4 pb-0 text-left">
                                        {isAILoading && !typedDialogue ? (
                                            <div className="flex gap-1.5 items-center h-4">
                                                {[0,1,2].map(i => (
                                                    <motion.div key={i} className="w-1.5 h-1.5 rounded-full"
                                                        style={{ background: theme.accent }}
                                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                                        transition={{ duration: 1, delay: i * 0.15, repeat: Infinity }}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[12px] italic line-clamp-1 text-white/40">
                                                "{typedDialogue}"
                                            </p>
                                        )}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Adore button */}
                        <div className="px-4 pt-5 shrink-0">
                            <motion.button
                                type="button"
                                onClick={handlePet}
                                disabled={isSleeping}
                                className="liquid-glass-btn liquid-glass-btn--rose w-full flex items-center justify-center gap-2 rounded-2xl py-[14px] text-white"
                                style={{ opacity: isSleeping ? 0.35 : 1, fontSize: 15, fontWeight: 700 }}
                                whileTap={{ scale: 0.97 }}
                            >
                                <Heart size={16} fill="white" stroke="none" />
                                {isSleeping ? 'Sleeping…' : 'Adore'}
                            </motion.button>
                        </div>

                        {/* Divider */}
                        <div className="mx-4 mt-4 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

                        {/* Stats */}
                        <div className="grid grid-cols-3 shrink-0 py-3">
                            <div className="flex flex-col items-center gap-0.5 py-1">
                                <div className="flex items-center gap-1">
                                    <Heart size={12} fill={happinessColor} stroke={happinessColor} />
                                    <span className="text-[22px] font-bold leading-none text-white">{stats.happiness}</span>
                                </div>
                                <span className="text-[10px] text-white/35 font-medium">Harmony</span>
                            </div>
                            <div className="flex flex-col items-center gap-0.5 py-1 border-x" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                                <div className="flex items-center gap-1">
                                    <Sparkles size={12} style={{ color: '#d8bb76' }} />
                                    <span className="text-[22px] font-bold leading-none text-white">{level}</span>
                                </div>
                                <span className="text-[10px] text-white/35 font-medium">Level</span>
                            </div>
                            <div className="flex flex-col items-center gap-0.5 py-1">
                                <div className="flex items-center gap-1">
                                    <span className="text-[12px] leading-none" style={{ color: '#d8bb76' }}>✦</span>
                                    <span className="text-[22px] font-bold leading-none text-white">{stats.coins}</span>
                                </div>
                                <span className="text-[10px] text-white/35 font-medium">Coins</span>
                            </div>
                        </div>

                        {/* XP bar */}
                        <div className="px-4 shrink-0">
                            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                                <motion.div className="h-full rounded-full"
                                    style={{ background: `linear-gradient(90deg, ${theme.accent}, ${theme.auroraA})` }}
                                    animate={{ width: `${progressPercent}%` }}
                                    transition={{ type: 'spring', stiffness: 70, damping: 18 }}
                                />
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="mx-4 mt-3 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

                        {/* Action row — liquid glass buttons */}
                        <div className="flex items-center flex-1 px-3 gap-2 pt-3">
                            {/* Feed */}
                            <motion.button
                                type="button"
                                onClick={handleFeed}
                                disabled={isSleeping || action === 'feeding'}
                                className="liquid-glass-btn flex flex-1 flex-col items-center justify-center gap-1.5 py-3 rounded-2xl"
                                style={{ opacity: isSleeping || action === 'feeding' ? 0.3 : 1 }}
                                whileTap={{ scale: 0.92 }}
                            >
                                <Utensils size={20} style={{ color: isHungry ? '#f87171' : 'rgba(255,255,255,0.82)' }} />
                                <span className="text-[11px] font-semibold text-white/55" style={{ color: isHungry ? '#f87171' : undefined }}>
                                    {isHungry ? 'Feed!' : 'Feed'}
                                </span>
                            </motion.button>

                            {/* Nudge */}
                            <motion.button
                                type="button"
                                onMouseDown={handleNudgeStart}
                                onMouseUp={handleNudgeEnd}
                                onTouchStart={handleNudgeStart}
                                onTouchEnd={handleNudgeEnd}
                                disabled={isSleeping}
                                className="liquid-glass-btn flex flex-1 flex-col items-center justify-center gap-1.5 py-3 rounded-2xl"
                                style={{ opacity: isSleeping ? 0.3 : 1 }}
                                whileTap={{ scale: 0.92 }}
                            >
                                <Zap size={20} className="text-white/80" />
                                <span className="text-[11px] font-semibold text-white/55">Nudge</span>
                            </motion.button>

                            {/* Shop */}
                            <motion.button
                                type="button"
                                onClick={() => { feedback.playPop(); setShowShop(true); }}
                                className="liquid-glass-btn flex flex-1 flex-col items-center justify-center gap-1.5 py-3 rounded-2xl"
                                whileTap={{ scale: 0.92 }}
                            >
                                <Store size={20} className="text-white/80" />
                                <span className="text-[11px] font-semibold text-white/55">Shop</span>
                            </motion.button>
                        </div>
                    </motion.div>

                </div>
            </motion.div>

            {/* ═══ LEVEL UP ═══ */}
            <AnimatePresence>
                {showLevelUp && (
                    <LevelUpCelebration level={celebLevel} accent={theme.accent} onDone={() => setShowLevelUp(false)} />
                )}
            </AnimatePresence>

            {/* ═══ SETTINGS SHEET ═══ */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        key="settings"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-end justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
                        onClick={() => setShowSettings(false)}
                    >
                        <motion.div
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            className="w-full max-w-sm rounded-t-[2rem] overflow-hidden"
                            style={{
                                background: 'rgba(28,14,20,0.97)',
                                backdropFilter: 'blur(40px)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                boxShadow: '0 -16px 60px rgba(0,0,0,0.5)',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="px-6 pt-5 pb-4 flex justify-between items-center"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                <div>
                                    <h3 className="font-bold text-base text-white">Settings</h3>
                                    <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                        Rename or change spirit type
                                    </p>
                                </div>
                                <button onClick={() => setShowSettings(false)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <X size={15} color="rgba(255,255,255,0.7)" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest block mb-2"
                                        style={{ color: 'rgba(255,255,255,0.38)' }}>Name</label>
                                    <input type="text" value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        className="w-full py-3 px-4 rounded-2xl font-bold text-sm outline-none text-white"
                                        style={{
                                            background: 'rgba(255,255,255,0.07)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                        }}
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest block mb-3"
                                        style={{ color: 'rgba(255,255,255,0.38)' }}>Spirit Type</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {PET_TYPES.map(t => {
                                            const active = editType === t.id;
                                            return (
                                                <motion.button key={t.id}
                                                    onClick={() => setEditType(t.id as any)}
                                                    className="py-3.5 px-3 rounded-2xl flex items-center gap-2.5"
                                                    style={active ? {
                                                        background: `${theme.accent}22`,
                                                        border: `1.5px solid ${theme.accent}55`,
                                                    } : {
                                                        background: 'rgba(255,255,255,0.05)',
                                                        border: '1px solid rgba(255,255,255,0.09)',
                                                    }}
                                                    whileTap={{ scale: 0.94 }}
                                                >
                                                    <span className="text-xl">{t.emoji}</span>
                                                    <span className="text-[13px] font-bold"
                                                        style={{ color: active ? theme.accent : 'rgba(255,255,255,0.75)' }}>
                                                        {t.label}
                                                    </span>
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <motion.button onClick={saveSettings}
                                    className="w-full py-3.5 rounded-2xl font-bold text-[14px] text-white"
                                    style={{
                                        background: `linear-gradient(135deg, ${theme.accent}, ${theme.auroraA})`,
                                        boxShadow: `0 6px 20px ${theme.accent}40`,
                                    }}
                                    whileTap={{ scale: 0.97 }}
                                >Save</motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ SHOP ═══ */}
            {createPortal(
                <AnimatePresence>
                    {showShop && (
                        <PetShop
                            stats={stats}
                            onClose={() => setShowShop(false)}
                            onUpdateStats={newStats => {
                                statsRef.current = newStats;
                                setStats(newStats);
                            }}
                        />
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>,
        document.body
    );
};

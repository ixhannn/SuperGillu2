import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Heart, ArrowRight, Calendar, UserPlus, Sparkles } from 'lucide-react';
import { StorageService } from '../services/storage';
import { Haptics } from '../services/haptics';

interface OnboardingProps {
    onComplete: (myName: string, partnerName: string) => void;
}

type Step = 'welcome' | 'myName' | 'anniversary' | 'done';

// ─── Floating particle system ─────────────────────────────────────────────────

interface Particle {
    id: number;
    x: number;       // % from left
    size: number;    // px
    delay: number;   // s
    duration: number; // s
    opacity: number;
    rotate: number;  // final rotation deg
}

function useParticles(count: number): Particle[] {
    return useMemo(() => Array.from({ length: count }, (_, i) => ({
        id: i,
        x: 5 + (i / count) * 90 + (Math.sin(i * 2.4) * 6),
        size: 8 + Math.abs(Math.sin(i * 1.7)) * 14,
        delay: (i * 0.38) % 4,
        duration: 5 + Math.abs(Math.cos(i * 1.3)) * 4,
        opacity: 0.08 + Math.abs(Math.sin(i * 2.1)) * 0.16,
        rotate: Math.sin(i * 3.1) * 40,
    })), [count]);
}

const FloatingParticles: React.FC<{ burst?: boolean }> = ({ burst }) => {
    const particles = useParticles(18);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    style={{
                        position: 'absolute',
                        left: `${p.x}%`,
                        bottom: '-40px',
                        width: p.size,
                        height: p.size,
                    }}
                    animate={burst ? {
                        y: [0, -(window.innerHeight + 80)],
                        opacity: [0, p.opacity * 2, 0],
                        rotate: [0, p.rotate],
                        scale: [0.6, 1.1, 0.8],
                    } : {
                        y: [0, -(window.innerHeight + 80)],
                        opacity: [0, p.opacity, p.opacity, 0],
                        rotate: [0, p.rotate],
                    }}
                    transition={{
                        duration: burst ? p.duration * 0.6 : p.duration,
                        delay: burst ? p.delay * 0.2 : p.delay,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                >
                    <Heart
                        size={p.size}
                        fill="currentColor"
                        style={{ color: `rgba(var(--theme-particle-2-rgb), 1)`, width: '100%', height: '100%' }}
                    />
                </motion.div>
            ))}
        </div>
    );
};

// ─── Radial heart burst (done screen) ────────────────────────────────────────

const BurstHearts: React.FC = () => {
    const count = 14;
    const bursts = useMemo(() => Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360;
        const rad = (angle * Math.PI) / 180;
        const dist = 90 + Math.random() * 60;
        return {
            id: i,
            tx: Math.cos(rad) * dist,
            ty: Math.sin(rad) * dist,
            size: 10 + Math.random() * 14,
            delay: Math.random() * 0.18,
            duration: 0.55 + Math.random() * 0.3,
        };
    }), []);

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
            {bursts.map((b) => (
                <motion.div
                    key={b.id}
                    style={{ position: 'absolute' }}
                    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                    animate={{
                        opacity: [0, 1, 0],
                        scale: [0, 1.2, 0.6],
                        x: b.tx,
                        y: b.ty,
                    }}
                    transition={{
                        duration: b.duration,
                        delay: b.delay,
                        ease: [0.16, 1, 0.3, 1],
                    }}
                >
                    <Heart
                        size={b.size}
                        fill="currentColor"
                        style={{ color: 'var(--color-nav-active)' }}
                    />
                </motion.div>
            ))}
        </div>
    );
};

// ─── Live name display ────────────────────────────────────────────────────────

const LiveNameDisplay: React.FC<{ name: string }> = ({ name }) => {
    const displayed = name || '';
    const chars = displayed.split('');
    const isEmpty = chars.length === 0;

    return (
        <div
            className="w-full text-center mb-3 min-h-[72px] flex items-center justify-center"
            aria-hidden
        >
            <AnimatePresence mode="popLayout">
                {isEmpty ? (
                    <motion.span
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.22 }}
                        exit={{ opacity: 0 }}
                        className="font-serif text-[3rem] leading-none"
                        style={{ color: 'var(--color-text-primary)' }}
                    >
                        ___
                    </motion.span>
                ) : (
                    <motion.div
                        key="name"
                        className="flex items-center justify-center flex-wrap gap-x-0.5"
                    >
                        {chars.map((ch, i) => (
                            <motion.span
                                key={`${ch}-${i}`}
                                initial={{ opacity: 0, y: 10, scale: 0.85 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ type: 'spring' as const, damping: 18, stiffness: 380, delay: 0 }}
                                className="font-serif leading-none"
                                style={{
                                    fontSize: chars.length > 10 ? '2.2rem' : chars.length > 7 ? '2.8rem' : '3.2rem',
                                    color: 'var(--color-text-primary)',
                                    display: 'inline-block',
                                    textShadow: '0 2px 16px rgba(196,104,126,0.18)',
                                }}
                            >
                                {ch === ' ' ? '\u00A0' : ch}
                            </motion.span>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── Animated days counter ────────────────────────────────────────────────────

const DaysCounter: React.FC<{ days: number }> = ({ days }) => {
    const motionVal = useMotionValue(0);
    const rounded = useTransform(motionVal, (v) => Math.round(v).toLocaleString());
    const [display, setDisplay] = useState('0');

    useEffect(() => {
        const controls = animate(motionVal, days, { duration: 1.2, ease: [0.16, 1, 0.3, 1] });
        const unsub = rounded.on('change', (v) => setDisplay(v));
        return () => { controls.stop(); unsub(); };
    }, [days, motionVal, rounded]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring' as const, damping: 20, stiffness: 300 }}
            className="flex flex-col items-center gap-1 py-4"
        >
            <span
                className="font-serif leading-none"
                style={{ fontSize: '3.5rem', color: 'var(--color-nav-active)', textShadow: '0 4px 24px rgba(196,104,126,0.35)' }}
            >
                {display}
            </span>
            <span className="text-[13px] font-semibold tracking-[0.1em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>
                days of love
            </span>
        </motion.div>
    );
};

// ─── Shared button ────────────────────────────────────────────────────────────

const PrimaryButton: React.FC<{
    label: string;
    disabled?: boolean;
    onClick: () => void;
    icon?: React.ReactNode;
    glow?: boolean;
}> = ({ label, disabled, onClick, icon, glow }) => (
    <motion.button
        onClick={onClick}
        disabled={disabled}
        whileTap={disabled ? {} : { scale: 0.97 }}
        style={{
            width: '100%',
            padding: '18px',
            borderRadius: 20,
            background: disabled
                ? 'rgba(196,104,126,0.22)'
                : 'linear-gradient(135deg, #d4637a 0%, #c4687e 60%, #b85470 100%)',
            color: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: '0.025em',
            boxShadow: disabled ? 'none'
                : glow
                    ? '0 0 0 1px rgba(196,104,126,0.3), 0 8px 32px rgba(196,104,126,0.5), 0 2px 8px rgba(196,104,126,0.2)'
                    : '0 8px 28px rgba(196,104,126,0.38)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background 0.25s, box-shadow 0.25s, color 0.25s',
        }}
    >
        {label}
        {icon ?? <ArrowRight size={18} strokeWidth={2.5} />}
    </motion.button>
);

// ─── Slide transition ─────────────────────────────────────────────────────────

function slide(dir: number) {
    return {
        initial: { x: dir > 0 ? 56 : -56, opacity: 0, scale: 0.96 },
        animate: {
            x: 0, opacity: 1, scale: 1,
            transition: { type: 'spring' as const, damping: 30, stiffness: 340, mass: 0.8 },
        },
        exit: {
            x: dir > 0 ? -56 : 56, opacity: 0, scale: 0.96,
            transition: { duration: 0.16, ease: 'easeIn' as const },
        },
    };
}

// ─── Progress pills ───────────────────────────────────────────────────────────

const ProgressPills: React.FC<{ current: number }> = ({ current }) => (
    <div className="flex gap-2 justify-center">
        {[0, 1].map((i) => (
            <motion.div
                key={i}
                animate={{ width: i === current ? 24 : 7, opacity: i <= current ? 1 : 0.28 }}
                transition={{ type: 'spring' as const, damping: 22, stiffness: 280 }}
                style={{ height: 7, borderRadius: 100, background: 'var(--color-nav-active)' }}
            />
        ))}
    </div>
);

// ─── Orb background ───────────────────────────────────────────────────────────

const Orbs: React.FC = () => (
    <>
        <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.65, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
                position: 'absolute', top: '-10%', right: '-14%',
                width: 320, height: 320, borderRadius: '50%',
                background: 'var(--theme-orb-1)', filter: 'blur(80px)', pointerEvents: 'none',
            }}
        />
        <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.56, 0.4] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
            style={{
                position: 'absolute', bottom: '-12%', left: '-14%',
                width: 300, height: 300, borderRadius: '50%',
                background: 'var(--theme-orb-2)', filter: 'blur(80px)', pointerEvents: 'none',
            }}
        />
        <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.32, 0.2] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
            style={{
                position: 'absolute', top: '38%', left: '52%',
                width: 200, height: 200, borderRadius: '50%',
                background: 'var(--theme-orb-3)', filter: 'blur(60px)', pointerEvents: 'none',
            }}
        />
    </>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState<Step>('welcome');
    const [dir, setDir] = useState(1);
    const [myName, setMyName] = useState('');
    const [anniversary, setAnniversary] = useState('');
    const [showBurst, setShowBurst] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    const daysApart = useMemo(() => {
        if (!anniversary) return 0;
        const diff = Date.now() - new Date(anniversary).getTime();
        return Math.max(0, Math.floor(diff / 86_400_000));
    }, [anniversary]);

    const dotIndex = step === 'myName' ? 0 : step === 'anniversary' ? 1 : -1;

    const advance = async (next: Step) => {
        await Haptics.heartbeat();
        setDir(1);
        setStep(next);
    };

    const handleComplete = async () => {
        setShowBurst(true);
        await Haptics.celebrate();
        const profile = StorageService.getCoupleProfile();
        StorageService.saveCoupleProfile({
            ...profile,
            myName: myName.trim(),
            anniversaryDate: anniversary
                ? new Date(anniversary).toISOString()
                : profile.anniversaryDate,
        });
        StorageService.markOnboardingComplete();
        setTimeout(() => onComplete(myName.trim(), ''), 600);
    };

    useEffect(() => {
        if (step === 'myName') setTimeout(() => nameRef.current?.focus(), 400);
    }, [step]);

    return (
        <div
            className="min-h-screen flex flex-col relative overflow-hidden"
            style={{ background: 'var(--theme-bg-main)', color: 'var(--color-text-primary)' }}
        >
            <Orbs />
            <FloatingParticles burst={showBurst} />

            {/* Progress */}
            <div className="relative z-10 w-full max-w-sm mx-auto px-6 pt-14 flex-shrink-0">
                {dotIndex >= 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <ProgressPills current={dotIndex} />
                    </motion.div>
                )}
            </div>

            {/* Step content */}
            <div className="relative z-10 w-full max-w-sm mx-auto px-6 flex-1 flex items-center">
                <AnimatePresence mode="wait">

                    {/* ══════════════════════════════════════════════════════
                        WELCOME
                    ═══════════════════════════════════════════════════════ */}
                    {step === 'welcome' && (
                        <motion.div key="welcome" {...slide(dir)} className="w-full py-8">
                            {/* Logo */}
                            <div className="flex justify-center mb-10">
                                <motion.div
                                    initial={{ scale: 0, rotate: -30, opacity: 0 }}
                                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                    transition={{ type: 'spring' as const, damping: 14, stiffness: 200, delay: 0.05 }}
                                    style={{
                                        width: 96, height: 96,
                                        borderRadius: '2rem',
                                        background: 'rgba(255,255,255,0.76)',
                                        backdropFilter: 'blur(24px)',
                                        WebkitBackdropFilter: 'blur(24px)',
                                        border: '1.5px solid rgba(255,255,255,0.92)',
                                        boxShadow: '0 24px 64px rgba(196,104,126,0.32), 0 4px 16px rgba(196,104,126,0.14), inset 0 1px 0 rgba(255,255,255,1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative',
                                    }}
                                >
                                    <motion.div
                                        animate={{ scale: [1, 1.08, 1] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                        <Heart size={46} fill="currentColor" style={{ color: 'var(--color-nav-active)' }} />
                                    </motion.div>
                                    {/* Sparkle */}
                                    <motion.div
                                        style={{ position: 'absolute', top: -6, right: -6 }}
                                        animate={{ scale: [1, 1.5, 1], rotate: [0, 25, 0], opacity: [0.7, 1, 0.7] }}
                                        transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 0.8 }}
                                    >
                                        <Sparkles size={18} style={{ color: '#f59e0b' }} />
                                    </motion.div>
                                </motion.div>
                            </div>

                            {/* Headline — staggered words */}
                            <div className="text-center mb-4">
                                {['A private universe', 'just for', 'the two of you.'].map((line, i) => (
                                    <motion.p
                                        key={line}
                                        initial={{ opacity: 0, y: 18 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.18 + i * 0.1, type: 'spring' as const, damping: 26, stiffness: 300 }}
                                        className="font-serif leading-snug"
                                        style={{
                                            fontSize: i === 0 ? '2rem' : i === 1 ? '1.5rem' : '2.1rem',
                                            color: i === 2 ? 'var(--color-nav-active)' : 'var(--color-text-primary)',
                                            fontStyle: i === 1 ? 'italic' : 'normal',
                                        }}
                                    >
                                        {line}
                                    </motion.p>
                                ))}
                            </div>

                            {/* Pill tags */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.52 }}
                                className="flex justify-center gap-2 flex-wrap mb-12"
                            >
                                {['Private', 'Beautiful', 'Yours forever'].map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 rounded-full text-[12px] font-semibold"
                                        style={{
                                            background: 'rgba(255,255,255,0.50)',
                                            backdropFilter: 'blur(12px)',
                                            border: '1px solid rgba(255,255,255,0.75)',
                                            color: 'var(--color-text-secondary)',
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.62 }}
                            >
                                <PrimaryButton label="Begin your story" glow onClick={() => advance('myName')} />
                            </motion.div>
                        </motion.div>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        YOUR NAME
                    ═══════════════════════════════════════════════════════ */}
                    {step === 'myName' && (
                        <motion.div key="myName" {...slide(dir)} className="w-full py-6">
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.08 }}
                                className="text-center text-[13px] font-semibold uppercase tracking-[0.14em] mb-8"
                                style={{ color: 'var(--color-text-secondary)' }}
                            >
                                Step 1 of 2
                            </motion.p>

                            {/* Live name preview */}
                            <LiveNameDisplay name={myName} />

                            <motion.h2
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="font-serif text-[1.65rem] text-center mb-1.5"
                                style={{ color: 'var(--color-text-primary)' }}
                            >
                                What's your name?
                            </motion.h2>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.16 }}
                                className="text-[14px] text-center mb-7"
                                style={{ color: 'var(--color-text-secondary)' }}
                            >
                                How you'll appear in your shared space.
                            </motion.p>

                            {/* Input */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="mb-5"
                            >
                                <input
                                    ref={nameRef}
                                    value={myName}
                                    onChange={(e) => {
                                        setMyName(e.target.value);
                                        if (e.target.value.length > 0) Haptics.select();
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && myName.trim()) advance('anniversary'); }}
                                    autoCapitalize="words"
                                    autoCorrect="off"
                                    autoComplete="off"
                                    spellCheck={false}
                                    maxLength={32}
                                    placeholder="Type your name…"
                                    style={{
                                        background: 'rgba(255,255,255,0.62)',
                                        backdropFilter: 'blur(20px)',
                                        WebkitBackdropFilter: 'blur(20px)',
                                        border: '1.5px solid rgba(255,255,255,0.88)',
                                        boxShadow: '0 8px 32px rgba(232,160,176,0.15), inset 0 1px 0 rgba(255,255,255,0.95)',
                                        borderRadius: 20,
                                        width: '100%',
                                        padding: '18px 22px',
                                        fontSize: 18,
                                        fontWeight: 600,
                                        color: 'var(--color-text-primary)',
                                        outline: 'none',
                                        textAlign: 'center',
                                        caretColor: 'var(--color-nav-active)',
                                    }}
                                />
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}>
                                <PrimaryButton
                                    label="Continue"
                                    disabled={!myName.trim()}
                                    onClick={() => myName.trim() && advance('anniversary')}
                                />
                            </motion.div>
                        </motion.div>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        ANNIVERSARY
                    ═══════════════════════════════════════════════════════ */}
                    {step === 'anniversary' && (
                        <motion.div key="anniversary" {...slide(dir)} className="w-full py-6">
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.06 }}
                                className="text-center text-[13px] font-semibold uppercase tracking-[0.14em] mb-6"
                                style={{ color: 'var(--color-text-secondary)' }}
                            >
                                Step 2 of 2
                            </motion.p>

                            <motion.h2
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1, type: 'spring' as const, damping: 24 }}
                                className="font-serif text-[1.8rem] text-center leading-snug mb-2"
                            >
                                When did{' '}
                                <span style={{ color: 'var(--color-nav-active)' }}>{myName}</span>'s
                                <br />story begin?
                            </motion.h2>

                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.18 }}
                                className="text-[14px] text-center mb-7"
                                style={{ color: 'var(--color-text-secondary)' }}
                            >
                                The day everything changed.
                            </motion.p>

                            {/* Date input */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.22 }}
                                style={{
                                    background: 'rgba(255,255,255,0.62)',
                                    backdropFilter: 'blur(20px)',
                                    WebkitBackdropFilter: 'blur(20px)',
                                    border: '1.5px solid rgba(255,255,255,0.88)',
                                    boxShadow: '0 8px 32px rgba(232,160,176,0.15), inset 0 1px 0 rgba(255,255,255,0.95)',
                                    borderRadius: 20,
                                    padding: '16px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    marginBottom: 8,
                                }}
                            >
                                <Calendar size={20} style={{ color: 'var(--color-nav-active)', flexShrink: 0 }} />
                                <input
                                    type="date"
                                    value={anniversary}
                                    onChange={(e) => {
                                        setAnniversary(e.target.value);
                                        if (e.target.value) Haptics.success();
                                    }}
                                    max={new Date().toISOString().split('T')[0]}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        fontSize: 17,
                                        fontWeight: 600,
                                        color: anniversary ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                        width: '100%',
                                        cursor: 'pointer',
                                    }}
                                />
                            </motion.div>

                            {/* Days counter — appears when date is chosen */}
                            <AnimatePresence>
                                {anniversary && daysApart > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <DaysCounter days={daysApart} />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.28 }}
                                className="mt-3 mb-3"
                            >
                                <PrimaryButton
                                    label={anniversary ? 'Save our date' : 'Set anniversary'}
                                    disabled={!anniversary}
                                    onClick={() => anniversary && advance('done')}
                                    icon={<Heart size={17} fill="currentColor" />}
                                />
                            </motion.div>

                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.36 }}>
                                <button
                                    onClick={() => advance('done')}
                                    className="w-full py-3 text-[14px] font-medium"
                                    style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none' }}
                                >
                                    Skip for now
                                </button>
                            </motion.div>
                        </motion.div>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        DONE
                    ═══════════════════════════════════════════════════════ */}
                    {step === 'done' && (
                        <motion.div key="done" {...slide(dir)} className="w-full py-8 text-center relative">
                            {showBurst && <BurstHearts />}

                            {/* Main heart icon with glow */}
                            <div className="flex justify-center mb-8 relative">
                                <motion.div
                                    initial={{ scale: 0, rotate: -20 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ type: 'spring' as const, damping: 12, stiffness: 220, delay: 0.04 }}
                                    style={{
                                        width: 100, height: 100,
                                        borderRadius: '2rem',
                                        background: 'rgba(255,255,255,0.72)',
                                        backdropFilter: 'blur(24px)',
                                        border: '1.5px solid rgba(255,255,255,0.92)',
                                        boxShadow: '0 0 60px rgba(196,104,126,0.5), 0 20px 64px rgba(196,104,126,0.3), inset 0 1px 0 rgba(255,255,255,1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <motion.div
                                        animate={{ scale: [1, 1.1, 1] }}
                                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                        <Heart size={50} fill="currentColor" style={{ color: 'var(--color-nav-active)' }} />
                                    </motion.div>
                                </motion.div>

                                {/* Orbiting sparkles */}
                                {[0, 120, 240].map((deg, i) => (
                                    <motion.div
                                        key={deg}
                                        style={{ position: 'absolute', top: '50%', left: '50%' }}
                                        animate={{ rotate: [deg, deg + 360] }}
                                        transition={{ duration: 6 + i, repeat: Infinity, ease: 'linear' }}
                                    >
                                        <motion.div style={{ x: 56, y: -6 }}>
                                            <Sparkles size={12 + i * 2} style={{ color: '#f59e0b', opacity: 0.7 + i * 0.1 }} />
                                        </motion.div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Name reveal */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3, type: 'spring' as const, damping: 22 }}
                                className="mb-2"
                            >
                                <p className="text-[13px] font-semibold uppercase tracking-[0.16em] mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                                    Welcome
                                </p>
                                <h2
                                    className="font-serif leading-tight"
                                    style={{
                                        fontSize: myName.length > 10 ? '2.4rem' : '3rem',
                                        color: 'var(--color-text-primary)',
                                        textShadow: '0 2px 20px rgba(196,104,126,0.22)',
                                    }}
                                >
                                    {myName}
                                </h2>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-[15px] mt-2 mb-8"
                                    style={{ color: 'var(--color-text-secondary)' }}
                                >
                                    Your space is ready. ✦
                                </motion.p>
                            </motion.div>

                            {/* Invite hint */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.54 }}
                                className="mb-5 px-4 py-3.5 rounded-2xl flex items-center gap-3 text-left"
                                style={{
                                    background: 'rgba(255,255,255,0.46)',
                                    border: '1.5px solid rgba(255,255,255,0.82)',
                                    backdropFilter: 'blur(16px)',
                                }}
                            >
                                <div
                                    className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                                    style={{ background: 'rgba(196,104,126,0.12)' }}
                                >
                                    <UserPlus size={18} style={{ color: 'var(--color-nav-active)' }} />
                                </div>
                                <div>
                                    <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                        Profile → Pair with partner
                                    </p>
                                    <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                                        Share a QR — their name appears automatically
                                    </p>
                                </div>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.64 }}>
                                <PrimaryButton
                                    label="Enter your space"
                                    glow
                                    onClick={handleComplete}
                                    icon={<Heart size={17} fill="currentColor" />}
                                />
                            </motion.div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>

            <div className="relative z-10 pb-10 flex-shrink-0" />
        </div>
    );
};

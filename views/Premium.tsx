import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    motion,
    AnimatePresence,
    LayoutGroup,
    animate,
    useInView,
    useMotionValue,
    useSpring,
    useTransform,
    useMotionTemplate,
    useReducedMotion,
} from 'framer-motion';
import {
    ArrowLeft,
    Brain,
    CalendarHeart,
    Camera,
    Check,
    ChevronRight,
    Clapperboard,
    Crown,
    Feather,
    Film,
    Flame,
    Gift,
    Heart,
    Infinity as InfinityIcon,
    Lock,
    MessagesSquare,
    Mic,
    Sparkles,
    Video,
} from 'lucide-react';
import type { CoupleProfile, ViewState } from '../types';
import { StorageService } from '../services/storage';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { daysTogetherFrom } from '../shared/dateOnly.js';
import '../styles/premium-hub.css';

interface PremiumViewProps {
    setView: (view: ViewState) => void;
}

/* ── Motion signatures (iOS-grade: soft springs, no jitter) ─────────── */

const SOFT_SPRING = { type: 'spring', stiffness: 280, damping: 32, mass: 0.9 } as const;
const PRESS_SPRING = { type: 'spring', stiffness: 560, damping: 30 } as const;

const sectionVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

const riseVariants = {
    hidden: { opacity: 0, y: 26, scale: 0.985 },
    visible: { opacity: 1, y: 0, scale: 1, transition: SOFT_SPRING },
};

/* ── Animated counter ───────────────────────────────────────────────── */

const AnimatedNumber: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: '-30px' });
    const reducedMotion = useReducedMotion();
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        if (!inView) return;
        if (reducedMotion) {
            setDisplay(value);
            return;
        }
        const controls = animate(0, value, {
            duration: 1.5,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (v) => setDisplay(Math.round(v)),
        });
        return () => controls.stop();
    }, [inView, value, reducedMotion]);

    return <span ref={ref} className={className}>{display.toLocaleString()}</span>;
};

/* ── Holographic membership card ────────────────────────────────────── */

const MemberCard: React.FC<{
    profile: CoupleProfile;
    isPremium: boolean;
    days: number;
}> = ({ profile, isPremium, days }) => {
    const mx = useMotionValue(0.5);
    const my = useMotionValue(0.5);
    const rotateX = useSpring(useTransform(my, [0, 1], [8, -8]), { stiffness: 170, damping: 18 });
    const rotateY = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 170, damping: 18 });
    const glowX = useTransform(mx, [0, 1], [15, 85]);
    const glowY = useTransform(my, [0, 1], [10, 90]);
    const glow = useMotionTemplate`radial-gradient(circle at ${glowX}% ${glowY}%, rgba(253,238,201,0.16) 0%, transparent 55%)`;

    // Cache the rect on pointer entry — getBoundingClientRect inside an
    // unthrottled pointermove handler forces layout on low-end WebViews.
    const rectRef = useRef<DOMRect | null>(null);

    const handleEnter = (e: React.PointerEvent<HTMLDivElement>) => {
        rectRef.current = e.currentTarget.getBoundingClientRect();
    };

    const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = rectRef.current ?? e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - rect.left) / rect.width);
        my.set((e.clientY - rect.top) / rect.height);
    };

    const handleLeave = () => {
        rectRef.current = null;
        mx.set(0.5);
        my.set(0.5);
    };

    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Your love';
    const memberSince = profile.premiumSince
        ? new Date(profile.premiumSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        : null;

    return (
        <div style={{ perspective: 1100 }}>
            <motion.div
                onPointerEnter={handleEnter}
                onPointerMove={handleMove}
                onPointerLeave={handleLeave}
                style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
                className="lp-foil"
            >
                <div
                    className="relative overflow-hidden px-6 py-6 rounded-[27px]"
                    style={{
                        aspectRatio: '1.62 / 1',
                        background:
                            'radial-gradient(140% 110% at 18% 0%, rgba(94,48,84,0.55) 0%, transparent 52%), linear-gradient(150deg, #271229 0%, #160a18 55%, #1f0f22 100%)',
                    }}
                >
                    {/* Pointer-tracked inner glow */}
                    <motion.div className="absolute inset-0 pointer-events-none" style={{ background: glow }} />
                    {/* Auto sheen sweep */}
                    <div className="lp-holo-sheen" />

                    <div className="relative z-10 flex h-full flex-col justify-between">
                        {/* Top row */}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-[0.34em]" style={{ color: '#f3cd86' }}>
                                Lior Gold
                            </span>
                            <Crown size={16} style={{ color: '#f3cd86' }} fill="currentColor" />
                        </div>

                        {/* Names */}
                        <div>
                            <p className="font-serif text-[1.55rem] leading-tight" style={{ color: 'rgba(255,250,242,0.96)', letterSpacing: '-0.01em' }}>
                                {myName} <span style={{ color: '#e9b765' }}>&</span> {partnerName}
                            </p>
                            <p className="mt-1 text-[11.5px]" style={{ color: 'rgba(255,246,230,0.45)' }}>
                                {days > 0 ? `${days.toLocaleString()} days together` : 'Your story, just beginning'}
                            </p>
                        </div>

                        {/* Bottom row */}
                        <div className="flex items-end justify-between">
                            <AnimatePresence mode="wait" initial={false}>
                                {isPremium ? (
                                    <motion.span
                                        key="member"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={SOFT_SPRING}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em]"
                                        style={{ background: 'rgba(246,199,104,0.14)', border: '1px solid rgba(246,199,104,0.32)', color: '#f6c768' }}
                                    >
                                        <Check size={10} strokeWidth={3} />
                                        Gold member{memberSince ? ` · ${memberSince}` : ''}
                                    </motion.span>
                                ) : (
                                    <motion.span
                                        key="reserved"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={SOFT_SPRING}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em]"
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,246,230,0.55)' }}
                                    >
                                        <Lock size={10} />
                                        Reserved for you
                                    </motion.span>
                                )}
                            </AnimatePresence>
                            <Heart size={14} style={{ color: 'rgba(236,72,153,0.7)' }} fill="currentColor" strokeWidth={0} />
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

/* ── Usage meter (free-tier progress) ───────────────────────────────── */

const UsageMeter: React.FC<{ used: number; limit: number; tint: string; isPremium: boolean }> = ({ used, limit, tint, isPremium }) => {
    if (isPremium) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#f6c768' }}>
                <InfinityIcon size={11} strokeWidth={2.6} />
                Unlimited
            </span>
        );
    }
    const pct = Math.min(1, used / limit);
    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,246,230,0.4)' }}>
                    {used} of {limit} free
                </span>
                {pct >= 1 && (
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: tint }}>Full</span>
                )}
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.max(4, pct * 100)}%` }}
                    viewport={{ once: true, margin: '-20px' }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${tint}, ${tint}cc)` }}
                />
            </div>
        </div>
    );
};

/* ── Unlock burst ───────────────────────────────────────────────────── */

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

/* ── Experience catalogue ───────────────────────────────────────────── */

interface Experience {
    key: string;
    view: ViewState;
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
    title: string;
    sub: string;
    tint: string;
    hero?: boolean;
    isNew?: boolean;
    usageKey?: 'surprises' | 'capsules' | 'voiceNotes';
    usageLimit?: number;
}

const NEW_EXPERIENCES: Experience[] = [
    { key: 'our-story', view: 'our-story', icon: Clapperboard, title: 'Our Story', sub: 'Your whole relationship, retold as a private film premiere', tint: '#f6c768', hero: true, isNew: true },
    { key: 'date-studio', view: 'date-studio', icon: CalendarHeart, title: 'Date Studio', sub: 'Draw tonight\'s date from the deck', tint: '#fb7185', isNew: true },
    { key: 'duet-journal', view: 'duet-journal', icon: Feather, title: 'Duet Journal', sub: 'One prompt, two pens — sealed until you both write', tint: '#c4b5fd', isNew: true },
    { key: 'depths', view: 'depths', icon: MessagesSquare, title: 'Depths', sub: 'Conversation decks for real talk', tint: '#5eead4', isNew: true },
    { key: 'love-missions', view: 'love-missions', icon: Flame, title: 'Love Missions', sub: 'Three small missions, every week', tint: '#ec4899', isNew: true },
];

const EXPERIENCES: Experience[] = [
    { key: 'daily-video', view: 'daily-video', icon: Video, title: 'Daily Video Moments', sub: '5 seconds a day, woven into a film of your fortnight', tint: '#a855f7', hero: true },
    { key: 'weekly-recap', view: 'weekly-recap', icon: Film, title: 'Weekly Story', sub: 'Your week together, retold like an editorial', tint: '#818cf8', hero: true },
    { key: 'love-tracker', view: 'partner-intelligence', icon: Brain, title: 'Love Tracker', sub: 'Patterns, love languages & gentle nudges', tint: '#ec4899', hero: true },
    { key: 'surprises', view: 'surprises', icon: Gift, title: 'Surprises', sub: 'Scheduled moments of joy', tint: '#8b5cf6', usageKey: 'surprises', usageLimit: 3 },
    { key: 'future-letters', view: 'time-capsule', icon: Lock, title: 'Future Letters', sub: 'Sealed until the day arrives', tint: '#f59e0b', usageKey: 'capsules', usageLimit: 3 },
    { key: 'voice-notes', view: 'voice-notes', icon: Mic, title: 'Voice Notes', sub: 'Your voices, kept forever', tint: '#f43f5e', usageKey: 'voiceNotes', usageLimit: 5 },
    { key: 'video-memories', view: 'add-memory', icon: Camera, title: 'Video Memories', sub: 'Video in your timeline & keepsakes', tint: '#e879f9' },
];

/* ── Free vs Gold comparison ────────────────────────────────────────── */

const COMPARE_ROWS: Array<{ label: string; free: string; gold: string }> = [
    { label: 'Memories', free: '50', gold: 'Unlimited' },
    { label: 'Voice notes', free: '5', gold: 'Unlimited' },
    { label: 'Future letters', free: '3', gold: 'Unlimited' },
    { label: 'Surprises', free: '3', gold: 'Unlimited' },
    { label: 'Video uploads', free: '—', gold: 'Everywhere' },
    { label: 'Our Story film', free: '3 chapters', gold: 'The whole film' },
    { label: 'Date Studio', free: 'Card draws', gold: 'Full planner' },
    { label: 'Duet Journal', free: '3 duets', gold: 'Unlimited' },
    { label: 'Depths decks', free: '1 deck', gold: 'All six' },
    { label: 'Love Missions', free: '1 a week', gold: 'All 3 + streaks' },
    { label: 'Fortnight films', free: 'Preview', gold: 'Included' },
    { label: 'Weekly stories', free: 'Preview', gold: 'Included' },
    { label: 'Love Tracker insights', free: 'Preview', gold: 'Included' },
];

/* ── Plans ──────────────────────────────────────────────────────────── */

type PlanId = 'monthly' | 'yearly' | 'forever';

const PLANS: Array<{ id: PlanId; name: string; price: string; cadence: string; note?: string; badge?: string }> = [
    { id: 'monthly', name: 'Monthly', price: '$2.99', cadence: '/ month' },
    { id: 'yearly', name: 'Yearly', price: '$19.99', cadence: '/ year', note: '≈ $1.67 a month', badge: 'Most loved' },
    { id: 'forever', name: 'Forever', price: '$49.99', cadence: 'once', note: 'Yours for life' },
];

/* ── Main view ──────────────────────────────────────────────────────── */

export const PremiumView: React.FC<PremiumViewProps> = ({ setView }) => {
    const [profile, setProfile] = useState<CoupleProfile>(() => StorageService.getCoupleProfile());
    const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
    const [justUnlocked, setJustUnlocked] = useState(false);
    const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    }, []);

    const counts = useMemo(() => ({
        memories: StorageService.getMemories().length,
        voiceNotes: StorageService.getVoiceNotes().length,
        capsules: StorageService.getTimeCapsules().length,
        surprises: StorageService.getSurprises().filter((s) => !s.delivered).length,
    }), []);

    const isPremium = !!profile.isPremium;
    const days = useMemo(() => daysTogetherFrom(profile.anniversaryDate), [profile.anniversaryDate]);

    const usageFor = useCallback((exp: Experience): number => {
        if (exp.usageKey === 'surprises') return counts.surprises;
        if (exp.usageKey === 'capsules') return counts.capsules;
        if (exp.usageKey === 'voiceNotes') return counts.voiceNotes;
        return 0;
    }, [counts]);

    const handleUnlock = useCallback(() => {
        if (isPremium) return;
        const current = StorageService.getCoupleProfile();
        const next: CoupleProfile = { ...current, isPremium: true, premiumSince: new Date().toISOString() };
        StorageService.saveCoupleProfile(next);
        setProfile(next);
        setJustUnlocked(true);
        feedback.celebrate();
        toast.show('Welcome to Lior Gold 👑', 'success');
        unlockTimerRef.current = setTimeout(() => setJustUnlocked(false), 1400);
    }, [isPremium]);

    const handleOpen = useCallback((view: ViewState) => {
        feedback.tap();
        setView(view);
    }, [setView]);

    const heroExperiences = EXPERIENCES.filter((e) => e.hero);
    const gridExperiences = EXPERIENCES.filter((e) => !e.hero);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lp-stage flex flex-col h-full min-h-screen"
        >
            {/* Ambient layers */}
            <div className="lp-aurora">
                <div className="lp-aurora__blob lp-aurora__blob--gold" />
                <div className="lp-aurora__blob lp-aurora__blob--rose" />
                <div className="lp-aurora__blob lp-aurora__blob--violet" />
            </div>
            <div className="lp-grain" />

            <div data-lenis-prevent className="lenis-inner relative z-10 flex-1 overflow-y-auto pb-36">
                {/* ── Floating header ───────────────────────────────── */}
                <div
                    className="sticky top-0 z-30 flex items-center justify-between px-5 pb-3"
                    style={{
                        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
                        background: 'linear-gradient(180deg, rgba(15,7,18,0.92) 0%, rgba(15,7,18,0.55) 60%, transparent 100%)',
                    }}
                >
                    <motion.button
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...SOFT_SPRING, delay: 0.05 }}
                        whileTap={{ scale: 0.86 }}
                        onClick={() => { feedback.tap(); setView('home'); }}
                        aria-label="Go back"
                        className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ color: 'rgba(255,246,230,0.85)' }}
                    >
                        <ArrowLeft size={17} strokeWidth={2.4} />
                    </motion.button>
                    <motion.span
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SOFT_SPRING, delay: 0.12 }}
                        className="text-[10px] font-bold uppercase tracking-[0.4em]"
                        style={{ color: 'rgba(246,199,104,0.75)' }}
                    >
                        Lior Premium
                    </motion.span>
                    <div className="w-10 h-10" aria-hidden="true" />
                </div>

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={sectionVariants}
                    className="px-5 mx-auto w-full max-w-[480px]"
                >
                    {/* ── Hero ──────────────────────────────────────── */}
                    <motion.div variants={riseVariants} className="flex flex-col items-center text-center pt-7 pb-8">
                        <div className="lp-emblem mb-6">
                            <div className="lp-orbit"><span className="lp-orbit__spark" /></div>
                            <div className="lp-orbit lp-orbit--reverse"><span className="lp-orbit__spark" /></div>
                            <div
                                className="relative flex items-center justify-center w-[76px] h-[76px] rounded-[24px]"
                                style={{
                                    background: 'linear-gradient(140deg, rgba(246,199,104,0.22) 0%, rgba(185,138,62,0.34) 100%)',
                                    border: '1px solid rgba(246,199,104,0.4)',
                                    boxShadow: '0 18px 50px rgba(246,199,104,0.18), inset 0 1px 0 rgba(255,246,222,0.25)',
                                }}
                            >
                                <Crown size={34} strokeWidth={1.7} style={{ color: '#f6c768' }} />
                            </div>
                        </div>

                        <h1 className="font-serif text-[2.3rem] leading-[1.04]" style={{ letterSpacing: '-0.025em' }}>
                            <span style={{ color: 'rgba(255,250,242,0.95)' }}>One membership,</span>
                            <br />
                            <span className="lp-shimmer-text">every way to love</span>
                        </h1>
                        <p className="mt-4 max-w-[30ch] text-[14px] leading-relaxed" style={{ color: 'rgba(255,246,230,0.5)' }}>
                            Films, stories, insights and an unlimited vault — built for the two of you.
                        </p>
                    </motion.div>

                    {/* ── Membership card ───────────────────────────── */}
                    <motion.div variants={riseVariants} className="relative">
                        {justUnlocked && <UnlockBurst />}
                        <MemberCard profile={profile} isPremium={isPremium} days={days} />
                    </motion.div>

                    {/* ── Story so far ──────────────────────────────── */}
                    <motion.div variants={riseVariants} className="grid grid-cols-3 gap-2.5 mt-6">
                        {[
                            { value: counts.memories, label: 'Memories' },
                            { value: counts.voiceNotes, label: 'Voice notes' },
                            { value: days, label: 'Days together' },
                        ].map((stat) => (
                            <div key={stat.label} className="lp-glass rounded-2xl px-3 py-4 text-center">
                                <AnimatedNumber
                                    value={stat.value}
                                    className="block font-serif text-[1.6rem] leading-none"
                                />
                                <span className="mt-1.5 block text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(255,246,230,0.4)' }}>
                                    {stat.label}
                                </span>
                            </div>
                        ))}
                    </motion.div>

                    {/* ── New this season ───────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                            New this season
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                    </motion.div>

                    <div className="flex flex-col gap-3">
                        {NEW_EXPERIENCES.filter((e) => e.hero).map((exp) => {
                            const Icon = exp.icon;
                            return (
                                <motion.button
                                    key={exp.key}
                                    variants={riseVariants}
                                    whileTap={{ scale: 0.975 }}
                                    transition={PRESS_SPRING}
                                    onClick={() => handleOpen(exp.view)}
                                    className="lp-holo-sheen relative overflow-hidden w-full rounded-[1.6rem] p-5 text-left"
                                    style={{
                                        background: 'linear-gradient(145deg, rgba(246,199,104,0.1) 0%, rgba(255,255,255,0.02) 55%)',
                                        border: `1px solid ${exp.tint}45`,
                                    }}
                                >
                                    <div
                                        className="lp-float absolute -top-14 -right-14 w-44 h-44 rounded-full blur-3xl pointer-events-none"
                                        style={{ background: `radial-gradient(circle, ${exp.tint}38 0%, transparent 70%)` }}
                                    />
                                    <span
                                        className="absolute top-3.5 right-3.5 z-10 px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-[0.2em]"
                                        style={{ background: 'rgba(246,199,104,0.16)', border: '1px solid rgba(246,199,104,0.4)', color: '#f6c768' }}
                                    >
                                        New
                                    </span>
                                    <div className="relative z-10 flex items-center gap-4">
                                        <div
                                            className="flex w-12 h-12 shrink-0 items-center justify-center rounded-2xl"
                                            style={{ background: `${exp.tint}1f`, border: `1px solid ${exp.tint}3d` }}
                                        >
                                            <Icon size={22} style={{ color: exp.tint }} />
                                        </div>
                                        <div className="flex-1 min-w-0 pr-8">
                                            <h3 className="font-serif text-[1.15rem] leading-tight" style={{ color: 'rgba(255,250,242,0.95)' }}>
                                                {exp.title}
                                            </h3>
                                            <p className="mt-1 text-[11.5px] leading-snug" style={{ color: 'rgba(255,246,230,0.45)' }}>
                                                {exp.sub}
                                            </p>
                                        </div>
                                        <ChevronRight size={17} style={{ color: 'rgba(255,246,230,0.28)' }} />
                                    </div>
                                </motion.button>
                            );
                        })}

                        <div className="grid grid-cols-2 gap-3">
                            {NEW_EXPERIENCES.filter((e) => !e.hero).map((exp) => {
                                const Icon = exp.icon;
                                return (
                                    <motion.button
                                        key={exp.key}
                                        variants={riseVariants}
                                        whileTap={{ scale: 0.96 }}
                                        transition={PRESS_SPRING}
                                        onClick={() => handleOpen(exp.view)}
                                        className="relative overflow-hidden rounded-[1.4rem] p-4 text-left flex flex-col gap-3"
                                        style={{
                                            background: 'linear-gradient(150deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.018) 100%)',
                                            border: `1px solid ${exp.tint}30`,
                                        }}
                                    >
                                        <span
                                            className="absolute top-3 right-3 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-[0.18em]"
                                            style={{ background: 'rgba(246,199,104,0.14)', border: '1px solid rgba(246,199,104,0.35)', color: '#f6c768' }}
                                        >
                                            New
                                        </span>
                                        <div
                                            className="flex w-10 h-10 items-center justify-center rounded-xl"
                                            style={{ background: `${exp.tint}1c`, border: `1px solid ${exp.tint}38` }}
                                        >
                                            <Icon size={18} style={{ color: exp.tint }} />
                                        </div>
                                        <div>
                                            <h4 className="text-[13px] font-semibold leading-tight" style={{ color: 'rgba(255,250,242,0.92)' }}>
                                                {exp.title}
                                            </h4>
                                            <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: 'rgba(255,246,230,0.38)' }}>
                                                {exp.sub}
                                            </p>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Experiences ───────────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                            {isPremium ? 'Your experiences' : 'The collection'}
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                    </motion.div>

                    <div className="flex flex-col gap-3">
                        {heroExperiences.map((exp) => {
                            const Icon = exp.icon;
                            return (
                                <motion.button
                                    key={exp.key}
                                    variants={riseVariants}
                                    whileTap={{ scale: 0.975 }}
                                    transition={PRESS_SPRING}
                                    onClick={() => handleOpen(exp.view)}
                                    className="relative overflow-hidden w-full rounded-[1.6rem] p-5 text-left"
                                    style={{
                                        background: 'linear-gradient(145deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)',
                                        border: `1px solid ${exp.tint}33`,
                                    }}
                                >
                                    <div
                                        className="lp-float absolute -top-14 -right-14 w-44 h-44 rounded-full blur-3xl pointer-events-none"
                                        style={{ background: `radial-gradient(circle, ${exp.tint}2e 0%, transparent 70%)` }}
                                    />
                                    <div className="relative z-10 flex items-center gap-4">
                                        <div
                                            className="flex w-12 h-12 shrink-0 items-center justify-center rounded-2xl"
                                            style={{ background: `${exp.tint}1f`, border: `1px solid ${exp.tint}3d` }}
                                        >
                                            <Icon size={22} style={{ color: exp.tint }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-[15px] font-semibold leading-tight" style={{ color: 'rgba(255,250,242,0.94)' }}>
                                                {exp.title}
                                            </h3>
                                            <p className="mt-1 text-[11.5px] leading-snug" style={{ color: 'rgba(255,246,230,0.42)' }}>
                                                {exp.sub}
                                            </p>
                                        </div>
                                        <ChevronRight size={17} style={{ color: 'rgba(255,246,230,0.28)' }} />
                                    </div>
                                </motion.button>
                            );
                        })}

                        <div className="grid grid-cols-2 gap-3">
                            {gridExperiences.map((exp) => {
                                const Icon = exp.icon;
                                return (
                                    <motion.button
                                        key={exp.key}
                                        variants={riseVariants}
                                        whileTap={{ scale: 0.96 }}
                                        transition={PRESS_SPRING}
                                        onClick={() => handleOpen(exp.view)}
                                        className="relative overflow-hidden rounded-[1.4rem] p-4 text-left flex flex-col gap-3"
                                        style={{
                                            background: 'linear-gradient(150deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.018) 100%)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                        }}
                                    >
                                        <div
                                            className="flex w-10 h-10 items-center justify-center rounded-xl"
                                            style={{ background: `${exp.tint}1c`, border: `1px solid ${exp.tint}38` }}
                                        >
                                            <Icon size={18} style={{ color: exp.tint }} />
                                        </div>
                                        <div>
                                            <h4 className="text-[13px] font-semibold leading-tight" style={{ color: 'rgba(255,250,242,0.92)' }}>
                                                {exp.title}
                                            </h4>
                                            <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: 'rgba(255,246,230,0.38)' }}>
                                                {exp.sub}
                                            </p>
                                        </div>
                                        {exp.usageKey && exp.usageLimit ? (
                                            <UsageMeter used={usageFor(exp)} limit={exp.usageLimit} tint={exp.tint} isPremium={isPremium} />
                                        ) : (
                                            <span
                                                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                                                style={{ color: isPremium ? '#f6c768' : 'rgba(255,246,230,0.35)' }}
                                            >
                                                {isPremium ? <><Check size={11} strokeWidth={3} /> Unlocked</> : <><Lock size={10} /> Gold only</>}
                                            </span>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Free vs Gold ──────────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                            Free vs Gold
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                    </motion.div>

                    <motion.div
                        variants={riseVariants}
                        className="rounded-[1.6rem] overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                        <div className="grid grid-cols-[1.4fr_0.8fr_1fr] px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span />
                            <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-center" style={{ color: 'rgba(255,246,230,0.35)' }}>Free</span>
                            <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-center inline-flex items-center justify-center gap-1" style={{ color: '#f6c768' }}>
                                <Crown size={9} fill="currentColor" /> Gold
                            </span>
                        </div>
                        {COMPARE_ROWS.map((row, i) => (
                            <motion.div
                                key={row.label}
                                initial={{ opacity: 0, x: -16 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: '-30px' }}
                                transition={{ ...SOFT_SPRING, delay: i * 0.045 }}
                                className="grid grid-cols-[1.4fr_0.8fr_1fr] items-center px-5 py-3.5"
                                style={{ borderBottom: i < COMPARE_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.045)' : 'none' }}
                            >
                                <span className="text-[12.5px] font-medium" style={{ color: 'rgba(255,250,242,0.82)' }}>{row.label}</span>
                                <span className="text-[12px] text-center" style={{ color: 'rgba(255,246,230,0.35)' }}>{row.free}</span>
                                <span className="text-[12px] font-semibold text-center inline-flex items-center justify-center gap-1.5" style={{ color: '#f3cd86' }}>
                                    {row.gold === 'Unlimited' && <InfinityIcon size={12} strokeWidth={2.4} />}
                                    {row.gold}
                                </span>
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* ── Plans + CTA ───────────────────────────────── */}
                    {!isPremium && (
                        <>
                            <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                                <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                                    Choose your pace
                                </span>
                                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                            </motion.div>

                            <LayoutGroup id="lp-plans">
                            <motion.div variants={riseVariants} className="grid grid-cols-3 gap-2.5">
                                {PLANS.map((plan) => {
                                    const selected = selectedPlan === plan.id;
                                    return (
                                        <motion.button
                                            key={plan.id}
                                            whileTap={{ scale: 0.95 }}
                                            transition={PRESS_SPRING}
                                            onClick={() => { setSelectedPlan(plan.id); feedback.tap(); }}
                                            className="relative rounded-[1.3rem] px-3 pt-5 pb-4 text-center"
                                            style={{
                                                background: selected ? 'rgba(246,199,104,0.07)' : 'rgba(255,255,255,0.035)',
                                                border: '1px solid rgba(255,255,255,0.07)',
                                            }}
                                        >
                                            {selected && (
                                                <motion.div
                                                    layoutId="lp-plan-ring"
                                                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                                    className="absolute inset-0 rounded-[1.3rem] pointer-events-none"
                                                    style={{
                                                        border: '1.5px solid rgba(246,199,104,0.75)',
                                                        boxShadow: '0 10px 34px rgba(246,199,104,0.16), inset 0 1px 0 rgba(253,238,201,0.18)',
                                                    }}
                                                />
                                            )}
                                            {plan.badge && (
                                                <span
                                                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-full text-[8px] font-bold uppercase tracking-[0.14em]"
                                                    style={{ background: 'linear-gradient(135deg, #f6c768, #d99c3e)', color: '#23120a' }}
                                                >
                                                    {plan.badge}
                                                </span>
                                            )}
                                            <span className="block text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: selected ? '#f6c768' : 'rgba(255,246,230,0.45)' }}>
                                                {plan.name}
                                            </span>
                                            <span className="mt-2 block font-serif text-[1.25rem] leading-none" style={{ color: 'rgba(255,250,242,0.95)' }}>
                                                {plan.price}
                                            </span>
                                            <span className="mt-1 block text-[9.5px]" style={{ color: 'rgba(255,246,230,0.35)' }}>
                                                {plan.cadence}
                                            </span>
                                            {plan.note && (
                                                <span className="mt-1.5 block text-[9px]" style={{ color: selected ? 'rgba(246,199,104,0.7)' : 'rgba(255,246,230,0.28)' }}>
                                                    {plan.note}
                                                </span>
                                            )}
                                        </motion.button>
                                    );
                                })}
                            </motion.div>
                            </LayoutGroup>

                            <motion.div
                                variants={riseVariants}
                                className="mt-4 flex items-start gap-2.5 px-4 py-3.5 rounded-2xl"
                                style={{ background: 'rgba(246,199,104,0.06)', border: '1px solid rgba(246,199,104,0.16)' }}
                            >
                                <Sparkles size={14} className="shrink-0 mt-0.5" style={{ color: '#f6c768' }} />
                                <p className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(255,246,230,0.55)' }}>
                                    <span className="font-semibold" style={{ color: '#f3cd86' }}>Founding couples offer</span> — everything is free during early access. Pricing above is a preview of what's ahead.
                                </p>
                            </motion.div>

                            <motion.div variants={riseVariants} className="mt-5">
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    transition={PRESS_SPRING}
                                    onClick={handleUnlock}
                                    className="lp-cta w-full h-[56px] rounded-2xl font-bold text-[15.5px] tracking-wide"
                                    style={{
                                        background: 'linear-gradient(135deg, #f6c768 0%, #d99c3e 100%)',
                                        color: '#23120a',
                                        boxShadow: '0 14px 40px rgba(246,199,104,0.3), inset 0 1px 0 rgba(255,246,222,0.45)',
                                    }}
                                >
                                    Unlock Lior Gold
                                </motion.button>
                                <p className="mt-3 text-center text-[11px]" style={{ color: 'rgba(255,246,230,0.35)' }}>
                                    Free for founding couples · no payment needed
                                </p>
                                <button
                                    onClick={() => { feedback.tap(); toast.show('Nothing to restore yet — purchases arrive with public launch', 'info'); }}
                                    className="mt-1 w-full py-2.5 text-center text-[12px] font-medium active:scale-95 transition-transform"
                                    style={{ color: 'rgba(255,246,230,0.3)' }}
                                >
                                    Restore purchases
                                </button>
                            </motion.div>
                        </>
                    )}

                    {isPremium && (
                        <motion.div
                            variants={riseVariants}
                            initial={justUnlocked ? { opacity: 0, scale: 0.92 } : undefined}
                            animate={justUnlocked ? { opacity: 1, scale: 1, transition: SOFT_SPRING } : undefined}
                            className="lp-foil mt-8"
                        >
                            <div
                                className="flex items-center gap-4 px-5 py-5 rounded-[27px]"
                                style={{ background: 'linear-gradient(150deg, #221026 0%, #160a18 100%)' }}
                            >
                                <div
                                    className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full"
                                    style={{ background: 'rgba(246,199,104,0.15)', border: '1px solid rgba(246,199,104,0.4)' }}
                                >
                                    <Check size={18} strokeWidth={2.8} style={{ color: '#f6c768' }} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[14px] font-semibold" style={{ color: 'rgba(255,250,242,0.94)' }}>
                                        Gold membership active
                                    </p>
                                    <p className="mt-0.5 text-[11.5px]" style={{ color: 'rgba(255,246,230,0.45)' }}>
                                        Everything is unlocked, for both of you. Always.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Footer ────────────────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 flex items-center justify-center gap-2">
                        <Heart size={11} style={{ color: 'rgba(236,72,153,0.6)' }} fill="currentColor" strokeWidth={0} />
                        <span className="text-[11px]" style={{ color: 'rgba(255,246,230,0.3)' }}>
                            Built for the two of you. Always.
                        </span>
                    </motion.div>
                </motion.div>
            </div>
        </motion.div>
    );
};

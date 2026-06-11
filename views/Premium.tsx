import ReactDOM from 'react-dom';
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
    Download,
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
import type { CoupleProfile, DatePlan, ViewState } from '../types';
import { StorageService } from '../services/storage';
import { useAuroraParallax } from '../components/premium/GoldKit';
import { PremiumFeaturesStore, mondayOf } from '../services/premiumFeatures';
import { buildStoryFilm, runtimeLabel } from '../components/premium/our-story/chapters';
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

/* ── Byte formatting for the vault receipt ──────────────────────────── */

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string; strokeWidth?: number; 'aria-hidden'?: React.AriaAttributes['aria-hidden'] }>;
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
    { id: 'monthly', name: 'Monthly', price: '$2.99', cadence: '/ month', note: '≈ one coffee' },
    { id: 'yearly', name: 'Yearly', price: '$19.99', cadence: '/ year', note: '$1.67 a month', badge: 'Most loved' },
    { id: 'forever', name: 'Forever', price: '$49.99', cadence: 'once', note: 'One date night, once' },
];

const PLAN_VALUE_LINE: Record<PlanId, string> = {
    monthly: 'All twelve experiences and an unlimited vault — for the price of one coffee a month.',
    yearly: 'Everything Gold does, every single day, for about five cents a day.',
    forever: 'Pay once. Every experience — and every future one — for the rest of your story.',
};

/* ── Main view ──────────────────────────────────────────────────────── */

export const PremiumView: React.FC<PremiumViewProps> = ({ setView }) => {
    const auroraRef = useAuroraParallax();
    const [profile, setProfile] = useState<CoupleProfile>(() => StorageService.getCoupleProfile());
    const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
    const [justUnlocked, setJustUnlocked] = useState(false);
    const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    }, []);

    const counts = useMemo(() => {
        const voiceNotes = StorageService.getVoiceNotes();
        const memories = StorageService.getMemories();
        return {
            memories: memories.length,
            memoriesWithMedia: memories.filter((m) => m.imageId || m.image || m.storagePath || m.videoId || m.videoStoragePath).length,
            voiceNotes: voiceNotes.length,
            voiceSeconds: voiceNotes.reduce((sum, n) => sum + (Number.isFinite(n.duration) ? n.duration : 0), 0),
            capsules: StorageService.getTimeCapsules().length,
            surprises: StorageService.getSurprises().filter((s) => !s.delivered).length,
            vaultBytes: StorageService.getManagedStorageStats().totalBytes,
        };
    }, []);

    const isPremium = !!profile.isPremium;
    const days = useMemo(() => daysTogetherFrom(profile.anniversaryDate), [profile.anniversaryDate]);

    // ── Live pulse: the real, current state of every experience ────────
    const live = useMemo(() => {
        const story = buildStoryFilm();
        const plans = PremiumFeaturesStore.getDatePlans();
        const duets = PremiumFeaturesStore.getDuetEntries();
        const depthsState = PremiumFeaturesStore.getDepthsState();
        const missionState = PremiumFeaturesStore.getMissionState();
        const myName = profile.myName?.trim() || 'You';
        const partnerName = profile.partnerName?.trim() || 'Your love';

        const now = Date.now();
        const inDaysLabel = (iso: string) => {
            const diff = Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
            if (diff <= 0) return 'tonight';
            if (diff === 1) return 'tomorrow';
            return `in ${diff} days`;
        };

        const upcomingPlan: DatePlan | undefined = plans
            .filter((p) => !p.completedAt && p.scheduledFor && new Date(p.scheduledFor).getTime() > now - 6 * 3_600_000)
            .sort((a, b) => new Date(a.scheduledFor as string).getTime() - new Date(b.scheduledFor as string).getTime())[0];

        const openDuet = [...duets].reverse().find((d) => !d.revealedAt);
        const duetWaitingOn = openDuet
            ? [myName, partnerName].find((n) => !openDuet.answers[n])
            : undefined;
        const duetsRevealed = duets.filter((d) => d.revealedAt).length;

        const weekActive = missionState && missionState.weekStart === mondayOf() ? missionState : undefined;
        const missionsDone = weekActive ? weekActive.missions.filter((m) => m.completedAt).length : 0;
        const weekStreak = missionState?.weekStreak ?? 0;

        return {
            storyChapters: story.chapters.length,
            ourStory: `${story.chapters.length} scenes ready · ${runtimeLabel(story.chapters.length)}`,
            dateStudio: upcomingPlan
                ? `${upcomingPlan.emoji} ${upcomingPlan.title} — ${inDaysLabel(upcomingPlan.scheduledFor as string)}`
                : '72 ideas waiting in the deck',
            duetJournal: openDuet
                ? (duetWaitingOn ? `Sealed — waiting on ${duetWaitingOn}` : 'Both sealed — ready to reveal')
                : duetsRevealed > 0
                    ? `${duetsRevealed} duet${duetsRevealed === 1 ? '' : 's'} on the shelf`
                    : 'One prompt, two pens — start tonight',
            depths: depthsState.completedSessions > 0 || depthsState.favorites.length > 0
                ? `${depthsState.favorites.length} kept · ${depthsState.completedSessions} night${depthsState.completedSessions === 1 ? '' : 's'} played`
                : 'Six decks, light to deep',
            loveMissions: weekActive
                ? `${missionsDone} of 3 this week${weekStreak > 0 ? ` · 🔥 ${weekStreak}` : ''}`
                : 'Three new missions every Monday',
            upcomingPlan,
            upcomingPlanLabel: upcomingPlan ? inDaysLabel(upcomingPlan.scheduledFor as string) : null,
            duetWaitingOn,
            duetsRevealed,
            missionsLeft: weekActive ? Math.max(0, 3 - missionsDone) : 3,
            plansMade: plans.length,
        };
    }, [profile]);

    // Daily video is async (IndexedDB) — load it lazily so the hub chunk
    // stays lean; copy falls back gracefully until it arrives.
    const [scenesShot, setScenesShot] = useState<number | null>(null);
    const [recordedToday, setRecordedToday] = useState<boolean | null>(null);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const { VideoMomentsService } = await import('../services/videoMoments');
                const [settings, already] = await Promise.all([
                    VideoMomentsService.getSettings(),
                    VideoMomentsService.hasRecordedToday(),
                ]);
                if (cancelled) return;
                setScenesShot(settings?.totalClips ?? 0);
                setRecordedToday(already);
            } catch {
                /* fallback copy stays */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const liveFor = useCallback((key: string): string | null => {
        switch (key) {
            case 'our-story': return live.ourStory;
            case 'date-studio': return live.dateStudio;
            case 'duet-journal': return live.duetJournal;
            case 'depths': return live.depths;
            case 'love-missions': return live.loveMissions;
            case 'daily-video':
                if (recordedToday === null) return null;
                return recordedToday
                    ? `Tonight's scene is in the can${scenesShot ? ` · ${scenesShot} shot` : ''}`
                    : 'Tonight’s scene: 5 seconds, still unshot';
            default: return null;
        }
    }, [live, recordedToday, scenesShot]);

    // ── Tonight: what Gold can do for you right now ─────────────────────
    const tonight = useMemo(() => {
        const items: Array<{ key: string; view: ViewState; icon: Experience['icon']; tint: string; title: string; sub: string }> = [];
        if (recordedToday === false) {
            items.push({ key: 'shoot', view: 'daily-video', icon: Video, tint: '#a855f7', title: 'Shoot today’s scene', sub: '5 seconds, sound on' });
        }
        if (live.duetWaitingOn) {
            items.push({ key: 'duet', view: 'duet-journal', icon: Feather, tint: '#c4b5fd', title: 'A seal is waiting', sub: `${live.duetWaitingOn}’s pen is due` });
        }
        if (live.missionsLeft > 0 && live.missionsLeft < 3) {
            items.push({ key: 'mission', view: 'love-missions', icon: Flame, tint: '#ec4899', title: 'Finish a mission', sub: `${live.missionsLeft} left this week` });
        }
        if (live.upcomingPlan) {
            items.push({ key: 'plan', view: 'date-studio', icon: CalendarHeart, tint: '#fb7185', title: `${live.upcomingPlan.emoji} ${live.upcomingPlan.title}`, sub: live.upcomingPlanLabel ?? 'planned' });
        } else {
            items.push({ key: 'draw', view: 'date-studio', icon: CalendarHeart, tint: '#fb7185', title: 'Draw tonight’s date', sub: '72 ideas in the deck' });
        }
        items.push({ key: 'story', view: 'our-story', icon: Clapperboard, tint: '#f6c768', title: 'Screen Our Story', sub: `${live.storyChapters} scenes, cut from real life` });
        items.push({ key: 'depths', view: 'depths', icon: MessagesSquare, tint: '#5eead4', title: 'Go three questions deep', sub: 'pass the phone' });
        return items.slice(0, 4);
    }, [live, recordedToday]);

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

    // Live-aware card sublines: real state when we have it, brochure copy
    // only as the cold-start fallback.
    const renderSub = (exp: Experience, className: string, color: string) => {
        const liveLine = liveFor(exp.key);
        return (
            <p className={className} style={{ color }}>
                {liveLine ? (
                    <>
                        <span className="lp-live-dot lp-live-dot--inline" aria-hidden="true" />
                        {liveLine}
                    </>
                ) : exp.sub}
            </p>
        );
    };

    // Portaled to body like the app's vh-shell: lenis-content has
    // contain:paint, so a fixed header rendered inline would anchor to the
    // scroll content and ride away with it.
    const shellHeader = (
        <div className="lp-shell-header">
            <motion.button
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SOFT_SPRING, delay: 0.05 }}
                whileTap={{ scale: 0.86 }}
                onClick={() => { feedback.tap(); setView('home'); }}
                aria-label="Go back"
                className="lp-glass w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ color: 'rgba(255,246,230,0.85)' }}
            >
                <ArrowLeft size={17} strokeWidth={2.4} />
            </motion.button>
            <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SOFT_SPRING, delay: 0.12 }}
                className="text-[10px] font-bold uppercase tracking-[0.4em] text-center truncate"
                style={{ color: 'rgba(246,199,104,0.75)' }}
            >
                Lior Gold
            </motion.span>
            <div className="w-10 h-10" aria-hidden="true" />
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full min-h-screen"
            style={{ background: '#0f0712', color: 'rgba(255,251,244,0.92)' }}
        >
            {/* Fixed ambient backdrop — the page scrolls natively above it */}
            <div className="lp-backdrop lp-stage" aria-hidden="true">
                <div className="lp-aurora" ref={auroraRef}>
                    <div className="lp-aurora__blob lp-aurora__blob--gold" />
                    <div className="lp-aurora__blob lp-aurora__blob--rose" />
                    <div className="lp-aurora__blob lp-aurora__blob--violet" />
                </div>
                <div className="lp-grain" />
            </div>

            {/* Fixed glass pill header — escapes contain:paint via portal */}
            {typeof document !== 'undefined' && ReactDOM.createPortal(shellHeader, document.body)}
            <div className="lp-shell-spacer" aria-hidden="true" />

            <div className="relative z-10 pb-10">
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={sectionVariants}
                    className="px-5 mx-auto w-full max-w-[480px]"
                >
                    {/* ── Hero ──────────────────────────────────────── */}
                    <motion.div variants={riseVariants} className="relative flex flex-col items-center text-center pt-9 pb-9">
                        <div
                            aria-hidden="true"
                            className="absolute left-1/2 top-6 -translate-x-1/2 w-[130%] h-56 pointer-events-none"
                            style={{ background: 'radial-gradient(55% 60% at 50% 42%, rgba(246,199,104,0.13) 0%, rgba(236,72,153,0.05) 55%, transparent 75%)', filter: 'blur(10px)' }}
                        />
                        <div className="lp-emblem mb-7">
                            <div className="lp-orbit"><span className="lp-orbit__spark" /></div>
                            <div className="lp-orbit lp-orbit--reverse"><span className="lp-orbit__spark" /></div>
                            <div
                                className="relative flex items-center justify-center w-[84px] h-[84px] rounded-[26px]"
                                style={{
                                    background: 'linear-gradient(140deg, rgba(246,199,104,0.24) 0%, rgba(185,138,62,0.38) 100%)',
                                    border: '1px solid rgba(246,199,104,0.45)',
                                    boxShadow: '0 22px 60px rgba(246,199,104,0.22), inset 0 1px 0 rgba(255,246,222,0.28)',
                                }}
                            >
                                <Crown size={38} strokeWidth={1.6} style={{ color: '#f6c768' }} />
                            </div>
                        </div>

                        <h1 className="font-serif leading-[1.03]" style={{ fontSize: 'clamp(2.35rem, 9.5vw, 2.8rem)', letterSpacing: '-0.028em' }}>
                            <span style={{ color: 'rgba(255,250,242,0.96)' }}>One membership,</span>
                            <br />
                            <span className="lp-shimmer-text">every way to love</span>
                        </h1>
                        <p className="mt-4 max-w-[32ch] text-[14px] leading-relaxed" style={{ color: 'rgba(255,246,230,0.52)' }}>
                            Your film, date nights, duets, missions — and an unlimited vault for everything you are.
                        </p>
                        <div className="mt-5 flex items-center gap-2.5" aria-hidden="true">
                            <div className="h-px w-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,199,104,0.5))' }} />
                            <Sparkles size={11} style={{ color: 'rgba(246,199,104,0.7)' }} />
                            <div className="h-px w-10" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.5), transparent)' }} />
                        </div>
                    </motion.div>

                    {/* ── Membership card ───────────────────────────── */}
                    <motion.div variants={riseVariants} className="relative">
                        {justUnlocked && <UnlockBurst />}
                        <MemberCard profile={profile} isPremium={isPremium} days={days} />
                    </motion.div>

                    {/* ── Tonight: live, doable right now ───────────── */}
                    <motion.div variants={riseVariants} className="mt-8 mb-3 flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                            Tonight
                        </span>
                        <span className="lp-live-dot" aria-hidden="true" />
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                    </motion.div>

                    <motion.div
                        variants={riseVariants}
                        className="lq-track flex gap-2 overflow-x-auto"
                        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
                    >
                        {tonight.map((item) => {
                            const Icon = item.icon;
                            return (
                                <motion.button
                                    key={item.key}
                                    whileTap={{ scale: 0.95 }}
                                    transition={PRESS_SPRING}
                                    onClick={() => handleOpen(item.view)}
                                    className="lq lq-press shrink-0 flex items-center gap-3 pl-2.5 pr-4 py-2.5 rounded-[1.35rem] text-left"
                                    style={{ maxWidth: '15rem' }}
                                >
                                    <span
                                        className="flex w-9 h-9 shrink-0 items-center justify-center rounded-xl"
                                        style={{ background: `${item.tint}1f`, border: `1px solid ${item.tint}40` }}
                                    >
                                        <Icon size={16} style={{ color: item.tint }} />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[12.5px] font-semibold leading-tight truncate" style={{ color: 'rgba(255,250,242,0.93)' }}>
                                            {item.title}
                                        </span>
                                        <span className="block text-[10.5px] mt-0.5 truncate" style={{ color: 'rgba(255,246,230,0.42)' }}>
                                            {item.sub}
                                        </span>
                                    </span>
                                </motion.button>
                            );
                        })}
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
                                    className="lq lq--sheen lq-press relative overflow-hidden w-full rounded-[1.6rem] p-5 text-left"
                                    style={{ background: 'linear-gradient(145deg, rgba(246,199,104,0.12) 0%, rgba(255,255,255,0.02) 55%)' }}
                                >
                                    <Icon size={118} strokeWidth={1} className="lq-ghost" style={{ color: exp.tint }} aria-hidden="true" />
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
                                            {renderSub(exp, 'mt-1 text-[11.5px] leading-snug', 'rgba(255,246,230,0.45)')}
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
                                        className="lq lq-press relative overflow-hidden rounded-[1.4rem] p-4 text-left flex flex-col gap-3"
                                    >
                                        <Icon size={88} strokeWidth={1} className="lq-ghost" style={{ color: exp.tint }} aria-hidden="true" />
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
                                            {renderSub(exp, 'mt-0.5 text-[10.5px] leading-snug', 'rgba(255,246,230,0.38)')}
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
                                    className="lq lq--sheen lq-press relative overflow-hidden w-full rounded-[1.6rem] p-5 text-left"
                                >
                                    <Icon size={104} strokeWidth={1} className="lq-ghost" style={{ color: exp.tint }} aria-hidden="true" />
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
                                            {renderSub(exp, 'mt-1 text-[11.5px] leading-snug', 'rgba(255,246,230,0.42)')}
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
                                        className="lq lq-press relative overflow-hidden rounded-[1.4rem] p-4 text-left flex flex-col gap-3"
                                    >
                                        <Icon size={88} strokeWidth={1} className="lq-ghost" style={{ color: exp.tint }} aria-hidden="true" />
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
                                            {renderSub(exp, 'mt-0.5 text-[10.5px] leading-snug', 'rgba(255,246,230,0.38)')}
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

                    {/* ── The vault receipt ─────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                            What you’ve already built
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                    </motion.div>

                    <motion.div
                        variants={riseVariants}
                        className="lq lq--blur lq--sheen relative overflow-hidden rounded-[1.6rem] px-5 pt-5 pb-4"
                    >
                        <Crown size={120} strokeWidth={0.8} className="lq-ghost" style={{ color: '#f6c768' }} aria-hidden="true" />
                        <div className="relative flex flex-col gap-2.5">
                            {[
                                { label: 'Memories kept', value: counts.memories, always: true },
                                { label: 'Voice notes', value: counts.voiceNotes, always: true, suffix: counts.voiceSeconds >= 60 ? `${Math.round(counts.voiceSeconds / 60)} min` : undefined },
                                { label: 'Letters sealed for later', value: counts.capsules },
                                { label: 'Surprises waiting', value: counts.surprises },
                                { label: 'Duets revealed', value: live.duetsRevealed },
                                { label: 'Dates planned', value: live.plansMade },
                                { label: 'Days together', value: days, always: true },
                            ].filter((row) => row.always || row.value > 0).map((row) => (
                                <div key={row.label} className="flex items-baseline gap-2.5">
                                    <span className="text-[12px] shrink-0" style={{ color: 'rgba(255,246,230,0.55)' }}>{row.label}</span>
                                    <span className="flex-1 translate-y-[-3px]" style={{ borderBottom: '1px dotted rgba(255,246,230,0.16)' }} />
                                    {row.suffix && (
                                        <span className="text-[10.5px] shrink-0" style={{ color: 'rgba(255,246,230,0.35)' }}>{row.suffix}</span>
                                    )}
                                    <AnimatedNumber value={row.value} className="lp-num-gold font-serif text-[1.2rem] leading-none shrink-0" />
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(246,199,104,0.16)' }}>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,246,230,0.38)' }}>
                                In your vault
                            </span>
                            <span className="font-serif text-[13.5px]" style={{ color: '#f3cd86' }}>{formatBytes(counts.vaultBytes)}</span>
                        </div>
                        <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: isPremium ? 'rgba(246,199,104,0.75)' : 'rgba(255,246,230,0.45)' }}>
                            {isPremium
                                ? 'No caps. Nothing expires. Synced to both of you.'
                                : 'Free keeps your first 50 memories — Gold keeps every single one, forever.'}
                        </p>
                    </motion.div>

                    {/* ── Free vs Gold ──────────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                            Free vs Gold
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                    </motion.div>

                    <motion.div
                        variants={riseVariants}
                        className="lq rounded-[1.6rem] overflow-hidden"
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
                                            className="lq lq-press relative rounded-[1.3rem] px-3 pt-5 pb-4 text-center"
                                            style={{
                                                background: selected
                                                    ? 'linear-gradient(160deg, rgba(246,199,104,0.13) 0%, rgba(246,199,104,0.04) 100%)'
                                                    : undefined,
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

                            <motion.div variants={riseVariants} className="mt-3.5 px-2 text-center" style={{ minHeight: '2.3rem' }}>
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.p
                                        key={selectedPlan}
                                        initial={{ opacity: 0, y: 7 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -7 }}
                                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                        className="text-[12px] leading-relaxed"
                                        style={{ color: 'rgba(255,246,230,0.52)' }}
                                    >
                                        {PLAN_VALUE_LINE[selectedPlan]}
                                    </motion.p>
                                </AnimatePresence>
                            </motion.div>

                            <motion.div
                                variants={riseVariants}
                                className="mt-3 flex items-start gap-2.5 px-4 py-3.5 rounded-2xl"
                                style={{ background: 'rgba(246,199,104,0.06)', border: '1px solid rgba(246,199,104,0.16)' }}
                            >
                                <Sparkles size={14} className="shrink-0 mt-0.5" style={{ color: '#f6c768' }} />
                                <p className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(255,246,230,0.55)' }}>
                                    <span className="font-semibold" style={{ color: '#f3cd86' }}>Founding couples offer</span> — everything is free during early access, and your founding price stays locked. It never rises.
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

                    {/* ── The Gold promise ──────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(246,199,104,0.8)' }}>
                            The Gold promise
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                    </motion.div>

                    <motion.div variants={riseVariants} className="flex flex-col gap-2.5">
                        {[
                            { icon: InfinityIcon, title: 'Every future experience, included', sub: 'New Gold features land inside your membership — never a higher tier.' },
                            { icon: Download, title: 'Your story is yours', sub: 'Export everything, anytime — photos, letters, voices, all of it.' },
                            { icon: Heart, title: 'Leave anytime, keep everything', sub: 'Cancel whenever. Nothing the two of you made ever disappears.' },
                        ].map((row) => {
                            const Icon = row.icon;
                            return (
                                <div
                                    key={row.title}
                                    className="lq flex items-center gap-3.5 px-4 py-3.5 rounded-2xl"
                                >
                                    <div
                                        className="flex w-10 h-10 shrink-0 items-center justify-center rounded-xl"
                                        style={{ background: 'rgba(246,199,104,0.12)', border: '1px solid rgba(246,199,104,0.28)' }}
                                    >
                                        <Icon size={17} style={{ color: '#f3cd86' }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold leading-tight" style={{ color: 'rgba(255,250,242,0.92)' }}>{row.title}</p>
                                        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'rgba(255,246,230,0.42)' }}>{row.sub}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </motion.div>

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

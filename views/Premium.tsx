import ReactDOM from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    motion,
    AnimatePresence,
    LayoutGroup,
    useMotionValue,
    useSpring,
    useTransform,
    useMotionTemplate,
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
import { buildStoryFilm } from '../components/premium/our-story/chapters';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { daysTogetherFrom } from '../shared/dateOnly.js';
import '../styles/premium-hub.css';

interface PremiumViewProps {
    setView: (view: ViewState) => void;
}

/* ── Editorial numbers — small counts read as words, not metrics ────── */

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const asWords = (n: number): string => (n >= 0 && n < NUM_WORDS.length ? NUM_WORDS[n] : n.toLocaleString());
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

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
    const glow = useMotionTemplate`radial-gradient(circle at ${glowX}% ${glowY}%, rgba(255,255,255,0.16) 0%, transparent 55%)`;

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
                            'radial-gradient(140% 110% at 18% 0%, rgba(124,92,255,0.22) 0%, transparent 52%), linear-gradient(150deg, #16151e 0%, #0b0a10 55%, #14121b 100%)',
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
                            <p className="font-serif text-[1.55rem] leading-tight" style={{ color: 'rgba(255,251,250,0.96)', letterSpacing: '-0.01em' }}>
                                {myName} <span style={{ color: '#e9b765' }}>&</span> {partnerName}
                            </p>
                            <p className="mt-1 text-[11.5px]" style={{ color: 'rgba(255,248,248,0.45)' }}>
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
                                        style={{ background: 'rgba(255,92,124,0.14)', border: '1px solid rgba(255,92,124,0.32)', color: '#ff5c7c' }}
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
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,248,248,0.55)' }}
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
}

/**
 * The collection: three experiences get the cinematic treatment, the rest
 * stay quiet. One star at a time — that is what makes anything feel
 * important.
 */
const MARQUEE_EXPERIENCES: Experience[] = [
    { key: 'our-story', view: 'our-story', icon: Clapperboard, title: 'Our Story', sub: 'A film only you two could make — cut from your real days.', tint: '#ff5c7c' },
    { key: 'daily-video', view: 'daily-video', icon: Video, title: 'Daily Video Moments', sub: 'Five seconds a day. A film every fortnight.', tint: '#a855f7' },
    { key: 'date-studio', view: 'date-studio', icon: CalendarHeart, title: 'Date Studio', sub: 'Seventy-two nights, shuffled. Draw one.', tint: '#fb7185' },
];

const QUIET_EXPERIENCES: Experience[] = [
    { key: 'duet-journal', view: 'duet-journal', icon: Feather, title: 'Duet Journal', sub: '', tint: '#c4b5fd' },
    { key: 'depths', view: 'depths', icon: MessagesSquare, title: 'Depths', sub: '', tint: '#5eead4' },
    { key: 'love-missions', view: 'love-missions', icon: Flame, title: 'Love Missions', sub: '', tint: '#ec4899' },
    { key: 'weekly-recap', view: 'weekly-recap', icon: Film, title: 'Weekly Story', sub: '', tint: '#818cf8' },
    { key: 'love-tracker', view: 'partner-intelligence', icon: Brain, title: 'Love Tracker', sub: '', tint: '#d96aff' },
    { key: 'surprises', view: 'surprises', icon: Gift, title: 'Surprises', sub: '', tint: '#8b5cf6' },
    { key: 'future-letters', view: 'time-capsule', icon: Lock, title: 'Future Letters', sub: '', tint: '#f59e0b' },
    { key: 'voice-notes', view: 'voice-notes', icon: Mic, title: 'Voice Notes', sub: '', tint: '#f43f5e' },
    { key: 'video-memories', view: 'add-memory', icon: Camera, title: 'Video Memories', sub: '', tint: '#e879f9' },
];

/* ── Free vs Gold — five lines, written like a person ───────────────── */

const COMPARE_ROWS: Array<{ label: string; free: string; gold: string }> = [
    { label: 'Your vault', free: 'First fifty', gold: 'Everything, forever' },
    { label: 'Voices, letters & surprises', free: 'A few', gold: 'Unlimited' },
    { label: 'Video', free: '—', gold: 'Everywhere' },
    { label: 'Films, stories & insights', free: 'Previews', gold: 'All of it' },
    { label: 'Whatever we build next', free: '—', gold: 'Included' },
];

/* ── Plans ──────────────────────────────────────────────────────────── */

type PlanId = 'monthly' | 'yearly' | 'forever';

const PLANS: Array<{ id: PlanId; name: string; price: string; cadence: string; note?: string; badge?: string }> = [
    { id: 'monthly', name: 'Monthly', price: '$2.99', cadence: '/ month' },
    { id: 'yearly', name: 'Yearly', price: '$19.99', cadence: '/ year', badge: 'Most loved' },
    { id: 'forever', name: 'Forever', price: '$49.99', cadence: 'once' },
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

        const missionsLeft = weekActive ? Math.max(0, 3 - missionsDone) : 3;

        return {
            storyChapters: story.chapters.length,
            ourStory: `Your film has ${asWords(story.chapters.length)} scene${story.chapters.length === 1 ? '' : 's'} now.`,
            dateStudio: upcomingPlan
                ? `${upcomingPlan.emoji} ${upcomingPlan.title} — ${inDaysLabel(upcomingPlan.scheduledFor as string)}.`
                : 'The deck is shuffled. Draw one.',
            duetJournal: openDuet
                ? (duetWaitingOn ? `Sealed — only ${duetWaitingOn}’s pen is missing.` : 'Both sealed. Reveal it together.')
                : duetsRevealed > 0
                    ? 'Your duets are on the shelf.'
                    : 'One prompt, two pens.',
            depths: 'Six decks, light to deep.',
            loveMissions: weekActive
                ? (missionsDone === 3
                    ? 'All three done. See you Monday.'
                    : `${capitalize(asWords(missionsLeft))} mission${missionsLeft === 1 ? '' : 's'} left this week.`)
                : 'Three small missions, every Monday.',
            upcomingPlan,
            upcomingPlanLabel: upcomingPlan ? inDaysLabel(upcomingPlan.scheduledFor as string) : null,
            duetWaitingOn,
            duetsRevealed,
            missionsLeft,
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

    // The vault, written as a sentence — not a ledger.
    const vaultProse = useMemo(() => {
        const parts: string[] = [];
        if (counts.memories > 0) parts.push(`${counts.memories.toLocaleString()} ${counts.memories === 1 ? 'memory' : 'memories'}`);
        const mins = Math.round(counts.voiceSeconds / 60);
        if (mins > 0) parts.push(`${asWords(mins)} minute${mins === 1 ? '' : 's'} of your voices`);
        if (counts.capsules > 0) parts.push(`${asWords(counts.capsules)} letter${counts.capsules === 1 ? '' : 's'} waiting for their day`);
        if (counts.surprises > 0) parts.push(`${asWords(counts.surprises)} surprise${counts.surprises === 1 ? '' : 's'} on the way`);
        if (live.duetsRevealed > 0) parts.push(`${asWords(live.duetsRevealed)} duet${live.duetsRevealed === 1 ? '' : 's'} revealed`);
        if (live.plansMade > 0) parts.push(`${asWords(live.plansMade)} date${live.plansMade === 1 ? '' : 's'} on the books`);
        if (parts.length === 0) return 'Your first memory starts the vault.';
        const last = parts.pop() as string;
        const lead = parts.length > 0 ? `${parts.join(', ')} and ${last}` : last;
        return `${capitalize(lead)} — all of it synced to both of you.`;
    }, [counts, live.duetsRevealed, live.plansMade]);
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
                    ? 'Tonight’s scene is in the can.'
                    : 'Tonight’s scene is still unshot.';
            default: return null;
        }
    }, [live, recordedToday]);

    // ── Tonight: ONE thing, chosen for right now ────────────────────────
    const spotlight = useMemo(() => {
        const items: Array<{ key: string; view: ViewState; icon: Experience['icon']; tint: string; title: string; sub: string }> = [];
        if (live.duetWaitingOn) {
            items.push({ key: 'duet', view: 'duet-journal', icon: Feather, tint: '#c4b5fd', title: 'A seal is waiting', sub: `Only ${live.duetWaitingOn}’s pen is missing. Finish it, and the page opens.` });
        }
        if (live.upcomingPlan) {
            items.push({ key: 'plan', view: 'date-studio', icon: CalendarHeart, tint: '#fb7185', title: `${live.upcomingPlan.emoji} ${live.upcomingPlan.title}`, sub: `Your date night is ${live.upcomingPlanLabel}. It’s on the books.` });
        }
        if (recordedToday === false) {
            items.push({ key: 'shoot', view: 'daily-video', icon: Video, tint: '#a855f7', title: 'Shoot tonight’s scene', sub: 'Five seconds of right now, before it slips away.' });
        }
        if (live.missionsLeft > 0 && live.missionsLeft < 3) {
            items.push({ key: 'mission', view: 'love-missions', icon: Flame, tint: '#ec4899', title: 'Finish a mission', sub: `${capitalize(asWords(live.missionsLeft))} left before Monday. Small, deliberate, theirs.` });
        }
        items.push({ key: 'story', view: 'our-story', icon: Clapperboard, tint: '#ff5c7c', title: 'Screen Our Story', sub: 'The film of you two — re-cut from everything you’ve kept.' });
        return items[0];
    }, [live, recordedToday]);

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

    // Live-aware card sublines: real state when we have it, editorial copy
    // as the cold-start fallback. Sentences, not metrics.
    const renderSub = (exp: Experience, className: string, color: string) => {
        const liveLine = liveFor(exp.key);
        return (
            <p className={className} style={{ color }}>
                {liveLine ?? exp.sub}
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
                style={{ color: 'rgba(255,248,248,0.85)' }}
            >
                <ArrowLeft size={17} strokeWidth={2.4} />
            </motion.button>
            <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SOFT_SPRING, delay: 0.12 }}
                className="text-[10px] font-bold uppercase tracking-[0.4em] text-center truncate"
                style={{ color: 'rgba(255,92,124,0.75)' }}
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
            style={{ background: '#09090e', color: 'rgba(255,251,250,0.94)' }}
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
                            style={{ background: 'radial-gradient(55% 60% at 50% 42%, rgba(255,92,124,0.13) 0%, rgba(236,72,153,0.05) 55%, transparent 75%)', filter: 'blur(10px)' }}
                        />
                        <div className="lp-emblem mb-7">
                            <div className="lp-orbit"><span className="lp-orbit__spark" /></div>
                            <div className="lp-orbit lp-orbit--reverse"><span className="lp-orbit__spark" /></div>
                            <div
                                className="relative flex items-center justify-center w-[84px] h-[84px] rounded-[26px]"
                                style={{
                                    background: 'linear-gradient(140deg, #ff5c7c 0%, #8b5cf6 100%)',
                                    boxShadow: '0 22px 60px rgba(255,92,124,0.34), inset 0 1px 0 rgba(255,255,255,0.32)',
                                }}
                            >
                                <Crown size={38} strokeWidth={1.6} style={{ color: '#ffffff' }} />
                            </div>
                        </div>

                        <h1 className="font-serif leading-[1.03]" style={{ fontSize: 'clamp(2.35rem, 9.5vw, 2.8rem)', letterSpacing: '-0.028em' }}>
                            <span style={{ color: 'rgba(255,251,250,0.96)' }}>One membership,</span>
                            <br />
                            <span className="lp-shimmer-text">every way to love</span>
                        </h1>
                        <p className="mt-4 max-w-[32ch] text-[14px] leading-relaxed" style={{ color: 'rgba(255,248,248,0.52)' }}>
                            Everything we make for the two of you — the film, the nights, the rituals, the endless vault. Nothing held back.
                        </p>
                        <div className="mt-5 flex items-center gap-2.5" aria-hidden="true">
                            <div className="h-px w-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,92,124,0.5))' }} />
                            <Sparkles size={11} style={{ color: 'rgba(255,92,124,0.7)' }} />
                            <div className="h-px w-10" style={{ background: 'linear-gradient(90deg, rgba(255,92,124,0.5), transparent)' }} />
                        </div>
                    </motion.div>

                    {/* ── Membership card ───────────────────────────── */}
                    <motion.div variants={riseVariants} className="relative">
                        {justUnlocked && <UnlockBurst />}
                        <MemberCard profile={profile} isPremium={isPremium} days={days} />
                    </motion.div>

                    {/* ── Tonight: live, doable right now ───────────── */}
                    <motion.div variants={riseVariants} className="mt-8 mb-3 flex items-center gap-3">
                        <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'rgba(255,251,250,0.94)' }}>
                            Tonight
                        </span>
                        <span className="lp-live-dot" aria-hidden="true" />
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
                    </motion.div>

                    {(() => {
                        const SpotIcon = spotlight.icon;
                        return (
                            <motion.button
                                variants={riseVariants}
                                whileTap={{ scale: 0.98 }}
                                transition={PRESS_SPRING}
                                onClick={() => handleOpen(spotlight.view)}
                                className="lq lq--sheen lq-press relative overflow-hidden w-full rounded-[1.8rem] p-6 text-left"
                                style={{ background: `linear-gradient(135deg, ${spotlight.tint}29 0%, rgba(255,255,255,0.02) 62%)` }}
                            >
                                <SpotIcon size={148} strokeWidth={1} className="lq-ghost" style={{ color: spotlight.tint }} aria-hidden="true" />
                                <div className="relative z-10 max-w-[24rem]">
                                    <p className="font-serif text-[1.55rem] font-bold leading-[1.08]" style={{ color: 'rgba(255,251,250,0.97)', letterSpacing: '-0.02em' }}>
                                        {spotlight.title}
                                    </p>
                                    <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,248,248,0.55)' }}>
                                        {spotlight.sub}
                                    </p>
                                    <span className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-bold" style={{ color: spotlight.tint }}>
                                        Open
                                        <ChevronRight size={15} strokeWidth={2.6} />
                                    </span>
                                </div>
                            </motion.button>
                        );
                    })()}

                    {/* ── The collection: three stars, the rest quiet ── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-baseline gap-3">
                        <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'rgba(255,251,250,0.94)' }}>
                            The collection
                        </span>
                        <div className="flex-1 h-px self-center" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
                    </motion.div>

                    <div className="flex flex-col gap-3">
                        {MARQUEE_EXPERIENCES.map((exp) => {
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
                                    <Icon size={112} strokeWidth={1} className="lq-ghost" style={{ color: exp.tint }} aria-hidden="true" />
                                    <div
                                        className="lp-float absolute -top-14 -right-14 w-44 h-44 rounded-full blur-3xl pointer-events-none"
                                        style={{ background: `radial-gradient(circle, ${exp.tint}30 0%, transparent 70%)` }}
                                    />
                                    <div className="relative z-10 flex items-center gap-4">
                                        <div
                                            className="flex w-12 h-12 shrink-0 items-center justify-center rounded-2xl"
                                            style={{ background: `linear-gradient(140deg, ${exp.tint} 0%, ${exp.tint}c8 100%)`, boxShadow: `0 8px 18px ${exp.tint}4d` }}
                                        >
                                            <Icon size={22} style={{ color: '#ffffff' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-serif text-[1.15rem] font-bold leading-tight" style={{ color: 'rgba(255,251,250,0.95)', letterSpacing: '-0.01em' }}>
                                                {exp.title}
                                            </h3>
                                            {renderSub(exp, 'mt-1 text-[12px] leading-snug', 'rgba(255,248,248,0.5)')}
                                        </div>
                                        <ChevronRight size={17} style={{ color: 'rgba(255,248,248,0.28)' }} />
                                    </div>
                                </motion.button>
                            );
                        })}

                        {/* The rest of the collection, kept quiet on purpose */}
                        <motion.div variants={riseVariants} className="lq rounded-[1.6rem] overflow-hidden">
                            {QUIET_EXPERIENCES.map((exp, i) => (
                                <button
                                    key={exp.key}
                                    onClick={() => handleOpen(exp.view)}
                                    className="lq-press w-full flex items-center gap-3.5 px-5 py-[15px] text-left"
                                    style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}
                                >
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ background: exp.tint, boxShadow: `0 0 8px ${exp.tint}80` }}
                                        aria-hidden="true"
                                    />
                                    <span className="flex-1 text-[14.5px] font-semibold" style={{ color: 'rgba(255,251,250,0.9)' }}>
                                        {exp.title}
                                    </span>
                                    <ChevronRight size={15} style={{ color: 'rgba(255,248,248,0.3)' }} />
                                </button>
                            ))}
                        </motion.div>
                    </div>

                    {/* ── The vault: one statement, not a ledger ────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-baseline gap-3">
                        <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'rgba(255,251,250,0.94)' }}>
                            Already yours
                        </span>
                        <div className="flex-1 h-px self-center" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
                    </motion.div>

                    <motion.div
                        variants={riseVariants}
                        className="lq lq--blur lq--sheen relative overflow-hidden rounded-[1.8rem] p-6"
                    >
                        <Crown size={130} strokeWidth={0.8} className="lq-ghost" style={{ color: '#ff5c7c' }} aria-hidden="true" />
                        <div className="relative z-10">
                            <p className="font-serif text-[1.7rem] font-bold leading-[1.1]" style={{ color: 'rgba(255,251,250,0.97)', letterSpacing: '-0.02em' }}>
                                {days > 0
                                    ? <>{days.toLocaleString()} days.<br />All of it kept.</>
                                    : <>Everything you make,<br />kept for good.</>}
                            </p>
                            <p className="mt-3 text-[13px] leading-relaxed max-w-[26rem]" style={{ color: 'rgba(255,248,248,0.55)' }}>
                                {vaultProse}
                            </p>
                            <p className="mt-4 pt-3 text-[12px] leading-relaxed" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: isPremium ? '#ff8fa6' : 'rgba(255,248,248,0.45)' }}>
                                {isPremium
                                    ? 'No caps. Nothing expires. Synced to both of you.'
                                    : 'Free keeps the first fifty memories. Gold keeps your whole life.'}
                            </p>
                        </div>
                    </motion.div>

                    {/* ── Free vs Gold ──────────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'rgba(255,251,250,0.94)' }}>
                            Free vs Gold
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
                    </motion.div>

                    <motion.div
                        variants={riseVariants}
                        className="lq rounded-[1.6rem] overflow-hidden"
                    >
                        <div className="grid grid-cols-[1.4fr_0.8fr_1fr] px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span />
                            <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-center" style={{ color: 'rgba(255,248,248,0.35)' }}>Free</span>
                            <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-center inline-flex items-center justify-center gap-1" style={{ color: '#ff5c7c' }}>
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
                                <span className="text-[12.5px] font-medium" style={{ color: 'rgba(255,251,250,0.82)' }}>{row.label}</span>
                                <span className="text-[12px] text-center" style={{ color: 'rgba(255,248,248,0.35)' }}>{row.free}</span>
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
                                <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'rgba(255,251,250,0.94)' }}>
                                    Choose your pace
                                </span>
                                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
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
                                                    ? 'linear-gradient(160deg, rgba(255,92,124,0.13) 0%, rgba(255,92,124,0.04) 100%)'
                                                    : undefined,
                                            }}
                                        >
                                            {selected && (
                                                <motion.div
                                                    layoutId="lp-plan-ring"
                                                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                                    className="absolute inset-0 rounded-[1.3rem] pointer-events-none"
                                                    style={{
                                                        border: '1.5px solid rgba(255,92,124,0.75)',
                                                        boxShadow: '0 10px 34px rgba(255,92,124,0.16), inset 0 1px 0 rgba(255,255,255,0.18)',
                                                    }}
                                                />
                                            )}
                                            {plan.badge && (
                                                <span
                                                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-full text-[8px] font-bold uppercase tracking-[0.14em]"
                                                    style={{ background: 'linear-gradient(135deg, #ff5c7c, #8b5cf6)', color: '#ffffff' }}
                                                >
                                                    {plan.badge}
                                                </span>
                                            )}
                                            <span className="block text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: selected ? '#ff5c7c' : 'rgba(255,248,248,0.45)' }}>
                                                {plan.name}
                                            </span>
                                            <span className="mt-2 block font-serif text-[1.25rem] leading-none" style={{ color: 'rgba(255,251,250,0.95)' }}>
                                                {plan.price}
                                            </span>
                                            <span className="mt-1 block text-[9.5px]" style={{ color: 'rgba(255,248,248,0.35)' }}>
                                                {plan.cadence}
                                            </span>
                                            {plan.note && (
                                                <span className="mt-1.5 block text-[9px]" style={{ color: selected ? 'rgba(255,92,124,0.7)' : 'rgba(255,248,248,0.28)' }}>
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
                                        style={{ color: 'rgba(255,248,248,0.52)' }}
                                    >
                                        {PLAN_VALUE_LINE[selectedPlan]}
                                    </motion.p>
                                </AnimatePresence>
                            </motion.div>

                            <motion.div
                                variants={riseVariants}
                                className="mt-3 flex items-start gap-2.5 px-4 py-3.5 rounded-2xl"
                                style={{ background: 'rgba(255,92,124,0.06)', border: '1px solid rgba(255,92,124,0.16)' }}
                            >
                                <Sparkles size={14} className="shrink-0 mt-0.5" style={{ color: '#ff5c7c' }} />
                                <p className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(255,248,248,0.55)' }}>
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
                                        background: 'linear-gradient(135deg, #ff5c7c 0%, #8b5cf6 100%)',
                                        color: '#ffffff',
                                        boxShadow: '0 14px 40px rgba(255,92,124,0.32), inset 0 1px 0 rgba(255,255,255,0.3)',
                                    }}
                                >
                                    Unlock Lior Gold
                                </motion.button>
                                <p className="mt-3 text-center text-[11px]" style={{ color: 'rgba(255,248,248,0.35)' }}>
                                    Free for founding couples · no payment needed
                                </p>
                                <button
                                    onClick={() => { feedback.tap(); toast.show('Nothing to restore yet — purchases arrive with public launch', 'info'); }}
                                    className="mt-1 w-full py-2.5 text-center text-[12px] font-medium active:scale-95 transition-transform"
                                    style={{ color: 'rgba(255,248,248,0.3)' }}
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
                                    style={{ background: 'rgba(255,92,124,0.15)', border: '1px solid rgba(255,92,124,0.4)' }}
                                >
                                    <Check size={18} strokeWidth={2.8} style={{ color: '#ff5c7c' }} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[14px] font-semibold" style={{ color: 'rgba(255,251,250,0.94)' }}>
                                        Gold membership active
                                    </p>
                                    <p className="mt-0.5 text-[11.5px]" style={{ color: 'rgba(255,248,248,0.45)' }}>
                                        Everything is unlocked, for both of you. Always.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── The Gold promise ──────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 mb-4 flex items-center gap-3">
                        <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'rgba(255,251,250,0.94)' }}>
                            The Gold promise
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
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
                                        style={{ background: 'rgba(255,92,124,0.12)', border: '1px solid rgba(255,92,124,0.28)' }}
                                    >
                                        <Icon size={17} style={{ color: '#f3cd86' }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold leading-tight" style={{ color: 'rgba(255,251,250,0.92)' }}>{row.title}</p>
                                        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'rgba(255,248,248,0.42)' }}>{row.sub}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </motion.div>

                    {/* ── Footer ────────────────────────────────────── */}
                    <motion.div variants={riseVariants} className="mt-10 flex items-center justify-center gap-2">
                        <Heart size={11} style={{ color: 'rgba(236,72,153,0.6)' }} fill="currentColor" strokeWidth={0} />
                        <span className="text-[11px]" style={{ color: 'rgba(255,248,248,0.3)' }}>
                            Built for the two of you. Always.
                        </span>
                    </motion.div>
                </motion.div>
            </div>
        </motion.div>
    );
};
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { ViewState } from '../types';
import { StorageService } from '../services/storage';
import { computeYearStats, YearStats } from '../services/yearInReview';
import { PremiumModal } from '../components/PremiumModal';
import { feedback } from '../utils/feedback';
import { useConfetti } from '../components/Layout';

interface YearInReviewViewProps {
    setView: (view: ViewState) => void;
}

const SLIDE_GRADIENTS = [
    'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)',
    'linear-gradient(135deg, #ff9a56 0%, #ff4f8b 100%)',
    'linear-gradient(135deg, #56ccf2 0%, #2f80ed 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)',
    'linear-gradient(135deg, #fda085 0%, #f6d365 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%)',
];

const CountUp: React.FC<{ to: number; duration?: number }> = ({ to, duration = 1.2 }) => {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (to === 0) return;
        const steps = 40;
        const interval = (duration * 1000) / steps;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            setCount(Math.round((step / steps) * to));
            if (step >= steps) clearInterval(timer);
        }, interval);
        return () => clearInterval(timer);
    }, [to, duration]);
    return <>{count}</>;
};

const Slide: React.FC<{ children: React.ReactNode; gradient: string; isActive: boolean }> = ({ children, gradient, isActive }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: isActive ? 1 : 0.6, scale: isActive ? 1 : 0.94 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="absolute inset-0 flex flex-col items-center justify-center p-8 text-white rounded-3xl overflow-hidden"
        style={{ background: gradient }}
    >
        {/* Noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px' }}
        />
        <div className="relative z-10 w-full text-center">
            {isActive && children}
        </div>
    </motion.div>
);

function getSlides(stats: YearStats): React.ReactNode[] {
    const { year, myName, partnerName, totalMemories, mostActiveMonth, topMoods,
        totalDailyPhotos, totalDailyVideos, totalNotes, totalEnvelopes,
        totalKeepsakes, totalVoiceNotes, totalVoiceSeconds, bestStreak,
        totalSpecialDates, daysTogether, topWords } = stats;

    return [
        /* 0 — Title */
        <motion.div key="title" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.15 } } }}>
            <motion.p variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                className="text-[13px] font-bold uppercase tracking-[0.25em] mb-3 opacity-80">
                {year} in Review
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1 } }} className="text-7xl mb-5">💌</motion.div>
            <motion.h1 variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                className="font-serif text-[36px] font-bold leading-tight mb-3">
                {myName} & {partnerName}
            </motion.h1>
            <motion.p variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                className="text-[18px] opacity-80">
                {daysTogether.toLocaleString()} days together 💗
            </motion.p>
        </motion.div>,

        /* 1 — Memories */
        <motion.div key="memories" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.12 } } }}>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[13px] font-bold uppercase tracking-[0.25em] mb-4 opacity-80">
                Memories Captured
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }}
                className="text-[88px] font-black leading-none mb-4"
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                <CountUp to={totalMemories} />
            </motion.div>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[18px] opacity-80 mb-6">
                beautiful moments preserved
            </motion.p>
            {mostActiveMonth.count > 0 && (
                <motion.div variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                    className="rounded-2xl px-5 py-3 inline-block" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <p className="text-[14px] font-semibold">📅 Most active in <span className="font-black">{mostActiveMonth.name}</span></p>
                    <p className="text-[12px] opacity-70 mt-0.5">{mostActiveMonth.count} memories that month</p>
                </motion.div>
            )}
        </motion.div>,

        /* 2 — Moods */
        <motion.div key="moods" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.12 } } }}>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[13px] font-bold uppercase tracking-[0.25em] mb-6 opacity-80">
                Your Mood Board
            </motion.p>
            {topMoods.length > 0 ? topMoods.map((m, i) => (
                <motion.div key={m.mood} variants={{ hidden: { opacity: 0, x: -24 }, show: { opacity: 1, x: 0 } }}
                    className="flex items-center gap-4 mb-4">
                    <span className="text-3xl">{m.emoji}</span>
                    <div className="flex-1">
                        <div className="flex justify-between mb-1">
                            <span className="text-[14px] font-semibold capitalize">{m.mood}</span>
                            <span className="text-[14px] font-black">{m.count}x</span>
                        </div>
                        <motion.div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
                            <motion.div
                                className="h-full rounded-full"
                                style={{ background: 'rgba(255,255,255,0.8)' }}
                                initial={{ width: 0 }}
                                animate={{ width: `${(m.count / (topMoods[0]?.count || 1)) * 100}%` }}
                                transition={{ delay: 0.3 + i * 0.1, duration: 0.7, ease: 'easeOut' }}
                            />
                        </motion.div>
                    </div>
                </motion.div>
            )) : (
                <motion.p variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} className="text-[18px] opacity-70">
                    Add some memories with moods to see this!
                </motion.p>
            )}
        </motion.div>,

        /* 3 — Daily Moments */
        <motion.div key="daily" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.12 } } }}>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[13px] font-bold uppercase tracking-[0.25em] mb-4 opacity-80">
                Daily Moments
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }}
                className="flex gap-6 justify-center mb-6">
                <div>
                    <div className="text-[64px] font-black leading-none"><CountUp to={totalDailyPhotos} /></div>
                    <p className="text-[13px] opacity-75 mt-1">📸 Photos</p>
                </div>
                {totalDailyVideos > 0 && (
                    <div>
                        <div className="text-[64px] font-black leading-none"><CountUp to={totalDailyVideos} /></div>
                        <p className="text-[13px] opacity-75 mt-1">🎥 Videos</p>
                    </div>
                )}
            </motion.div>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[16px] opacity-75">
                little glimpses into each other's world
            </motion.p>
        </motion.div>,

        /* 4 — Top Words */
        topWords.length > 0 ? (
            <motion.div key="words" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.1 } } }}>
                <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                    className="text-[13px] font-bold uppercase tracking-[0.25em] mb-6 opacity-80">
                    Words of the Year
                </motion.p>
                <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                    className="text-[15px] opacity-75 mb-6">Words that kept appearing in your memories</motion.p>
                <div className="flex flex-wrap gap-3 justify-center">
                    {topWords.map((word, i) => (
                        <motion.div
                            key={word}
                            variants={{ hidden: { opacity: 0, scale: 0.7 }, show: { opacity: 1, scale: 1 } }}
                            className="px-4 py-2 rounded-full font-bold"
                            style={{
                                background: 'rgba(255,255,255,0.25)',
                                fontSize: `${18 - i * 1.5}px`,
                            }}
                        >
                            {word}
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        ) : (
            <motion.div key="notes" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.12 } } }}>
                <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                    className="text-[13px] font-bold uppercase tracking-[0.25em] mb-4 opacity-80">
                    Notes & Letters
                </motion.p>
                <div className="flex gap-8 justify-center mb-6">
                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
                        <div className="text-[64px] font-black leading-none"><CountUp to={totalNotes} /></div>
                        <p className="text-[13px] opacity-75 mt-1">📝 Notes</p>
                    </motion.div>
                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
                        <div className="text-[64px] font-black leading-none"><CountUp to={totalEnvelopes} /></div>
                        <p className="text-[13px] opacity-75 mt-1">💌 Letters</p>
                    </motion.div>
                </div>
            </motion.div>
        ),

        /* 5 — Notes & Keepsakes */
        <motion.div key="keepsakes" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.12 } } }}>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[13px] font-bold uppercase tracking-[0.25em] mb-4 opacity-80">
                Things You've Kept
            </motion.p>
            <div className="flex gap-6 justify-center mb-6">
                {[
                    { count: totalNotes, label: '📝 Notes' },
                    { count: totalEnvelopes, label: '💌 Letters' },
                    { count: totalKeepsakes, label: '🗃 Keepsakes' },
                ].map(({ count, label }, i) => (
                    <motion.div key={label} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} transition={{ delay: i * 0.08 }}>
                        <div className="text-[40px] font-black leading-none"><CountUp to={count} /></div>
                        <p className="text-[12px] opacity-75 mt-1">{label}</p>
                    </motion.div>
                ))}
            </div>
            {totalVoiceNotes > 0 && (
                <motion.div variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                    className="rounded-2xl px-5 py-3 mt-2 inline-block" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <p className="text-[14px] font-semibold">🎙 {totalVoiceNotes} voice notes recorded</p>
                    <p className="text-[12px] opacity-70 mt-0.5">{Math.round(totalVoiceSeconds / 60)} minutes of voice</p>
                </motion.div>
            )}
        </motion.div>,

        /* 6 — Streak */
        <motion.div key="streak" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.15 } } }}>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[13px] font-bold uppercase tracking-[0.25em] mb-4 opacity-80">
                You Showed Up
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }}
                className="text-[72px] mb-1">🔥</motion.div>
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }}
                className="text-[88px] font-black leading-none mb-2">
                <CountUp to={bestStreak} />
            </motion.div>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[18px] font-bold mb-2">day best streak</motion.p>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[14px] opacity-70">of checking in with each other daily</motion.p>
        </motion.div>,

        /* 7 — Special Dates */
        <motion.div key="dates" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.15 } } }}>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[13px] font-bold uppercase tracking-[0.25em] mb-4 opacity-80">
                Milestones
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }}
                className="text-[88px] font-black leading-none mb-3">
                <CountUp to={totalSpecialDates} />
            </motion.div>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[18px] opacity-80 mb-2">special dates celebrated</motion.p>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="text-[14px] opacity-60">anniversaries, birthdays & moments that matter</motion.p>
        </motion.div>,

        /* 8 — Final */
        <motion.div key="final" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.15 } } }}>
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, show: { opacity: 1, scale: 1 } }}
                className="text-7xl mb-5">✨</motion.div>
            <motion.h2 variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                className="font-serif text-[28px] font-bold leading-tight mb-4">
                Here's to another year together
            </motion.h2>
            <motion.p variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                className="text-[16px] opacity-75 leading-relaxed mb-6">
                {totalMemories} memories. {daysTogether} days. One story worth keeping.
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                className="px-4 py-2.5 rounded-2xl inline-flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.2)' }}>
                <Heart size={14} fill="white" />
                <span className="text-[13px] font-semibold">Made with love in Lior</span>
            </motion.div>
        </motion.div>,
    ];
}

export const YearInReviewView: React.FC<YearInReviewViewProps> = ({ setView }) => {
    const [stats, setStats] = useState<YearStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [slideIndex, setSlideIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const confetti = useConfetti();

    useEffect(() => {
        const profile = StorageService.getCoupleProfile();
        if (profile.isPremium) {
            setStats(computeYearStats());
        }
        setIsLoading(false);
    }, []);

    const slides = stats ? getSlides(stats) : [];

    const goTo = useCallback((idx: number) => {
        if (!stats) return;
        const clampedIdx = Math.max(0, Math.min(idx, slides.length - 1));
        setDirection(clampedIdx > slideIndex ? 1 : -1);
        setSlideIndex(clampedIdx);
        feedback.tap();
        if (clampedIdx === slides.length - 1) {
            setTimeout(() => confetti.trigger(), 400);
        }
    }, [stats, slides.length, slideIndex, confetti]);

    const handleShare = () => {
        if (!stats) return;
        const text = `My ${stats.year} in Review with ${stats.partnerName} 💌\n\n` +
            `📸 ${stats.totalMemories} memories captured\n` +
            `🔥 ${stats.bestStreak} day best streak\n` +
            `💗 ${stats.daysTogether} days together\n\n` +
            `Made with love in Tulika ✨`;
        if (navigator.share) {
            navigator.share({ text }).catch(() => {});
        } else {
            navigator.clipboard?.writeText(text);
            feedback.celebrate();
        }
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        if (StorageService.getCoupleProfile().isPremium) {
            setStats(computeYearStats());
        }
    };

    if (isLoading) return null;

    // Read fresh from storage each render — ensures upgrade is reflected immediately
    const isPremiumUser = !!StorageService.getCoupleProfile().isPremium;

    // Paywall screen for non-premium users
    if (!isPremiumUser) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative flex flex-col w-full h-full overflow-y-auto items-center justify-center px-8 pb-10 pt-20"
                style={{ background: 'var(--theme-bg-main)', minHeight: '100%' }}
            >
                {/* Back button */}
                <button
                    onClick={() => setView('home')}
                    className="absolute top-14 left-4 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.07)' }}
                >
                    <ChevronLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
                </button>

                {/* Hero visual */}
                <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl"
                        style={{ background: 'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)', boxShadow: '0 12px 40px rgba(196,77,255,0.35)' }}>
                        ✨
                    </div>
                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-[13px]"
                        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 12px rgba(245,158,11,0.4)' }}>
                        👑
                    </div>
                </div>

                <h1 className="font-serif text-[28px] font-bold leading-tight mb-3 text-center" style={{ color: 'var(--color-text-primary)' }}>
                    Year in Review
                </h1>
                <p className="text-[15px] leading-relaxed text-center mb-8 max-w-[280px]" style={{ color: 'var(--color-text-secondary)' }}>
                    A beautiful slideshow recap of your entire year together — memories, moods, streaks & more.
                </p>

                <div className="w-full max-w-[340px] flex flex-col gap-2.5 mb-8">
                    {[
                        { emoji: '📸', label: 'Memories & Moods', desc: 'See your most captured moments' },
                        { emoji: '🔥', label: 'Streak Highlights', desc: 'Your best daily check-in streak' },
                        { emoji: '💗', label: 'Days Together', desc: 'How long you\'ve been counting' },
                        { emoji: '📝', label: 'Notes & Letters', desc: 'Everything you wrote this year' },
                    ].map(({ emoji, label, desc }) => (
                        <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <span className="text-xl">{emoji}</span>
                            <div>
                                <p className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
                                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setIsModalOpen(true)}
                    className="w-full max-w-[340px] py-4 rounded-2xl font-bold text-[15px] text-white tracking-wide"
                    style={{
                        background: 'linear-gradient(135deg, #c44dff 0%, #ff6b9d 100%)',
                        boxShadow: '0 8px 28px rgba(196,77,255,0.35)',
                    }}
                >
                    Unlock Year in Review
                </motion.button>

                <PremiumModal isOpen={isModalOpen} onClose={handleModalClose} />
            </motion.div>
        );
    }

    if (!stats) return null;

    return ReactDOM.createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex flex-col"
            style={{ background: '#0a0a0a' }}
        >
            {/* Back button */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe pt-12">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setView('home')}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                    <ChevronLeft size={20} className="text-white" />
                </motion.button>

                {/* Progress dots */}
                <div className="flex gap-1.5">
                    {slides.map((_, i) => (
                        <motion.button
                            key={i}
                            onClick={() => goTo(i)}
                            animate={{ width: i === slideIndex ? 20 : 6, opacity: i === slideIndex ? 1 : 0.35 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                            className="h-1.5 rounded-full bg-white"
                        />
                    ))}
                </div>

                {slideIndex === slides.length - 1 ? (
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={handleShare}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.15)' }}
                    >
                        <Share2 size={18} className="text-white" />
                    </motion.button>
                ) : (
                    <div className="w-10" />
                )}
            </div>

            {/* Slide container */}
            <div className="flex-1 relative overflow-hidden mx-4 my-20 rounded-3xl">
                <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                        key={slideIndex}
                        custom={direction}
                        variants={{
                            enter: (dir: number) => ({ x: dir * 60, opacity: 0, scale: 0.96 }),
                            center: { x: 0, opacity: 1, scale: 1 },
                            exit: (dir: number) => ({ x: -dir * 60, opacity: 0, scale: 0.96 }),
                        }}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
                        className="absolute inset-0"
                    >
                        <Slide gradient={SLIDE_GRADIENTS[slideIndex % SLIDE_GRADIENTS.length]} isActive>
                            {slides[slideIndex]}
                        </Slide>
                    </motion.div>
                </AnimatePresence>

                {/* Tap zones */}
                <button
                    className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
                    onClick={() => goTo(slideIndex - 1)}
                    disabled={slideIndex === 0}
                />
                <button
                    className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
                    onClick={() => goTo(slideIndex + 1)}
                    disabled={slideIndex === slides.length - 1}
                />
            </div>

            {/* Navigation arrows (desktop / accessibility) */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6 z-20">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => goTo(slideIndex - 1)}
                    disabled={slideIndex === 0}
                    className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-20 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                    <ChevronLeft size={22} className="text-white" />
                </motion.button>
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => goTo(slideIndex + 1)}
                    disabled={slideIndex === slides.length - 1}
                    className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-20 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                    <ChevronRight size={22} className="text-white" />
                </motion.button>
            </div>
        </motion.div>,
        document.body
    );
};

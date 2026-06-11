import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCcw, Share2 } from 'lucide-react';
import type { ViewState, WeeklyRecap, RecapSection } from '../types';
import { useWeeklyRecapData } from '../hooks/useWeeklyRecapData';
import { WeeklyRecapService } from '../services/weeklyRecap';
import { GoldShell } from '../components/premium/GoldShell';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING, goldRise } from '../components/premium/GoldKit';
import { feedback } from '../utils/feedback';
import { RecapCover } from '../components/weekly-recap/RecapCover';
import { RecapNumbers } from '../components/weekly-recap/RecapNumbers';
import { RecapMoodJourney } from '../components/weekly-recap/RecapMoodJourney';
import { RecapHighlight } from '../components/weekly-recap/RecapHighlight';
import { RecapHeadline } from '../components/weekly-recap/RecapHeadline';
import { RecapCarousel } from '../components/weekly-recap/RecapCarousel';
import { RecapPrompt } from '../components/weekly-recap/RecapPrompt';
import { RecapStreak } from '../components/weekly-recap/RecapStreak';
import { RecapFilmStrip } from '../components/weekly-recap/RecapFilmStrip';
import { RecapInsight } from '../components/weekly-recap/RecapInsight';
import { RecapShareSheet } from '../components/weekly-recap/RecapShareSheet';
import '../styles/gold-weekly-recap.css';

interface WeeklyRecapViewProps {
    setView: (view: ViewState) => void;
}

/** Weekly Story's tint in the premium hub — indigo, per the experiences catalogue. */
const ACCENT = '#818cf8';

function addWeeks(weekStart: string, delta: number): string {
    const [y, m, d] = weekStart.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    date.setDate(date.getDate() + delta * 7);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

export function WeeklyRecapView({ setView }: WeeklyRecapViewProps) {
    const thisWeek = useMemo(() => WeeklyRecapService.getWeekStart(), []);
    const [weekStart, setWeekStart] = useState<string>(thisWeek);
    const [showShare, setShowShare] = useState(false);

    const { recap, loading, error, build } = useWeeklyRecapData({ weekStart });

    const isCurrent = weekStart === thisWeek;
    const canGoForward = weekStart < thisWeek;

    useEffect(() => {
        // Rebuild if user swaps weeks
        void build();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart]);

    return (
        <GoldShell
            eyebrow="Weekly Story"
            accent={ACCENT}
            rightSlot={recap ? (
                <motion.button
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.05 }}
                    whileTap={{ scale: 0.86 }}
                    onClick={() => { feedback.tap(); setShowShare(true); }}
                    aria-label="Share recap"
                    className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ color: 'rgba(255,246,230,0.85)' }}
                >
                    <Share2 size={16} strokeWidth={2.2} />
                </motion.button>
            ) : undefined}
        >
            {/* Week navigation — glass pill under the header */}
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...GOLD_SOFT_SPRING, delay: 0.1 }}
                className="lp-glass grc-nav mt-1"
            >
                <motion.button
                    whileTap={{ scale: 0.86 }}
                    transition={GOLD_PRESS_SPRING}
                    className="grc-nav__btn"
                    onClick={() => { feedback.tap(); setWeekStart((w) => addWeeks(w, -1)); }}
                    aria-label="Previous week"
                >
                    <ChevronLeft size={16} strokeWidth={2.4} />
                </motion.button>
                <span className="grc-nav__label">
                    {isCurrent ? 'This week' : `Issue · ${formatLabel(weekStart)}`}
                </span>
                <motion.button
                    whileTap={{ scale: 0.86 }}
                    transition={GOLD_PRESS_SPRING}
                    className="grc-nav__btn"
                    onClick={() => { feedback.tap(); setWeekStart((w) => addWeeks(w, 1)); }}
                    disabled={!canGoForward}
                    aria-label="Next week"
                >
                    <ChevronRight size={16} strokeWidth={2.4} />
                </motion.button>
            </motion.div>

            <div className="mt-2">
                {loading && <RecapSkeleton />}
                {error && (
                    <motion.div
                        variants={goldRise}
                        initial="hidden"
                        animate="visible"
                        className="mt-5 rounded-[1.6rem] px-6 py-7 text-center"
                        style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
                    >
                        <p className="font-serif text-[1.3rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                            This issue wouldn't print
                        </p>
                        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            {error}
                        </p>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={() => { feedback.tap(); void build(true); }}
                            className="lp-cta mt-5 inline-flex h-[46px] items-center justify-center gap-2 px-6 rounded-xl font-bold text-[13.5px]"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                color: GOLD.inkOnGold,
                                boxShadow: '0 10px 28px rgba(246,199,104,0.26)',
                            }}
                        >
                            <RefreshCcw size={14} strokeWidth={2.4} />
                            Try again
                        </motion.button>
                    </motion.div>
                )}
                {!loading && !error && recap && <RecapDocument recap={recap} />}
            </div>

            {recap && (
                <RecapShareSheet
                    recap={recap}
                    open={showShare}
                    onClose={() => setShowShare(false)}
                />
            )}
        </GoldShell>
    );
}

function RecapDocument({ recap }: { recap: WeeklyRecap }) {
    return (
        <article className="grc-doc" aria-label="Weekly recap">
            {recap.sections.map((section, i) => (
                <RecapSectionRenderer key={`${section.kind}-${i}`} section={section} />
            ))}
        </article>
    );
}

function RecapSectionRenderer({ section }: { section: RecapSection }) {
    switch (section.kind) {
        case 'cover':
            return (
                <RecapCover
                    headline={section.headline}
                    dateRange={section.dateRange}
                    names={section.names}
                    palette={section.palette}
                />
            );
        case 'headline':
            return <RecapHeadline memory={section.memory} palette={section.palette} />;
        case 'carousel':
            return <RecapCarousel memories={section.memories} palette={section.palette} />;
        case 'numbers':
            return <RecapNumbers stats={section.stats} />;
        case 'moodJourney':
            return (
                <RecapMoodJourney
                    points={section.points}
                    insight={section.insight}
                    palette={section.palette}
                />
            );
        case 'highlight':
            return <RecapHighlight highlight={section.highlight} />;
        case 'prompt':
            return <RecapPrompt text={section.text} promptType={section.promptType} />;
        case 'streak':
            return (
                <RecapStreak
                    days={section.days}
                    currentStreak={section.currentStreak}
                    bestStreak={section.bestStreak}
                />
            );
        case 'filmStrip':
            return <RecapFilmStrip clips={section.clips} />;
        case 'insight':
            return (
                <RecapInsight
                    text={section.text}
                    label={section.label}
                    variant={section.variant}
                />
            );
        default:
            return null;
    }
}

function RecapSkeleton() {
    return (
        <motion.div
            className="grc-skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            aria-hidden="true"
        >
            <div className="grc-skeleton__cover" />
            <div className="grc-skeleton__row" />
            <div className="grc-skeleton__row" />
            <div className="grc-skeleton__row grc-skeleton__row--wide" />
        </motion.div>
    );
}

function formatLabel(weekStart: string): string {
    const [y, m, d] = weekStart.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default WeeklyRecapView;

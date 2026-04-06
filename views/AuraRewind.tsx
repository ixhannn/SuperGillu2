import React, { useMemo } from 'react';
import { ViewState, MoodEntry, CoupleProfile } from '../types';
import { StorageService } from '../services/storage';
import { Sparkles, TrendingUp, Heart, Share2, Cloud, Palette } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parseISO } from 'date-fns';

interface AuraRewindProps {
    setView: (view: ViewState) => void;
}

const moodWeights: Record<string, number> = {
    'happy': 5,
    'loved': 6,
    'excited': 7,
    'relaxed': 4,
    'sad': 2,
    'angry': 1,
    'anxious': 2,
    'default': 3
};

const moodThemes: Record<string, { color: string; gradient: string; emoji: string }> = {
    'happy': { color: '#fbbf24', gradient: 'from-amber-400 to-yellow-300', emoji: '😊' },
    'loved': { color: '#f472b6', gradient: 'from-pink-500 to-rose-400', emoji: '🥰' },
    'excited': { color: '#fb923c', gradient: 'from-orange-500 to-amber-400', emoji: '🤩' },
    'relaxed': { color: '#7dd3fc', gradient: 'from-sky-400 to-cyan-300', emoji: '😌' },
    'sad': { color: '#818cf8', gradient: 'from-indigo-500 to-blue-400', emoji: '🥺' },
    'angry': { color: '#ef4444', gradient: 'from-red-600 to-orange-500', emoji: '😤' },
    'anxious': { color: '#a78bfa', gradient: 'from-violet-500 to-purple-400', emoji: '😰' },
    'default': { color: '#d1d5db', gradient: 'from-slate-300 to-slate-200', emoji: '✨' }
};

export const AuraRewind: React.FC<AuraRewindProps> = ({ setView }) => {
    const moodEntries = useMemo(() => StorageService.getMoodEntries(), []);
    const profile = useMemo(() => StorageService.getCoupleProfile(), []);
    const currentMonth = new Date();

    const stats = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        
        const currentMonthEntries = moodEntries.filter(e => {
            const date = parseISO(e.timestamp);
            return isSameMonth(date, currentMonth);
        });

        const myEntries = currentMonthEntries.filter(e => e.userId === profile.myName);
        const partnerEntries = currentMonthEntries.filter(e => e.userId === profile.partnerName);

        const moodDistribution = (entries: MoodEntry[]) => {
            const counts: Record<string, number> = {};
            entries.forEach(e => {
                counts[e.mood] = (counts[e.mood] || 0) + 1;
            });
            return Object.entries(counts).sort((a, b) => b[1] - a[1]);
        };

        // Harmony Wave Data Generation
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const generateWave = (userEntries: MoodEntry[]) => {
            return days.map(day => {
                const dayEntry = userEntries.find(e => {
                    const d = parseISO(e.timestamp);
                    return d.getDate() === day.getDate();
                });
                return dayEntry ? moodWeights[dayEntry.mood] || 3 : 3;
            });
        };

        const myWave = generateWave(myEntries);
        const partnerWave = generateWave(partnerEntries);

        // Real sync score: calculate mood overlap percentage
        let matchCount = 0;
        let totalCompared = 0;
        let bestDay = '';
        let bestDayDiff = Infinity;

        days.forEach((day, i) => {
            const myDay = myEntries.find(e => parseISO(e.timestamp).getDate() === day.getDate());
            const partnerDay = partnerEntries.find(e => parseISO(e.timestamp).getDate() === day.getDate());
            if (myDay && partnerDay) {
                totalCompared++;
                const diff = Math.abs((moodWeights[myDay.mood] || 3) - (moodWeights[partnerDay.mood] || 3));
                if (diff <= 1) matchCount++;
                if (diff < bestDayDiff) {
                    bestDayDiff = diff;
                    bestDay = format(day, 'MMMM do');
                }
            }
        });

        const syncScore = totalCompared > 0 ? Math.round((matchCount / totalCompared) * 100) : 0;

        // Dynamic summary based on mood data
        const topMyMood = moodDistribution(myEntries)[0]?.[0] || 'calm';
        const topPartnerMood = moodDistribution(partnerEntries)[0]?.[0] || 'calm';

        return {
            totalEntries: currentMonthEntries.length,
            myMoods: moodDistribution(myEntries),
            partnerMoods: moodDistribution(partnerEntries),
            myWave,
            partnerWave,
            syncScore,
            bestAlignedDay: bestDay || 'no data yet',
            topMyMood,
            topPartnerMood
        };
    }, [moodEntries, profile, currentMonth]);

    const renderWavePath = (data: number[], color: string, partner: boolean) => {
        const width = 1000;
        const height = 150;
        const step = width / (data.length - 1);
        const points = data.map((val, i) => `${i * step},${height - (val * 15 + 20)}`);
        const d = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;
        
        return (
            <motion.path
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: partner ? 0.3 : 0.6 }}
                transition={{ duration: 2, ease: "easeInOut" }}
                d={d}
                fill={color}
                className="mix-blend-screen"
            />
        );
    };

    return (
        <div className="min-h-screen p-6 pt-12 flex flex-col relative pb-32 overflow-hidden">
            <ViewHeader
                title="Aura Rewind"
                subtitle={format(currentMonth, 'MMMM yyyy')}
                onBack={() => setView('mood-calendar')}
                variant="simple"
                borderless
                rightSlot={
                    <button
                        onClick={async () => {
                            try {
                                if (navigator.share) {
                                    await navigator.share({
                                        title: `Aura Rewind — ${format(currentMonth, 'MMMM yyyy')}`,
                                        text: `Our mood sync score this month: ${stats.syncScore}%! 💕`
                                    });
                                } else {
                                    await navigator.clipboard.writeText(`Our mood sync score this month: ${stats.syncScore}%! 💕`);
                                }
                            } catch (e) { /* user cancelled share */ }
                        }}
                        className="p-3 bg-tulika-500 text-white rounded-full shadow-lg shadow-tulika-500/20 spring-press"
                    >
                        <Share2 size={20} />
                    </button>
                }
            />

            <main className="flex-1 space-y-8 relative z-10 overflow-auto pb-12 no-scrollbar">
                {stats.totalEntries === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-tulika-500/10 rounded-full blur-2xl animate-breathe-glow" />
                            <div className="relative p-6 rounded-full shadow-sm" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}>
                                <Palette size={40} style={{ animation: 'breathe-glow 3s ease-in-out infinite', color: 'var(--color-text-secondary)' }} />
                            </div>
                        </div>
                        <p className="font-serif text-center text-lg mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Check in with your moods to see your aura story
                        </p>
                        <p className="text-xs mb-6" style={{ color: 'var(--color-text-secondary)' }}>Your monthly rewind will bloom here</p>
                        <button
                            onClick={() => setView('mood-calendar')}
                            className="px-6 py-3 bg-tulika-500 text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-lg shadow-tulika-500/20 spring-press"
                        >
                            Go to Aura Board
                        </button>
                    </div>
                )}

                {stats.totalEntries > 0 && <>
                {/* Harmony Wave Card */}
                <section className="rounded-[2.5rem] p-8 shadow-xl overflow-hidden relative glass-card" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <TrendingUp size={20} className="text-tulika-500" />
                            <h2 className="font-bold uppercase tracking-wider text-xs" style={{ color: 'var(--color-text-primary)' }}>Harmony Wave</h2>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-tulika-400"></div>
                                <span className="text-[10px] font-bold uppercase tracking-tighter" style={{ color: 'var(--color-text-secondary)' }}>{profile.myName}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-pink-400"></div>
                                <span className="text-[10px] font-bold uppercase tracking-tighter" style={{ color: 'var(--color-text-secondary)' }}>{profile.partnerName}</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-40 w-full relative">
                        <svg viewBox="0 0 1000 150" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                            {renderWavePath(stats.myWave, '#facc15', false)}
                            {renderWavePath(stats.partnerWave, '#f472b6', true)}
                        </svg>
                    </div>

                    <p className="text-center text-[11px] font-medium italic mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                        "Your emotional pulses are beautifully aligned this month."
                    </p>
                </section>

                {/* Mood Distribution bubbles */}
                <section className="grid grid-cols-2 gap-6">
                    <motion.div
                        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                        className="rounded-[2rem] p-6 shadow-lg glass-card" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}
                    >
                        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--color-text-secondary)' }}>{profile.myName}'s Vibe</h3>
                        <div className="flex flex-col gap-3">
                            {stats.myMoods.slice(0, 3).map(([mood, count]) => (
                                <div key={mood} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{moodThemes[mood]?.emoji || '✨'}</span>
                                        <span className="text-xs font-bold capitalize" style={{ color: 'var(--color-text-primary)' }}>{mood}</span>
                                    </div>
                                    <span className="text-[10px] font-black px-2 py-1 rounded-lg" style={{ color: 'var(--color-text-secondary)', background: 'rgba(var(--theme-particle-2-rgb),0.12)' }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                        className="rounded-[2rem] p-6 shadow-lg glass-card" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}
                    >
                        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--color-text-secondary)' }}>{profile.partnerName}'s Vibe</h3>
                        <div className="flex flex-col gap-3">
                            {stats.partnerMoods.slice(0, 3).map(([mood, count]) => (
                                <div key={mood} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{moodThemes[mood]?.emoji || '✨'}</span>
                                        <span className="text-xs font-bold capitalize" style={{ color: 'var(--color-text-primary)' }}>{mood}</span>
                                    </div>
                                    <span className="text-[10px] font-black px-2 py-1 rounded-lg" style={{ color: 'var(--color-text-secondary)', background: 'rgba(var(--theme-particle-2-rgb),0.12)' }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </section>

                {/* Sync Score */}
                <section className="rounded-[2rem] p-8 flex items-center justify-between shadow-xl relative overflow-hidden glass-card" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                    <div className="relative z-10">
                        <h3 className="text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                            <Heart size={16} className="text-pink-500 animate-pulse" />
                            Sync Score
                        </h3>
                        <p className="text-[10px] font-medium italic" style={{ color: 'var(--color-text-secondary)' }}>Most aligned on {stats.bestAlignedDay}.</p>
                    </div>
                    <div className="relative z-10 flex items-center justify-center w-20 h-20 rounded-full shadow-lg border-4 border-tulika-500/20" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.12)' }}>
                        <span className="text-2xl font-black" style={{ color: 'var(--color-text-primary)' }}>{stats.syncScore}%</span>
                        <div className="absolute inset-0 rounded-full border-t-4 border-pink-400 animate-spin" style={{ animationDuration: '3s' }}></div>
                    </div>
                </section>

                {/* Shared Memory Highlight placeholder */}
                <section className="rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden glass-card" style={{ border: '1px solid rgba(var(--theme-particle-1-rgb),0.15)' }}>
                    <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-tulika-400/20 rounded-full blur-3xl"></div>
                    <div className="relative z-10">
                        <Sparkles size={24} className="text-tulika-300 mb-4" />
                        <h4 className="font-serif text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>The Monthly Glow</h4>
                        <p className="text-sm leading-relaxed font-serif italic" style={{ color: 'var(--color-text-secondary)' }}>
                            {stats.totalEntries > 0
                                ? `"This month, ${profile.myName} felt mostly ${stats.topMyMood} while ${profile.partnerName}  was ${stats.topPartnerMood}. ${stats.syncScore >= 70 ? 'Your auras were beautifully aligned!' : 'Keep checking in with each other — your bond grows stronger each day.'}"`
                                : '"Start logging your moods to see your monthly glow bloom here!"'
                            }
                        </p>
                    </div>
                </section>
                </>}
            </main>
        </div>
    );
};

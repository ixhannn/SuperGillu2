import React, { useState, useEffect, useMemo } from 'react';
import { ViewState, Memory, Note, MoodEntry, CoupleProfile } from '../types';
import { StorageService } from '../services/storage';
import { generateId } from '../utils/ids';
import { ChevronLeft, ChevronRight, ArrowLeft, Heart, Sparkles, Plus, Smile, MessageCircle, TrendingUp, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { feedback } from '../utils/feedback';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday,
    parseISO,
    endOfMonth
} from 'date-fns';

interface MoodCalendarProps {
    setView: (view: ViewState) => void;
}

const moodThemes: Record<string, { color: string; gradient: string; aura: string; emoji: string }> = {
    'happy': { color: '#fbbf24', gradient: 'from-amber-400 to-yellow-300', aura: 'bg-amber-400/30', emoji: '😊' },
    'loved': { color: '#f472b6', gradient: 'from-pink-500 to-rose-400', aura: 'bg-rose-400/30', emoji: '🥰' },
    'excited': { color: '#fb923c', gradient: 'from-orange-500 to-amber-400', aura: 'bg-orange-400/30', emoji: '🤩' },
    'relaxed': { color: '#7dd3fc', gradient: 'from-sky-400 to-cyan-300', aura: 'bg-sky-400/30', emoji: '😌' },
    'sad': { color: '#818cf8', gradient: 'from-indigo-500 to-blue-400', aura: 'bg-indigo-400/30', emoji: '🥺' },
    'angry': { color: '#ef4444', gradient: 'from-red-600 to-orange-500', aura: 'bg-red-400/30', emoji: '😤' },
    'anxious': { color: '#a78bfa', gradient: 'from-violet-500 to-purple-400', aura: 'bg-purple-400/30', emoji: '😰' },
    'default': { color: '#d1d5db', gradient: 'from-slate-300 to-slate-200', aura: 'bg-slate-200/30', emoji: '✨' }
};

export const MoodCalendar: React.FC<MoodCalendarProps> = ({ setView }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
    const [profile, setProfile] = useState<CoupleProfile | null>(null);
    const [isCheckingIn, setIsCheckingIn] = useState(false);
    const [selectedMood, setSelectedMood] = useState('happy');
    const [note, setNote] = useState('');

    useEffect(() => {
        setMoodEntries(StorageService.getMoodEntries());
        setProfile(StorageService.getCoupleProfile());
    }, []);

    const myMood = useMemo(() => {
        return moodEntries
            .filter(e => e.userId === profile?.myName)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    }, [moodEntries, profile]);

    const partnerMood = useMemo(() => {
        return moodEntries
            .filter(e => e.userId === profile?.partnerName)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    }, [moodEntries, profile]);

    const handleCheckIn = () => {
        const entry: MoodEntry = {
            id: generateId(),
            userId: profile?.myName || 'Me',
            mood: selectedMood,
            timestamp: new Date().toISOString(),
            note: note.trim() || undefined
        };
        StorageService.saveMoodEntry(entry);
        feedback.celebrate();
        setMoodEntries(prev => [...prev, entry]);
        setIsCheckingIn(false);
        setNote('');
    };

    const monthStart = startOfMonth(currentDate);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentDate) });
    const paddingDays = Array.from({ length: monthStart.getDay() }).map((_, i) => i);

    return (
        <div className="min-h-screen p-6 pt-12 flex flex-col relative pb-32 overflow-hidden">

            <header className="mb-8 flex items-center justify-between relative z-10 animate-slide-down">
                <div className="flex items-center gap-4">
                    <button onClick={() => setView('home')} className="p-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-full shadow-sm text-gray-400 spring-press">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="font-serif text-3xl text-gray-100 font-bold">Aura Board</h1>
                        <p className="text-[10px] font-bold text-tulika-500 uppercase tracking-widest mt-0.5">Your Shared Pulse</p>
                    </div>
                </div>
                <button
                    onClick={() => setView('aura-rewind')}
                    className="flex flex-col items-center gap-1 p-2 bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl group spring-press shadow-xl"
                >
                    <div className="bg-white/15 text-white p-2 rounded-xl transition-transform">
                        <TrendingUp size={18} />
                    </div>
                    <span className="text-[8px] font-black uppercase text-gray-400">Rewind</span>
                </button>
            </header>

            {/* Couple Aura Bloom */}
            <section className="mb-8 relative z-10">
                <div className="rounded-[2rem] p-6 shadow-xl overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex -space-x-3">
                           <div className={`w-14 h-14 rounded-full border-4 border-white/20 shadow-lg flex items-center justify-center text-2xl transition-all duration-500 scale-110 ${myMood ? moodThemes[myMood.mood]?.gradient : 'bg-gray-700'} bg-gradient-to-br text-white overflow-hidden`}>
                                {myMood ? moodThemes[myMood.mood].emoji : '?'}
                                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                           </div>
                           <div className={`w-14 h-14 rounded-full border-4 border-white/20 shadow-lg flex items-center justify-center text-2xl transition-all duration-500 ${partnerMood ? moodThemes[partnerMood.mood]?.gradient : 'bg-gray-700'} bg-gradient-to-br text-white overflow-hidden`}>
                                {partnerMood ? moodThemes[partnerMood.mood].emoji : '?'}
                           </div>
                        </div>

                        <div className="flex-1 px-4">
                            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wide">Couple Aura</h3>
                            <p className="text-xs text-gray-400 italic">
                                {myMood && partnerMood ? "Your moods are blending beautifully..." : "Log your mood to see the aura bloom"}
                            </p>
                        </div>

                        <button
                            onClick={() => setIsCheckingIn(true)}
                            className="bg-tulika-500 text-white p-3 rounded-2xl shadow-lg shadow-tulika-500/20 spring-press flex items-center gap-2 group"
                        >
                            <Plus size={20} className="transition-transform" />
                            <span className="text-xs font-bold uppercase pr-1">Pulse</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* Aura Grid */}
            <main className="rounded-[2.5rem] p-6 shadow-xl flex-1 flex flex-col relative z-10 animate-spring-up overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="font-serif text-xl font-bold text-gray-100">{format(currentDate, 'MMMM yyyy')}</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} aria-label="Previous month" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-white/10 rounded-full text-gray-400 cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:ring-offset-2"><ChevronLeft size={20} /></button>
                        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} aria-label="Next month" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-white/10 rounded-full text-gray-400 cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:ring-offset-2"><ChevronRight size={20} /></button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-3 mb-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center px-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-3 flex-1 px-1">
                    {paddingDays.map(p => <div key={`p-${p}`} />)}
                    {daysInMonth.map(day => {
                        const dayMoods = moodEntries.filter(e => isSameDay(parseISO(e.timestamp), day));
                        const isSelected = isToday(day);

                        return (
                            <div key={day.toISOString()} className="aspect-square flex flex-col items-center justify-center relative">
                                {dayMoods.length > 0 ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                        <div className="flex -space-x-1">
                                            {Array.from(new Set(dayMoods.map(m => m.mood))).slice(0, 2).map((m, i) => {
                                                const theme = moodThemes[m as keyof typeof moodThemes] || moodThemes.default;
                                                return (
                                                    <div
                                                        key={i}
                                                        className={`w-6 h-6 rounded-full shadow-sm border-2 border-white/20 ${theme.gradient} bg-gradient-to-br flex items-center justify-center text-[10px]`}
                                                    >
                                                        {theme.emoji}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400">{format(day, 'd')}</span>
                                    </div>
                                ) : (
                                    <div className={`w-8 h-8 rounded-full border-2 ${isSelected ? 'border-tulika-500/40 bg-tulika-500/15' : 'border-white/10 bg-white/5'} flex items-center justify-center`}>
                                        <span className={`text-xs ${isSelected ? 'text-tulika-400 font-bold' : 'text-gray-500'}`}>{format(day, 'd')}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* Check-in Modal */}
            <AnimatePresence>
                {isCheckingIn && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setIsCheckingIn(false)}
                    >
                        <motion.div
                            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="rounded-t-[3rem] w-full max-w-lg p-8 pb-12 relative overflow-hidden"
                            style={{ background: 'linear-gradient(168deg, #1a1225 0%, #1e1428 50%, #150f1e 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-12 h-1.5 bg-white/15 rounded-full mx-auto mb-8"></div>
                            <h2 className="font-serif text-3xl font-bold text-gray-100 mb-2">How are you feeling?</h2>
                            <p className="text-gray-400 text-sm mb-8 italic">Your mood will bloom on both your boards.</p>

                            <div className="grid grid-cols-4 gap-4 mb-8">
                                {Object.entries(moodThemes).filter(([k]) => k !== 'default').map(([key, theme]) => (
                                    <button
                                        key={key}
                                        onClick={() => { feedback.tap(); setSelectedMood(key); }}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${selectedMood === key ? 'bg-white/10 scale-110 shadow-inner' : 'opacity-60 grayscale-[0.5]'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-full ${theme.gradient} bg-gradient-to-br shadow-lg flex items-center justify-center text-xl text-white`}>
                                            {theme.emoji}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase text-gray-400">{key}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="relative mb-8">
                                <div className="absolute top-4 left-4 text-gray-500"><MessageCircle size={18} /></div>
                                <textarea
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 text-sm outline-none focus:ring-1 focus:ring-tulika-500/30 transition-all font-sans italic text-gray-200 placeholder:text-gray-500"
                                    placeholder="Add a little note... (Optional)"
                                    rows={2}
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                />
                            </div>

                            <button
                                onClick={handleCheckIn}
                                className="w-full bg-tulika-500 text-white py-5 rounded-[1.5rem] font-bold uppercase tracking-widest shadow-xl shadow-tulika-500/20 active:scale-[0.98] transition-transform"
                            >
                                Share My Pulse
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Clock, Sparkles, Cake, Heart, ChevronRight } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion } from 'framer-motion';
import { ViewState, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { differenceInDays, isAfter, intervalToDuration, setYear, isBefore } from 'date-fns';

interface CountdownsProps {
    setView: (view: ViewState) => void;
}

const LiveCountdown = ({ targetDate }: { targetDate: Date }) => {
    const [timeLeft, setTimeLeft] = useState(intervalToDuration({ start: new Date(), end: targetDate }));

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            if (isAfter(now, targetDate)) {
                clearInterval(timer);
                return;
            }
            setTimeLeft(intervalToDuration({ start: now, end: targetDate }));
        }, 1000);
        return () => clearInterval(timer);
    }, [targetDate]);

    return (
        <div className="grid grid-cols-4 gap-2 w-full">
            {[
                { label: 'Days', value: timeLeft.days || 0 },
                { label: 'Hrs', value: timeLeft.hours || 0 },
                { label: 'Min', value: timeLeft.minutes || 0 },
                { label: 'Sec', value: timeLeft.seconds || 0 },
            ].map(unit => (
                <div key={unit.label} className="glass-card shadow-sm backdrop-blur-md rounded-xl p-2 flex flex-col items-center" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}>
                    <span className="text-xl font-bold font-mono" style={{ animation: 'numberRoll 0.5s cubic-bezier(0.23, 1, 0.32, 1) both', color: 'var(--color-text-primary)' }}>{String(unit.value).padStart(2, '0')}</span>
                    <span className="text-[10px] uppercase font-bold tracking-tighter" style={{ color: 'var(--color-text-secondary)' }}>{unit.label}</span>
                </div>
            ))}
        </div>
    );
};

export const Countdowns: React.FC<CountdownsProps> = ({ setView }) => {
    const [dates, setDates] = useState<SpecialDate[]>([]);
    const [anniversaryDate, setAnniversaryDate] = useState<string>('');

    useEffect(() => {
        const load = () => {
            const sds = StorageService.getSpecialDates();
            const prof = StorageService.getCoupleProfile();
            setDates(sds);
            setAnniversaryDate(prof.anniversaryDate);
        };
        load();
        storageEventTarget.addEventListener('storage-update', load);
        return () => storageEventTarget.removeEventListener('storage-update', load);
    }, []);

    const calculateNextOccurence = (date: string, type: string) => {
        const now = new Date();
        let target = new Date(date);

        if (type === 'anniversary' || type === 'birthday') {
            target.setFullYear(now.getFullYear());
            if (isBefore(target, now)) {
                target.setFullYear(now.getFullYear() + 1);
            }
        }
        return target;
    };

    const allEvents = [
        ...dates.map(d => ({
            ...d,
            nextDate: calculateNextOccurence(d.date, d.type)
        })),
        {
            id: 'anniv_main',
            title: 'Our Anniversary',
            date: anniversaryDate,
            type: 'anniversary' as const,
            nextDate: calculateNextOccurence(anniversaryDate, 'anniversary')
        }
    ].sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());

    const nextEvent = allEvents[0];
    const restEvents = allEvents.slice(1);

    const getIcon = (type: string) => {
        switch (type) {
            case 'birthday': return <Cake size={20} className="text-yellow-400" />;
            case 'anniversary': return <Heart size={20} className="text-tulika-400" fill="currentColor" />;
            default: return <Sparkles size={20} className="text-purple-400" />;
        }
    };

    return (
        <div className="min-h-screen flex flex-col pb-32">
            {/* Header */}
            <ViewHeader title="Countdowns" subtitle="Upcoming Moments" onBack={() => setView('home')} variant="simple" />

            {/* Content Area */}
            <div className="flex-1 px-6 pt-4 relative z-20">
                {nextEvent && (
                    <div className="glass-card-hero p-8 mb-8 animate-elastic-pop">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-2 px-3 py-1 bg-tulika-500/15 rounded-full text-[10px] font-bold uppercase tracking-widest text-tulika-600">
                                <Clock size={12} /> Next Up
                            </div>
                            {getIcon(nextEvent.type)}
                        </div>

                        <h3 className="text-3xl font-serif font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>{nextEvent.title}</h3>
                        <p className="text-sm mb-8 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            {nextEvent.nextDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>

                        <LiveCountdown targetDate={nextEvent.nextDate} />
                    </div>
                )}

                <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-secondary)' }}>Upcoming</h4>
                    <button onClick={() => setView('special-dates')} className="text-xs font-bold text-tulika-400 flex items-center gap-1">
                        Edit List <ChevronRight size={14} />
                    </button>
                </div>

                {/* Event List */}
                <motion.div className="space-y-4" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}>
                    {restEvents.map((event) => (
                        <motion.div
                            key={event.id}
                            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                            className="glass-card p-5 rounded-[2rem] flex items-center gap-4 spring-press shadow-sm"
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${event.type === 'birthday' ? 'bg-yellow-500/10' :
                                    event.type === 'anniversary' ? 'bg-tulika-500/10' : 'bg-purple-500/10'
                                }`}>
                                {getIcon(event.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h5 className="font-bold text-lg truncate" style={{ color: 'var(--color-text-primary)' }}>{event.title}</h5>
                                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                    {event.nextDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-bold font-mono text-tulika-400">
                                    {differenceInDays(event.nextDate, new Date())}
                                </span>
                                <span className="block text-[10px] uppercase font-bold" style={{ color: 'var(--color-text-secondary)' }}>Days To Go</span>
                            </div>
                        </motion.div>
                    ))}

                    {allEvents.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-tulika-200/40 rounded-full blur-2xl animate-breathe-glow" />
                                <div className="relative p-6 glass-card rounded-full text-tulika-400">
                                    <Calendar size={40} />
                                </div>
                            </div>
                            <p className="font-serif text-center font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>No countdowns yet</p>
                            <p className="text-xs mb-6 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Add special dates to start counting down</p>
                            <button
                                onClick={() => setView('special-dates')}
                                className="px-6 py-3 bg-tulika-500 text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-lg shadow-tulika-500/20 spring-press"
                            >
                                Add Your First Date
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Quick Add Floating Button */}
            <div className="fixed bottom-28 right-6">
                <button
                    onClick={() => setView('special-dates')}
                    className="p-4 bg-tulika-500 text-white rounded-2xl shadow-xl shadow-tulika-500/20 spring-press spring-hover transition-transform"
                >
                    <Plus size={24} />
                </button>
            </div>
        </div>
    );
};
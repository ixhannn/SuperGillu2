import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Clock, Sparkles, Cake, Heart, ChevronRight, Trash2 } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useThrottledReload } from '../hooks/useThrottledReload';
import { countdownDateParts, formatStoredDate } from '../shared/dateOnly.js';
import { buildCountdownEvents, getCountdownEventStatus } from '../shared/countdowns.js';
import { ConfirmModal } from '../components/ConfirmModal';
import { listRemoveExit } from '../utils/motion';
import { toast } from '../utils/toast';

interface CountdownsProps {
    setView: (view: ViewState) => void;
}

const LiveCountdown = ({ targetDate }: { targetDate: Date }) => {
    const getTimeLeft = () => countdownDateParts(targetDate, new Date());
    const [timeLeft, setTimeLeft] = useState(getTimeLeft());

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(getTimeLeft());
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
                <div key={unit.label} className="glass-card shadow-sm rounded-xl p-2 flex flex-col items-center" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}>
                    <span className="text-xl font-bold font-mono" style={{ animation: 'numberRoll 0.5s cubic-bezier(0.23, 1, 0.32, 1) both', color: 'var(--color-text-primary)' }}>{String(unit.value).padStart(2, '0')}</span>
                    <span className="text-[10px] uppercase font-bold tracking-tighter" style={{ color: 'var(--color-text-secondary)' }}>{unit.label}</span>
                </div>
            ))}
        </div>
    );
};

export const Countdowns: React.FC<CountdownsProps> = ({ setView }) => {
    const [dates, setDates] = useState<SpecialDate[]>(() => StorageService.getSpecialDates());
    const [anniversaryDate, setAnniversaryDate] = useState<string>(() => StorageService.getCoupleProfile().anniversaryDate);
    const [deleteTarget, setDeleteTarget] = useState<SpecialDate | null>(null);
    // Re-render on a slow tick so the "Next Up" event and "N days to go" labels
    // refresh at the day boundary — the per-event LiveCountdown only re-renders
    // itself, never the parent that selects/orders the events.
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30_000);
        return () => clearInterval(id);
    }, []);

    const reloadDates = useThrottledReload(() => {
        setDates(StorageService.getSpecialDates());
        setAnniversaryDate(StorageService.getCoupleProfile().anniversaryDate);
    });
    useEffect(() => {
        const onStorage = (event: Event) => {
            const table = (event as CustomEvent).detail?.table;
            if (table && table !== 'dates' && table !== 'couple_profile' && table !== 'init') return;
            reloadDates();
        };
        storageEventTarget.addEventListener('storage-update', onStorage);
        return () => storageEventTarget.removeEventListener('storage-update', onStorage);
    }, [reloadDates]);

    const allEvents = buildCountdownEvents({ dates, anniversaryDate });

    const nextEvent = allEvents[0];
    const restEvents = allEvents.slice(1);
    const canDeleteEvent = (event: typeof allEvents[number]) => !event.isGenerated;

    const requestDelete = (event: typeof allEvents[number]) => {
        if (!canDeleteEvent(event)) return;
        setDeleteTarget({
            id: event.id,
            title: event.title,
            date: event.date,
            type: event.type as SpecialDate['type'],
        });
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        const id = deleteTarget.id;
        setDeleteTarget(null);
        setDates(prev => prev.filter(date => date.id !== id));
        try {
            await StorageService.deleteSpecialDate(id);
        } catch {
            // Persisted write failed — restore so the UI matches storage.
            setDates(StorageService.getSpecialDates());
            toast.show("Couldn't remove — try again", 'error');
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'birthday': return <Cake size={20} className="text-yellow-400" />;
            case 'anniversary': return <Heart size={20} className="text-lior-400" fill="currentColor" />;
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
                            <div className="flex items-center gap-2 px-3 py-1 bg-lior-500/15 rounded-full text-[10px] font-bold uppercase tracking-widest text-lior-600">
                                <Clock size={12} /> Next Up
                            </div>
                            <div className="flex items-center gap-2">
                                {canDeleteEvent(nextEvent) && (
                                    <button
                                        type="button"
                                        onClick={() => requestDelete(nextEvent)}
                                        className="p-2 rounded-full text-red-400 bg-red-500/10 spring-press"
                                        aria-label={`Delete ${nextEvent.title}`}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                                {getIcon(nextEvent.type)}
                            </div>
                        </div>

                        <h3 className="text-3xl font-serif font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>{nextEvent.title}</h3>
                        <p className="text-sm mb-8 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            {formatStoredDate(nextEvent.nextDate, { weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>
                        <p className="text-xs mb-4 font-bold uppercase tracking-[0.18em] text-lior-400">
                            {getCountdownEventStatus(nextEvent)}
                        </p>

                        <LiveCountdown targetDate={nextEvent.nextDate} />
                    </div>
                )}

                <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-secondary)' }}>Upcoming</h4>
                    <button onClick={() => setView('special-dates')} className="text-xs font-bold text-lior-400 flex items-center gap-1">
                        Edit List <ChevronRight size={14} />
                    </button>
                </div>

                {/* Event List */}
                <motion.div className="space-y-4" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}>
                    <AnimatePresence mode="popLayout" initial={false}>
                    {restEvents.map((event) => (
                        <motion.div
                            key={event.id}
                            layout
                            exit={listRemoveExit}
                            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                            className="glass-card p-5 rounded-[2rem] flex items-center gap-4 spring-press shadow-sm"
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${event.type === 'birthday' ? 'bg-yellow-500/10' :
                                    event.type === 'anniversary' ? 'bg-lior-500/10' : 'bg-purple-500/10'
                                }`}>
                                {getIcon(event.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h5 className="font-bold text-lg truncate" style={{ color: 'var(--color-text-primary)' }}>{event.title}</h5>
                                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                    {formatStoredDate(event.nextDate, { month: 'short', day: 'numeric' })}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <span className="block text-xs font-bold text-lior-400">
                                        {getCountdownEventStatus(event)}
                                    </span>
                                    <span className="block text-[10px] uppercase font-bold" style={{ color: 'var(--color-text-secondary)' }}>Countdown</span>
                                </div>
                                {canDeleteEvent(event) && (
                                    <button
                                        type="button"
                                        onClick={() => requestDelete(event)}
                                        className="p-2 rounded-full text-red-400 bg-red-500/10 spring-press"
                                        aria-label={`Delete ${event.title}`}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                    </AnimatePresence>

                    {allEvents.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-lior-200/40 rounded-full blur-2xl animate-breathe-glow" />
                                <div className="relative p-6 glass-card rounded-full text-lior-400">
                                    <Calendar size={40} />
                                </div>
                            </div>
                            <p className="font-serif text-center font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>No countdowns yet</p>
                            <p className="text-xs mb-6 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Add special dates to start counting down</p>
                            <button
                                onClick={() => setView('special-dates')}
                                className="px-6 py-3 bg-lior-500 text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-lg shadow-lior-500/20 spring-press"
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
                    className="p-4 bg-lior-500 text-white rounded-2xl shadow-xl shadow-lior-500/20 spring-press spring-hover transition-transform"
                >
                    <Plus size={24} />
                </button>
            </div>

            <ConfirmModal
                isOpen={!!deleteTarget}
                title="Remove Countdown"
                message={`Remove ${deleteTarget?.title || 'this countdown'} from your countdowns?`}
                confirmLabel="Remove"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
};

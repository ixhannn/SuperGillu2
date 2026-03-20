import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Heart, Sparkles, Mail, Moon, RefreshCw, Utensils, Gift, Calendar, X, Clock, ChevronRight, Zap, Award, Wind, Sun, Map } from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ViewState, UserStatus, CoupleProfile, Memory, Note, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { AmbientService } from '../services/ambient';
import { differenceInDays, getYear, intervalToDuration, isAfter, setYear } from 'date-fns';
import { CouplePet } from '../components/CouplePet';
import { MagneticButton } from '../components/MagneticButton';
import { HolographicCard } from '../components/HolographicCard';

interface HomeProps {
    setView: (view: ViewState) => void;
}

const SurpriseModal = ({ content, onClose }: { content: { type: 'memory' | 'note', item: Memory | Note }, onClose: () => void }) => {
    const { type, item } = content;
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        if (type === 'memory') {
            const mem = item as Memory;
            if (mem.image) setImageUrl(mem.image);
            else if (mem.imageId) {
                StorageService.getImage(mem.imageId).then(data => setImageUrl(data || null));
            }
        }
    }, [content]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-backdrop-enter" onClick={onClose}
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
            <div
                className="bg-white w-full max-w-sm rounded-3xl p-1 shadow-2xl relative animate-modal-enter overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-tulika-100 to-transparent -z-10"></div>

                <div className="p-6 pb-8">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2 text-tulika-500">
                            <Sparkles size={18} className="animate-wiggle-spring" />
                            <span className="text-xs font-bold uppercase tracking-widest">A Memory For You</span>
                        </div>
                        <button onClick={onClose} className="p-1 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500 transition-colors spring-press">
                            <X size={20} />
                        </button>
                    </div>

                    {type === 'memory' ? (
                        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 -rotate-1 transform transition-transform hover:rotate-0 duration-500 hover:scale-[1.02]">
                            {imageUrl ? (
                                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3 relative">
                                    <img src={imageUrl} alt="Memory" className="w-full h-full object-cover" />
                                </div>
                            ) : (
                                <div className="aspect-video bg-tulika-50 rounded-lg flex items-center justify-center mb-3 text-tulika-300">
                                    <Heart size={40} />
                                </div>
                            )}
                            {(item as Memory).text && (
                                <p className="font-serif text-lg text-gray-800 italic text-center leading-snug px-2 pb-2">
                                    "{(item as Memory).text}"
                                </p>
                            )}
                            <div className="mt-2 text-center">
                                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                                    {new Date((item as Memory).date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-yellow-50 p-8 rounded-xl shadow-inner rotate-1 transform relative transition-transform hover:rotate-0">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-400 shadow-sm border-2 border-white/50"></div>
                            <p className="font-serif text-xl text-gray-800 leading-relaxed whitespace-pre-wrap">
                                "{(item as Note).content}"
                            </p>
                            <div className="mt-6 flex justify-end">
                                <Heart size={16} className="text-red-400" fill="currentColor" />
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="w-full bg-gray-50 text-gray-600 py-4 font-bold text-sm hover:bg-gray-100 transition-colors border-t border-gray-100 spring-press"
                >
                    Close Surprise
                </button>
            </div>
        </div>
    );
};

// Ripple effect for heartbeat button
const HeartbeatRipple = ({ active }: { active: boolean }) => {
    const rippleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!active) return;
        let animationFrameId: number;

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            if (AmbientService.isPlaying && rippleRef.current) {
                const data = AmbientService.getFrequencyData();
                // Calculate bass (average of lower frequency bins)
                let bassSum = 0;
                for (let i = 0; i < 4; i++) bassSum += data[i] || 0;
                const bassAvg = bassSum / 4;
                const scale = 1 + (bassAvg / 255) * 0.4;
                rippleRef.current.style.transform = `scale(${scale})`;
            }
        };

        animate();
        return () => cancelAnimationFrame(animationFrameId);
    }, [active]);

    if (!active) return null;
    return (
        <div ref={rippleRef} className="absolute inset-0 pointer-events-none transition-transform duration-75">
            {[0, 1, 2].map(i => (
                <span
                    key={i}
                    className="absolute inset-0 rounded-3xl border-2 border-white/40 ripple-ring"
                    style={{ animationDelay: `${i * 150}ms` }}
                />
            ))}
        </div>
    );
};

// === SCROLL ANIMATION SYSTEM ===
const scrollVariants = {
    fadeUp: {
        hidden: { opacity: 0, y: 50 },
        visible: { opacity: 1, y: 0 }
    },
    fadeScale: {
        hidden: { opacity: 0, scale: 0.88, y: 30 },
        visible: { opacity: 1, scale: 1, y: 0 }
    },
    slideFromLeft: {
        hidden: { opacity: 0, x: -60 },
        visible: { opacity: 1, x: 0 }
    },
    slideFromRight: {
        hidden: { opacity: 0, x: 60 },
        visible: { opacity: 1, x: 0 }
    },
    popIn: {
        hidden: { opacity: 0, scale: 0.7, y: 20 },
        visible: { opacity: 1, scale: 1, y: 0 }
    },
    tiltUp: {
        hidden: { opacity: 0, y: 60, rotateX: 8 },
        visible: { opacity: 1, y: 0, rotateX: 0 }
    }
};

const gridContainerVariants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.1, delayChildren: 0.05 }
    }
};

const gridItemVariants = {
    hidden: { opacity: 0, y: 40, scale: 0.92 },
    visible: {
        opacity: 1, y: 0, scale: 1,
        transition: { type: "spring", stiffness: 250, damping: 20 }
    }
};

const ScrollReveal = ({ children, variant = 'fadeUp', delay = 0, className = '' }: {
    children: React.ReactNode;
    variant?: keyof typeof scrollVariants;
    delay?: number;
    className?: string;
}) => (
    <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={scrollVariants[variant]}
        transition={{ type: "spring", stiffness: 180, damping: 22, delay }}
        className={className}
    >
        {children}
    </motion.div>
);

// Counting number animation hook
const useCountUp = (target: number, inView: boolean, duration = 1800) => {
    const [count, setCount] = useState(0);
    const hasRun = useRef(false);

    useEffect(() => {
        if (!inView || hasRun.current || target === 0) return;
        hasRun.current = true;
        let startTime: number;
        const animate = (time: number) => {
            if (!startTime) startTime = time;
            const progress = Math.min((time - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [inView, target, duration]);

    return count;
};

export const Home: React.FC<HomeProps> = ({ setView }) => {
    const [profile, setProfile] = useState<CoupleProfile>({ myName: 'Ishan', partnerName: 'Tulika', anniversaryDate: new Date().toISOString() });
    const [myStatus, setMyStatus] = useState<UserStatus>({ state: 'awake', timestamp: '' });
    const [partnerStatus, setPartnerStatus] = useState<UserStatus>({ state: 'awake', timestamp: '' });
    const [daysTogether, setDaysTogether] = useState(0);
    const [showDetailedDuration, setShowDetailedDuration] = useState(false);
    const [detailedDuration, setDetailedDuration] = useState('');
    const [onThisDayMemory, setOnThisDayMemory] = useState<Memory | null>(null);
    const [otdImage, setOtdImage] = useState<string | null>(null);
    const [showSurprise, setShowSurprise] = useState(false);
    const [surpriseContent, setSurpriseContent] = useState<{ type: 'memory' | 'note', item: Memory | Note } | null>(null);
    const [nextEvent, setNextEvent] = useState<{ title: string, days: number } | null>(null);
    const [streak, setStreak] = useState(0);
    const [memories, setMemories] = useState<Memory[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [showHeartbeat, setShowHeartbeat] = useState(false);
    const [receivedHeartbeat, setReceivedHeartbeat] = useState(false);
    const [isConnected, setIsConnected] = useState(SyncService.isConnected);
    const [isTogether, setIsTogether] = useState(false);

    // Hero card counting animation
    const heroRef = useRef<HTMLDivElement>(null);
    const heroInView = useInView(heroRef, { once: true, margin: "-100px" });
    const displayCount = useCountUp(daysTogether, heroInView);

    const calculateStreak = (mems: Memory[]) => {
        if (mems.length === 0) return 0;
        const dates = [...new Set(mems.map(m => m.date.split('T')[0]))].sort().reverse();
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (dates[0] !== today && dates[0] !== yesterday) return 0;
        let streakCount = 0;
        let testDate = new Date();
        if (!dates.includes(today)) testDate.setDate(testDate.getDate() - 1);
        for (let i = 0; i < dates.length; i++) {
            const dateStr = testDate.toISOString().split('T')[0];
            if (dates.includes(dateStr)) {
                streakCount++;
                testDate.setDate(testDate.getDate() - 1);
            } else break;
        }
        return streakCount;
    };

    const getNextEvent = (specialDates: SpecialDate[], anniversaryDate: string) => {
        const now = new Date();
        const events: { title: string, date: Date }[] = [];
        specialDates.forEach(sd => {
            let eventDate = new Date(sd.date);
            if (sd.type === 'birthday' || sd.type === 'anniversary') {
                eventDate.setFullYear(now.getFullYear());
                if (!isAfter(eventDate, now)) eventDate.setFullYear(now.getFullYear() + 1);
            }
            if (isAfter(eventDate, now)) events.push({ title: sd.title, date: eventDate });
        });
        let anniv = new Date(anniversaryDate);
        anniv.setFullYear(now.getFullYear());
        if (!isAfter(anniv, now)) anniv.setFullYear(now.getFullYear() + 1);
        events.push({ title: 'Our Anniversary', date: anniv });
        events.sort((a, b) => a.date.getTime() - b.date.getTime());
        return events.length > 0 ? { title: events[0].title, days: differenceInDays(events[0].date, now) } : null;
    };

    const loadData = () => {
        const prof = StorageService.getCoupleProfile();
        setProfile(prof);
        setMyStatus(StorageService.getStatus());
        setPartnerStatus(StorageService.getPartnerStatus());
        const start = new Date(prof.anniversaryDate);
        const now = new Date();
        setDaysTogether(differenceInDays(now, start));
        if (start <= now) {
            const dur = intervalToDuration({ start, end: now });
            const parts = [];
            if (dur.years) parts.push(`${dur.years} Year${dur.years > 1 ? 's' : ''}`);
            if (dur.months) parts.push(`${dur.months} Month${dur.months > 1 ? 's' : ''}`);
            if (dur.days) parts.push(`${dur.days} Day${dur.days > 1 ? 's' : ''}`);
            setDetailedDuration(parts.join(', '));
        }
        const mems = StorageService.getMemories();
        const nts = StorageService.getNotes();
        const sds = StorageService.getSpecialDates();
        setMemories(mems);
        setNotes(nts);
        setStreak(calculateStreak(mems));
        setNextEvent(getNextEvent(sds, prof.anniversaryDate));
        const throwback = mems.find(m => {
            const d = new Date(m.date);
            return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() !== now.getFullYear();
        });
        if (throwback?.id !== onThisDayMemory?.id) setOnThisDayMemory(throwback || null);
    };

    useEffect(() => {
        loadData();
        setIsConnected(SyncService.isConnected);
        const handleUpdate = () => loadData();
        storageEventTarget.addEventListener('storage-update', handleUpdate);
        const handleSyncUpdate = () => setIsConnected(SyncService.isConnected);
        syncEventTarget.addEventListener('sync-update', handleSyncUpdate);
        const handleSignal = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail.signalType === 'HEARTBEAT') {
                triggerReceivedHeartbeat();
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification('Tulika', { body: '❤️ You received a heartbeat!', icon: '/icon.svg' });
                }
            } else if (detail.signalType === 'PET_NUDGE') {
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification('Tulika', { body: `${detail.payload?.partner || 'Your partner'} sent a nudge! 👉`, icon: '/icon.svg' });
                }
            }
        };
        syncEventTarget.addEventListener('signal-received', handleSignal);
        const handlePresence = (e: Event) => {
            const state = (e as CustomEvent).detail;
            const prof = StorageService.getCoupleProfile();
            let partnerOnline = false;
            if (state) {
                Object.values(state).forEach((presences: any) => {
                    presences.forEach((p: any) => { if (p.user === prof.partnerName) partnerOnline = true; });
                });
            }
            setIsTogether(partnerOnline);
        };
        syncEventTarget.addEventListener('presence-update', handlePresence);

        // Request Notification Permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return () => {
            storageEventTarget.removeEventListener('storage-update', handleUpdate);
            syncEventTarget.removeEventListener('sync-update', handleSyncUpdate);
            syncEventTarget.removeEventListener('signal-received', handleSignal);
            syncEventTarget.removeEventListener('presence-update', handlePresence);
        };
    }, []);

    useEffect(() => {
        if (onThisDayMemory) {
            if (onThisDayMemory.image) setOtdImage(onThisDayMemory.image);
            else if (onThisDayMemory.imageId) StorageService.getImage(onThisDayMemory.imageId).then(img => setOtdImage(img || null));
        } else setOtdImage(null);
    }, [onThisDayMemory]);

    const triggerReceivedHeartbeat = () => {
        setReceivedHeartbeat(true);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 300]);
        setTimeout(() => setReceivedHeartbeat(false), 2000);
    };

    const sendHeartbeat = () => {
        setShowHeartbeat(true);
        if (navigator.vibrate) navigator.vibrate(50);
        SyncService.sendSignal('HEARTBEAT');
        setTimeout(() => setShowHeartbeat(false), 1000);
    };

    const toggleMyStatus = () => {
        const newState = myStatus.state === 'awake' ? 'sleeping' : 'awake';
        const newStatus: UserStatus = { state: newState, timestamp: new Date().toISOString() };
        StorageService.saveStatus(newStatus);
        setMyStatus(newStatus);
    };

    const getStatusDisplay = (status: UserStatus) => {
        if (!status.timestamp) return 'Status unknown';
        const date = new Date(status.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${status.state === 'sleeping' ? 'Fell asleep' : 'Active'} since ${timeStr}`;
    };

    const handleSurprise = () => {
        const allItems = [...memories.map(m => ({ type: 'memory' as const, item: m })), ...notes.map(n => ({ type: 'note' as const, item: n }))];
        if (allItems.length > 0) {
            const random = allItems[Math.floor(Math.random() * allItems.length)];
            setSurpriseContent(random);
            setShowSurprise(true);
        } else alert("Add some memories or notes first! 💖");
    };

    return (
        <div className="p-6 pt-12 pb-40 min-h-screen relative">
            {/* Received Heartbeat Overlay */}
            {receivedHeartbeat && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="absolute inset-0 bg-tulika-200/30 backdrop-blur-sm animate-fade-in"></div>
                    <div className="relative animate-elastic-pop">
                        <Heart size={150} fill="#f43f5e" className="text-tulika-500 drop-shadow-2xl" />
                        <div className="absolute inset-0 bg-tulika-400 rounded-full animate-ping opacity-75 blur-xl"></div>
                    </div>
                </div>
            )}
            {showSurprise && surpriseContent && <SurpriseModal content={surpriseContent} onClose={() => setShowSurprise(false)} />}

            {/* Sync Button */}
            <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
                onClick={() => setView('sync')}
                className={`absolute top-12 right-6 p-2 backdrop-blur-sm rounded-full transition-all z-50 cursor-pointer spring-press ${isConnected ? 'bg-green-100/80 text-green-600 shadow-sm' : 'bg-white/50 text-gray-400 hover:bg-white'}`}
            >
                <RefreshCw size={20} />
            </motion.button>

            {/* Header — Fade down entrance */}
            <motion.header
                initial={{ opacity: 0, y: -30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 22 }}
                className="mb-8 relative z-10"
                onClick={() => setView('profile')}
            >
                <div className={`flex items-center gap-4 cursor-pointer group transition-all duration-700 ${isTogether ? 'glass-card p-3 -m-3 rounded-[2rem] animate-glow-pulse' : ''}`}>
                    <div className={`w-16 h-16 rounded-full bg-tulika-100 overflow-hidden relative transition-all duration-700 group-hover:scale-105 ${isTogether ? 'ring-4 ring-tulika-300 ring-opacity-50' : ''}`} style={{ boxShadow: '0 2px 8px rgba(244,63,94,0.12), 0 0 0 2px white' }}>
                        {profile.photo ? <img src={profile.photo} className="w-full h-full object-cover" alt="Profile" /> : <div className="w-full h-full flex items-center justify-center text-tulika-300"><Heart fill="currentColor" size={24} /></div>}
                    </div>
                    <div>
                        <h1 className="font-serif text-3xl text-gray-900 font-bold leading-tight group-hover:text-tulika-600 transition-colors relative" style={{ letterSpacing: '-0.02em' }}>
                            {profile.myName} <span className="text-tulika-500 inline-flex items-center translate-y-[2px]">&</span> {profile.partnerName}
                            {isTogether && <span className="absolute -right-6 -top-2 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>}
                        </h1>
                        {streak > 0 && <div className="inline-flex items-center gap-1 bg-orange-100/80 text-orange-600 px-2.5 py-0.5 rounded-full mt-1.5"><Zap size={12} fill="currentColor" /><span className="text-[10px] font-bold uppercase tracking-wider">{streak} Day Streak</span></div>}
                        {streak === 0 && <p className={`text-xs font-medium uppercase tracking-widest mt-1.5 transition-colors ${isTogether ? 'text-tulika-600 font-bold' : 'text-gray-400 group-hover:text-tulika-400'}`}>{isTogether ? 'Currently Together ❤️' : 'Tap to edit profile'}</p>}
                    </div>
                </div>
            </motion.header>

            {/* Pet Section — Slide up */}
            <ScrollReveal variant="fadeUp" delay={0.1}>
                <CouplePet memories={memories} notes={notes} status={myStatus} partnerName={profile.partnerName} />
            </ScrollReveal>

            {/* Days Together Card — Scale + fade hero entrance with counting number */}
            <ScrollReveal variant="fadeScale">
                <div ref={heroRef}>
                    <HolographicCard
                        drag
                        dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                        dragElastic={0.2}
                        onClick={() => setShowDetailedDuration(!showDetailedDuration)}
                        className="bg-gradient-to-br from-tulika-500 via-pink-500 to-rose-400 text-white p-8 rounded-3xl mb-6 spring-hover duration-500 group relative overflow-hidden border border-white/20"
                        style={{ boxShadow: '0 8px 24px rgba(244,63,94,0.3), 0 20px 60px rgba(244,63,94,0.15)' }}
                    >
                        {/* Decorative heart watermark */}
                        <div className="absolute -right-6 -top-6 opacity-[0.15] group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                            <Heart size={160} fill="white" />
                        </div>
                        {/* Inner glow */}
                        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/15 to-transparent pointer-events-none rounded-t-3xl" />
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/10 to-transparent pointer-events-none rounded-b-3xl" />
                        <div className="flex items-center justify-between mb-6 relative z-10">
                            <span className="text-white/70 font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5 ml-0.5">
                                <Clock size={14} className="translate-y-[-1px]" /> Our Journey
                            </span>
                            <Sparkles size={18} className="text-white/50 group-hover:rotate-180 transition-transform duration-700 mr-0.5" />
                        </div>
                        <div className="relative min-h-[5rem] flex items-center z-10 px-1" style={{ perspective: '600px' }}>
                            <div className={`transition-all duration-500 w-full ${showDetailedDuration ? 'opacity-0 translate-y-4 absolute pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                                <p className="text-white/60 text-[10px] font-bold mb-3 uppercase tracking-widest">You've been together for</p>
                                <div className="flex items-baseline gap-3 mb-3">
                                    <h2 className="text-8xl font-serif tracking-tighter font-bold text-white drop-shadow-lg" style={{ lineHeight: '1' }}>{displayCount}</h2>
                                    <span className="text-2xl text-white/60 font-serif italic">days</span>
                                </div>
                                <p className="text-white/80 text-xs font-bold flex items-center gap-1.5">
                                    <Sparkles size={12} fill="currentColor" /> Every day matters
                                </p>
                            </div>
                            <div className={`transition-all duration-500 w-full ${!showDetailedDuration ? 'opacity-0 -translate-y-4 absolute pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                                <p className="text-white/60 text-[10px] font-bold mb-3 uppercase tracking-widest">That is exactly</p>
                                <h2 className="text-3xl font-serif font-bold mb-3 leading-tight tracking-tight text-white">{detailedDuration || `${daysTogether} days`}</h2>
                                <p className="text-white/80 text-xs font-bold flex items-center gap-1.5">
                                    <Heart size={12} fill="currentColor" /> and counting...
                                </p>
                            </div>
                        </div>
                    </HolographicCard>
                </div>
            </ScrollReveal>

            {/* Countdown Card — Slide from right */}
            <ScrollReveal variant="slideFromRight">
                <HolographicCard
                    drag
                    dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                    dragElastic={0.2}
                    onClick={() => setView('countdowns')}
                    className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 text-white p-6 rounded-3xl mb-6 group spring-hover relative overflow-hidden border border-indigo-700/30"
                    style={{ boxShadow: '0 4px 16px rgba(79,70,229,0.15), 0 12px 40px rgba(79,70,229,0.1)' }}
                >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-400/20 rounded-full blur-3xl group-hover:bg-indigo-300/30 transition-colors duration-700"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-violet-400/15 rounded-full blur-2xl"></div>
                    <div className="relative z-10 flex justify-between items-center">
                        <div className="flex flex-col"><div className="flex items-center gap-2 mb-2"><Map size={16} className="text-indigo-300" /><span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Downtown</span></div>{nextEvent ? (<><h3 className="font-serif text-xl font-bold mb-1">{nextEvent.title}</h3><p className="text-sm text-indigo-300 font-medium">Coming up in <span className="text-2xl font-serif font-bold text-white">{nextEvent.days}</span> <span className="text-indigo-300 text-xs">days</span></p></>) : (<><h3 className="font-serif text-xl font-bold mb-0.5">Your Town is Empty</h3><p className="text-xs text-indigo-300 font-medium">Add some special dates!</p></>)}</div>
                        <div className="bg-white/10 p-3.5 rounded-2xl backdrop-blur-sm group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500 border border-white/10"><Calendar size={24} className="text-indigo-200" /></div>
                    </div>
                </HolographicCard>
            </ScrollReveal>

            {/* On This Day — Tilt entrance */}
            {onThisDayMemory && (
                <ScrollReveal variant="tiltUp">
                    <div onClick={() => setView('timeline')} className={`rounded-3xl shadow-lg mb-6 relative z-10 spring-hover cursor-pointer overflow-hidden ${otdImage ? 'text-white h-48' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6'}`}>
                        {otdImage && (<><img src={otdImage} className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-1000 hover:scale-105" alt="On this day" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-0"></div></>)}
                        <div className={`relative z-10 h-full flex flex-col ${otdImage ? 'justify-end p-6' : ''}`}>
                            <div className="flex items-center gap-2 mb-2 opacity-90">
                                <Calendar size={16} className="text-yellow-300" />
                                <span className="text-xs font-bold uppercase tracking-wider text-yellow-300">On This Day</span>
                            </div>
                            <h3 className="font-serif text-2xl font-bold mb-1 shadow-black drop-shadow-md">{getYear(new Date()) - getYear(new Date(onThisDayMemory.date))} year ago today ❤️</h3>
                            {onThisDayMemory.text && <p className={`text-sm line-clamp-2 italic ${otdImage ? 'text-gray-100' : 'text-indigo-100'}`}>"{onThisDayMemory.text}"</p>}
                        </div>
                    </div>
                </ScrollReveal>
            )}

            {/* Action Buttons — Pop in */}
            <ScrollReveal variant="popIn">
                <div className="mb-6 flex gap-4 relative z-10">
                    <MagneticButton onClick={sendHeartbeat as any} strength={0.2} className="flex-1">
                        <div className="w-full h-full group relative bg-gradient-to-br from-tulika-500 to-tulika-600 text-white p-5 rounded-3xl spring-press transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden" style={{ boxShadow: '0 4px 12px rgba(244,63,94,0.25), 0 12px 32px rgba(244,63,94,0.15)' }}>
                            <HeartbeatRipple active={showHeartbeat} />
                            <div className={`transition-transform duration-300 ${showHeartbeat ? 'scale-125 animate-wiggle-spring' : 'group-hover:scale-110 group-hover:animate-wiggle'}`}><Heart fill="currentColor" size={24} /></div>
                            <span className="font-bold text-sm tracking-wide">Heartbeat</span>
                        </div>
                    </MagneticButton>
                    <MagneticButton onClick={handleSurprise as any} strength={0.4} className="w-20">
                        <div className="w-full h-full glass-card text-tulika-500 p-5 rounded-3xl spring-press transition-all flex items-center justify-center group relative overflow-hidden">
                            <div className="absolute inset-0 bg-tulika-50/60 transform scale-0 group-hover:scale-100 transition-transform duration-300 rounded-3xl"></div>
                            <Gift size={24} className="relative z-10 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300" />
                        </div>
                    </MagneticButton>
                </div>
            </ScrollReveal>

            {/* Status & Feature Grid — Staggered entrance */}
            <motion.div
                className="grid grid-cols-2 gap-4 relative z-10 mb-20"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={gridContainerVariants}
            >
                <motion.div variants={gridItemVariants} className={`col-span-1 p-5 rounded-3xl flex flex-col justify-between spring-press magnetic-card ${partnerStatus.state === 'sleeping' ? 'bg-indigo-900/90 text-indigo-100 border border-indigo-700/30' : 'glass-card'}`} style={partnerStatus.state !== 'sleeping' ? {} : { boxShadow: '0 4px 16px rgba(79,70,229,0.15)' }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Partner</span>
                        {partnerStatus.state === 'sleeping' ? <Moon size={16} className="text-yellow-300" fill="currentColor" /> : <Sun size={16} className="text-orange-400 animate-spin-slow" />}
                    </div>
                    <div>
                        <p className="font-bold font-serif leading-tight">{profile.partnerName} is {partnerStatus.state === 'sleeping' ? 'Asleep' : 'Awake'}</p>
                        <p className="text-[10px] opacity-60 mt-1 leading-tight">{getStatusDisplay(partnerStatus)}</p>
                    </div>
                </motion.div>

                <motion.div variants={gridItemVariants} onClick={toggleMyStatus} className={`col-span-1 p-5 rounded-3xl flex flex-col justify-between cursor-pointer transition-all duration-300 spring-press relative overflow-hidden group magnetic-card ${myStatus.state === 'sleeping' ? 'bg-indigo-600 text-white border border-indigo-500/30' : 'glass-card text-tulika-600'}`} style={myStatus.state === 'sleeping' ? { boxShadow: '0 4px 16px rgba(79,70,229,0.2)' } : {}}>
                    <div className="flex items-center justify-between mb-2 relative z-10">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">You</span>
                        {myStatus.state === 'sleeping' ? <Moon size={16} fill="currentColor" /> : <Sun size={16} />}
                    </div>
                    <div className="relative z-10">
                        <p className="font-bold font-serif leading-tight">{myStatus.state === 'sleeping' ? 'I am Sleeping' : 'I am Awake'}</p>
                        <p className="text-[10px] opacity-60 mt-1 group-hover:underline">Tap to switch</p>
                    </div>
                    {myStatus.state === 'sleeping' && <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-xl -mr-4 -mt-4"></div>}
                </motion.div>

                <motion.div variants={gridItemVariants}>
                    <MagneticButton onClick={() => setView('open-when')} strength={0.15} className="w-full h-full">
                        <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white p-6 rounded-3xl flex flex-col items-center justify-center gap-3 spring-press transition-all group magnetic-card h-full relative overflow-hidden border border-white/20" style={{ boxShadow: '0 6px 20px rgba(14,165,233,0.25)' }}>
                            <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full blur-2xl"></div>
                            <div className="bg-white/20 p-3.5 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300 backdrop-blur-sm"><Mail size={28} /></div>
                            <span className="font-semibold text-sm">Open When</span>
                        </div>
                    </MagneticButton>
                </motion.div>

                <motion.div variants={gridItemVariants}>
                    <MagneticButton onClick={() => setView('dinner-decider')} strength={0.15} className="w-full h-full">
                        <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-6 rounded-3xl flex flex-col items-center justify-center gap-3 spring-press transition-all group magnetic-card h-full relative overflow-hidden border border-white/20" style={{ boxShadow: '0 6px 20px rgba(245,158,11,0.25)' }}>
                            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-white/10 rounded-full blur-2xl"></div>
                            <div className="bg-white/20 p-3.5 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300 backdrop-blur-sm"><Utensils size={28} /></div>
                            <span className="font-semibold text-sm">Dinner?</span>
                        </div>
                    </MagneticButton>
                </motion.div>

                <motion.div variants={gridItemVariants} className="col-span-2" onClick={() => setView('mood-calendar')}>
                    <div className="bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 text-white p-5 rounded-3xl flex items-center justify-between cursor-pointer relative overflow-hidden group active:scale-[0.98] transition-all duration-300 border border-white/20" style={{ boxShadow: '0 6px 20px rgba(236,72,153,0.25)' }}>
                        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="absolute -left-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="relative z-10 flex items-center gap-4">
                            <div className="bg-white/20 p-3 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300 backdrop-blur-sm border border-white/10">
                                <Sparkles size={24} className="text-white" />
                            </div>
                            <div>
                                <span className="block font-serif font-bold text-lg text-white tracking-tight">Mood Board</span>
                                <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Daily colors & memories</span>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-white/40 group-hover:translate-x-1 transition-transform relative z-10" />
                    </div>
                </motion.div>

                <motion.div variants={gridItemVariants} className="col-span-2" onClick={() => setView('quiet-mode')}>
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white p-5 rounded-3xl spring-hover spring-press transition-all flex items-center justify-between cursor-pointer relative overflow-hidden group border border-white/10" style={{ boxShadow: '0 6px 20px rgba(15,23,42,0.3)' }}>
                        <div className="relative z-10 flex items-center gap-4">
                            <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300 border border-white/10"><Wind size={24} className="text-indigo-200" /></div>
                            <div>
                                <span className="block font-serif font-bold text-lg text-indigo-50 tracking-tight">Quiet Mode</span>
                                <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest opacity-60">Just memories, no distractions</span>
                            </div>
                        </div>
                        <div className="absolute right-0 top-0 w-40 h-40 bg-indigo-500/15 rounded-full blur-3xl"></div>
                        <ChevronRight size={20} className="text-white/20 group-hover:translate-x-1 transition-transform relative z-10" />
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};
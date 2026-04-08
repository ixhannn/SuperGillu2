import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Heart, Sparkles, Mail, Moon, RefreshCw, Utensils, Gift, Calendar, X, Clock, Zap, Sun, Map, TreeDeciduous, Cloud } from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ViewState, UserStatus, CoupleProfile, Memory, Note, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { AmbientService } from '../services/ambient';
import { differenceInDays, getYear, intervalToDuration, isAfter, setYear } from 'date-fns';
import { MagneticButton } from '../components/MagneticButton';
import { HolographicCard } from '../components/HolographicCard';
import { TiltCard } from '../components/TiltCard';
import { HeartbeatParticles, HeartbeatParticlesHandle } from '../components/HeartbeatParticles';
import { DailyQuestion } from '../components/DailyQuestion';

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
            else if (mem.imageId || mem.storagePath) {
                StorageService.getImage(mem.imageId || '', undefined, mem.storagePath).then(data => setImageUrl(data || null));
            }
        }
    }, [content]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-backdrop-enter" onClick={onClose}
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)' }}>
            <div
                className="bg-white w-full max-w-sm rounded-[2rem] shadow-elevated relative animate-modal-enter overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-tulika-50 to-transparent pointer-events-none" />

                <div className="p-7 pb-8 relative">
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-2 text-tulika-500">
                            <Sparkles size={16} className="animate-wiggle-spring" />
                            <span className="text-micro uppercase tracking-widest">A Memory For You</span>
                        </div>
                        <button onClick={onClose} className="p-1.5 bg-gray-100 rounded-full text-gray-400 spring-press">
                            <X size={18} />
                        </button>
                    </div>

                    {type === 'memory' ? (
                        <div className="bg-white p-3 rounded-2xl shadow-soft-xl border border-gray-100/80 -rotate-1">
                            {imageUrl ? (
                                <div className="aspect-square bg-gray-50 rounded-xl overflow-hidden mb-3">
                                    <img src={imageUrl} alt="Memory" className="w-full h-full object-cover" />
                                </div>
                            ) : (
                                <div className="aspect-video bg-tulika-50 rounded-xl flex items-center justify-center mb-3 text-tulika-200">
                                    <Heart size={40} />
                                </div>
                            )}
                            {(item as Memory).text && (
                                <p className="font-serif text-lg text-gray-800 italic text-center leading-snug px-2 pb-2">
                                    "{(item as Memory).text}"
                                </p>
                            )}
                            <div className="mt-2 text-center">
                                <span className="text-micro text-gray-400 uppercase tracking-widest">
                                    {new Date((item as Memory).date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-50/80 p-8 rounded-2xl shadow-inner rotate-1 relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-tulika-400 shadow-sm border-2 border-white/60" />
                            <p className="font-serif text-xl text-gray-800 leading-relaxed whitespace-pre-wrap">
                                "{(item as Note).content}"
                            </p>
                            <div className="mt-6 flex justify-end">
                                <Heart size={14} className="text-tulika-400" fill="currentColor" />
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="w-full bg-gray-50 text-gray-500 py-4 font-bold text-sm border-t border-gray-100 spring-press"
                >
                    Close
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
                let bassSum = 0;
                for (let i = 0; i < 4; i++) bassSum += data[i] || 0;
                const scale = 1 + (bassSum / 4 / 255) * 0.4;
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
                <span key={i} className="absolute inset-0 rounded-3xl border-2 border-white/40 ripple-ring" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
        </div>
    );
};

// === SCROLL ANIMATION SYSTEM ===
const scrollVariants = {
    fadeUp: {
        hidden: { opacity: 0, y: 40, scale: 0.97 },
        visible: { opacity: 1, y: 0, scale: 1 }
    },
    fadeScale: {
        hidden: { opacity: 0, scale: 0.88, y: 20 },
        visible: { opacity: 1, scale: 1, y: 0 }
    },
    slideFromLeft: {
        hidden: { opacity: 0, x: -48 },
        visible: { opacity: 1, x: 0 }
    },
    slideFromRight: {
        hidden: { opacity: 0, x: 48 },
        visible: { opacity: 1, x: 0 }
    },
    popIn: {
        hidden: { opacity: 0, scale: 0.7, y: 12 },
        visible: { opacity: 1, scale: 1, y: 0 }
    },
    tiltUp: {
        hidden: { opacity: 0, y: 48, rotateX: 10, scale: 0.96 },
        visible: { opacity: 1, y: 0, rotateX: 0, scale: 1 }
    }
};

const gridContainerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.03 } }
};

const gridItemVariants = {
    hidden: { opacity: 0, y: 32, scale: 0.92, rotateX: 4 },
    visible: {
        opacity: 1, y: 0, scale: 1, rotateX: 0,
        transition: { type: "spring", stiffness: 380, damping: 22, mass: 0.7 }
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
        viewport={{ once: true, margin: "-50px" }}
        variants={scrollVariants[variant]}
        transition={{ type: "spring", stiffness: 350, damping: 24, mass: 0.7, delay }}
        className={className}
        style={{ transformPerspective: 900 }}
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
            const eased = 1 - Math.pow(1 - progress, 3);
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
    const [isDissolving, setIsDissolving] = useState(false);
    const [isConnected, setIsConnected] = useState(SyncService.isConnected);
    const [isTogether, setIsTogether] = useState(false);
    const [headerOpacity, setHeaderOpacity] = useState(0);

    const heroRef = useRef<HTMLDivElement>(null);
    const heartbeatBtnRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<HeartbeatParticlesHandle>(null);
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
            else if (onThisDayMemory.imageId || onThisDayMemory.storagePath) StorageService.getImage(onThisDayMemory.imageId || '', undefined, onThisDayMemory.storagePath).then(img => setOtdImage(img || null));
        } else setOtdImage(null);
    }, [onThisDayMemory]);

    // Scroll-linked header opacity — transparent at top, solid on scroll
    useEffect(() => {
        const mainEl = document.querySelector('main');
        if (!mainEl) return;
        
        const handleScroll = (e: Event) => {
            const y = (e.target as HTMLElement).scrollTop || 0;
            setHeaderOpacity(Math.min(y / 100, 1));
        };
        
        mainEl.addEventListener('scroll', handleScroll, { passive: true });
        // Trigger once to set initial state
        handleScroll({ target: mainEl } as unknown as Event);
        
        return () => mainEl.removeEventListener('scroll', handleScroll);
    }, []);

    const triggerReceivedHeartbeat = () => {
        setReceivedHeartbeat(true);
        if (heartbeatBtnRef.current) {
            const rect = heartbeatBtnRef.current.getBoundingClientRect();
            particlesRef.current?.triggerReceive(rect.left + rect.width / 2, rect.top + rect.height / 2);
        } else {
            particlesRef.current?.triggerReceive(window.innerWidth / 2, window.innerHeight / 2);
        }
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 300]);
        setTimeout(() => setReceivedHeartbeat(false), 2000);
    };

    const sendHeartbeat = () => {
        if (!heartbeatBtnRef.current || isDissolving) return;
        
        const rect = heartbeatBtnRef.current.getBoundingClientRect();
        setIsDissolving(true);
        if (navigator.vibrate) navigator.vibrate(50);
        
        particlesRef.current?.triggerButtonDissolve(rect, () => {
            setIsDissolving(false);
            SyncService.sendSignal('HEARTBEAT');
        });
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

    // ── Section divider for visual hierarchy ──
    const SectionDivider = ({ label }: { label: string }) => (
        <div className="flex items-center gap-3 mb-4 mt-2 px-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
            <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
        </div>
    );

    return (
        <div className="px-5 pt-14 pb-40 min-h-screen relative parallax-container">
            {/* Scroll-linked floating header bar */}
            <div
                className="fixed top-0 left-0 right-0 z-30 pointer-events-none transition-opacity duration-300"
                style={{
                    opacity: headerOpacity,
                    background: `rgba(15,10,20,${0.7 + headerOpacity * 0.15})`,
                    backdropFilter: headerOpacity > 0.1 ? 'blur(16px) saturate(140%)' : 'none',
                    WebkitBackdropFilter: headerOpacity > 0.1 ? 'blur(16px) saturate(140%)' : 'none',
                    borderBottom: `1px solid rgba(255,255,255,${headerOpacity * 0.06})`,
                    height: 'env(safe-area-inset-top, 0px)',
                    minHeight: '2.5rem',
                }}
            />

            {/* Particle Heart — triggered on send & receive */}
            <HeartbeatParticles ref={particlesRef} />
            {showSurprise && surpriseContent && <SurpriseModal content={surpriseContent} onClose={() => setShowSurprise(false)} />}

            {/* ── HEADER ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-2 relative z-10">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 250, damping: 22 }}
                >
                    <button
                        onClick={() => setView('profile')}
                        className={`flex items-center gap-3.5 group transition-all duration-500 rounded-[1.5rem] ${isTogether ? 'glass-card p-2.5 pr-4 animate-glow-pulse' : 'p-0'}`}
                    >
                        <div
                            className={`w-12 h-12 rounded-full bg-tulika-50 overflow-hidden flex-shrink-0 transition-all duration-500 ${isTogether ? 'ring-[3px] ring-tulika-300/50' : ''}`}
                            style={{ boxShadow: '0 2px 8px rgba(251,207,232,0.1), 0 0 0 2px rgba(251,207,232,0.3)' }}
                        >
                            {profile.photo
                                ? <img src={profile.photo} className="w-full h-full object-cover" alt="Profile" />
                                : <div className="w-full h-full flex items-center justify-center text-tulika-200"><Heart fill="currentColor" size={20} /></div>
                            }
                        </div>
                        <div className="text-left">
                            <h1 className="font-serif text-headline text-gray-800 leading-none" style={{ fontSize: '1.625rem' }}>
                                {profile.myName} <span className="text-tulika-500">&</span> {profile.partnerName}
                            </h1>
                            {streak > 0 && (
                                <div className="inline-flex items-center gap-1 bg-amber-100/80 text-amber-600 px-2 py-0.5 rounded-full mt-1">
                                    <Zap size={10} fill="currentColor" />
                                    <span className="text-micro">{streak} Day Streak</span>
                                </div>
                            )}
                            {streak === 0 && (
                                <p className={`text-micro mt-1 ${isTogether ? 'text-tulika-500' : 'text-gray-400'}`}>
                                    {isTogether ? 'Together right now' : 'Tap to edit profile'}
                                </p>
                            )}
                        </div>
                    </button>
                </motion.div>

                <motion.button
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
                    onClick={() => setView('sync')}
                    className={`spring-press transition-all rounded-2xl px-3 py-2 min-w-[7.25rem] flex items-center justify-center gap-2 border ${
                        isConnected
                            ? 'bg-gradient-to-br from-sage-200/90 to-sage-100/85 text-sage-700 border-sage-300/70 shadow-[0_8px_20px_rgba(86,140,112,0.22)]'
                            : 'bg-white/72 text-tulika-700 border-white/80 shadow-[0_8px_20px_rgba(236,72,153,0.16)] backdrop-blur-md'
                    }`}
                    aria-label="Open cloud sync"
                >
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        isConnected ? 'bg-sage-50/85 text-sage-600' : 'bg-white/85 text-tulika-600'
                    }`}>
                        {isConnected ? <RefreshCw size={14} /> : <Cloud size={14} />}
                    </span>
                    <span className="text-[11px] font-extrabold tracking-wider uppercase">
                        {isConnected ? 'Synced' : 'Sync'}
                    </span>
                </motion.button>
            </div>

            {/* Together indicator */}
            {isTogether && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-4"
                >
                    <div className="flex items-center gap-2 px-1">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-sage-500" />
                        </span>
                        <span className="text-micro text-sage-600">Both online</span>
                    </div>
                </motion.div>
            )}

            {/* ── DAYS TOGETHER — Hero Card ────────────────────────────── */}
            <ScrollReveal variant="fadeScale">
                <div ref={heroRef}>
                    <TiltCard
                        maxTilt={12}
                        glare
                        scale={1.01}
                        onClick={() => setShowDetailedDuration(!showDetailedDuration)}
                        className="relative overflow-hidden p-8 rounded-[1.75rem] mb-5 aurora-card border border-white/20 cursor-pointer"
                        style={{
                            background: 'linear-gradient(135deg, #ec4899 0%, #f9a8d4 35%, #ec4899 70%, #f472b6 100%)',
                            boxShadow: '0 8px 32px rgba(251,207,232,0.25), 0 24px 64px rgba(251,207,232,0.10)',
                        }}
                    >
                        {/* Decorative heart watermark */}
                        <div className="absolute -right-8 -top-8 opacity-[0.1] pointer-events-none">
                            <Heart size={180} fill="white" />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-6">
                                <span className="text-white/60 text-micro uppercase tracking-widest flex items-center gap-1.5">
                                    <Clock size={12} /> Our Journey
                                </span>
                                <Sparkles size={16} className="text-white/40" />
                            </div>

                            <div className="min-h-[5rem] flex items-center">
                                <div className={`transition-all duration-500 w-full ${showDetailedDuration ? 'opacity-0 translate-y-4 absolute pointer-events-none' : ''}`}>
                                    <p className="text-white/50 text-micro uppercase tracking-widest mb-3">You've been together for</p>
                                    <div className="flex items-baseline gap-2.5 mb-3">
                                        <h2 className="text-[5.5rem] font-serif tracking-tighter font-bold text-white leading-none drop-shadow-lg">{displayCount}</h2>
                                        <span className="text-xl text-white/50 font-serif italic">days</span>
                                    </div>
                                    <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5">
                                        <Sparkles size={11} fill="currentColor" /> Every day matters
                                    </p>
                                </div>
                                <div className={`transition-all duration-500 w-full ${!showDetailedDuration ? 'opacity-0 -translate-y-4 absolute pointer-events-none' : ''}`}>
                                    <p className="text-white/50 text-micro uppercase tracking-widest mb-3">That is exactly</p>
                                    <h2 className="text-3xl font-serif font-bold mb-3 leading-tight text-white">{detailedDuration || `${daysTogether} days`}</h2>
                                    <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5">
                                        <Heart size={11} fill="currentColor" /> and counting...
                                    </p>
                                </div>
                            </div>
                        </div>
                    </TiltCard>
                </div>
            </ScrollReveal>

            {/* ── ACTION BUTTONS — Heartbeat & Surprise ────────────────── */}
            <ScrollReveal variant="popIn">
                <div className="mb-5 flex gap-3 relative z-10">
                    <MagneticButton onClick={sendHeartbeat as any} strength={0.2} className="flex-1">
                        <div
                            ref={heartbeatBtnRef}
                            className={`w-full h-full group relative bg-gradient-to-br from-tulika-500 to-tulika-600 text-white p-5 rounded-[1.5rem] spring-press flex items-center justify-center gap-3 overflow-hidden transition-all duration-300 ${receivedHeartbeat ? 'ring-2 ring-tulika-300/50 animate-glow-pulse' : ''} ${isDissolving ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                            style={{ boxShadow: receivedHeartbeat ? '0 4px 24px rgba(251,207,232,0.40), 0 12px 40px rgba(251,207,232,0.15)' : '0 4px 16px rgba(251,207,232,0.20), 0 12px 32px rgba(251,207,232,0.08)' }}
                        >
                            <HeartbeatRipple active={showHeartbeat} />
                            <div className={`transition-transform duration-300 ${showHeartbeat ? 'scale-125 animate-wiggle-spring' : ''}`}>
                                <Heart fill="currentColor" size={22} />
                            </div>
                            <span className="font-bold text-sm tracking-wide">Heartbeat</span>
                        </div>
                    </MagneticButton>
                    <MagneticButton onClick={handleSurprise as any} strength={0.3} className="w-[4.5rem]">
                        <div className="w-full h-full bento-card text-tulika-500 p-5 flex items-center justify-center spring-press">
                            <Gift size={22} />
                        </div>
                    </MagneticButton>
                </div>
            </ScrollReveal>

            {/* ── STATUS PILLS ─────────────────────────────────────────── */}
            <div className="flex gap-3 mb-5 relative z-10">
                {/* Partner status pill */}
                <div
                    className="flex-1 flex items-center gap-2.5 px-4 py-4"
                    style={partnerStatus.state === 'sleeping' ? {
                        borderRadius: '100px',
                        background: 'linear-gradient(180deg, rgba(50,44,40,0.98) 0%, rgba(28,25,23,0.98) 100%)',
                        border: '1px solid rgba(80,70,60,0.40)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.12), 0 4px 12px rgba(0,0,0,0.18)',
                    } : {
                        borderRadius: '100px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.78) 100%)',
                        backdropFilter: 'blur(20px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
                        border: '1px solid rgba(255,255,255,0.95)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,1), inset 0 0 18px rgba(255,255,255,0.55), 0 2px 10px rgba(232,160,176,0.08)',
                    }}
                >
                    <div className="relative flex-shrink-0">
                        {partnerStatus.state === 'sleeping'
                            ? <Moon size={14} className="text-amber-300" fill="currentColor" />
                            : <Sun size={14} className="text-amber-400 animate-spin-slow" />
                        }
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-semibold leading-tight ${partnerStatus.state === 'sleeping' ? 'text-warmgray-100' : 'text-gray-700'}`}>
                            {profile.partnerName} · {partnerStatus.state === 'sleeping' ? 'Asleep' : 'Awake'}
                        </span>
                        <span className={`text-[10px] mt-0.5 leading-tight truncate ${partnerStatus.state === 'sleeping' ? 'text-warmgray-400' : 'text-gray-400'}`}>
                            {getStatusDisplay(partnerStatus)}
                        </span>
                    </div>
                </div>
                {/* My status pill */}
                <div
                    onClick={toggleMyStatus}
                    className="flex-1 flex items-center gap-2.5 px-4 py-4 cursor-pointer spring-press"
                    style={myStatus.state === 'sleeping' ? {
                        borderRadius: '100px',
                        background: 'linear-gradient(180deg, rgba(175,20,55,0.95) 0%, rgba(130,14,42,0.98) 100%)',
                        border: '1px solid rgba(220,40,80,0.30)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(159,18,57,0.35)',
                    } : {
                        borderRadius: '100px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.78) 100%)',
                        backdropFilter: 'blur(20px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
                        border: '1px solid rgba(255,255,255,0.95)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,1), inset 0 0 18px rgba(255,255,255,0.55), 0 2px 10px rgba(232,160,176,0.08)',
                    }}
                >
                    <div className="relative flex-shrink-0">
                        {myStatus.state === 'sleeping'
                            ? <Moon size={14} className="text-tulika-200" fill="currentColor" />
                            : <Sun size={14} className="text-amber-400 animate-spin-slow" />
                        }
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-semibold leading-tight ${myStatus.state === 'sleeping' ? 'text-white' : 'text-gray-700'}`}>
                            You · {myStatus.state === 'sleeping' ? 'Asleep' : 'Awake'}
                        </span>
                        <span className={`text-[10px] mt-0.5 leading-tight ${myStatus.state === 'sleeping' ? 'text-tulika-300/60' : 'text-gray-400'}`}>
                            tap to switch
                        </span>
                    </div>
                </div>
            </div>

            {/* ── COUNTDOWN CARD ───────────────────────────────────────── */}
            <ScrollReveal variant="slideFromRight">
                <TiltCard
                    maxTilt={14}
                    glare
                    onClick={() => setView('countdowns')}
                    className="relative overflow-hidden p-6 rounded-[1.75rem] mb-5 aurora-card border border-white/10 cursor-pointer"
                    style={{
                        background: 'linear-gradient(140deg, #1c1917 0%, #292524 40%, #3a1520 100%)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 12px 40px rgba(120,60,20,0.08)',
                    }}
                >
                    <div className="absolute top-0 right-0 w-44 h-44 bg-amber-400/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-28 h-28 bg-tulika-400/8 rounded-full blur-2xl" />

                    <div className="relative z-10 flex justify-between items-center text-white">
                        <div>
                            <div className="flex items-center gap-2 mb-2.5">
                                <Map size={14} className="text-amber-300/80" />
                                <span className="text-micro uppercase tracking-widest text-amber-300/70">Countdown</span>
                            </div>
                            {nextEvent ? (
                                <>
                                    <h3 className="font-serif text-xl font-bold mb-1 leading-tight">{nextEvent.title}</h3>
                                    <p className="text-sm text-amber-200/60 font-medium">
                                        In <span className="text-2xl font-serif font-bold text-white">{nextEvent.days}</span> <span className="text-xs text-amber-200/50">days</span>
                                    </p>
                                </>
                            ) : (
                                <>
                                    <h3 className="font-serif text-lg font-bold mb-0.5">No upcoming events</h3>
                                    <p className="text-xs text-amber-200/50 font-medium">Add special dates!</p>
                                </>
                            )}
                        </div>
                        <div className="bg-white/8 p-3 rounded-2xl border border-white/10">
                            <Calendar size={22} className="text-amber-200/80" />
                        </div>
                    </div>
                </TiltCard>
            </ScrollReveal>

            {/* ── TODAY'S QUESTION ─────────────────────────────────────── */}
            <div className="mb-5 relative z-10">
                <DailyQuestion profile={profile} onUpdate={() => {}} />
            </div>

            {/* ── ON THIS DAY ──────────────────────────────────────────── */}
            {onThisDayMemory && (
                <ScrollReveal variant="tiltUp">
                    <div
                        onClick={() => setView('timeline')}
                        className={`rounded-[1.75rem] mb-5 relative z-10 spring-press cursor-pointer overflow-hidden ${
                            otdImage ? 'text-white h-48' : 'bg-gradient-to-br from-tulika-500 to-amber-500 text-white p-6'
                        }`}
                        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    >
                        {otdImage && (
                            <>
                                <img
                                    src={otdImage}
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[20s] ease-linear hover:scale-110"
                                    alt="On this day"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                            </>
                        )}
                        <div className={`relative z-10 h-full flex flex-col ${otdImage ? 'justify-end p-6' : ''}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <Calendar size={14} className="text-amber-300" />
                                <span className="text-micro uppercase tracking-widest text-amber-300">On This Day</span>
                            </div>
                            <div className="flex items-end justify-between">
                                <div>
                                    <h3 className="font-serif text-2xl font-bold mb-1 drop-shadow-md">
                                        {getYear(new Date()) - getYear(new Date(onThisDayMemory.date))} year ago today
                                    </h3>
                                    {onThisDayMemory.text && (
                                        <p className={`text-sm line-clamp-2 italic ${otdImage ? 'text-gray-200' : 'text-rose-100'}`}>
                                            "{onThisDayMemory.text}"
                                        </p>
                                    )}
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-widest text-white/50 bg-white/10 px-2.5 py-1 rounded-full flex-shrink-0 ml-3">
                                    View
                                </span>
                            </div>
                        </div>
                    </div>
                </ScrollReveal>
            )}

            {/* ── STATUS & FEATURE BENTO GRID ──────────────────────────── */}
            <motion.div
                className="grid grid-cols-2 gap-3 relative z-10 mb-16"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={gridContainerVariants}
                style={{ transformPerspective: 900 }}
            >
                {/* Open When — bento-card alignment */}
                <motion.div variants={gridItemVariants}>
                    <motion.div
                        whileTap={{ scale: 0.93, y: 2 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                        onClick={() => setView('open-when')}
                        className="w-full h-full cursor-pointer"
                    >
                        <div className="bento-card p-5 flex flex-col h-full relative overflow-hidden spring-press">
                            <div className="mb-3">
                                <div className="p-2.5 rounded-xl inline-block bg-blue-50 border border-blue-100/50">
                                    <Mail size={22} className="text-blue-500" />
                                </div>
                            </div>
                            <span className="font-semibold text-sm text-gray-800">Open When</span>
                            <span className="text-xs text-gray-400 mt-1">Letters for any moment</span>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Dinner Decider — bento-card alignment */}
                <motion.div variants={gridItemVariants}>
                    <motion.div
                        whileTap={{ scale: 0.93, y: 2 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                        onClick={() => setView('dinner-decider')}
                        className="w-full h-full cursor-pointer"
                    >
                        <div className="bento-card p-5 flex flex-col h-full relative overflow-hidden spring-press">
                            <div className="mb-3">
                                <div className="p-2.5 rounded-xl inline-block bg-orange-50 border border-orange-100/50">
                                    <Utensils size={22} className="text-orange-400" />
                                </div>
                            </div>
                            <span className="font-semibold text-sm text-gray-800">Dinner?</span>
                            <span className="text-xs text-gray-400 mt-1">Can't decide? We will.</span>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Mood Board */}
                <motion.div variants={gridItemVariants} className="col-span-1">
                    <motion.div
                        whileTap={{ scale: 0.93, y: 2 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                        onClick={() => setView('mood-calendar')}
                        className="w-full h-full cursor-pointer"
                    >
                        <div className="bento-card p-5 flex flex-col h-full relative overflow-hidden spring-press">
                            <div className="mb-3">
                                <div className="p-2.5 rounded-xl inline-block bg-pink-50 border border-pink-100/50">
                                    <Sparkles size={22} className="text-pink-500" />
                                </div>
                            </div>
                            <span className="font-semibold text-sm text-gray-800">Mood Board</span>
                            <span className="text-xs text-gray-400 mt-1">Daily colors & feelings</span>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Bonsai Bloom */}
                <motion.div variants={gridItemVariants} className="col-span-1">
                    <motion.div
                        whileTap={{ scale: 0.93, y: 2 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                        onClick={() => setView('bonsai-bloom')}
                        className="w-full h-full cursor-pointer"
                    >
                        <div className="bento-card p-5 flex flex-col h-full relative overflow-hidden spring-press">
                            <div className="mb-3">
                                <div className="p-2.5 rounded-xl inline-block bg-emerald-50 border border-emerald-100/50">
                                    <TreeDeciduous size={22} className="text-emerald-500" />
                                </div>
                            </div>
                            <span className="font-semibold text-sm text-gray-800">Bonsai</span>
                            <span className="text-xs text-gray-400 mt-1">Watch us grow together</span>
                        </div>
                    </motion.div>
                </motion.div>
            </motion.div>
        </div>
    );
};

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Heart, Sparkles, Mail, Moon, RefreshCw, Utensils, Gift, Calendar, X, Clock, Zap, Sun, Map, TreeDeciduous, Cloud, Mic, Crown, Lock, PawPrint, Headphones, Brain, Video, Film } from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { ViewState, UserStatus, CoupleProfile, Memory, Note, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { AmbientService } from '../services/ambient';
import { differenceInDays, getYear, intervalToDuration, isAfter, setYear } from 'date-fns';
import { TiltCard } from '../components/TiltCard';
import { HeartbeatParticles, HeartbeatParticlesHandle } from '../components/HeartbeatParticles';
import { DailyQuestion } from '../components/DailyQuestion';
import { CouplePet } from '../components/CouplePet';
import { InsightWhisper } from '../components/InsightWhisper';
import { getHomeHeaderOverlayState } from '../utils/homeHeaderOverlay';
import { getHomeContainerStyle, getHomeHeaderOverlayHeight } from '../utils/homeLayoutMetrics';

export const SectionDivider: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex items-center gap-3 mb-4 mt-2 px-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
        <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
    </div>
);

interface HomeProps {
    setView: (view: ViewState) => void;
}

const getDisplayName = (value: string | undefined, fallback: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : fallback;
};

const parseAnniversaryDate = (value: string | undefined) => {
    const parsed = value ? new Date(value) : new Date('');
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

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
                <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-lior-50 to-transparent pointer-events-none" />

                <div className="p-7 pb-8 relative">
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-2 text-lior-500">
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
                                <div className="aspect-video bg-lior-50 rounded-xl flex items-center justify-center mb-3 text-lior-200">
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
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-lior-400 shadow-sm border-2 border-white/60" />
                            <p className="font-serif text-xl text-gray-800 leading-relaxed whitespace-pre-wrap">
                                "{(item as Note).content}"
                            </p>
                            <div className="mt-6 flex justify-end">
                                <Heart size={14} className="text-lior-400" fill="currentColor" />
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

const gridContainerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.03 } }
};

const gridItemVariants: Variants = {
    hidden: { opacity: 0, y: 32, scale: 0.92, rotateX: 4 },
    visible: {
        opacity: 1, y: 0, scale: 1, rotateX: 0,
        transition: { type: 'spring' as const, stiffness: 380, damping: 22, mass: 0.7 }
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
    const [showPet, setShowPet] = useState(false);
    const [nextEvent, setNextEvent] = useState<{ title: string, days: number } | null>(null);
    const [streak, setStreak] = useState(0);
    const [memories, setMemories] = useState<Memory[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [showHeartbeat, setShowHeartbeat] = useState(false);
    const [receivedHeartbeat, setReceivedHeartbeat] = useState(false);
    const [isDissolving, setIsDissolving] = useState(false);
    const [isConnected, setIsConnected] = useState(SyncService.isConnected);
    const [isTogether, setIsTogether] = useState(false);
    const [headerScrollTop, setHeaderScrollTop] = useState(0);
    const [premiumOpen, setPremiumOpen] = useState(false);

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
        const parsedAnniversary = parseAnniversaryDate(anniversaryDate);
        if (parsedAnniversary) {
            const anniv = new Date(parsedAnniversary);
            anniv.setFullYear(now.getFullYear());
            if (!isAfter(anniv, now)) anniv.setFullYear(now.getFullYear() + 1);
            events.push({ title: 'Our Anniversary', date: anniv });
        }
        events.sort((a, b) => a.date.getTime() - b.date.getTime());
        return events.length > 0 ? { title: events[0].title, days: differenceInDays(events[0].date, now) } : null;
    };

    const loadData = () => {
        const prof = StorageService.getCoupleProfile();
        const safeProfile = {
            ...prof,
            myName: getDisplayName(prof.myName, 'You'),
            partnerName: getDisplayName(prof.partnerName, 'Partner'),
        };
        setProfile(safeProfile);
        setMyStatus(StorageService.getStatus());
        setPartnerStatus(StorageService.getPartnerStatus());
        const now = new Date();
        const parsedAnniversary = parseAnniversaryDate(prof.anniversaryDate);
        const start = parsedAnniversary ?? now;
        setDaysTogether(parsedAnniversary ? differenceInDays(now, start) : 0);
        if (parsedAnniversary && start <= now) {
            const dur = intervalToDuration({ start, end: now });
            const parts: string[] = [];
            if (dur.years) parts.push(`${dur.years} Year${dur.years > 1 ? 's' : ''}`);
            if (dur.months) parts.push(`${dur.months} Month${dur.months > 1 ? 's' : ''}`);
            if (dur.days) parts.push(`${dur.days} Day${dur.days > 1 ? 's' : ''}`);
            setDetailedDuration(parts.join(', '));
        } else {
            setDetailedDuration('');
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
                    new Notification(StorageService.getCoupleProfile().partnerName, { body: '❤️ You received a heartbeat!', icon: '/icon.svg' });
                }
            } else if (detail.signalType === 'PET_NUDGE') {
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification(StorageService.getCoupleProfile().partnerName, { body: `${detail.payload?.partner || 'Your partner'} sent a nudge! 👉`, icon: '/icon.svg' });
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
            setHeaderScrollTop(y);
        };
        
        mainEl.addEventListener('scroll', handleScroll, { passive: true });
        // Trigger once to set initial state
        handleScroll({ target: mainEl } as unknown as Event);
        
        return () => mainEl.removeEventListener('scroll', handleScroll);
    }, []);

    const headerOverlay = getHomeHeaderOverlayState(headerScrollTop);
    const homeContainerStyle = getHomeContainerStyle();
    const homeHeaderOverlayHeight = getHomeHeaderOverlayHeight();

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

    return (
        <div className="px-5 relative parallax-container" style={homeContainerStyle}>
            {/* Scroll-linked floating header bar */}
            <div
                className="fixed top-0 left-0 right-0 z-30 pointer-events-none transition-opacity ease-out"
                style={{
                    opacity: headerOverlay.opacity,
                    background: headerOverlay.background,
                    backdropFilter: headerOverlay.backdropFilter,
                    WebkitBackdropFilter: headerOverlay.webkitBackdropFilter,
                    borderBottom: headerOverlay.borderBottom,
                    transitionDuration: `${headerOverlay.transitionDurationMs}ms`,
                    height: homeHeaderOverlayHeight,
                }}
            />

            {/* Particle Heart — triggered on send & receive */}
            <HeartbeatParticles ref={particlesRef} />
            {showSurprise && surpriseContent && <SurpriseModal content={surpriseContent} onClose={() => setShowSurprise(false)} />}
            {showPet && (
                <CouplePet
                    memories={memories}
                    notes={notes}
                    status={myStatus}
                    partnerName={profile.partnerName}
                    onClose={() => setShowPet(false)}
                />
            )}

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
                            className={`w-12 h-12 rounded-full bg-lior-50 overflow-hidden flex-shrink-0 transition-all duration-500 ${isTogether ? 'ring-[3px] ring-lior-300/50' : ''}`}
                            style={{ boxShadow: '0 2px 8px rgba(251,207,232,0.1), 0 0 0 2px rgba(251,207,232,0.3)' }}
                        >
                            {profile.photo
                                ? <img src={profile.photo} className="w-full h-full object-cover" alt="Profile" />
                                : <div className="w-full h-full flex items-center justify-center text-lior-400"><Heart fill="currentColor" size={20} /></div>
                            }
                        </div>
                        <div className="text-left">
                            <h1 className="font-serif text-headline text-gray-800 leading-none" style={{ fontSize: '1.625rem' }}>
                                {profile.myName} <span className="text-lior-500">&</span> {profile.partnerName}
                            </h1>
                            {streak > 0 && (
                                <div className="inline-flex items-center gap-1 bg-amber-100/80 text-amber-600 px-2 py-0.5 rounded-full mt-1">
                                    <Zap size={10} fill="currentColor" />
                                    <span className="text-micro">{streak} Day Streak</span>
                                </div>
                            )}
                            {streak === 0 && (
                                <p className={`text-micro mt-1 ${isTogether ? 'text-lior-500' : 'text-gray-400'}`}>
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
                            : 'bg-white/72 text-lior-700 border-white/80 shadow-[0_8px_20px_rgba(236,72,153,0.16)] backdrop-blur-md'
                    }`}
                    aria-label="Open cloud sync"
                >
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        isConnected ? 'bg-sage-50/85 text-sage-600' : 'bg-white/85 text-lior-600'
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

            {/* ── ACTION BUTTONS — Heartbeat & Pets ───────────────────── */}
            <ScrollReveal variant="popIn">
                <div className="mb-5 flex gap-3 relative z-10">
                    <div onClick={sendHeartbeat} className="flex-1">
                        <div
                            ref={heartbeatBtnRef}
                            className={`w-full h-full group relative text-white p-5 rounded-[1.5rem] spring-press flex items-center justify-center gap-3 overflow-hidden transition-all duration-300 ${receivedHeartbeat ? 'ring-2 ring-lior-300/60 animate-glow-pulse' : ''} ${isDissolving ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                            style={{
                                background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 42%, #e11d48 100%)',
                                border: '1px solid rgba(255,255,255,0.22)',
                                boxShadow: receivedHeartbeat
                                    ? 'inset 0 1px 0 rgba(255,255,255,0.26), 0 10px 28px rgba(244,63,94,0.36), 0 20px 44px rgba(225,29,72,0.18)'
                                    : 'inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 22px rgba(244,63,94,0.28), 0 16px 36px rgba(225,29,72,0.14)',
                            }}
                        >
                            <HeartbeatRipple active={showHeartbeat} />
                            <div className={`transition-transform duration-300 ${showHeartbeat ? 'scale-125 animate-wiggle-spring' : ''}`}>
                                <Heart fill="currentColor" size={22} />
                            </div>
                            <span className="font-bold text-sm tracking-wide">Heartbeat</span>
                        </div>
                    </div>
                    <div onClick={() => setShowPet(true)} className="w-[4.5rem]">
                        <div className="w-full h-full bento-card text-lior-500 p-5 flex items-center justify-center spring-press">
                            <PawPrint size={22} />
                        </div>
                    </div>
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
                            ? <Moon size={14} className="text-lior-200" fill="currentColor" />
                            : <Sun size={14} className="text-amber-400 animate-spin-slow" />
                        }
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-semibold leading-tight ${myStatus.state === 'sleeping' ? 'text-white' : 'text-gray-700'}`}>
                            You · {myStatus.state === 'sleeping' ? 'Asleep' : 'Awake'}
                        </span>
                        <span className={`text-[10px] mt-0.5 leading-tight ${myStatus.state === 'sleeping' ? 'text-lior-300/60' : 'text-gray-400'}`}>
                            tap to switch
                        </span>
                    </div>
                </div>
            </div>

            {/* ── COUNTDOWN CARD ───────────────────────────────────────── */}
            <ScrollReveal variant="slideFromRight">
                <TiltCard
                    data-coachmark="countdowns"
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
                    <div className="absolute bottom-0 left-0 w-28 h-28 bg-lior-400/8 rounded-full blur-2xl" />

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

            {/* ── PARTNER INSIGHT WHISPER ────────────────────────────── */}
            <InsightWhisper setView={setView} />

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
                            otdImage ? 'text-white h-48' : 'bg-gradient-to-br from-lior-500 to-amber-500 text-white p-6'
                        }`}
                        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    >
                        {otdImage && (
                            <>
                                <img
                                    src={otdImage}
                                    className="absolute inset-0 w-full h-full object-cover"
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
                                    {(() => {
                                        const years = getYear(new Date()) - getYear(new Date(onThisDayMemory.date));
                                        return (
                                            <h3 className="font-serif text-2xl font-bold mb-1 drop-shadow-md">
                                                {years} year{years !== 1 ? 's' : ''} ago today
                                            </h3>
                                        );
                                    })()}
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
                        <div data-coachmark="open-when" className="bento-card p-5 flex flex-col h-full relative overflow-hidden spring-press">
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
                        <div data-coachmark="bonsai" className="bento-card p-5 flex flex-col h-full relative overflow-hidden spring-press">
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

                {/* ── PREMIUM DRAWER ────────────────────────────────────── */}
                <motion.div variants={gridItemVariants} className="col-span-2 mt-3">
                    {/* Trigger row */}
                    <motion.button
                        onClick={() => setPremiumOpen(prev => !prev)}
                        className="w-full"
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                    >
                        <div
                            className="flex items-center justify-between px-4 py-3.5 rounded-2xl"
                            style={{
                                background: premiumOpen
                                    ? 'linear-gradient(135deg, #1c0d28 0%, #2e1447 100%)'
                                    : 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,248,235,0.9) 100%)',
                                border: premiumOpen
                                    ? '1px solid rgba(245,158,11,0.22)'
                                    : '1px solid rgba(245,158,11,0.18)',
                                boxShadow: premiumOpen
                                    ? '0 4px 16px rgba(0,0,0,0.2)'
                                    : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 8px rgba(245,158,11,0.06)',
                                transition: 'all 0.3s ease',
                            }}
                        >
                            <div className="flex items-center gap-2.5">
                                <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: premiumOpen
                                            ? 'rgba(245,158,11,0.15)'
                                            : 'rgba(245,158,11,0.08)',
                                        border: '1px solid rgba(245,158,11,0.2)',
                                    }}
                                >
                                    <Crown size={14} className="text-amber-400" fill="currentColor" />
                                </div>
                                <div className="text-left">
                                    <span className={`text-[12px] font-bold leading-none block ${premiumOpen ? 'text-amber-300' : 'text-gray-600'}`}>
                                        Premium features
                                    </span>
                                    <span className={`text-[10px] mt-0.5 block ${premiumOpen ? 'text-amber-400/50' : 'text-gray-400'}`}>
                                        {premiumOpen ? 'Tap any to open' : '6 exclusive experiences'}
                                    </span>
                                </div>
                            </div>
                            <motion.div
                                animate={{ rotate: premiumOpen ? 180 : 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                                className="opacity-40"
                            >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M4 6l4 4 4-4" stroke={premiumOpen ? '#f59e0b' : '#6b7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </motion.div>
                        </div>
                    </motion.button>

                    {/* Expanded cards */}
                    <AnimatePresence>
                        {premiumOpen && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.8 }}
                                style={{ overflow: 'hidden' }}
                            >
                                <motion.div
                                    className="grid grid-cols-2 gap-2.5 pt-3"
                                    initial="hidden"
                                    animate="visible"
                                    variants={{ visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}
                                >
                                    {/* Surprises */}
                                    <motion.div variants={gridItemVariants}>
                                        <motion.div whileTap={{ scale: 0.92, y: 2 }} transition={{ type: 'spring', stiffness: 600, damping: 26 }} onClick={() => setView('surprises')} className="w-full h-full cursor-pointer">
                                            <div className="bento-card p-4 flex flex-col items-center text-center h-full relative overflow-hidden spring-press">
                                                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-2.5" style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)' }}>
                                                    <Gift size={20} style={{ color: '#8b5cf6' }} />
                                                </div>
                                                <span className="font-semibold text-[13px] text-gray-800 leading-tight">Surprises</span>
                                                <span className="text-[10px] text-gray-400 mt-0.5 leading-snug">Plan moments</span>
                                            </div>
                                        </motion.div>
                                    </motion.div>

                                    {/* Time Capsule */}
                                    <motion.div variants={gridItemVariants}>
                                        <motion.div whileTap={{ scale: 0.92, y: 2 }} transition={{ type: 'spring', stiffness: 600, damping: 26 }} onClick={() => setView('time-capsule')} className="w-full h-full cursor-pointer">
                                            <div className="bento-card p-4 flex flex-col items-center text-center h-full relative overflow-hidden spring-press">
                                                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-2.5" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.18)' }}>
                                                    <Lock size={20} style={{ color: '#d97706' }} />
                                                </div>
                                                <span className="font-semibold text-[13px] text-gray-800 leading-tight">Capsule</span>
                                                <span className="text-[10px] text-gray-400 mt-0.5 leading-snug">Seal letters</span>
                                            </div>
                                        </motion.div>
                                    </motion.div>

                                    {/* Daily Video Moments — hero card */}
                                    <motion.div variants={gridItemVariants} className="col-span-2">
                                        <motion.div whileTap={{ scale: 0.97, y: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }} onClick={() => setView('daily-video')} className="w-full cursor-pointer">
                                            <div className="relative overflow-hidden p-5 rounded-[1.75rem] spring-press" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)', border: '1px solid rgba(168, 85, 247, 0.2)', boxShadow: '0 8px 32px rgba(168, 85, 247, 0.12)' }}>
                                                <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)' }} />
                                                <div className="relative z-10 flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.28)' }}>
                                                        <Video size={22} className="text-purple-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-[15px] text-white leading-tight">Daily Video Moments</h3>
                                                        <p className="text-[11px] text-purple-200/50 font-medium mt-0.5">10 seconds of your day, compiled monthly</p>
                                                    </div>
                                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 opacity-30">
                                                        <path d="M7.5 5l5 5-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </motion.div>

                                    {/* Weekly Recap */}
                                    <motion.div variants={gridItemVariants} className="col-span-2">
                                        <motion.div whileTap={{ scale: 0.97, y: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }} onClick={() => setView('weekly-recap')} className="w-full cursor-pointer">
                                            <div className="relative overflow-hidden p-5 rounded-[1.75rem] spring-press" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', border: '1px solid rgba(99, 102, 241, 0.2)', boxShadow: '0 8px 32px rgba(99, 102, 241, 0.12)' }}>
                                                <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full blur-3xl pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.18) 0%, transparent 70%)' }} />
                                                <div className="relative z-10 flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(129,140,248,0.18)', border: '1px solid rgba(129,140,248,0.28)' }}>
                                                        <Film size={22} className="text-indigo-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-[15px] text-white leading-tight">Weekly Story</h3>
                                                        <p className="text-[11px] text-indigo-200/50 mt-0.5">Your week, beautifully told</p>
                                                    </div>
                                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 opacity-30">
                                                        <path d="M7.5 5l5 5-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </motion.div>

                                    {/* Partner Intelligence */}
                                    <motion.div variants={gridItemVariants} className="col-span-2">
                                        <motion.div whileTap={{ scale: 0.97, y: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }} onClick={() => setView('partner-intelligence')} className="w-full cursor-pointer">
                                            <div className="bento-card p-5 flex items-center gap-4 relative overflow-hidden spring-press">
                                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                                    <Brain size={22} style={{ color: '#8b5cf6' }} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-semibold text-[15px] text-gray-800 block leading-tight">Love Tracker</span>
                                                    <span className="text-[11px] text-gray-400 mt-0.5">Understand & show love better</span>
                                                </div>
                                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 opacity-20">
                                                    <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </motion.div>
        </div>
    );
};

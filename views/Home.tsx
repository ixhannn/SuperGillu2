import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Heart, Sparkles, Mail, Moon, RefreshCw, Utensils, Calendar, X, Clock, Zap, Sun, Map, TreeDeciduous, Cloud, Mic, Crown, Lock, PawPrint, Headphones, ChevronRight } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { ViewState, UserStatus, CoupleProfile, Memory, Note, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { AmbientService } from '../services/ambient';
import { getYear, intervalToDuration } from 'date-fns';
import { TiltCard } from '../components/TiltCard';
import { HeartbeatParticles, HeartbeatParticlesHandle } from '../components/HeartbeatParticlesLazy';
import { Haptics } from '../services/haptics';
import { DailyQuestion } from '../components/DailyQuestion';
import { getHomeHeaderOverlayState } from '../utils/homeHeaderOverlay';
import { getHomeContainerStyle, getHomeHeaderOverlayHeight } from '../utils/homeLayoutMetrics';
import { calendarDayDifference, daysTogetherFrom, getNextAnnualOccurrence, parseStoredDateOnly } from '../shared/dateOnly.js';
import { buildRelationshipMilestones } from '../shared/countdowns.js';
import { springSmooth, springSnappy, prefersReducedMotion } from '../utils/motion';
import { toast } from '../utils/toast';
import { NotificationsService } from '../services/notifications';
import { useRelationship } from '../hooks/useRelationship';
import { useThrottledReload } from '../hooks/useThrottledReload';
import { useTileOpen } from '../hooks/useTileOpen';

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

const DAYS_TOGETHER_LEGACY_FONT_STYLE: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontVariantNumeric: 'tabular-nums',
    fontFeatureSettings: '"tnum" 1',
};

const DAYS_TOGETHER_LEGACY_UNIT_STYLE: React.CSSProperties = {
    ...DAYS_TOGETHER_LEGACY_FONT_STYLE,
    fontWeight: 400,
};

const parseAnniversaryDate = (value: string | undefined) => parseStoredDateOnly(value);

const getMemoryDateKey = (memory: Partial<Memory>): string | null => {
    if (typeof memory.date !== 'string') return null;
    const dateKey = memory.date.trim().split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
};

const isMemoryDateKey = (value: string | null): value is string => Boolean(value);

const SurpriseModal = ({ content, onClose }: { content: { type: 'memory' | 'note', item: Memory | Note }, onClose: () => void }) => {
    const { type, item } = content;
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        if (type === 'memory') {
            const mem = item as Memory;
            if (mem.image) setImageUrl(mem.image);
            else if (mem.imageId || mem.storagePath) {
                StorageService.getImage(mem.imageId || '', undefined, mem.storagePath).then(data => setImageUrl(data || null)).catch(() => setImageUrl(null));
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
                                    <img src={imageUrl} alt="Memory" loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
        // No-op when ambient music isn't playing — avoid burning a RAF every
        // frame for nothing. Cheap polling kicks the RAF on/off based on
        // AmbientService state. When music isn't playing the loop sleeps.
        let animationFrameId = 0;
        let pollId = 0;

        const tick = () => {
            if (!AmbientService.isPlaying || !rippleRef.current) {
                animationFrameId = 0;
                return;
            }
            const data = AmbientService.getFrequencyData();
            let bassSum = 0;
            for (let i = 0; i < 4; i++) bassSum += data[i] || 0;
            const scale = 1 + (bassSum / 4 / 255) * 0.4;
            rippleRef.current.style.transform = `scale(${scale})`;
            animationFrameId = requestAnimationFrame(tick);
        };

        const ensureRunning = () => {
            if (animationFrameId === 0 && AmbientService.isPlaying) {
                animationFrameId = requestAnimationFrame(tick);
            }
        };

        ensureRunning();
        // Re-check 4×/s — costs nothing vs. RAF, only kicks the loop when
        // ambient audio actually starts playing.
        pollId = window.setInterval(ensureRunning, 250);

        return () => {
            if (animationFrameId !== 0) cancelAnimationFrame(animationFrameId);
            window.clearInterval(pollId);
            if (rippleRef.current) rippleRef.current.style.transform = '';
        };
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

const gridItemVariants: Variants = {
    hidden: { opacity: 0, y: 32, scale: 0.92, rotateX: 4 },
    visible: {
        opacity: 1, y: 0, scale: 1, rotateX: 0,
        // Critically-damped silk spring (was stiffness 380/damping 22 → ~0.67
        // ratio = visible bounce). springSmooth settles without overshoot,
        // matching the route layer's no-bounce language.
        transition: springSmooth,
    }
};

const ScrollReveal = ({ children, variant = 'fadeUp', delay = 0, className = '' }: {
    children: React.ReactNode;
    variant?: keyof typeof scrollVariants;
    delay?: number;
    className?: string;
}) => (
    <div
        className={`home-reveal home-reveal-${variant} ${className}`.trim()}
        style={{ '--home-reveal-delay': `${Math.round(delay * 1000)}ms` } as React.CSSProperties}
    >
        {children}
    </div>
);

// Counting number animation hook
const useCountUp = (target: number, inView: boolean, duration = 1800) => {
    const [count, setCount] = useState(0);
    const countRef = useRef(0);

    useEffect(() => {
        if (!inView) return;

        if (target <= 0) {
            countRef.current = 0;
            setCount(0);
            return;
        }

        const start = countRef.current;
        const delta = target - start;
        if (delta === 0) return;

        let frameId = 0;
        let startTime: number | null = null;
        const animate = (time: number) => {
            if (startTime === null) startTime = time;
            const progress = Math.min((time - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const next = Math.round(start + delta * eased);
            countRef.current = next;
            setCount(next);
            if (progress < 1) frameId = requestAnimationFrame(animate);
        };
        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, [inView, target, duration]);

    return count;
};

// Memoized below as `Home` — setView is referentially stable, so tab
// switches and other App-level renders bail out of this whole tree.
const HomeView: React.FC<HomeProps> = ({ setView }) => {
    // Seed first paint from the warm in-memory cache so names + anniversary are
    // present in the FIRST rendered frame instead of flashing empty. The getter
    // returns blank defaults for a brand-new user (no phantom couple), and the
    // effect below still re-reads + subscribes for live updates.
    const [profile, setProfile] = useState<CoupleProfile>(() => StorageService.getCoupleProfile());
    // Authoritative "do I actually have a partner?" signal. Drives solo-mode UI
    // so an unlinked user never sees a phantom partner or a heartbeat-to-nobody.
    const { isLinked } = useRelationship();
    // Tile-open lift — the tapped card "picks itself up" while the route push
    // slides the next view in, so navigation feels like opening, not jumping.
    const open = useTileOpen();
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
    const [privateItemCount, setPrivateItemCount] = useState(0);
    const [showHeartbeat, setShowHeartbeat] = useState(false);
    const [receivedHeartbeat, setReceivedHeartbeat] = useState(false);
    const [isDissolving, setIsDissolving] = useState(false);
    const [isConnected, setIsConnected] = useState(SyncService.isConnected);
    const [isTogether, setIsTogether] = useState(false);

    const heroRef = useRef<HTMLDivElement>(null);
    const heartbeatBtnRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<HeartbeatParticlesHandle>(null);
    const headerOverlayRef = useRef<HTMLDivElement>(null);
    const scrollRafRef = useRef<number | null>(null);
    const headerScrollTopRef = useRef(0);
    const lastOverlayStateRef = useRef<string>('');
    const heroInView = useInView(heroRef, { once: true, margin: "-100px" });
    // Gate the day-count so it starts ticking only AFTER the hero card's
    // `lior-home-reveal` entrance has settled — counting mid-fade reads as
    // jitter. The reveal animation runs on the .home-reveal wrapper (heroRef's
    // parent); we listen for its `animationend`. Under reduced motion the
    // keyframe is `none`/instant so animationend may never fire — settle at
    // once in that case.
    const [heroSettled, setHeroSettled] = useState(false);
    useEffect(() => {
        if (heroSettled) return;
        if (prefersReducedMotion()) { setHeroSettled(true); return; }
        const wrapperEl = heroRef.current?.parentElement;
        if (!wrapperEl) { setHeroSettled(true); return; }
        const onEnd = (e: AnimationEvent) => {
            if (e.animationName === 'lior-home-reveal') setHeroSettled(true);
        };
        wrapperEl.addEventListener('animationend', onEnd);
        return () => wrapperEl.removeEventListener('animationend', onEnd);
    }, [heroSettled]);
    const displayCount = useCountUp(daysTogether, heroInView && heroSettled);

    const calculateStreak = (mems: Memory[]) => {
        if (mems.length === 0) return 0;
        const dates = [...new Set(mems.map(getMemoryDateKey).filter(isMemoryDateKey))].sort().reverse();
        if (dates.length === 0) return 0;
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
            let eventDate = parseStoredDateOnly(sd.date);
            if (!eventDate) return;
            if (sd.type === 'birthday' || sd.type === 'anniversary') {
                eventDate = getNextAnnualOccurrence(sd.date, now);
            }
            if (eventDate && calendarDayDifference(eventDate, now) >= 0) events.push({ title: sd.title, date: eventDate });
        });
        const anniv = getNextAnnualOccurrence(anniversaryDate, now);
        if (anniv) {
            events.push({ title: 'Our Anniversary', date: anniv });
        }
        // Derived milestones (100/500/1000 days, next monthsary) give a brand-new
        // couple something near and motivating to count down to before they've
        // added any of their own special dates.
        buildRelationshipMilestones(anniversaryDate, now).forEach((m) => {
            events.push({ title: m.title, date: m.nextDate });
        });
        events.sort((a, b) => a.date.getTime() - b.date.getTime());
        return events.length > 0 ? { title: events[0].title, days: calendarDayDifference(events[0].date, now) } : null;
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
        setDaysTogether(daysTogetherFrom(parsedAnniversary, now));
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
        setPrivateItemCount(StorageService.getPrivateSpaceItems().length);
        setStreak(calculateStreak(mems));
        setNextEvent(getNextEvent(sds, prof.anniversaryDate));
        const throwback = mems.find(m => {
            const d = new Date(m.date);
            return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() !== now.getFullYear();
        });
        if (throwback?.id !== onThisDayMemory?.id) setOnThisDayMemory(throwback || null);
    };

    // Coalesce storage-update bursts into one rAF-tick reload. Cloud reconcile
    // dispatches one 'storage-update' per pulled row across separate task
    // boundaries (React can't auto-batch those), so without this Home runs a
    // full loadData() — ~10 setStates — once per row. The throttle collapses
    // the burst into a single re-render on the next frame (visually identical).
    const reloadData = useThrottledReload(loadData);

    useEffect(() => {
        loadData();
        setIsConnected(SyncService.isConnected);
        storageEventTarget.addEventListener('storage-update', reloadData);
        const handleSyncUpdate = () => setIsConnected(SyncService.isConnected);
        syncEventTarget.addEventListener('sync-update', handleSyncUpdate);
        const handleSignal = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail) return;
            if (detail.signalType === 'HEARTBEAT') {
                triggerReceivedHeartbeat();
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification(StorageService.getCoupleProfile().partnerName, { body: '❤️ You received a heartbeat!', icon: '/notification-icon.png' });
                }
            } else if (detail.signalType === 'PET_NUDGE') {
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification(StorageService.getCoupleProfile().partnerName, { body: `${detail.payload?.partner || 'Your partner'} sent a nudge! 👉`, icon: '/notification-icon.png' });
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

        return () => {
            storageEventTarget.removeEventListener('storage-update', reloadData);
            syncEventTarget.removeEventListener('sync-update', handleSyncUpdate);
            syncEventTarget.removeEventListener('signal-received', handleSignal);
            syncEventTarget.removeEventListener('presence-update', handlePresence);
        };
    }, []);

    useEffect(() => {
        if (onThisDayMemory) {
            if (onThisDayMemory.image) setOtdImage(onThisDayMemory.image);
            else if (onThisDayMemory.imageId || onThisDayMemory.storagePath) StorageService.getImage(onThisDayMemory.imageId || '', undefined, onThisDayMemory.storagePath).then(img => setOtdImage(img || null)).catch(() => setOtdImage(null));
        } else setOtdImage(null);
    }, [onThisDayMemory]);

    // Drive the frequency-reactive ripple + heart wiggle off ambient playback —
    // the sole intended trigger. AmbientService has no event surface, so poll it
    // cheaply (4×/s). Without this, showHeartbeat could never become true and the
    // whole HeartbeatRipple/wiggle micro-interaction stayed inert.
    useEffect(() => {
        setShowHeartbeat(AmbientService.isPlaying);
        const id = window.setInterval(() => {
            // Skip the wake while the app is backgrounded (screen off / hidden) —
            // the ripple only matters when Home is actually on screen.
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            setShowHeartbeat(AmbientService.isPlaying);
        }, 250);
        return () => window.clearInterval(id);
    }, []);

    // Scroll-linked header opacity — write directly to the DOM (no React state)
    // so scrolling the page does NOT re-render the entire Home tree. The
    // overlay element keeps its initial markup; we just mutate inline style on
    // an `headerOverlayRef` element from the scroll listener. This eliminates
    // the main source of scroll jank on Home.
    useEffect(() => {
        const mainEl = document.querySelector('main');
        if (!mainEl) return;

        const applyOverlay = (y: number) => {
            const overlayEl = headerOverlayRef.current;
            if (!overlayEl) return;
            const next = getHomeHeaderOverlayState(y);
            // Cheap signature so we skip writes when nothing changed
            // (e.g. scrolling between 0–18 keeps overlay fully hidden).
            const sig = `${next.opacity.toFixed(3)}|${next.backdropFilter}`;
            if (lastOverlayStateRef.current === sig) return;
            lastOverlayStateRef.current = sig;

            const style = overlayEl.style;
            style.opacity = String(next.opacity);
            style.background = next.background;
            style.backdropFilter = next.backdropFilter;
            (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = next.webkitBackdropFilter;
            style.borderBottom = next.borderBottom;
            style.transitionDuration = `${next.transitionDurationMs}ms`;
        };

        function handleScroll() {
            if (scrollRafRef.current !== null) return;
            scrollRafRef.current = requestAnimationFrame(flushScroll);
        }

        function flushScroll() {
            scrollRafRef.current = null;
            const y = mainEl!.scrollTop || 0;
            if (headerScrollTopRef.current === y) return;
            headerScrollTopRef.current = y;
            applyOverlay(y);
        }

        mainEl.addEventListener('scroll', handleScroll, { passive: true });
        // Initial paint
        applyOverlay(mainEl.scrollTop || 0);

        return () => {
            if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
            mainEl.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const homeContainerStyle = getHomeContainerStyle();
    const homeHeaderOverlayHeight = getHomeHeaderOverlayHeight();
    // 140ms soft crossfade for the status-toggle icon (Sun↔Moon). Bespoke
    // CSS opacity transition, so honour reduced-motion explicitly: collapse to
    // an instant swap when the user prefers reduced motion.
    const statusIconTransition = prefersReducedMotion()
        ? 'none'
        : 'opacity var(--lior-motion-feedback) var(--lior-ease-soft)';

    const triggerReceivedHeartbeat = () => {
        setReceivedHeartbeat(true);
        if (heartbeatBtnRef.current) {
            const rect = heartbeatBtnRef.current.getBoundingClientRect();
            particlesRef.current?.triggerReceive(rect.left + rect.width / 2, rect.top + rect.height / 2);
        } else {
            particlesRef.current?.triggerReceive(window.innerWidth / 2, window.innerHeight / 2);
        }
        void Haptics.doubleBeat(); // partner's heartbeat arriving — a felt double lub-dub
        setTimeout(() => setReceivedHeartbeat(false), 2000);
    };

    const sendHeartbeat = () => {
        if (!heartbeatBtnRef.current || isDissolving) return;
        
        const rect = heartbeatBtnRef.current.getBoundingClientRect();
        setIsDissolving(true);
        void Haptics.heartbeat(); // your pulse leaving your hand toward them — one clean lub-dub
        
        particlesRef.current?.triggerButtonDissolve(rect, () => {
            setIsDissolving(false);
            SyncService.sendSignal('HEARTBEAT');
            // Push so the partner feels it even if their app is closed.
            void NotificationsService.triggerHeartbeatPush(getDisplayName(profile.myName, 'Your partner'));
        });
    };

    const toggleMyStatus = () => {
        const newState = myStatus.state === 'awake' ? 'sleeping' : 'awake';
        // Explicit product action (tapping the pill) → toggle haptics are
        // sanctioned here. Awake is the "on" state: awake→sleeping = toggleOff,
        // sleeping→awake = toggleOn.
        if (newState === 'awake') void Haptics.toggleOn();
        else void Haptics.toggleOff();
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
        } else toast.show('Add some memories or notes first! 💖', 'info');
    };

    return (
        <div className="px-4 relative parallax-container" style={homeContainerStyle}>
            {/* Scroll-linked floating header bar — style mutated by the scroll
                listener directly (no React state) so scrolling stays jank-free. */}
            <div
                ref={headerOverlayRef}
                className="fixed top-0 left-0 right-0 z-30 pointer-events-none transition-opacity ease-out"
                style={{
                    opacity: 0,
                    background: 'transparent',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0)',
                    transitionDuration: '0ms',
                    height: homeHeaderOverlayHeight,
                    // Pre-promote to compositor so toggling backdrop-filter
                    // mid-scroll never re-creates a paint layer.
                    transform: 'translateZ(0)',
                    willChange: 'opacity, background, backdrop-filter',
                    contain: 'layout paint style',
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
                    transition={springSmooth}
                >
                    <button
                        onClick={() => setView('profile')}
                        className={`group relative flex min-w-0 items-center transition-all duration-300 ${
                            isTogether
                                ? 'max-w-[calc(100vw-9.75rem)] gap-2.5 overflow-hidden rounded-[1.35rem] border px-2.5 py-2 pr-3 spring-press'
                                : 'max-w-[calc(100vw-9rem)] gap-3.5 p-0'
                        }`}
                        style={isTogether ? {
                            // Baked opaque (no backdrop-filter): on Home this pill sits over the
                            // animating ambient blob, where a live blur would re-resolve every
                            // frame on mobile. The gradient is bumped near-opaque so it reads the
                            // same without the frost. See the Home-route bake in root-fixes.css.
                            background: 'linear-gradient(145deg, rgba(255,221,197,0.95), rgba(235,205,184,0.92) 54%, rgba(214,234,197,0.90))',
                            borderColor: 'rgba(176,111,88,0.22)',
                            boxShadow: '0 8px 18px rgba(139,86,74,0.10), inset 0 1px 0 rgba(255,242,226,0.66)',
                        } : undefined}
                        aria-label={`${getDisplayName(profile.myName, 'You')} and ${getDisplayName(profile.partnerName, 'Partner')}${isTogether ? ', live together now' : ', open profile'}`}
                    >
                        <div className="relative flex-shrink-0">
                            <div
                                className={`overflow-hidden rounded-full bg-lior-50 transition-all duration-300 ${isTogether ? 'h-10 w-10' : 'h-12 w-12'}`}
                                style={{
                                    boxShadow: isTogether
                                        ? '0 4px 10px rgba(124,76,67,0.12), 0 0 0 2px rgba(255,237,218,0.52)'
                                        : '0 2px 8px rgba(251,207,232,0.1), 0 0 0 2px rgba(251,207,232,0.3)',
                                }}
                            >
                                {profile.photo
                                    ? <img src={profile.photo} className="w-full h-full object-cover" alt="Profile" />
                                    : <div className="w-full h-full flex items-center justify-center text-lior-400"><Heart fill="currentColor" size={20} /></div>
                                }
                            </div>
                            {isTogether && (
                                <span
                                    className="absolute -right-0.5 bottom-0 h-3 w-3 rounded-full border-2 border-[#f7d6bf] bg-emerald-500 animate-presence-dot"
                                />
                            )}
                        </div>
                        <div className="min-w-0 text-left">
                            <h1
                                className="font-serif truncate text-gray-800 leading-none"
                                style={{ fontSize: isTogether ? '1.22rem' : '1.625rem' }}
                            >
                                {isLinked ? (
                                    <>{getDisplayName(profile.myName, 'You')} <span className="text-lior-500">&</span> {getDisplayName(profile.partnerName, 'Partner')}</>
                                ) : (
                                    getDisplayName(profile.myName, 'You')
                                )}
                            </h1>
                            {isTogether ? (
                                <p className="mt-1 truncate text-[10px] font-extrabold leading-none tracking-[0.02em] text-[#386b4f]">
                                    Together now
                                </p>
                            ) : streak > 0 && (
                                <div className="inline-flex items-center gap-1 bg-amber-100/80 text-amber-600 px-2 py-0.5 rounded-full mt-1">
                                    <Zap size={10} fill="currentColor" />
                                    <span className="text-micro">{streak} Day Streak</span>
                                </div>
                            )}
                            {!isTogether && streak === 0 && (
                                <p className="text-micro mt-1 text-gray-400">
                                    Tap to edit profile
                                </p>
                            )}
                        </div>
                    </button>
                </motion.div>

                <motion.button
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...springSnappy, delay: 0.2 }}
                    onClick={() => setView('sync')}
                    className={`spring-press transition-all rounded-2xl px-3 py-2 min-w-[7.25rem] flex items-center justify-center gap-2 border ${
                        isConnected
                            ? 'bg-gradient-to-br from-sage-200/90 to-sage-100/85 text-sage-700 border-sage-300/70 shadow-[0_8px_20px_rgba(86,140,112,0.22)]'
                            : 'bg-white/92 text-lior-700 border-white/80 shadow-[0_8px_20px_rgba(236,72,153,0.16)]'
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

            {/* ── DAYS TOGETHER — Hero Card ────────────────────────────── */}
            <ScrollReveal variant="fadeScale">
                {/* NOTE: scroll-recede (a view()-timeline dim/sink on exit) was
                    REMOVED here. The hero is the TOP-most scroll element, so with
                    `animation-range: exit` it counts as already "exiting through the
                    top" at scrollTop 0 and gets stranded at the end-state
                    opacity: 0.45 — i.e. the Our Journey tile looks transparent at
                    rest. Exit-dim only works for elements that start below the fold.
                    (ref kept for the count-up IntersectionObserver.) */}
                <div ref={heroRef}>
                    <TiltCard
                        maxTilt={12}
                        glare
                        scale={1.01}
                        onClick={() => setShowDetailedDuration(!showDetailedDuration)}
                        className="relative overflow-hidden p-6 rounded-[1.75rem] mb-4 aurora-card border border-white/20 cursor-pointer"
                        style={{
                            background: 'linear-gradient(135deg, #ec4899 0%, #f9a8d4 35%, #ec4899 70%, #f472b6 100%)',
                            boxShadow: '0 10px 30px rgba(232,160,176,0.16)',
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
                                <div
                                    className={`w-full ${showDetailedDuration ? 'opacity-0 translate-y-4 absolute pointer-events-none' : ''}`}
                                    style={{ transition: 'opacity var(--lior-motion-morph) var(--lior-ease-silk), transform var(--lior-motion-morph) var(--lior-ease-silk)' }}
                                >
                                    <p className="text-white/50 text-micro uppercase tracking-widest mb-3">You've been together for</p>
                                    <div className="flex items-baseline gap-2.5 mb-3">
                                        <h2
                                            className="text-[5.5rem] tracking-tighter font-bold text-white leading-none drop-shadow-lg"
                                            // Reserve the FINAL digit width (tabular-nums → 1ch/digit) so the
                                            // count-up ramp doesn't widen the number and slide the "days" label
                                            // rightward as it crosses 10/100/1000. Settled width == reserved
                                            // width, so it's pixel-identical at rest.
                                            style={{ ...DAYS_TOGETHER_LEGACY_FONT_STYLE, minWidth: `${String(daysTogether).length}ch`, textAlign: 'left' }}
                                        >{displayCount}</h2>
                                        <span className="text-xl text-white/50 italic" style={DAYS_TOGETHER_LEGACY_UNIT_STYLE}>days</span>
                                    </div>
                                    <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5">
                                        <Sparkles size={11} fill="currentColor" /> Every day matters
                                    </p>
                                </div>
                                <div
                                    className={`w-full ${!showDetailedDuration ? 'opacity-0 -translate-y-4 absolute pointer-events-none' : ''}`}
                                    style={{ transition: 'opacity var(--lior-motion-morph) var(--lior-ease-silk), transform var(--lior-motion-morph) var(--lior-ease-silk)' }}
                                >
                                    <p className="text-white/50 text-micro uppercase tracking-widest mb-3">That is exactly</p>
                                    <h2 className="text-3xl font-bold mb-3 leading-tight text-white" style={DAYS_TOGETHER_LEGACY_FONT_STYLE}>{detailedDuration || `${daysTogether} days`}</h2>
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
            <ScrollReveal variant="popIn" delay={0.09}>
                <div className="mb-5 flex gap-3 relative z-10">
                    <div onClick={isLinked ? sendHeartbeat : () => setView('sync')} className="flex-1">
                        <div
                            ref={heartbeatBtnRef}
                            className={`w-full h-full group relative text-white p-5 rounded-[1.5rem] spring-press flex items-center justify-center gap-3 overflow-hidden transition-all duration-300 ${receivedHeartbeat ? 'ring-2 ring-lior-300/60 animate-glow-pulse' : ''} ${isDissolving ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                            style={{
                                background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 42%, #e11d48 100%)',
                                border: '1px solid rgba(255,255,255,0.22)',
                                boxShadow: receivedHeartbeat
                                    ? 'inset 0 1px 0 rgba(255,255,255,0.26), 0 5px 14px rgba(225,29,72,0.22)'
                                    : 'inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px rgba(225,29,72,0.16)',
                            }}
                        >
                            <HeartbeatRipple active={showHeartbeat && isLinked} />
                            <div className={`transition-transform duration-300 ${showHeartbeat && isLinked ? 'scale-125 animate-wiggle-spring' : ''}`}>
                                <Heart fill="currentColor" size={22} />
                            </div>
                            <span className="flex flex-col leading-tight">
                                {isLinked ? (
                                    <>
                                        <span className="text-[14px] font-extrabold tracking-wide">Send heartbeat</span>
                                        <span className="mt-0.5 text-[11px] font-semibold text-white/80">A soft pulse to them</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[14px] font-extrabold tracking-wide">Invite your partner</span>
                                        <span className="mt-0.5 text-[11px] font-semibold text-white/80">Link up to send heartbeats</span>
                                    </>
                                )}
                            </span>
                        </div>
                    </div>
                    <div onClick={(e) => open(e, () => setView('coco-pet'))} className="w-[4.5rem]">
                        <div className="w-full h-full bento-card text-lior-500 p-5 flex items-center justify-center spring-press">
                            <PawPrint size={22} />
                        </div>
                    </div>
                </div>
            </ScrollReveal>

            {/* ── STATUS PILLS ─────────────────────────────────────────── */}
            {/* Reveal order 3 (delay 150ms). These pills carry backdrop-filter,
                so the cold-open entrance must be TRANSFORM-ONLY — animating
                opacity on this ancestor would turn it into a backdrop root and
                flatten the frosted glass (same trap as .scroll-recede-flat).
                The framer entrance lives on this OUTER wrapper (transform only,
                no opacity key) so the inner .scroll-recede-flat node keeps sole
                ownership of its scroll-driven transform. MotionConfig
                reducedMotion="user" neuters this automatically. */}
            <motion.div
                initial={{ y: 12, scale: 0.985 }}
                animate={{ y: 0, scale: 1 }}
                transition={{ ...springSmooth, delay: 0.15 }}
                className="relative z-10"
            >
            <div className="flex gap-3 mb-5 scroll-recede-flat">
                {/* Partner status pill — ghost placeholder until someone joins */}
                {!isLinked && (
                <button
                    onClick={() => setView('sync')}
                    className="flex-1 flex items-center gap-2.5 px-4 py-4 text-left spring-press"
                    style={{
                        borderRadius: '100px',
                        // Baked opaque (no backdrop-filter): over the animating Home blob a live
                        // blur(20px) was the single most expensive surface on the page. Reducing
                        // its radius (as a concurrent change did) still re-resolves the blur every
                        // frame on mobile — only removing backdrop-filter breaks the coupling. The
                        // fill is bumped opaque so the ghost pill stays legible without the frost.
                        background: 'linear-gradient(180deg, rgba(255,250,251,0.92) 0%, rgba(255,247,249,0.86) 100%)',
                        border: '1.5px dashed rgba(225,29,72,0.28)',
                        boxShadow: '0 2px 10px rgba(232,160,176,0.06)',
                    }}
                    aria-label="Your partner hasn't joined yet — tap to invite"
                >
                    <div className="relative flex-shrink-0">
                        <Heart size={14} className="text-lior-300" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold leading-tight text-gray-500">
                            Partner · not linked yet
                        </span>
                        <span className="text-[10px] mt-0.5 leading-tight text-gray-400">
                            their status appears here
                        </span>
                    </div>
                </button>
                )}
                {isLinked && (
                <div
                    className="flex-1 flex items-center gap-2.5 px-4 py-4"
                    style={partnerStatus.state === 'sleeping' ? {
                        borderRadius: '100px',
                        background: 'linear-gradient(180deg, rgba(50,44,40,0.98) 0%, rgba(28,25,23,0.98) 100%)',
                        border: '1px solid rgba(80,70,60,0.40)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.12), 0 4px 12px rgba(0,0,0,0.18)',
                    } : {
                        borderRadius: '100px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.82) 100%)',
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
                )}
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
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.82) 100%)',
                        border: '1px solid rgba(255,255,255,0.95)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,1), inset 0 0 18px rgba(255,255,255,0.55), 0 2px 10px rgba(232,160,176,0.08)',
                    }}
                >
                    {/* Sun↔Moon crossfade — both icons stacked, opacity toggled
                        over 140ms soft so the status flip reads as a dissolve,
                        not a hard cut. */}
                    <div className="relative flex-shrink-0 h-[14px] w-[14px]">
                        <Sun
                            size={14}
                            className="absolute inset-0 text-amber-400 animate-spin-slow"
                            style={{ opacity: myStatus.state === 'sleeping' ? 0 : 1, transition: statusIconTransition }}
                            aria-hidden={myStatus.state === 'sleeping'}
                        />
                        <Moon
                            size={14}
                            className="absolute inset-0 text-lior-200"
                            fill="currentColor"
                            style={{ opacity: myStatus.state === 'sleeping' ? 1 : 0, transition: statusIconTransition }}
                            aria-hidden={myStatus.state !== 'sleeping'}
                        />
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
            </motion.div>

            {/* ── COUNTDOWN CARD ───────────────────────────────────────── */}
            <ScrollReveal variant="slideFromRight" delay={0.21}>
                <TiltCard
                    data-coachmark="countdowns"
                    maxTilt={14}
                    glare
                    onClick={(e) => open(e, () => setView('countdowns'))}
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

            {/* ── TODAY'S QUESTION — the daily two-person ritual ───────── */}
            <div className="mb-5 relative z-10">
                <DailyQuestion profile={profile} onUpdate={() => {}} />
            </div>

            {/* ── ON THIS DAY ──────────────────────────────────────────── */}
            {onThisDayMemory && (() => {
                // Reserve the tall image layout based on whether the memory HAS an
                // image source — not on the async-resolved URL — so the card never
                // jumps from a short auto-height card to a tall one when the bitmap
                // finishes loading. The warm gradient stays as the base layer until
                // the <img> resolves, so the reserved box is never an empty flash.
                const hasOtdImage = !!(onThisDayMemory.image || onThisDayMemory.imageId || onThisDayMemory.storagePath);
                return (
                <ScrollReveal variant="tiltUp">
                    <div
                        onClick={(e) => open(e, () => setView('timeline'))}
                        className={`rounded-[1.75rem] mb-5 relative z-10 spring-press cursor-pointer overflow-hidden ${
                            hasOtdImage ? 'text-white h-48' : 'bg-gradient-to-br from-lior-500 to-amber-500 text-white p-6'
                        }${hasOtdImage && !otdImage ? ' bg-gradient-to-br from-lior-500 to-amber-500' : ''}`}
                        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    >
                        {otdImage && (
                            <>
                                <img
                                    src={otdImage}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    alt="On this day"
                                    loading="lazy"
                                    decoding="async"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                            </>
                        )}
                        <div className={`relative z-10 h-full flex flex-col ${hasOtdImage ? 'justify-end p-6' : ''}`}>
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
                );
            })()}

            {/* ── STATUS & FEATURE BENTO GRID ──────────────────────────── */}
            {/* Reveal order 8 — base 450ms offset on the block so the grid
                doesn't race the sections above it; items then self-stagger
                internally (30/80/130/180/230/280ms, root-fixes.css). */}
            <ScrollReveal variant="fadeUp" delay={0.45}>
            <div
                className="grid grid-cols-2 gap-3 relative z-10 mb-16"
                data-home-reveal-grid="true"
            >
                {/* Open When — bento-card alignment */}
                <div className="home-reveal-item">
                    <div
                        onClick={(e) => open(e, () => setView('open-when'))}
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
                    </div>
                </div>

                {/* Dinner Decider — bento-card alignment */}
                <div className="home-reveal-item">
                    <div
                        onClick={(e) => open(e, () => setView('dinner-decider'))}
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
                    </div>
                </div>

                {/* Bonsai Bloom */}
                <div className="home-reveal-item col-span-2">
                    <div
                        onClick={(e) => open(e, () => setView('bonsai-bloom'))}
                        className="w-full h-full cursor-pointer"
                    >
                        <div data-coachmark="bonsai" className="bento-card p-5 flex flex-col h-full relative overflow-hidden spring-press">
                            <div className="mb-3">
                                <div className="p-2.5 rounded-xl inline-block bg-emerald-50 border border-emerald-100/50">
                                    <TreeDeciduous size={22} className="text-emerald-500" />
                                </div>
                            </div>
                            <span className="font-semibold text-sm text-gray-800">Bonsai</span>
                            <span className="text-xs text-gray-400 mt-1">Your tree, grown by your days together</span>
                        </div>
                    </div>
                </div>

                {/* Private Space */}
                <div className="home-reveal-item col-span-2 mt-3">
                    <div
                        onClick={(e) => open(e, () => setView('private-space'))}
                        className="w-full cursor-pointer"
                    >
                        <div
                            className="relative overflow-hidden rounded-[1.5rem] px-4 py-3.5 spring-press"
                            style={{
                                background: 'linear-gradient(145deg, rgba(255,255,255,0.78), rgba(246,242,248,0.70))',
                                boxShadow: '0 6px 16px rgba(90,82,102,0.06), inset 0 1px 0 rgba(255,255,255,0.92)',
                                border: '1px solid rgba(255,255,255,0.72)',
                            }}
                        >
                            <div className="relative flex items-center gap-3.5">
                                <div
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl animate-lock-breathe"
                                    style={{
                                        background: 'linear-gradient(145deg, #ffffff, #f3eef7)',
                                        boxShadow: '0 4px 10px rgba(90,82,102,0.08), inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(174,154,194,0.08)',
                                    }}
                                >
                                    <Lock size={17} strokeWidth={2.2} style={{ color: '#8e78a2' }} />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <p className="font-serif text-[1.02rem] font-semibold leading-tight" style={{ color: '#5a5266' }}>Private Space</p>
                                    <p className="mt-0.5 text-[0.72rem]" style={{ color: '#867b94' }}>
                                        {privateItemCount > 0 ? `${privateItemCount} sealed ${privateItemCount === 1 ? 'item' : 'items'}` : 'Just for the two of you'}
                                    </p>
                                </div>
                                <ChevronRight size={16} style={{ color: '#b8a4c8' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── LIOR GOLD ─────────────────────────────────────────── */}
                <div className="home-reveal-item col-span-2 mt-3">
                    <div
                        onClick={(e) => open(e, () => setView('premium'))}
                        className="w-full cursor-pointer"
                    >
                        <div
                            className="relative overflow-hidden rounded-[1.75rem] p-5 spring-press"
                            style={{
                                background: 'radial-gradient(130% 120% at 85% 0%, rgba(124,92,255,0.3) 0%, transparent 55%), linear-gradient(140deg, #17151f 0%, #0b0a10 60%, #15131c 100%)',
                                border: '1px solid rgba(255,92,124,0.28)',
                                boxShadow: '0 10px 36px rgba(20,8,24,0.26), inset 0 1px 0 rgba(253,238,201,0.08)',
                            }}
                        >
                            <div
                                className="absolute -top-12 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
                                style={{ background: 'radial-gradient(circle, rgba(255,92,124,0.2) 0%, transparent 70%)' }}
                            />
                            <div className="relative z-10 flex items-center gap-4">
                                <motion.div
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                                    style={{
                                        background: 'linear-gradient(140deg, #ff5c7c, #8b5cf6)',
                                        border: '1px solid rgba(255,92,124,0.4)',
                                        boxShadow: '0 8px 22px rgba(255,92,124,0.14), inset 0 1px 0 rgba(255,246,222,0.22)',
                                    }}
                                >
                                    <Crown size={21} strokeWidth={1.8} style={{ color: '#ffffff' }} />
                                </motion.div>
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-serif text-[1.05rem] font-semibold leading-tight" style={{ color: 'rgba(255,250,242,0.95)' }}>Lior Gold</h3>
                                        <span
                                            className="px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-[0.14em]"
                                            style={{ background: 'rgba(255,92,124,0.14)', border: '1px solid rgba(255,92,124,0.3)', color: '#ffb3c2' }}
                                        >
                                            Premium
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,246,230,0.45)' }}>
                                        Your film, date nights, duets & unlimited everything
                                    </p>
                                </div>
                                <ChevronRight size={16} style={{ color: 'rgba(255,92,124,0.55)' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </ScrollReveal>
        </div>
    );
};

export const Home = React.memo(HomeView);

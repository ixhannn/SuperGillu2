import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Heart, Sparkles, Mail, Moon, RefreshCw, Utensils, Gift, Calendar, X, Clock, ChevronRight, Zap, Award, Wind, Sun, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
        <div className="p-6 pt-12 flex flex-col min-h-full relative pb-32">
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
            <button onClick={() => setView('sync')} className={`absolute top-12 right-6 p-2 backdrop-blur-sm rounded-full transition-all animate-spring-down z-50 cursor-pointer spring-press ${isConnected ? 'bg-green-100/80 text-green-600 shadow-sm' : 'bg-white/50 text-gray-400 hover:bg-white'}`}>
                <RefreshCw size={20} />
            </button>

            {/* Header — Spring Down Entrance */}
            <header className="mb-6 relative z-10 animate-spring-down" onClick={() => setView('profile')}>
                <div className={`flex items-center gap-4 cursor-pointer group transition-all duration-700 ${isTogether ? 'bg-white/40 p-3 -m-3 rounded-[2rem] shadow-[0_0_30px_rgba(244,63,94,0.3)] border border-white/50 animate-glow-pulse' : ''}`}>
                    <div className={`w-16 h-16 rounded-full bg-tulika-100 border-2 border-white shadow-md overflow-hidden relative transition-all duration-700 group-hover:scale-105 ${isTogether ? 'ring-4 ring-tulika-300 ring-opacity-50 animate-breathe' : ''}`}>
                        {profile.photo ? <img src={profile.photo} className="w-full h-full object-cover" alt="Profile" /> : <div className="w-full h-full flex items-center justify-center text-tulika-300"><Heart fill="currentColor" size={24} /></div>}
                    </div>
                    <div>
                        <h1 className="font-serif text-2xl text-gray-800 font-bold leading-tight group-hover:text-tulika-600 transition-colors relative">
                            {profile.myName} <span className="text-tulika-500">&</span> {profile.partnerName}
                            {isTogether && <span className="absolute -right-6 -top-2 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>}
                        </h1>
                        {streak > 0 && <div className="inline-flex items-center gap-1 bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full mt-1 animate-breathe"><Zap size={12} fill="currentColor" /><span className="text-[10px] font-bold uppercase tracking-wider">{streak} Day Streak</span></div>}
                        {streak === 0 && <p className={`text-xs font-medium uppercase tracking-widest mt-1 transition-colors ${isTogether ? 'text-tulika-600 font-bold' : 'text-gray-400 group-hover:text-tulika-400'}`}>{isTogether ? 'Currently Together ❤️' : 'Tap to edit profile'}</p>}
                    </div>
                </div>
            </header>

            {/* Pet Section — Stagger 1 */}
            <div className="animate-spring-in stagger-1"><CouplePet memories={memories} notes={notes} status={myStatus} partnerName={profile.partnerName} /></div>

            {/* Days Together Card — Stagger 2 */}
            <HolographicCard
                drag
                dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                dragElastic={0.2}
                onClick={() => setShowDetailedDuration(!showDetailedDuration)}
                className="bg-white/70 backdrop-blur-md p-6 rounded-3xl shadow-sm border border-white mb-6 animate-spring-in stagger-2 spring-hover duration-500 group"
            >
                <div className="absolute -right-6 -top-6 text-tulika-50 opacity-50 group-hover:scale-110 transition-transform duration-700 animate-breathe"><Heart size={120} fill="currentColor" /></div>
                <div className="flex items-center justify-between mb-4 relative z-10"><span className="text-tulika-400 font-semibold tracking-wider text-xs uppercase flex items-center gap-1"><Clock size={12} /> Our Journey</span><Sparkles size={16} className="text-tulika-400 group-hover:rotate-180 transition-transform duration-700" /></div>
                <div className="relative min-h-[4rem] flex items-center z-10">
                    <div className={`transition-all duration-500 w-full ${showDetailedDuration ? 'opacity-0 translate-y-4 absolute pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                        <p className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wide">You've been together for</p>
                        <div className="flex items-baseline gap-2 mb-1">
                            <h2 className="text-5xl font-serif text-gray-800 tracking-tight animate-number-roll">{daysTogether}</h2>
                            <span className="text-xl text-gray-500 font-sans font-medium">days</span>
                        </div>
                        <p className="text-tulika-600 text-sm font-medium flex items-center gap-1 opacity-80">Every day matters. ✨</p>
                    </div>
                    <div className={`transition-all duration-500 w-full ${!showDetailedDuration ? 'opacity-0 -translate-y-4 absolute pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                        <p className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wide">That is exactly</p>
                        <h2 className="text-xl font-serif text-gray-800 font-bold mb-2 leading-snug">{detailedDuration || `${daysTogether} days`}</h2>
                        <p className="text-tulika-500 text-sm font-medium">and counting... ❤️</p>
                    </div>
                </div>
            </HolographicCard>

            {/* Countdown Card — Stagger 3 */}
            <HolographicCard
                drag
                dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                dragElastic={0.2}
                onClick={() => setView('countdowns')}
                className="bg-indigo-900 text-white p-5 rounded-3xl shadow-xl shadow-indigo-100 mb-6 group animate-spring-in stagger-3 spring-hover"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl group-hover:bg-indigo-400/30 transition-colors duration-500"></div>
                <div className="relative z-10 flex justify-between items-center">
                    <div className="flex flex-col"><div className="flex items-center gap-2 mb-2"><Map size={16} className="text-indigo-300" /><span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Downtown</span></div>{nextEvent ? (<><h3 className="font-serif text-xl font-bold mb-0.5">{nextEvent.title}</h3><p className="text-xs text-indigo-300 font-medium">Coming up in <span className="text-white font-bold">{nextEvent.days} days</span></p></>) : (<><h3 className="font-serif text-xl font-bold mb-0.5">Your Town is Empty</h3><p className="text-xs text-indigo-300 font-medium">Add some special dates!</p></>)}</div>
                    <div className="bg-white/10 p-3 rounded-full backdrop-blur-sm group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500"><Calendar size={24} className="text-indigo-200" /></div>
                </div>
            </HolographicCard>

            {/* On This Day — Stagger 4 */}
            {
                onThisDayMemory && (
                    <div onClick={() => setView('timeline')} className={`rounded-3xl shadow-lg mb-6 relative z-10 animate-spring-in stagger-4 spring-hover cursor-pointer overflow-hidden ${otdImage ? 'text-white h-48' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6'}`}>
                        {otdImage && (<><img src={otdImage} className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-1000 hover:scale-105" alt="On this day" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-0"></div></>)}
                        <div className={`relative z-10 h-full flex flex-col ${otdImage ? 'justify-end p-6' : ''}`}>
                            <div className="flex items-center gap-2 mb-2 opacity-90">
                                <Calendar size={16} className="text-yellow-300 animate-breathe" />
                                <span className="text-xs font-bold uppercase tracking-wider text-yellow-300">On This Day</span>
                            </div>
                            <h3 className="font-serif text-2xl font-bold mb-1 shadow-black drop-shadow-md">{getYear(new Date()) - getYear(new Date(onThisDayMemory.date))} year ago today ❤️</h3>
                            {onThisDayMemory.text && <p className={`text-sm line-clamp-2 italic ${otdImage ? 'text-gray-100' : 'text-indigo-100'}`}>"{onThisDayMemory.text}"</p>}
                        </div>
                    </div>
                )
            }

            {/* Action Buttons — Stagger 5 */}
            <div className="mb-6 flex gap-4 relative z-10 animate-spring-in stagger-5">
                <MagneticButton onClick={sendHeartbeat as any} strength={0.2} className="flex-1">
                    <div className="w-full h-full group relative bg-gradient-to-r from-tulika-400 to-tulika-500 text-white p-5 rounded-3xl shadow-lg shadow-tulika-200 spring-press transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden">
                        <HeartbeatRipple active={showHeartbeat} />
                        <div className={`transition-transform duration-300 ${showHeartbeat ? 'scale-125 animate-wiggle-spring' : 'group-hover:scale-110 group-hover:animate-wiggle'}`}><Heart fill="currentColor" size={24} /></div>
                        <span className="font-bold text-sm">Heartbeat</span>
                    </div>
                </MagneticButton>
                <MagneticButton onClick={handleSurprise as any} strength={0.4} className="w-20">
                    <div className="w-full h-full bg-white text-tulika-500 p-5 rounded-3xl shadow-md border border-white spring-press transition-all flex items-center justify-center group relative overflow-hidden">
                        <div className="absolute inset-0 bg-tulika-50 transform scale-0 group-hover:scale-100 transition-transform duration-300 rounded-3xl"></div>
                        <Gift size={24} className="relative z-10 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                </MagneticButton>
            </div>

            {/* Status & Feature Grid — Stagger 6+ */}
            <div className="grid grid-cols-2 gap-4 relative z-10 mb-20">
                <div className={`col-span-1 p-5 rounded-3xl flex flex-col justify-between shadow-sm border animate-spring-in stagger-6 spring-press magnetic-card ${partnerStatus.state === 'sleeping' ? 'bg-indigo-900/90 text-indigo-100 border-indigo-800' : 'bg-white text-gray-800 border-white'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Partner</span>
                        {partnerStatus.state === 'sleeping' ? <Moon size={16} className="text-yellow-300 animate-breathe" fill="currentColor" /> : <Sun size={16} className="text-orange-400 animate-spin-slow" />}
                    </div>
                    <div>
                        <p className="font-bold font-serif leading-tight">{profile.partnerName} is {partnerStatus.state === 'sleeping' ? 'Asleep' : 'Awake'}</p>
                        <p className="text-[10px] opacity-60 mt-1 leading-tight">{getStatusDisplay(partnerStatus)}</p>
                    </div>
                </div>

                <div onClick={toggleMyStatus} className={`col-span-1 p-5 rounded-3xl flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-md spring-press relative overflow-hidden group animate-spring-in stagger-7 magnetic-card ${myStatus.state === 'sleeping' ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-white text-tulika-600 border border-tulika-100'}`}>
                    <div className="flex items-center justify-between mb-2 relative z-10">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">You</span>
                        {myStatus.state === 'sleeping' ? <Moon size={16} fill="currentColor" /> : <Sun size={16} />}
                    </div>
                    <div className="relative z-10">
                        <p className="font-bold font-serif leading-tight">{myStatus.state === 'sleeping' ? 'I am Sleeping' : 'I am Awake'}</p>
                        <p className="text-[10px] opacity-60 mt-1 group-hover:underline">Tap to switch</p>
                    </div>
                    {myStatus.state === 'sleeping' && <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-xl -mr-4 -mt-4 animate-breathe"></div>}
                </div>

                <MagneticButton onClick={() => setView('open-when')} strength={0.15} className="w-full h-full">
                    <div className="bg-white text-tulika-600 p-6 rounded-3xl shadow-sm border border-tulika-100 flex flex-col items-center justify-center gap-3 spring-press transition-all animate-spring-in stagger-8 group magnetic-card h-full">
                        <div className="bg-tulika-50 p-3 rounded-full group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300"><Mail size={32} /></div>
                        <span className="font-semibold text-sm">Open When</span>
                    </div>
                </MagneticButton>

                <MagneticButton onClick={() => setView('dinner-decider')} strength={0.15} className="w-full h-full">
                    <div className="bg-white text-tulika-600 p-6 rounded-3xl shadow-sm border border-tulika-100 flex flex-col items-center justify-center gap-3 spring-press transition-all animate-spring-in stagger-9 group magnetic-card h-full">
                        <div className="bg-tulika-50 p-3 rounded-full group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300"><Utensils size={32} /></div>
                        <span className="font-semibold text-sm">Dinner?</span>
                    </div>
                </MagneticButton>

                <div onClick={() => setView('mood-calendar')} className="col-span-2 bg-gradient-to-br from-pink-400 to-orange-400 text-white p-5 rounded-3xl shadow-lg shadow-pink-200 spring-hover spring-press transition-all flex items-center justify-between cursor-pointer relative overflow-hidden group animate-spring-in stagger-10">
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300"><Calendar size={24} className="text-white" /></div>
                        <div>
                            <span className="block font-serif font-bold text-lg text-white drop-shadow-sm">Mood Board</span>
                            <span className="text-xs text-pink-100 font-medium drop-shadow-sm">Our daily colors & memories 🎨</span>
                        </div>
                    </div>
                    <div className="absolute right-0 top-0 w-24 h-24 bg-white/10 rounded-full blur-xl group-hover:bg-white/20 transition-colors animate-breathe"></div>
                </div>

                <div onClick={() => setView('quiet-mode')} className="col-span-2 bg-gradient-to-r from-indigo-900 to-slate-800 text-white p-5 rounded-3xl shadow-lg shadow-indigo-200 spring-hover spring-press transition-all flex items-center justify-between cursor-pointer relative overflow-hidden group animate-spring-in stagger-10">
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/10 p-2 rounded-full backdrop-blur-sm group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300"><Wind size={24} className="text-indigo-200" /></div>
                        <div>
                            <span className="block font-serif font-bold text-lg text-indigo-50">Quiet Mode</span>
                            <span className="text-xs text-indigo-300">Just memories, no distractions.</span>
                        </div>
                    </div>
                    <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-colors animate-breathe"></div>
                </div>
            </div>
        </div >
    );
};
import React, { useEffect, useState } from 'react';
import { Plus, Check, Trash2, X, MapPin, Gift, ChevronDown, ChevronUp, ChevronRight, Home, Brush, Moon, Send, Compass, Milestone, Sparkles, Heart } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion, animate } from 'framer-motion';
import { ViewState, UsBucketItem, UsWishlistItem, UsMilestone } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { StorageService, storageEventTarget } from '../services/storage';
import { toast } from '../utils/toast';

interface UsProps { setView: (view: ViewState) => void; }

const DEFAULT_MILESTONES: UsMilestone[] = [
    { id: 'first-date', title: 'First Date', date: '', emoji: '✨', description: 'Where it all began' },
    { id: 'first-trip', title: 'First Trip Together', date: '', emoji: '✈️', description: '' },
    { id: 'first-home', title: 'Moved In Together', date: '', emoji: '🏠', description: '' },
];

const MILESTONE_EMOJIS = ['✨','❤️','✈️','🏠','🎉','🌍','🎂','🌟','💍','🐾','🎵','🌸','🍽️','🎬','📸','🌅'];

const MS_GRADIENTS = [
    'linear-gradient(150deg,#fffdfc,#fff1f5)',
    'linear-gradient(150deg,#fffaf6,#ffeede)',
    'linear-gradient(150deg,#fffdfc,#ffe9ef)',
    'linear-gradient(150deg,#fffbf7,#fbe7da)',
    'linear-gradient(150deg,#fffcfd,#f7e4ec)',
    'linear-gradient(150deg,#fffdfc,#ffe4ea)',
];

type Tab = 'bucket' | 'wishlist' | 'milestones';

const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem > 0 ? `${years}y ${rem}mo ago` : `${years}y ago`;
};

// ── Warm "Keepsake" design system (page-local) ──────────────────────────────
const WARM = {
    ink: 'var(--color-text-primary)',
    inkSoft: 'var(--color-text-secondary)',
    rose: '#ec4899', roseSoft: '#f472b6', roseDeep: '#be3d72', navActive: '#c4687e',
    // frozen foil ring for the double-bezel shell — never animate its position
    foilRing: 'linear-gradient(150deg, rgba(244,114,182,0.30), rgba(232,160,176,0.10) 32%, rgba(255,255,255,0.85) 52%, rgba(232,160,176,0.10) 72%, rgba(244,114,182,0.30))',
    // the shadow system — soft + mauve-tinted, never black
    catch: 'inset 0 1px 0 rgba(255,255,255,0.95)',
    catchHero: 'inset 0 1.5px 0 rgba(255,255,255,1)',
    contact: '0 1px 2px rgba(178,120,140,0.10)',
    sm: '0 1px 2px rgba(178,120,140,0.08), 0 10px 24px -10px rgba(178,120,140,0.16)',
    md: '0 1px 2px rgba(178,120,140,0.10), 0 18px 40px -14px rgba(178,120,140,0.20)',
    lg: '0 2px 4px rgba(178,120,140,0.12), 0 30px 60px -18px rgba(192,96,121,0.24)',
} as const;

const RADIUS = { heroOuter: 30, heroCore: 25, cardOuter: 26, cardCore: 21, row: 20, chip: 17 } as const;

const SOFT_SPRING = { type: 'spring', stiffness: 280, damping: 32, mass: 0.9 } as const;
const PRESS_SPRING = { type: 'spring', stiffness: 560, damping: 30 } as const;
const RISE = { hidden: { opacity: 0, y: 22, scale: 0.985 }, visible: { opacity: 1, y: 0, scale: 1, transition: SOFT_SPRING } } as const;
const STAGGER = { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } } as const;

const GRAIN_URL = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Double-bezel surface: outer foil ring + concentric inner core (inner radius = outer − pad).
const Bezel: React.FC<{ radius?: number; pad?: number; coreBg?: string; shadow?: string; className?: string; style?: React.CSSProperties; coreStyle?: React.CSSProperties; children: React.ReactNode }> = ({ radius = RADIUS.cardOuter, pad = 5, coreBg = 'linear-gradient(150deg,#fffdfc,#fff4f7)', shadow = WARM.md, className, style, coreStyle, children }) => (
    <div className={className} style={{ borderRadius: radius, padding: pad, background: WARM.foilRing, boxShadow: `${shadow}, ${WARM.contact}`, ...style }}>
        <div style={{ borderRadius: radius - pad, background: coreBg, boxShadow: `${WARM.catch}, inset 0 -1px 0 rgba(196,104,126,0.05)`, position: 'relative', overflow: 'hidden', height: '100%', ...coreStyle }}>
            {children}
        </div>
    </div>
);

// Eyebrow pill — restores rhythm above each section.
const Eyebrow: React.FC<{ children: React.ReactNode; center?: boolean }> = ({ children, center }) => (
    <div className={`flex items-center gap-2 mb-3 ${center ? 'justify-center' : ''}`}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: '#ffe4ea', boxShadow: WARM.catch, border: '1px solid rgba(255,255,255,0.8)' }}>
            <span className="w-1 h-1 rounded-full" style={{ background: WARM.rose }} />
            <span className="font-bold uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.18em', color: WARM.navActive }}>{children}</span>
        </span>
        {!center && <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(196,104,126,0.16), transparent)' }} />}
    </div>
);

// Memoized below as `Us` — setView is referentially stable, so tab switches
// and other App-level renders bail out of this whole tree.
const UsView: React.FC<UsProps> = ({ setView }) => {
    const profile = StorageService.getCoupleProfile();
    const [activeTab, setActiveTab] = useState<Tab>('bucket');

    // Items hidden optimistically while their undo toast is open. The real
    // storage delete only happens in the toast's onExpire (deferred commit).
    const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
    const markPendingDelete = (id: string) => setPendingDeleteIds(prev => new Set([...prev, id]));
    const clearPendingDelete = (id: string) => setPendingDeleteIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
    });

    // Leaving the view commits any pending deferred delete right away.
    useEffect(() => () => toast.hide(), []);

    useEffect(() => {
        const onStorage = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail) return;
            if (['us_bucket_items', 'us_wishlist_items', 'us_milestones', 'init'].includes(detail.table)) {
                setBucketItems(StorageService.getUsBucketItems());
                setWishItems(StorageService.getUsWishlistItems());
                const syncedMilestones = StorageService.getUsMilestones();
                setMilestones(syncedMilestones.length ? syncedMilestones : DEFAULT_MILESTONES);
            }
        };
        storageEventTarget.addEventListener('storage-update', onStorage);
        return () => storageEventTarget.removeEventListener('storage-update', onStorage);
    }, []);

    // ── Bucket List ──────────────────────────────────────────────────────
    const [bucketItems, setBucketItems] = useState<UsBucketItem[]>(() => StorageService.getUsBucketItems());
    const [bucketInput, setBucketInput] = useState('');
    const [bucketFocused, setBucketFocused] = useState(false);
    const [showCompleted, setShowCompleted] = useState(false);
    const saveBucket = (items: UsBucketItem[]) => {
        const prev = bucketItems;
        setBucketItems(items);
        const prevIds = new Set(prev.map((i) => i.id));
        const nextIds = new Set(items.map((i) => i.id));
        for (const item of items) StorageService.saveUsBucketItem(item);
        for (const old of prev) if (!nextIds.has(old.id) && prevIds.has(old.id)) StorageService.deleteUsBucketItem(old.id);
    };
    const addBucketItem = () => { const t = bucketInput.trim(); if (!t) return; saveBucket([{ id: Date.now().toString(), text: t, addedBy: profile.myName }, ...bucketItems]); setBucketInput(''); };
    const toggleBucket = (id: string) => saveBucket(bucketItems.map(i => i.id === id ? { ...i, completedAt: i.completedAt ? undefined : new Date().toISOString() } : i));
    const deleteBucket = (id: string) => {
        const item = bucketItems.find(i => i.id === id);
        if (!item || pendingDeleteIds.has(id)) return;
        markPendingDelete(id);
        toast.showUndo(`Deleted "${item.text}"`, {
            onUndo: () => clearPendingDelete(id),
            onExpire: () => {
                try {
                    StorageService.deleteUsBucketItem(id);
                    clearPendingDelete(id);
                    setBucketItems(StorageService.getUsBucketItems());
                } catch {
                    clearPendingDelete(id);
                    toast.show("Couldn't delete — it's back", 'error');
                }
            },
        });
    };
    const visibleBucket = bucketItems.filter(i => !pendingDeleteIds.has(i.id));
    const pending = visibleBucket.filter(i => !i.completedAt);
    const completed = visibleBucket.filter(i => i.completedAt);
    const pct = visibleBucket.length > 0 ? Math.round((completed.length / visibleBucket.length) * 100) : 0;

    // ── Wishlist ─────────────────────────────────────────────────────────
    const [wishItems, setWishItems] = useState<UsWishlistItem[]>(() => StorageService.getUsWishlistItems());
    const [wishTab, setWishTab] = useState<'me' | 'partner'>('me');
    const [myWishInput, setMyWishInput] = useState('');
    const [partnerWishInput, setPartnerWishInput] = useState('');
    const saveWish = (items: UsWishlistItem[]) => {
        const prev = wishItems;
        setWishItems(items);
        const nextIds = new Set(items.map((i) => i.id));
        for (const item of items) StorageService.saveUsWishlistItem(item);
        for (const old of prev) if (!nextIds.has(old.id)) StorageService.deleteUsWishlistItem(old.id);
    };
    const addWish = (owner: 'me' | 'partner', text: string) => {
        if (!text.trim()) return;
        const ownerName = owner === 'me' ? profile.myName : profile.partnerName;
        saveWish([...wishItems, { id: Date.now().toString(), text: text.trim(), ownerName }]);
    };
    const toggleGifted = (id: string) => saveWish(wishItems.map(i => i.id === id ? { ...i, gifted: !i.gifted } : i));
    const deleteWish = (id: string) => {
        const item = wishItems.find(i => i.id === id);
        if (!item || pendingDeleteIds.has(id)) return;
        markPendingDelete(id);
        toast.showUndo(`Deleted "${item.text}"`, {
            onUndo: () => clearPendingDelete(id),
            onExpire: () => {
                try {
                    StorageService.deleteUsWishlistItem(id);
                    clearPendingDelete(id);
                    setWishItems(StorageService.getUsWishlistItems());
                } catch {
                    clearPendingDelete(id);
                    toast.show("Couldn't delete — it's back", 'error');
                }
            },
        });
    };
    const visibleWishes = wishItems.filter(i => !pendingDeleteIds.has(i.id));
    const myWishes = visibleWishes.filter(i => i.ownerName === profile.myName);
    const partnerWishes = visibleWishes.filter(i => i.ownerName === profile.partnerName);

    // ── Milestones ───────────────────────────────────────────────────────
    const [milestones, setMilestones] = useState<UsMilestone[]>(() => {
        const synced = StorageService.getUsMilestones();
        return synced.length ? synced : DEFAULT_MILESTONES;
    });
    const [showMsForm, setShowMsForm] = useState(false);
    const [msTitle, setMsTitle] = useState('');
    const [msDate, setMsDate] = useState('');
    const [msEmoji, setMsEmoji] = useState('✨');
    const [msDesc, setMsDesc] = useState('');
    const saveMilestones = (items: UsMilestone[]) => {
        const prev = milestones;
        setMilestones(items);
        const nextIds = new Set(items.map((i) => i.id));
        for (const item of items) StorageService.saveUsMilestone(item);
        for (const old of prev) if (!nextIds.has(old.id)) StorageService.deleteUsMilestone(old.id);
    };
    const addMilestone = () => {
        if (!msTitle.trim() || !msDate) return;
        const updated = [...milestones, { id: Date.now().toString(), title: msTitle.trim(), date: msDate, emoji: msEmoji, description: msDesc.trim() }]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        saveMilestones(updated);
        setShowMsForm(false); setMsTitle(''); setMsDate(''); setMsEmoji('✨'); setMsDesc('');
    };
    const deleteMilestone = (id: string) => {
        const item = milestones.find(m => m.id === id);
        if (!item || pendingDeleteIds.has(id)) return;
        markPendingDelete(id);
        toast.showUndo(`Deleted "${item.title}"`, {
            onUndo: () => clearPendingDelete(id),
            onExpire: () => {
                try {
                    StorageService.deleteUsMilestone(id);
                    clearPendingDelete(id);
                    const synced = StorageService.getUsMilestones();
                    setMilestones(synced.length ? synced : DEFAULT_MILESTONES);
                } catch {
                    clearPendingDelete(id);
                    toast.show("Couldn't delete — it's back", 'error');
                }
            },
        });
    };
    const datedMilestones = milestones.filter(m => m.date && !pendingDeleteIds.has(m.id));

    const reduce = useReducedMotion();

    // Signature "Day N together" masthead — presentation only, derived from the
    // earliest dated milestone (first date). Falls back to names when unset.
    const anchorDate = (() => {
        const anniv = profile.anniversaryDate || undefined;
        const fd = milestones.find(m => m.id === 'first-date' && m.date)?.date;
        const earliest = datedMilestones.length ? datedMilestones.map(m => m.date).sort()[0] : undefined;
        return anniv || fd || earliest || null;
    })();
    const rawDayCount = anchorDate ? Math.floor((Date.now() - new Date(anchorDate).getTime()) / 86400000) : null;
    // Require >= 1 so a default "today" anniversary never renders "Day 0" — fall back to names instead.
    const dayCount = (rawDayCount != null && Number.isFinite(rawDayCount) && rawDayCount >= 1) ? rawDayCount : null;
    const [dayDisplay, setDayDisplay] = useState(0);
    useEffect(() => {
        if (dayCount == null) return;
        if (reduce) { setDayDisplay(dayCount); return; }
        const controls = animate(0, dayCount, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setDayDisplay(Math.round(v)) });
        return () => controls.stop();
    }, [dayCount, reduce]);

    const TABS = [
        { id: 'bucket' as Tab, Icon: Compass, label: 'Bucket List', count: pending.length },
        { id: 'wishlist' as Tab, Icon: Gift, label: 'Wishlist', count: visibleWishes.length },
        { id: 'milestones' as Tab, Icon: Milestone, label: 'Milestones', count: datedMilestones.length },
    ];

    const inputCls = "w-full rounded-2xl px-4 py-3 text-[16px] text-[#2d1f25] placeholder-[#c9b3ba] outline-none bg-[#fffaf8] border border-[rgba(196,104,126,0.18)] focus:border-[rgba(236,72,153,0.4)] transition-colors";

    return (
        <div className="us-view min-h-screen pb-32 relative">
            <ViewHeader title="Us" subtitle="our world together" onBack={() => setView('home')} tone="romance" />

            {/* Paper grain — covers the page behind content for tactile warmth */}
            <div aria-hidden className="absolute inset-0 pointer-events-none z-0" style={{ opacity: 0.04, mixBlendMode: 'multiply', backgroundImage: GRAIN_URL }} />

            {/* ── Masthead — the "Day N together" signature moment ─────────── */}
            <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SOFT_SPRING}
                className="relative z-[1] px-5 pt-1 pb-1 text-center"
            >
                <Eyebrow center>{dayCount != null ? 'Together since' : 'Our world'}</Eyebrow>
                {dayCount != null ? (
                    <>
                        <p className="font-serif" style={{ fontSize: 'clamp(3rem, 14vw, 3.8rem)', fontWeight: 500, lineHeight: 0.9, letterSpacing: '-0.02em', color: WARM.ink }}>
                            {dayDisplay.toLocaleString()}
                        </p>
                        <p className="mt-1" style={{ fontSize: '0.8rem', letterSpacing: '0.04em', color: WARM.inkSoft }}>days together</p>
                    </>
                ) : (
                    <p className="font-serif" style={{ fontSize: '2.4rem', fontWeight: 500, lineHeight: 1, letterSpacing: '-0.01em', color: WARM.ink }}>
                        {profile.myName || 'You'} <span style={{ color: WARM.rose }}>&amp;</span> {profile.partnerName || 'them'}
                    </p>
                )}
                <div className="flex items-center justify-center gap-3 mt-3">
                    <span className="h-px w-16" style={{ background: 'linear-gradient(90deg, transparent, rgba(196,104,126,0.28))' }} />
                    <span className="relative inline-flex items-center justify-center" style={{ width: 26, height: 26 }}>
                        {!reduce && (
                            <motion.span aria-hidden className="absolute rounded-full" style={{ width: 26, height: 26, background: 'radial-gradient(circle, rgba(244,114,182,0.45), transparent 70%)' }}
                                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.85, 0.5] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
                        )}
                        <span className="relative flex items-center justify-center rounded-full" style={{ width: 14, height: 14, background: 'radial-gradient(circle at 30% 30%, #fff, #c06079)', boxShadow: '0 6px 14px rgba(192,96,121,0.22), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
                            <Heart size={8} strokeWidth={0} className="text-white" fill="currentColor" />
                        </span>
                    </span>
                    <span className="h-px w-16" style={{ background: 'linear-gradient(90deg, rgba(196,104,126,0.28), transparent)' }} />
                </div>
                <p className="font-serif mt-3" style={{ fontSize: '1rem', fontWeight: 500, color: WARM.inkSoft }}>your world, in one place.</p>
            </motion.div>

            {/* ── Shared Spaces ────────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SOFT_SPRING, delay: 0.06 }}
                className="relative z-[1] px-5 mb-9 mt-7"
            >
                <Eyebrow>Shared spaces</Eyebrow>
                <h3 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', color: WARM.ink, lineHeight: 1.05 }}>where we meet</h3>
                <p className="mb-4 mt-1" style={{ fontSize: '0.8rem', color: WARM.inkSoft }}>the rooms only the two of you share.</p>

                {/* Hero — Our Room */}
                <motion.button whileTap={{ scale: 0.985 }} transition={PRESS_SPRING} onClick={() => setView('our-room')} className="block w-full text-left">
                    <Bezel radius={RADIUS.heroOuter} pad={5} shadow={WARM.lg}
                        coreBg="radial-gradient(120% 90% at 14% -10%, #fffdfc 0%, #fff6f4 46%, #ffeaf0 100%)"
                        coreStyle={{ boxShadow: `${WARM.catchHero}, inset 0 -1px 0 rgba(196,104,126,0.05)` }}>
                        <div className="relative flex items-center gap-4" style={{ padding: '1.25rem', minHeight: '8.5rem' }}>
                            <Home aria-hidden size={150} strokeWidth={1} className="absolute pointer-events-none" style={{ right: -14, bottom: -22, color: '#c4687e', opacity: 0.06, transform: 'rotate(-10deg)' }} />
                            <span className="relative flex items-center justify-center flex-shrink-0" style={{ width: '3.5rem', height: '3.5rem' }}>
                                {!reduce && (
                                    <motion.span aria-hidden className="absolute rounded-full" style={{ width: '4.4rem', height: '4.4rem', background: 'radial-gradient(circle, rgba(236,72,153,0.20), transparent 70%)' }}
                                        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
                                )}
                                <span className="relative flex items-center justify-center" style={{ width: '3.5rem', height: '3.5rem', borderRadius: RADIUS.chip + 2, background: 'linear-gradient(140deg,#f472b6,#ec4899)', boxShadow: '0 10px 22px rgba(236,72,153,0.32), inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                                    <Home size={24} strokeWidth={1.7} className="text-white" />
                                </span>
                            </span>
                            <div className="flex-1 relative">
                                <p className="font-bold uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.16em', color: WARM.navActive }}>Your shared space</p>
                                <p className="font-serif mt-1" style={{ fontSize: '1.32rem', fontWeight: 700, lineHeight: 1.04, color: WARM.ink }}>Our Room</p>
                                <p className="mt-0.5" style={{ fontSize: '0.8rem', color: WARM.inkSoft }}>step inside the space you've made.</p>
                            </div>
                            <motion.span className="relative flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.85)', boxShadow: '0 4px 12px rgba(232,160,176,0.18), inset 0 1px 0 rgba(255,255,255,1)' }} whileTap={{ x: 2 }}>
                                <ChevronRight size={18} strokeWidth={1.7} style={{ color: '#ec4899' }} />
                            </motion.span>
                        </div>
                    </Bezel>
                </motion.button>

                {/* Pair — the two ambient spaces */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                    {([
                        { Icon: Brush, label: 'Draw Together', sub: 'Shared canvas',    eyebrow: 'Create',  view: 'canvas' as const,     from: '#fffaf8', to: '#fdeee7', badge: 'rgba(224,103,63,0.13)', ring: 'rgba(224,103,63,0.26)', accent: '#e0673f', glow: 'rgba(224,103,63,0.18)' },
                        { Icon: Moon,  label: 'Quiet Mode',    sub: 'Ambient memories', eyebrow: 'Breathe', view: 'quiet-mode' as const, from: '#fdfaff', to: '#f1ecfb', badge: 'rgba(122,104,201,0.14)', ring: 'rgba(122,104,201,0.26)', accent: '#7a68c9', glow: 'rgba(122,104,201,0.16)' },
                    ]).map((item, i) => (
                        <motion.button
                            key={item.label}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...SOFT_SPRING, delay: 0.12 + i * 0.06 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setView(item.view)}
                            className="block text-left"
                        >
                            <Bezel radius={RADIUS.cardOuter} pad={4} shadow={WARM.sm} coreBg={`linear-gradient(150deg, ${item.from}, ${item.to})`}>
                                <div className="relative flex flex-col items-start gap-3" style={{ padding: '1rem', minHeight: '7.2rem' }}>
                                    <item.Icon aria-hidden size={110} strokeWidth={1} className="absolute pointer-events-none" style={{ right: -16, bottom: -18, color: item.accent, opacity: 0.07, transform: 'rotate(-10deg)' }} />
                                    <span className="relative flex items-center justify-center rounded-full" style={{ width: 40, height: 40, background: item.badge, border: `1px solid ${item.ring}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 10px ${item.glow}` }}>
                                        <item.Icon size={18} strokeWidth={1.7} style={{ color: item.accent }} />
                                    </span>
                                    <div className="relative">
                                        <p className="font-bold uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color: item.accent, opacity: 0.85 }}>{item.eyebrow}</p>
                                        <p className="font-serif mt-1" style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.05, color: WARM.ink }}>{item.label}</p>
                                        <p className="mt-0.5" style={{ fontSize: '0.73rem', color: WARM.inkSoft }}>{item.sub}</p>
                                    </div>
                                </div>
                            </Bezel>
                        </motion.button>
                    ))}
                </div>
            </motion.div>

            {/* ── Pulse — a quiet signal ──────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SOFT_SPRING, delay: 0.12 }}
                className="relative z-[1] px-5 mb-9"
            >
                <Eyebrow>A quiet signal</Eyebrow>
                <motion.button
                    data-coachmark="aura-signal"
                    whileTap={{ scale: 0.985 }}
                    transition={PRESS_SPRING}
                    onClick={() => setView('aura-signal')}
                    className="block w-full text-left"
                >
                    {/* shell — lighter shadow than the hero so the hero stays king */}
                    <div style={{ borderRadius: RADIUS.cardOuter, padding: 5, background: 'linear-gradient(150deg, rgba(190,61,114,0.45), rgba(244,114,182,0.28) 50%, rgba(190,61,114,0.45))', boxShadow: '0 2px 4px rgba(190,61,114,0.16), 0 22px 44px -16px rgba(236,72,153,0.30)' }}>
                        <div className="relative flex items-center gap-3.5" style={{ borderRadius: RADIUS.cardCore, overflow: 'hidden', padding: '1rem', background: 'linear-gradient(135deg,#f9a8d4 0%,#ec4899 52%,#be3d72 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(120,20,55,0.16)' }}>
                            {!reduce && (
                                <motion.span aria-hidden className="absolute top-0 bottom-0 pointer-events-none" style={{ width: '40%', background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.24), transparent)', transform: 'skewX(-18deg)' }}
                                    animate={{ x: ['-60%', '320%'] }} transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 6.5, ease: [0.16, 1, 0.3, 1] }} />
                            )}
                            <span className="relative flex items-center justify-center flex-shrink-0" style={{ width: 52, height: 52 }}>
                                {!reduce && (
                                    <motion.span aria-hidden className="absolute rounded-full pointer-events-none" style={{ width: 52, height: 52, border: '1.5px solid rgba(255,255,255,0.5)' }}
                                        animate={{ scale: [1, 1.7], opacity: [0.5, 0] }} transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeOut' }} />
                                )}
                                <span className="relative flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: 'linear-gradient(135deg,#f9b8c4,#ec4899)', boxShadow: '0 10px 24px rgba(236,72,153,0.28), inset 0 1px 0 rgba(255,255,255,0.4)' }}>
                                    <Sparkles size={20} strokeWidth={1.7} className="text-white" />
                                </span>
                            </span>
                            <div className="flex-1 relative">
                                <p className="font-serif text-white" style={{ fontSize: '1.12rem', fontWeight: 700, lineHeight: 1 }}>send a feeling</p>
                                <p className="mt-1" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)' }}>across the distance, wordlessly.</p>
                            </div>
                            <span className="relative flex items-center gap-2 flex-shrink-0" style={{ minHeight: 44, padding: '0 6px 0 14px', borderRadius: 999, background: 'rgba(255,255,255,0.96)' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#be3d72' }}>send</span>
                                <span className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: 'rgba(190,61,114,0.10)' }}>
                                    <Send size={15} strokeWidth={1.7} style={{ color: '#be3d72' }} />
                                </span>
                            </span>
                        </div>
                    </div>
                </motion.button>
            </motion.div>

            {/* ── Tabs — sliding ink pill segmented control ───────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SOFT_SPRING, delay: 0.18 }}
                className="relative z-[1] px-5 mb-7"
            >
                <Eyebrow>Our story</Eyebrow>
                <h3 className="font-serif mb-4" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', color: WARM.ink, lineHeight: 1.05 }}>keep, wish, remember</h3>
                <div className="flex" style={{ borderRadius: 20, padding: 5, background: 'linear-gradient(150deg,#f1d8e0,#ead0d9)', boxShadow: 'inset 0 2px 6px rgba(178,120,140,0.22), inset 0 -1px 0 rgba(255,255,255,0.6)' }}>
                    {TABS.map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className="flex-1 relative flex items-center justify-center gap-1.5 spring-press"
                                style={{ borderRadius: RADIUS.chip, paddingTop: '0.62rem', paddingBottom: '0.62rem' }}>
                                {active && (
                                    <motion.span layoutId="us-tab-pill" className="absolute inset-0" style={{ borderRadius: RADIUS.chip, background: 'linear-gradient(135deg,#f472b6,#ec4899)', boxShadow: '0 6px 14px rgba(236,72,153,0.28), inset 0 1px 0 rgba(255,255,255,0.4)' }}
                                        transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                                )}
                                <tab.Icon size={15} strokeWidth={1.8} className="relative z-[1]" style={{ color: active ? '#ffffff' : WARM.inkSoft }} />
                                <span className="relative z-[1]" style={{ fontSize: '0.74rem', fontWeight: 700, color: active ? '#ffffff' : WARM.inkSoft }}>{tab.label}</span>
                                {tab.count > 0 && !active && (
                                    <span className="absolute -top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[0.5rem] font-bold flex items-center justify-center z-[2]"
                                        style={{ background: '#ffe4ea', color: '#c4687e', boxShadow: WARM.catch }}>
                                        {tab.count > 9 ? '9+' : tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </motion.div>

            <AnimatePresence mode="wait">

                {/* ══ BUCKET LIST ══════════════════════════════════════════ */}
                {activeTab === 'bucket' && (
                    <motion.div key="bucket" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 7 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="px-5">

                        {/* Progress */}
                        {visibleBucket.length > 0 && (
                            <div className="mb-5">
                                <div className="flex justify-between mb-2">
                                    <p style={{ fontSize: '0.72rem', color: WARM.inkSoft }}>{completed.length} of {visibleBucket.length} done</p>
                                    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: WARM.navActive }}>{pct}%</p>
                                </div>
                                <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(196,104,126,0.16)', boxShadow: 'inset 0 1px 2px rgba(178,120,140,0.18)' }}>
                                    <motion.div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#ec4899 0%,#f472b6 60%,#f9b8c4 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}
                                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
                                </div>
                            </div>
                        )}

                        {/* Add input */}
                        <div className="flex gap-2.5 items-center mb-5 transition-all duration-200"
                            style={{
                                borderRadius: RADIUS.row, padding: '0.9rem 1rem', background: '#fffaf8',
                                border: bucketFocused ? '1px solid rgba(236,72,153,0.4)' : '1px solid rgba(196,104,126,0.18)',
                                boxShadow: bucketFocused ? `0 0 0 2px rgba(236,72,153,0.18), ${WARM.sm}, ${WARM.catch}` : `${WARM.sm}, ${WARM.catch}`,
                            }}>
                            <MapPin size={16} strokeWidth={1.7} style={{ color: bucketFocused ? '#ec4899' : '#d8b3c0' }} className="flex-shrink-0 transition-colors duration-200" />
                            <input value={bucketInput} onChange={e => setBucketInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addBucketItem(); }}
                                onFocus={() => setBucketFocused(true)}
                                onBlur={() => setBucketFocused(false)}
                                placeholder="An adventure to add…"
                                inputMode="text"
                                enterKeyHint="done"
                                autoCapitalize="sentences"
                                autoCorrect="on"
                                className="flex-1 bg-transparent outline-none" style={{ fontSize: 16, color: WARM.ink }} />
                            <button onClick={addBucketItem}
                                className="flex items-center justify-center flex-shrink-0 spring-press"
                                style={{ width: 32, height: 32, borderRadius: RADIUS.chip, background: 'linear-gradient(135deg,#f472b6,#ec4899)', boxShadow: '0 4px 10px rgba(236,72,153,0.3), inset 0 1px 0 rgba(255,255,255,0.4)' }}>
                                <Plus size={16} className="text-white" strokeWidth={1.8} />
                            </button>
                        </div>

                        {/* Empty */}
                        {visibleBucket.length === 0 && (
                            <div className="text-center py-16">
                                <div className="mx-auto mb-4 flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: 22, background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.18)' }}>
                                    <Compass size={28} strokeWidth={1.7} style={{ color: '#ec4899' }} />
                                </div>
                                <p className="font-serif text-xl mb-1" style={{ color: WARM.ink }}>The world is yours</p>
                                <p style={{ fontSize: '0.78rem', color: WARM.inkSoft }}>Add adventures to share together</p>
                            </div>
                        )}

                        {/* 2-column grid */}
                        {pending.length > 0 && (
                            <div className="grid grid-cols-2 gap-3">
                                <AnimatePresence>
                                    {pending.map((item, i) => (
                                        <motion.div key={item.id}
                                            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                                            transition={{ delay: i * 0.04 }}>
                                            <Bezel radius={RADIUS.row} pad={4} shadow={WARM.sm} coreBg="#fffaf8" className="perf-card-shell h-full">
                                                <div className="relative flex flex-col justify-between" style={{ padding: 14, minHeight: '6rem' }}>
                                                    <button onClick={() => deleteBucket(item.id)} aria-label="Delete"
                                                        className="absolute top-2 right-2 flex items-center justify-center spring-press" style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(196,104,126,0.08)' }}>
                                                        <X size={12} strokeWidth={1.6} style={{ color: '#c9b3ba' }} />
                                                    </button>
                                                    <p className="pr-5 mb-3" style={{ fontSize: '0.86rem', lineHeight: 1.32, color: WARM.ink }}>{item.text}</p>
                                                    <div className="flex items-center justify-between">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="flex items-center justify-center rounded-full text-white" style={{ width: 18, height: 18, fontSize: '0.5rem', fontWeight: 700, background: 'radial-gradient(circle at 30% 30%,#fff,#c06079)' }}>{(item.addedBy || '?').charAt(0).toUpperCase()}</span>
                                                            <span style={{ fontSize: '0.62rem', color: WARM.inkSoft }}>{item.addedBy}</span>
                                                        </span>
                                                        <motion.button onClick={() => toggleBucket(item.id)} aria-label="Mark done" whileTap={{ scale: 0.85 }}
                                                            className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 999, border: '1.5px solid rgba(196,104,126,0.4)', background: '#fffaf8' }} />
                                                    </div>
                                                </div>
                                            </Bezel>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Completed */}
                        {completed.length > 0 && (
                            <div className="mt-4">
                                <button onClick={() => setShowCompleted(v => !v)} className="flex items-center gap-2 py-2 spring-press mb-1">
                                    <Check size={13} strokeWidth={1.8} style={{ color: '#16a34a' }} />
                                    <p style={{ fontSize: '0.72rem', fontWeight: 600, color: WARM.inkSoft }}>{completed.length} completed</p>
                                    {showCompleted ? <ChevronUp size={13} strokeWidth={1.7} style={{ color: WARM.inkSoft }} /> : <ChevronDown size={13} strokeWidth={1.7} style={{ color: WARM.inkSoft }} />}
                                </button>
                                <AnimatePresence>
                                    {showCompleted && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                            <div className="grid grid-cols-2 gap-3 pt-1">
                                                {completed.map(item => (
                                                    <div key={item.id} className="relative rounded-2xl flex flex-col justify-between" style={{ padding: 14, minHeight: '5rem', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                                                        <button onClick={() => deleteBucket(item.id)} aria-label="Delete"
                                                            className="absolute top-2 right-2 flex items-center justify-center spring-press" style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(196,104,126,0.08)' }}>
                                                            <X size={12} strokeWidth={1.6} style={{ color: '#c9b3ba' }} />
                                                        </button>
                                                        <p className="line-through pr-3 mb-3" style={{ fontSize: '0.82rem', lineHeight: 1.32, color: WARM.inkSoft }}>{item.text}</p>
                                                        <button onClick={() => toggleBucket(item.id)} aria-label="Mark not done"
                                                            className="self-end flex items-center justify-center spring-press" style={{ width: 26, height: 26, borderRadius: 999, background: '#22c55e' }}>
                                                            <Check size={13} className="text-white" strokeWidth={2.4} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ══ WISHLIST ═════════════════════════════════════════════ */}
                {activeTab === 'wishlist' && (
                    <motion.div key="wishlist" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 7 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="px-5">

                        {/* Person sub-tabs — sliding pill */}
                        <div className="flex gap-2 mb-5">
                            {(['me', 'partner'] as const).map(who => {
                                const name = who === 'me' ? profile.myName : profile.partnerName;
                                const count = who === 'me' ? myWishes.length : partnerWishes.length;
                                const color = who === 'me' ? '#ec4899' : '#a8617f';
                                const isActive = wishTab === who;
                                return (
                                    <button key={who} onClick={() => setWishTab(who)}
                                        className="flex-1 relative flex items-center justify-center gap-2 py-2.5 spring-press"
                                        style={{ borderRadius: RADIUS.row }}>
                                        {isActive && (
                                            <motion.span layoutId="us-wish-pill" className="absolute inset-0" style={{ borderRadius: RADIUS.row, background: '#fffaf8', border: `1.5px solid ${color}40`, boxShadow: `0 6px 16px ${color}1f, ${WARM.catch}` }}
                                                transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                                        )}
                                        <span className="relative z-[1] w-2 h-2 rounded-full flex-shrink-0" style={{ background: isActive ? color : '#d8c4cb' }} />
                                        <span className="relative z-[1]" style={{ fontSize: '0.82rem', fontWeight: 600, color: isActive ? WARM.ink : WARM.inkSoft }}>{name}</span>
                                        {count > 0 && (
                                            <span className="relative z-[1]" style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 999, background: isActive ? color + '18' : 'rgba(196,104,126,0.08)', color: isActive ? color : WARM.inkSoft }}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Wishlist content for active person */}
                        <AnimatePresence mode="wait">
                            {(['me', 'partner'] as const).map(who => {
                                if (wishTab !== who) return null;
                                const list = who === 'me' ? myWishes : partnerWishes;
                                const inputVal = who === 'me' ? myWishInput : partnerWishInput;
                                const setInput = who === 'me' ? setMyWishInput : setPartnerWishInput;
                                const a = who === 'me'
                                    ? { color: '#ec4899', light: 'rgba(236,72,153,0.07)', ring: 'rgba(236,72,153,0.2)' }
                                    : { color: '#a8617f', light: 'rgba(168,97,127,0.08)', ring: 'rgba(168,97,127,0.22)' };

                                return (
                                    <motion.div key={who} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                                        className="flex flex-col gap-2.5">

                                        {/* Add input */}
                                        <div className="flex gap-2 items-center mb-1"
                                            style={{ borderRadius: RADIUS.row, padding: '0.9rem 1rem', background: '#fffaf8', border: '1px solid rgba(196,104,126,0.18)', boxShadow: `${WARM.sm}, ${WARM.catch}` }}>
                                            <Gift size={16} strokeWidth={1.7} className="flex-shrink-0" style={{ color: a.color }} />
                                            <input value={inputVal} onChange={e => setInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { addWish(who, inputVal); setInput(''); } }}
                                                placeholder="Add a wish…"
                                                inputMode="text" enterKeyHint="done" autoCapitalize="sentences" autoCorrect="on"
                                                className="flex-1 bg-transparent outline-none" style={{ fontSize: 16, color: WARM.ink }} />
                                            <button onClick={() => { addWish(who, inputVal); setInput(''); }}
                                                className="flex items-center justify-center flex-shrink-0 spring-press"
                                                style={{ width: 32, height: 32, borderRadius: RADIUS.chip, background: `linear-gradient(135deg,${a.color}cc,${a.color})`, boxShadow: `0 4px 10px ${a.color}40, inset 0 1px 0 rgba(255,255,255,0.4)` }}>
                                                <Plus size={16} className="text-white" strokeWidth={1.8} />
                                            </button>
                                        </div>

                                        {list.length === 0 && (
                                            <div className="text-center py-12">
                                                <div className="mx-auto mb-3 flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 18, background: a.light, border: `1px solid ${a.ring}` }}>
                                                    <Gift size={24} strokeWidth={1.7} style={{ color: a.color }} />
                                                </div>
                                                <p style={{ fontSize: '0.78rem', color: WARM.inkSoft }}>No wishes yet</p>
                                            </div>
                                        )}

                                        <AnimatePresence>
                                            {list.map((item, i) => (
                                                <motion.div key={item.id}
                                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                                                    transition={{ delay: i * 0.03 }}>
                                                    <Bezel radius={RADIUS.row} pad={4} shadow={WARM.sm} coreBg={item.gifted ? 'rgba(34,197,94,0.06)' : a.light} className="perf-card-shell">
                                                        <div className="relative" style={{ padding: '0.85rem 0.95rem' }}>
                                                            <button onClick={() => deleteWish(item.id)} aria-label="Delete"
                                                                className="absolute top-2.5 right-2.5 flex items-center justify-center spring-press" style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(196,104,126,0.08)' }}>
                                                                <X size={12} strokeWidth={1.6} style={{ color: '#c9b3ba' }} />
                                                            </button>
                                                            <p className={`pr-5 mb-2 ${item.gifted ? 'line-through' : ''}`} style={{ fontSize: '0.85rem', lineHeight: 1.32, color: item.gifted ? WARM.inkSoft : WARM.ink }}>{item.text}</p>
                                                            <button onClick={() => toggleGifted(item.id)}
                                                                className="inline-flex items-center gap-1.5 spring-press"
                                                                style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: 999, background: item.gifted ? 'rgba(34,197,94,0.15)' : 'rgba(196,104,126,0.08)', color: item.gifted ? '#16a34a' : WARM.inkSoft }}>
                                                                <Gift size={11} strokeWidth={1.8} />
                                                                {item.gifted ? 'gifted' : 'mark gifted'}
                                                            </button>
                                                        </div>
                                                    </Bezel>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </motion.div>
                )}

                {/* ══ MILESTONES ═══════════════════════════════════════════ */}
                {activeTab === 'milestones' && (
                    <motion.div key="milestones" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 7 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="px-5">

                        <AnimatePresence mode="wait">
                            {showMsForm ? (
                                /* ── Add form ── */
                                <motion.div key="form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                    className="p-5 mb-5 flex flex-col gap-3"
                                    style={{ borderRadius: RADIUS.cardOuter, background: '#fffaf8', boxShadow: `${WARM.md}, ${WARM.catch}`, border: '1px solid rgba(255,255,255,0.9)' }}>
                                    <p className="uppercase" style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', color: WARM.navActive }}>New milestone</p>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {MILESTONE_EMOJIS.map(e => (
                                            <button key={e} onClick={() => setMsEmoji(e)}
                                                className="flex items-center justify-center text-lg spring-press transition-all"
                                                style={{ width: 36, height: 36, borderRadius: RADIUS.chip, background: msEmoji === e ? '#ffe4ea' : 'rgba(196,104,126,0.06)', boxShadow: msEmoji === e ? WARM.catch : 'none', transform: msEmoji === e ? 'scale(1.12)' : 'scale(1)' }}>
                                                {e}
                                            </button>
                                        ))}
                                    </div>
                                    <input value={msTitle} onChange={e => setMsTitle(e.target.value)} placeholder="What happened?" className={inputCls} />
                                    <input value={msDate} onChange={e => setMsDate(e.target.value)} type="date" className={inputCls} />
                                    <input value={msDesc} onChange={e => setMsDesc(e.target.value)} placeholder="A little note… (optional)" className={inputCls} />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowMsForm(false)} className="flex-1 py-3 spring-press" style={{ borderRadius: RADIUS.chip, fontSize: '0.82rem', color: WARM.inkSoft, background: 'rgba(196,104,126,0.08)' }}>Cancel</button>
                                        <button onClick={addMilestone}
                                            className="flex-1 py-3 font-semibold text-white spring-press"
                                            style={{ borderRadius: RADIUS.chip, fontSize: '0.82rem', background: 'linear-gradient(135deg,#f472b6,#ec4899)', boxShadow: '0 6px 14px rgba(236,72,153,0.3), inset 0 1px 0 rgba(255,255,255,0.4)', opacity: msTitle.trim() && msDate ? 1 : 0.4 }}>
                                            Save
                                        </button>
                                    </div>
                                </motion.div>
                            ) : datedMilestones.length === 0 ? (
                                /* ── Empty state with CTA ── */
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="overflow-hidden mb-5"
                                    style={{ borderRadius: RADIUS.heroOuter, background: 'linear-gradient(145deg,#fffdfc,#fff1f5)', boxShadow: `${WARM.md}, ${WARM.catch}`, border: '1px solid rgba(255,255,255,0.9)' }}>
                                    <div className="px-6 pt-8 pb-6 text-center">
                                        <div className="mx-auto mb-4 flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: 22, background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.20)' }}>
                                            <Milestone size={28} strokeWidth={1.7} style={{ color: '#ec4899' }} />
                                        </div>
                                        <p className="font-serif font-bold text-xl mb-1" style={{ color: WARM.ink }}>Your story starts here</p>
                                        <p className="mb-6" style={{ fontSize: '0.78rem', color: WARM.inkSoft }}>Every great love has chapters worth remembering</p>
                                        <button onClick={() => setShowMsForm(true)}
                                            className="inline-flex items-center gap-2 px-6 py-3 spring-press text-white font-semibold"
                                            style={{ borderRadius: RADIUS.chip, fontSize: '0.85rem', background: 'linear-gradient(135deg,#f472b6,#ec4899)', boxShadow: '0 6px 16px rgba(236,72,153,0.35), inset 0 1px 0 rgba(255,255,255,0.4)' }}>
                                            <Plus size={15} strokeWidth={1.8} />
                                            Add first milestone
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                /* ── Add button (when milestones exist) ── */
                                <motion.div key="addbtn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <button onClick={() => setShowMsForm(true)}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 mb-5 spring-press"
                                        style={{ borderRadius: RADIUS.row, background: '#fffaf8', border: '1px dashed rgba(236,72,153,0.35)', boxShadow: WARM.catch }}>
                                        <div className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: RADIUS.chip, background: 'rgba(236,72,153,0.08)' }}>
                                            <Plus size={16} strokeWidth={1.8} style={{ color: '#ec4899' }} />
                                        </div>
                                        <p style={{ fontSize: '0.85rem', color: WARM.inkSoft }}>Add a milestone…</p>
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Horizontal printed-timeline scroll */}
                        {datedMilestones.length > 0 && (
                            <div data-lenis-prevent className="lenis-inner -mx-5 px-5 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
                                <div className="flex gap-3" style={{ width: 'max-content' }}>
                                    {datedMilestones.map((ms, i) => {
                                        const isNewest = i === datedMilestones.length - 1;
                                        return (
                                            <motion.div key={ms.id}
                                                initial={{ opacity: 0, y: 22, scale: 0.985 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: '0px 0px -48px 0px' }}
                                                transition={{ ...SOFT_SPRING, delay: i * 0.045 }}
                                                className="flex-shrink-0">
                                                <Bezel radius={22} pad={4} shadow={WARM.sm} coreBg={MS_GRADIENTS[i % MS_GRADIENTS.length]} style={{ width: '11rem' }}>
                                                    <div className="relative flex flex-col gap-2" style={{ padding: '1.25rem' }}>
                                                        <button onClick={() => deleteMilestone(ms.id)} aria-label="Delete"
                                                            className="absolute top-2.5 right-2.5 z-[1] flex items-center justify-center spring-press" style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(196,104,126,0.08)' }}>
                                                            <X size={12} strokeWidth={1.6} style={{ color: '#c9b3ba' }} />
                                                        </button>
                                                        <span className="relative flex items-center justify-center mb-1" style={{ width: 48, height: 48 }}>
                                                            {isNewest && !reduce && (
                                                                <motion.span aria-hidden className="absolute rounded-full" style={{ width: 60, height: 60, background: 'radial-gradient(circle, rgba(244,114,182,0.30), transparent 70%)' }}
                                                                    animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0.95, 0.6] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
                                                            )}
                                                            <span className="relative flex items-center justify-center rounded-full text-2xl" style={{ width: 48, height: 48, background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(192,96,121,0.78))', boxShadow: '0 10px 20px rgba(192,96,121,0.18), inset 0 1px 0 rgba(255,255,255,0.92)' }}>
                                                                {ms.emoji}
                                                            </span>
                                                        </span>
                                                        <p className="font-serif font-bold leading-snug" style={{ fontSize: '0.95rem', color: WARM.ink }}>{ms.title}</p>
                                                        <p style={{ fontSize: '0.64rem', color: WARM.inkSoft }}>
                                                            {new Date(ms.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </p>
                                                        <p style={{ fontSize: '0.64rem', fontWeight: 700, color: WARM.navActive }}>{relativeTime(ms.date)}</p>
                                                        {ms.description && (
                                                            <p className="italic leading-snug line-clamp-2" style={{ fontSize: '0.7rem', color: WARM.inkSoft }}>{ms.description}</p>
                                                        )}
                                                    </div>
                                                </Bezel>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
};

export const Us = React.memo(UsView);

import React, { useEffect, useState } from 'react';
import { Plus, Check, Trash2, X, MapPin, Gift, ChevronDown, ChevronUp, Home, Brush, Moon, Send, Compass, Milestone, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
    'linear-gradient(145deg,#fdf2f8,#fce7f3)',
    'linear-gradient(145deg,#eff6ff,#dbeafe)',
    'linear-gradient(145deg,#fffbeb,#fef3c7)',
    'linear-gradient(145deg,#f0fdf4,#dcfce7)',
    'linear-gradient(145deg,#faf5ff,#ede9fe)',
    'linear-gradient(145deg,#fff1f2,#ffe4e6)',
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

    const TABS = [
        { id: 'bucket' as Tab, Icon: Compass, label: 'Bucket List', count: pending.length },
        { id: 'wishlist' as Tab, Icon: Gift, label: 'Wishlist', count: visibleWishes.length },
        { id: 'milestones' as Tab, Icon: Milestone, label: 'Milestones', count: datedMilestones.length },
    ];

    const inputCls = "bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-[0.88rem] text-gray-700 placeholder-gray-300 outline-none focus:border-lior-200 transition-colors w-full";

    return (
        <div className="us-view min-h-screen pb-32">
            <ViewHeader title="Us" subtitle="our world together" onBack={() => setView('home')} tone="romance" />

            {/* ── Shared Spaces ────────────────────────────────────────── */}
            <div className="px-5 mb-3">
                <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--color-text-secondary)', opacity: 0.72 }}>Shared Spaces</p>
                <div className="grid grid-cols-2 gap-3">
                    {([
                        { Icon: Home,  label: 'Our Room',      sub: 'Decorate together',  view: 'our-room' as const,      accent: '#ec4899' },
                        { Icon: Brush, label: 'Draw Together', sub: 'Shared canvas',      view: 'canvas' as const,        accent: '#8b5cf6' },
                        { Icon: Moon,  label: 'Quiet Mode',    sub: 'Ambient memories',   view: 'quiet-mode' as const,    accent: '#6366f1' },
                    ]).map((item, i) => (
                        <motion.button
                            key={item.label}
                            initial={{ opacity: 0, y: 14, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 24, delay: i * 0.05 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setView(item.view)}
                            className="relative overflow-hidden flex flex-col items-start gap-3 p-4 rounded-[1.4rem] text-left"
                            style={{
                                // Uniform frosted-white glass for ALL four cards —
                                // each space's identity comes from the accent icon
                                // badge, not a whole-card tint. This kills the
                                // chaotic 4-different-colours look.
                                background: 'rgba(255,255,255,0.74)',
                                border: '1px solid rgba(255,255,255,0.92)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 10px 22px rgba(120,80,100,0.09)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                            }}
                        >
                            {/* Soft accent wash bleeding from the top-right corner */}
                            <div
                                aria-hidden
                                className="absolute -top-10 -right-10 w-28 h-28 rounded-full pointer-events-none"
                                style={{ background: `radial-gradient(circle, ${item.accent}26, transparent 70%)` }}
                            />
                            {/* Accent icon badge — the space's identity */}
                            <div
                                className="w-11 h-11 rounded-2xl flex items-center justify-center relative"
                                style={{
                                    background: `${item.accent}14`,
                                    border: `1px solid ${item.accent}2e`,
                                }}
                            >
                                <item.Icon size={19} strokeWidth={2} style={{ color: item.accent }} />
                            </div>
                            <div className="relative">
                                <p className="font-semibold text-[0.94rem] leading-tight" style={{ color: 'var(--color-text-primary)' }}>{item.label}</p>
                                <p className="text-[0.74rem] mt-0.5" style={{ color: 'var(--color-text-secondary)', opacity: 0.68 }}>{item.sub}</p>
                            </div>
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* ── Aura Signal — featured full-width CTA ─────────────────── */}
            <div className="px-5 mb-5">
                <motion.button
                    data-coachmark="aura-signal"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.24 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setView('aura-signal')}
                    className="relative w-full flex items-center gap-3.5 px-4 py-4 rounded-[1.4rem] overflow-hidden"
                    style={{
                        // Re-skinned from the jarring yellow to a rich rose
                        // gradient so it belongs to the rest of the app.
                        background: 'linear-gradient(135deg, #f9a8d4 0%, #ec4899 52%, #be3d72 100%)',
                        boxShadow: '0 12px 28px rgba(236,72,153,0.32), inset 0 1px 0 rgba(255,255,255,0.32)',
                    }}
                >
                    <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(120% 90% at 12% -20%, rgba(255,255,255,0.40), transparent 58%)' }}
                    />
                    <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 relative"
                        style={{ background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.38)' }}
                    >
                        <Sparkles size={19} strokeWidth={2} className="text-white" />
                    </div>
                    <div className="flex-1 text-left relative">
                        <p className="font-serif font-bold text-white text-[1.02rem] leading-tight">Pulse</p>
                        <p className="text-[0.72rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.84)' }}>Send a feeling across the distance, wordlessly</p>
                    </div>
                    <div
                        className="relative flex items-center gap-1.5 text-[0.74rem] font-bold px-3.5 py-2 rounded-full flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.96)', color: '#be3d72' }}
                    >
                        Send <Send size={12} strokeWidth={2.6} />
                    </div>
                </motion.button>
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────── */}
            <div className="px-5 mb-6">
                <div
                    // Solid frosted-white track so the control reads as its
                    // own distinct surface above the busy ambient background
                    // — the old near-transparent track let the florals bleed
                    // through and killed the label contrast.
                    className="flex gap-1.5 p-1.5 rounded-[1.25rem]"
                    style={{
                        background: 'rgba(255,255,255,0.92)',
                        border: '1px solid rgba(255,255,255,0.95)',
                        boxShadow: '0 6px 18px rgba(120,80,100,0.12), inset 0 1px 0 rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                    }}
                >
                    {TABS.map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className="flex-1 py-3 rounded-[0.95rem] relative flex items-center justify-center gap-1.5 spring-press transition-all duration-200"
                                style={{
                                    background: active
                                        ? 'linear-gradient(135deg, #f472b6, #ec4899)'
                                        : 'rgba(120,80,100,0.05)',
                                    boxShadow: active
                                        ? '0 6px 14px rgba(236,72,153,0.34), inset 0 1px 0 rgba(255,255,255,0.3)'
                                        : 'none',
                                }}>
                                <tab.Icon
                                    size={15}
                                    strokeWidth={2.3}
                                    style={{ color: active ? '#ffffff' : '#7d7280' }}
                                />
                                <span
                                    className="text-[0.74rem] font-bold"
                                    style={{ color: active ? '#ffffff' : '#6b6370' }}
                                >
                                    {tab.label}
                                </span>
                                {tab.count > 0 && !active && (
                                    <span className="absolute -top-1 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[0.5rem] font-bold flex items-center justify-center"
                                        style={{ background: '#ec4899', boxShadow: '0 1px 4px rgba(236,72,153,0.4)' }}>
                                        {tab.count > 9 ? '9+' : tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <AnimatePresence mode="wait">

                {/* ══ BUCKET LIST ══════════════════════════════════════════ */}
                {activeTab === 'bucket' && (
                    <motion.div key="bucket" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }} className="px-5">

                        {/* Progress */}
                        {visibleBucket.length > 0 && (
                            <div className="mb-4">
                                <div className="flex justify-between mb-1.5">
                                    <p className="text-[0.7rem] text-gray-400">{completed.length} of {visibleBucket.length} done</p>
                                    <p className="text-[0.7rem] font-bold text-lior-400">{pct}%</p>
                                </div>
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(236,72,153,0.1)' }}>
                                    <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#f9a8d4,#ec4899)' }}
                                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
                                </div>
                            </div>
                        )}

                        {/* Add input */}
                        <div className="flex gap-2.5 items-center px-4 py-3.5 rounded-2xl mb-5 transition-all duration-200"
                            style={{
                                background: bucketFocused ? 'rgba(253,242,248,0.9)' : 'white',
                                boxShadow: bucketFocused
                                    ? '0 0 0 2px rgba(236,72,153,0.25), 0 2px 12px rgba(236,72,153,0.10)'
                                    : '0 1px 8px rgba(0,0,0,0.05)',
                                border: bucketFocused
                                    ? '1px solid rgba(236,72,153,0.35)'
                                    : '1px solid rgba(0,0,0,0.04)',
                            }}>
                            <MapPin size={14} style={{ color: bucketFocused ? '#ec4899' : undefined }}
                                className={`flex-shrink-0 transition-colors duration-200 ${bucketFocused ? '' : 'text-lior-300'}`} />
                            <input value={bucketInput} onChange={e => setBucketInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addBucketItem(); }}
                                onFocus={() => setBucketFocused(true)}
                                onBlur={() => setBucketFocused(false)}
                                placeholder="An adventure to add…"
                                inputMode="text"
                                enterKeyHint="done"
                                autoCapitalize="sentences"
                                autoCorrect="on"
                                className="flex-1 bg-transparent text-[16px] text-gray-700 placeholder-gray-300 outline-none" />
                            <button onClick={addBucketItem}
                                className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 spring-press"
                                style={{ background: 'linear-gradient(135deg,#f472b6,#ec4899)' }}>
                                <Plus size={14} className="text-white" strokeWidth={2.5} />
                            </button>
                        </div>

                        {/* Empty */}
                        {visibleBucket.length === 0 && (
                            <div className="text-center py-16">
                                <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center"
                                    style={{ background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.18)' }}>
                                    <Compass size={28} strokeWidth={1.8} style={{ color: '#ec4899' }} />
                                </div>
                                <p className="font-serif text-gray-500 text-xl mb-1">The world is yours</p>
                                <p className="text-[0.75rem] text-gray-300">Add adventures to share together</p>
                            </div>
                        )}

                        {/* 2-column grid */}
                        {pending.length > 0 && (
                            <div className="grid grid-cols-2 gap-2.5">
                                <AnimatePresence>
                                    {pending.map((item, i) => (
                                        <motion.div key={item.id}
                                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                                            transition={{ delay: i * 0.04 }}
                                            className="perf-card-shell group relative rounded-2xl p-4 flex flex-col justify-between"
                                            style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)', minHeight: '5.5rem' }}>
                                            <button onClick={() => deleteBucket(item.id)}
                                                className="absolute top-2.5 right-2.5 opacity-40 transition-opacity spring-press text-gray-200">
                                                <X size={12} />
                                            </button>
                                            <p className="text-[0.85rem] text-gray-700 leading-snug pr-4 mb-3">{item.text}</p>
                                            <div className="flex items-center justify-between">
                                                <p className="text-[0.6rem] text-gray-300">{item.addedBy}</p>
                                                <button onClick={() => toggleBucket(item.id)}
                                                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center spring-press"
                                                    style={{ borderColor: 'rgba(236,72,153,0.3)' }} />
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Completed */}
                        {completed.length > 0 && (
                            <div className="mt-4">
                                <button onClick={() => setShowCompleted(v => !v)} className="flex items-center gap-2 py-2 spring-press mb-1">
                                    <Check size={12} className="text-green-400" strokeWidth={2.5} />
                                    <p className="text-[0.72rem] font-semibold text-gray-400">{completed.length} completed</p>
                                    {showCompleted ? <ChevronUp size={12} className="text-gray-300" /> : <ChevronDown size={12} className="text-gray-300" />}
                                </button>
                                <AnimatePresence>
                                    {showCompleted && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                            <div className="grid grid-cols-2 gap-2.5 pt-1">
                                                {completed.map(item => (
                                                    <div key={item.id} className="group relative rounded-2xl p-4 flex flex-col justify-between"
                                                        style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)', minHeight: '5rem' }}>
                                                        <button onClick={() => deleteBucket(item.id)}
                                                            className="absolute top-2.5 right-2.5 opacity-40 spring-press text-gray-200">
                                                            <X size={12} />
                                                        </button>
                                                        <p className="text-[0.82rem] text-gray-400 line-through leading-snug pr-3 mb-3">{item.text}</p>
                                                        <button onClick={() => toggleBucket(item.id)}
                                                            className="self-end w-6 h-6 rounded-full bg-green-400 flex items-center justify-center spring-press">
                                                            <Check size={12} className="text-white" strokeWidth={3} />
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
                    <motion.div key="wishlist" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }} className="px-5">

                        {/* Person sub-tabs */}
                        <div className="flex gap-2 mb-5">
                            {(['me', 'partner'] as const).map(who => {
                                const name = who === 'me' ? profile.myName : profile.partnerName;
                                const count = who === 'me' ? myWishes.length : partnerWishes.length;
                                const color = who === 'me' ? '#ec4899' : '#6366f1';
                                const isActive = wishTab === who;
                                return (
                                    <button key={who} onClick={() => setWishTab(who)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl spring-press transition-all duration-200"
                                        style={{
                                            background: isActive ? 'white' : 'rgba(0,0,0,0.03)',
                                            boxShadow: isActive ? `0 2px 12px ${color}22` : 'none',
                                            border: isActive ? `1.5px solid ${color}33` : '1.5px solid transparent',
                                        }}>
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isActive ? color : '#d1d5db' }} />
                                        <span className="text-[0.82rem] font-semibold" style={{ color: isActive ? '#374151' : '#b0b7c3' }}>{name}</span>
                                        {count > 0 && (
                                            <span className="text-[0.62rem] font-bold px-1.5 py-0.5 rounded-full"
                                                style={{ background: isActive ? color + '18' : '#f3f4f6', color: isActive ? color : '#c0c7d4' }}>
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
                                    ? { color: '#ec4899', light: 'rgba(236,72,153,0.07)', ring: 'rgba(236,72,153,0.18)' }
                                    : { color: '#6366f1', light: 'rgba(99,102,241,0.07)', ring: 'rgba(99,102,241,0.18)' };

                                return (
                                    <motion.div key={who} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                                        className="flex flex-col gap-2.5">

                                        {/* Add input */}
                                        <div className="flex gap-2 items-center px-4 py-3.5 rounded-2xl mb-1"
                                            style={{ background: 'white', boxShadow: '0 1px 8px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.04)' }}>
                                            <Gift size={14} className="flex-shrink-0" style={{ color: a.color + 'aa' }} />
                                            <input value={inputVal} onChange={e => setInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { addWish(who, inputVal); setInput(''); } }}
                                                placeholder="Add a wish…"
                                                className="flex-1 bg-transparent text-[0.88rem] text-gray-700 placeholder-gray-300 outline-none" />
                                            <button onClick={() => { addWish(who, inputVal); setInput(''); }}
                                                className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 spring-press"
                                                style={{ background: `linear-gradient(135deg,${a.color}cc,${a.color})` }}>
                                                <Plus size={14} className="text-white" strokeWidth={2.5} />
                                            </button>
                                        </div>

                                        {list.length === 0 && (
                                            <div className="text-center py-12">
                                                <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                                                    style={{ background: a.light, border: `1px solid ${a.ring}` }}>
                                                    <Gift size={24} strokeWidth={1.8} style={{ color: a.color }} />
                                                </div>
                                                <p className="text-[0.75rem] text-gray-300">No wishes yet</p>
                                            </div>
                                        )}

                                        <AnimatePresence>
                                            {list.map((item, i) => (
                                                <motion.div key={item.id}
                                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                                                    transition={{ delay: i * 0.03 }}
                                                    className="perf-card-shell group relative rounded-2xl px-4 py-3.5"
                                                    style={{ background: item.gifted ? 'rgba(34,197,94,0.06)' : a.light, border: `1px solid ${item.gifted ? 'rgba(34,197,94,0.15)' : a.ring}` }}>
                                                    <button onClick={() => deleteWish(item.id)}
                                                        className="absolute top-3 right-3 opacity-40 spring-press text-gray-200">
                                                        <X size={12} />
                                                    </button>
                                                    <p className={`text-[0.85rem] leading-snug pr-5 mb-2 ${item.gifted ? 'line-through text-gray-300' : 'text-gray-700'}`}>{item.text}</p>
                                                    <button onClick={() => toggleGifted(item.id)}
                                                        className="text-[0.62rem] font-semibold px-2.5 py-1 rounded-full spring-press"
                                                        style={{
                                                            background: item.gifted ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.05)',
                                                            color: item.gifted ? '#16a34a' : '#d1d5db'
                                                        }}>
                                                        {item.gifted ? 'gifted ✓' : 'mark gifted'}
                                                    </button>
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
                    <motion.div key="milestones" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }} className="px-5">

                        <AnimatePresence mode="wait">
                            {showMsForm ? (
                                /* ── Add form ── */
                                <motion.div key="form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                    className="rounded-2xl p-5 mb-5 flex flex-col gap-3"
                                    style={{ background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.09)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                    <p className="text-[0.72rem] font-semibold text-gray-400 uppercase tracking-widest">New Milestone</p>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {MILESTONE_EMOJIS.map(e => (
                                            <button key={e} onClick={() => setMsEmoji(e)}
                                                className="w-9 h-9 rounded-xl text-lg flex items-center justify-center spring-press transition-all"
                                                style={{ background: msEmoji === e ? 'rgba(236,72,153,0.12)' : '#f9fafb', transform: msEmoji === e ? 'scale(1.15)' : 'scale(1)' }}>
                                                {e}
                                            </button>
                                        ))}
                                    </div>
                                    <input value={msTitle} onChange={e => setMsTitle(e.target.value)} placeholder="What happened?" className={inputCls} />
                                    <input value={msDate} onChange={e => setMsDate(e.target.value)} type="date" className={inputCls} />
                                    <input value={msDesc} onChange={e => setMsDesc(e.target.value)} placeholder="A little note… (optional)" className={inputCls} />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowMsForm(false)} className="flex-1 py-3 rounded-xl text-[0.82rem] text-gray-400 bg-gray-100 spring-press">Cancel</button>
                                        <button onClick={addMilestone}
                                            className="flex-1 py-3 rounded-xl text-[0.82rem] font-semibold text-white spring-press"
                                            style={{ background: 'linear-gradient(135deg,#f472b6,#ec4899)', opacity: msTitle.trim() && msDate ? 1 : 0.4 }}>
                                            Save
                                        </button>
                                    </div>
                                </motion.div>
                            ) : datedMilestones.length === 0 ? (
                                /* ── Empty state with CTA ── */
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="rounded-3xl overflow-hidden mb-5"
                                    style={{ background: 'linear-gradient(145deg,#fdf2f8,#ede9fe)', boxShadow: '0 4px 24px rgba(236,72,153,0.1)' }}>
                                    <div className="px-6 pt-8 pb-6 text-center">
                                        <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center"
                                            style={{ background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.20)' }}>
                                            <Milestone size={28} strokeWidth={1.8} style={{ color: '#ec4899' }} />
                                        </div>
                                        <p className="font-serif font-bold text-gray-700 text-xl mb-1">Your story starts here</p>
                                        <p className="text-[0.75rem] text-gray-400 mb-6">Every great love has chapters worth remembering</p>
                                        <button onClick={() => setShowMsForm(true)}
                                            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl spring-press text-white text-[0.85rem] font-semibold"
                                            style={{ background: 'linear-gradient(135deg,#f472b6,#ec4899)', boxShadow: '0 4px 16px rgba(236,72,153,0.35)' }}>
                                            <Plus size={15} strokeWidth={2.5} />
                                            Add first milestone
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                /* ── Add button (when milestones exist) ── */
                                <motion.div key="addbtn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <button onClick={() => setShowMsForm(true)}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-5 spring-press"
                                        style={{ background: 'white', border: '1px dashed rgba(236,72,153,0.3)', boxShadow: '0 1px 6px rgba(0,0,0,0.03)' }}>
                                        <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(236,72,153,0.08)' }}>
                                            <Plus size={15} className="text-lior-400" />
                                        </div>
                                        <p className="text-[0.85rem] text-gray-400">Add a milestone…</p>
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Horizontal scroll */}
                        {datedMilestones.length > 0 && (
                            <div data-lenis-prevent className="lenis-inner -mx-5 px-5 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
                                <div className="flex gap-3" style={{ width: 'max-content' }}>
                                    {datedMilestones.map((ms, i) => (
                                        <motion.div key={ms.id}
                                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.06 }}
                                            className="group relative rounded-[1.5rem] p-5 flex flex-col gap-2 flex-shrink-0"
                                            style={{ width: '10.5rem', background: MS_GRADIENTS[i % MS_GRADIENTS.length], boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                                            <button onClick={() => deleteMilestone(ms.id)}
                                                className="absolute top-3 right-3 opacity-40 spring-press text-gray-300 transition-opacity">
                                                <X size={13} />
                                            </button>
                                            <span className="text-4xl">{ms.emoji}</span>
                                            <p className="font-serif font-semibold text-gray-800 text-[0.88rem] leading-snug">{ms.title}</p>
                                            <p className="text-[0.64rem] text-gray-400">
                                                {new Date(ms.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                            <p className="text-[0.64rem] font-semibold text-lior-400">{relativeTime(ms.date)}</p>
                                            {ms.description && (
                                                <p className="text-[0.7rem] text-gray-500 italic leading-snug line-clamp-2">{ms.description}</p>
                                            )}
                                        </motion.div>
                                    ))}
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

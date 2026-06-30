import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, type PanInfo } from 'framer-motion';
import { Camera, Feather, Heart, Plus, X } from 'lucide-react';
import type { TimeCapsule, ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useThrottledReload } from '../hooks/useThrottledReload';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_PRESS_SPRING,
    GOLD_SOFT_SPRING,
    GoldCTA,
    GoldSectionHeader,
    goldRise,
    goldStagger,
} from '../components/premium/GoldKit';
import { ACCENT, DAY_MS, WaxSeal, formatDate } from '../components/premium/time-capsule/SealKit';
import { OpenedLetterCard, SealedEnvelopeCard } from '../components/premium/time-capsule/LetterCards';
import { LetterReader } from '../components/premium/time-capsule/LetterReader';
import { PremiumModal } from '../components/PremiumModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { compressImage } from '../utils/media';

interface TimeCapsuleViewProps {
    setView: (view: ViewState) => void;
}

const FREE_CAPSULE_LIMIT = 3;

type CapsuleStatus = 'sealed' | 'ready' | 'opened';

function getStatus(capsule: TimeCapsule): CapsuleStatus {
    if (capsule.isUnlocked) return 'opened';
    return new Date(capsule.unlockDate).getTime() <= Date.now() ? 'ready' : 'sealed';
}

function dateOnlyToLocalNoonIso(value: string) {
    return new Date(`${value}T12:00:00`).toISOString();
}

interface ReaderState {
    capsule: TimeCapsule;
    mode: 'ceremony' | 'read';
}

export const TimeCapsuleView: React.FC<TimeCapsuleViewProps> = ({ setView }) => {
    const [capsules, setCapsules] = useState<TimeCapsule[]>(() => StorageService.getTimeCapsules());
    const [showForm, setShowForm] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [reading, setReading] = useState<ReaderState | null>(null);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [unlockDate, setUnlockDate] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Periodic tick so a capsule that becomes due WHILE the screen is open
    // promotes from "Still sealed" to "Ready to open" without needing a remount
    // or a storage event (getStatus is time-derived).
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30_000);
        return () => clearInterval(id);
    }, []);

    const reloadCapsules = useThrottledReload(() => setCapsules(StorageService.getTimeCapsules()));
    useEffect(() => {
        const onStorage = (event: Event) => {
            const table = (event as CustomEvent).detail?.table;
            if (table && table !== 'time_capsules' && table !== 'init') return;
            reloadCapsules();
        };
        storageEventTarget.addEventListener('storage-update', onStorage);
        return () => storageEventTarget.removeEventListener('storage-update', onStorage);
    }, [reloadCapsules]);

    // Hardware back closes the composer sheet while it is open.
    useEffect(() => {
        if (!showForm) return;
        const handleBack = (e: Event) => { e.preventDefault(); setShowForm(false); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [showForm]);

    const profile = StorageService.getCoupleProfile();
    const isPremium = !!profile.isPremium;
    const canCreate = isPremium || capsules.length < FREE_CAPSULE_LIMIT;
    const sealInitial = (profile.myName?.trim()?.charAt(0) || '✦').toUpperCase();

    const groups = useMemo(() => {
        const ready: TimeCapsule[] = [];
        const sealed: TimeCapsule[] = [];
        const opened: TimeCapsule[] = [];
        for (const capsule of capsules) {
            const status = getStatus(capsule);
            if (status === 'ready') ready.push(capsule);
            else if (status === 'sealed') sealed.push(capsule);
            else opened.push(capsule);
        }
        const byUnlockAsc = (a: TimeCapsule, b: TimeCapsule) => new Date(a.unlockDate).getTime() - new Date(b.unlockDate).getTime();
        return {
            ready: [...ready].sort(byUnlockAsc),
            sealed: [...sealed].sort(byUnlockAsc),
            opened: [...opened].sort((a, b) => byUnlockAsc(b, a)),
        };
    }, [capsules, tick]);

    const openComposer = () => {
        if (canCreate) {
            setShowForm(true);
            feedback.tap();
        } else {
            setShowPremiumModal(true);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setImage(await compressImage(file));
        } catch {
            toast.show("Couldn't process photo.", 'error');
        } finally {
            e.target.value = '';
        }
    };

    const resetForm = () => {
        setTitle('');
        setMessage('');
        setUnlockDate('');
        setImage(null);
    };

    const handleSave = async () => {
        if (!title.trim() || !message.trim() || !unlockDate) return;
        if (!canCreate) {
            setShowPremiumModal(true);
            return;
        }

        setIsSaving(true);
        try {
            await StorageService.saveTimeCapsule({
                id: generateId(),
                senderId: StorageService.getDeviceId(),
                title: title.trim(),
                message: message.trim(),
                image: image || undefined,
                unlockDate: dateOnlyToLocalNoonIso(unlockDate),
                createdAt: new Date().toISOString(),
                isUnlocked: false,
            });
            setCapsules(StorageService.getTimeCapsules());
            resetForm();
            setShowForm(false);
            feedback.celebrate();
            toast.show('Letter sealed', 'success');
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : '';
            toast.show(msg || 'Could not seal letter', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCrack = useCallback(async (id: string) => {
        try {
            await StorageService.unlockTimeCapsule(id);
            setCapsules(StorageService.getTimeCapsules());
        } catch {
            toast.show('Could not open the letter', 'error');
        }
    }, []);

    const closeReader = useCallback(() => setReading(null), []);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        const id = deleteTarget;
        setDeleteTarget(null);
        setCapsules(prev => prev.filter(capsule => capsule.id !== id));
        try {
            await StorageService.deleteTimeCapsule(id);
            toast.show('Letter deleted', 'success');
        } catch {
            setCapsules(StorageService.getTimeCapsules());
            toast.show('Could not delete letter', 'error');
        }
    };

    const requestDelete = (id: string) => {
        feedback.tap();
        setDeleteTarget(id);
    };

    // Composer sheet pull-to-dismiss (pan pattern from PremiumModal —
    // attached to the grab zone so the form body can still scroll).
    const sheetY = useMotionValue(0);

    useEffect(() => {
        if (!showForm) sheetY.set(0);
    }, [showForm, sheetY]);

    const handlePan = useCallback((_: unknown, info: PanInfo) => {
        sheetY.set(info.offset.y > 0 ? info.offset.y : info.offset.y * 0.06);
    }, [sheetY]);

    const handlePanEnd = useCallback((_: unknown, info: PanInfo) => {
        if (info.offset.y > 130 || info.velocity.y > 700) {
            feedback.tap();
            setShowForm(false);
        } else {
            animate(sheetY, 0, { type: 'spring', stiffness: 420, damping: 34 });
        }
    }, [sheetY]);

    const minDate = new Date(Date.now() + DAY_MS).toISOString().split('T')[0];
    const isSaveDisabled = isSaving || !title.trim() || !message.trim() || !unlockDate;

    const fieldStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.055)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: GOLD.textHigh,
    };

    return (
        <GoldShell
            eyebrow="Future Letters"
            accent={ACCENT}
            rightSlot={
                <motion.button
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.08 }}
                    whileTap={{ scale: 0.86 }}
                    onClick={openComposer}
                    aria-label="Write a future letter"
                    className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ color: GOLD.light }}
                >
                    <Plus size={18} strokeWidth={2.4} />
                </motion.button>
            }
        >
            <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                {/* ── Hero ──────────────────────────────────────────── */}
                <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-6">
                    <div className="lp-emblem mb-5">
                        <div className="lp-orbit"><span className="lp-orbit__spark" /></div>
                        <WaxSeal initial="✦" size={64} />
                    </div>
                    <h1 className="font-serif text-[2rem] leading-[1.08]" style={{ letterSpacing: '-0.02em' }}>
                        <span style={{ color: GOLD.textHigh }}>Letters that wait</span>
                        <br />
                        <span className="lp-shimmer-text">for the right day</span>
                    </h1>
                    <p className="mt-3 max-w-[30ch] text-[13.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        Seal a note in wax and choose the morning it opens — not a day sooner.
                    </p>
                </motion.div>

                {/* ── Counts ────────────────────────────────────────── */}
                {capsules.length > 0 && (
                    <motion.div variants={goldRise} className="grid grid-cols-3 gap-2.5 mt-7">
                        {[
                            { label: 'Ready', value: groups.ready.length },
                            { label: 'Sealed', value: groups.sealed.length },
                            { label: 'Opened', value: groups.opened.length },
                        ].map((stat) => (
                            <div key={stat.label} className="lp-glass rounded-2xl px-3 py-3.5 text-center">
                                <span className="block font-serif text-[1.45rem] leading-none" style={{ color: GOLD.textHigh }}>
                                    {stat.value}
                                </span>
                                <span className="mt-1.5 block text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD.textLow }}>
                                    {stat.label}
                                </span>
                            </div>
                        ))}
                    </motion.div>
                )}

                {/* ── Empty state ───────────────────────────────────── */}
                {capsules.length === 0 && (
                    <motion.div
                        variants={goldRise}
                        className="relative overflow-hidden rounded-[1.6rem] mt-8 px-6 py-8 flex flex-col items-center text-center"
                        style={{ background: GOLD.cardBg, border: `1px solid ${ACCENT}33` }}
                    >
                        <div
                            className="lp-float absolute -top-14 -right-14 w-44 h-44 rounded-full blur-3xl pointer-events-none"
                            style={{ background: `radial-gradient(circle, ${ACCENT}2e 0%, transparent 70%)` }}
                        />
                        <div
                            className="relative z-10 flex w-12 h-12 items-center justify-center rounded-2xl mb-4"
                            style={{ background: `${ACCENT}1f`, border: `1px solid ${ACCENT}3d` }}
                        >
                            <Feather size={22} style={{ color: ACCENT }} />
                        </div>
                        <p className="relative z-10 font-serif text-[1.3rem] leading-tight" style={{ color: GOLD.textHigh }}>
                            Nothing waiting yet
                        </p>
                        <p className="relative z-10 mt-2 max-w-[30ch] text-[12.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                            Write to a future morning — your next anniversary, a hard week you can see coming, a promise you want to keep.
                        </p>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={openComposer}
                            className="lp-cta relative z-10 mt-5 h-[46px] px-6 rounded-xl font-bold text-[13.5px]"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                color: GOLD.inkOnGold,
                                boxShadow: '0 10px 28px rgba(246,199,104,0.26)',
                            }}
                        >
                            Write the first letter
                        </motion.button>
                    </motion.div>
                )}

                {/* ── Ready to open ─────────────────────────────────── */}
                {groups.ready.length > 0 && (
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="Ready to open" className="mt-9 mb-3" />
                    </motion.div>
                )}
                {groups.ready.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <AnimatePresence initial={false} mode="popLayout">
                            {groups.ready.map((capsule) => (
                                <SealedEnvelopeCard
                                    key={capsule.id}
                                    capsule={capsule}
                                    sealInitial={sealInitial}
                                    ready
                                    onTap={() => { feedback.tap(); setReading({ capsule, mode: 'ceremony' }); }}
                                    onDelete={() => requestDelete(capsule.id)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {/* ── Still sealed ──────────────────────────────────── */}
                {groups.sealed.length > 0 && (
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="Still sealed" className="mt-9 mb-3" />
                    </motion.div>
                )}
                {groups.sealed.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <AnimatePresence initial={false} mode="popLayout">
                            {groups.sealed.map((capsule) => (
                                <SealedEnvelopeCard
                                    key={capsule.id}
                                    capsule={capsule}
                                    sealInitial={sealInitial}
                                    ready={false}
                                    onTap={() => { feedback.tap(); toast.show(`Sealed until ${formatDate(capsule.unlockDate)}`, 'info'); }}
                                    onDelete={() => requestDelete(capsule.id)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {/* ── Opened letters ────────────────────────────────── */}
                {groups.opened.length > 0 && (
                    <motion.div variants={goldRise}>
                        <GoldSectionHeader label="Opened letters" className="mt-9 mb-3" />
                    </motion.div>
                )}
                {groups.opened.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                        <AnimatePresence initial={false} mode="popLayout">
                            {groups.opened.map((capsule) => (
                                <OpenedLetterCard
                                    key={capsule.id}
                                    capsule={capsule}
                                    onRead={() => { feedback.tap(); setReading({ capsule, mode: 'read' }); }}
                                    onDelete={() => requestDelete(capsule.id)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {/* ── Seal a new letter ─────────────────────────────── */}
                {capsules.length > 0 && (
                    <motion.div variants={goldRise} className="mt-8">
                        <GoldCTA onClick={openComposer}>Seal a new letter</GoldCTA>
                    </motion.div>
                )}

                {/* ── Free meter ────────────────────────────────────── */}
                {!isPremium && (
                    <motion.div
                        variants={goldRise}
                        className="rounded-[1.4rem] mt-5 px-4 py-4"
                        style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD.textLow }}>
                                Free letters
                            </span>
                            <span className="text-[11.5px] font-semibold" style={{ color: GOLD.textMid }}>
                                {capsules.length} of {FREE_CAPSULE_LIMIT} letters
                            </span>
                        </div>
                        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(4, Math.min(1, capsules.length / FREE_CAPSULE_LIMIT) * 100)}%` }}
                                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                                className="h-full rounded-full"
                                style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}cc)` }}
                            />
                        </div>
                        {capsules.length >= FREE_CAPSULE_LIMIT && (
                            <button
                                type="button"
                                onClick={() => { feedback.tap(); setShowPremiumModal(true); }}
                                className="mt-3 text-[11.5px] font-semibold active:scale-95 transition-transform"
                                style={{ color: GOLD.eyebrow }}
                            >
                                Gold removes the limit →
                            </button>
                        )}
                    </motion.div>
                )}

                {/* ── Footer ────────────────────────────────────────── */}
                <motion.div variants={goldRise} className="mt-10 flex items-center justify-center gap-2">
                    <Heart size={11} style={{ color: 'rgba(236,72,153,0.6)' }} fill="currentColor" strokeWidth={0} />
                    <span className="text-[11px]" style={{ color: GOLD.textLow }}>
                        Some words are worth the wait.
                    </span>
                </motion.div>
            </motion.div>

            {/* ── Composer sheet (portal + pan + hardware-back) ─────── */}
            {ReactDOM.createPortal(
                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            className="fixed inset-0 z-[200] flex items-end justify-center"
                            onClick={() => setShowForm(false)}
                        >
                            {/* Static 18px blur (opacity 1, never animated) so the
                                compositor resolves the full-viewport backdrop-filter
                                once instead of every frame of the open/close opacity
                                ramp; only the tint scrim fades. */}
                            <div className="absolute inset-0 pointer-events-none" style={{ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }} />
                            <motion.div
                                className="absolute inset-0 pointer-events-none"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0, transition: { duration: 0.22 } }}
                                style={{ backgroundColor: 'rgba(13,7,15,0.66)' }}
                            />
                            <motion.div
                                initial={{ y: '104%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '104%', transition: { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] } }}
                                transition={{ type: 'spring', stiffness: 400, damping: 41, mass: 1 }}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Write a future letter"
                                className="lp-stage relative w-full max-w-[440px] overflow-hidden"
                                style={{
                                    y: sheetY,
                                    borderRadius: '32px 32px 0 0',
                                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Ambient layers */}
                                <div className="lp-aurora">
                                    <div className="lp-aurora__blob lp-aurora__blob--gold" style={{ width: 300, height: 300, top: -120 }} />
                                    <div
                                        className="lp-aurora__blob lp-aurora__blob--violet"
                                        style={{ width: 280, height: 280, top: 160, background: `radial-gradient(circle, ${ACCENT}38 0%, transparent 65%)` }}
                                    />
                                </div>
                                <div className="lp-grain" />
                                <div className="absolute top-0 left-0 right-0 h-px z-10 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

                                {/* Grab zone — pan-to-dismiss lives here so the form scrolls */}
                                <motion.div
                                    onPan={handlePan}
                                    onPanEnd={handlePanEnd}
                                    className="relative z-10 px-6 pt-3 pb-2"
                                    style={{ touchAction: 'none' }}
                                >
                                    <div className="flex justify-center mb-4">
                                        <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,246,230,0.18)' }} />
                                    </div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                                        New letter
                                    </p>
                                    <h2 className="font-serif text-[1.5rem] mt-1 leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                        Seal something for later
                                    </h2>
                                </motion.div>

                                <div className="relative z-10 px-6 pb-8 pt-3 space-y-4 overflow-y-auto" style={{ maxHeight: '68vh' }}>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'rgba(246,199,104,0.55)' }}>
                                            Title
                                        </label>
                                        <input
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            placeholder="For the morning of our anniversary"
                                            className="w-full px-4 py-3.5 rounded-2xl text-[16px] outline-none placeholder:text-[rgba(255,246,230,0.28)]"
                                            style={fieldStyle}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'rgba(246,199,104,0.55)' }}>
                                            The letter
                                        </label>
                                        <textarea
                                            value={message}
                                            onChange={e => setMessage(e.target.value)}
                                            placeholder="Write to the two of you on the day this opens — what you hope for, what you promise, what you never want to forget."
                                            rows={6}
                                            className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none resize-none placeholder:text-[rgba(255,246,230,0.28)]"
                                            style={{ ...fieldStyle, lineHeight: '24px' }}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'rgba(246,199,104,0.55)' }}>
                                            Opens on
                                        </label>
                                        <input
                                            type="date"
                                            value={unlockDate}
                                            min={minDate}
                                            onChange={e => setUnlockDate(e.target.value)}
                                            className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                            style={{ ...fieldStyle, colorScheme: 'dark' }}
                                        />
                                    </div>

                                    {image ? (
                                        <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <img src={image} alt="" className="w-full h-40 object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => setImage(null)}
                                                className="absolute top-2 right-2 p-2 rounded-full active:scale-90 transition-transform"
                                                style={{ background: 'rgba(13,7,15,0.6)', color: 'rgba(255,246,230,0.9)' }}
                                                aria-label="Remove photo"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl text-left active:scale-[0.99] transition-transform"
                                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(245,158,11,0.3)', color: GOLD.textMid }}
                                        >
                                            <Camera size={16} style={{ color: 'rgba(246,199,104,0.7)' }} />
                                            <span className="text-[13.5px] font-semibold">Tuck in a photo</span>
                                            <span className="ml-auto text-[10.5px]" style={{ color: GOLD.textLow }}>optional</span>
                                        </button>
                                    )}
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

                                    <GoldCTA onClick={handleSave} disabled={isSaveDisabled}>
                                        {isSaving ? 'Sealing…' : 'Seal the letter'}
                                    </GoldCTA>
                                    <p className="text-center text-[11.5px]" style={{ color: GOLD.textLow }}>
                                        It stays sealed until the day arrives.
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ── Reader / unlock ceremony ──────────────────────────── */}
            {ReactDOM.createPortal(
                <AnimatePresence>
                    {reading && (
                        <LetterReader
                            key={reading.capsule.id}
                            capsule={reading.capsule}
                            mode={reading.mode}
                            sealInitial={sealInitial}
                            onCrack={handleCrack}
                            onClose={closeReader}
                        />
                    )}
                </AnimatePresence>,
                document.body
            )}

            <ConfirmModal
                isOpen={deleteTarget !== null}
                title="Delete future letter?"
                message="This removes the letter and its photo."
                confirmLabel="Delete Letter"
                cancelLabel="Keep Letter"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} featureContext="capsule" />
        </GoldShell>
    );
};

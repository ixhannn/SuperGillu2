import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Camera, Clock3, LockKeyhole, Plus, Trash2, Unlock, X } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal } from '../components/PremiumModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ViewState, TimeCapsule } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { compressImage } from '../utils/media';
import { useConfetti } from '../components/Layout';
import { useLiorMedia } from '../hooks/useLiorImage';

interface TimeCapsuleViewProps {
    setView: (view: ViewState) => void;
}

const FREE_CAPSULE_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type CapsuleStatus = 'sealed' | 'ready' | 'opened';

function getStatus(capsule: TimeCapsule): CapsuleStatus {
    if (capsule.isUnlocked) return 'opened';
    return new Date(capsule.unlockDate).getTime() <= Date.now() ? 'ready' : 'sealed';
}

function daysUntil(iso: string) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateOnlyToLocalNoonIso(value: string) {
    return new Date(`${value}T12:00:00`).toISOString();
}

function progressFor(capsule: TimeCapsule) {
    const start = new Date(capsule.createdAt).getTime();
    const end = new Date(capsule.unlockDate).getTime();
    if (end <= start) return 100;
    return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

const statusTone: Record<CapsuleStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    sealed: { label: 'Sealed', color: '#9a6a2f', bg: 'rgba(255,245,224,0.76)', icon: <LockKeyhole size={14} /> },
    ready: { label: 'Ready', color: '#b85d78', bg: 'rgba(255,232,238,0.76)', icon: <Unlock size={14} /> },
    opened: { label: 'Opened', color: '#467f74', bg: 'rgba(229,247,244,0.74)', icon: <Unlock size={14} /> },
};

const CapsuleCard: React.FC<{
    capsule: TimeCapsule;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
}> = ({ capsule, onOpen, onDelete }) => {
    const status = getStatus(capsule);
    const tone = statusTone[status];
    const { src: imageUrl, handleError } = useLiorMedia(capsule.imageId, capsule.image, capsule.storagePath);
    const progress = status === 'opened' ? 100 : progressFor(capsule);

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="rounded-[26px] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.78)', boxShadow: '0 14px 34px rgba(155,123,132,0.10)' }}
        >
            {imageUrl && (
                <div className="h-36 overflow-hidden bg-black/5">
                    <img
                        src={imageUrl}
                        alt=""
                        onError={handleError}
                        className="w-full h-full object-cover"
                        style={{ filter: status === 'opened' ? 'none' : 'blur(7px)', transform: status === 'opened' ? 'none' : 'scale(1.04)' }}
                    />
                </div>
            )}

            <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: tone.bg, color: tone.color }}>
                            {tone.icon}
                            {tone.label}
                        </span>
                        <h3 className="font-serif text-[21px] leading-tight font-bold mt-3" style={{ color: 'var(--color-text-primary)' }}>
                            {capsule.title}
                        </h3>
                    </div>
                    <button
                        type="button"
                        aria-label={`Delete ${capsule.title}`}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); onDelete(capsule.id); }}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform shrink-0"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#bf4d4d' }}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>

                {status === 'opened' ? (
                    <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>
                        {capsule.message}
                    </p>
                ) : (
                    <div className="mt-4">
                        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                            {status === 'ready' ? 'This letter can be opened now.' : 'The message stays hidden until the date arrives.'}
                        </p>
                        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(155,123,132,0.12)' }}>
                            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: status === 'ready' ? '#b85d78' : '#c49a5a' }} />
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 mt-5">
                    <span className="inline-flex items-center gap-2 text-[12px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                        <CalendarDays size={15} />
                        {formatDate(capsule.unlockDate)}
                    </span>

                    {status === 'ready' ? (
                        <button
                            type="button"
                            onClick={() => onOpen(capsule.id)}
                            className="px-4 py-2.5 rounded-full text-white text-[12px] font-bold active:scale-95 transition-transform"
                            style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 8px 22px rgba(196,104,126,0.22)' }}
                        >
                            Open
                        </button>
                    ) : status === 'sealed' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: '#9a6a2f' }}>
                            <Clock3 size={13} />
                            {daysUntil(capsule.unlockDate)} day{daysUntil(capsule.unlockDate) === 1 ? '' : 's'}
                        </span>
                    ) : null}
                </div>
            </div>
        </motion.article>
    );
};

export const TimeCapsuleView: React.FC<TimeCapsuleViewProps> = ({ setView }) => {
    const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [unlockDate, setUnlockDate] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const confetti = useConfetti();

    useEffect(() => {
        const load = () => setCapsules(StorageService.getTimeCapsules());
        load();
        storageEventTarget.addEventListener('storage-update', load);
        return () => storageEventTarget.removeEventListener('storage-update', load);
    }, []);

    const profile = StorageService.getCoupleProfile();
    const canCreate = !!profile.isPremium || capsules.length < FREE_CAPSULE_LIMIT;

    const sortedCapsules = useMemo(() => {
        const rank: Record<CapsuleStatus, number> = { ready: 0, sealed: 1, opened: 2 };
        return [...capsules].sort((a, b) => {
            const byStatus = rank[getStatus(a)] - rank[getStatus(b)];
            if (byStatus !== 0) return byStatus;
            return new Date(a.unlockDate).getTime() - new Date(b.unlockDate).getTime();
        });
    }, [capsules]);

    const counts = useMemo(() => capsules.reduce((acc, capsule) => {
        acc[getStatus(capsule)] += 1;
        return acc;
    }, { sealed: 0, ready: 0, opened: 0 } as Record<CapsuleStatus, number>), [capsules]);

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
        } catch (error: any) {
            toast.show(error?.message || 'Could not seal letter', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnlock = async (id: string) => {
        await StorageService.unlockTimeCapsule(id);
        setCapsules(StorageService.getTimeCapsules());
        feedback.celebrate();
        confetti.trigger();
    };

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

    const minDate = new Date(Date.now() + DAY_MS).toISOString().split('T')[0];
    const isSaveDisabled = isSaving || !title.trim() || !message.trim() || !unlockDate;

    return (
        <div className="min-h-screen px-5 pt-10 pb-36">
            <ViewHeader
                title="Future Letters"
                subtitle="Write now. Open later."
                onBack={() => setView('home')}
                variant="centered"
                rightSlot={
                    <button
                        type="button"
                        onClick={openComposer}
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white active:scale-95 transition-transform"
                        style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 8px 22px rgba(196,104,126,0.24)' }}
                        aria-label="Write future letter"
                    >
                        <Plus size={20} />
                    </button>
                }
            />

            <section className="rounded-[28px] p-5 mb-4" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.78)', boxShadow: '0 14px 34px rgba(155,123,132,0.10)' }}>
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>Private queue</p>
                        <h2 className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>
                            {counts.ready ? `${counts.ready} ready to open` : 'Letters for later'}
                        </h2>
                        <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Keep the note hidden until the day you choose.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openComposer}
                        className="shrink-0 rounded-2xl px-4 py-3 flex items-center gap-2 text-white text-[13px] font-bold active:scale-95 transition-transform"
                        style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 10px 24px rgba(196,104,126,0.22)' }}
                    >
                        <Plus size={17} />
                        Write
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 mt-5">
                    {[
                        ['Ready', counts.ready],
                        ['Sealed', counts.sealed],
                        ['Opened', counts.opened],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl px-3 py-3" style={{ background: 'rgba(255,248,249,0.74)', border: '1px solid rgba(196,104,126,0.10)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
                            <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
                        </div>
                    ))}
                </div>
            </section>

            <div className="space-y-3.5">
                <AnimatePresence mode="popLayout">
                    {sortedCapsules.length === 0 ? (
                        <motion.button
                            type="button"
                            key="empty"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            onClick={openComposer}
                            className="w-full rounded-[28px] p-6 text-left spring-press"
                            style={{ background: 'rgba(255,255,255,0.66)', border: '1px dashed rgba(196,104,126,0.24)' }}
                        >
                            <LockKeyhole size={24} style={{ color: 'var(--color-nav-active)' }} />
                            <p className="font-serif text-xl font-bold mt-4" style={{ color: 'var(--color-text-primary)' }}>No letters yet</p>
                            <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>Write a note and choose when it opens.</p>
                        </motion.button>
                    ) : sortedCapsules.map(capsule => (
                        <CapsuleCard
                            key={capsule.id}
                            capsule={capsule}
                            onOpen={handleUnlock}
                            onDelete={setDeleteTarget}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {!profile.isPremium && (
                <p className="text-center text-[12px] py-5" style={{ color: 'var(--color-text-secondary)' }}>
                    {capsules.length}/{FREE_CAPSULE_LIMIT} free future letters
                </p>
            )}

            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 backdrop-blur-sm p-4"
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ y: 120, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 80, opacity: 0 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="w-full max-w-md rounded-t-[28px] overflow-hidden"
                            style={{ background: 'var(--color-surface)', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -18px 48px rgba(45,31,37,0.18)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>New letter</p>
                                    <h2 className="font-serif text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Write for later</h2>
                                </div>
                                <button type="button" onClick={() => setShowForm(false)} aria-label="Close composer" className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90" style={{ background: 'rgba(155,123,132,0.10)', color: 'var(--color-text-secondary)' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="px-5 pb-6 space-y-4">
                                <input
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Title"
                                    className="w-full px-4 py-3.5 rounded-2xl text-[16px] outline-none"
                                    style={{ background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(155,123,132,0.14)', color: 'var(--color-text-primary)' }}
                                />

                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Letter"
                                    rows={7}
                                    className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none resize-none"
                                    style={{ background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(155,123,132,0.14)', color: 'var(--color-text-primary)', lineHeight: '24px' }}
                                />

                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>Opens on</label>
                                    <input
                                        type="date"
                                        value={unlockDate}
                                        min={minDate}
                                        onChange={e => setUnlockDate(e.target.value)}
                                        className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                        style={{ background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(155,123,132,0.14)', color: 'var(--color-text-primary)' }}
                                    />
                                </div>

                                {image ? (
                                    <div className="relative rounded-2xl overflow-hidden">
                                        <img src={image} alt="" className="w-full h-36 object-cover" />
                                        <button type="button" onClick={() => setImage(null)} className="absolute top-2 right-2 bg-black/45 text-white p-2 rounded-full active:scale-90" aria-label="Remove photo">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl w-full text-left active:scale-[0.99] transition-transform"
                                        style={{ background: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(155,123,132,0.22)', color: 'var(--color-text-secondary)' }}
                                    >
                                        <Camera size={17} />
                                        <span className="text-[14px] font-semibold">Add a photo</span>
                                    </button>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={isSaveDisabled}
                                    className="w-full py-4 rounded-2xl text-white font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                                    style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 10px 26px rgba(196,104,126,0.22)' }}
                                >
                                    {isSaving ? 'Sealing...' : 'Seal Letter'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        </div>
    );
};

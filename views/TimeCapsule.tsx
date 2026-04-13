import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, LockOpen, Plus, X, Camera, Sparkles, Trash2, Clock } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal } from '../components/PremiumModal';
import { ViewState, TimeCapsule } from '../types';
import { StorageService } from '../services/storage';
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

const CapsuleCard: React.FC<{ capsule: TimeCapsule; onUnlock: (id: string) => void; onDelete: (id: string) => void }> = ({ capsule, onUnlock, onDelete }) => {
    const [justUnlocked, setJustUnlocked] = useState(false);
    const { src: imageUrl } = useLiorMedia(capsule.imageId, capsule.image, capsule.storagePath);

    const canUnlock = !capsule.isUnlocked && new Date(capsule.unlockDate) <= new Date();
    const daysLeft = Math.ceil((new Date(capsule.unlockDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    const handleUnlock = () => {
        if (!canUnlock) return;
        setJustUnlocked(true);
        feedback.celebrate();
        setTimeout(() => onUnlock(capsule.id), 600);
    };

    if (capsule.isUnlocked) {
        return (
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-3xl overflow-hidden shadow-sm"
                style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)' }}
            >
                {imageUrl && (
                    <img src={imageUrl} alt="Capsule" className="w-full h-40 object-cover" />
                )}
                <div className="p-5">
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--color-lior-500-rgb),0.15)' }}>
                                <LockOpen size={12} className="text-lior-500" />
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Opened</span>
                        </div>
                        <button onClick={() => onDelete(capsule.id)} className="opacity-30 p-1 transition-opacity active:scale-90">
                            <Trash2 size={14} style={{ color: 'var(--color-text-primary)' }} />
                        </button>
                    </div>
                    <h3 className="text-[17px] font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>{capsule.title}</h3>
                    <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{capsule.message}</p>
                    <p className="text-[11px] mt-3" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                        Written {new Date(capsule.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            layout
            animate={justUnlocked ? { scale: [1, 1.04, 1], filter: ['blur(0px)', 'blur(2px)', 'blur(0px)'] } : {}}
            transition={{ duration: 0.5 }}
            className="rounded-3xl overflow-hidden cursor-pointer relative"
            style={{ background: 'linear-gradient(135deg, rgba(var(--theme-particle-1-rgb),0.08) 0%, rgba(var(--theme-particle-2-rgb),0.12) 100%)', border: '1.5px solid rgba(255,255,255,0.5)' }}
            onClick={canUnlock ? handleUnlock : undefined}
            whileTap={canUnlock ? { scale: 0.98 } : {}}
        >
            {/* Blur overlay for locked */}
            <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <motion.div
                            animate={canUnlock ? { rotate: [0, -5, 5, 0], scale: [1, 1.1, 1] } : {}}
                            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: canUnlock ? 'rgba(245,158,11,0.2)' : 'rgba(var(--theme-particle-2-rgb),0.1)' }}
                        >
                            <Lock size={14} style={{ color: canUnlock ? '#f59e0b' : 'var(--color-text-secondary)' }} />
                        </motion.div>
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: canUnlock ? '#f59e0b' : 'var(--color-text-secondary)' }}>
                            {canUnlock ? 'Ready to open!' : 'Sealed'}
                        </span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(capsule.id); }} className="opacity-30 p-1 transition-opacity active:scale-90">
                        <Trash2 size={14} style={{ color: 'var(--color-text-primary)' }} />
                    </button>
                </div>

                <h3 className="text-[17px] font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>{capsule.title}</h3>

                {/* Blurred message preview */}
                <p className="text-[14px] leading-relaxed select-none" style={{ color: 'var(--color-text-secondary)', filter: 'blur(5px)', userSelect: 'none' }}>
                    {capsule.message.slice(0, 80)}...
                </p>

                <div className="flex items-center gap-1.5 mt-4">
                    <Clock size={12} style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }} />
                    <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                        {canUnlock
                            ? 'Tap to reveal'
                            : `Opens in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} · ${new Date(capsule.unlockDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        }
                    </span>
                </div>
            </div>

            {canUnlock && (
                <motion.div
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 pointer-events-none rounded-3xl"
                    style={{ background: 'radial-gradient(circle at 50% 50%, rgba(245,158,11,0.08) 0%, transparent 70%)' }}
                />
            )}
        </motion.div>
    );
};

export const TimeCapsuleView: React.FC<TimeCapsuleViewProps> = ({ setView }) => {
    const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [unlockDate, setUnlockDate] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const confetti = useConfetti();

    useEffect(() => {
        const load = () => {
            const all = StorageService.getTimeCapsules();
            // Auto-unlock any capsules that are ready
            const now = new Date();
            all.forEach(c => {
                if (!c.isUnlocked && new Date(c.unlockDate) <= now) {
                    StorageService.unlockTimeCapsule(c.id);
                }
            });
            setCapsules(StorageService.getTimeCapsules());
        };
        load();
    }, []);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressed = await compressImage(file);
                setImage(compressed);
            } catch {
                toast.show("Couldn't process photo.", 'error');
            }
        }
    };

    const handleSave = async () => {
        if (!title.trim() || !message.trim() || !unlockDate) return;

        const profile = StorageService.getCoupleProfile();
        const freeUserAtLimit = !profile.isPremium && capsules.length >= FREE_CAPSULE_LIMIT;
        if (freeUserAtLimit) {
            setShowPremiumModal(true);
            return;
        }

        setIsSaving(true);

        const newCapsule: TimeCapsule = {
            id: generateId(),
            senderId: StorageService.getDeviceId(),
            title: title.trim(),
            message: message.trim(),
            image: image || undefined,
            unlockDate: new Date(unlockDate).toISOString(),
            createdAt: new Date().toISOString(),
            isUnlocked: false,
        };

        await StorageService.saveTimeCapsule(newCapsule);
        setCapsules(StorageService.getTimeCapsules());

        setTitle(''); setMessage(''); setUnlockDate(''); setImage(null);
        setShowForm(false);
        setIsSaving(false);
        feedback.celebrate();
        toast.show('Capsule sealed! ✉️', 'success');
    };

    const handleUnlock = async (id: string) => {
        await StorageService.unlockTimeCapsule(id);
        setCapsules(StorageService.getTimeCapsules());
        confetti.trigger();
        toast.show('Your capsule is open! 💌', 'success');
    };

    const handleDelete = async (id: string) => {
        await StorageService.deleteTimeCapsule(id);
        setCapsules(prev => prev.filter(c => c.id !== id));
    };

    const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const profile = StorageService.getCoupleProfile();
    const canCreate = profile.isPremium || capsules.length < FREE_CAPSULE_LIMIT;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full min-h-screen"
            style={{ background: 'transparent' }}
        >
            <ViewHeader
                title="Time Capsules"
                onBack={() => setView('home')}
                variant="centered"
                rightSlot={
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => { if (canCreate) { setShowForm(true); } else { setShowPremiumModal(true); } }}
                        className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm active:shadow-none"
                        style={{ background: 'var(--theme-nav-center-bg-active)' }}
                    >
                        <Plus size={20} className="text-white" />
                    </motion.button>
                }
            />

            <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto p-4 pb-32 space-y-4">
                <AnimatePresence mode="popLayout">
                    {capsules.length === 0 && (
                        <EmptyState
                            variant="timeCapsule"
                            onAction={() => setShowForm(true)}
                        />
                    )}
                    {capsules.map(capsule => (
                        <CapsuleCard
                            key={capsule.id}
                            capsule={capsule}
                            onUnlock={handleUnlock}
                            onDelete={handleDelete}
                        />
                    ))}
                </AnimatePresence>

                {!profile.isPremium && (
                    <p className="text-center text-[12px] py-2" style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }}>
                        {capsules.length}/{FREE_CAPSULE_LIMIT} free capsules used · Upgrade for unlimited
                    </p>
                )}
            </div>

            {/* Create Form Overlay */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.9 }}
                            className="w-full max-w-[440px] overflow-hidden"
                            style={{ borderRadius: '28px 28px 0 0', background: 'var(--theme-bg-main)', maxHeight: '88vh', overflowY: 'auto' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-6 pt-6 pb-4">
                                <h2 className="text-[18px] font-bold" style={{ color: 'var(--color-text-primary)' }}>Seal a Capsule</h2>
                                <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.1)' }}>
                                    <X size={16} style={{ color: 'var(--color-text-primary)' }} />
                                </button>
                            </div>

                            <div className="px-6 pb-8 space-y-4">
                                <input
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Give it a title..."
                                    className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                    style={{ background: 'rgba(255,255,255,0.6)', border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-primary)' }}
                                />

                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Write your letter..."
                                    rows={5}
                                    className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none resize-none leading-relaxed"
                                    style={{ background: 'rgba(255,255,255,0.6)', border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-primary)' }}
                                />

                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>Unlock Date</label>
                                    <input
                                        type="date"
                                        value={unlockDate}
                                        min={minDate}
                                        onChange={e => setUnlockDate(e.target.value)}
                                        className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                        style={{ background: 'rgba(255,255,255,0.6)', border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-primary)' }}
                                    />
                                </div>

                                {/* Photo */}
                                {image ? (
                                    <div className="relative rounded-2xl overflow-hidden">
                                        <img src={image} alt="Capsule" className="w-full h-32 object-cover" />
                                        <button onClick={() => setImage(null)} className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm text-white p-1.5 rounded-full active:scale-90">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl w-full text-left transition-all"
                                        style={{ background: 'rgba(255,255,255,0.4)', border: '1.5px dashed rgba(var(--theme-particle-2-rgb),0.15)' }}
                                    >
                                        <Camera size={18} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />
                                        <span className="text-[14px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>Add a photo (optional)</span>
                                    </button>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleSave}
                                    disabled={isSaving || !title.trim() || !message.trim() || !unlockDate}
                                    className="w-full py-4 rounded-2xl font-bold text-[15px] text-white disabled:opacity-30 shadow-sm active:shadow-none transition-all"
                                    style={{ background: 'var(--theme-nav-center-bg-active)' }}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Sparkles size={16} />
                                        <span>{isSaving ? 'Sealing...' : 'Seal the Capsule'}</span>
                                    </div>
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        </motion.div>
    );
};

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Camera, Trash2 } from 'lucide-react';
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

// ─── Wax Seal SVG ─────────────────────────────────────────────────────────────
const WaxSeal: React.FC<{ size?: number }> = ({ size = 72 }) => (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Drop shadow layer */}
        <circle cx="36" cy="38" r="30" fill="rgba(80,8,8,0.18)" />
        {/* Main wax body */}
        <circle cx="36" cy="36" r="30" fill="#b91c1c" />
        {/* Sheen — top-centre highlight via a lighter circle, no gradient ID needed */}
        <circle cx="36" cy="36" r="30" fill="rgba(239,68,68,0.30)" style={{ mixBlendMode: 'screen' }} />
        {/* Pressed rim */}
        <circle cx="36" cy="36" r="28.5" stroke="rgba(255,180,180,0.22)" strokeWidth="1.5" fill="none" />
        <circle cx="36" cy="36" r="25" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
        {/* Radiating texture lines */}
        {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => (
            <line key={deg}
                x1="36" y1="9" x2="36" y2="17"
                stroke="rgba(220,100,100,0.25)" strokeWidth="1.5" strokeLinecap="round"
                transform={`rotate(${deg} 36 36)`}
            />
        ))}
        {/* Heart emblem */}
        <path
            d="M36 47C36 47 21 38 21 28.5C21 23.5 24.8 20 29.5 20C32.8 20 35.3 21.9 36 22.8C36.7 21.9 39.2 20 42.5 20C47.2 20 51 23.5 51 28.5C51 38 36 47 36 47Z"
            fill="rgba(255,255,255,0.90)"
        />
        {/* Specular highlight */}
        <ellipse cx="26" cy="24" rx="7" ry="5" fill="rgba(255,255,255,0.12)" transform="rotate(-30 26 24)" />
    </svg>
);

// ─── Opened / Parchment Letter ─────────────────────────────────────────────
const OpenedLetter: React.FC<{
    capsule: TimeCapsule;
    imageUrl?: string | null;
    onDelete: (id: string) => void;
    justOpened?: boolean;
}> = ({ capsule, imageUrl, onDelete, justOpened = false }) => (
    <motion.div
        layout
        initial={justOpened ? { opacity: 0, y: 12 } : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: justOpened ? 0.5 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{
            background: 'linear-gradient(160deg, #fdf6e8 0%, #f5e8cc 60%, #eddcb8 100%)',
            borderRadius: 20,
            border: '1px solid rgba(180,140,80,0.28)',
            boxShadow: '0 8px 32px rgba(100,55,10,0.14), 0 2px 8px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.7)',
            overflow: 'hidden',
        }}
    >
        {/* Decorative header bar */}
        <div style={{
            height: 4,
            background: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 40%, #dc2626 100%)',
            opacity: 0.7,
        }} />

        {imageUrl && (
            <img src={imageUrl} alt="" className="w-full h-44 object-cover" />
        )}

        <div className="px-6 pt-5 pb-6">
            {/* Title + delete */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1"
                        style={{ color: '#b45309', opacity: 0.7 }}>Opened Letter</p>
                    <h3 style={{
                        fontFamily: "Georgia, 'Palatino Linotype', serif",
                        fontSize: 20,
                        fontWeight: 600,
                        color: '#3d2008',
                        lineHeight: 1.3,
                    }}>{capsule.title}</h3>
                </div>
                <button onClick={() => onDelete(capsule.id)}
                    className="mt-1 opacity-25 active:opacity-60 active:scale-90 transition-all p-1">
                    <Trash2 size={14} color="#3d2008" />
                </button>
            </div>

            {/* Ruled lines background for message */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
                {/* Subtle ruled lines */}
                {Array.from({ length: Math.ceil(capsule.message.length / 42) + 2 }).map((_, i) => (
                    <div key={i} style={{
                        position: 'absolute',
                        left: 0, right: 0,
                        top: 24 + i * 26,
                        height: 1,
                        background: 'rgba(180,140,80,0.15)',
                        pointerEvents: 'none',
                    }} />
                ))}
                <p style={{
                    fontFamily: "Georgia, 'Palatino Linotype', serif",
                    fontSize: 15,
                    lineHeight: '26px',
                    color: '#3d2008',
                    position: 'relative',
                    paddingTop: 2,
                }}>
                    {capsule.message}
                </p>
            </div>

            {/* Footer */}
            <div style={{
                borderTop: '1px solid rgba(180,140,80,0.2)',
                paddingTop: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <span style={{ fontSize: 11, color: '#92400e', opacity: 0.6, fontStyle: 'italic' }}>
                    Written {new Date(capsule.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                <span style={{ fontSize: 11, color: '#dc2626', opacity: 0.5 }}>❤</span>
            </div>
        </div>
    </motion.div>
);

// ─── Sealed Envelope Card ──────────────────────────────────────────────────
type OpenStage = 'sealed' | 'cracking' | 'opened';

const LetterCard: React.FC<{
    capsule: TimeCapsule;
    onUnlock: (id: string) => void;
    onDelete: (id: string) => void;
}> = ({ capsule, onUnlock, onDelete }) => {
    const [stage, setStage] = useState<OpenStage>(capsule.isUnlocked ? 'opened' : 'sealed');
    const [justOpened, setJustOpened] = useState(false);
    const { src: imageUrl } = useLiorMedia(capsule.imageId, capsule.image, capsule.storagePath);

    const canUnlock = !capsule.isUnlocked && new Date(capsule.unlockDate) <= new Date();
    const daysLeft = Math.ceil((new Date(capsule.unlockDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    const handleTap = () => {
        if (!canUnlock || stage !== 'sealed') return;
        feedback.celebrate();
        setStage('cracking');
        // Persist after animation starts
        setTimeout(() => {
            onUnlock(capsule.id);
            setJustOpened(true);
            setStage('opened');
        }, 950);
    };

    if (stage === 'opened') {
        return <OpenedLetter capsule={capsule} imageUrl={imageUrl} onDelete={onDelete} justOpened={justOpened} />;
    }

    return (
        <motion.div
            layout
            onClick={handleTap}
            style={{
                borderRadius: 20,
                overflow: 'hidden',
                cursor: canUnlock ? 'pointer' : 'default',
                userSelect: 'none',
                boxShadow: canUnlock
                    ? '0 12px 40px rgba(185,28,28,0.20), 0 4px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.65)'
                    : '0 6px 24px rgba(100,55,10,0.12), 0 2px 8px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.55)',
            }}
            whileTap={canUnlock ? { scale: 0.97 } : {}}
        >
            {/* ── Envelope Flap ── */}
            <div style={{ position: 'relative', height: 88, overflow: 'hidden' }}>
                {/* Flap face */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(165deg, #f0e0c0 0%, #e4cfa0 100%)',
                }} />
                {/* Left fold crease */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to bottom right, transparent 49.5%, rgba(150,110,50,0.14) 50%, transparent 55%)',
                }} />
                {/* Right fold crease */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to bottom left, transparent 49.5%, rgba(150,110,50,0.14) 50%, transparent 55%)',
                }} />
                {/* Fold shadow line */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 1,
                    background: 'rgba(140,100,40,0.22)',
                }} />
            </div>

            {/* ── Envelope Body ── */}
            <div style={{
                background: 'linear-gradient(175deg, #faf3e4 0%, #f2e4c8 100%)',
                position: 'relative',
            }}>
                {/* Wax seal — overlaps flap line */}
                <div style={{
                    position: 'absolute',
                    top: -36,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10,
                    lineHeight: 0,
                }}>
                    <motion.div
                        animate={stage === 'cracking' ? {
                            scale: [1, 1.18, 1.05, 0],
                            rotate: [0, -12, 8, 25],
                            opacity: [1, 1, 0.7, 0],
                        } : canUnlock ? {
                            scale: [1, 1.04, 1],
                            filter: ['drop-shadow(0 0 0px rgba(220,38,38,0))', 'drop-shadow(0 0 8px rgba(220,38,38,0.5))', 'drop-shadow(0 0 0px rgba(220,38,38,0))'],
                        } : {}}
                        transition={stage === 'cracking'
                            ? { duration: 0.65, ease: 'easeIn' }
                            : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                        }
                    >
                        <WaxSeal size={72} />
                    </motion.div>
                </div>

                {/* Letter body */}
                <div className="px-5 pb-5" style={{ paddingTop: 46 }}>
                    {/* Status tag */}
                    <div className="flex justify-center mb-3">
                        <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: canUnlock ? '#dc2626' : '#92400e',
                            opacity: canUnlock ? 1 : 0.55,
                            background: canUnlock ? 'rgba(220,38,38,0.08)' : 'rgba(146,64,14,0.07)',
                            padding: '3px 10px',
                            borderRadius: 20,
                            border: `1px solid ${canUnlock ? 'rgba(220,38,38,0.15)' : 'rgba(146,64,14,0.1)'}`,
                        }}>
                            {canUnlock ? '✦ Ready to Open' : 'Sealed'}
                        </span>
                    </div>

                    {/* Title */}
                    <h3 style={{
                        fontFamily: "Georgia, 'Palatino Linotype', serif",
                        fontSize: 18,
                        fontWeight: 600,
                        color: '#3d2008',
                        textAlign: 'center',
                        marginBottom: 8,
                        lineHeight: 1.35,
                    }}>{capsule.title}</h3>

                    {/* Blurred preview */}
                    <p style={{
                        fontSize: 13,
                        color: '#6b3a1f',
                        textAlign: 'center',
                        filter: 'blur(5px)',
                        userSelect: 'none',
                        lineHeight: 1.6,
                        opacity: 0.7,
                        marginBottom: 14,
                        fontFamily: "Georgia, 'Palatino Linotype', serif",
                    }}>
                        {capsule.message.slice(0, 60)}{'...'}
                    </p>

                    {/* Divider */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 12,
                    }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(140,100,40,0.18)' }} />
                        <span style={{ color: '#b45309', opacity: 0.4, fontSize: 10 }}>❤</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(140,100,40,0.18)' }} />
                    </div>

                    {/* Date info */}
                    <p style={{
                        textAlign: 'center',
                        fontSize: 12,
                        color: '#92400e',
                        opacity: 0.65,
                        fontStyle: 'italic',
                    }}>
                        {canUnlock
                            ? 'Tap the seal to break it open'
                            : `Opens in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} · ${new Date(capsule.unlockDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        }
                    </p>

                    {/* Delete button */}
                    <div className="flex justify-end mt-3">
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(capsule.id); }}
                            className="opacity-20 active:opacity-50 active:scale-90 transition-all p-1"
                        >
                            <Trash2 size={13} color="#3d2008" />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

// ─── Main View ──────────────────────────────────────────────────────────────
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
        const all = StorageService.getTimeCapsules();
        const now = new Date();
        all.forEach(c => {
            if (!c.isUnlocked && new Date(c.unlockDate) <= now) {
                StorageService.unlockTimeCapsule(c.id);
            }
        });
        setCapsules(StorageService.getTimeCapsules());
    }, []);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setImage(await compressImage(file));
        } catch {
            toast.show("Couldn't process photo.", 'error');
        }
    };

    const handleSave = async () => {
        if (!title.trim() || !message.trim() || !unlockDate) return;
        const profile = StorageService.getCoupleProfile();
        if (!profile.isPremium && capsules.length >= FREE_CAPSULE_LIMIT) {
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
        toast.show('Letter sealed 🔴', 'success');
    };

    const handleUnlock = async (id: string) => {
        await StorageService.unlockTimeCapsule(id);
        setCapsules(StorageService.getTimeCapsules());
        confetti.trigger();
    };

    const handleDelete = async (id: string) => {
        await StorageService.deleteTimeCapsule(id);
        setCapsules(prev => prev.filter(c => c.id !== id));
    };

    const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const profile = StorageService.getCoupleProfile();
    const canCreate = profile.isPremium || capsules.length < FREE_CAPSULE_LIMIT;

    return (
        <div className="flex flex-col min-h-screen">
            <ViewHeader
                title="Sealed Letters"
                onBack={() => setView('home')}
                variant="centered"
                rightSlot={
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => canCreate ? setShowForm(true) : setShowPremiumModal(true)}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: '#b91c1c', boxShadow: '0 4px 14px rgba(185,28,28,0.35)' }}
                    >
                        <Plus size={20} className="text-white" />
                    </motion.button>
                }
            />

            <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-4 pb-32 space-y-4 pt-2">
                <AnimatePresence mode="popLayout">
                    {capsules.length === 0 && (
                        <EmptyState variant="timeCapsule" onAction={() => setShowForm(true)} />
                    )}
                    {capsules.map(capsule => (
                        <LetterCard
                            key={capsule.id}
                            capsule={capsule}
                            onUnlock={handleUnlock}
                            onDelete={handleDelete}
                        />
                    ))}
                </AnimatePresence>

                {!profile.isPremium && (
                    <p className="text-center text-[12px] py-2" style={{ color: '#92400e', opacity: 0.4 }}>
                        {capsules.length}/{FREE_CAPSULE_LIMIT} free letters · Upgrade for unlimited
                    </p>
                )}
            </div>

            {/* ── Compose Sheet ── */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end justify-center"
                        style={{ backgroundColor: 'rgba(30,10,0,0.55)', backdropFilter: 'blur(14px)' }}
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ y: 120, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 80, opacity: 0 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.9 }}
                            className="w-full max-w-[440px] overflow-hidden"
                            style={{
                                borderRadius: '28px 28px 0 0',
                                background: 'linear-gradient(175deg, #fdf6e8 0%, #f2e4c8 100%)',
                                maxHeight: '90vh',
                                overflowY: 'auto',
                                boxShadow: '0 -8px 40px rgba(80,30,0,0.25)',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Red header stripe */}
                            <div style={{ height: 3, background: 'linear-gradient(90deg, #dc2626, #b91c1c, #dc2626)' }} />

                            <div className="flex items-center justify-between px-6 pt-5 pb-4">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: '#b45309', opacity: 0.6 }}>New Letter</p>
                                    <h2 style={{
                                        fontFamily: "Georgia, 'Palatino Linotype', serif",
                                        fontSize: 20,
                                        color: '#3d2008',
                                        fontWeight: 600,
                                    }}>Write & Seal</h2>
                                </div>
                                <button onClick={() => setShowForm(false)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                                    style={{ background: 'rgba(140,100,40,0.12)' }}>
                                    <X size={16} color="#3d2008" />
                                </button>
                            </div>

                            <div className="px-6 pb-8 space-y-4">
                                <input
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="A title for this letter..."
                                    className="w-full px-4 py-3.5 rounded-2xl text-[16px] outline-none"
                                    style={{
                                        background: 'rgba(255,255,255,0.55)',
                                        border: '1.5px solid rgba(140,100,40,0.2)',
                                        color: '#3d2008',
                                        fontFamily: "Georgia, 'Palatino Linotype', serif",
                                    }}
                                />

                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Write your letter here..."
                                    rows={7}
                                    className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none resize-none"
                                    style={{
                                        background: 'rgba(255,255,255,0.55)',
                                        border: '1.5px solid rgba(140,100,40,0.2)',
                                        color: '#3d2008',
                                        lineHeight: '26px',
                                        fontFamily: "Georgia, 'Palatino Linotype', serif",
                                    }}
                                />

                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: '#92400e', opacity: 0.65 }}>
                                        Seal Until
                                    </label>
                                    <input
                                        type="date"
                                        value={unlockDate}
                                        min={minDate}
                                        onChange={e => setUnlockDate(e.target.value)}
                                        className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                        style={{
                                            background: 'rgba(255,255,255,0.55)',
                                            border: '1.5px solid rgba(140,100,40,0.2)',
                                            color: '#3d2008',
                                        }}
                                    />
                                </div>

                                {image ? (
                                    <div className="relative rounded-2xl overflow-hidden">
                                        <img src={image} alt="" className="w-full h-32 object-cover" />
                                        <button onClick={() => setImage(null)}
                                            className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm text-white p-1.5 rounded-full active:scale-90">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl w-full text-left"
                                        style={{
                                            background: 'rgba(255,255,255,0.35)',
                                            border: '1.5px dashed rgba(140,100,40,0.22)',
                                        }}
                                    >
                                        <Camera size={17} color="#92400e" style={{ opacity: 0.5 }} />
                                        <span className="text-[14px]" style={{ color: '#92400e', opacity: 0.55, fontStyle: 'italic' }}>
                                            Enclose a photo (optional)
                                        </span>
                                    </button>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

                                {/* Seal button */}
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={handleSave}
                                    disabled={isSaving || !title.trim() || !message.trim() || !unlockDate}
                                    className="w-full py-4 rounded-2xl font-bold text-[15px] text-white disabled:opacity-30"
                                    style={{
                                        background: isSaving ? '#b91c1c' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                                        boxShadow: '0 6px 20px rgba(185,28,28,0.38), inset 0 1px 0 rgba(255,255,255,0.2)',
                                        fontFamily: "Georgia, 'Palatino Linotype', serif",
                                        letterSpacing: '0.03em',
                                    }}
                                >
                                    {isSaving ? 'Sealing...' : '🔴  Press the Seal'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        </div>
    );
};

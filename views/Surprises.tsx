import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Plus, X, Calendar, Sparkles, Clock, Check, Trash2 } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal } from '../components/PremiumModal';
import { ViewState, Surprise } from '../types';
import { StorageService } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { useConfetti } from '../components/Layout';

interface SurprisesViewProps {
    setView: (view: ViewState) => void;
}

const FREE_SURPRISE_LIMIT = 3;

const EMOJIS = ['🎁', '💌', '🌹', '🎉', '🍰', '⭐', '🌟', '💝', '🤗', '🥰'];

const SurpriseReveal: React.FC<{ surprise: Surprise; onClose: () => void }> = ({ surprise, onClose }) => {
    const confetti = useConfetti();
    useEffect(() => {
        setTimeout(() => confetti.trigger(), 300);
        feedback.celebrate();
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(21,12,16,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
            <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 22, stiffness: 280, delay: 0.1 }}
                className="w-full max-w-[360px] text-center"
            >
                {/* Glow ring */}
                <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(var(--theme-particle-1-rgb),0.4) 0%, transparent 70%)' }}
                />

                <motion.div
                    animate={{ rotate: [0, -8, 8, -4, 0], y: [0, -8, 0] }}
                    transition={{ duration: 1.2, delay: 0.3 }}
                    className="text-8xl mb-6 relative z-10"
                >
                    {surprise.emoji || '🎁'}
                </motion.div>

                <div className="relative z-10 rounded-3xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <h2 className="font-serif text-[24px] font-bold mb-3" style={{ color: '#fde68a' }}>{surprise.title}</h2>
                    <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{surprise.message}</p>
                </div>

                <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={onClose}
                    className="w-full py-4 rounded-2xl font-bold text-[15px] relative z-10 shadow-lg"
                    style={{ background: 'linear-gradient(135deg, rgba(var(--theme-particle-1-rgb),1) 0%, rgba(var(--theme-particle-2-rgb),1) 100%)', color: 'white' }}
                >
                    <div className="flex items-center justify-center gap-2">
                        <Check size={18} />
                        <span>Received with love 💗</span>
                    </div>
                </motion.button>
            </motion.div>
        </motion.div>
    );
};

export const SurprisesView: React.FC<SurprisesViewProps> = ({ setView }) => {
    const [surprises, setSurprises] = useState<Surprise[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [activeSurprise, setActiveSurprise] = useState<Surprise | null>(null);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('🎁');
    const [isSaving, setIsSaving] = useState(false);

    const loadAndCheck = useCallback(() => {
        const all = StorageService.getSurprises();
        const now = new Date();
        // Find first undelivered due surprise to reveal
        const due = all.find(s => !s.delivered && new Date(s.scheduledFor) <= now);
        if (due) {
            StorageService.markSurpriseDelivered(due.id);
            setActiveSurprise(due);
        }
        setSurprises(StorageService.getSurprises());
    }, []);

    useEffect(() => { loadAndCheck(); }, [loadAndCheck]);

    const handleSave = async () => {
        if (!title.trim() || !message.trim() || !scheduledFor) return;

        const profile = StorageService.getCoupleProfile();
        const pending = surprises.filter(s => !s.delivered);
        if (!profile.isPremium && pending.length >= FREE_SURPRISE_LIMIT) {
            setShowPremiumModal(true);
            return;
        }

        setIsSaving(true);

        const newSurprise: Surprise = {
            id: generateId(),
            senderId: StorageService.getDeviceId(),
            title: title.trim(),
            message: message.trim(),
            emoji: selectedEmoji,
            scheduledFor: new Date(scheduledFor).toISOString(),
            createdAt: new Date().toISOString(),
            delivered: false,
        };

        await StorageService.saveSurprise(newSurprise);
        setSurprises(StorageService.getSurprises());

        setTitle(''); setMessage(''); setScheduledFor(''); setSelectedEmoji('🎁');
        setShowForm(false);
        setIsSaving(false);
        feedback.tap();
        toast.show('Surprise scheduled! 🎉', 'success');
    };

    const handleDelete = async (id: string) => {
        await StorageService.deleteSurprise(id);
        setSurprises(prev => prev.filter(s => s.id !== id));
    };

    const upcoming = surprises.filter(s => !s.delivered);
    const delivered = surprises.filter(s => s.delivered);
    const profile = StorageService.getCoupleProfile();
    const canCreate = profile.isPremium || upcoming.length < FREE_SURPRISE_LIMIT;

    const minDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full min-h-screen"
            style={{ background: 'transparent' }}
        >
            <ViewHeader
                title="Surprises"
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

            <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto p-4 pb-32 space-y-6">
                {surprises.length === 0 && (
                    <EmptyState
                        variant="surprises"
                        onAction={() => setShowForm(true)}
                    />
                )}

                {upcoming.length > 0 && (
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-1" style={{ color: 'var(--color-text-secondary)' }}>Scheduled</p>
                        <div className="space-y-3">
                            {upcoming.map(s => (
                                <motion.div
                                    key={s.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="rounded-3xl p-5 flex items-start gap-4"
                                    style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)' }}
                                >
                                    <div className="text-3xl flex-shrink-0">{s.emoji || '🎁'}</div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-[16px] font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{s.title}</h3>
                                        <p className="text-[13px] mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{s.message}</p>
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <Calendar size={11} style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }} />
                                            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                                                {new Date(s.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(s.id)} className="opacity-30 p-1 flex-shrink-0 transition-opacity active:scale-90">
                                        <Trash2 size={14} style={{ color: 'var(--color-text-primary)' }} />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {delivered.length > 0 && (
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-1" style={{ color: 'var(--color-text-secondary)' }}>Delivered</p>
                        <div className="space-y-3">
                            {delivered.map(s => (
                                <motion.div
                                    key={s.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="rounded-3xl p-5 flex items-start gap-4 opacity-60"
                                    style={{ background: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.5)' }}
                                >
                                    <div className="text-3xl flex-shrink-0">{s.emoji || '🎁'}</div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-[15px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{s.title}</h3>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Check size={11} className="text-green-500" />
                                            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                                                Delivered {new Date(s.deliveredAt || s.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(s.id)} className="opacity-40 p-1 flex-shrink-0 transition-opacity active:scale-90">
                                        <Trash2 size={14} style={{ color: 'var(--color-text-primary)' }} />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    </div>
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
                                <h2 className="text-[18px] font-bold" style={{ color: 'var(--color-text-primary)' }}>Plan a Surprise</h2>
                                <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.1)' }}>
                                    <X size={16} style={{ color: 'var(--color-text-primary)' }} />
                                </button>
                            </div>

                            <div className="px-6 pb-8 space-y-4">
                                {/* Emoji picker */}
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>Pick an Emoji</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {EMOJIS.map(em => (
                                            <motion.button
                                                key={em}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => setSelectedEmoji(em)}
                                                className="w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all"
                                                style={{
                                                    background: selectedEmoji === em ? 'rgba(var(--theme-particle-1-rgb),0.15)' : 'rgba(255,255,255,0.5)',
                                                    border: selectedEmoji === em ? '2px solid rgba(var(--theme-particle-1-rgb),0.5)' : '1.5px solid rgba(255,255,255,0.6)',
                                                }}
                                            >
                                                {em}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                <input
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Surprise title..."
                                    className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                    style={{ background: 'rgba(255,255,255,0.6)', border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-primary)' }}
                                />

                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Your message..."
                                    rows={4}
                                    className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none resize-none leading-relaxed"
                                    style={{ background: 'rgba(255,255,255,0.6)', border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-primary)' }}
                                />

                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>Deliver At</label>
                                    <input
                                        type="datetime-local"
                                        value={scheduledFor}
                                        min={minDateTime}
                                        onChange={e => setScheduledFor(e.target.value)}
                                        className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                        style={{ background: 'rgba(255,255,255,0.6)', border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-primary)' }}
                                    />
                                </div>

                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleSave}
                                    disabled={isSaving || !title.trim() || !message.trim() || !scheduledFor}
                                    className="w-full py-4 rounded-2xl font-bold text-[15px] text-white disabled:opacity-30 shadow-sm transition-all"
                                    style={{ background: 'var(--theme-nav-center-bg-active)' }}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Sparkles size={16} />
                                        <span>{isSaving ? 'Scheduling...' : 'Schedule Surprise'}</span>
                                    </div>
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Reveal Overlay */}
            <AnimatePresence>
                {activeSurprise && (
                    <SurpriseReveal
                        surprise={activeSurprise}
                        onClose={() => { setActiveSurprise(null); setSurprises(StorageService.getSurprises()); }}
                    />
                )}
            </AnimatePresence>

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        </motion.div>
    );
};

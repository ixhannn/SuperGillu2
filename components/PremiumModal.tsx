import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Video, Sparkles, Check, Gift, Mic, Lock, Heart } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { StorageService } from '../services/storage';

interface PremiumModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const FEATURES = [
    { icon: Gift, label: 'Surprises', desc: 'Unlimited scheduled surprises for each other' },
    { icon: Lock, label: 'Time Capsule', desc: 'Unlimited date-locked sealed letters' },
    { icon: Mic, label: 'Voice Notes', desc: 'Unlimited heartfelt voice recordings' },
    { icon: Sparkles, label: 'Year in Review', desc: 'Your love story, beautifully retold' },
    { icon: Video, label: 'Video Memories', desc: 'Add videos to your timeline & keepsakes' },
];

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose }) => {
    React.useEffect(() => {
        if (!isOpen) return;
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [isOpen, onClose]);

    const handleUpgrade = () => {
        const profile = StorageService.getCoupleProfile();
        StorageService.saveCoupleProfile({ ...profile, isPremium: true });
        feedback.celebrate();
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && ReactDOM.createPortal(
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-end justify-center p-4 pb-8"
                    style={{ backgroundColor: 'rgba(21,12,16,0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 340, mass: 0.9 }}
                        className="w-full max-w-[390px] overflow-hidden"
                        style={{ borderRadius: 'var(--radius-xl)', background: 'linear-gradient(160deg, #150a14 0%, #2a1130 55%, #150a14 100%)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Gold shimmer top bar */}
                        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />

                        {/* Hero section */}
                        <div className="relative px-7 pt-8 pb-5 text-center">
                            {/* Background glow */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-32 rounded-full opacity-20 blur-3xl pointer-events-none"
                                style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }} />

                            <motion.div
                                initial={{ scale: 0, rotate: -20 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: 'spring', delay: 0.06, damping: 16, stiffness: 260 }}
                                className="relative inline-flex items-center justify-center w-16 h-16 mb-4 rounded-[18px]"
                                style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.3) 100%)', border: '1px solid rgba(245,158,11,0.35)' }}
                            >
                                <Crown size={30} className="text-amber-400" strokeWidth={1.8} />
                                <motion.div
                                    className="absolute -top-1 -right-1"
                                    animate={{ scale: [1, 1.4, 1], rotate: [0, 18, 0] }}
                                    transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2 }}
                                >
                                    <Sparkles size={14} className="text-amber-300" />
                                </motion.div>
                            </motion.div>

                            <h2 className="font-serif font-bold text-[24px] leading-tight mb-2" style={{ color: '#fde68a' }}>
                                Upgrade to Premium
                            </h2>
                            <p className="text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                Unlock everything — unlimited surprises, capsules, voice notes & more.
                            </p>
                        </div>

                        {/* Feature list */}
                        <div className="px-6 pb-5 flex flex-col gap-2.5">
                            {FEATURES.map((feat, i) => {
                                const Icon = feat.icon;
                                return (
                                    <motion.div
                                        key={feat.label}
                                        initial={{ opacity: 0, x: -14 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.1 + i * 0.06 }}
                                        className="flex items-center gap-3.5 px-4 py-3 rounded-2xl"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                                    >
                                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl"
                                            style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.25)' }}>
                                            <Icon size={15} className="text-amber-400" strokeWidth={1.8} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold leading-tight" style={{ color: 'rgba(255,255,255,0.85)' }}>{feat.label}</p>
                                            <p className="text-[11px] leading-tight mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{feat.desc}</p>
                                        </div>
                                        <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full"
                                            style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.3)' }}>
                                            <Check size={10} className="text-amber-400" strokeWidth={2.5} />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Love note */}
                        <div className="mx-6 mb-5 flex items-center gap-3 px-4 py-3 rounded-2xl"
                            style={{ background: 'rgba(236,72,153,0.07)', border: '1px solid rgba(236,72,153,0.12)' }}>
                            <Heart size={14} className="text-pink-400 shrink-0" fill="currentColor" strokeWidth={0} />
                            <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                Built for the two of you. Always.
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="px-6 pb-8 flex flex-col gap-2.5">
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={handleUpgrade}
                                className="w-full py-4 rounded-2xl font-bold text-[15px] tracking-wide transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    color: '#1a0a10',
                                    boxShadow: '0 8px 28px rgba(245,158,11,0.35)',
                                }}
                            >
                                Unlock Premium — Free
                            </motion.button>
                            <button
                                onClick={() => { feedback.tap(); onClose(); }}
                                className="w-full py-3.5 rounded-2xl font-medium text-[14px] active:scale-95 transition-all"
                                style={{ color: 'rgba(255,255,255,0.35)' }}
                            >
                                Maybe Later
                            </button>
                        </div>

                        {/* Bottom shimmer */}
                        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-amber-400/25 to-transparent" />
                    </motion.div>
                </motion.div>,
                document.body
            )}
        </AnimatePresence>
    );
};

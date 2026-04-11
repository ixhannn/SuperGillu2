import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { feedback } from '../utils/feedback';

interface ConfirmModalProps {
    isOpen: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel
}) => {
    React.useEffect(() => {
        if (!isOpen) return;
        const handleBack = (e: Event) => {
            e.preventDefault(); // Stop App.tsx from popping route
            onCancel();
        };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [isOpen, onCancel]);

    return (
        <AnimatePresence>
            {isOpen && ReactDOM.createPortal(
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center p-8"
                    style={{ backgroundColor: 'rgba(21,12,16,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 1.02, opacity: 0, y: 8 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 380, mass: 0.8 }}
                        className="bg-white/95 w-full max-w-[340px] p-8 shadow-float relative overflow-hidden"
                        style={{ borderRadius: 'var(--radius-xl)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Subtle top decoration */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-lior-500/20 to-transparent opacity-40" />

                        <div className="flex flex-col items-center text-center mb-6">
                            {variant === 'danger' && (
                                <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', delay: 0.1 }}
                                    className="p-3.5 bg-red-50 text-red-500 rounded-2xl mb-4"
                                >
                                    <AlertTriangle size={24} strokeWidth={2} />
                                </motion.div>
                            )}
                            <h3 className="font-serif font-bold text-xl leading-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
                        </div>

                        <p className="text-center text-[15px] leading-relaxed mb-8 px-2" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>

                        <div className="flex flex-col gap-2.5">
                            <button
                                onClick={() => { variant === 'danger' ? feedback.error() : feedback.tap(); onConfirm(); }}
                                className={`w-full py-4 rounded-xl font-bold text-[14px] leading-none uppercase tracking-widest shadow-lg active:scale-95 transition-all ${
                                    variant === 'danger'
                                        ? 'bg-red-500 text-white shadow-red-500/15'
                                        : 'bg-lior-500 text-white shadow-lior-500/15'
                                }`}
                            >
                                {confirmLabel}
                            </button>
                            <button
                                onClick={onCancel}
                                className="w-full py-4 rounded-xl font-bold text-[13px] leading-none uppercase tracking-widest active:scale-95 transition-all"
                                style={{ background: 'rgba(var(--theme-particle-2-rgb),0.06)', color: 'var(--color-text-secondary)' }}
                            >
                                {cancelLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>,
                document.body
            )}
        </AnimatePresence>
    );
};

import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { feedback } from '../utils/feedback';
import { useTapOrigin } from '../hooks/useTapOrigin';

interface PrimingModalProps {
    isOpen: boolean;
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel?: string;
    /** Optional icon shown above the title (e.g. a lucide <Camera /> element). */
    icon?: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Small "permission priming" modal. Explains WHY a device permission is needed
 * before the real OS prompt fires — iOS/Android allow exactly one prompt, so a
 * cold denial permanently breaks the feature. onConfirm triggers the real
 * request.
 *
 * Structure mirrors ConfirmModal: the portal is created on the OUTSIDE with
 * AnimatePresence INSIDE it, so AnimatePresence's child is a real
 * <motion.div> and exit animations work. lior:hardware-back is intercepted so
 * Android back closes the modal instead of popping the route.
 */
export const PrimingModal: React.FC<PrimingModalProps> = ({
    isOpen,
    title,
    body,
    confirmLabel,
    cancelLabel = 'Not now',
    icon,
    onConfirm,
    onCancel,
}) => {
    const openedAtRef = React.useRef(0);
    const { ref: dialogRef, origin } = useTapOrigin<HTMLDivElement>(isOpen);

    React.useEffect(() => {
        if (!isOpen) return;
        openedAtRef.current = Date.now();
        const handleBack = (e: Event) => {
            e.preventDefault(); // Stop App.tsx from popping route
            onCancel();
        };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [isOpen, onCancel]);

    return ReactDOM.createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center p-8"
                    style={{ backgroundColor: 'rgba(21,12,16,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
                    onClick={() => {
                        if (Date.now() - openedAtRef.current < 500) return;
                        onCancel();
                    }}
                >
                    <motion.div
                        ref={dialogRef}
                        initial={{ scale: 0.86, opacity: 0, y: 8 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.94, opacity: 0, y: 6 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 380, mass: 0.8 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className="bg-white/95 w-full max-w-[340px] p-8 shadow-float relative overflow-hidden"
                        style={{ borderRadius: 'var(--radius-xl)', transformOrigin: origin }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Subtle top decoration */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-lior-500/20 to-transparent opacity-40" />

                        <div className="flex flex-col items-center text-center mb-6">
                            {icon && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', delay: 0.1 }}
                                    className="p-3.5 bg-lior-500/12 text-lior-500 rounded-2xl mb-4"
                                >
                                    {icon}
                                </motion.div>
                            )}
                            <h3 className="font-serif font-bold text-xl leading-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
                        </div>

                        <p className="text-center text-[15px] leading-relaxed mb-8 px-2" style={{ color: 'var(--color-text-secondary)' }}>{body}</p>

                        <div className="flex flex-col gap-2.5">
                            <button
                                onClick={() => { feedback.tap(); onConfirm(); }}
                                className="w-full py-4 rounded-xl font-bold text-[14px] leading-none uppercase tracking-widest shadow-lg active:scale-95 transition-all bg-lior-500 text-white shadow-lior-500/15"
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
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

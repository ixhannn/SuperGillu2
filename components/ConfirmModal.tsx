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
    return (
        <AnimatePresence>
            {isOpen && ReactDOM.createPortal(
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center p-6"
                    style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 8 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 4 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                        className="bg-white w-full max-w-sm rounded-[1.75rem] p-7 shadow-elevated"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            {variant === 'danger' && (
                                <div className="p-2.5 bg-red-50 text-red-500 rounded-2xl">
                                    <AlertTriangle size={18} />
                                </div>
                            )}
                            <h3 className="font-serif font-bold text-lg text-gray-900">{title}</h3>
                        </div>

                        <p className="text-sm text-warmgray-500 leading-relaxed mb-7">{message}</p>

                        <div className="flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 py-3 rounded-2xl font-bold text-sm bg-warmgray-100 text-warmgray-600 spring-press"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={() => { variant === 'danger' ? feedback.error() : feedback.tap(); onConfirm(); }}
                                className={`flex-1 py-3 rounded-2xl font-bold text-sm spring-press ${
                                    variant === 'danger'
                                        ? 'bg-red-500 text-white shadow-lg shadow-red-200/40'
                                        : 'bg-tulika-500 text-white shadow-lg shadow-tulika-200/40'
                                }`}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>,
                document.body
            )}
        </AnimatePresence>
    );
};

import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

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
                    className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            {variant === 'danger' && (
                                <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                                    <AlertTriangle size={20} />
                                </div>
                            )}
                            <h3 className="font-serif font-bold text-lg text-gray-800">{title}</h3>
                        </div>

                        <p className="text-sm text-gray-500 leading-relaxed mb-6">{message}</p>

                        <div className="flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors active:scale-95"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`flex-1 py-3 rounded-xl font-semibold text-sm shadow-md transition-all active:scale-95 ${
                                    variant === 'danger'
                                        ? 'bg-red-500 text-white shadow-red-200 hover:bg-red-600'
                                        : 'bg-tulika-500 text-white shadow-tulika-200 hover:bg-tulika-600'
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

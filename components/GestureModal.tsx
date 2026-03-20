import React from 'react';
import ReactDOM from 'react-dom';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';

interface GestureModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    layoutId?: string;
}

export const GestureModal: React.FC<GestureModalProps> = ({ isOpen, onClose, children, layoutId }) => {
    // Physical pull-to-dismiss gesture state
    const y = useMotionValue(0);

    // Bind the background opacity directly to the drag distance
    // Pulling down 150px will fade the background to 0
    const bgOpacity = useTransform(y, [0, 150], [1, 0]);

        <AnimatePresence>
            {isOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 pointer-events-none">
                    {/* Reactive Background Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ opacity: bgOpacity }}
                        className="absolute inset-0 bg-stone-900/90 backdrop-blur-md pointer-events-auto"
                        onClick={onClose}
                    />

                    {/* Draggable physical container */}
                    <motion.div
                        layoutId={layoutId}
                        drag="y"
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={0.8}
                        onDragEnd={(e, info) => {
                            // If user dragged down fast or far enough, dismiss
                            if (info.offset.y > 100 || info.velocity.y > 500) {
                                onClose();
                            }
                        }}
                        style={{ y }}
                        className="relative z-10 w-full max-w-md pointer-events-auto origin-center"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    >
                        {children}
                    </motion.div>
                </div>,
                document.body
            )}
        </AnimatePresence>
};

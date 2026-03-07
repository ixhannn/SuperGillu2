import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState } from '../types';

interface ViewTransitionProps {
    viewKey: ViewState;
    children: React.ReactNode;
}

export const ViewTransition: React.FC<ViewTransitionProps> = ({ viewKey, children }) => {
    // Track the last pointer down position to originate the ripple from there
    const [clickPos, setClickPos] = useState({
        x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
        y: typeof window !== 'undefined' ? window.innerHeight : 0
    });

    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            let clientX = 0;
            let clientY = 0;
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }

            setClickPos({ x: clientX, y: clientY });
        };

        window.addEventListener('mousedown', handleGlobalClick, { capture: true, passive: true });
        window.addEventListener('touchstart', handleGlobalClick, { capture: true, passive: true });

        return () => {
            window.removeEventListener('mousedown', handleGlobalClick, { capture: true });
            window.removeEventListener('touchstart', handleGlobalClick, { capture: true });
        };
    }, []);

    const variants = {
        initial: (pos: { x: number, y: number }) => ({
            clipPath: `circle(0px at ${pos.x}px ${pos.y}px)`,
            zIndex: 10,
        }),
        animate: (pos: { x: number, y: number }) => ({
            clipPath: `circle(150% at ${pos.x}px ${pos.y}px)`,
            zIndex: 10,
            transition: {
                type: "spring",
                stiffness: 200,
                damping: 30,
                mass: 0.8
            }
        }),
        exit: {
            opacity: 0.5,
            filter: "blur(4px)",
            zIndex: 0,
            transition: { duration: 0.4 }
        }
    };

    return (
        <div className="relative w-full h-full min-h-full">
            <AnimatePresence initial={false}>
                <motion.div
                    key={viewKey}
                    custom={clickPos}
                    variants={variants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="absolute inset-0 w-full mb-32 origin-center will-change-transform" // mb-32 to clear bottom nav
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

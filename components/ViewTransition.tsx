import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState } from '../types';

interface ViewTransitionProps {
    viewKey: ViewState;
    children: React.ReactNode;
}

export const ViewTransition: React.FC<ViewTransitionProps> = ({ viewKey, children }) => {
    const clickPosRef = useRef({
        x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
        y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0
    });
    const [clickPos, setClickPos] = useState(clickPosRef.current);

    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            let clientX: number, clientY: number;
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else return;

            clickPosRef.current = { x: clientX, y: clientY };
            setClickPos({ x: clientX, y: clientY });
        };

        window.addEventListener('mousedown', handleGlobalClick, { capture: true, passive: true });
        window.addEventListener('touchstart', handleGlobalClick, { capture: true, passive: true });

        return () => {
            window.removeEventListener('mousedown', handleGlobalClick, { capture: true });
            window.removeEventListener('touchstart', handleGlobalClick, { capture: true });
        };
    }, []);

    // Use a smooth tween instead of spring for clip-path —
    // springs oscillate which causes clip-path to repaint back and forth = jitter
    const variants = {
        initial: (pos: { x: number; y: number }) => ({
            clipPath: `circle(0% at ${pos.x}px ${pos.y}px)`,
            opacity: 1,
            zIndex: 10,
        }),
        animate: (pos: { x: number; y: number }) => ({
            clipPath: `circle(200% at ${pos.x}px ${pos.y}px)`,
            opacity: 1,
            zIndex: 10,
            transition: {
                clipPath: { duration: 0.6, ease: [0.32, 0.72, 0, 1] }, // Apple-style cinematic ease
                opacity: { duration: 0.3 },
            },
        }),
        exit: {
            opacity: 0,
            scale: 0.99,
            zIndex: 0,
            transition: {
                opacity: { duration: 0.2, ease: 'easeOut' },
                scale: { duration: 0.2, ease: 'easeOut' },
            },
        },
    };

    return (
        <div className="relative w-full h-full min-h-full">
            <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                    key={viewKey}
                    custom={clickPos}
                    variants={variants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    onAnimationComplete={(definition) => {
                        if (definition === 'animate') {
                            // After transition, remove clipPath to allow GPU scroll optimization
                            // and prevent flickering "shredding" artifacts on long pages.
                            const el = document.querySelector(`[data-transition-key="${viewKey}"]`) as HTMLElement;
                            if (el) el.style.clipPath = 'none';
                        }
                    }}
                    data-transition-key={viewKey}
                    className="absolute inset-x-0 top-0 w-full min-h-full will-change-[clip-path,opacity] bg-tulika-50"
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};



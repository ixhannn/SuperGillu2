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
    const prevView = useRef(viewKey);

    useEffect(() => {
        prevView.current = viewKey;
    }, [viewKey]);

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

    const variants = {
        initial: (pos: { x: number; y: number }) => ({
            clipPath: `circle(0% at ${pos.x}px ${pos.y}px)`,
            opacity: 1,
            scale: 0.97,
            filter: 'blur(3px)',
        }),
        animate: (pos: { x: number; y: number }) => ({
            clipPath: `circle(200% at ${pos.x}px ${pos.y}px)`,
            opacity: 1,
            scale: 1,
            filter: 'blur(0px)',
            transition: {
                clipPath: { duration: 0.48, ease: [0.32, 0.72, 0, 1] as any },
                opacity: { duration: 0.25 },
                scale: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as any },
                filter: { duration: 0.35 },
            },
        }),
        exit: {
            opacity: 0,
            scale: 0.97,
            filter: 'blur(2px)',
            transition: {
                opacity: { duration: 0.18 },
                scale: { duration: 0.22 },
                filter: { duration: 0.18 },
            },
        },
    };

    return (
        // Use a non-absolute wrapper so content always starts at the top of the scroll container
        <div className="relative w-full min-h-full" style={{ perspective: '1200px' }}>
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
                            const el = document.querySelector(`[data-transition-key="${viewKey}"]`) as HTMLElement;
                            if (el) {
                                el.style.clipPath = 'none';
                                el.style.filter = 'none';
                                el.style.transform = 'none';
                            }
                        }
                    }}
                    data-transition-key={viewKey}
                    className="w-full will-change-[clip-path,opacity,transform,filter] bg-transparent"
                    style={{ transformOrigin: 'center top', backfaceVisibility: 'hidden' }}
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

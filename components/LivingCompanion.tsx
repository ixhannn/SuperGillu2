import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { storageEventTarget, StorageUpdateDetail } from '../services/storage';
import { syncEventTarget } from '../services/sync';

interface LivingCompanionProps {
    /** Where a tap takes you — the full companion (pet) screen. */
    onTap: () => void;
}

// Saves that should make the companion react with a little burst of joy.
const REACTING_TABLES = new Set([
    'memories', 'daily_photos', 'keepsakes', 'notes',
    'time_capsules', 'surprises', 'voice_notes',
]);

/**
 * A tiny living companion that floats in the corner of the main tabs.
 *
 * Tier-1 "living world" element: it adds aliveness WITHOUT restructuring any
 * screen. It breathes on its own, reacts (a hop + a floating heart) when a real
 * moment happens — a memory saved, a heartbeat received — and taps through to the
 * full pet. Reflective, never demanding: it never decays, nags, or guilts.
 */
export const LivingCompanion: React.FC<LivingCompanionProps> = ({ onTap }) => {
    const prefersReducedMotion = useReducedMotion();
    const [reacting, setReacting] = useState(false);
    const [hearts, setHearts] = useState<number[]>([]);
    const lastReactRef = useRef(0);
    const heartIdRef = useRef(0);
    const reactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const react = useCallback(() => {
        const now = Date.now();
        if (now - lastReactRef.current < 1200) return; // throttle bursts
        lastReactRef.current = now;

        setReacting(true);
        const id = heartIdRef.current++;
        setHearts((current) => [...current, id]);
        window.setTimeout(() => setHearts((current) => current.filter((x) => x !== id)), 1500);

        if (reactTimerRef.current) clearTimeout(reactTimerRef.current);
        reactTimerRef.current = setTimeout(() => setReacting(false), 700);
    }, []);

    useEffect(() => {
        const onStorage = (event: Event) => {
            const detail = (event as CustomEvent).detail as StorageUpdateDetail | undefined;
            if (detail?.action === 'save' && detail.table && REACTING_TABLES.has(detail.table)) {
                react();
            }
        };
        const onSignal = (event: Event) => {
            const detail = (event as CustomEvent).detail as { signalType?: string } | undefined;
            if (detail?.signalType === 'HEARTBEAT' || detail?.signalType === 'AURA_SIGNAL') {
                react();
            }
        };

        storageEventTarget.addEventListener('storage-update', onStorage);
        syncEventTarget.addEventListener('signal-received', onSignal);
        return () => {
            storageEventTarget.removeEventListener('storage-update', onStorage);
            syncEventTarget.removeEventListener('signal-received', onSignal);
            if (reactTimerRef.current) clearTimeout(reactTimerRef.current);
        };
    }, [react]);

    return (
        <div
            style={{ position: 'fixed', right: '16px', bottom: '86px', zIndex: 40, pointerEvents: 'none' }}
            aria-hidden={false}
        >
            <AnimatePresence>
                {hearts.map((id) => (
                    <motion.div
                        key={id}
                        initial={{ opacity: 0, y: 0, scale: 0.5 }}
                        animate={{ opacity: 1, y: -36, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.4, ease: 'easeOut' }}
                        style={{ position: 'absolute', right: '20px', bottom: '46px', pointerEvents: 'none' }}
                    >
                        <Heart size={14} className="text-lior-400" fill="currentColor" />
                    </motion.div>
                ))}
            </AnimatePresence>

            <motion.div
                animate={prefersReducedMotion ? {} : { y: [0, -4, 0] }}
                transition={prefersReducedMotion ? {} : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ pointerEvents: 'auto' }}
            >
                <motion.button
                    type="button"
                    onClick={onTap}
                    aria-label="Open your companion"
                    animate={reacting && !prefersReducedMotion ? { scale: [1, 1.18, 0.96, 1], rotate: [0, -6, 6, 0] } : { scale: 1, rotate: 0 }}
                    transition={{ duration: 0.7, ease: 'easeInOut' }}
                    whileTap={{ scale: 0.9 }}
                    className="spring-press"
                    style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        border: '1px solid rgba(255,255,255,0.55)',
                        background: 'linear-gradient(150deg, #fda4af 0%, #fb7185 55%, #f43f5e 100%)',
                        boxShadow: '0 6px 18px rgba(244,63,94,0.32), inset 0 1px 0 rgba(255,255,255,0.45)',
                        display: 'block',
                        padding: 0,
                        cursor: 'pointer',
                    }}
                >
                    <svg viewBox="0 0 54 54" width="54" height="54" aria-hidden="true">
                        {/* blush */}
                        <ellipse cx="16" cy="33" rx="3.4" ry="2.2" fill="rgba(190,18,60,0.28)" />
                        <ellipse cx="38" cy="33" rx="3.4" ry="2.2" fill="rgba(190,18,60,0.28)" />
                        {reacting ? (
                            <>
                                {/* happy closed eyes */}
                                <path d="M15 26 q3.5 -4 7 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                                <path d="M32 26 q3.5 -4 7 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                                <path d="M22 34 q5 5 10 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                            </>
                        ) : (
                            <>
                                {/* open eyes */}
                                <circle cx="18.5" cy="26" r="3.6" fill="#fff" />
                                <circle cx="35.5" cy="26" r="3.6" fill="#fff" />
                                <circle cx="19.4" cy="26.6" r="1.7" fill="#7a1228" />
                                <circle cx="36.4" cy="26.6" r="1.7" fill="#7a1228" />
                                {/* gentle smile */}
                                <path d="M23 33 q4 3.4 8 0" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
                            </>
                        )}
                    </svg>
                </motion.button>
            </motion.div>
        </div>
    );
};

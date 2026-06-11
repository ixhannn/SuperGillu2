import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING } from '../GoldKit';
import { CountdownRing, UnlockBurst, WaxSeal, formatDate } from './SealKit';
import { feedback } from '../../../utils/feedback';
import { useLiorMedia } from '../../../hooks/useLiorImage';
import type { TimeCapsule } from '../../../types';

/**
 * Full-screen letter reader. For ready letters it plays the unlock
 * ceremony: the wax seal cracks in two, the envelope flap lifts and the
 * letter unfolds into a serif reading card. Opened letters skip straight
 * to the reading card.
 */

type ReaderPhase = 'sealed' | 'cracking' | 'letter';

interface LetterReaderProps {
    capsule: TimeCapsule;
    mode: 'ceremony' | 'read';
    sealInitial: string;
    onCrack: (id: string) => void;
    onClose: () => void;
}

export const LetterReader: React.FC<LetterReaderProps> = ({ capsule, mode, sealInitial, onCrack, onClose }) => {
    const reducedMotion = useReducedMotion();
    const [phase, setPhase] = useState<ReaderPhase>(mode === 'read' ? 'letter' : 'sealed');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { src: imageUrl, handleError } = useLiorMedia(capsule.imageId, capsule.image, capsule.storagePath);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    useEffect(() => {
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [onClose]);

    const handleCrack = () => {
        if (phase !== 'sealed') return;
        onCrack(capsule.id);
        feedback.celebrate();
        setPhase('cracking');
        timerRef.current = setTimeout(() => setPhase('letter'), reducedMotion ? 220 : 1050);
    };

    const openedIso = mode === 'ceremony' ? new Date().toISOString() : capsule.unlockDate;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.22 } }}
            className="fixed inset-0 z-[200] flex items-center justify-center px-5"
            style={{ backgroundColor: 'rgba(13,7,15,0.82)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={phase === 'letter' ? `Reading ${capsule.title}` : `Opening ${capsule.title}`}
        >
            <AnimatePresence mode="wait">
                {phase === 'letter' ? (
                    <motion.div
                        key="letter"
                        initial={{ opacity: 0, y: 64, rotateX: reducedMotion ? 0 : 18, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, transition: { duration: 0.2 } }}
                        transition={GOLD_SOFT_SPRING}
                        className="w-full max-w-[360px]"
                        style={{ transformPerspective: 900 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="rounded-[1.5rem] overflow-hidden"
                            style={{
                                background: 'linear-gradient(168deg, #f8efdc 0%, #eedfc1 100%)',
                                boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)',
                            }}
                        >
                            <div className="px-6 pt-6 pb-5 overflow-y-auto" style={{ maxHeight: '64vh' }}>
                                <p className="text-[9.5px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(146,100,38,0.75)' }}>
                                    A letter from {formatDate(capsule.createdAt)}
                                </p>
                                <h2 className="font-serif text-[1.7rem] mt-2 leading-tight" style={{ color: '#33220f', letterSpacing: '-0.02em' }}>
                                    {capsule.title}
                                </h2>
                                <div className="h-px my-4" style={{ background: 'linear-gradient(90deg, rgba(146,100,38,0.35), transparent)' }} />
                                {imageUrl && (
                                    <img
                                        src={imageUrl}
                                        alt=""
                                        onError={handleError}
                                        className="w-full rounded-xl mb-4 object-cover"
                                        style={{ maxHeight: 220, border: '1px solid rgba(146,100,38,0.2)' }}
                                    />
                                )}
                                <p className="font-serif text-[15.5px] whitespace-pre-wrap" style={{ color: '#3c2a16', lineHeight: 1.8 }}>
                                    {capsule.message}
                                </p>
                                <div className="mt-6 flex items-center justify-between text-[10.5px]" style={{ color: 'rgba(120,84,36,0.65)' }}>
                                    <span>Sealed {formatDate(capsule.createdAt)}</span>
                                    <span>Opened {formatDate(openedIso)}</span>
                                </div>
                            </div>
                        </div>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={onClose}
                            className="lp-glass mt-5 mx-auto block px-7 py-3 rounded-full text-[13px] font-semibold"
                            style={{ color: 'rgba(255,246,230,0.85)' }}
                        >
                            Keep it close
                        </motion.button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="envelope"
                        initial={{ opacity: 0, y: 26, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -18, scale: 0.94, transition: { duration: 0.24 } }}
                        transition={GOLD_SOFT_SPRING}
                        className="flex flex-col items-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                            Sealed {formatDate(capsule.createdAt)}
                        </p>
                        <h2 className="font-serif text-[1.6rem] mt-2 text-center leading-tight max-w-[18ch]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                            {capsule.title}
                        </h2>

                        <div className="relative mt-8" style={{ perspective: 900 }}>
                            <div
                                className="relative w-[280px] h-[185px] rounded-[20px]"
                                style={{
                                    background: 'linear-gradient(168deg, rgba(74,45,20,0.6) 0%, rgba(36,21,15,0.95) 55%, rgba(23,12,16,0.98) 100%)',
                                    border: '1px solid rgba(246,199,104,0.32)',
                                    boxShadow: '0 26px 70px rgba(0,0,0,0.55)',
                                }}
                            >
                                {/* Letter peeking out as the flap lifts */}
                                <motion.div
                                    className="absolute left-4 right-4 top-3 bottom-6 rounded-[12px]"
                                    style={{ background: 'linear-gradient(170deg, #f6ecd6 0%, #eaddc0 100%)' }}
                                    animate={{ y: phase === 'cracking' && !reducedMotion ? -16 : 0 }}
                                    transition={{ duration: 0.5, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
                                />
                                {/* Envelope pocket */}
                                <div
                                    className="absolute inset-x-0 bottom-0 h-[55%] rounded-b-[20px]"
                                    style={{
                                        background: 'linear-gradient(180deg, rgba(56,33,16,0.97) 0%, rgba(36,20,14,0.99) 100%)',
                                        borderTop: '1px solid rgba(255,222,160,0.08)',
                                    }}
                                />
                                {/* Flap */}
                                <motion.div
                                    className="absolute inset-x-0 top-0 z-10"
                                    style={{ height: '52%', transformOrigin: 'top center' }}
                                    animate={{ rotateX: phase === 'sealed' || reducedMotion ? 0 : -150 }}
                                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: phase === 'cracking' ? 0.16 : 0 }}
                                >
                                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                        <defs>
                                            <linearGradient id={`lr-flap-${capsule.id}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="rgba(96,60,28,0.98)" />
                                                <stop offset="100%" stopColor="rgba(52,30,16,0.98)" />
                                            </linearGradient>
                                        </defs>
                                        <polygon points="0,0 100,0 50,100" fill={`url(#lr-flap-${capsule.id})`} />
                                        <polyline points="0,0 50,100 100,0" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                                    </svg>
                                </motion.div>

                                {/* Seal + countdown ring at the flap tip */}
                                <div className="absolute left-1/2 z-20" style={{ top: '52%', transform: 'translate(-50%, -50%)' }}>
                                    <motion.div animate={{ opacity: phase === 'cracking' ? 0 : 1 }} transition={{ duration: 0.45, delay: 0.1 }}>
                                        <CountdownRing progress={100} ready size={84}>
                                            <span aria-hidden="true" />
                                        </CountdownRing>
                                    </motion.div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        {phase === 'sealed' ? (
                                            <motion.button
                                                whileTap={{ scale: 0.88 }}
                                                transition={GOLD_PRESS_SPRING}
                                                onClick={handleCrack}
                                                aria-label="Break the seal"
                                                className="lp-emblem rounded-full"
                                            >
                                                <WaxSeal initial={sealInitial} size={56} />
                                            </motion.button>
                                        ) : (
                                            <div className="relative w-[56px] h-[56px]">
                                                <UnlockBurst />
                                                <motion.div
                                                    className="absolute inset-0"
                                                    style={{ clipPath: 'inset(0 50% 0 0)' }}
                                                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                                                    animate={{ x: -30, y: 10, rotate: -26, opacity: 0 }}
                                                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                                                >
                                                    <WaxSeal initial={sealInitial} size={56} />
                                                </motion.div>
                                                <motion.div
                                                    className="absolute inset-0"
                                                    style={{ clipPath: 'inset(0 0 0 50%)' }}
                                                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                                                    animate={{ x: 30, y: 14, rotate: 22, opacity: 0 }}
                                                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                                                >
                                                    <WaxSeal initial={sealInitial} size={56} />
                                                </motion.div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <p className="lp-float mt-8 text-[12px]" style={{ color: GOLD.textMid }}>
                            {phase === 'sealed' ? 'Tap the wax seal to break it' : 'Opening…'}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

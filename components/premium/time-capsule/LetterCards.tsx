import React from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Camera, Trash2 } from 'lucide-react';
import { GOLD, GOLD_PRESS_SPRING, goldRise } from '../GoldKit';
import { ACCENT, CountdownRing, EnvelopeFlap, WaxSeal, formatDate, progressFor, sunrisesAway } from './SealKit';
import { useLiorMedia } from '../../../hooks/useLiorImage';
import type { TimeCapsule } from '../../../types';

/* ── Sealed / ready envelope card ───────────────────────────────────── */

interface SealedEnvelopeCardProps {
    capsule: TimeCapsule;
    sealInitial: string;
    ready: boolean;
    onTap: () => void;
    onDelete: () => void;
}

export const SealedEnvelopeCard: React.FC<SealedEnvelopeCardProps> = ({ capsule, sealInitial, ready, onTap, onDelete }) => {
    const progress = ready ? 100 : progressFor(capsule);
    const hasPhoto = !!(capsule.imageId || capsule.image || capsule.storagePath);

    return (
        <motion.div
            layout
            variants={goldRise}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
            whileTap={{ scale: 0.97 }}
            transition={GOLD_PRESS_SPRING}
            onClick={onTap}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}
            aria-label={ready ? `Open ${capsule.title}` : `${capsule.title}, sealed until ${formatDate(capsule.unlockDate)}`}
            className="relative overflow-hidden rounded-[1.6rem] cursor-pointer"
            style={{
                background: 'linear-gradient(168deg, rgba(74,45,20,0.45) 0%, rgba(36,21,15,0.88) 52%, rgba(23,12,16,0.95) 100%)',
                border: ready ? '1px solid rgba(246,199,104,0.4)' : `1px solid ${ACCENT}26`,
                boxShadow: ready ? '0 16px 44px rgba(245,158,11,0.14)' : '0 12px 32px rgba(0,0,0,0.3)',
            }}
        >
            <EnvelopeFlap id={capsule.id} />

            <button
                type="button"
                aria-label={`Delete ${capsule.title}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,246,230,0.45)' }}
            >
                <Trash2 size={14} />
            </button>

            <div className="relative z-10 flex flex-col items-center px-5 pt-7 pb-5">
                <div className={ready ? 'lp-emblem' : undefined}>
                    <CountdownRing progress={progress} ready={ready}>
                        <WaxSeal initial={sealInitial} />
                    </CountdownRing>
                </div>

                <h3 className="font-serif text-[1.25rem] leading-tight text-center mt-3.5" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                    {capsule.title}
                </h3>

                {ready ? (
                    <p className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.24em]" style={{ color: GOLD.primary }}>
                        Ready to open
                    </p>
                ) : (
                    <>
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: GOLD.textMid }}>
                            <CalendarDays size={12} />
                            opens {formatDate(capsule.unlockDate)}
                        </p>
                        <p className="mt-1 font-serif italic text-[12.5px]" style={{ color: 'rgba(245,196,116,0.62)' }}>
                            {sunrisesAway(capsule.unlockDate)}
                        </p>
                    </>
                )}

                {hasPhoto && (
                    <span
                        className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.14em]"
                        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.22)', color: 'rgba(246,199,104,0.75)' }}
                    >
                        <Camera size={10} />
                        A photo waits inside
                    </span>
                )}
            </div>
        </motion.div>
    );
};

/* ── Opened letter card (quiet) ─────────────────────────────────────── */

export const OpenedLetterCard: React.FC<{
    capsule: TimeCapsule;
    onRead: () => void;
    onDelete: () => void;
}> = ({ capsule, onRead, onDelete }) => {
    const { src: imageUrl, handleError } = useLiorMedia(capsule.imageId, capsule.image, capsule.storagePath);
    // Reserve the thumbnail slot from a SYNCHRONOUS photo-metadata predicate (the
    // same one SealedEnvelopeCard uses) — never the resolved URL. On a cold/evicted
    // cache the box is still present on frame 1, so the title/message never slide
    // rightward when the image resolves. Text-only letters get no box (pixel-identical).
    const hasPhoto = !!(capsule.imageId || capsule.image || capsule.storagePath);

    return (
        <motion.div
            layout
            variants={goldRise}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
            whileTap={{ scale: 0.97 }}
            transition={GOLD_PRESS_SPRING}
            onClick={onRead}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRead(); } }}
            aria-label={`Read ${capsule.title}`}
            className="relative overflow-hidden rounded-[1.4rem] p-4 cursor-pointer"
            style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
        >
            <div className="flex items-start gap-3.5">
                {hasPhoto && (
                    <div
                        className="w-14 h-14 rounded-xl overflow-hidden shrink-0"
                        style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}
                    >
                        {imageUrl && (
                            <img
                                src={imageUrl}
                                alt=""
                                onError={handleError}
                                className="w-full h-full object-cover"
                            />
                        )}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h4 className="font-serif text-[15px] leading-tight" style={{ color: GOLD.textHigh }}>
                        {capsule.title}
                    </h4>
                    <p
                        className="mt-1 text-[12px] leading-snug"
                        style={{
                            color: GOLD.textMid,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {capsule.message}
                    </p>
                    <p className="mt-2 text-[10px]" style={{ color: GOLD.textLow }}>
                        Written {formatDate(capsule.createdAt)} · Opened {formatDate(capsule.unlockDate)}
                    </p>
                </div>
                <button
                    type="button"
                    aria-label={`Delete ${capsule.title}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                    style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,246,230,0.4)' }}
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </motion.div>
    );
};

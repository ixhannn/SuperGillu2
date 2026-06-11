import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Check } from 'lucide-react';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import { useHoldToRecord } from '../../hooks/useHoldToRecord';
import { feedback } from '../../utils/feedback';
import { GOLD, GOLD_PRESS_SPRING } from '../premium/GoldKit';

const CLIP_MS = 5000;
const RING_RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface DailyVideoRecorderProps {
    onSaved: (result: { blob: Blob; durationMs: number }) => void | Promise<void>;
    onClose: () => void;
}

type Phase = 'idle' | 'recording' | 'review';

interface Take {
    blob: Blob;
    durationMs: number;
    previewUrl: string;
}

/**
 * The camera, restaged as a cinema. Capture logic (getUserMedia,
 * MediaRecorder, hold-to-record, flip, retake/keep) is untouched —
 * only the chrome speaks Lior Gold.
 */
export function DailyVideoRecorder({ onSaved, onClose }: DailyVideoRecorderProps) {
    const recorder = useVideoRecorder();
    const [phase, setPhase] = useState<Phase>('idle');
    const [take, setTake] = useState<Take | null>(null);
    const [saving, setSaving] = useState(false);
    const previewVideoRef = useRef<HTMLVideoElement>(null);

    const hold = useHoldToRecord({
        durationMs: CLIP_MS,
        onStart: async () => {
            feedback.light();
            await recorder.startRecording();
            setPhase('recording');
        },
        onRelease: async (_heldMs, _reachedFull) => {
            feedback.medium();
            const result = await recorder.stopRecording();
            if (!result) {
                setPhase('idle');
                return;
            }
            const url = URL.createObjectURL(result.blob);
            setTake({ blob: result.blob, durationMs: result.duration, previewUrl: url });
            setPhase('review');
        },
        onCancel: () => {
            recorder.cancelRecording();
            setPhase('idle');
        },
    });

    useEffect(() => {
        return () => {
            if (take?.previewUrl) URL.revokeObjectURL(take.previewUrl);
        };
    }, [take?.previewUrl]);

    useEffect(() => {
        if (phase === 'review' && previewVideoRef.current && take) {
            previewVideoRef.current.play().catch(() => {});
        }
    }, [phase, take]);

    const handleRetake = () => {
        if (take?.previewUrl) URL.revokeObjectURL(take.previewUrl);
        setTake(null);
        setPhase('idle');
    };

    const handleKeep = async () => {
        if (!take || saving) return;
        setSaving(true);
        try {
            await onSaved({ blob: take.blob, durationMs: take.durationMs });
            URL.revokeObjectURL(take.previewUrl);
        } finally {
            setSaving(false);
        }
    };

    const offset = CIRCUMFERENCE * (1 - hold.progress);

    return (
        <div className="gdv-cinema">
            <div className="gdv-cinema__stage">
                {phase !== 'review' && (
                    <video
                        ref={recorder.videoPreviewRef}
                        className="gdv-cinema__video"
                        playsInline
                        muted
                        autoPlay
                    />
                )}

                {phase === 'review' && take && (
                    <video
                        ref={previewVideoRef}
                        className="gdv-cinema__video"
                        src={take.previewUrl}
                        playsInline
                        loop
                        controls={false}
                    />
                )}
            </div>

            <div className="gdv-cinema__hairline" />

            <div className="gdv-cinema__chrome-top">
                <span
                    className="text-[10px] font-bold uppercase tracking-[0.3em]"
                    style={{ color: 'rgba(216,180,254,0.85)' }}
                >
                    Tonight&rsquo;s scene
                </span>
                <motion.button
                    whileTap={{ scale: 0.86 }}
                    transition={GOLD_PRESS_SPRING}
                    onClick={() => { feedback.tap(); onClose(); }}
                    aria-label="Close"
                    className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ color: 'rgba(255,246,230,0.85)' }}
                >
                    <X size={18} strokeWidth={2.2} />
                </motion.button>
            </div>

            {recorder.error && (
                <div className="gdv-recorder__error">{recorder.error}</div>
            )}

            <div className="gdv-cinema__bottom">
                <AnimatePresence mode="wait">
                    {phase !== 'review' && (
                        <motion.div
                            key="capture"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            className="flex flex-col items-center gap-4"
                        >
                            <p
                                className="font-serif text-[15.5px] inline-flex items-center gap-2"
                                style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}
                            >
                                {phase === 'recording' ? (
                                    <>
                                        <span className="gdv-rec-dot" />
                                        Rolling — stay with it
                                    </>
                                ) : (
                                    'Hold to roll. Five seconds, one take.'
                                )}
                            </p>
                            <button
                                {...hold.bind}
                                className={`gdv-hold${hold.isHolding ? ' is-holding' : ''}`}
                                aria-label="Hold to record"
                            >
                                <svg className="gdv-hold__ring" width="140" height="140" viewBox="0 0 140 140">
                                    <defs>
                                        <linearGradient id="gdv-hold-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#f6c768" />
                                            <stop offset="100%" stopColor="#d99c3e" />
                                        </linearGradient>
                                    </defs>
                                    <circle cx="70" cy="70" r={RING_RADIUS} className="gdv-hold__track" />
                                    <circle
                                        cx="70"
                                        cy="70"
                                        r={RING_RADIUS}
                                        className="gdv-hold__progress"
                                        strokeDasharray={CIRCUMFERENCE}
                                        strokeDashoffset={offset}
                                    />
                                </svg>
                                <span className="gdv-hold__dot" />
                            </button>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.94 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={() => { feedback.tap(); void recorder.switchCamera(); }}
                                className="lp-glass inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-semibold"
                                style={{ color: 'rgba(255,250,242,0.85)' }}
                            >
                                <RotateCcw size={14} />
                                Flip camera
                            </motion.button>
                        </motion.div>
                    )}

                    {phase === 'review' && take && (
                        <motion.div
                            key="review"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            className="flex flex-col items-center gap-4"
                        >
                            <p
                                className="font-serif text-[15.5px]"
                                style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}
                            >
                                Keep this take?
                            </p>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <motion.button
                                    type="button"
                                    whileTap={saving ? undefined : { scale: 0.96 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={() => { feedback.tap(); handleRetake(); }}
                                    disabled={saving}
                                    className="lp-glass h-[52px] rounded-2xl text-[14px] font-semibold"
                                    style={{ color: 'rgba(255,250,242,0.88)', opacity: saving ? 0.5 : 1 }}
                                >
                                    Retake
                                </motion.button>
                                <motion.button
                                    type="button"
                                    whileTap={saving ? undefined : { scale: 0.96 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={handleKeep}
                                    disabled={saving}
                                    className="lp-cta h-[52px] rounded-2xl font-bold text-[14px] inline-flex items-center justify-center gap-2"
                                    style={{
                                        background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                        color: GOLD.inkOnGold,
                                        boxShadow: '0 12px 32px rgba(246,199,104,0.26), inset 0 1px 0 rgba(255,246,222,0.45)',
                                        opacity: saving ? 0.7 : 1,
                                    }}
                                >
                                    <Check size={16} strokeWidth={2.6} />
                                    {saving ? 'Saving…' : 'Keep'}
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

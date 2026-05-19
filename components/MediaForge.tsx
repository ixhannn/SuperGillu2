/**
 * MediaForge — bold, full-screen capture experience.
 *
 * Designed to feel like a stage, not a form. The picked media is the
 * centrepiece; everything around it is theatrical:
 *
 *   • Conic gradient mesh backdrop with two breathing aurora pools and
 *     a grain overlay that adds analog texture without paying GPU cost.
 *   • A massive serif headline + animated kind glyph at the top — the
 *     moment is named, not labelled.
 *   • Develop reveal: blur+brightness settle with a 1.4s ease-out spring
 *     so the media's arrival is dramatic and considered.
 *   • Frame chips are mini swatches showing the look, not text labels.
 *   • The confirm CTA is enormous, gradient-swept, and pulses outward
 *     so the action is impossible to miss.
 *
 * Pure presentational — never mutates storage. Returns frame + caption
 * to the parent via `onConfirm`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Camera, Play, RotateCw, Sparkles, Type, Video, X } from 'lucide-react';
import { feedback } from '../utils/feedback';

export type ForgeFrame = 'none' | 'polaroid' | 'film' | 'glow';

export interface ForgeResult {
    frame: ForgeFrame;
    caption: string;
}

interface MediaForgeProps {
    isOpen: boolean;
    kind: 'photo' | 'video';
    imageSrc: string | null;
    videoSrc: string | null;
    bytes?: number;
    durationSec?: number;
    initialCaption?: string;
    onConfirm: (result: ForgeResult) => void;
    onRetry: () => void;
    onClose: () => void;
}

interface FrameDef {
    id: ForgeFrame;
    label: string;
    /** A tiny CSS preview of the frame style for the chip swatch. */
    swatch: React.CSSProperties;
}

const FRAMES: FrameDef[] = [
    {
        id: 'none',
        label: 'Pure',
        swatch: {
            background: 'linear-gradient(135deg, #f472b6, #a855f7)',
            borderRadius: 8,
        },
    },
    {
        id: 'polaroid',
        label: 'Polaroid',
        swatch: {
            background: '#fdfaf5',
            borderRadius: 4,
            boxShadow: 'inset 0 -10px 0 #fdfaf5, inset 0 0 0 2px rgba(0,0,0,0.06)',
            backgroundImage: 'linear-gradient(135deg, #c084fc 0%, #c084fc 70%, #fdfaf5 70%, #fdfaf5 100%)',
        },
    },
    {
        id: 'film',
        label: 'Film',
        swatch: {
            background: 'linear-gradient(135deg, #f59e0b, #b45309)',
            borderRadius: 8,
            filter: 'saturate(1.4) sepia(0.18)',
            boxShadow: 'inset 0 0 0 2px #0c0c0c',
        },
    },
    {
        id: 'glow',
        label: 'Glow',
        swatch: {
            background: 'linear-gradient(135deg, #f472b6, #a855f7)',
            borderRadius: 8,
            boxShadow: '0 0 14px rgba(244,114,182,0.85), 0 0 4px rgba(168,85,247,0.6)',
        },
    },
];

const formatBytes = (bytes?: number): string => {
    if (!bytes || !Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDuration = (seconds?: number): string => {
    if (!seconds || !Number.isFinite(seconds)) return '';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

export const MediaForge: React.FC<MediaForgeProps> = ({
    isOpen,
    kind,
    imageSrc,
    videoSrc,
    bytes,
    durationSec,
    initialCaption = '',
    onConfirm,
    onRetry,
    onClose,
}) => {
    const [frame, setFrame] = useState<ForgeFrame>('none');
    const [caption, setCaption] = useState(initialCaption);
    const [developed, setDeveloped] = useState(false);
    const [videoPlaying, setVideoPlaying] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            setDeveloped(false);
            setFrame('none');
            setCaption(initialCaption);
            const t = window.setTimeout(() => setDeveloped(true), 80);
            return () => window.clearTimeout(t);
        }
    }, [isOpen, imageSrc, videoSrc, initialCaption]);

    // Frame-aware preview wrapper styling.
    const previewWrapperStyle = useMemo<React.CSSProperties>(() => {
        switch (frame) {
            case 'polaroid':
                return {
                    background: '#fdfaf5',
                    padding: '16px 16px 60px',
                    borderRadius: 12,
                    boxShadow: '0 28px 56px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.20)',
                    transform: 'rotate(-1.4deg)',
                };
            case 'film':
                return {
                    padding: 8,
                    borderRadius: 22,
                    background: 'linear-gradient(180deg, #1a1a1a, #0c0c0c)',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(255,255,255,0.06)',
                };
            case 'glow':
                return {
                    padding: 0,
                    borderRadius: 28,
                    background: 'transparent',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.22), 0 0 80px rgba(244,114,182,0.55), 0 0 40px rgba(168,85,247,0.45), 0 24px 48px rgba(0,0,0,0.45)',
                };
            default:
                return {
                    padding: 0,
                    borderRadius: 24,
                    boxShadow: '0 28px 56px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.25)',
                };
        }
    }, [frame]);

    const previewMediaStyle = useMemo<React.CSSProperties>(() => {
        const base: React.CSSProperties = {
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            maxHeight: '48vh',
            objectFit: 'contain',
            borderRadius: frame === 'polaroid' ? 4 : (frame === 'film' ? 16 : 24),
            background: '#000',
        };
        if (frame === 'film') {
            return { ...base, filter: 'saturate(1.20) contrast(1.05) sepia(0.13) brightness(0.97)' };
        }
        if (frame === 'glow') {
            return { ...base, filter: 'saturate(1.10)' };
        }
        return base;
    }, [frame]);

    const handleConfirm = () => {
        feedback.celebrate();
        onConfirm({ frame, caption: caption.trim() });
    };

    const handleRetry = () => {
        feedback.tap();
        onRetry();
    };

    const toggleVideo = () => {
        const v = videoRef.current;
        if (!v) return;
        if (videoPlaying) { v.pause(); setVideoPlaying(false); }
        else              { void v.play(); setVideoPlaying(true); }
    };

    const KindIcon = kind === 'video' ? Video : Camera;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="media-forge"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.25 } }}
                    className="fixed inset-0 z-[70] flex flex-col"
                    style={{
                        background: '#0a0510',
                        backdropFilter: 'blur(28px) saturate(1.2)',
                        WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
                    }}
                >
                    {/* ── BACKDROP — bold conic mesh + grain ───────────────── */}
                    {/* Conic gradient sweep */}
                    <motion.div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: 'conic-gradient(from 220deg at 30% 30%, #f472b6 0%, #a855f7 25%, #6366f1 50%, #ec4899 75%, #f472b6 100%)',
                            opacity: 0.55,
                            filter: 'blur(80px) saturate(1.3)',
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                    />

                    {/* Aurora pool top-left */}
                    <motion.div
                        aria-hidden
                        className="absolute pointer-events-none"
                        style={{
                            top: '-20%',
                            left: '-15%',
                            width: '85vw',
                            height: '85vw',
                            background: 'radial-gradient(circle, rgba(244,114,182,0.55), transparent 60%)',
                            filter: 'blur(60px)',
                            borderRadius: '50%',
                        }}
                        animate={{ scale: [1, 1.14, 1], x: [0, 22, 0], y: [0, -10, 0] }}
                        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* Aurora pool bottom-right */}
                    <motion.div
                        aria-hidden
                        className="absolute pointer-events-none"
                        style={{
                            bottom: '-22%',
                            right: '-25%',
                            width: '85vw',
                            height: '85vw',
                            background: 'radial-gradient(circle, rgba(168,85,247,0.50), transparent 60%)',
                            filter: 'blur(60px)',
                            borderRadius: '50%',
                        }}
                        animate={{ scale: [1, 1.16, 1], x: [0, -18, 0], y: [0, 12, 0] }}
                        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                    />

                    {/* Grain overlay */}
                    <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            opacity: 0.18,
                            mixBlendMode: 'overlay',
                            backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.05), transparent 50%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.4), transparent 50%)',
                        }}
                    />

                    {/* Vignette */}
                    <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse 100% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)' }}
                    />

                    {/* ── TOP BAR ─────────────────────────────────────────── */}
                    <div
                        className="relative z-10 flex items-center justify-between px-5"
                        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-12 h-12 rounded-2xl flex items-center justify-center"
                            style={{
                                background: 'rgba(255,255,255,0.10)',
                                border: '1px solid rgba(255,255,255,0.20)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                color: 'white',
                            }}
                            aria-label="Discard"
                        >
                            <X size={20} strokeWidth={2.4} />
                        </button>

                        <span
                            className="text-[10px] font-black uppercase tracking-[0.32em]"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                        >
                            Forge
                        </span>

                        <button
                            type="button"
                            onClick={handleRetry}
                            className="w-12 h-12 rounded-2xl flex items-center justify-center"
                            style={{
                                background: 'rgba(255,255,255,0.10)',
                                border: '1px solid rgba(255,255,255,0.20)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                color: 'white',
                            }}
                            aria-label="Try again"
                        >
                            <RotateCw size={18} strokeWidth={2.4} />
                        </button>
                    </div>

                    {/* ── MASSIVE HEADLINE ────────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="relative z-10 px-5 pt-3 pb-2 flex items-center gap-3"
                    >
                        <motion.div
                            animate={{ rotate: [0, 8, 0, -6, 0] }}
                            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: 'linear-gradient(135deg, #f472b6, #a855f7)',
                                boxShadow: '0 12px 28px rgba(244,114,182,0.55), inset 0 1px 0 rgba(255,255,255,0.45)',
                            }}
                        >
                            <KindIcon size={20} strokeWidth={2.3} className="text-white" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                            <h1
                                className="font-serif leading-[0.95] tracking-tight"
                                style={{
                                    fontSize: 'clamp(28px, 8vw, 38px)',
                                    fontWeight: 800,
                                    color: 'rgba(255,255,255,0.98)',
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                {kind === 'video' ? 'Your moment.' : 'Your photo.'}
                            </h1>
                            <p
                                className="mt-1 text-[12px] font-bold uppercase tracking-[0.20em]"
                                style={{ color: 'rgba(255,255,255,0.55)' }}
                            >
                                Frame it. Make it yours.
                            </p>
                        </div>
                    </motion.div>

                    {/* ── HERO PREVIEW + METADATA ─────────────────────────── */}
                    <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-6 py-3">
                        {/* Develop reveal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, filter: 'blur(20px) brightness(1.6)' }}
                            animate={{
                                opacity: developed ? 1 : 0.7,
                                scale: developed ? 1 : 1.05,
                                filter: developed ? 'blur(0px) brightness(1)' : 'blur(12px) brightness(1.25)',
                            }}
                            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                            className="relative max-w-full"
                            style={previewWrapperStyle}
                        >
                            {kind === 'video' && videoSrc ? (
                                <div className="relative">
                                    <video
                                        ref={videoRef}
                                        src={videoSrc}
                                        playsInline
                                        loop
                                        muted={false}
                                        style={previewMediaStyle}
                                        onPlay={() => setVideoPlaying(true)}
                                        onPause={() => setVideoPlaying(false)}
                                    />
                                    {!videoPlaying && (
                                        <button
                                            type="button"
                                            onClick={toggleVideo}
                                            aria-label="Play video"
                                            className="absolute inset-0 flex items-center justify-center"
                                            style={{ background: 'rgba(0,0,0,0.18)', borderRadius: previewMediaStyle.borderRadius }}
                                        >
                                            <motion.span
                                                animate={{ scale: [1, 1.10, 1] }}
                                                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                                                className="w-20 h-20 rounded-full flex items-center justify-center"
                                                style={{
                                                    background: 'rgba(255,255,255,0.30)',
                                                    border: '2px solid rgba(255,255,255,0.55)',
                                                    backdropFilter: 'blur(16px)',
                                                    WebkitBackdropFilter: 'blur(16px)',
                                                    boxShadow: '0 12px 28px rgba(0,0,0,0.40)',
                                                }}
                                            >
                                                <Play size={32} fill="white" style={{ color: '#fff', marginLeft: 4 }} />
                                            </motion.span>
                                        </button>
                                    )}
                                </div>
                            ) : imageSrc ? (
                                <img src={imageSrc} alt="Selected media" style={previewMediaStyle} />
                            ) : null}

                            {/* Polaroid handwritten strip */}
                            {frame === 'polaroid' && (
                                <div
                                    className="absolute left-0 right-0 bottom-0 px-5 pb-4 text-center flex items-center justify-center"
                                    style={{ height: 60 }}
                                >
                                    <span
                                        className="text-[15px] truncate"
                                        style={{ fontFamily: 'var(--font-display)', color: '#3a2a35' }}
                                    >
                                        {caption.trim() || new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                            )}

                            {/* Film grain inside the bezel */}
                            {frame === 'film' && (
                                <div
                                    aria-hidden
                                    className="absolute pointer-events-none"
                                    style={{
                                        top: 8, left: 8, right: 8, bottom: 8,
                                        borderRadius: 16,
                                        background: 'radial-gradient(circle at 25% 30%, rgba(255,255,255,0.06), transparent 50%), radial-gradient(circle at 75% 70%, rgba(0,0,0,0.20), transparent 55%)',
                                        mixBlendMode: 'overlay',
                                    }}
                                />
                            )}
                        </motion.div>

                        {/* Metadata bar — bold pills floating below the preview */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.45, duration: 0.5 }}
                            className="flex items-center gap-2 mt-5 flex-wrap justify-center"
                        >
                            <span
                                className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.20em]"
                                style={{
                                    background: 'linear-gradient(135deg, #f472b6, #a855f7)',
                                    color: '#fff',
                                    boxShadow: '0 6px 14px rgba(244,114,182,0.45)',
                                    letterSpacing: '0.18em',
                                }}
                            >
                                {kind}
                            </span>
                            {durationSec !== undefined && durationSec > 0 && (
                                <span
                                    className="px-3 py-1.5 rounded-full text-[11px] font-bold tabular-nums"
                                    style={{
                                        background: 'rgba(255,255,255,0.10)',
                                        color: 'rgba(255,255,255,0.92)',
                                        border: '1px solid rgba(255,255,255,0.18)',
                                        backdropFilter: 'blur(14px)',
                                        WebkitBackdropFilter: 'blur(14px)',
                                    }}
                                >
                                    {formatDuration(durationSec)}
                                </span>
                            )}
                            {bytes !== undefined && (
                                <span
                                    className="px-3 py-1.5 rounded-full text-[11px] font-bold tabular-nums"
                                    style={{
                                        background: 'rgba(255,255,255,0.10)',
                                        color: 'rgba(255,255,255,0.92)',
                                        border: '1px solid rgba(255,255,255,0.18)',
                                        backdropFilter: 'blur(14px)',
                                        WebkitBackdropFilter: 'blur(14px)',
                                    }}
                                >
                                    {formatBytes(bytes)}
                                </span>
                            )}
                        </motion.div>
                    </div>

                    {/* ── FRAME PICKER (mini swatches) ────────────────────── */}
                    <div className="relative z-10 px-5 pb-2">
                        <p
                            className="text-[10px] font-black uppercase tracking-[0.32em] mb-3 text-center"
                            style={{ color: 'rgba(255,255,255,0.50)' }}
                        >
                            Frame
                        </p>
                        <div className="flex justify-center gap-2.5">
                            {FRAMES.map((f) => {
                                const active = frame === f.id;
                                return (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => { feedback.tap(); setFrame(f.id); }}
                                        className="flex flex-col items-center gap-1.5 transition-all"
                                        style={{ width: 64 }}
                                        aria-label={`${f.label} frame`}
                                    >
                                        <span
                                            className="block w-10 h-10 transition-all"
                                            style={{
                                                ...f.swatch,
                                                outline: active ? '2.5px solid #fff' : '2.5px solid transparent',
                                                outlineOffset: active ? '3px' : '0px',
                                                transform: active ? 'scale(1.08)' : 'scale(1)',
                                            }}
                                        />
                                        <span
                                            className="text-[10px] font-black uppercase tracking-[0.18em]"
                                            style={{
                                                color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                                            }}
                                        >
                                            {f.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── CAPTION + CONFIRM ───────────────────────────────── */}
                    <div
                        className="relative z-10 px-5 pt-4"
                        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
                    >
                        <div
                            className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-3"
                            style={{
                                background: 'rgba(255,255,255,0.10)',
                                border: '1.5px solid rgba(255,255,255,0.20)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                            }}
                        >
                            <Type size={16} strokeWidth={2.2} style={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0 }} />
                            <input
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                placeholder="Say something about it…"
                                inputMode="text"
                                enterKeyHint="done"
                                autoCapitalize="sentences"
                                className="flex-1 bg-transparent outline-none text-[15px] font-medium"
                                style={{ color: 'rgba(255,255,255,0.98)' }}
                                maxLength={120}
                            />
                            <span className="text-[10px] tabular-nums font-bold" style={{ color: 'rgba(255,255,255,0.40)' }}>
                                {caption.length}/120
                            </span>
                        </div>

                        {/* The big move — full-width gradient confirm with sweeping
                            highlight + outer pulse halo. Impossible to miss. */}
                        <motion.button
                            type="button"
                            onClick={handleConfirm}
                            whileTap={{ scale: 0.97 }}
                            className="relative w-full overflow-hidden flex items-center justify-center gap-3 text-white"
                            style={{
                                height: 64,
                                borderRadius: 22,
                                background: 'linear-gradient(135deg, #f472b6 0%, #ec4899 35%, #a855f7 100%)',
                                boxShadow: '0 24px 48px rgba(244,114,182,0.55), 0 8px 16px rgba(168,85,247,0.40), inset 0 1.5px 0 rgba(255,255,255,0.55)',
                                fontWeight: 900,
                                fontSize: 16,
                                letterSpacing: '0.16em',
                                textTransform: 'uppercase',
                            }}
                        >
                            {/* Sweeping highlight stripe — moves left → right forever */}
                            <motion.span
                                aria-hidden
                                className="absolute inset-y-0 w-[40%]"
                                style={{
                                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.40), transparent)',
                                    pointerEvents: 'none',
                                }}
                                initial={{ x: '-120%' }}
                                animate={{ x: '260%' }}
                                transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
                            />
                            {/* Outer pulse halo — soft breathing ring */}
                            <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-[22px] pointer-events-none"
                                style={{ boxShadow: '0 0 0 0 rgba(244,114,182,0.45)' }}
                                animate={{ boxShadow: ['0 0 0 0 rgba(244,114,182,0.45)', '0 0 0 12px rgba(244,114,182,0)'] }}
                                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
                            />
                            <span className="relative z-10 flex items-center gap-2.5">
                                <Sparkles size={16} strokeWidth={2.4} />
                                Use this memory
                                <ArrowRight size={16} strokeWidth={2.6} />
                            </span>
                        </motion.button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

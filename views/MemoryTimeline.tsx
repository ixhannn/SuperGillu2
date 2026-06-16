
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Trash2, Image as ImageIcon, PlayCircle, Plus, Calendar, Sparkles, Heart, X, Pause, Play, Volume2, VolumeX, Send, MessageCircle, CornerDownRight, Mic, Share2, Moon, ChevronRight } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState, Memory, Note, Comment, VoiceNote } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService } from '../services/sync';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { springSmooth, springSnappy } from '../utils/motion';
import { useLiorMedia } from '../hooks/useLiorImage';
import { useViewerGestures } from '../hooks/useViewerGestures';
import { useLongPress } from '../hooks/useLongPress';
import { ActionSheet } from '../components/ActionSheet';
import { ShareService } from '../services/share';
import { Haptics } from '../services/haptics';
import { Skeleton } from '../components/Skeleton';
import { PullToRefresh } from '../components/PullToRefresh';
import { ConfirmModal } from '../components/ConfirmModal';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { selectImageStoragePath, selectVideoStoragePath } from '../utils/mediaRefs';

interface MemoryTimelineProps {
    setView: (view: ViewState) => void;
}

const MOOD_MAP: Record<string, string> = { love: '😍', funny: '😂', party: '🥳', peace: '😌', cute: '🥺' };

/* ─── Convert base64 video to blob URL for smooth playback ─── */
function useVideoBlobUrl(src: string | null): string | null {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const prevUrl = useRef<string | null>(null);

    useEffect(() => {
        if (!src) { setBlobUrl(null); return; }
        // Already a blob or object URL — use as-is
        if (src.startsWith('blob:') || src.startsWith('http')) {
            setBlobUrl(src);
            return;
        }
        // Base64 data URL — convert to blob
        if (src.startsWith('data:')) {
            try {
                const [header, data] = src.split(',');
                const mime = header.match(/:(.*?);/)?.[1] || 'video/mp4';
                const bytes = atob(data);
                const buf = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
                const blob = new Blob([buf], { type: mime });
                const url = URL.createObjectURL(blob);
                if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
                prevUrl.current = url;
                setBlobUrl(url);
            } catch {
                setBlobUrl(src); // fallback
            }
            return;
        }
        setBlobUrl(src);
        return () => {
            if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        };
    }, [src]);

    return blobUrl;
}

/* ─── Surprise modal ─── */
const SurpriseModal = ({ memory, onClose }: { memory: Memory; onClose: () => void }) => {
    const { src: imageUrl, handleError: handleImgError } = useLiorMedia(memory.imageId, memory.image, memory.storagePath);

    return ReactDOM.createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)' }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.88, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 pb-7">
                    <div className="flex justify-between items-center mb-5">
                        <div className="flex items-center gap-2 text-lior-500">
                            <Sparkles size={15} className="animate-wiggle-spring" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">A Memory For You</span>
                        </div>
                        <button onClick={onClose} className="p-1.5 bg-gray-100 rounded-full text-gray-400 spring-press cursor-pointer">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden -rotate-1">
                        {imageUrl ? (
                            <div className="aspect-[4/3] overflow-hidden">
                                <img src={imageUrl} alt="Memory" className="w-full h-full object-cover" onError={handleImgError} />
                            </div>
                        ) : (
                            <div className="aspect-[4/3] bg-lior-50 flex items-center justify-center text-lior-200">
                                <Heart size={40} />
                            </div>
                        )}
                        {memory.text && (
                            <p className="font-serif text-base text-gray-800 italic text-center leading-snug px-4 py-3">
                                "{memory.text}"
                            </p>
                        )}
                        <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest pb-3">
                            {new Date(memory.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body,
    );
};

/* ─── Memory card ─── */
const MemoryCardBase: React.FC<{
    memory: Memory;
    index: number;
    featured?: boolean;
    tilt?: number;
    onOpen: (memory: Memory) => void;
    onDelete: (id: string) => void;
    onLongPress: (memory: Memory) => void;
}> = ({ memory, index, featured = false, tilt = 0, onOpen, onDelete, onLongPress }) => {
    const deleteRequestScheduledRef = useRef(false);
    const longPress = useLongPress(() => onLongPress(memory));
    const imageStoragePath = selectImageStoragePath(memory.storagePath, memory.imageMimeType);
    const videoStoragePath = selectVideoStoragePath(memory.videoStoragePath, memory.storagePath, memory.videoMimeType || memory.imageMimeType);
    const isVideo = !!(memory.video || memory.videoId || videoStoragePath);
    const hasAudio = !!memory.audioId;
    const { src: thumbUrl, isLoading: isImageLoading, handleError: handleThumbError } = useLiorMedia(memory.imageId, memory.image, imageStoragePath);
    const hasImagePreviewSource = !!(memory.imageId || memory.image || imageStoragePath);
    const shouldResolveVideoPreview = isVideo && (!hasImagePreviewSource || (!thumbUrl && !isImageLoading));
    const { src: rawVideoPreviewUrl, isLoading: isVideoLoading, handleError: handleVideoThumbError } = useLiorMedia(
        shouldResolveVideoPreview ? memory.videoId : undefined,
        shouldResolveVideoPreview ? memory.video : undefined,
        shouldResolveVideoPreview ? videoStoragePath : undefined,
    );
    const videoPreviewUrl = useVideoBlobUrl(shouldResolveVideoPreview ? rawVideoPreviewUrl : null);
    const isVideoPreviewPending = shouldResolveVideoPreview && !!rawVideoPreviewUrl && !videoPreviewUrl;
    const mediaLoading = isImageLoading || (!!shouldResolveVideoPreview && (isVideoLoading || isVideoPreviewPending) && !thumbUrl);
    const mediaUrl = thumbUrl || videoPreviewUrl;
    const mediaKind = thumbUrl ? 'image' : videoPreviewUrl ? 'video' : null;
    const handleMediaError = mediaKind === 'video' ? handleVideoThumbError : handleThumbError;
    const dateLabel = new Date(memory.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const mood = MOOD_MAP[memory.mood] || '✨';
    const openDeleteConfirm = (
        e: React.PointerEvent<HTMLButtonElement>
            | React.MouseEvent<HTMLButtonElement>
            | React.TouchEvent<HTMLButtonElement>,
    ) => {
        e.stopPropagation();
        e.preventDefault();
        if (deleteRequestScheduledRef.current) return;
        deleteRequestScheduledRef.current = true;
        onDelete(memory.id);
        window.setTimeout(() => {
            deleteRequestScheduledRef.current = false;
        }, 500);
    };

    const staggerDelay = Math.min(index * 0.035, 0.32);
    // Only the first viewport's worth of cards earns a JS entrance animation.
    // Cards below the fold are skipped by content-visibility for paint, but
    // framer would still drive their springs on the main thread — hundreds of
    // simultaneous offscreen tweens on big timelines is a mount-jank burst.
    const animateEntrance = index < 9;
    return (
        <motion.div
            initial={animateEntrance ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, delay: staggerDelay, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => { feedback.light(); onOpen(memory); }}
            {...longPress}
            data-memory-card="true"
            data-perf-list-item="true"
            className="perf-list-item relative overflow-hidden cursor-pointer group"
            style={{
                borderRadius: featured ? '14px' : '12px',
                boxShadow: memory.frame === 'glow'
                    ? '0 0 0 1px rgba(244,114,182,0.22), 0 14px 28px -10px rgba(244,114,182,0.40), 0 6px 14px rgba(168,85,247,0.22)'
                    : memory.frame === 'polaroid'
                        ? '0 14px 28px -12px rgba(120, 53, 15, 0.30), 0 4px 10px rgba(0,0,0,0.08)'
                        : featured
                            ? '0 14px 28px -14px rgba(120, 53, 15, 0.22), 0 4px 8px rgba(0,0,0,0.06)'
                            : '0 8px 18px -10px rgba(120, 53, 15, 0.2), 0 2px 4px rgba(0,0,0,0.05)',
                aspectRatio: featured ? '4/3' : '3/4',
                background: memory.frame === 'polaroid' ? '#fdfaf5' : memory.frame === 'film' ? '#0c0c0c' : '#fffaf2',
                transformOrigin: 'center',
            }}
        >
            {mediaLoading ? (
                <Skeleton type="image" className="absolute inset-0 w-full h-full rounded-none" />
            ) : mediaUrl ? (
                mediaKind === 'video' ? (
                    <video
                        src={mediaUrl}
                        className="absolute inset-0 w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        onError={handleMediaError}
                        style={{
                            filter: memory.frame === 'film'
                                ? 'saturate(1.18) contrast(1.04) sepia(0.12) brightness(0.97)'
                                : undefined,
                        }}
                    />
                ) : (
                    <motion.div
                        layoutId={`mem-hero-${memory.id}`}
                        transition={{ layout: { type: 'spring', stiffness: 300, damping: 34 } }}
                        className="absolute inset-0 overflow-hidden"
                    >
                        <img
                            src={mediaUrl}
                            alt="Memory"
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={handleMediaError}
                            style={{
                                filter: memory.frame === 'film'
                                    ? 'saturate(1.18) contrast(1.04) sepia(0.12) brightness(0.97)'
                                    : undefined,
                            }}
                        />
                    </motion.div>
                )
            ) : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--color-text-secondary)' }}>
                    <ImageIcon size={28} className="opacity-30" />
                </div>
            )}

            {isVideo && mediaUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="bg-white/25 backdrop-blur-md p-2.5 rounded-full border border-white/40 shadow-xl">
                        <PlayCircle size={featured ? 34 : 24} className="text-white" fill="currentColor" />
                    </div>
                </div>
            )}

            {/* Audio-only memory — special card design */}
            {hasAudio && !mediaUrl && !mediaLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                    style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.12), rgba(168,85,247,0.08))' }}>
                    <div className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.2), rgba(236,72,153,0.15))', border: '1.5px solid rgba(244,63,94,0.25)' }}>
                        <Mic size={22} className="text-rose-400" />
                    </div>
                    {/* Mini waveform bars */}
                    <div className="flex items-center gap-[2px] h-6">
                        {Array.from({ length: 16 }, (_, i) => {
                            const h = Math.sin((i / 16) * Math.PI) * 20 + 4;
                            return <div key={i} className="rounded-full" style={{ width: 2.5, height: h, background: `rgba(244,63,94,${0.25 + Math.sin((i / 16) * Math.PI) * 0.35})` }} />;
                        })}
                    </div>
                    {memory.audioDuration && (
                        <span className="text-[10px] font-mono tabular-nums" style={{ color: 'rgba(244,63,94,0.6)' }}>
                            {Math.floor(memory.audioDuration / 60).toString().padStart(2, '0')}:{Math.floor(memory.audioDuration % 60).toString().padStart(2, '0')}
                        </span>
                    )}
                </div>
            )}

            {/* Audio badge on photo/video cards */}
            {hasAudio && mediaUrl && (
                <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <Mic size={11} className="text-rose-400" />
                    {memory.audioDuration && (
                        <span className="text-[9px] font-mono tabular-nums text-white/80">
                            {Math.floor(memory.audioDuration / 60)}:{Math.floor(memory.audioDuration % 60).toString().padStart(2, '0')}
                        </span>
                    )}
                </div>
            )}

            {/* Soft bottom-only vignette — keeps the photo clear, just enough for legible caption */}
            <div className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none"
                style={{
                    background: 'linear-gradient(to top, rgba(20, 14, 8, 0.7) 0%, rgba(20, 14, 8, 0.25) 45%, transparent 100%)',
                }} />

            {/* Mood emoji sticker — pasted-on look, slight counter-rotation */}
            <div
                className="absolute z-10 flex items-center justify-center"
                style={{
                    top: featured ? 10 : 8,
                    left: featured ? 10 : 8,
                    width: featured ? 30 : 26,
                    height: featured ? 30 : 26,
                    background: '#fffaf2',
                    borderRadius: '50%',
                    transform: `rotate(${-tilt * 2.2}deg)`,
                    boxShadow: '0 1px 4px rgba(120, 53, 15, 0.25), inset 0 0 0 1.5px rgba(255,255,255,0.9)',
                }}
            >
                <span style={{ fontSize: featured ? 15 : 13, lineHeight: 1 }}>{mood}</span>
            </div>

            <button
                type="button"
                aria-label="Delete memory"
                data-memory-delete="true"
                onPointerDownCapture={openDeleteConfirm}
                onMouseDownCapture={openDeleteConfirm}
                onTouchStartCapture={openDeleteConfirm}
                onClickCapture={openDeleteConfirm}
                onClick={openDeleteConfirm}
                // 56×56 transparent hit zone INSIDE the card (was previously
                // positioned at -top-2 -right-2 which clipped the hit area
                // against the card's overflow-hidden boundary, killing taps
                // on some Android WebViews).
                className="absolute top-0 right-0 z-30 w-14 h-14 flex items-center justify-center active:scale-95 transition-all"
                style={{
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                    pointerEvents: 'auto',
                }}
            >
                <span
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                        background: 'rgba(20, 14, 8, 0.78)',
                        border: '1px solid rgba(255,255,255,0.22)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                    }}
                >
                    <Trash2 size={15} strokeWidth={2.2} className="text-white" />
                </span>
            </button>

            {/* Caption — handwritten date + serif text, no chip */}
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-6 pointer-events-none">
                <span
                    className="block leading-none mb-1"
                    style={{
                        fontFamily: '"Gloria Hallelujah", cursive',
                        fontSize: featured ? 14 : 12,
                        color: 'rgba(255, 248, 230, 0.95)',
                        textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                        transform: `rotate(${-tilt * 1.6}deg)`,
                        transformOrigin: 'left bottom',
                        display: 'inline-block',
                    }}
                >
                    {dateLabel}
                </span>
                {memory.text && (
                    <p
                        className="leading-snug font-serif italic"
                        style={{
                            fontSize: featured ? 13 : 11,
                            color: 'rgba(255, 248, 230, 0.92)',
                            textShadow: '0 1px 3px rgba(0,0,0,0.45)',
                            display: '-webkit-box',
                            WebkitLineClamp: featured ? 2 : 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        “{memory.text}”
                    </p>
                )}
            </div>
        </motion.div>
    );
};
const MemoryCard = React.memo(MemoryCardBase);

/* ─── Inline video player — capped height, contained ─── */
const InlineVideoPlayer = ({ src, onError }: { src: string; onError?: () => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetHide = useCallback(() => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setShowControls(true);
        hideTimer.current = setTimeout(() => setShowControls(false), 2800);
    }, []);

    useEffect(() => {
        resetHide();
        return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    }, []);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
        resetHide();
    };

    const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = (parseFloat(e.target.value) / 100) * v.duration;
        resetHide();
    };

    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    // Container is flex-centered with a hard cap — video is contained, not cropped
    return (
        <div
            className="relative w-full flex items-center justify-center overflow-hidden"
            style={{ maxHeight: '58vh', background: '#000' }}
            onClick={togglePlay}
        >
            <video
                ref={videoRef}
                src={src}
                playsInline
                preload="auto"
                style={{ display: 'block', maxWidth: '100%', maxHeight: '58vh', objectFit: 'contain' }}
                onError={onError}
                onTimeUpdate={e => setProgress((e.currentTarget.currentTime / (e.currentTarget.duration || 1)) * 100)}
                onLoadedMetadata={e => {
                    setDuration(e.currentTarget.duration);
                    e.currentTarget.play().then(() => setPlaying(true)).catch(() => {});
                }}
                onEnded={() => { setPlaying(false); setShowControls(true); if (hideTimer.current) clearTimeout(hideTimer.current); }}
                onTouchStart={resetHide}
            />

            {/* Controls overlay — covers the flex container, not just the video element */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 50%)' }}
                    >
                        {/* Centre play/pause */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto" onClick={togglePlay}>
                            <motion.div
                                key={playing ? 'p' : 'r'}
                                initial={{ scale: 0.75, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.75, opacity: 0 }}
                                transition={{ duration: 0.13 }}
                                className="w-14 h-14 rounded-full flex items-center justify-center"
                                style={{ background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.25)' }}
                            >
                                {playing
                                    ? <Pause size={22} fill="white" className="text-white" />
                                    : <Play size={22} fill="white" className="text-white" style={{ marginLeft: 2 }} />
                                }
                            </motion.div>
                        </div>

                        {/* Scrubber bar */}
                        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3.5 pointer-events-auto" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2.5">
                                <span className="text-white/60 text-[10px] tabular-nums w-7 text-right shrink-0">{fmt((progress / 100) * duration)}</span>
                                <div className="flex-1 relative h-[2.5px] rounded-full" style={{ background: 'rgba(255,255,255,0.22)' }}>
                                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress}%`, background: '#ec4899' }} />
                                    <input type="range" min={0} max={100} value={progress} onChange={seek}
                                        className="absolute opacity-0 cursor-pointer" style={{ inset: '-8px 0', width: '100%' }} />
                                </div>
                                <span className="text-white/60 text-[10px] tabular-nums w-7 shrink-0">{fmt(duration)}</span>
                                <button
                                    onClick={e => { e.stopPropagation(); const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } resetHide(); }}
                                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                                    style={{ background: 'rgba(255,255,255,0.12)', WebkitTapHighlightColor: 'transparent' }}
                                >
                                    {muted ? <VolumeX size={12} className="text-white" /> : <Volume2 size={12} className="text-white" />}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ─── Inline audio player for memories with voice notes ─── */
const InlineAudioPlayer: React.FC<{ memory: Memory }> = ({ memory }) => {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        let active = true;
        if (memory.audioId) {
            // Reuse the VoiceNote audio loader — audioId is the IndexedDB key
            StorageService.getVoiceNoteAudio({ audioId: memory.audioId, audioStoragePath: memory.audioStoragePath } as VoiceNote).then(url => {
                if (active && url) setAudioUrl(url);
            }).catch((e) => {
                console.warn('[MemoryTimeline] Failed to load voice note audio:', e);
                if (active) setAudioUrl(null);
            });
        }
        return () => { active = false; };
    }, [memory.audioId, memory.audioStoragePath]);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioUrl) return;
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrl);
            audioRef.current.ontimeupdate = () => {
                if (!audioRef.current) return;
                const t = audioRef.current.currentTime;
                setCurrentTime(t);
                setProgress(t / (audioRef.current.duration || 1));
            };
            audioRef.current.onended = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };
        }
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            // Reset the playing state if playback is refused (autoplay policy,
            // decode failure) so the button doesn't get stuck showing "pause".
            audioRef.current.play().catch((e) => {
                console.warn('[MemoryTimeline] Audio playback failed:', e);
                setIsPlaying(false);
            });
            setIsPlaying(true);
        }
    };

    useEffect(() => {
        return () => { audioRef.current?.pause(); };
    }, []);

    const dur = memory.audioDuration || 0;
    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

    return (
        <div className="mx-4 my-3 rounded-2xl p-4" style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.12)' }}>
            <div className="flex items-center gap-3">
                <button
                    onClick={togglePlay}
                    disabled={!audioUrl}
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-md disabled:opacity-40 active:scale-90 transition-transform"
                    style={{ background: 'linear-gradient(135deg, #f43f5e, #ec4899)' }}
                >
                    {isPlaying
                        ? <Pause size={16} fill="white" className="text-white" />
                        : <Play size={16} fill="white" className="text-white" style={{ marginLeft: 2 }} />
                    }
                </button>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <Mic size={11} className="text-rose-400 flex-shrink-0" />
                        <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>Voice Note</span>
                    </div>

                    {/* Waveform-style progress */}
                    <div className="flex items-center gap-[2px] h-5">
                        {Array.from({ length: 32 }, (_, i) => {
                            const filled = i / 32 <= progress;
                            const h = Math.sin((i / 32) * Math.PI) * 16 + 4;
                            return (
                                <div
                                    key={i}
                                    className="rounded-full transition-colors duration-150"
                                    style={{
                                        width: 2.5,
                                        height: h,
                                        background: filled
                                            ? 'rgba(244,63,94,0.8)'
                                            : 'rgba(255,255,255,0.12)',
                                    }}
                                />
                            );
                        })}
                    </div>

                    <div className="flex justify-between mt-1">
                        <span className="text-[9px] tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {fmtTime(currentTime)}
                        </span>
                        <span className="text-[9px] tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {fmtTime(dur)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Comment helpers ─── */
const timeAgo = (iso: string): string => {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000) return 'just now';
    if (d < 3600000) return `${Math.floor(d / 60000)}m`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
    if (d < 604800000) return `${Math.floor(d / 86400000)}d`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const AVATAR_PALETTE = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
const avatarColor = (name: string) => AVATAR_PALETTE[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_PALETTE.length];

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 28 }) => (
    <div
        className="shrink-0 flex items-center justify-center rounded-full font-bold text-white select-none"
        style={{ width: size, height: size, fontSize: size * 0.38, background: avatarColor(name), letterSpacing: '-0.02em' }}
    >
        {name[0]?.toUpperCase()}
    </div>
);

const CommentBubbleBase: React.FC<{
    comment: Comment;
    isOwn: boolean;
    isReply?: boolean;
    replyTarget?: Comment;
    onReply: (comment: Comment) => void;
    onDelete: (id: string) => void;
}> = ({ comment, isOwn, isReply, replyTarget, onReply, onDelete }) => (
    <div className="flex gap-2.5 items-start">
        <Avatar name={comment.senderName} size={isReply ? 22 : 27} />
        <div className="flex-1 min-w-0">
            <div
                className="rounded-2xl px-3 py-2"
                style={{
                    background: isOwn ? 'rgba(236,72,153,0.13)' : 'rgba(255,255,255,0.07)',
                    border: isOwn ? '1px solid rgba(236,72,153,0.18)' : '1px solid rgba(255,255,255,0.07)',
                }}
            >
                <span className="text-[11px] font-bold tracking-wide" style={{ color: isOwn ? '#f9a8d4' : 'rgba(255,255,255,0.55)' }}>
                    {comment.senderName}
                </span>
                <p className="text-[13.5px] leading-snug mt-0.5 whitespace-pre-wrap break-words" style={{ color: 'rgba(255,255,255,0.88)' }}>
                    {comment.text}
                </p>
            </div>
            <div className="flex items-center gap-3 mt-1 pl-1">
                <span className="text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,0.28)' }}>{timeAgo(comment.createdAt)}</span>
                <button
                    onClick={() => onReply(replyTarget ?? comment)}
                    className="text-[11px] font-semibold active:opacity-60"
                    style={{ color: 'rgba(255,255,255,0.38)' }}
                >Reply</button>
                {isOwn && (
                    <button
                        onClick={() => onDelete(comment.id)}
                        className="text-[11px] font-semibold active:opacity-60"
                        style={{ color: 'rgba(239,68,68,0.5)' }}
                    >Delete</button>
                )}
            </div>
        </div>
    </div>
);
const CommentBubble = React.memo(CommentBubbleBase);

/* ─── Detail modal ─── */
const MemoryDetailModal = ({ memory, onClose, onDelete, onNavigate, canNavigate, navDir }: {
    memory: Memory;
    onClose: () => void;
    onDelete: (id: string) => void;
    onNavigate: (direction: 1 | -1) => void;
    canNavigate: (direction: 1 | -1) => boolean;
    /** Direction of the last swipe navigation; 0 on fresh open. */
    navDir: number;
}) => {
    const deleteRequestScheduledRef = useRef(false);
    const imageStoragePath = selectImageStoragePath(memory.storagePath, memory.imageMimeType);
    const videoStoragePath = selectVideoStoragePath(memory.videoStoragePath, memory.storagePath, memory.videoMimeType || memory.imageMimeType);
    const isVideo = !!(memory.video || memory.videoId || videoStoragePath);
    const hasAudio = !!memory.audioId;
    const isAudioOnly = hasAudio && !memory.image && !memory.imageId && !imageStoragePath && !memory.video && !memory.videoId && !videoStoragePath;
    const { src: imageSrc, isLoading: isImageLoading, handleError: handleImageError } = useLiorMedia(
        memory.imageId,
        memory.image,
        imageStoragePath,
    );
    const { src: rawVideoSrc, isLoading: isVideoLoading, handleError: handleVideoError } = useLiorMedia(
        isVideo ? memory.videoId : undefined,
        isVideo ? memory.video : undefined,
        isVideo ? videoStoragePath : undefined,
    );
    const videoSrc = useVideoBlobUrl(isVideo ? rawVideoSrc : null);
    const mediaKind = isVideo && videoSrc ? 'video' : imageSrc ? 'image' : null;
    const mediaSrc = mediaKind === 'video' ? videoSrc : imageSrc;
    const mediaLoading = isVideo
        ? (!mediaSrc && (isImageLoading || isVideoLoading || (!!rawVideoSrc && !videoSrc)))
        : isImageLoading;
    const handleMediaError = mediaKind === 'video' ? handleVideoError : handleImageError;
    const mood = MOOD_MAP[memory.mood] || '✨';
    const fullDate = new Date(memory.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
    const time = new Date(memory.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    // ── Comments state ──
    const [comments, setComments] = useState<Comment[]>([]);
    const [inputText, setInputText] = useState('');
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // ── Native viewer gestures: pull-down dismiss, swipe prev/next, pinch ──
    const gestures = useViewerGestures({
        onDismiss: onClose,
        onNavigate,
        canNavigate,
        zoomEnabled: mediaKind === 'image',
    });

    // Swiping to another memory keeps the sheet mounted — reset transient
    // state so the new memory starts clean and scrolled to the top.
    useEffect(() => {
        gestures.resetAfterNavigate();
        scrollRef.current?.scrollTo({ top: 0 });
        setInputText('');
        setReplyingTo(null);
    }, [memory.id, gestures]);
    const profile = useMemo(() => StorageService.getCoupleProfile(), []);
    const myName = profile.myName;

    // Load comments + live updates
    const loadComments = useCallback(() => {
        setComments(StorageService.getComments(memory.id));
    }, [memory.id]);

    useEffect(() => {
        loadComments();
        const handler = () => loadComments();
        storageEventTarget.addEventListener('storage-update', handler);
        return () => storageEventTarget.removeEventListener('storage-update', handler);
    }, [loadComments]);

    // Thread structure
    const topLevel = useMemo(() =>
        comments.filter(c => !c.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        [comments]
    );
    const repliesMap = useMemo(() =>
        comments.filter(c => !!c.parentId).reduce((acc, r) => {
            const pid = r.parentId!;
            acc[pid] = [...(acc[pid] || []), r].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return acc;
        }, {} as Record<string, Comment[]>),
        [comments]
    );

    const sendComment = async () => {
        const text = inputText.trim();
        if (!text) return;
        const comment: Comment = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            postId: memory.id,
            senderId: myName,
            senderName: myName,
            text,
            createdAt: new Date().toISOString(),
            parentId: replyingTo?.id,
        };
        setInputText('');
        setReplyingTo(null);
        await StorageService.saveComment(comment);
        // Scroll to bottom after sending
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    };

    const startReply = useCallback((comment: Comment) => {
        setReplyingTo(comment);
        inputRef.current?.focus();
    }, []);

    const deleteComment = useCallback(async (id: string) => {
        await StorageService.deleteComment(id);
    }, []);
    const openMemoryDeleteConfirm = (
        e: React.PointerEvent<HTMLButtonElement>
            | React.MouseEvent<HTMLButtonElement>
            | React.TouchEvent<HTMLButtonElement>,
    ) => {
        e.stopPropagation();
        e.preventDefault();
        if (deleteRequestScheduledRef.current) return;
        deleteRequestScheduledRef.current = true;
        onDelete(memory.id);
        window.setTimeout(() => {
            deleteRequestScheduledRef.current = false;
        }, 500);
    };

    const shareMemory = async () => {
        Haptics.tap();
        const result = await ShareService.shareMemory(memory);
        if (result.shared && result.via === 'clipboard') {
            toast.show('Copied to clipboard', 'success');
        }
    };

    return ReactDOM.createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
            onClick={onClose}
        >
            {/* Gesture wrapper — follows the finger during pull-down dismiss.
                Kept separate from the inner sheet so the enter/exit spring
                and the live drag offset never fight over the same y. */}
            <motion.div className="w-full max-w-md flex flex-col min-h-0" style={{ y: gestures.sheetY }}>
            <motion.div
                // The hero photo morphs in via shared layoutId, so the sheet
                // itself must NOT slide (a slide would compound with the morph
                // and read as janky). It fades while the photo grows from the
                // tapped card. Drag-to-dismiss still uses the wrapper's sheetY.
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="w-full flex flex-col min-h-0 sm:rounded-[2rem] rounded-t-[2rem] overflow-hidden"
                style={{
                    // Warm wine-dark — same family as the Auth sheet, so the
                    // modal belongs to the app instead of the cold #111214
                    // grey that read like a different product.
                    background: 'linear-gradient(180deg, #2a1320 0%, #190b13 100%)',
                    maxHeight: '92vh',
                    border: '1px solid rgba(255,255,255,0.07)',
                    boxShadow: '0 -8px 52px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.07)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Drag handle — pull down to dismiss ── */}
                <div
                    className="flex items-center justify-center pt-2.5 pb-2 shrink-0"
                    style={{ touchAction: 'none' }}
                    {...gestures.heroHandlers}
                >
                    <span
                        aria-hidden
                        className="h-1.5 w-10 rounded-full"
                        style={{ background: 'rgba(255,210,228,0.22)' }}
                    />
                </div>

                {/* ── Scrollable body — editorial scrapbook layout ── */}
                <div ref={scrollRef} data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto overscroll-contain">
                    {/* Keyed per memory: swiping to a neighbour slides the new
                        content in from the swipe direction instead of
                        remounting the whole sheet. */}
                    <motion.div
                        key={memory.id}
                        initial={navDir !== 0 ? { x: navDir * 56, opacity: 0.4 } : false}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    >

                    {/* HERO — photo is the surface. Floating X over the
                        photo. Mood as a placed sticker. No bordered header
                        bar above to make it look like a generic media viewer.
                        All viewer gestures (pull-down dismiss, swipe between
                        memories, pinch zoom) start here. */}
                    <motion.div
                        className="relative"
                        style={{ x: gestures.heroX, touchAction: 'none' }}
                        {...gestures.heroHandlers}
                    >
                        <div
                            className="w-full overflow-hidden"
                            style={{
                                background: memory.frame === 'polaroid' ? '#fdfaf5'
                                    : memory.frame === 'film' ? 'linear-gradient(180deg, #1a1a1a, #0c0c0c)'
                                    : 'transparent',
                                padding: memory.frame === 'polaroid' ? '14px 14px 18px'
                                    : memory.frame === 'film' ? '6px'
                                    : 0,
                                boxShadow: memory.frame === 'glow'
                                    ? 'inset 0 0 0 1px rgba(244,114,182,0.30), 0 0 56px rgba(244,114,182,0.32) inset'
                                    : undefined,
                            }}
                        >
                            {mediaLoading ? (
                                <div className="flex items-center justify-center" style={{ height: '44vh' }}>
                                    <Skeleton type="image" className="w-full h-full rounded-none" />
                                </div>
                            ) : mediaSrc ? (
                                mediaKind === 'video'
                                    ? <InlineVideoPlayer src={mediaSrc} onError={handleVideoError} />
                                    : <motion.div
                                        layoutId={`mem-hero-${memory.id}`}
                                        transition={{ layout: { type: 'spring', stiffness: 300, damping: 34 } }}
                                        style={{ width: '100%' }}
                                      >
                                        <img ref={gestures.zoomTargetRef} src={mediaSrc} alt="Memory" onError={handleMediaError}
                                        draggable={false}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            maxHeight: '60vh',
                                            objectFit: 'contain',
                                            background: 'transparent',
                                            borderRadius: memory.frame === 'polaroid' ? 4 : memory.frame === 'film' ? 12 : 0,
                                            filter: memory.frame === 'film'
                                                ? 'saturate(1.18) contrast(1.04) sepia(0.12) brightness(0.97)'
                                                : undefined,
                                        }} />
                                      </motion.div>
                            ) : isAudioOnly ? (
                                <div className="flex flex-col items-center justify-center py-12"
                                    style={{ background: 'linear-gradient(180deg, rgba(244,63,94,0.08) 0%, rgba(28,12,20,1) 100%)' }}>
                                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                                        style={{ background: 'rgba(244,63,94,0.12)', border: '2px solid rgba(244,63,94,0.2)' }}>
                                        <Mic size={32} className="text-rose-400" />
                                    </div>
                                    <div className="flex items-center gap-[3px] h-8">
                                        {Array.from({ length: 24 }, (_, i) => {
                                            const h = Math.sin((i / 24) * Math.PI) * 28 + 4;
                                            return <div key={i} className="rounded-full" style={{ width: 3, height: h, background: `rgba(244,63,94,${0.15 + Math.sin((i / 24) * Math.PI) * 0.25})` }} />;
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center" style={{ height: '38vh' }}>
                                    <ImageIcon size={32} className="text-white/10" />
                                </div>
                            )}
                        </div>

                        {/* Floating X — top-right corner, dark scrim. */}
                        <button
                            onClick={e => { e.stopPropagation(); onClose(); }}
                            aria-label="Close"
                            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center active:scale-92 transition-transform z-10"
                            style={{
                                background: 'rgba(20,10,16,0.62)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                backdropFilter: 'blur(10px)',
                                WebkitBackdropFilter: 'blur(10px)',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                        >
                            <X size={15} style={{ color: 'rgba(255,235,243,0.92)' }} />
                        </button>

                        {/* Mood as a placed sticker — soft drop-shadow,
                            slightly rotated, sits over the bottom-left of
                            the photo like it was tacked on. */}
                        {mood && (
                            <span
                                aria-hidden
                                className="absolute"
                                style={{
                                    bottom: -14,
                                    left: 18,
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50%',
                                    background: '#fdfaf5',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.30), 0 0 0 4px rgba(253,250,245,0.18), inset 0 0 0 1px rgba(122,72,90,0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transform: 'rotate(-7deg)',
                                    zIndex: 5,
                                }}
                            >
                                <span style={{ fontSize: 22, lineHeight: 1 }}>{mood}</span>
                            </span>
                        )}
                    </motion.div>

                    {/* Voice note player */}
                    {hasAudio && <InlineAudioPlayer memory={memory} />}

                    {/* ── EDITORIAL DATE BLOCK ──
                        Big serif weekday + numeric date in masthead style,
                        with relationship-time tag ("Day N of us") if the
                        couple's anniversary is configured. */}
                    <div className="px-6 pt-7 pb-3">
                        {(() => {
                            const memDate = new Date(memory.date);
                            const weekday = memDate.toLocaleDateString(undefined, { weekday: 'long' });
                            const numDate = memDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
                            const yr = memDate.toLocaleDateString(undefined, { year: '2-digit' });
                            const anniversary = profile.anniversaryDate ? new Date(profile.anniversaryDate) : null;
                            const dayN = anniversary && !isNaN(anniversary.getTime())
                                ? Math.max(1, Math.floor((memDate.getTime() - anniversary.getTime()) / 86400000) + 1)
                                : null;
                            return (
                                <>
                                    <div className="flex items-baseline justify-between gap-4">
                                        <h2
                                            className="font-serif leading-[0.95]"
                                            style={{
                                                fontSize: 30,
                                                fontWeight: 600,
                                                color: '#f7e3eb',
                                                letterSpacing: '-0.018em',
                                            }}
                                        >
                                            {weekday}
                                        </h2>
                                        {dayN !== null && (
                                            <span
                                                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"
                                                style={{
                                                    color: '#f3d9a5',
                                                    background: 'rgba(243,217,165,0.10)',
                                                    border: '1px solid rgba(243,217,165,0.22)',
                                                    letterSpacing: '0.12em',
                                                }}
                                            >
                                                <Heart size={9} fill="currentColor" />
                                                Day {dayN} of us
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-2 text-[10.5px] font-semibold uppercase" style={{ color: 'rgba(255,210,230,0.45)', letterSpacing: '0.22em' }}>
                                        <span>{numDate}</span>
                                        <span style={{ opacity: 0.5 }}>·</span>
                                        <span>'{yr}</span>
                                        <span style={{ opacity: 0.5 }}>·</span>
                                        <span className="tabular-nums">{time}</span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* CAPTION — editorial serif body */}
                    {memory.text && (
                        <div className="px-6 pb-5">
                            <p
                                className="font-serif whitespace-pre-wrap"
                                style={{
                                    fontSize: '1.06rem',
                                    lineHeight: 1.62,
                                    color: 'rgba(255,232,242,0.88)',
                                    letterSpacing: '-0.004em',
                                }}
                            >
                                {memory.text}
                            </p>
                        </div>
                    )}

                    {/* Hairline rose-fade divider */}
                    <div
                        aria-hidden
                        className="mx-6 h-px"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(244,114,182,0.30), transparent)' }}
                    />

                    {/* REACTIONS ROW — replaces the "0 COMMENTS" Instagram
                        header. Small ghost chips on the left; a quiet delete
                        on the right so destructive action isn't a big red
                        blob in the title bar. */}
                    <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <span
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                                style={{
                                    color: 'rgba(244,114,182,0.92)',
                                    background: 'rgba(244,114,182,0.10)',
                                    border: '1px solid rgba(244,114,182,0.22)',
                                }}
                            >
                                <Heart size={12} strokeWidth={2.2} fill="currentColor" />
                                Loved
                            </span>
                            {(() => {
                                const total = topLevel.length + Object.values(repliesMap).flat().length;
                                return (
                                    <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                                        style={{
                                            color: 'rgba(255,232,242,0.7)',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.10)',
                                        }}
                                    >
                                        <MessageCircle size={12} strokeWidth={2.2} />
                                        {total} {total === 1 ? 'note' : 'notes'}
                                    </span>
                                );
                            })()}
                        </div>
                        <button
                            type="button"
                            aria-label="Share memory"
                            onClick={(e) => { e.stopPropagation(); void shareMemory(); }}
                            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform shrink-0"
                            style={{
                                WebkitTapHighlightColor: 'transparent',
                                touchAction: 'manipulation',
                            }}
                        >
                            <span
                                className="w-9 h-9 rounded-full flex items-center justify-center"
                                style={{
                                    background: 'rgba(236,72,153,0.12)',
                                    border: '1px solid rgba(236,72,153,0.22)',
                                }}
                            >
                                <Share2 size={13} className="text-pink-300/90" />
                            </span>
                        </button>
                        <button
                            type="button"
                            aria-label="Delete memory"
                            data-memory-delete="true"
                            onPointerDownCapture={openMemoryDeleteConfirm}
                            onMouseDownCapture={openMemoryDeleteConfirm}
                            onTouchStartCapture={openMemoryDeleteConfirm}
                            onClickCapture={openMemoryDeleteConfirm}
                            onClick={openMemoryDeleteConfirm}
                            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform shrink-0"
                            style={{
                                WebkitTapHighlightColor: 'transparent',
                                touchAction: 'manipulation',
                                pointerEvents: 'auto',
                            }}
                        >
                            <span
                                className="w-9 h-9 rounded-full flex items-center justify-center"
                                style={{
                                    background: 'rgba(239,68,68,0.10)',
                                    border: '1px solid rgba(239,68,68,0.20)',
                                }}
                            >
                                <Trash2 size={13} className="text-red-400/85" />
                            </span>
                        </button>
                    </div>

                    {/* Comment list */}
                    <div className="px-5 pb-4 space-y-4">
                        {topLevel.length === 0 && (
                            <p
                                className="text-center font-serif italic py-6"
                                style={{
                                    color: 'rgba(255,210,230,0.42)',
                                    fontSize: 13.5,
                                    letterSpacing: '0.005em',
                                }}
                            >
                                Leave a note for your future selves.
                            </p>
                        )}
                        {topLevel.map(comment => (
                            <div key={comment.id}>
                                <CommentBubble
                                    comment={comment}
                                    isOwn={comment.senderName === myName}
                                    onReply={startReply}
                                    onDelete={deleteComment}
                                />
                                {/* Threaded replies */}
                                {(repliesMap[comment.id] || []).map(reply => (
                                    <div key={reply.id} className="mt-2.5 pl-6 flex gap-1.5 items-start">
                                        <CornerDownRight size={11} className="shrink-0 mt-1" style={{ color: 'rgba(255,255,255,0.18)' }} />
                                        <div className="flex-1">
                                            <CommentBubble
                                                comment={reply}
                                                isOwn={reply.senderName === myName}
                                                isReply
                                                replyTarget={comment}
                                                onReply={startReply}
                                                onDelete={deleteComment}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                    </motion.div>
                </div>

                {/* ── Input bar — pinned at bottom ── */}
                <div className="shrink-0 px-4 pb-4 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(25,11,19,0.96)' }}>
                    {/* Replying to pill */}
                    <AnimatePresence>
                        {replyingTo && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className="overflow-hidden"
                            >
                                <div className="flex items-center justify-between mb-2 pl-1">
                                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                        Replying to <span className="font-bold" style={{ color: '#f9a8d4' }}>{replyingTo.senderName}</span>
                                    </span>
                                    <button onClick={() => setReplyingTo(null)} className="p-1 active:opacity-60">
                                        <X size={12} style={{ color: 'rgba(255,255,255,0.38)' }} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex items-center gap-2.5">
                        <Avatar name={myName} size={30} />
                        <div
                            className="flex-1 flex items-center gap-2 rounded-full px-4 py-2.5 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,210,230,0.14)' }}
                        >
                            <input
                                ref={inputRef}
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                                placeholder={replyingTo ? `Reply to ${replyingTo.senderName}…` : 'Write a note…'}
                                className="flex-1 bg-transparent font-serif italic text-[14px] outline-none min-w-0 placeholder:opacity-45"
                                style={{ color: '#f7e3eb', caretColor: '#f472b6' }}
                                autoComplete="off"
                            />
                            <AnimatePresence>
                                {inputText.trim() && (
                                    <motion.button
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        transition={springSnappy}
                                        onClick={sendComment}
                                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center active:scale-90"
                                        style={{ background: 'linear-gradient(135deg, #ec4899, #be185d)', WebkitTapHighlightColor: 'transparent' }}
                                    >
                                        <Send size={13} className="text-white" style={{ marginLeft: 1 }} />
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </motion.div>
            </motion.div>
        </motion.div>,
        document.body,
    );
};

/* ─── Main view ─── */
// Memoized below as `MemoryTimeline` — setView is referentially stable, so
// tab switches and other App-level renders bail out of this whole tree.
const MemoryTimelineView: React.FC<MemoryTimelineProps> = ({ setView }) => {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
    const [surpriseMemory, setSurpriseMemory] = useState<Memory | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const deletingMemoryIdsRef = useRef(new Set<string>());
    const [isRecoveringCloud, setIsRecoveringCloud] = useState(false);
    const recoveryAttemptedRef = useRef(false);

    useEffect(() => {
        const load = () => setMemories(StorageService.getMemories());
        load();
        storageEventTarget.addEventListener('storage-update', load);
        return () => storageEventTarget.removeEventListener('storage-update', load);
    }, []);

    // Background image recovery: if any images are missing from local IDB,
    // pull them back from Supabase cloud. Fires once on mount, safe to re-run.
    useEffect(() => {
        StorageService.recoverImagesFromCloud().catch(() => {});
    }, []);

    useEffect(() => {
        if (recoveryAttemptedRef.current) return;
        if (!SyncService.isConnected) return;
        if (memories.length > 0) return;

        recoveryAttemptedRef.current = true;
        setIsRecoveringCloud(true);
        SyncService.refreshFromCloud()
            .catch((error) => console.warn('Memory timeline refresh failed', error))
            .finally(() => setIsRecoveringCloud(false));
    }, [memories.length]);

    const handleRefresh = async () => {
        if (SyncService.isConnected) {
            setIsRecoveringCloud(true);
            await SyncService.refreshFromCloud().catch(() => {});
            await StorageService.recoverImagesFromCloud().catch(() => {});
            setIsRecoveringCloud(false);
        } else {
            await new Promise(r => setTimeout(r, 800));
        }
        setMemories(StorageService.getMemories());
    };

    const requestDelete = useCallback((id: string) => {
        setPendingDeleteId(id);
        try {
            feedback.tap();
        } catch {
            // Haptics/audio feedback should never block opening delete confirmation.
        }
    }, []);

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        const id = pendingDeleteId;
        if (deletingMemoryIdsRef.current.has(id)) return;
        deletingMemoryIdsRef.current.add(id);
        setPendingDeleteId(null);
        setMemories(prev => prev.filter(m => m.id !== id));
        setSelectedMemory(current => current?.id === id ? null : current);
        try {
            await StorageService.deleteMemory(id);
            toast.show('Memory deleted forever', 'success');
        } catch {
            setMemories(StorageService.getMemories());
            toast.show('Deleted here; cloud delete will retry', 'error');
        } finally {
            deletingMemoryIdsRef.current.delete(id);
        }
    };

    // Deterministic, pleasant tilt sequences — featured cards tilt slightly,
    // grid items alternate tighter angles. Pulled from per-group offset so each
    // chapter feels visually distinct without random instability across renders.
    const featuredTiltSeq = [-0.8, 1.2, -0.5, 0.9, -1.3, 0.6];
    const gridTiltSeqA = [1.1, -1.4, 0.7, -0.9, 1.3, -0.6];
    const gridTiltSeqB = [-1.2, 0.9, -0.7, 1.4, -1.1, 0.6];
    const featuredTilt = (g: number) => featuredTiltSeq[g % featuredTiltSeq.length];
    const gridTilt = (g: number, i: number) => {
        const seq = (g + i) % 2 === 0 ? gridTiltSeqA : gridTiltSeqB;
        return seq[(g * 3 + i) % seq.length];
    };

    const handleOpenMemory = useCallback((memory: Memory) => {
        navDirRef.current = 0;
        setSelectedMemory(memory);
    }, []);

    // ── Long-press context menu ──
    const [menuMemory, setMenuMemory] = useState<Memory | null>(null);

    const handleCardLongPress = useCallback((memory: Memory) => {
        Haptics.press();
        setMenuMemory(memory);
    }, []);

    const handleMenuShare = useCallback(async () => {
        if (!menuMemory) return;
        const result = await ShareService.shareMemory(menuMemory);
        if (result.shared && result.via === 'clipboard') {
            toast.show('Copied to clipboard', 'success');
        }
    }, [menuMemory]);

    const handleCloseMemory = useCallback(() => {
        setSelectedMemory(null);
    }, []);

    const handleSurprise = () => {
        if (memories.length === 0) return;
        feedback.celebrate();
        const random = memories[Math.floor(Math.random() * memories.length)];
        setSurpriseMemory(random);
    };

    // Sort newest first, then group by month
    const sorted = useMemo(() =>
        [...memories].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [memories]
    );

    // ── Swipe navigation between memories in the detail viewer ──
    // navDirRef carries the swipe direction into the next render so the
    // incoming content slides in from the correct side.
    const navDirRef = useRef<number>(0);

    const handleNavigateMemory = useCallback((direction: 1 | -1) => {
        feedback.light();
        navDirRef.current = direction;
        setSelectedMemory((current) => {
            if (!current) return current;
            const index = sorted.findIndex((m) => m.id === current.id);
            return sorted[index + direction] ?? current;
        });
    }, [sorted]);

    const canNavigateMemory = useCallback((direction: 1 | -1) => {
        if (!selectedMemory) return false;
        const index = sorted.findIndex((m) => m.id === selectedMemory.id);
        return index !== -1 && !!sorted[index + direction];
    }, [sorted, selectedMemory]);

    const grouped = useMemo(() => sorted.reduce((acc, m) => {
        const key = new Date(m.date).toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!acc[key]) acc[key] = [];
        acc[key].push(m);
        return acc;
    }, {} as Record<string, Memory[]>), [sorted]);

    const keys = useMemo(() =>
        Object.keys(grouped).sort((a, b) =>
            new Date(grouped[b][0].date).getTime() - new Date(grouped[a][0].date).getTime()
        ), [grouped]
    );

    // Journey stats (memo): total count, span in months, dominant mood
    const stats = useMemo(() => {
        if (memories.length === 0) return null;
        const sortedAsc = [...memories].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const first = new Date(sortedAsc[0].date);
        const last = new Date(sortedAsc[sortedAsc.length - 1].date);
        const monthSpan = Math.max(
            1,
            (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1,
        );
        const moodCounts: Record<string, number> = {};
        for (const m of memories) {
            if (!m.mood) continue;
            moodCounts[m.mood] = (moodCounts[m.mood] || 0) + 1;
        }
        const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        return { count: memories.length, monthSpan, topMood, topMoodEmoji: topMood ? (MOOD_MAP[topMood] || '✨') : '✨' };
    }, [memories]);

    return (
        <LayoutGroup>
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="memory-timeline-view p-4 pt-6 pb-32 min-h-screen">
                <ViewHeader title="Our Journey" onBack={() => setView('home')} variant="simple" />

                {/* Quiet Mode — ambient drift back through your memories */}
                {memories.length > 0 && (
                    <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={springSmooth}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setView('quiet-mode')}
                        className="block w-full text-left mb-5"
                    >
                        <div style={{ borderRadius: 22, padding: 4, background: 'linear-gradient(150deg, color-mix(in srgb, var(--color-lior-500) 30%, transparent), rgba(178,120,140,0.10) 50%, color-mix(in srgb, var(--color-lior-500) 30%, transparent))', boxShadow: '0 1px 2px rgba(178,120,140,0.10), 0 14px 30px -14px color-mix(in srgb, var(--color-lior-500) 30%, transparent)' }}>
                            <div className="relative flex items-center gap-3" style={{ borderRadius: 18, overflow: 'hidden', padding: '0.85rem 1rem', background: 'linear-gradient(135deg,#fbf6fa,#efe1ec)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)' }}>
                                <Moon aria-hidden size={80} strokeWidth={1} className="absolute pointer-events-none" style={{ right: -8, bottom: -14, color: 'var(--color-lior-600)', opacity: 0.08, transform: 'rotate(-10deg)' }} />
                                <span className="relative flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 40, height: 40, background: 'color-mix(in srgb, var(--color-lior-500) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--color-lior-500) 26%, transparent)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}>
                                    <Moon size={18} strokeWidth={1.7} style={{ color: 'var(--color-lior-600)' }} />
                                </span>
                                <div className="flex-1 relative">
                                    <p className="font-bold uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color: 'var(--color-lior-600)', opacity: 0.9 }}>Breathe</p>
                                    <p className="font-serif mt-0.5" style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.05 }}>Quiet Mode</p>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>drift back through your memories.</p>
                                </div>
                                <motion.span className="relative flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.85)', boxShadow: '0 3px 9px color-mix(in srgb, var(--color-lior-500) 16%, transparent), inset 0 1px 0 rgba(255,255,255,1)' }} whileTap={{ x: 2 }}>
                                    <ChevronRight size={16} strokeWidth={1.7} style={{ color: 'var(--color-lior-600)' }} />
                                </motion.span>
                            </div>
                        </div>
                    </motion.button>
                )}

                {memories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={springSmooth}
                            className="relative mb-8"
                        >
                            <div className="absolute inset-0 bg-lior-200/40 rounded-full blur-3xl animate-breathe-glow" />
                            <div className="relative p-8 glass-card rounded-full text-lior-400 shadow-float"
                                 style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,1)' }}>
                                <Calendar size={48} strokeWidth={1.5} />
                            </div>
                        </motion.div>
                        <motion.h2 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.15, duration: 0.8, ease: 'easeOut' }}
                            className="text-center mb-3 text-2xl font-serif font-bold tracking-tight px-10"
                            style={{ color: 'var(--color-text-primary)' }}
                        >
                            Your journey is waiting to be written
                        </motion.h2>
                        <motion.p 
                            initial={{ y: 15, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.25, duration: 0.8, ease: 'easeOut' }}
                            className="text-center text-[15px] mb-8 max-w-[260px] leading-relaxed" 
                            style={{ color: 'var(--color-text-secondary)' }}
                        >
                            {isRecoveringCloud ? 'Checking your cloud vault...' : 'Capture your first memory together and watch your map grow.'}
                        </motion.p>
                        
                        {isRecoveringCloud && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em]"
                                style={{ background: 'rgba(255,255,255,0.66)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.72)' }}>
                                <Sparkles size={14} className="animate-pulse" />
                                Syncing memories
                            </motion.div>
                        )}
                        
                        <motion.button
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4, type: 'spring' }}
                            onClick={() => setView('add-memory')}
                            className="px-8 py-4 bg-lior-500 text-white rounded-full text-sm font-bold uppercase tracking-[0.15em] shadow-lg shadow-lior-500/20 spring-press flex items-center gap-2.5 active:scale-95 transition-transform"
                        >
                            <Plus size={20} strokeWidth={2.5} /> Add Memory
                        </motion.button>
                    </div>
                ) : (
                    <>
                        {/* Stats strip — refined serif count + mood pill + a
                            rose-glass "Surprise me" chip. Replaces the rust
                            handwritten scrapbook HUD that clashed with the
                            app's rose-glass language. */}
                        {stats && (
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="flex items-center justify-between gap-3 mb-6 px-0.5"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="flex items-baseline gap-1.5">
                                        <span
                                            className="font-serif tabular-nums leading-none"
                                            style={{ fontSize: 26, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}
                                        >
                                            {stats.count}
                                        </span>
                                        <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.8 }}>
                                            {stats.count === 1 ? 'moment' : 'moments'}
                                        </span>
                                    </div>
                                    <span
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                                        style={{
                                            background: 'rgba(236,72,153,0.08)',
                                            border: '1px solid rgba(236,72,153,0.16)',
                                            color: '#be3d72',
                                        }}
                                    >
                                        <span style={{ fontSize: 13, lineHeight: 1 }}>{stats.topMoodEmoji}</span>
                                        most felt
                                    </span>
                                </div>
                                <motion.button
                                    onClick={handleSurprise}
                                    whileTap={{ scale: 0.94 }}
                                    aria-label="Open a random memory"
                                    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full"
                                    style={{
                                        background: 'rgba(255,255,255,0.88)',
                                        border: '1px solid rgba(236,72,153,0.20)',
                                        color: '#be3d72',
                                        boxShadow: '0 3px 10px rgba(236,72,153,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
                                        WebkitTapHighlightColor: 'transparent',
                                    }}
                                >
                                    {/* CSS keyframe (compositor) — the framer loop kept
                                        ticking main-thread JS even while this tab was
                                        cached under display:none. */}
                                    <span className="animate-sparkle-wiggle" style={{ display: 'inline-flex' }}>
                                        <Sparkles size={13} />
                                    </span>
                                    <span className="text-[12px] font-semibold">Surprise me</span>
                                </motion.button>
                            </motion.div>
                        )}

                        <div className="space-y-9">
                            <AnimatePresence initial={false}>
                                {keys.map((key, groupIdx) => {
                                    const group = grouped[key];
                                    const [featured, ...rest] = group;
                                    const [monthLabel, yearLabel] = key.split(' ');
                                    const yearShort = yearLabel ? `'${yearLabel.slice(-2)}` : '';

                                    return (
                                        <motion.section
                                            key={key}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: Math.min(groupIdx * 0.06, 0.24) }}
                                        >
                                            {/* Chapter heading — refined serif, no rotation hack */}
                                            <div className="flex items-end justify-between gap-3 mb-2.5 pl-0.5">
                                                <div className="flex items-baseline gap-1.5 min-w-0">
                                                    <h3
                                                        className="font-serif leading-none truncate"
                                                        style={{
                                                            fontSize: 23,
                                                            fontWeight: 600,
                                                            color: 'var(--color-text-primary)',
                                                            letterSpacing: '-0.012em',
                                                        }}
                                                    >
                                                        {monthLabel}
                                                    </h3>
                                                    {yearShort && (
                                                        <span
                                                            className="font-serif leading-none"
                                                            style={{
                                                                fontSize: 15,
                                                                color: 'var(--color-text-secondary)',
                                                                opacity: 0.55,
                                                            }}
                                                        >
                                                            {yearShort}
                                                        </span>
                                                    )}
                                                </div>
                                                <span
                                                    className="shrink-0 text-[10px] font-semibold uppercase tabular-nums"
                                                    style={{
                                                        color: 'var(--color-text-secondary)',
                                                        opacity: 0.5,
                                                        letterSpacing: '0.14em',
                                                    }}
                                                >
                                                    {group.length === 1 ? '1 page' : `${group.length} pages`}
                                                </span>
                                            </div>
                                            {/* Clean hairline rule — rose fade, replaces the rust wavy SVG */}
                                            <div
                                                aria-hidden
                                                className="h-px w-full mb-4"
                                                style={{
                                                    background: 'linear-gradient(90deg, rgba(236,72,153,0.28), rgba(236,72,153,0.08) 55%, transparent)',
                                                }}
                                            />

                                            {/* Featured polaroid — chapter centerpiece */}
                                            <AnimatePresence initial={false}>
                                                <div className="mb-4 px-1">
                                                    <MemoryCard
                                                        key={featured.id}
                                                        memory={featured}
                                                        index={groupIdx * 10}
                                                        featured
                                                        tilt={featuredTilt(groupIdx)}
                                                        onOpen={handleOpenMemory}
                                                        onDelete={requestDelete}
                                                        onLongPress={handleCardLongPress}
                                                    />
                                                </div>
                                            </AnimatePresence>

                                            {/* Scrapbook grid — alternating tilts */}
                                            {rest.length > 0 && (
                                                <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-1">
                                                    <AnimatePresence initial={false}>
                                                        {rest.map((m, i) => (
                                                            <MemoryCard
                                                                key={m.id}
                                                                memory={m}
                                                                index={groupIdx * 10 + i + 1}
                                                                tilt={gridTilt(groupIdx, i)}
                                                                onOpen={handleOpenMemory}
                                                                onDelete={requestDelete}
                                                                onLongPress={handleCardLongPress}
                                                            />
                                                        ))}
                                                    </AnimatePresence>
                                                </div>
                                            )}
                                        </motion.section>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </>
                )}

                <ActionSheet
                    open={!!menuMemory}
                    onClose={() => setMenuMemory(null)}
                    title={menuMemory?.text?.trim() || 'Memory'}
                    items={[
                        {
                            icon: <Share2 size={16} />,
                            label: 'Share',
                            sublabel: 'Send this memory outside Lior',
                            onSelect: () => { void handleMenuShare(); },
                        },
                        {
                            icon: <Trash2 size={16} />,
                            label: 'Delete',
                            sublabel: 'Removes it for both of you',
                            destructive: true,
                            onSelect: () => { if (menuMemory) requestDelete(menuMemory.id); },
                        },
                    ]}
                />

                <AnimatePresence>
                    {selectedMemory && (
                        <MemoryDetailModal
                            // Stable key: swiping between memories swaps the
                            // content in place instead of replaying the whole
                            // sheet's enter/exit animation.
                            key="memory-detail"
                            memory={selectedMemory}
                            onClose={handleCloseMemory}
                            onDelete={requestDelete}
                            onNavigate={handleNavigateMemory}
                            canNavigate={canNavigateMemory}
                            navDir={navDirRef.current}
                        />
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {surpriseMemory && (
                        <SurpriseModal
                            key={surpriseMemory.id}
                            memory={surpriseMemory}
                            onClose={() => setSurpriseMemory(null)}
                        />
                    )}
                </AnimatePresence>

                <ConfirmModal
                    isOpen={pendingDeleteId !== null}
                    title="Delete memory?"
                    message="This removes it from your devices and cloud vault for good."
                    confirmLabel="Delete Forever"
                    cancelLabel="Keep Memory"
                    variant="danger"
                    onConfirm={confirmDelete}
                    onCancel={() => setPendingDeleteId(null)}
                />
            </div>
        </PullToRefresh>
        </LayoutGroup>
    );
};

export const MemoryTimeline = React.memo(MemoryTimelineView);

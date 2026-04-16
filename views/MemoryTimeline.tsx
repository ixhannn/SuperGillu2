
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Trash2, Image as ImageIcon, PlayCircle, Plus, Calendar, Sparkles, Heart, X, Pause, Play, Volume2, VolumeX, Send, MessageCircle, CornerDownRight } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState, Memory, Note, Comment } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService } from '../services/sync';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { useLiorMedia } from '../hooks/useLiorImage';
import { Skeleton } from '../components/Skeleton';
import { PullToRefresh } from '../components/PullToRefresh';
import { motion, AnimatePresence } from 'framer-motion';

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
const MemoryCard: React.FC<{
    memory: Memory;
    index: number;
    featured?: boolean;
    onClick: () => void;
    onDelete: (id: string) => void;
}> = ({ memory, index, featured = false, onClick, onDelete }) => {
    const isVideo = !!memory.video || !!memory.videoId;
    const { src: thumbUrl, isLoading, handleError: handleThumbError } = useLiorMedia(memory.imageId, memory.image, memory.storagePath);
    const { src: videoThumbUrl, handleError: handleVideoThumbError } = useLiorMedia(
        !memory.imageId ? memory.videoId : undefined,
        !memory.imageId ? memory.video : undefined,
        !memory.imageId ? memory.videoStoragePath : undefined,
    );
    const mediaUrl = thumbUrl || videoThumbUrl;
    const handleMediaError = thumbUrl ? handleThumbError : handleVideoThumbError;
    const dateLabel = new Date(memory.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const mood = MOOD_MAP[memory.mood] || '✨';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => { feedback.light(); onClick(); }}
            whileTap={{ scale: 0.97 }}
            className="relative overflow-hidden cursor-pointer"
            style={{
                borderRadius: '1.25rem',
                boxShadow: '0 2px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
                aspectRatio: featured ? '4/3' : '3/4',
                background: 'rgba(var(--theme-particle-2-rgb),0.08)',
            }}
        >
            {isLoading ? (
                <Skeleton type="image" className="absolute inset-0 w-full h-full rounded-none" />
            ) : mediaUrl ? (
                <img src={mediaUrl} alt="Memory" className="absolute inset-0 w-full h-full object-cover" onError={handleMediaError} />
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

            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.08) 50%, transparent 75%)' }} />

            <button
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                onClick={e => { e.stopPropagation(); e.preventDefault(); onDelete(memory.id); }}
                className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{
                    background: 'rgba(0,0,0,0.38)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                }}
            >
                <Trash2 size={13} className="text-white" />
            </button>

            <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pointer-events-none">
                <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-white font-semibold text-[12px] leading-tight drop-shadow">{dateLabel}</p>
                        {memory.text && (
                            <p className="text-white/75 mt-0.5 leading-snug drop-shadow line-clamp-1" style={{ fontSize: featured ? '12px' : '11px' }}>
                                {memory.text}
                            </p>
                        )}
                    </div>
                    <span className="text-xl leading-none shrink-0">{mood}</span>
                </div>
            </div>
        </motion.div>
    );
};

/* ─── Inline video player — capped height, contained ─── */
const InlineVideoPlayer = ({ src }: { src: string }) => {
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

const CommentBubble: React.FC<{
    comment: Comment;
    isOwn: boolean;
    isReply?: boolean;
    onReply: () => void;
    onDelete: () => void;
}> = ({ comment, isOwn, isReply, onReply, onDelete }) => (
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
                    onClick={onReply}
                    className="text-[11px] font-semibold active:opacity-60"
                    style={{ color: 'rgba(255,255,255,0.38)' }}
                >Reply</button>
                {isOwn && (
                    <button
                        onClick={onDelete}
                        className="text-[11px] font-semibold active:opacity-60"
                        style={{ color: 'rgba(239,68,68,0.5)' }}
                    >Delete</button>
                )}
            </div>
        </div>
    </div>
);

/* ─── Detail modal ─── */
const MemoryDetailModal = ({ memory, onClose, onDelete }: {
    memory: Memory;
    onClose: () => void;
    onDelete: (id: string) => void;
}) => {
    const isVideo = !!memory.video || !!memory.videoId;
    const { src: rawSrc, isLoading, handleError: handleMediaError } = useLiorMedia(
        memory.videoId || memory.imageId,
        memory.video || memory.image,
        memory.videoStoragePath || memory.storagePath,
    );
    const videoSrc = useVideoBlobUrl(isVideo ? rawSrc : null);
    const mediaSrc = isVideo ? videoSrc : rawSrc;
    const mood = MOOD_MAP[memory.mood] || '✨';
    const fullDate = new Date(memory.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
    const time = new Date(memory.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    // ── Comments state ──
    const [comments, setComments] = useState<Comment[]>([]);
    const [inputText, setInputText] = useState('');
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
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

    const startReply = (comment: Comment) => {
        setReplyingTo(comment);
        inputRef.current?.focus();
    };

    const deleteComment = async (id: string) => {
        await StorageService.deleteComment(id);
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
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 340, damping: 34 }}
                className="w-full max-w-md flex flex-col sm:rounded-[2rem] rounded-t-[2rem] overflow-hidden"
                style={{ background: '#111214', maxHeight: '92vh', boxShadow: '0 -2px 48px rgba(0,0,0,0.6)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header — always visible ── */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                        onClick={e => { e.stopPropagation(); onClose(); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
                        style={{ background: 'rgba(255,255,255,0.07)', WebkitTapHighlightColor: 'transparent' }}
                    >
                        <X size={16} className="text-white/60" />
                    </button>
                    <div className="flex-1 flex flex-col items-center mx-3 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="text-base leading-none">{mood}</span>
                            <span className="text-[13px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{fullDate}</span>
                        </div>
                        <span className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>{time}</span>
                    </div>
                    <button
                        onClick={e => { e.stopPropagation(); onDelete(memory.id); onClose(); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
                        style={{ background: 'rgba(239,68,68,0.1)', WebkitTapHighlightColor: 'transparent' }}
                    >
                        <Trash2 size={15} className="text-red-400" />
                    </button>
                </div>

                {/* ── Scrollable body: media + caption + comments ── */}
                <div ref={scrollRef} data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto overscroll-contain">

                    {/* Media */}
                    <div className="w-full" style={{ background: '#000' }}>
                        {isLoading ? (
                            <div className="flex items-center justify-center" style={{ height: '38vh' }}>
                                <Skeleton type="image" className="w-full h-full rounded-none" />
                            </div>
                        ) : mediaSrc ? (
                            isVideo
                                ? <InlineVideoPlayer src={mediaSrc} />
                                : <img src={mediaSrc} alt="Memory" onError={handleMediaError}
                                    style={{ display: 'block', width: '100%', maxHeight: '55vh', objectFit: 'contain', background: '#000' }} />
                        ) : (
                            <div className="flex items-center justify-center" style={{ height: '36vh' }}>
                                <ImageIcon size={32} className="text-white/10" />
                            </div>
                        )}
                    </div>

                    {/* Caption */}
                    {memory.text && (
                        <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <p className="font-serif text-[1rem] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.75)' }}>
                                {memory.text}
                            </p>
                        </div>
                    )}

                    {/* Comments header */}
                    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                        <MessageCircle size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {topLevel.length + Object.values(repliesMap).flat().length} {topLevel.length + Object.values(repliesMap).flat().length === 1 ? 'comment' : 'comments'}
                        </span>
                    </div>

                    {/* Comment list */}
                    <div className="px-4 pb-4 space-y-4">
                        {topLevel.length === 0 && (
                            <p className="text-center py-4 text-[12px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
                                No comments yet — say something ✨
                            </p>
                        )}
                        {topLevel.map(comment => (
                            <div key={comment.id}>
                                <CommentBubble
                                    comment={comment}
                                    isOwn={comment.senderName === myName}
                                    onReply={() => startReply(comment)}
                                    onDelete={() => deleteComment(comment.id)}
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
                                                onReply={() => startReply(comment)}
                                                onDelete={() => deleteComment(reply.id)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Input bar — pinned at bottom ── */}
                <div className="shrink-0 px-4 pb-4 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#111214' }}>
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
                            className="flex-1 flex items-center gap-2 rounded-full px-4 py-2.5"
                            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <input
                                ref={inputRef}
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                                placeholder={replyingTo ? `Reply to ${replyingTo.senderName}…` : 'Add a comment…'}
                                className="flex-1 bg-transparent text-[13px] outline-none min-w-0"
                                style={{ color: 'rgba(255,255,255,0.88)', caretColor: '#ec4899' }}
                                autoComplete="off"
                            />
                            <AnimatePresence>
                                {inputText.trim() && (
                                    <motion.button
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
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
        </motion.div>,
        document.body,
    );
};

/* ─── Main view ─── */
export const MemoryTimeline: React.FC<MemoryTimelineProps> = ({ setView }) => {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
    const [surpriseMemory, setSurpriseMemory] = useState<Memory | null>(null);
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

    const handleDelete = (id: string) => {
        feedback.tap();
        setMemories(prev => prev.filter(m => m.id !== id));
        setSelectedMemory(null);
        StorageService.deleteMemory(id).catch(() => {
            setMemories(StorageService.getMemories());
            toast.show('Could not delete memory', 'error');
        });
        toast.show('Memory deleted', 'success');
    };

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

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="p-4 pt-6 pb-32 min-h-screen">
                <ViewHeader title="Our Journey" onBack={() => setView('home')} variant="simple" />

                {memories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
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
                        {/* Surprise button */}
                        <motion.button
                            onClick={handleSurprise}
                            whileTap={{ scale: 0.96 }}
                            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl mb-8 cursor-pointer shadow-sm relative overflow-hidden group"
                            style={{
                                background: 'linear-gradient(135deg, rgba(236,72,153,0.06), rgba(251,207,232,0.12))',
                                border: '1.5px solid rgba(236,72,153,0.12)',
                            }}
                        >
                            <motion.div
                                animate={{ rotate: [0, 10, -10, 0] }}
                                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                            >
                                <Sparkles size={16} style={{ color: '#ec4899' }} />
                            </motion.div>
                            <span className="text-[14px] font-bold tracking-wide uppercase" style={{ color: '#be185d' }}>Surprise me</span>
                            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-pink-400/20 scale-x-0 group-active:scale-x-100 transition-transform duration-500" />
                        </motion.button>

                        <div className="space-y-10">
                            <AnimatePresence mode="popLayout">
                                {keys.map((key, groupIdx) => {
                                    const group = grouped[key];
                                    const [featured, ...rest] = group;

                                    return (
                                        <motion.div key={key} layout exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                                            {/* Month divider */}
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="flex-1 h-px" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.15)' }} />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
                                                    {key}
                                                </span>
                                                <span className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded-full"
                                                    style={{ background: 'rgba(var(--theme-particle-2-rgb),0.1)', color: 'var(--color-text-secondary)' }}>
                                                    {group.length}
                                                </span>
                                                <div className="flex-1 h-px" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.15)' }} />
                                            </div>

                                            {/* Featured */}
                                            <AnimatePresence mode="popLayout">
                                                <div className="mb-3">
                                                    <MemoryCard
                                                        key={featured.id}
                                                        memory={featured}
                                                        index={groupIdx * 10}
                                                        featured
                                                        onClick={() => setSelectedMemory(featured)}
                                                        onDelete={handleDelete}
                                                    />
                                                </div>
                                            </AnimatePresence>

                                            {/* Grid */}
                                            {rest.length > 0 && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <AnimatePresence mode="popLayout">
                                                        {rest.map((m, i) => (
                                                            <MemoryCard
                                                                key={m.id}
                                                                memory={m}
                                                                index={groupIdx * 10 + i + 1}
                                                                onClick={() => setSelectedMemory(m)}
                                                                onDelete={handleDelete}
                                                            />
                                                        ))}
                                                    </AnimatePresence>
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </>
                )}

                <AnimatePresence>
                    {selectedMemory && (
                        <MemoryDetailModal
                            key={selectedMemory.id}
                            memory={selectedMemory}
                            onClose={() => setSelectedMemory(null)}
                            onDelete={handleDelete}
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
            </div>
        </PullToRefresh>
    );
};

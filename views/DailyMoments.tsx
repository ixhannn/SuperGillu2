import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Camera, Clock, Plus, Trash2, X, Sparkles, Loader2, RefreshCw, ArrowLeft, Video, PlayCircle, Send, Reply, MessageCircle, Heart } from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ViewState, DailyPhoto, Comment } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useLiorMedia } from '../hooks/useLiorImage';
import { useNativeShell } from '../hooks/useNativeShell';
import { useInViewVideo } from '../hooks/useInViewVideo';
import { ViewHeader } from '../components/ViewHeader';
import { PullToRefresh } from '../components/PullToRefresh';
import { Skeleton } from '../components/Skeleton';
import { SkeletonReveal } from '../components/SkeletonReveal';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { springSmooth } from '../utils/motion';
import { ConfirmModal } from '../components/ConfirmModal';
import { PremiumModal, type PremiumFeatureContext } from '../components/PremiumModal';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';
import { getDailyMomentCountdown, isDailyMomentExpired } from '../shared/mediaRetention.js';
import { selectImageStoragePath, selectVideoStoragePath } from '../utils/mediaRefs';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { useDraft } from '../hooks/useDraft';

interface DailyMomentsProps {
    setView: (view: ViewState) => void;
}

// ─── Thumbnail Card (with blurred bg + object-contain for zero cropping) ─────
const PHOTO_GRID_ITEM_VARIANTS: Variants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

const PhotoCardBase: React.FC<{ photo: DailyPhoto, onOpen: (photo: DailyPhoto) => void }> = ({ photo, onOpen }) => {
    const deleteHandledRef = useRef(false);
    const imageStoragePath = selectImageStoragePath(photo.storagePath, photo.imageMimeType);
    const videoStoragePath = selectVideoStoragePath(photo.videoStoragePath, photo.storagePath, photo.videoMimeType || photo.imageMimeType);
    const isVideo = !!(photo.video || photo.videoId || videoStoragePath);
    const { src: thumbUrl, isLoading: isThumbLoading, handleError: handleThumbError } = useLiorMedia(photo.imageId, photo.image, imageStoragePath);
    const shouldResolveVideoPreview = isVideo && !thumbUrl && !isThumbLoading;
    const { src: videoPreviewUrl, isLoading: isVideoLoading, handleError: handleVideoError } = useLiorMedia(
        shouldResolveVideoPreview ? photo.videoId : undefined,
        shouldResolveVideoPreview ? photo.video : undefined,
        shouldResolveVideoPreview ? videoStoragePath : undefined,
    );
    const mediaUrl = thumbUrl || videoPreviewUrl;
    const mediaKind = thumbUrl ? 'image' : videoPreviewUrl ? 'video' : null;
    const isLoading = isThumbLoading || (shouldResolveVideoPreview && isVideoLoading && !mediaUrl);
    const handleMediaError = mediaKind === 'video' ? handleVideoError : handleThumbError;
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const updateTimer = () => {
            setTimeLeft(getDailyMomentCountdown(photo).label);
        };

        updateTimer();
        const timer = setInterval(updateTimer, 60000);
        return () => clearInterval(timer);
    }, [photo.expiresAt]);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // Only decode/play the preview clip while it is on (or near) screen.
    const inViewVideoRef = useInViewVideo();

    const openDeleteConfirm = (e: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        e.preventDefault();
        setShowDeleteConfirm(true);
    };
    const handleDeletePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType === 'mouse') return;
        deleteHandledRef.current = true;
        openDeleteConfirm(e);
        window.setTimeout(() => { deleteHandledRef.current = false; }, 350);
    };
    const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (deleteHandledRef.current) {
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        openDeleteConfirm(e);
    };

    const confirmDelete = async () => {
        await StorageService.deleteDailyPhoto(photo.id);
        setShowDeleteConfirm(false);
    };

    return (
        <>
        <motion.div
            data-daily-photo-card="true"
            onClick={() => onOpen(photo)}
            className="perf-list-item relative group overflow-hidden glass-card aspect-[3/4] cursor-pointer spring-press transition-transform"
        >
            {isLoading ? (
                <Skeleton type="image" className="absolute inset-0 w-full h-full rounded-none" />
            ) : mediaUrl ? (
                <div className="relative w-full h-full">
                    {/* Blurred background layer — prevents black bars */}
                    {mediaKind === 'image' ? (
                        <img
                            src={mediaUrl}
                            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60"
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        // Warm placeholder (not pure black) behind a letterboxed
                        // video until its first frame decodes — removes the hard
                        // black blink on scroll-in for the thumbnail-less fallback.
                        <div className="absolute inset-0" aria-hidden="true" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.08)' }} />
                    )}
                    {/* Sharp foreground — using object-cover for clean grid thumbnails */}
                    {mediaKind === 'video' ? (
                        <>
                            <motion.video
                                ref={inViewVideoRef}
                                initial={{ y: -20, scale: 1.15 }}
                                whileInView={{ y: 0, scale: 1 }}
                                viewport={{ once: true, margin: "50px 0px" }}
                                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                                src={mediaUrl}
                                className="relative w-full h-full object-cover z-[1]"
                                muted
                                playsInline
                                loop
                                preload="metadata"
                                onError={handleMediaError}
                            />
                            <div className="absolute inset-0 flex items-center justify-center z-[2]">
                                <div className="bg-white/30 backdrop-blur-lg p-3 rounded-full border border-white/40 shadow-2xl transition-transform">
                                    <PlayCircle size={32} className="text-white drop-shadow-lg" fill="currentColor" />
                                </div>
                            </div>
                        </>
                    ) : (
                        <motion.img 
                            initial={{ y: -20, scale: 1.15 }}
                            whileInView={{ y: 0, scale: 1 }}
                            viewport={{ once: true, margin: "50px 0px" }}
                            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                            src={mediaUrl} 
                            className="relative w-full h-full object-cover z-[1]" 
                            alt="Daily moment"
                            loading="lazy"
                            decoding="async"
                            onError={handleMediaError}
                        />
                    )}

                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center" style={{ color: 'var(--color-text-secondary)', background: 'rgba(var(--theme-particle-2-rgb),0.08)' }}>
                    <Camera size={28} className="mb-3 opacity-30" />
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Media Unavailable</span>
                </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex flex-col justify-end p-4 pointer-events-none z-10">
                <p className="text-white font-medium text-sm mb-1 line-clamp-2 drop-shadow-md">{photo.caption}</p>
                <div className="flex items-center gap-1 text-[10px] text-white/90">
                    <Clock size={10} />
                    <span className="font-bold uppercase tracking-widest">{timeLeft}</span>
                </div>
            </div>

            <button
                type="button"
                aria-label="Delete moment"
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={handleDeletePointerUp}
                onClick={handleDeleteClick}
                className="absolute top-2 right-2 p-2 bg-black/45 backdrop-blur-md rounded-full text-white transition-opacity z-20 active:scale-90"
            >
                <Trash2 size={16} />
            </button>
        </motion.div>

        <ConfirmModal
            isOpen={showDeleteConfirm}
            title="Delete Moment"
            message="Delete this moment?"
            confirmLabel="Delete"
            variant="danger"
            onConfirm={confirmDelete}
            onCancel={() => setShowDeleteConfirm(false)}
        />
        </>
    );
};
const PhotoCard = React.memo(PhotoCardBase);

const PhotoGridItem = React.memo(({
    photo,
    onOpen,
}: {
    photo: DailyPhoto;
    onOpen: (photo: DailyPhoto) => void;
}) => (
    <motion.div variants={PHOTO_GRID_ITEM_VARIANTS}>
        <PhotoCard photo={photo} onOpen={onOpen} />
    </motion.div>
));

// ─── Comment Bubble ──────────────────────────────────────────────────────────
const CommentBubbleBase: React.FC<{
    comment: Comment;
    isReply?: boolean;
    onReply: (comment: Comment) => void;
    onDelete: (id: string) => void;
    myDeviceId: string;
}> = ({ comment, isReply, onReply, onDelete, myDeviceId }) => {
    const isMine = comment.senderId === myDeviceId;
    const time = new Date(comment.createdAt);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`flex gap-2.5 ${isReply ? 'ml-10' : ''}`}
        >
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${isMine ? 'bg-lior-500/15 text-lior-400' : 'bg-blue-500/15 text-blue-400'}`}>
                {comment.senderName.charAt(0).toUpperCase()}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 ${isMine ? 'bg-lior-500/10 border border-lior-500/20' : ''}`}
                    style={!isMine ? { background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.14)' } : {}}>
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-bold" style={{ color: 'var(--color-text-primary)' }}>{comment.senderName}</span>
                        <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{timeStr}</span>
                    </div>
                    <p className="text-[13px] leading-snug break-words" style={{ color: 'var(--color-text-primary)' }}>{comment.text}</p>
                </div>
                <div className="flex items-center gap-4 mt-1 ml-1">
                    <button
                        onClick={() => onReply(comment)}
                        className="text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                        style={{ color: 'var(--color-text-secondary)' }}
                    >
                        <Reply size={10} /> Reply
                    </button>
                    {isMine && (
                        <button
                            onClick={() => onDelete(comment.id)}
                            className="text-[10px] font-bold uppercase tracking-wider transition-colors"
                            style={{ color: 'var(--color-text-secondary)' }}
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
const CommentBubble = React.memo(CommentBubbleBase);

// ─── Full-Screen Post Viewer with Comments ───────────────────────────────────
const PostViewer: React.FC<{
    photo: DailyPhoto;
    onClose: () => void;
}> = ({ photo, onClose }) => {
    const imageStoragePath = selectImageStoragePath(photo.storagePath, photo.imageMimeType);
    const videoStoragePath = selectVideoStoragePath(photo.videoStoragePath, photo.storagePath, photo.videoMimeType || photo.imageMimeType);
    const isVideo = !!(photo.video || photo.videoId || videoStoragePath);
    const { src: mediaSrc, isLoading: mediaLoading, handleError: handleMediaError } = useLiorMedia(
        isVideo ? (photo.videoId || photo.imageId) : photo.imageId,
        isVideo ? (photo.video || photo.image) : photo.image,
        isVideo ? (videoStoragePath || imageStoragePath) : imageStoragePath
    );
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentText, setCommentText] = useState('');
    const [replyTo, setReplyTo] = useState<Comment | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const commentInputRef = useRef<HTMLInputElement>(null);
    const commentsEndRef = useRef<HTMLDivElement>(null);
    const myDeviceId = StorageService.getDeviceId();
    // Lift the comment input bar above the IME: overlay keyboard mode never
    // resizes the WebView, so this fixed full-screen portal is otherwise covered.
    const { keyboardOpen, keyboardHeight } = useNativeShell();
    const profile = StorageService.getCoupleProfile();

    // Load comments
    useEffect(() => {
        const loadComments = () => {
            setComments(StorageService.getComments(photo.id));
        };
        loadComments();
        storageEventTarget.addEventListener('storage-update', loadComments);
        return () => storageEventTarget.removeEventListener('storage-update', loadComments);
    }, [photo.id]);

    // Auto-scroll to new comments
    useEffect(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [comments.length]);

    const handleSubmitComment = async () => {
        const text = commentText.trim();
        if (!text || isSubmitting) return;
        setIsSubmitting(true);

        const newComment: Comment = {
            id: generateId(),
            postId: photo.id,
            senderId: myDeviceId,
            senderName: profile.myName,
            text,
            createdAt: new Date().toISOString(),
            parentId: replyTo?.id
        };

        await StorageService.saveComment(newComment);
        setCommentText('');
        setReplyTo(null);
        setIsSubmitting(false);
    };

    const handleReply = useCallback((comment: Comment) => {
        setReplyTo(comment);
        commentInputRef.current?.focus();
    }, []);

    const handleDeleteComment = useCallback(async (id: string) => {
        await StorageService.deleteComment(id);
    }, []);

    // Organize comments into threads
    const topLevelComments = useMemo(
        () => comments.filter(c => !c.parentId),
        [comments],
    );
    const repliesByParent = useMemo(
        () => comments.filter(c => !!c.parentId).reduce((acc, reply) => {
            const parentId = reply.parentId!;
            acc[parentId] = [...(acc[parentId] || []), reply].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            return acc;
        }, {} as Record<string, Comment[]>),
        [comments],
    );

    const postedAt = new Date(photo.createdAt);
    const timeStr = postedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = postedAt.toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Calculate time left
    const countdown = getDailyMomentCountdown(photo);

    return ReactDOM.createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex flex-col backdrop-blur-3xl animate-fade-in"
            style={{
                background: 'color-mix(in srgb, var(--color-surface) 95%, transparent)',
                // Shrink the frame above the keyboard so the comment input bar
                // stays visible (overlay mode does not resize the WebView).
                paddingBottom: keyboardOpen ? keyboardHeight : 0,
                transition: 'padding-bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 backdrop-blur-md z-20"
                style={{ background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)', borderBottom: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-1.5 transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
                        <ArrowLeft size={22} />
                    </button>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-lior-400 to-lior-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                            {photo.senderId === myDeviceId ? profile.myName.charAt(0) : profile.partnerName.charAt(0)}
                        </div>
                        <div>
                            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                                {photo.senderId === myDeviceId ? profile.myName : profile.partnerName}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                                {dateStr} · {timeStr}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-lior-500 bg-lior-500/15 px-2.5 py-1 rounded-full">
                        <Clock size={10} className="inline mr-1" />
                        {countdown.compactLabel}
                    </span>
                </div>
            </div>

            {/* ── Media ── */}
            <div className="relative bg-black flex items-center justify-center flex-shrink-0 w-full" style={{ height: '40vh', minHeight: '300px' }}>
                {mediaLoading ? (
                    <Skeleton type="image" className="absolute inset-0 w-full h-full rounded-none opacity-20" />
                ) : mediaSrc ? (
                    <>
                        {/* Blurred background */}
                        <img
                            src={mediaSrc}
                            className="absolute inset-0 w-full h-full object-cover blur-3xl scale-110 opacity-40"
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            onError={handleMediaError}
                        />
                        {isVideo ? (
                            <video
                                src={mediaSrc}
                                className="relative z-[1] max-w-full max-h-[50vh] object-contain"
                                controls
                                autoPlay
                                playsInline
                                onError={handleMediaError}
                            />
                        ) : (
                            <img
                                src={mediaSrc}
                                className="relative z-[1] max-w-full max-h-[50vh] object-contain"
                                alt="Moment"
                                loading="lazy"
                                decoding="async"
                                onError={handleMediaError}
                            />
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--color-text-secondary)' }}>
                        <Camera size={32} className="mb-2 opacity-30" />
                        <span className="text-xs font-bold uppercase tracking-widest opacity-40">Media Unavailable</span>
                    </div>
                )}
            </div>

            {/* ── Caption ── */}
            {photo.caption && (
                <div className="px-5 py-4 z-10" style={{ borderBottom: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', background: 'color-mix(in srgb, var(--color-surface) 70%, transparent)' }}>
                    <p className="text-[15px] leading-relaxed font-medium" style={{ color: 'var(--color-text-primary)' }}>{photo.caption}</p>
                </div>
            )}

            {/* ── Comments Section ── */}
            <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-4 py-4">
                {comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 opacity-50">
                        <MessageCircle size={28} className="mb-2" style={{ color: 'var(--color-text-secondary)' }} />
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>No comments yet</p>
                        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>Be the first to react!</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <AnimatePresence>
                            {topLevelComments.map(comment => (
                                <React.Fragment key={comment.id}>
                                    <CommentBubble
                                        comment={comment}
                                        onReply={handleReply}
                                        onDelete={handleDeleteComment}
                                        myDeviceId={myDeviceId}
                                    />
                                    {/* Threaded Replies */}
                                    {(repliesByParent[comment.id] || [])
                                        .map(reply => (
                                            <CommentBubble
                                                key={reply.id}
                                                comment={reply}
                                                isReply
                                                onReply={handleReply}
                                                onDelete={handleDeleteComment}
                                                myDeviceId={myDeviceId}
                                            />
                                        ))
                                    }
                                </React.Fragment>
                            ))}
                        </AnimatePresence>
                        <div ref={commentsEndRef} />
                    </div>
                )}
            </div>

            {/* ── Comment Input Bar ── */}
            <div className="flex-shrink-0 px-4 py-3 safe-area-bottom backdrop-blur-md z-20" style={{ borderTop: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)' }}>
                {replyTo && (
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[11px] text-lior-500 font-bold">
                            <Reply size={10} className="inline mr-1" />
                            Replying to {replyTo.senderName}
                        </span>
                        <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-lior-500 focus-visible:rounded-full focus-visible:ring-offset-1" style={{ color: 'var(--color-text-secondary)' }}>
                            <X size={14} />
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-lior-400 to-lior-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                        {profile.myName.charAt(0)}
                    </div>
                    <input
                        ref={commentInputRef}
                        type="text"
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => {
                            // Android IME fires compositionstart/end instead of keydown for
                            // the Enter key. Checking isComposing prevents a double-submit
                            // when the user accepts a suggestion from the keyboard.
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmitComment();
                            }
                        }}
                        placeholder={replyTo ? `Reply to ${replyTo.senderName}...` : "Add a comment..."}
                        inputMode="text"
                        enterKeyHint="send"
                        autoCapitalize="sentences"
                        autoCorrect="on"
                        className="flex-1 rounded-full px-4 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-lior-500/30 transition-all"
                        style={{ background: 'rgba(var(--theme-particle-2-rgb),0.10)', color: 'var(--color-text-primary)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}
                    />
                    <button
                        onClick={handleSubmitComment}
                        disabled={!commentText.trim() || isSubmitting}
                        className="p-2.5 bg-lior-500 text-white rounded-full disabled:opacity-30 disabled:scale-90 transition-all spring-press shadow-sm"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </motion.div>,
        document.body
    );
};


// Memoized below as `DailyMoments` — setView is referentially stable, so
// tab switches and other App-level renders bail out of this whole tree.
const DailyMomentsView: React.FC<DailyMomentsProps> = ({ setView }) => {
    // Keyboard lift for the caption/upload sheet (a fixed items-end portal the
    // IME would otherwise cover in overlay keyboard mode).
    const { keyboardOpen, keyboardHeight } = useNativeShell();
    const [photos, setPhotos] = useState<DailyPhoto[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newImage, setNewImage] = useState<string | null>(null);
    const [newVideo, setNewVideo] = useState<string | null>(null);
    const [caption, setCaption, clearCaptionDraft] = useDraft('daily-moments.caption', '');
    const [selectedPhoto, setSelectedPhoto] = useState<DailyPhoto | null>(null);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [premiumContext, setPremiumContext] = useState<PremiumFeatureContext>('video');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const openPhoto = useCallback((photo: DailyPhoto) => {
        setSelectedPhoto(photo);
    }, []);
    const closePhoto = useCallback(() => {
        setSelectedPhoto(null);
    }, []);

    const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(String(event.target?.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const compressImageWithFallback = async (file: File): Promise<string> => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
            return await Promise.race([
                compressImage(file),
                new Promise<string>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('Image compression timed out')), 4500);
                }),
            ]);
        } catch {
            return readFileAsDataUrl(file);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    };

    const loadPhotos = useCallback(() => {
        const data = StorageService.getDailyPhotos();
        const valid = data.filter((p) => !isDailyMomentExpired(p));
        setPhotos(valid.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setSelectedPhoto((current) => current && isDailyMomentExpired(current) ? null : current);
    }, []);

    useEffect(() => {
        loadPhotos();
        // rAF-coalesce — sync replays often emit a burst of events; without
        // this we ran the whole expired-photo filter + sort + dedup loop
        // per event instead of once per frame.
        let pending = false;
        const onUpdate = (): void => {
            if (pending) return;
            pending = true;
            requestAnimationFrame(() => { pending = false; loadPhotos(); });
        };
        storageEventTarget.addEventListener('storage-update', onUpdate);
        return () => storageEventTarget.removeEventListener('storage-update', onUpdate);
    }, [loadPhotos]);

    useEffect(() => {
        let expiryTimer: ReturnType<typeof setTimeout> | null = null;

        const runSweep = async () => {
            await StorageService.cleanupDailyPhotos();
            loadPhotos();
        };

        const scheduleNextExpirySweep = () => {
            if (expiryTimer) clearTimeout(expiryTimer);

            const nextExpiry = StorageService.getDailyPhotos()
                .map((photo) => getDailyMomentCountdown(photo).expiresMs)
                .filter((expiresMs): expiresMs is number => Number.isFinite(expiresMs))
                .sort((a, b) => a - b)[0];

            if (!Number.isFinite(nextExpiry)) return;

            const delay = Math.min(Math.max(0, nextExpiry - Date.now() + 250), 2_147_483_647);
            expiryTimer = setTimeout(() => {
                runSweep().catch(() => loadPhotos());
                scheduleNextExpirySweep();
            }, delay);
        };

        runSweep().catch(() => loadPhotos());
        scheduleNextExpirySweep();
        const interval = setInterval(() => runSweep().catch(() => loadPhotos()), 60000);
        // rAF-coalesce — a sync pull fires one 'storage-update' per pulled row,
        // so without this we re-ran the full getDailyPhotos + countdown map +
        // filter + sort reschedule per event instead of once per frame. The last
        // call wins either way (each clears the prior expiryTimer and reads the
        // same final cache), so the resulting timer is identical.
        let reschedulePending = false;
        const handleStorageUpdate = (): void => {
            if (reschedulePending) return;
            reschedulePending = true;
            requestAnimationFrame(() => { reschedulePending = false; scheduleNextExpirySweep(); });
        };
        storageEventTarget.addEventListener('storage-update', handleStorageUpdate);

        return () => {
            clearInterval(interval);
            if (expiryTimer) clearTimeout(expiryTimer);
            storageEventTarget.removeEventListener('storage-update', handleStorageUpdate);
        };
    }, [loadPhotos]);

    const handleRefresh = async () => {
        await new Promise(r => setTimeout(r, 1000));
        await StorageService.cleanupDailyPhotos();
        loadPhotos();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsUploading(true);
            setNewVideo(null);
            try {
                const compressed = await compressImageWithFallback(e.target.files[0]);
                setNewImage(compressed);
            } catch (err) {
                setIsUploading(false);
                toast.show("Could not process image.", 'error');
            }
        }
    };

    const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const profile = StorageService.getCoupleProfile();
            if (!profile.isPremium) {
                setPremiumContext('video');
                setShowPremiumModal(true);
                return;
            }

            if (isVideoTooLarge(file)) {
                toast.show("Video too large (Max 25MB)", 'error');
                return;
            }

            try {
                const thumb = await generateVideoThumbnail(file);
                setNewImage(thumb);
            } catch (e) { console.error("Thumb error", e); }

            const reader = new FileReader();
            reader.onload = (ev) => {
                setNewVideo(ev.target?.result as string);
                setIsUploading(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (!newImage && !newVideo) return;

        if (StorageService.hasReachedDailyLimit()) {
            setPremiumContext('daily');
            setShowPremiumModal(true);
            return;
        }

        setIsSaving(true);
        const now = new Date();
        const photo: DailyPhoto = {
            id: generateId(),
            caption: caption || 'Just now',
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + (24 * 60 * 60 * 1000)).toISOString(),
            image: newImage || undefined,
            video: newVideo || undefined,
            senderId: StorageService.getDeviceId()
        };

        try {
            await StorageService.saveDailyPhoto(photo);
            setIsUploading(false);
            setNewImage(null);
            setNewVideo(null);
            setCaption('');
            clearCaptionDraft();
            feedback.celebrate();
            toast.show("Moment added successfully!", "success");
        } catch (error: any) {
            toast.show(error?.message || "Moment upload failed.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const cancelUpload = () => {
        setIsUploading(false);
        setNewImage(null);
        setNewVideo(null);
        setCaption('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (videoInputRef.current) videoInputRef.current.value = '';
    };
    const uploadSheetDismiss = useSheetDismiss(cancelUpload);

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="flex flex-col h-full min-h-screen relative">
                {/* Header */}
                <ViewHeader
                    title="Moments"
                    subtitle="Ephemeral Memories"
                    onBack={() => setView('home')}
                    variant="centered"
                    rightSlot={
                    <div className="flex gap-3">
                        <motion.button
                            whileTap={{ scale: 0.92 }}
                            onClick={() => fileInputRef.current?.click()}
                            aria-label="Share a photo moment"
                            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-lior-50 text-lior-600 rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-lior-500 shadow-sm border border-lior-100/50"
                        >
                            <Camera size={20} />
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.92 }}
                            onClick={() => videoInputRef.current?.click()}
                            aria-label="Share a video moment"
                            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-blue-50 text-blue-600 rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 shadow-sm border border-blue-100/50"
                        >
                            <Video size={20} />
                        </motion.button>
                    </div>
                }
            />
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={handleVideoChange} />

            <div className="flex-1 px-5 pt-4 pb-32">
                {photos.length > 0 ? (
                    <motion.div
                        className="grid grid-cols-2 gap-4"
                        initial="hidden"
                        animate="show"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
                    >
                        {photos.map(p => (
                            <PhotoGridItem key={p.id} photo={p} onOpen={openPhoto} />
                        ))}
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={springSmooth}
                            className="relative mb-10"
                        >
                            <div className="absolute inset-0 bg-lior-200/20 rounded-full blur-3xl animate-breathe-glow" />
                            <div className="relative p-10 bg-white/40 backdrop-blur-md rounded-full text-lior-500 border border-white/60 shadow-md">
                                <Sparkles size={54} strokeWidth={1.5} />
                            </div>
                        </motion.div>
                        <motion.h2 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.15, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            className="text-center pb-4 text-3xl font-serif font-bold leading-tight" 
                            style={{ color: 'var(--color-text-primary)' }}
                        >
                            Capture a moment<br />that fades away.
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            transition={{ delay: 0.35 }}
                            className="text-[14px] font-bold tracking-[0.2em] uppercase"
                            style={{ color: 'var(--color-text-secondary)' }}
                        >
                            Visible for 24 hours
                        </motion.p>
                    </div>
                )}
            </div>

            {/* Upload Modal */}
            {isUploading && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 backdrop-blur-xl p-0 sm:p-4"
                    style={{
                        paddingBottom: keyboardOpen ? keyboardHeight : undefined,
                        transition: 'padding-bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                >
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                        className="w-full max-w-md max-h-[96dvh] flex flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]"
                        style={{ background: 'var(--color-surface)', boxShadow: '0 -18px 48px rgba(45,31,37,0.18)' }}
                        {...uploadSheetDismiss.sheetDragProps}
                    >
                        <div className="px-4 py-3 flex items-center justify-between shrink-0" onPointerDown={uploadSheetDismiss.handleProps.onPointerDown} style={{ touchAction: 'none', borderBottom: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', background: 'color-mix(in srgb, var(--color-surface) 86%, transparent)' }}>
                            <button type="button" onClick={cancelUpload} aria-label="Cancel upload" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer spring-press focus-visible:ring-2 focus-visible:ring-lior-500 focus-visible:rounded-full focus-visible:ring-offset-2" style={{ color: 'var(--color-text-secondary)' }}><X size={22} /></button>
                            <span className="font-bold text-sm uppercase tracking-widest" style={{ color: 'var(--color-text-primary)' }}>Post Moment</span>
                            <div className="w-11" aria-hidden="true" />
                        </div>
                    <div data-lenis-prevent className="lenis-inner min-h-0 flex-1 px-5 pt-5 pb-4 flex flex-col overflow-y-auto">
                        <div className="aspect-[3/4] rounded-[1.5rem] overflow-hidden mb-5 shadow-lg relative flex items-center justify-center bg-black">
                            {newImage && !newVideo && (
                                <>
                                    <img src={newImage} className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" alt="" aria-hidden="true" loading="lazy" decoding="async" />
                                    <img src={newImage} className="relative w-full h-full object-contain z-[1]" alt="Preview" decoding="async" />
                                </>
                            )}
                            {newVideo && (
                                <>
                                    {newImage && <img src={newImage} className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-40" alt="" aria-hidden="true" loading="lazy" decoding="async" />}
                                    <video src={newVideo} controls className="relative z-10 w-full h-full object-contain" />
                                </>
                            )}
                        </div>
                        <input
                            type="text"
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            placeholder="Add a caption..."
                            inputMode="text"
                            enterKeyHint="done"
                            autoCapitalize="sentences"
                            autoCorrect="on"
                            className="w-full p-4 rounded-2xl text-[16px] font-medium outline-none focus:ring-2 focus:ring-lior-500/30"
                            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.16)', color: 'var(--color-text-primary)' }}
                        />
                        <p className="mt-4 text-[10px] text-center font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                            Visible for 24 hours
                        </p>
                    </div>
                    <div className="shrink-0 px-5 pb-5 pt-3" style={{ borderTop: '1px solid rgba(var(--theme-particle-2-rgb),0.10)' }}>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving || (!newImage && !newVideo)}
                            className="w-full py-4 rounded-2xl text-white text-[14px] font-bold disabled:opacity-45 spring-press"
                            style={{
                                background: 'var(--theme-nav-center-bg-active)',
                                boxShadow: isSaving ? 'none' : '0 10px 28px rgba(196,104,126,0.24)',
                            }}
                        >
                            {isSaving ? 'Sharing...' : 'Share Moment'}
                        </button>
                    </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* ── Full-Screen Post Viewer ── */}
            <AnimatePresence>
                {selectedPhoto && (
                    <PostViewer
                        photo={selectedPhoto}
                        onClose={closePhoto}
                    />
                )}
            </AnimatePresence>
            </div>
            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} featureContext={premiumContext} />
        </PullToRefresh>
    );
};

export const DailyMoments = React.memo(DailyMomentsView);

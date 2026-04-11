import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Camera, Clock, Plus, Trash2, X, Sparkles, Loader2, RefreshCw, ArrowLeft, Video, PlayCircle, Send, Reply, MessageCircle, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, DailyPhoto, Comment } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useLiorMedia } from '../hooks/useLiorImage';
import { ViewHeader } from '../components/ViewHeader';
import { PullToRefresh } from '../components/PullToRefresh';
import { Skeleton } from '../components/Skeleton';
import { SkeletonReveal } from '../components/SkeletonReveal';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';

interface DailyMomentsProps {
    setView: (view: ViewState) => void;
}

// ─── Thumbnail Card (with blurred bg + object-contain for zero cropping) ─────
const PhotoCard: React.FC<{ photo: DailyPhoto, onClick: () => void }> = ({ photo, onClick }) => {
    const isVideo = !!photo.video || !!photo.videoId;
    const mediaId = isVideo ? photo.imageId : (photo.imageId || photo.videoId);
    const mediaData = isVideo ? photo.image : (photo.image || photo.video);

    const { src: mediaUrl, isLoading } = useLiorMedia(mediaId, mediaData, photo.storagePath);
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const updateTimer = () => {
            const now = new Date();
            const expires = new Date(photo.expiresAt);
            const diff = expires.getTime() - now.getTime();

            if (diff <= 0) {
                setTimeLeft('Expired');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeLeft(`${hours}h ${minutes}m left`);
        };

        updateTimer();
        const timer = setInterval(updateTimer, 60000);
        return () => clearInterval(timer);
    }, [photo.expiresAt]);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        await StorageService.deleteDailyPhoto(photo.id);
        setShowDeleteConfirm(false);
    };

    return (
        <>
        <motion.div
            layoutId={`photo-${photo.id}`}
            onClick={onClick}
            className="relative group overflow-hidden glass-card aspect-[3/4] cursor-pointer spring-press transition-transform"
        >
            {isLoading ? (
                <Skeleton type="image" className="absolute inset-0 w-full h-full rounded-none" />
            ) : mediaUrl ? (
                <div className="relative w-full h-full">
                    {/* Blurred background layer — prevents black bars */}
                    <img
                        src={mediaUrl}
                        className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60"
                        alt=""
                        aria-hidden="true"
                    />
                    {/* Sharp foreground — using object-cover for clean grid thumbnails */}
                    {isVideo ? (
                        <>
                            <motion.img 
                                initial={{ y: -20, scale: 1.15 }}
                                whileInView={{ y: 0, scale: 1 }}
                                viewport={{ once: false, margin: "50px 0px" }}
                                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                                src={mediaUrl} 
                                className="relative w-full h-full object-cover z-[1]" 
                                alt="Video thumbnail" 
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
                            viewport={{ once: false, margin: "50px 0px" }}
                            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                            src={mediaUrl} 
                            className="relative w-full h-full object-cover z-[1]" 
                            alt="Daily moment" 
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
                onClick={handleDelete}
                className="absolute top-2 right-2 p-2 bg-black/40 backdrop-blur-md rounded-full text-white opacity-0 transition-opacity z-20"
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

// ─── Comment Bubble ──────────────────────────────────────────────────────────
const CommentBubble: React.FC<{
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

// ─── Full-Screen Post Viewer with Comments ───────────────────────────────────
const PostViewer: React.FC<{
    photo: DailyPhoto;
    onClose: () => void;
}> = ({ photo, onClose }) => {
    const isVideo = !!photo.video || !!photo.videoId;
    const { src: mediaSrc, isLoading: mediaLoading } = useLiorMedia(
        isVideo ? (photo.videoId || photo.imageId) : photo.imageId,
        isVideo ? (photo.video || photo.image) : photo.image,
        isVideo ? (photo.videoStoragePath || photo.storagePath) : photo.storagePath
    );
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentText, setCommentText] = useState('');
    const [replyTo, setReplyTo] = useState<Comment | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const commentInputRef = useRef<HTMLInputElement>(null);
    const commentsEndRef = useRef<HTMLDivElement>(null);
    const myDeviceId = StorageService.getDeviceId();
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

    const handleReply = (comment: Comment) => {
        setReplyTo(comment);
        commentInputRef.current?.focus();
    };

    const handleDeleteComment = async (id: string) => {
        await StorageService.deleteComment(id);
    };

    // Organize comments into threads
    const topLevelComments = comments.filter(c => !c.parentId);
    const replies = comments.filter(c => !!c.parentId);

    const postedAt = new Date(photo.createdAt);
    const timeStr = postedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = postedAt.toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Calculate time left
    const now = new Date();
    const expires = new Date(photo.expiresAt);
    const diff = expires.getTime() - now.getTime();
    const hoursLeft = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    const minsLeft = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));

    return ReactDOM.createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex flex-col backdrop-blur-3xl animate-fade-in"
            style={{ background: 'color-mix(in srgb, var(--color-surface) 95%, transparent)' }}
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
                        {hoursLeft}h {minsLeft}m
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
                        />
                        {isVideo ? (
                            <video
                                src={mediaSrc}
                                className="relative z-[1] max-w-full max-h-[50vh] object-contain"
                                controls
                                autoPlay
                                playsInline
                            />
                        ) : (
                            <img
                                src={mediaSrc}
                                className="relative z-[1] max-w-full max-h-[50vh] object-contain"
                                alt="Moment"
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
                                    {replies
                                        .filter(r => r.parentId === comment.id)
                                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
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
                        onKeyDown={e => { if (e.key === 'Enter') handleSubmitComment(); }}
                        placeholder={replyTo ? `Reply to ${replyTo.senderName}...` : "Add a comment..."}
                        className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-lior-500/30 transition-all"
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


export const DailyMoments: React.FC<DailyMomentsProps> = ({ setView }) => {
    const [photos, setPhotos] = useState<DailyPhoto[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newImage, setNewImage] = useState<string | null>(null);
    const [newVideo, setNewVideo] = useState<string | null>(null);
    const [caption, setCaption] = useState('');
    const [selectedPhoto, setSelectedPhoto] = useState<DailyPhoto | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const load = () => {
            const data = StorageService.getDailyPhotos();
            const now = new Date();
            const valid = data.filter(p => new Date(p.expiresAt) > now);
            setPhotos(valid.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        };
        load();
        storageEventTarget.addEventListener('storage-update', load);
        return () => storageEventTarget.removeEventListener('storage-update', load);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => StorageService.cleanupDailyPhotos(), 60000);
        return () => clearInterval(interval);
    }, []);

    const handleRefresh = async () => {
        await new Promise(r => setTimeout(r, 1000));
        const data = StorageService.getDailyPhotos();
        const now = new Date();
        const valid = data.filter(p => new Date(p.expiresAt) > now);
        setPhotos(valid.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const compressed = await compressImage(e.target.files[0]);
                setNewImage(compressed);
                setNewVideo(null);
                setIsUploading(true);
            } catch (err) {
                toast.show("Could not process image.", 'error');
            }
        }
    };

    const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const profile = StorageService.getCoupleProfile();
            if (!profile.isPremium) {
                toast.show("Video uploads are a premium feature. Please upgrade to use this.", 'error');
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

        await StorageService.saveDailyPhoto(photo);
        setIsUploading(false);
        setNewImage(null);
        setNewVideo(null);
        setCaption('');
        setIsSaving(false);
        feedback.celebrate();
        toast.show("Moment added successfully!", "success");
    };

    const cancelUpload = () => {
        setIsUploading(false);
        setNewImage(null);
        setNewVideo(null);
        setCaption('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

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

            <div className="flex-1 p-6 pb-32">
                {photos.length > 0 ? (
                    <motion.div
                        className="grid grid-cols-2 gap-4"
                        initial="hidden"
                        animate="show"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
                    >
                        {photos.map(p => (
                            <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>
                                <PhotoCard photo={p} onClick={() => setSelectedPhoto(p)} />
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
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
                <div className="fixed inset-0 z-50 flex flex-col backdrop-blur-3xl" style={{ background: 'var(--color-surface)', animation: 'slideUp 0.4s cubic-bezier(0.23, 1, 0.32, 1) both' }}>
                    <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)' }}>
                        <button onClick={cancelUpload} aria-label="Cancel upload" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer spring-press focus-visible:ring-2 focus-visible:ring-lior-500 focus-visible:rounded-full focus-visible:ring-offset-2" style={{ color: 'var(--color-text-secondary)' }}><X size={24} /></button>
                        <span className="font-bold text-sm uppercase tracking-widest" style={{ color: 'var(--color-text-primary)' }}>Post Moment</span>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-1.5 bg-lior-500 text-white rounded-full text-xs font-bold disabled:opacity-50 spring-press"
                        >
                            {isSaving ? 'Sending...' : 'Share'}
                        </button>
                    </div>
                    <div data-lenis-prevent className="lenis-inner flex-1 p-6 flex flex-col overflow-y-auto">
                        <div className="aspect-[3/4] rounded-[2rem] overflow-hidden mb-6 shadow-xl relative flex items-center justify-center bg-black">
                            {newImage && !newVideo && (
                                <>
                                    <img src={newImage} className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" alt="" aria-hidden="true" />
                                    <img src={newImage} className="relative w-full h-full object-contain z-[1]" alt="Preview" />
                                </>
                            )}
                            {newVideo && (
                                <>
                                    {newImage && <img src={newImage} className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-40" alt="" aria-hidden="true" />}
                                    <video src={newVideo} controls className="relative z-10 w-full h-full object-contain" />
                                </>
                            )}
                        </div>
                        <input
                            type="text"
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            placeholder="Add a caption..."
                            className="w-full p-4 rounded-2xl font-medium outline-none focus:ring-2 focus:ring-lior-500/30"
                            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.16)', color: 'var(--color-text-primary)' }}
                        />
                        <p className="mt-4 text-[10px] text-center font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                            Visible for 24 hours
                        </p>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Full-Screen Post Viewer ── */}
            <AnimatePresence>
                {selectedPhoto && (
                    <PostViewer
                        photo={selectedPhoto}
                        onClose={() => setSelectedPhoto(null)}
                    />
                )}
            </AnimatePresence>
            </div>
        </PullToRefresh>
    );
};

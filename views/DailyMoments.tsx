import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Clock, Plus, Trash2, X, Sparkles, Loader2, RefreshCw, ArrowLeft, Video, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, DailyPhoto } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useTulikaMedia } from '../hooks/useTulikaImage';
import { GestureModal } from '../components/GestureModal';

interface DailyMomentsProps {
    setView: (view: ViewState) => void;
}

const PhotoCard: React.FC<{ photo: DailyPhoto, onClick: () => void }> = ({ photo, onClick }) => {
    const isVideo = !!photo.video || !!photo.videoId;
    // OPTIMIZATION: Load thumbnail (image/imageId) for list view, not video
    const mediaId = isVideo ? photo.imageId : (photo.imageId || photo.videoId);
    const mediaData = isVideo ? photo.image : (photo.image || photo.video);

    const { src: mediaUrl, isLoading } = useTulikaMedia(mediaId, mediaData);
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

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Delete this moment?")) {
            await StorageService.deleteDailyPhoto(photo.id);
        }
    };

    return (
        <motion.div
            layoutId={`photo-${photo.id}`}
            onClick={onClick}
            className="relative group rounded-3xl overflow-hidden shadow-md aspect-[3/4] bg-gray-100 cursor-pointer spring-press transition-transform"
        >
            {isLoading ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-tulika-300">
                    <Loader2 className="animate-spin mb-2" size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Opening...</span>
                </div>
            ) : mediaUrl ? (
                isVideo ? (
                    <div className="relative w-full h-full bg-black">
                        <img src={mediaUrl} className="w-full h-full object-cover opacity-80" alt="Video thumbnail" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <PlayCircle size={32} className="text-white opacity-80" fill="currentColor" />
                        </div>
                    </div>
                ) : (
                    <img src={mediaUrl} className="w-full h-full object-cover" alt="Daily moment" />
                )
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-4 text-center">
                    <RefreshCw size={24} className="mb-2 opacity-50" />
                    <span className="text-[10px] font-bold uppercase tracking-widest leading-tight">Unavailable</span>
                </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-4 pointer-events-none z-10">
                <p className="text-white font-medium text-sm mb-1 line-clamp-2">{photo.caption}</p>
                <div className="flex items-center gap-1 text-[10px] text-white/90">
                    <Clock size={10} />
                    <span className="font-bold uppercase tracking-widest">{timeLeft}</span>
                </div>
            </div>

            <button
                onClick={handleDelete}
                className="absolute top-2 right-2 p-2 bg-black/40 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity z-20"
            >
                <Trash2 size={16} />
            </button>
        </motion.div>
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

    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_SIZE = 800;
                    if (width > height) {
                        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    } else {
                        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
                img.onerror = () => reject(new Error("Image load failed"));
            };
            reader.onerror = () => reject(new Error("File read failed"));
        });
    };

    const generateVideoThumbnail = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                video.currentTime = 0.5;
            };
            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                // Resize thumb
                const MAX_SIZE = 600;
                if (canvas.width > MAX_SIZE || canvas.height > MAX_SIZE) {
                    const ratio = Math.min(MAX_SIZE / canvas.width, MAX_SIZE / canvas.height);
                    canvas.width *= ratio;
                    canvas.height *= ratio;
                }
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
                URL.revokeObjectURL(video.src);
            };
            video.onerror = () => resolve('');
            video.src = URL.createObjectURL(file);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const compressed = await compressImage(e.target.files[0]);
                setNewImage(compressed);
                setNewVideo(null);
                setIsUploading(true);
            } catch (err) {
                alert("Could not process image.");
            }
        }
    };

    const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 25 * 1024 * 1024) {
                alert("Video too large (Max 25MB)");
                return;
            }

            try {
                // Generate Thumbnail
                const thumb = await generateVideoThumbnail(file);
                setNewImage(thumb); // We store thumb in 'image' field for list views
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
            id: Date.now().toString(),
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
        <div className="flex flex-col h-full bg-[#f8f9fa] min-h-screen">
            {/* Header */}
            <div className="p-6 pt-12 flex justify-between items-center bg-white border-b border-gray-100 sticky top-0 z-20">
                <button onClick={() => setView('home')} className="p-2 -ml-2 text-gray-400">
                    <ArrowLeft size={24} />
                </button>
                <div className="text-center">
                    <h2 className="font-serif font-bold text-2xl text-gray-800">Moments</h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-tulika-400">Ephemeral Memories</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 bg-tulika-50 text-tulika-600 rounded-full"
                    >
                        <Camera size={20} />
                    </button>
                    <button
                        onClick={() => videoInputRef.current?.click()}
                        className="p-2 bg-blue-50 text-blue-600 rounded-full"
                    >
                        <Video size={20} />
                    </button>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={handleVideoChange} />
            </div>

            <div className="flex-1 p-6 pb-32">
                {photos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                        {photos.map(p => (
                            <PhotoCard key={p.id} photo={p} onClick={() => setSelectedPhoto(p)} />
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center py-20 text-gray-300 opacity-50">
                        <Sparkles size={48} className="mb-4" />
                        <p className="font-serif text-center">Share a moment that<br />disappears in 24 hours.</p>
                    </div>
                )}
            </div>

            {/* Upload Modal */}
            {isUploading && (
                <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ animation: 'slideUp 0.4s cubic-bezier(0.23, 1, 0.32, 1) both' }}>
                    <div className="p-4 flex items-center justify-between border-b">
                        <button onClick={cancelUpload} className="p-2"><X size={24} /></button>
                        <span className="font-bold text-sm uppercase tracking-widest">Post Moment</span>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-1.5 bg-tulika-500 text-white rounded-full text-xs font-bold disabled:opacity-50 spring-press"
                        >
                            {isSaving ? 'Sending...' : 'Share'}
                        </button>
                    </div>
                    <div className="flex-1 p-6 flex flex-col overflow-y-auto">
                        <div className="aspect-[3/4] bg-gray-100 rounded-[2rem] overflow-hidden mb-6 shadow-xl relative flex items-center justify-center bg-black">
                            {newImage && !newVideo && <img src={newImage} className="w-full h-full object-cover" alt="Preview" />}
                            {newVideo && (
                                <>
                                    {newImage && <img src={newImage} className="absolute inset-0 w-full h-full object-cover opacity-50" />}
                                    <video src={newVideo} controls className="relative z-10 w-full h-full object-contain" />
                                </>
                            )}
                        </div>
                        <input
                            type="text"
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            placeholder="Add a caption..."
                            className="w-full bg-gray-50 p-4 rounded-2xl font-medium outline-none border-none focus:ring-2 focus:ring-tulika-200"
                        />
                        <p className="mt-4 text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest">
                            Visible for 24 hours
                        </p>
                    </div>
                </div>
            )}

            {/* View Modal with Physical Swipe-to-Dismiss */}
            <GestureModal
                isOpen={!!selectedPhoto}
                onClose={() => setSelectedPhoto(null)}
                layoutId={selectedPhoto ? `photo-${selectedPhoto.id}` : undefined}
            >
                {selectedPhoto && (
                    <div className="w-full max-w-sm flex flex-col">
                        <div className="p-6 flex justify-between items-center w-full">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white backdrop-blur-md">
                                    <Clock size={16} />
                                </div>
                                <span className="text-white text-xs font-bold uppercase tracking-widest drop-shadow-md">Expires in 24h</span>
                            </div>
                            <button onClick={() => setSelectedPhoto(null)} className="p-2 text-white bg-black/20 rounded-full backdrop-blur-md">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="w-full aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl relative bg-black ring-1 ring-white/10">
                            <DetailMedia photo={selectedPhoto} />
                            <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none">
                                <p className="text-white text-xl font-medium leading-relaxed mb-1 drop-shadow-lg">
                                    {selectedPhoto.caption}
                                </p>
                                <p className="text-white/70 text-[10px] font-bold uppercase tracking-[0.2em] drop-shadow-md">
                                    Posted {new Date(selectedPhoto.createdAt).toLocaleTimeString()}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </GestureModal>
        </div>
    );
};

// Internal component for the detail view to leverage the hook
const DetailMedia: React.FC<{ photo: DailyPhoto }> = ({ photo }) => {
    // Only here do we load the videoID
    const { src, isLoading } = useTulikaMedia(photo.videoId || photo.imageId, photo.video || photo.image);
    const isVideo = !!photo.video || !!photo.videoId;

    if (isLoading) return <div className="w-full h-full bg-gray-900 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>;

    if (isVideo) {
        return <video src={src || ''} className="w-full h-full object-contain" controls autoPlay />;
    }
    return <img src={src || ''} className="w-full h-full object-cover" alt="Moment" />;
};
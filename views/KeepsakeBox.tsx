import React, { useState, useEffect, useRef } from 'react';
import { Archive, Plus, Camera, Music, FileText, Lock, Gift, X, EyeOff, Video, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, Keepsake, CoupleProfile } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useTulikaMedia } from '../hooks/useTulikaImage';
import { GestureModal } from '../components/GestureModal';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { ConfirmModal } from '../components/ConfirmModal';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';
import { ViewHeader } from '../components/ViewHeader';

interface KeepsakeBoxProps {
    setView: (view: ViewState) => void;
}

const KeepsakeCard: React.FC<{ keepsake: Keepsake, isMine: boolean, partnerName: string, myName: string, onHide: () => void, onClick: () => void }> = ({ keepsake, isMine, partnerName, myName, onHide, onClick }) => {
    const { src: mediaSrc } = useTulikaMedia(keepsake.imageId || keepsake.videoId, keepsake.image || keepsake.video, keepsake.storagePath || keepsake.videoStoragePath);

    const formattedDate = new Date(keepsake.date).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });

    const displaySender = keepsake.senderId === 'Tulika' ? 'Tulika' : (keepsake.senderId === 'Ishan' ? 'Ishan' : (isMine ? 'Me' : partnerName));

    return (
        <div className={`flex w-full mb-6 ${isMine ? 'justify-end' : 'justify-start'}`}>
            <motion.div
                layoutId={`keepsake-${keepsake.id}`}
                onClick={() => { feedback.light(); onClick(); }}
                className={`max-w-[85%] p-5 rounded-[2.5rem] mb-1 relative overflow-hidden group cursor-pointer animate-spring-in spring-press glass-card ${
                    isMine
                        ? 'rounded-tr-none'
                        : 'rounded-tl-none ring-2 ring-tulika-200 shadow-xl'
                }`}
            >
                {/* Content */}
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isMine ? '' : 'text-tulika-500'}`} style={isMine ? { color: 'var(--color-text-secondary)' } : {}}>
                            From {displaySender}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); onHide(); }}
                            className="transition-colors p-2 -m-2 opacity-0"
                            style={{ color: 'var(--color-text-secondary)' }}
                        >
                            <EyeOff size={12} />
                        </button>
                    </div>

                    {mediaSrc && (keepsake.type === 'photo' || keepsake.type === 'memory') && (
                        <div className="rounded-xl overflow-hidden mb-3 border-2 border-white/10 bg-white/5 transform transition-all duration-500">
                            <img src={mediaSrc} className="w-full h-auto" alt="Keepsake" />
                        </div>
                    )}

                    {mediaSrc && keepsake.type === 'video' && (
                        <div className="rounded-xl overflow-hidden mb-3 border-2 border-white/10 bg-black transform transition-all duration-500">
                            <div className="relative flex items-center justify-center">
                                <video src={mediaSrc} className="w-full h-auto" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <PlayCircle size={32} className="text-white opacity-80" />
                                </div>
                            </div>
                        </div>
                    )}

                    {keepsake.title && (
                        <h3 className="font-serif font-bold text-lg mb-1.5 leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                            {keepsake.title}
                        </h3>
                    )}

                    {keepsake.content && (
                        <p className="font-serif leading-relaxed whitespace-pre-wrap text-[15px]" style={{ color: 'var(--color-text-primary)' }}>
                            {keepsake.content}
                        </p>
                    )}

                    {keepsake.type === 'song' && keepsake.spotifyLink && (
                        <div className="mt-3 p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                            <div className="bg-green-500/15 p-2 rounded-full text-green-400">
                                <Music size={14} />
                            </div>
                            <div className="overflow-hidden">
                                <a href={keepsake.spotifyLink} target="_blank" rel="noreferrer" className="text-[10px] text-tulika-500 underline truncate block font-bold">
                                    Open Spotify
                                </a>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 pt-3 flex justify-between items-center" style={{ borderTop: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-secondary)' }}>
                        <span className="font-serif italic text-[10px]">
                            {formattedDate}
                        </span>
                        <Gift size={12} />
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

// Extracted to separate component so we can use hooks conditionally for the specific opened keepsake
const KeepsakeDetailContent: React.FC<{ keepsake: Keepsake, onClose: () => void }> = ({ keepsake, onClose }) => {
    // For detail views, we want the FULL resolution image/video
    const { src: mediaUrl, isLoading } = useTulikaMedia(
        keepsake.videoId || keepsake.imageId,
        keepsake.video || keepsake.image,
        keepsake.videoStoragePath || keepsake.storagePath
    );

    return (
        <div className="p-8 w-full relative overflow-hidden glass-card-hero">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 transition-colors z-20 backdrop-blur-md rounded-full shadow-sm"
                style={{ background: 'rgba(var(--theme-particle-2-rgb),0.10)', color: 'var(--color-text-secondary)' }}
            >
                <X size={20} />
            </button>

            <div className="relative z-10 max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
                {keepsake.title && (
                    <h3 className="font-serif font-bold text-3xl mb-6 text-center leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                        {keepsake.title}
                    </h3>
                )}

                {(keepsake.image || keepsake.video || keepsake.imageId || keepsake.videoId) && (
                    <div className="rounded-2xl overflow-hidden mb-8 border-2 border-white/10 bg-white/5 flex items-center justify-center min-h-[200px] relative">
                        {isLoading ? (
                           <div className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center">
                               <div className="w-8 h-8 rounded-full border-4 border-gray-600 border-t-tulika-400 animate-spin"></div>
                           </div>
                        ) : (
                            keepsake.video || keepsake.videoId ? (
                                <video src={mediaUrl || ''} controls autoPlay className="max-w-full max-h-[40vh] object-contain relative z-10" />
                            ) : (
                                <img src={mediaUrl || ''} className="max-w-full max-h-[40vh] object-contain relative z-10" alt="Keepsake" />
                            )
                        )}
                    </div>
                )}

                {keepsake.content && (
                    <p className="font-serif text-lg leading-relaxed whitespace-pre-wrap text-center px-4" style={{ color: 'var(--color-text-primary)' }}>
                        {keepsake.content}
                    </p>
                )}

                {keepsake.type === 'song' && keepsake.spotifyLink && (
                    <div className="mt-8 p-4 bg-green-500/10 rounded-2xl border border-green-500/20 flex items-center justify-center gap-3">
                        <Music size={24} className="text-green-400" />
                        <a href={keepsake.spotifyLink} target="_blank" rel="noreferrer" className="text-sm font-bold text-green-400 underline">
                            Open in Spotify
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};

export const KeepsakeBox: React.FC<KeepsakeBoxProps> = ({ setView }) => {
    const [keepsakes, setKeepsakes] = useState<Keepsake[]>([]);
    const [activeTab, setActiveTab] = useState<'tulika' | 'ishan'>('tulika');
    const [selectedKeepsake, setSelectedKeepsake] = useState<Keepsake | null>(null);
    const [isComposing, setIsComposing] = useState(false);
    const [profile, setProfile] = useState<CoupleProfile>({ myName: 'Me', partnerName: 'Partner', anniversaryDate: '' });

    // Compose State
    const [type, setType] = useState<'letter' | 'photo' | 'song' | 'video'>('letter');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [link, setLink] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [video, setVideo] = useState<string | null>(null);
    const [step, setStep] = useState(1); // 1: Content, 2: Confirmation

    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const load = () => {
            setKeepsakes(StorageService.getKeepsakes());
            setProfile(StorageService.getCoupleProfile());
        };
        load();
        const handleUpdate = () => load();
        storageEventTarget.addEventListener('storage-update', handleUpdate);
        return () => storageEventTarget.removeEventListener('storage-update', handleUpdate);
    }, []);

    const myId = StorageService.getDeviceId();
    const isMeTulika = profile.myName === 'Tulika';

    const filteredKeepsakes = keepsakes
        .filter(k => !k.isHidden)
        .filter(k => {
            const isSentByTulika = k.senderId === 'Tulika';
            const isSentByIshan = k.senderId === 'Ishan';
            
            // Fallback for legacy items without name-based senderId
            const isMe = k.senderId === myId;
            const isMeTulika = profile.myName === 'Tulika';
            
            if (activeTab === 'tulika') {
                if (isSentByTulika) return true;
                if (isSentByIshan) return false;
                // Legacy
                return isMeTulika ? isMe : !isMe;
            } else {
                if (isSentByIshan) return true;
                if (isSentByTulika) return false;
                // Legacy
                return isMeTulika ? !isMe : isMe;
            }
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const [hideTarget, setHideTarget] = useState<string | null>(null);

    const handleHide = (id: string) => {
        setHideTarget(id);
    };

    const confirmHide = () => {
        if (hideTarget) {
            StorageService.hideKeepsake(hideTarget);
            setHideTarget(null);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressed = await compressImage(file);
                setImage(compressed);
                setVideo(null);
            } catch (err) {
                toast.show("Could not load image.", 'error');
            }
        }
    };

    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const profile = StorageService.getCoupleProfile();
            if (!profile.isPremium) {
                toast.show("Video uploads are a premium feature. Please upgrade to use this.", 'error');
                return;
            }
            
            if (isVideoTooLarge(file)) {
                toast.show("Video too large (Max 25MB)", 'error');
                return;
            }

            // Generate thumbnail so the card has a preview image
            try {
                const thumb = await generateVideoThumbnail(file);
                if (thumb) setImage(thumb);
            } catch (err) {
                console.error('Video thumbnail generation failed', err);
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                setVideo(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSend = async () => {
        const newKeepsake: Keepsake = {
            id: generateId(),
            senderId: profile.myName || myId,
            type,
            title,
            content,
            image: image || undefined,
            video: video || undefined,
            spotifyLink: link || undefined,
            date: new Date().toISOString(),
            isHidden: false
        };

        await StorageService.saveKeepsake(newKeepsake);
        feedback.celebrate();
        resetCompose();
    };

    const resetCompose = () => {
        setIsComposing(false);
        setStep(1);
        setTitle('');
        setContent('');
        setLink('');
        setImage(null);
        setVideo(null);
        setType('letter');
    };

    return (
        <div className="flex flex-col h-full min-h-screen">
            <div className="pb-4 sticky top-0 z-20" style={{ background: 'color-mix(in srgb, var(--color-surface) 85%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                <ViewHeader
                    title="The Keepsake Box"
                    onBack={() => setView('home')}
                    variant="centered"
                    borderless
                />

                <div className="flex p-1 rounded-full relative mb-2 mx-6 glass-card shadow-sm border border-gray-100">
                    <div
                        className="absolute top-1 bottom-1 w-[48%] rounded-full transition-all duration-300 ease-spring shadow-sm"
                        style={{ left: activeTab === 'tulika' ? '1%' : '51%', background: 'rgba(var(--theme-particle-2-rgb),0.15)' }}
                    ></div>
                    <button
                        onClick={() => setActiveTab('tulika')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-10 transition-colors`}
                        style={{ color: activeTab === 'tulika' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
                    >
                        From Tulika
                    </button>
                    <button
                        onClick={() => setActiveTab('ishan')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-10 transition-colors`}
                        style={{ color: activeTab === 'ishan' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
                    >
                        From Ishan
                    </button>
                </div>
            </div>

            <div className="flex-1 p-6 pb-32 overflow-y-auto">
                {filteredKeepsakes.length > 0 ? (
                    filteredKeepsakes.map(k => (
                        <KeepsakeCard
                            key={k.id}
                            keepsake={k}
                            isMine={k.senderId === myId || k.senderId === profile.myName}
                            partnerName={profile.partnerName}
                            myName={profile.myName}
                            onHide={() => handleHide(k.id)}
                            onClick={() => setSelectedKeepsake(k)}
                        />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-tulika-500/10 rounded-full blur-2xl animate-breathe-glow" />
                            <div className="relative p-6 rounded-full" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}>
                                <Gift size={40} style={{ color: 'var(--color-text-secondary)' }} />
                            </div>
                        </div>
                        <p className="font-serif text-center text-lg mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Your keepsake box is waiting for its first treasure
                        </p>
                        <p className="text-xs mb-6" style={{ color: 'var(--color-text-secondary)' }}>Send something meaningful</p>
                        <button
                            onClick={() => setIsComposing(true)}
                            className="px-6 py-3 bg-tulika-500 text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-lg shadow-tulika-500/20 spring-press"
                        >
                            Send a Gift
                        </button>
                    </div>
                )}
            </div>

            <div className="fixed bottom-24 right-6 z-30">
                <button
                    onClick={() => setIsComposing(true)}
                    className="bg-tulika-500 text-white p-4 rounded-full shadow-2xl shadow-tulika-500/30 spring-press spring-hover transition-transform flex items-center gap-2"
                >
                    <Gift size={24} />
                    <span className="font-bold text-sm pr-2">Send Gift</span>
                </button>
            </div>

            {isComposing && (
                <div className="fixed inset-0 z-50 flex flex-col animate-fade-in backdrop-blur-3xl" style={{ background: 'color-mix(in srgb, var(--color-surface) 95%, transparent)', animation: 'slideUp 0.4s cubic-bezier(0.23, 1, 0.32, 1) both' }}>
                    <div className="p-6 flex justify-between items-center shadow-sm" style={{ borderBottom: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', background: 'rgba(var(--theme-particle-2-rgb),0.04)' }}>
                        <button onClick={resetCompose} aria-label="Discard letter" className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:rounded-full focus-visible:ring-offset-2" style={{ color: 'var(--color-text-secondary)' }}>
                            <X size={24} />
                        </button>
                        <span className="font-bold uppercase tracking-widest text-xs" style={{ color: 'var(--color-text-primary)' }}>
                            {step === 1 ? 'Compose Gift' : 'Confirm'}
                        </span>
                        <div className="w-8"></div>
                    </div>

                    {step === 1 ? (
                        <div className="flex-1 overflow-y-auto p-6 pt-6">
                            <h2 className="font-serif font-bold text-3xl mb-8" style={{ color: 'var(--color-text-primary)' }}>What would you like to give?</h2>

                            <div className="flex gap-4 mb-8 overflow-x-auto pb-2 no-scrollbar">
                                {[
                                    { id: 'letter', icon: FileText, label: 'Letter' },
                                    { id: 'photo', icon: Camera, label: 'Photo' },
                                    { id: 'video', icon: Video, label: 'Video' },
                                    { id: 'song', icon: Music, label: 'Song' },
                                ].map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setType(t.id as any)}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-[2rem] min-w-[6rem] transition-all shadow-sm ${type === t.id ? 'bg-tulika-500 text-white shadow-lg shadow-tulika-500/20' : ''}`}
                                        style={type !== t.id ? { background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-secondary)' } : {}}
                                    >
                                        <t.icon size={24} />
                                        <span className="text-xs font-bold uppercase">{t.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-6 animate-slide-up">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>Title (Optional)</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        className="w-full p-4 rounded-2xl shadow-sm font-serif text-lg outline-none focus:ring-2 focus:ring-tulika-500/30"
                                        style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
                                        placeholder="e.g. A thought for today"
                                    />
                                </div>

                                {type === 'photo' && (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="aspect-video rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-inner"
                                        style={{ background: 'rgba(var(--theme-particle-2-rgb),0.06)', border: '2px dashed rgba(var(--theme-particle-2-rgb),0.22)', color: 'var(--color-text-secondary)' }}
                                    >
                                        {image ? (
                                            <img src={image} className="w-full h-full object-cover" alt="Preview" />
                                        ) : (
                                            <>
                                                <Camera size={32} className="mb-2" />
                                                <span className="text-sm">Tap to select photo</span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/png, image/jpeg, image/jpg, image/webp"
                                            onChange={handleImageUpload}
                                        />
                                    </div>
                                )}

                                {type === 'video' && (
                                    <div
                                        onClick={() => videoInputRef.current?.click()}
                                        className="aspect-video rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-inner"
                                        style={{ background: 'rgba(var(--theme-particle-2-rgb),0.06)', border: '2px dashed rgba(var(--theme-particle-2-rgb),0.22)', color: 'var(--color-text-secondary)' }}
                                    >
                                        {video ? (
                                            <video src={video} className="w-full h-full object-cover" controls />
                                        ) : (
                                            <>
                                                <Video size={32} className="mb-2" />
                                                <span className="text-sm">Tap to select video</span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            ref={videoInputRef}
                                            className="hidden"
                                            accept="video/*"
                                            onChange={handleVideoUpload}
                                        />
                                    </div>
                                )}

                                {type === 'song' && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>Spotify Link</label>
                                        <input
                                            type="text"
                                            value={link}
                                            onChange={e => setLink(e.target.value)}
                                            className="w-full p-4 rounded-2xl shadow-sm font-sans text-sm outline-none focus:ring-2 focus:ring-tulika-500/30"
                                            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
                                            placeholder="https://open.spotify.com/track/..."
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>Message</label>
                                        <textarea
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        className="w-full h-48 p-4 rounded-2xl shadow-inner font-serif text-lg leading-relaxed outline-none focus:ring-2 focus:ring-tulika-500/30 resize-none"
                                        style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
                                        placeholder="Write something meaningful..."
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-elastic-pop">
                            <div className="w-20 h-20 shadow-sm rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.10)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-secondary)' }}>
                                <Lock size={40} />
                            </div>
                            <h3 className="font-serif font-bold text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Are you sure?</h3>
                            <p className="mb-8 max-w-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                                Once sent, this keepsake <strong style={{ color: 'var(--color-text-primary)' }}>cannot be edited, overwritten, or deleted</strong> by either of you. It becomes a permanent part of your shared history.
                            </p>

                            <div className="w-full space-y-3">
                                <button
                                    onClick={handleSend}
                                    className="w-full bg-tulika-500 text-white py-4 rounded-xl font-bold uppercase tracking-wider shadow-xl shadow-tulika-500/20 spring-press spring-hover transition-transform"
                                >
                                    Seal & Send
                                </button>
                                <button
                                    onClick={() => setStep(1)}
                                    className="w-full py-4 text-sm font-bold uppercase tracking-wider"
                                    style={{ color: 'var(--color-text-secondary)' }}
                                >
                                    Go Back
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="p-6 shadow-sm backdrop-blur-md" style={{ borderTop: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', background: 'rgba(var(--theme-particle-2-rgb),0.04)' }}>
                            <button
                                onClick={() => setStep(2)}
                                disabled={!content && !image && !link && !video}
                                className="w-full bg-tulika-500 text-white py-4 rounded-xl font-bold uppercase tracking-wider shadow-lg disabled:opacity-50 disabled:shadow-none transition-all"
                            >
                                Continue
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Cinematic Viewer Modal with Gesture Physics */}
            <GestureModal
                isOpen={!!selectedKeepsake}
                onClose={() => setSelectedKeepsake(null)}
                layoutId={selectedKeepsake ? `keepsake-${selectedKeepsake.id}` : undefined}
            >
                {selectedKeepsake && (
                    <KeepsakeDetailContent keepsake={selectedKeepsake} onClose={() => setSelectedKeepsake(null)} />
                )}
            </GestureModal>

        <ConfirmModal
            isOpen={!!hideTarget}
            title="Hide Keepsake"
            message="Hide this keepsake? It won't be deleted, just hidden from view."
            confirmLabel="Hide"
            variant="default"
            onConfirm={confirmHide}
            onCancel={() => setHideTarget(null)}
        />
        </div>
    );
};

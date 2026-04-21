import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Archive, Plus, Camera, Music, FileText, Lock, Gift, X, EyeOff, Video, PlayCircle, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, Keepsake, CoupleProfile } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { RelationshipSignals } from '../services/relationshipSignals';
import { useLiorMedia } from '../hooks/useLiorImage';
import { GestureModal } from '../components/GestureModal';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { ConfirmModal } from '../components/ConfirmModal';
import { PremiumModal } from '../components/PremiumModal';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';
import { ViewHeader } from '../components/ViewHeader';
import { SectionDivider } from './Home';

interface KeepsakeBoxProps {
    setView: (view: ViewState) => void;
}

const normalizeSenderName = (senderId?: string) => senderId === 'Lior' ? 'Tulika' : senderId;

const KeepsakeCard: React.FC<{ keepsake: Keepsake, isMine: boolean, partnerName: string, myName: string, onHide: () => void, onClick: () => void, isReacted?: boolean, onReact?: () => void }> = ({ keepsake, isMine, partnerName, myName, onHide, onClick, isReacted, onReact }) => {
    const { src: mediaSrc, handleError: handleMediaError } = useLiorMedia(keepsake.imageId || keepsake.videoId, keepsake.image || keepsake.video, keepsake.storagePath || keepsake.videoStoragePath);

    const formattedDate = new Date(keepsake.date).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });

    const normalizedSender = normalizeSenderName(keepsake.senderId);
    const displaySender = normalizedSender === 'Tulika' ? 'Tulika' : (normalizedSender === 'Ishan' ? 'Ishan' : (isMine ? 'Me' : partnerName));

    return (
        <div className={`flex w-full mb-6 ${isMine ? 'justify-end' : 'justify-start'}`}>
            <motion.div
                layoutId={`keepsake-${keepsake.id}`}
                onClick={() => { feedback.light(); onClick(); }}
                className={`max-w-[88%] p-5 rounded-[2.5rem] mb-2 relative overflow-hidden group cursor-pointer animate-spring-in spring-press glass-card-premium shadow-none ring-1 ring-inset ring-white/10 ${
                    isMine
                        ? 'rounded-tr-none'
                        : 'rounded-tl-none ring-lior-200/50'
                }`}
            >
                {/* Content */}
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2.5">
                        <span className={`text-micro-bold opacity-60 ${isMine ? 'text-gray-400' : 'text-lior-500'}`}>
                            From {displaySender}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); onHide(); }}
                            className="transition-colors p-2 -m-2 opacity-0 opacity-40"
                            style={{ color: 'var(--color-text-secondary)' }}
                        >
                            <EyeOff size={13} />
                        </button>
                    </div>

                    {mediaSrc && (keepsake.type === 'photo' || keepsake.type === 'memory') && (
                        <div className="rounded-xl overflow-hidden mb-3 border-2 border-white/10 bg-white/5 transform transition-all duration-500">
                            <img src={mediaSrc} className="w-full h-auto" alt="Keepsake" onError={handleMediaError} />
                        </div>
                    )}

                    {mediaSrc && keepsake.type === 'video' && (
                        <div className="rounded-xl overflow-hidden mb-3 border-2 border-white/10 bg-black transform transition-all duration-500">
                            <div className="relative flex items-center justify-center">
                                <video src={mediaSrc} className="w-full h-auto" onError={handleMediaError} />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <PlayCircle size={32} className="text-white opacity-80" />
                                </div>
                            </div>
                        </div>
                    )}

                    {keepsake.title && (
                        <h3 className="text-title-premium text-lg mb-1 leading-tight text-gray-800">
                            {keepsake.title}
                        </h3>
                    )}

                    {keepsake.content && (
                        <p className="text-body-premium text-gray-600 leading-relaxed whitespace-pre-wrap text-[14px]">
                            {keepsake.content}
                        </p>
                    )}

                    {keepsake.type === 'song' && keepsake.spotifyLink && (
                        <div className="mt-3 p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                            <div className="bg-green-500/15 p-2 rounded-full text-green-400">
                                <Music size={14} />
                            </div>
                            <div className="overflow-hidden">
                                <a href={keepsake.spotifyLink} target="_blank" rel="noreferrer" className="text-[10px] text-lior-500 underline truncate block font-bold">
                                    Open Spotify
                                </a>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 pt-4 flex justify-between items-center opacity-40" style={{ borderTop: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                        <span className="text-micro-bold tracking-tight">
                            {formattedDate}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); onReact?.(); }}
                                className="p-1"
                            >
                                <Heart size={12} fill={isReacted ? '#f472b6' : 'none'} style={{ color: isReacted ? '#f472b6' : 'currentColor', opacity: isReacted ? 2.5 : 1 }} />
                            </button>
                            <Gift size={12} />
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

// Extracted to separate component so we can use hooks conditionally for the specific opened keepsake
const KeepsakeDetailContent: React.FC<{ keepsake: Keepsake, onClose: () => void }> = ({ keepsake, onClose }) => {
    // For detail views, we want the FULL resolution image/video
    const { src: mediaUrl, isLoading, handleError: handleMediaError } = useLiorMedia(
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

            <div data-lenis-prevent className="lenis-inner relative z-10 max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
                {keepsake.title && (
                    <h3 className="font-serif font-bold text-3xl mb-6 text-center leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                        {keepsake.title}
                    </h3>
                )}

                {(keepsake.image || keepsake.video || keepsake.imageId || keepsake.videoId) && (
                    <div className="rounded-2xl overflow-hidden mb-8 border-2 border-white/10 bg-white/5 flex items-center justify-center min-h-[200px] relative">
                        {isLoading ? (
                           <div className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center">
                               <div className="w-8 h-8 rounded-full border-4 border-gray-600 border-t-lior-400 animate-spin"></div>
                           </div>
                        ) : (
                            keepsake.video || keepsake.videoId ? (
                                <video src={mediaUrl || ''} controls autoPlay className="max-w-full max-h-[40vh] object-contain relative z-10" onError={handleMediaError} />
                            ) : (
                                <img src={mediaUrl || ''} className="max-w-full max-h-[40vh] object-contain relative z-10" alt="Keepsake" onError={handleMediaError} />
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
    const [activeTab, setActiveTab] = useState<'lior' | 'ishan'>('lior');
    const [selectedKeepsake, setSelectedKeepsake] = useState<Keepsake | null>(null);
    const [isComposing, setIsComposing] = useState(false);
    const [profile, setProfile] = useState<CoupleProfile>({ myName: 'Me', partnerName: 'Partner', anniversaryDate: '' });
    const [reactedKeepsakes, setReactedKeepsakes] = useState<Set<string>>(new Set());

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

    const groupedKeepsakesByDate = useMemo(() => {
        const sorted = keepsakes
            .filter(k => !k.isHidden)
            .filter(k => {
                const senderId = normalizeSenderName(k.senderId);
                const isSentByTulika = senderId === 'Tulika';
                const isSentByIshan = senderId === 'Ishan';
                const isMe = k.senderId === StorageService.getDeviceId();
                const isMeTulika = profile.myName === 'Tulika';
                
                if (activeTab === 'lior') {
                    if (isSentByTulika) return true;
                    if (isSentByIshan) return false;
                    return isMeTulika ? isMe : !isMe;
                } else {
                    if (isSentByIshan) return true;
                    if (isSentByTulika) return false;
                    return isMeTulika ? !isMe : isMe;
                }
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Group by Month Year
        const groups: { [key: string]: Keepsake[] } = {};
        sorted.forEach(k => {
            const d = new Date(k.date);
            const key = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            if (!groups[key]) groups[key] = [];
            groups[key].push(k);
        });
        return groups;
    }, [keepsakes, activeTab, profile]);

    const [hideTarget, setHideTarget] = useState<string | null>(null);
    const [showPremiumModal, setShowPremiumModal] = useState(false);

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
                setShowPremiumModal(true);
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
        const myId = StorageService.getDeviceId();
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

        try {
            await StorageService.saveKeepsake(newKeepsake);
            feedback.celebrate();
            resetCompose();
        } catch (error: any) {
            alert(error?.message || 'Keepsake could not be saved.');
        }
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
            <div className="pb-6 sticky top-0 z-20 glass-card-premium border-b-none ring-1 ring-white/10" style={{ background: 'var(--theme-surface-glass)', backdropFilter: 'blur(32px)' }}>
                <ViewHeader
                    title="Memory Vault"
                    onBack={() => setView('home')}
                    variant="centered"
                    borderless
                />

                <div className="flex p-1.5 rounded-full relative mb-2 mx-6 glass-card shadow-none ring-1 ring-inset ring-white/10 bg-black/5">
                    <div
                        className="absolute top-1.5 bottom-1.5 w-[48%] rounded-full transition-all duration-300 ease-spring shadow-lg"
                        style={{ left: activeTab === 'lior' ? '1%' : '51%', background: 'white' }}
                    ></div>
                    <button
                        onClick={() => setActiveTab('lior')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest relative z-10 transition-all ${activeTab === 'lior' ? 'text-lior-600' : 'text-gray-400'}`}
                    >
                        {profile.myName === 'Tulika' ? 'Created' : 'Tulika'}
                    </button>
                    <button
                        onClick={() => setActiveTab('ishan')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest relative z-10 transition-all ${activeTab === 'ishan' ? 'text-lior-600' : 'text-gray-400'}`}
                    >
                        {profile.myName === 'Ishan' ? 'Created' : 'Ishan'}
                    </button>
                </div>
            </div>

            <div className="view-container">
                {Object.keys(groupedKeepsakesByDate).length > 0 ? (
                    Object.entries(groupedKeepsakesByDate as { [key: string]: Keepsake[] }).map(([dateLabel, items]) => (
                        <div key={dateLabel} className="view-section">
                            <SectionDivider label={dateLabel} />
                            {items.map(k => (
                                <KeepsakeCard
                                    key={k.id}
                                    keepsake={k}
                                    isMine={k.senderId === StorageService.getDeviceId() || k.senderId === profile.myName}
                                    partnerName={profile.partnerName}
                                    myName={profile.myName}
                                    onHide={() => handleHide(k.id)}
                                    onClick={() => setSelectedKeepsake(k)}
                                    isReacted={reactedKeepsakes.has(k.id)}
                                    onReact={() => {
                                        if (!reactedKeepsakes.has(k.id)) {
                                            feedback.tap();
                                            setReactedKeepsakes(prev => new Set([...prev, k.id]));
                                            RelationshipSignals.recordReaction('', 'memory', k.id, 'heart').catch(() => {});
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 animate-fade-in px-8">
                        <div className="relative mb-10 scale-125">
                            <div className="absolute inset-0 bg-lior-500/10 rounded-full blur-3xl animate-pulse" />
                            <div className="relative p-8 rounded-full glass-card-premium shadow-none ring-1 ring-lior-100">
                                <Archive size={48} className="text-lior-400" />
                            </div>
                        </div>
                        <h2 className="text-title-premium text-2xl text-center mb-3">Your vault is whispering for stories</h2>
                        <p className="text-center text-gray-400 font-medium text-sm leading-relaxed mb-10 max-w-xs">
                          Seal your first memory, letter, or song to lock it away in your shared treasure box forever.
                        </p>
                        <button
                            onClick={() => setIsComposing(true)}
                            className="px-8 py-4 bg-lior-500 text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-2xl shadow-lior-500/30 spring-press active:scale-95 transition-all"
                        >
                            ENSHRINE A GIFT
                        </button>
                    </div>
                )}
            </div>

            <div className="fixed bottom-24 right-6 z-30">
                <button
                    onClick={() => setIsComposing(true)}
                    className="bg-lior-500 text-white pl-5 pr-6 py-4 rounded-[2rem] shadow-2xl shadow-lior-600/40 spring-press flex items-center gap-3 active:scale-95 transition-all"
                >
                    <Plus size={24} strokeWidth={3} />
                    <span className="font-bold text-xs uppercase tracking-widest">Enshrine</span>
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
                        <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto p-6 pt-6">
                            <h2 className="font-serif font-bold text-3xl mb-8" style={{ color: 'var(--color-text-primary)' }}>What would you like to give?</h2>

                            <div data-lenis-prevent className="lenis-inner flex gap-4 mb-8 overflow-x-auto pb-2 no-scrollbar">
                                {[
                                    { id: 'letter', icon: FileText, label: 'Letter' },
                                    { id: 'photo', icon: Camera, label: 'Photo' },
                                    { id: 'video', icon: Video, label: 'Video' },
                                    { id: 'song', icon: Music, label: 'Song' },
                                ].map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setType(t.id as any)}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-[2rem] min-w-[6rem] transition-all shadow-sm ${type === t.id ? 'bg-lior-500 text-white shadow-lg shadow-lior-500/20' : ''}`}
                                        style={type !== t.id ? { background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-secondary)' } : {}}
                                    >
                                        <t.icon size={24} />
                                        <span className="text-xs font-bold uppercase">{t.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-6 animate-slide-up">
                                <div>
                                    <label className="text-micro-bold text-gray-400 block mb-2 opacity-60">Title (Optional)</label>
                                    <div className="p-5 rounded-2xl glass-card-premium shadow-none border-none ring-1 ring-inset ring-white/10 group focus-within:ring-lior-400/40 transition-all duration-300">
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            className="w-full bg-transparent font-serif text-2xl outline-none text-gray-800 placeholder:text-gray-300"
                                            placeholder="e.g. A thought for today"
                                        />
                                    </div>
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
                                        <label className="text-micro-bold text-gray-400 block mb-2 opacity-60">Spotify Link</label>
                                        <div className="p-5 rounded-2xl glass-card-premium shadow-none border-none ring-1 ring-inset ring-white/10 group focus-within:ring-lior-400/40 transition-all duration-300">
                                            <input
                                                type="text"
                                                value={link}
                                                onChange={e => setLink(e.target.value)}
                                                className="w-full bg-transparent font-sans text-sm outline-none text-gray-800 placeholder:text-gray-300"
                                                placeholder="https://open.spotify.com/track/..."
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-micro-bold text-gray-400 block mb-2 opacity-60">Message</label>
                                    <div className="p-5 rounded-3xl glass-card-premium shadow-none border-none ring-1 ring-inset ring-white/10 group focus-within:ring-lior-400/40 transition-all duration-300">
                                        <textarea
                                            value={content}
                                            onChange={e => setContent(e.target.value)}
                                            className="w-full h-48 bg-transparent font-serif text-lg leading-relaxed outline-none text-gray-800 placeholder:text-gray-300 resize-none"
                                            placeholder="Write something meaningful..."
                                        />
                                    </div>
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
                                    className="w-full bg-lior-500 text-white py-4 rounded-xl font-bold uppercase tracking-wider shadow-xl shadow-lior-500/20 spring-press spring-hover transition-transform"
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
                                className="w-full bg-lior-500 text-white py-4 rounded-xl font-bold uppercase tracking-wider shadow-lg disabled:opacity-50 disabled:shadow-none transition-all"
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
        <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        </div>
    );
};

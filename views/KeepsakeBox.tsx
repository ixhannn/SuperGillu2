import React, { useState, useEffect, useRef } from 'react';
import { Archive, Plus, Camera, Music, FileText, Lock, Gift, X, EyeOff, ArrowLeft, Video, PlayCircle } from 'lucide-react';
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

interface KeepsakeBoxProps {
    setView: (view: ViewState) => void;
}

const KeepsakeCard: React.FC<{ keepsake: Keepsake, isMine: boolean, partnerName: string, myName: string, onHide: () => void, onClick: () => void }> = ({ keepsake, isMine, partnerName, myName, onHide, onClick }) => {
    const { src: mediaSrc } = useTulikaMedia(keepsake.imageId || keepsake.videoId, keepsake.image || keepsake.video);

    const formattedDate = new Date(keepsake.date).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });

    const displaySender = keepsake.senderId === 'Tulika' ? 'Tulika' : (keepsake.senderId === 'Ishan' ? 'Ishan' : (isMine ? 'Me' : partnerName));

    return (
        <div className={`flex w-full mb-6 ${isMine ? 'justify-end' : 'justify-start'}`}>
            <motion.div
                layoutId={`keepsake-${keepsake.id}`}
                onClick={() => { feedback.light(); onClick(); }}
                className={`max-w-[85%] p-5 rounded-[2rem] shadow-sm border mb-1 relative overflow-hidden group cursor-pointer animate-spring-in spring-press ${
                    isMine 
                        ? 'bg-white border-stone-200 rounded-tr-none shadow-stone-200/50' 
                        : 'bg-tulika-50/50 border-tulika-100 rounded-tl-none shadow-tulika-100/30'
                }`}
            >
                {/* Content */}
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${isMine ? 'text-stone-400' : 'text-tulika-400'}`}>
                            From {displaySender}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); onHide(); }}
                            className="text-stone-300 transition-colors p-2 -m-2 opacity-0"
                        >
                            <EyeOff size={12} />
                        </button>
                    </div>

                    {mediaSrc && (keepsake.type === 'photo' || keepsake.type === 'memory') && (
                        <div className="rounded-xl overflow-hidden mb-3 shadow-inner border-4 border-white bg-stone-100 transform transition-all duration-500">
                            <img src={mediaSrc} className="w-full h-auto" alt="Keepsake" />
                        </div>
                    )}

                    {mediaSrc && keepsake.type === 'video' && (
                        <div className="rounded-xl overflow-hidden mb-3 shadow-inner border-4 border-white bg-black transform transition-all duration-500">
                            <div className="relative flex items-center justify-center">
                                <video src={mediaSrc} className="w-full h-auto" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <PlayCircle size={32} className="text-white opacity-80" />
                                </div>
                            </div>
                        </div>
                    )}

                    {keepsake.title && (
                        <h3 className={`font-serif font-bold text-base mb-1.5 leading-tight ${isMine ? 'text-stone-800' : 'text-tulika-900'}`}>
                            {keepsake.title}
                        </h3>
                    )}

                    {keepsake.content && (
                        <p className={`font-serif leading-relaxed whitespace-pre-wrap text-sm ${isMine ? 'text-stone-600' : 'text-stone-700'}`}>
                            {keepsake.content}
                        </p>
                    )}

                    {keepsake.type === 'song' && keepsake.spotifyLink && (
                        <div className="mt-3 p-3 bg-white/50 rounded-xl border border-stone-100 flex items-center gap-3">
                            <div className="bg-green-100 p-2 rounded-full text-green-600">
                                <Music size={14} />
                            </div>
                            <div className="overflow-hidden">
                                <a href={keepsake.spotifyLink} target="_blank" rel="noreferrer" className="text-[10px] text-tulika-500 underline truncate block font-bold">
                                    Open Spotify
                                </a>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center opacity-40">
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
        keepsake.video || keepsake.image
    );

    return (
        <div className="bg-[#fdfbf7] p-8 rounded-[2.5rem] shadow-2xl w-full relative overflow-hidden">
            {/* Paper Texture Overlay */}
            <div className="absolute inset-0 opacity-40 pointer-events-none mix-blend-multiply"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d6d3d1' fill-opacity='0.4' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='1'/%3E%3Ccircle cx='13' cy='13' r='1'/%3E%3C/g%3E%3C/svg%3E")` }}>
            </div>

            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-stone-300 transition-colors z-20 bg-white/50 backdrop-blur-md rounded-full"
            >
                <X size={20} />
            </button>

            <div className="relative z-10 max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
                {keepsake.title && (
                    <h3 className="font-serif font-bold text-3xl text-stone-800 mb-6 text-center leading-tight">
                        {keepsake.title}
                    </h3>
                )}

                {(keepsake.image || keepsake.video || keepsake.imageId || keepsake.videoId) && (
                    <div className="rounded-2xl overflow-hidden mb-8 shadow-md border-[8px] border-white bg-stone-100 flex items-center justify-center min-h-[200px] relative">
                        {isLoading ? (
                           <div className="absolute inset-0 bg-stone-200 animate-pulse flex items-center justify-center">
                               <div className="w-8 h-8 rounded-full border-4 border-stone-300 border-t-tulika-400 animate-spin"></div>
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
                    <p className="font-serif text-stone-600 text-lg leading-relaxed whitespace-pre-wrap text-center px-4">
                        {keepsake.content}
                    </p>
                )}

                {keepsake.type === 'song' && keepsake.spotifyLink && (
                    <div className="mt-8 p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center justify-center gap-3">
                        <Music size={24} className="text-green-600" />
                        <a href={keepsake.spotifyLink} target="_blank" rel="noreferrer" className="text-sm font-bold text-green-700 underline">
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
        <div className="flex flex-col h-full bg-[#fcfcfc] min-h-screen">
            <div className="p-6 pt-12 pb-4 bg-white border-b border-gray-100 sticky top-0 z-20">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={() => setView('home')} aria-label="Go back" className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:ring-offset-2">
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className="font-serif font-bold text-2xl text-gray-800">The Keepsake Box</h2>
                    <div className="w-10"></div>
                </div>
                
                <div className="flex bg-gray-100 p-1 rounded-full relative mb-2">
                    <div
                        className="absolute top-1 bottom-1 w-[48%] bg-white rounded-full shadow-sm transition-all duration-300 ease-spring"
                        style={{ left: activeTab === 'tulika' ? '1%' : '51%' }}
                    ></div>
                    <button
                        onClick={() => setActiveTab('tulika')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-10 transition-colors ${activeTab === 'tulika' ? 'text-gray-800' : 'text-gray-400'}`}
                    >
                        From Tulika
                    </button>
                    <button
                        onClick={() => setActiveTab('ishan')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-10 transition-colors ${activeTab === 'ishan' ? 'text-gray-800' : 'text-gray-400'}`}
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
                            <div className="absolute inset-0 bg-tulika-200/20 rounded-full blur-2xl animate-breathe-glow" />
                            <div className="relative p-6 bg-stone-50 rounded-full border border-stone-100 shadow-sm">
                                <Gift size={40} className="text-stone-300" />
                            </div>
                        </div>
                        <p className="font-serif text-stone-500 text-center text-lg mb-2">
                            Your keepsake box is waiting for its first treasure
                        </p>
                        <p className="text-xs text-stone-400 mb-6">Send something meaningful</p>
                        <button
                            onClick={() => setIsComposing(true)}
                            className="px-6 py-3 bg-stone-800 text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-lg spring-press"
                        >
                            Send a Gift
                        </button>
                    </div>
                )}
            </div>

            <div className="fixed bottom-24 right-6 z-30">
                <button
                    onClick={() => setIsComposing(true)}
                    className="bg-stone-800 text-white p-4 rounded-full shadow-2xl shadow-stone-400 spring-press spring-hover transition-transform flex items-center gap-2"
                >
                    <Gift size={24} />
                    <span className="font-bold text-sm pr-2">Send Gift</span>
                </button>
            </div>

            {isComposing && (
                <div className="fixed inset-0 z-50 bg-[#f8f5f2] flex flex-col animate-fade-in" style={{ animation: 'slideUp 0.4s cubic-bezier(0.23, 1, 0.32, 1) both' }}>
                    <div className="p-6 flex justify-between items-center">
                        <button onClick={resetCompose} aria-label="Discard letter" className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-400 cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:rounded-full focus-visible:ring-offset-2">
                            <X size={24} />
                        </button>
                        <span className="font-bold text-stone-800 uppercase tracking-widest text-xs">
                            {step === 1 ? 'Compose Gift' : 'Confirm'}
                        </span>
                        <div className="w-8"></div>
                    </div>

                    {step === 1 ? (
                        <div className="flex-1 overflow-y-auto p-6 pt-0">
                            <h2 className="font-serif text-3xl text-stone-800 mb-8">What would you like to give?</h2>

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
                                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl min-w-[6rem] transition-all ${type === t.id ? 'bg-stone-800 text-white shadow-lg' : 'bg-white text-stone-400 border border-stone-100'
                                            }`}
                                    >
                                        <t.icon size={24} />
                                        <span className="text-xs font-bold uppercase">{t.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-6 animate-slide-up">
                                <div>
                                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Title (Optional)</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        className="w-full bg-white p-4 rounded-xl border border-stone-100 font-serif text-lg outline-none focus:ring-1 focus:ring-stone-300"
                                        placeholder="e.g. A thought for today"
                                    />
                                </div>

                                {type === 'photo' && (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="aspect-video bg-white border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center text-stone-400 cursor-pointer overflow-hidden"
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
                                        className="aspect-video bg-white border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center text-stone-400 cursor-pointer overflow-hidden"
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
                                        <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Spotify Link</label>
                                        <input
                                            type="text"
                                            value={link}
                                            onChange={e => setLink(e.target.value)}
                                            className="w-full bg-white p-4 rounded-xl border border-stone-100 font-sans text-sm outline-none focus:ring-1 focus:ring-stone-300"
                                            placeholder="https://open.spotify.com/track/..."
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Message</label>
                                    <textarea
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        className="w-full h-48 bg-white p-4 rounded-xl border border-stone-100 font-serif text-lg leading-relaxed outline-none focus:ring-1 focus:ring-stone-300 resize-none"
                                        placeholder="Write something meaningful..."
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-elastic-pop">
                            <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-6 text-stone-400">
                                <Lock size={40} />
                            </div>
                            <h3 className="font-serif font-bold text-2xl text-stone-800 mb-4">Are you sure?</h3>
                            <p className="text-stone-500 mb-8 max-w-xs leading-relaxed">
                                Once sent, this keepsake <strong>cannot be edited, overwritten, or deleted</strong> by either of you. It becomes a permanent part of your shared history.
                            </p>

                            <div className="w-full space-y-3">
                                <button
                                    onClick={handleSend}
                                    className="w-full bg-stone-800 text-white py-4 rounded-xl font-bold uppercase tracking-wider shadow-xl spring-press spring-hover transition-transform"
                                >
                                    Seal & Send
                                </button>
                                <button
                                    onClick={() => setStep(1)}
                                    className="w-full py-4 text-stone-400 text-sm font-bold uppercase tracking-wider"
                                >
                                    Go Back
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="p-6 bg-white border-t border-stone-100">
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

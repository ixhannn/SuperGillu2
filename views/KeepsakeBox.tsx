import React, { useState, useEffect, useRef } from 'react';
import { Archive, Plus, Camera, Music, FileText, Lock, Gift, X, EyeOff, ArrowLeft, Video, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, Keepsake, CoupleProfile } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useTulikaMedia } from '../hooks/useTulikaImage';
import { GestureModal } from '../components/GestureModal';

interface KeepsakeBoxProps {
    setView: (view: ViewState) => void;
}

const KeepsakeCard: React.FC<{ keepsake: Keepsake, isMine: boolean, partnerName: string, onHide: () => void, onClick: () => void }> = ({ keepsake, isMine, partnerName, onHide, onClick }) => {
    const { src: mediaSrc } = useTulikaMedia(keepsake.imageId || keepsake.videoId, keepsake.image || keepsake.video);

    const formattedDate = new Date(keepsake.date).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    return (
        <motion.div
            layoutId={`keepsake-${keepsake.id}`}
            onClick={onClick}
            className="bg-[#fdfbf7] p-6 rounded-[2rem] shadow-sm border border-stone-100 mb-4 relative overflow-hidden group cursor-pointer animate-spring-in spring-hover magnetic-card"
        >
            {/* Paper Texture Overlay */}
            <div className="absolute inset-0 opacity-40 pointer-events-none mix-blend-multiply"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d6d3d1' fill-opacity='0.4' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='1'/%3E%3Ccircle cx='13' cy='13' r='1'/%3E%3C/g%3E%3C/svg%3E")` }}>
            </div>

            {/* Content */}
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                        {isMine ? 'You sent this' : `${partnerName} sent this`}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onHide(); }}
                        className="text-stone-300 hover:text-stone-500 transition-colors p-2 -m-2"
                    >
                        <EyeOff size={14} />
                    </button>
                </div>

                {mediaSrc && (keepsake.type === 'photo' || keepsake.type === 'memory') && (
                    <div className="rounded-2xl overflow-hidden mb-4 shadow-inner border-[6px] border-white bg-stone-100 rotate-1 transform transition-all duration-500 group-hover:rotate-0 group-hover:scale-[1.02]">
                        <img src={mediaSrc} className="w-full h-auto" alt="Keepsake" />
                    </div>
                )}

                {mediaSrc && keepsake.type === 'video' && (
                    <div className="rounded-2xl overflow-hidden mb-4 shadow-inner border-[6px] border-white bg-black rotate-1 transform transition-all duration-500 group-hover:rotate-0 group-hover:scale-[1.02]">
                        <video src={mediaSrc} controls className="w-full h-auto" />
                    </div>
                )}

                {keepsake.title && (
                    <h3 className="font-serif font-bold text-lg text-stone-800 mb-2 leading-tight">
                        {keepsake.title}
                    </h3>
                )}

                {keepsake.content && (
                    <p className="font-serif text-stone-600 leading-relaxed whitespace-pre-wrap text-sm">
                        {keepsake.content}
                    </p>
                )}

                {keepsake.type === 'song' && keepsake.spotifyLink && (
                    <div className="mt-4 p-3 bg-white rounded-xl border border-stone-100 flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full text-green-600">
                            <Music size={18} />
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs font-bold text-stone-700 truncate">Song Link</p>
                            <a href={keepsake.spotifyLink} target="_blank" rel="noreferrer" className="text-[10px] text-tulika-500 underline truncate block">
                                Open in Spotify
                            </a>
                        </div>
                    </div>
                )}

                <div className="mt-6 pt-4 border-t border-stone-200/50 flex justify-between items-center">
                    <span className="font-serif italic text-xs text-stone-400">
                        {formattedDate}
                    </span>
                    <Gift size={16} className="text-stone-300" />
                </div>
            </div>
        </motion.div>
    );
};

export const KeepsakeBox: React.FC<KeepsakeBoxProps> = ({ setView }) => {
    const [keepsakes, setKeepsakes] = useState<Keepsake[]>([]);
    const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
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

    const filteredKeepsakes = keepsakes
        .filter(k => !k.isHidden)
        .filter(k => activeTab === 'sent' ? k.senderId === myId : k.senderId !== myId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handleHide = (id: string) => {
        if (confirm("Hide this keepsake? It won't be deleted, just hidden from view.")) {
            StorageService.hideKeepsake(id);
        }
    };

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
                    const MAX_SIZE = 1000;
                    if (width > height) {
                        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    } else {
                        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = () => reject(new Error("Image load failed"));
            };
            reader.onerror = () => reject(new Error("File read failed"));
        });
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressed = await compressImage(file);
                setImage(compressed);
                setVideo(null);
            } catch (err) {
                alert("Could not load image.");
            }
        }
    };

    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 25 * 1024 * 1024) {
                alert("Video too large (Max 25MB)");
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                setVideo(ev.target?.result as string);
                setImage(null);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSend = async () => {
        const newKeepsake: Keepsake = {
            id: Date.now().toString(),
            senderId: myId,
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
                    <button onClick={() => setView('home')} className="p-2 -ml-2 text-gray-500 rounded-full hover:bg-gray-50">
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className="font-serif font-bold text-2xl text-gray-800">The Keepsake Box</h2>
                    <div className="w-10"></div>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-full relative">
                    <div
                        className="absolute top-1 bottom-1 w-[48%] bg-white rounded-full shadow-sm transition-all duration-300 ease-spring"
                        style={{ left: activeTab === 'received' ? '1%' : '51%' }}
                    ></div>
                    <button
                        onClick={() => setActiveTab('received')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-10 transition-colors ${activeTab === 'received' ? 'text-gray-800' : 'text-gray-400'}`}
                    >
                        From {profile.partnerName}
                    </button>
                    <button
                        onClick={() => setActiveTab('sent')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-10 transition-colors ${activeTab === 'sent' ? 'text-gray-800' : 'text-gray-400'}`}
                    >
                        From Me
                    </button>
                </div>
            </div>

            <div className="flex-1 p-6 pb-32 overflow-y-auto">
                {filteredKeepsakes.length > 0 ? (
                    filteredKeepsakes.map(k => (
                        <KeepsakeCard
                            key={k.id}
                            keepsake={k}
                            isMine={activeTab === 'sent'}
                            partnerName={profile.partnerName}
                            onHide={() => handleHide(k.id)}
                            onClick={() => setSelectedKeepsake(k)}
                        />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                        <Archive size={48} className="mb-4 text-stone-300" />
                        <p className="font-serif text-stone-500">
                            {activeTab === 'sent' ? "You haven't sent any gifts yet." : "The box is empty."}
                        </p>
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
                        <button onClick={resetCompose} className="p-2 -ml-2 text-stone-400 hover:text-stone-600">
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
                                        className="aspect-video bg-white border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center text-stone-400 cursor-pointer hover:bg-stone-50 overflow-hidden"
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
                                        className="aspect-video bg-white border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center text-stone-400 cursor-pointer hover:bg-stone-50 overflow-hidden"
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
                                    className="w-full py-4 text-stone-400 text-sm font-bold uppercase tracking-wider hover:text-stone-600"
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
                    <div className="bg-[#fdfbf7] p-8 rounded-[2.5rem] shadow-2xl w-full relative overflow-hidden">
                        {/* Paper Texture Overlay */}
                        <div className="absolute inset-0 opacity-40 pointer-events-none mix-blend-multiply"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d6d3d1' fill-opacity='0.4' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='1'/%3E%3Ccircle cx='13' cy='13' r='1'/%3E%3C/g%3E%3C/svg%3E")` }}>
                        </div>

                        <button
                            onClick={() => setSelectedKeepsake(null)}
                            className="absolute top-4 right-4 p-2 text-stone-300 hover:text-stone-500 transition-colors z-20 bg-white/50 backdrop-blur-md rounded-full"
                        >
                            <X size={20} />
                        </button>

                        <div className="relative z-10 max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
                            {selectedKeepsake.title && (
                                <h3 className="font-serif font-bold text-3xl text-stone-800 mb-6 text-center leading-tight">
                                    {selectedKeepsake.title}
                                </h3>
                            )}

                            {(selectedKeepsake.image || selectedKeepsake.video) && (
                                <div className="rounded-2xl overflow-hidden mb-8 shadow-md border-[8px] border-white bg-stone-100 flex items-center justify-center">
                                    {selectedKeepsake.video ? (
                                        <video src={selectedKeepsake.video} controls autoPlay className="max-w-full max-h-[40vh] object-contain" />
                                    ) : (
                                        <img src={selectedKeepsake.image} className="max-w-full max-h-[40vh] object-contain" alt="Keepsake" />
                                    )}
                                </div>
                            )}

                            {selectedKeepsake.content && (
                                <p className="font-serif text-stone-600 text-lg leading-relaxed whitespace-pre-wrap text-center px-4">
                                    {selectedKeepsake.content}
                                </p>
                            )}

                            {selectedKeepsake.type === 'song' && selectedKeepsake.spotifyLink && (
                                <div className="mt-8 p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center justify-center gap-3">
                                    <Music size={24} className="text-green-600" />
                                    <a href={selectedKeepsake.spotifyLink} target="_blank" rel="noreferrer" className="text-sm font-bold text-green-700 underline">
                                        Open in Spotify
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </GestureModal>
        </div>
    );
};

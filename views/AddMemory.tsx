
import React, { useState, useRef } from 'react';
import { ArrowLeft, Camera, X, Video } from 'lucide-react';
import { ViewState, Memory } from '../types';
import { StorageService } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';

interface AddMemoryProps {
  setView: (view: ViewState) => void;
}

const Moods = [
  { emoji: '😍', id: 'love' },
  { emoji: '😂', id: 'funny' },
  { emoji: '🥳', id: 'party' },
  { emoji: '😌', id: 'peace' },
  { emoji: '🥺', id: 'cute' },
];

export const AddMemory: React.FC<AddMemoryProps> = ({ setView }) => {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState('love');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
       try {
           const compressed = await compressImage(file);
           setImage(compressed);
           setVideo(null); // Mutually exclusive
       } catch (error) {
           toast.show("Couldn't process photo. Please try a different image.", 'error');
       }
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (isVideoTooLarge(file)) {
              toast.show("Video too large! Please choose a video under 25MB.", 'error');
              return;
          }
          
          // Generate Thumbnail first
          try {
            const thumb = await generateVideoThumbnail(file);
            setImage(thumb); // Set thumb as "image" for the UI to be fast
          } catch(e) { console.error("Thumbnail failed", e); }

          const reader = new FileReader();
          reader.onload = (ev) => {
              setVideo(ev.target?.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const removeMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImage(null);
    setVideo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!text.trim() && !image && !video) return;
    setIsSaving(true);
    
    const newMemory: Memory = {
      id: generateId(),
      text: text.trim(),
      image: image || undefined, // Stores thumbnail if video present
      video: video || undefined,
      date: new Date().toISOString(),
      mood: selectedMood
    };

    await StorageService.saveMemory(newMemory);
    feedback.celebrate();
    setView('timeline');
  };

  const isDisabled = isSaving || (!text.trim() && !image && !video);

  return (
    <div className="flex flex-col h-full min-h-screen animate-fade-in" style={{ background: 'transparent' }}>
      <div className="p-4 flex items-center justify-between sticky top-0 z-10" style={{ background: 'rgba(15,10,20,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setView('home')} className="p-2 -ml-2 text-gray-400 rounded-full active:scale-95 transition-transform spring-press">
          <ArrowLeft size={22} />
        </button>
        <span className="font-serif font-bold text-lg text-gray-100">New Memory</span>
        <button
          onClick={handleSave}
          disabled={isDisabled}
          className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all spring-press ${
            isDisabled ? 'bg-white/10 text-gray-500' : 'bg-tulika-500 text-white shadow-tulika-500/20'
          }`}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 pb-32">
        <div className="mb-6 animate-slide-up">
          <label className="text-micro text-gray-400 uppercase tracking-widest mb-3 block">Mood</label>
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {Moods.map((m, i) => (
              <button
                key={m.id}
                onClick={() => { feedback.tap(); setSelectedMood(m.id); }}
                className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all opacity-0 animate-pop-in ${
                  selectedMood === m.id ? 'bg-tulika-500/20 border-2 border-tulika-400 scale-110' : 'bg-white/5 border border-transparent'
                }`}
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'forwards' }}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 animate-slide-up animate-delay-100">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Media</label>
          <div className={`relative rounded-3xl overflow-hidden transition-all ${
              image || video ? 'aspect-auto' : 'bg-white/5 border-2 border-dashed border-white/15 p-8'
            }`}
          >
            {image && !video ? (
              // Standard Photo
              <>
                <img src={image} alt="Memory" className="w-full h-auto object-cover animate-fade-in" />
                <button onClick={removeMedia} className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full transition-colors"><X size={16} /></button>
              </>
            ) : video ? (
                // Video Mode (Shows Thumbnail + Video)
                <>
                    {/* If we have a thumb (image), show it, otherwise try showing video element */}
                    {image ? (
                        <div className="relative animate-fade-in">
                            <img src={image} alt="Video thumb" className="w-full h-auto object-cover opacity-80" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-black/30 p-4 rounded-full backdrop-blur-sm">
                                    <Video className="text-white" size={32} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <video src={video} controls className="w-full h-auto rounded-xl animate-fade-in" />
                    )}
                    <button onClick={removeMedia} className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full z-10"><X size={16} /></button>
                </>
            ) : (
              <div className="flex gap-4 justify-center">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center text-gray-400 gap-2 cursor-pointer p-4 rounded-xl transition-all active:scale-95"
                  >
                    <Camera size={32} />
                    <span className="text-xs font-medium">Photo</span>
                  </div>
                  <div className="w-px bg-white/10 my-2"></div>
                  <div
                    onClick={() => videoInputRef.current?.click()}
                    className="flex flex-col items-center justify-center text-gray-400 gap-2 cursor-pointer p-4 rounded-xl transition-all active:scale-95"
                  >
                    <Video size={32} />
                    <span className="text-xs font-medium">Video</span>
                  </div>
              </div>
            )}
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
            <input type="file" accept="video/*" ref={videoInputRef} className="hidden" onChange={handleVideoUpload} />
          </div>
        </div>

        <div className="mb-6 animate-slide-up animate-delay-200">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Note</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write something..."
            className="w-full h-40 p-4 bg-white/5 rounded-3xl border border-white/10 text-gray-200 placeholder:text-gray-500 text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-tulika-500/30 transition-all resize-none"
          />
        </div>
      </div>
    </div>
  );
};

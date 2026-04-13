import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, X, Video } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal } from '../components/PremiumModal';
import { ViewState, Memory } from '../types';
import { StorageService } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';
import { useConfetti } from '../components/Layout';
import { MagneticButton } from '../components/MagneticButton';

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
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confetti = useConfetti();
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
          const profile = StorageService.getCoupleProfile();
          if (!profile.isPremium) {
              setShowPremiumModal(true);
              return;
          }

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

    if (StorageService.hasReachedMemoryLimit()) {
      setShowPremiumModal(true);
      return;
    }

    setIsSaving(true);
    
    const newMemory: Memory = {
      id: generateId(),
      text: text.trim(),
      image: image || undefined, // Stores thumbnail if video present
      video: video || undefined,
      date: new Date().toISOString(),
      mood: selectedMood
    };

    // Optimistic UI: Save runs in background, instantly return to timeline
    StorageService.saveMemory(newMemory).catch(e => console.error("Background save failed", e));
    feedback.celebrate();
    confetti.trigger();
    setView('timeline');
  };

  const isDisabled = isSaving || (!text.trim() && !image && !video);

    const containerVariants = {
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.1 }
      }
    };

    const itemVariants = {
      hidden: { opacity: 0, y: 16 },
      show: { 
        opacity: 1, 
        y: 0, 
        transition: { 
            type: 'spring' as const, 
            stiffness: 450, 
            damping: 30, 
            mass: 0.8,
            restDelta: 0.001 
        } 
      }
    };

  return (
    <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col h-full min-h-screen" 
        style={{ background: 'transparent' }}
    >
      <ViewHeader
        title="New Memory"
        onBack={() => setView('home')}
        variant="centered"
        rightSlot={
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={handleSave}
            disabled={isDisabled}
            className="px-6 py-2 rounded-full text-[13px] font-bold uppercase tracking-wider transition-all spring-press text-white disabled:opacity-30 shadow-sm active:shadow-none"
            style={{ background: 'var(--theme-nav-center-bg-active)' }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </motion.button>
        }
      />

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto p-6 pb-32"
      >
        <motion.div variants={itemVariants} className="mb-8">
          <label className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--color-text-secondary)' }}>Current Mood</label>
          <div data-lenis-prevent className="lenis-inner flex gap-5 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
            {Moods.map((m) => (
              <MagneticButton
                key={m.id}
                onClick={() => { setSelectedMood(m.id); }}
                className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl transition-all relative ${
                  selectedMood === m.id ? 'bg-lior-500/10 scale-110' : 'bg-white/40 border border-white/60'
                }`}
              >
                {selectedMood === m.id && (
                    <motion.div 
                        layoutId="active-mood"
                        className="absolute inset-0 border-2 border-lior-400 rounded-2xl shadow-sm"
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    />
                )}
                <span className="relative z-10">{m.emoji}</span>
              </MagneticButton>
            ))}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="mb-8">
          <label className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--color-text-secondary)' }}>Media Vault</label>
          <div
            className={`relative overflow-hidden transition-shadow ${image || video ? 'aspect-auto shadow-lg' : 'p-10'}`}
            style={{ 
                borderRadius: 'var(--radius-xl)',
                ...(!image && !video ? { 
                    background: 'rgba(var(--theme-particle-2-rgb),0.05)', 
                    border: '1.5px dashed rgba(var(--theme-particle-2-rgb),0.15)',
                    boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.02)'
                } : {})
            }}
          >
            {image && !video ? (
              <>
                <motion.img 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  src={image} alt="Memory" className="w-full h-auto object-cover" 
                />
                <button onClick={removeMedia} className="absolute top-3 right-3 bg-black/40 backdrop-blur-md text-white p-2.5 rounded-full transition-colors active:scale-90"><X size={18} /></button>
              </>
            ) : video ? (
                <>
                    {image ? (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="relative"
                        >
                            <img src={image} alt="Video thumb" className="w-full h-auto object-cover opacity-90" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div 
                                    whileTap={{ scale: 0.9 }}
                                    className="bg-white/20 p-5 rounded-full backdrop-blur-md border border-white/30 shadow-2xl"
                                >
                                    <Video className="text-white fill-white/20" size={36} />
                                </motion.div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.video 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            src={video} controls className="w-full h-auto" 
                        />
                    )}
                    <button onClick={removeMedia} className="absolute top-3 right-3 bg-black/40 backdrop-blur-md text-white p-2.5 rounded-full z-10 active:scale-90"><X size={18} /></button>
                </>
            ) : (
              <div className="flex gap-6 justify-center">
                  <motion.div 
                    whileTap={{ scale: 0.94 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-3 cursor-pointer p-4 rounded-2xl transition-all" style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-white/80">
                        <Camera size={32} strokeWidth={1.5} className="text-lior-500" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">Photo</span>
                  </motion.div>
                  <div className="w-px my-4" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.12)' }}></div>
                  <motion.div
                    whileTap={{ scale: 0.94 }}
                    onClick={() => videoInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-3 cursor-pointer p-4 rounded-2xl transition-all" style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-white/80">
                        <Video size={32} strokeWidth={1.5} className="text-blue-500" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">Video</span>
                  </motion.div>
              </div>
            )}
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
            <input type="file" accept="video/*" ref={videoInputRef} className="hidden" onChange={handleVideoUpload} />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="mb-10">
          <label className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--color-text-secondary)' }}>The Details</label>
          <textarea
            value={text}
            onFocus={() => feedback.tap()}
            onChange={(e) => setText(e.target.value)}
            placeholder="What made this moment special?"
            className="w-full h-48 p-8 text-lg leading-relaxed transition-all resize-none outline-none placeholder:opacity-30"
            style={{ 
                borderRadius: 'var(--radius-xl)',
                background: 'rgba(255,255,255,0.6)', 
                border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', 
                color: 'var(--color-text-primary)',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.02)'
            }}
          />
        </motion.div>
      </motion.div>
      <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
    </motion.div>
  );
};

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Video, Mic, Square, Play, Pause, Trash2, Send, Sparkles, ImagePlus } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal } from '../components/PremiumModal';
import { ViewState, Memory } from '../types';
import { StorageService } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';
import { useConfetti } from '../components/Layout';

interface AddMemoryProps {
  setView: (view: ViewState) => void;
}

const Moods = [
  { emoji: '😍', id: 'love', label: 'Love' },
  { emoji: '😂', id: 'funny', label: 'Funny' },
  { emoji: '🥳', id: 'party', label: 'Party' },
  { emoji: '😌', id: 'peace', label: 'Peace' },
  { emoji: '🥺', id: 'cute', label: 'Cute' },
];

const WAVEFORM_BARS = 32;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

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

  // ── Voice recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingDurationRef = useRef(0);
  const [pendingAudio, setPendingAudio] = useState<{ dataUri: string; duration: number } | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(WAVEFORM_BARS).fill(0));
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();
      playbackRef.current?.pause();
    };
  }, []);

  const drawWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    const step = Math.floor(bufferLength / WAVEFORM_BARS);
    const bars = Array.from({ length: WAVEFORM_BARS }, (_, i) => dataArray[i * step] / 255);
    setWaveformData(bars);
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtxRef.current = new AudioContext();
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      drawWaveform();

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = ev => {
          setPendingAudio({ dataUri: ev.target?.result as string, duration: recordingDurationRef.current });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        audioCtxRef.current?.close();
        setWaveformData(new Array(WAVEFORM_BARS).fill(0));
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
      timerRef.current = setInterval(() => setRecordingDuration(d => {
        const next = d + 1;
        recordingDurationRef.current = next;
        return next;
      }), 1000);
      feedback.tap();
    } catch {
      toast.show('Microphone access denied', 'error');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const removeAudio = () => {
    setPendingAudio(null);
    setAudioPlaying(false);
    setAudioProgress(0);
    playbackRef.current?.pause();
    playbackRef.current = null;
  };

  const toggleAudioPlayback = () => {
    if (!pendingAudio) return;
    if (!playbackRef.current) {
      playbackRef.current = new Audio(pendingAudio.dataUri);
      playbackRef.current.ontimeupdate = () => {
        if (!playbackRef.current) return;
        setAudioProgress(playbackRef.current.currentTime / (playbackRef.current.duration || 1));
      };
      playbackRef.current.onended = () => { setAudioPlaying(false); setAudioProgress(0); };
    }
    if (audioPlaying) {
      playbackRef.current.pause();
      setAudioPlaying(false);
    } else {
      playbackRef.current.play().catch(() => {});
      setAudioPlaying(true);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
       try {
           const compressed = await compressImage(file);
           setImage(compressed);
           setVideo(null);
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
          
          try {
            const thumb = await generateVideoThumbnail(file);
            setImage(thumb);
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
    if (!text.trim() && !image && !video && !pendingAudio) return;

    if (StorageService.hasReachedMemoryLimit()) {
      setShowPremiumModal(true);
      return;
    }

    setIsSaving(true);
    
    const memId = generateId();

    let audioMeta: { audioId: string; audioBytes: number; audioMimeType: string; audioStoragePath: string | null; audioDuration: number } | undefined;
    if (pendingAudio) {
      try {
        const audioId = `mem_audio_${memId}`;
        const result = await StorageService.saveVoiceNoteAudio(audioId, pendingAudio.dataUri);
        audioMeta = {
          audioId,
          audioBytes: result.byteSize,
          audioMimeType: result.mimeType,
          audioStoragePath: result.storagePath,
          audioDuration: pendingAudio.duration,
        };
      } catch (e: any) {
        setIsSaving(false);
        toast.show('Could not save voice recording', 'error');
        return;
      }
    }

    const newMemory: Memory = {
      id: memId,
      text: text.trim(),
      image: image || undefined,
      video: video || undefined,
      date: new Date().toISOString(),
      mood: selectedMood,
      ...(audioMeta || {}),
    };

    try {
      await StorageService.saveMemory(newMemory);
    } catch (e: any) {
      setIsSaving(false);
      alert(e?.message || 'Memory could not be saved.');
      return;
    }
    feedback.celebrate();
    confetti.trigger();
    setView('timeline');
  };

  const isDisabled = isSaving || (!text.trim() && !image && !video && !pendingAudio);
  const hasMedia = !!(image || video);
  const attachmentCount = [hasMedia, !!pendingAudio].filter(Boolean).length;

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
      />

      <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-5 pt-2 pb-48">
        {/* ══════════════════════════════════════════════════════════════
             SECTION 1 — TEXT INPUT (Hero area, biggest real estate)
           ══════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 450, damping: 30, delay: 0.05 }}
          className="mb-6"
        >
          <textarea
            value={text}
            onFocus={() => feedback.tap()}
            onChange={(e) => setText(e.target.value)}
            placeholder="What made this moment special?"
            className="w-full min-h-[160px] p-5 text-[16px] leading-relaxed resize-none outline-none placeholder:opacity-25"
            style={{ 
                borderRadius: 20,
                background: 'rgba(255,255,255,0.6)', 
                border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.1)', 
                color: 'var(--color-text-primary)',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.015), 0 1px 3px rgba(0,0,0,0.02)',
            }}
          />
        </motion.div>

        {/* ══════════════════════════════════════════════════════════════
             SECTION 2 — MOOD SELECTOR (Compact pill strip)
           ══════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 450, damping: 30, delay: 0.1 }}
          className="mb-6"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3 ml-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
            Mood
          </p>
          <div className="flex gap-2">
            {Moods.map((m) => {
              const active = selectedMood === m.id;
              return (
                <motion.button
                  key={m.id}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { setSelectedMood(m.id); feedback.tap(); }}
                  className="flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-2xl transition-all relative"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, rgba(244,114,182,0.12), rgba(251,207,232,0.2))'
                      : 'rgba(255,255,255,0.4)',
                    border: active
                      ? '1.5px solid rgba(244,114,182,0.3)'
                      : '1px solid rgba(255,255,255,0.6)',
                    boxShadow: active
                      ? '0 4px 16px rgba(244,114,182,0.1)'
                      : 'none',
                  }}
                >
                  <span className={`text-[22px] transition-transform ${active ? 'scale-110' : ''}`}>{m.emoji}</span>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: active ? 'var(--color-nav-active)' : 'var(--color-text-secondary)', opacity: active ? 1 : 0.4 }}
                  >
                    {m.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════════════════════════
             SECTION 3 — MEDIA PREVIEW (shown when media is attached)
           ══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {hasMedia && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="mb-6 relative overflow-hidden"
              style={{ borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
            >
              {video && image ? (
                <div className="relative">
                  <img src={image} alt="Video thumb" className="w-full h-auto object-cover" style={{ maxHeight: 280 }} />
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.15)' }}>
                    <motion.div
                      whileTap={{ scale: 0.9 }}
                      className="w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-xl"
                      style={{ background: 'rgba(255,255,255,0.25)', border: '1.5px solid rgba(255,255,255,0.4)' }}
                    >
                      <Play size={22} fill="white" style={{ color: '#fff', marginLeft: 2 }} />
                    </motion.div>
                  </div>
                </div>
              ) : video ? (
                <video src={video} controls className="w-full h-auto" style={{ maxHeight: 280 }} />
              ) : image ? (
                <img src={image} alt="Memory" className="w-full h-auto object-cover" style={{ maxHeight: 280 }} />
              ) : null}

              {/* Remove media button */}
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={removeMedia}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                <X size={15} className="text-white" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════
             SECTION 3b — VOICE NOTE PREVIEW (after recording)
           ══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {pendingAudio && !isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="mb-6 rounded-[18px] p-4"
              style={{
                background: 'linear-gradient(135deg, rgba(244,114,182,0.06), rgba(251,207,232,0.1))',
                border: '1.5px solid rgba(244,114,182,0.15)',
              }}
            >
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={toggleAudioPlayback}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: audioPlaying
                      ? 'var(--theme-nav-center-bg-active)'
                      : 'linear-gradient(135deg, rgba(244,114,182,0.15), rgba(251,207,232,0.25))',
                    boxShadow: audioPlaying ? '0 4px 16px rgba(244,114,182,0.3)' : 'none',
                  }}
                >
                  {audioPlaying
                    ? <Pause size={14} fill="white" style={{ color: '#fff' }} />
                    : <Play size={14} fill="var(--color-nav-active)" style={{ color: 'var(--color-nav-active)', marginLeft: 1 }} />
                  }
                </motion.button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Mic size={11} style={{ color: 'var(--color-nav-active)' }} />
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Voice attached</span>
                    <span className="text-[10px] tabular-nums ml-auto flex-shrink-0" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                      {formatDuration(pendingAudio.duration)}
                    </span>
                  </div>
                  <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.1)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        width: `${audioProgress * 100}%`,
                        background: 'var(--theme-nav-center-bg-active)',
                      }}
                    />
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.8 }}
                  onClick={removeAudio}
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.08)' }}
                >
                  <Trash2 size={13} style={{ color: '#ef4444' }} />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════
             SECTION 4 — ATTACH BAR (compact row of action chips)
           ══════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 450, damping: 30, delay: 0.15 }}
          className="mb-6"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3 ml-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
            Attach
          </p>
          <div className="flex gap-2.5">
            {/* Photo chip */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center gap-2.5 p-3.5 rounded-2xl"
              style={{
                background: hasMedia && !video
                  ? 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(139,92,246,0.08))'
                  : 'rgba(255,255,255,0.5)',
                border: hasMedia && !video
                  ? '1.5px solid rgba(168,85,247,0.2)'
                  : '1px solid rgba(255,255,255,0.6)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(139,92,246,0.08))' }}
              >
                <Camera size={16} strokeWidth={1.8} style={{ color: '#8b5cf6' }} />
              </div>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Photo</span>
            </motion.button>

            {/* Video chip */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => videoInputRef.current?.click()}
              className="flex-1 flex items-center gap-2.5 p-3.5 rounded-2xl"
              style={{
                background: video
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(96,165,250,0.08))'
                  : 'rgba(255,255,255,0.5)',
                border: video
                  ? '1.5px solid rgba(59,130,246,0.2)'
                  : '1px solid rgba(255,255,255,0.6)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(96,165,250,0.08))' }}
              >
                <Video size={16} strokeWidth={1.8} style={{ color: '#3b82f6' }} />
              </div>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Video</span>
            </motion.button>

            {/* Voice chip */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={pendingAudio ? undefined : startRecording}
              className="flex-1 flex items-center gap-2.5 p-3.5 rounded-2xl"
              style={{
                background: pendingAudio
                  ? 'linear-gradient(135deg, rgba(244,114,182,0.1), rgba(251,207,232,0.12))'
                  : 'rgba(255,255,255,0.5)',
                border: pendingAudio
                  ? '1.5px solid rgba(244,114,182,0.2)'
                  : '1px solid rgba(255,255,255,0.6)',
                opacity: pendingAudio ? 0.6 : 1,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(244,114,182,0.12), rgba(251,207,232,0.08))' }}
              >
                <Mic size={16} strokeWidth={1.8} style={{ color: '#f472b6' }} />
              </div>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Voice</span>
            </motion.button>
          </div>
        </motion.div>

        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
        <input type="file" accept="video/*" ref={videoInputRef} className="hidden" onChange={handleVideoUpload} />
      </div>

      {/* ══════════════════════════════════════════════════════════════
           STICKY SAVE BUTTON — fixed above nav
         ══════════════════════════════════════════════════════════════ */}
      <div
        className="fixed bottom-0 inset-x-0 z-[45] flex justify-center pointer-events-none"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 20px) + 84px)' }}
      >
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isDisabled ? 0.45 : 1, y: 0 }}
          whileTap={{ scale: 0.94 }}
          onClick={handleSave}
          disabled={isDisabled}
          className="pointer-events-auto flex items-center gap-2.5 px-8 py-4 rounded-full text-[14px] font-bold text-white disabled:pointer-events-none"
          style={{
            background: 'var(--theme-nav-center-bg-active)',
            boxShadow: isDisabled
              ? 'none'
              : '0 8px 32px rgba(244,114,182,0.35), 0 2px 8px rgba(0,0,0,0.08)',
            transition: 'opacity 0.3s, box-shadow 0.3s',
          }}
        >
          {isSaving ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
              Saving...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Save Memory
            </>
          )}
        </motion.button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
           FULL-SCREEN VOICE RECORDING OVERLAY (z-60, above nav)
         ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            key="voice-recording-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
            style={{
              background: 'linear-gradient(180deg, rgba(15,5,10,0.88) 0%, rgba(40,10,25,0.95) 100%)',
              backdropFilter: 'blur(40px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
            }}
          >
            {/* Ambient rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              {[0, 1, 2].map(ring => (
                <motion.div
                  key={ring}
                  className="absolute rounded-full"
                  style={{
                    width: 180 + ring * 90,
                    height: 180 + ring * 90,
                    border: `1px solid rgba(244,114,182,${0.12 - ring * 0.03})`,
                  }}
                  animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.15, 0.4] }}
                  transition={{ duration: 3 + ring * 0.5, repeat: Infinity, delay: ring * 0.6, ease: 'easeInOut' }}
                />
              ))}
            </div>

            {/* Timer */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative z-[1] flex flex-col items-center"
            >
              <div className="flex items-center gap-2 mb-2">
                <motion.div
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#f43f5e', boxShadow: '0 0 12px rgba(244,63,94,0.6)' }}
                />
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'rgba(244,114,182,0.7)' }}>
                  Recording
                </span>
              </div>
              <span
                className="text-[52px] font-extralight tabular-nums leading-none"
                style={{ color: 'rgba(255,255,255,0.95)', letterSpacing: '0.04em' }}
              >
                {formatDuration(recordingDuration)}
              </span>
            </motion.div>

            {/* Waveform */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="relative z-[1] flex items-end justify-center gap-[3px] h-14 w-[80%] max-w-xs mt-8 mb-10"
            >
              {waveformData.map((v, i) => (
                <motion.div
                  key={i}
                  className="flex-1 rounded-full"
                  animate={{ height: `${Math.max(6, v * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  style={{
                    background: `linear-gradient(to top, rgba(244,114,182,${0.3 + v * 0.7}), rgba(251,113,133,${0.2 + v * 0.6}))`,
                    boxShadow: v > 0.5 ? `0 0 8px rgba(244,114,182,${v * 0.3})` : 'none',
                  }}
                />
              ))}
            </motion.div>

            {/* Stop button */}
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              whileTap={{ scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.15 }}
              onClick={stopRecording}
              className="relative z-[1] w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
                boxShadow: '0 8px 40px rgba(244,63,94,0.45), 0 0 0 6px rgba(244,63,94,0.15), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <Square size={24} fill="white" style={{ color: '#fff' }} />
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="relative z-[1] text-[12px] font-medium mt-4"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              Tap to stop
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
    </motion.div>
  );
};

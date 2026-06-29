import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, X, Video, Mic, Square, Play, Pause, Trash2, Sparkles, ImagePlus } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal, type PremiumFeatureContext } from '../components/PremiumModal';
import { ViewState, Memory } from '../types';
import { StorageService } from '../services/storage';
import { NativeMediaService } from '../services/nativeMedia';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { compressImage, generateVideoThumbnail, isVideoTooLarge } from '../utils/media';
import { useConfetti } from '../components/Layout';
import { MediaForge, ForgeFrame } from '../components/MediaForge';
import { ShareTargetService, SHARE_TARGET_EVENT } from '../services/shareTarget';
import { useDraft } from '../hooks/useDraft';

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

type MediaMeta = { kind: 'photo' | 'video'; bytes?: number; durationSec?: number; fileName?: string };

export const AddMemory: React.FC<AddMemoryProps> = ({ setView }) => {
  // Draft survives process death — losing a written memory hurts here.
  const [text, setText, clearTextDraft] = useDraft('add-memory.text', '');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [mediaMeta, setMediaMeta] = useState<MediaMeta | null>(null);
  const [isProcessingMedia, setIsProcessingMedia] = useState<'photo' | 'video' | null>(null);
  const [forgeFrame, setForgeFrame] = useState<ForgeFrame>('none');
  // Forge state — when a photo or video is freshly picked, the full-screen
  // MediaForge sheet opens. The user reviews, frames, captions, and confirms
  // before the asset commits to the form. Cancelling discards the pick.
  const [forgePending, setForgePending] = useState<{
    kind: 'photo' | 'video';
    image: string | null;
    video: string | null;
    bytes?: number;
    durationSec?: number;
  } | null>(null);
  const [selectedMood, setSelectedMood] = useState('love');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumContext, setPremiumContext] = useState<PremiumFeatureContext>('video');
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

  // ── Helpers ─────────────────────────────────────────────────────────────
  const approxDataUrlBytes = (url: string): number | undefined => (
    url.startsWith('data:')
      ? Math.round(((url.length - (url.indexOf(',') + 1)) * 3) / 4)
      : undefined
  );

  // ── System share target ──────────────────────────────────────────────────
  // A photo shared into Lior from another app is staged in the Forge exactly
  // like a picked photo (same compression, same review step). Checked on
  // mount for cold starts; the window event covers shares that arrive while
  // this view is already mounted.
  useEffect(() => {
    let cancelled = false;
    const applySharedImage = async () => {
      const dataUrl = ShareTargetService.consumePendingImage();
      if (!dataUrl) return;
      setIsProcessingMedia('photo');
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'shared-photo', { type: blob.type || 'image/jpeg' });
        const compressed = await compressImage(file);
        if (cancelled) return;
        setForgePending({
          kind: 'photo',
          image: compressed,
          video: null,
          bytes: approxDataUrlBytes(compressed),
        });
      } catch {
        toast.show("Couldn't import the shared photo.", 'error');
      } finally {
        if (!cancelled) setIsProcessingMedia(null);
      }
    };
    void applySharedImage();
    const handler = () => { void applySharedImage(); };
    window.addEventListener(SHARE_TARGET_EVENT, handler);
    return () => {
      cancelled = true;
      window.removeEventListener(SHARE_TARGET_EVENT, handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingMedia('photo');
    try {
      const compressed = await compressImage(file);
      // Don't commit yet — open the Forge for the user to review.
      setForgePending({
        kind: 'photo',
        image: compressed,
        video: null,
        bytes: approxDataUrlBytes(compressed),
      });
    } catch {
      toast.show("Couldn't process photo. Please try a different image.", 'error');
    } finally {
      setIsProcessingMedia(null);
    }
  };

  const handlePhotoPick = async () => {
    feedback.tap();
    if (NativeMediaService.isNativeAvailable()) {
      setIsProcessingMedia('photo');
      try {
        const picked = await NativeMediaService.pickPhoto();
        if (picked) {
          setForgePending({
            kind: 'photo',
            image: picked.dataUrl,
            video: null,
            bytes: approxDataUrlBytes(picked.dataUrl),
          });
        }
      } catch {
        toast.show("Couldn't open the photo picker. Try again.", 'error');
      } finally {
        setIsProcessingMedia(null);
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const profile = StorageService.getCoupleProfile();
    if (!profile.isPremium) {
      setPremiumContext('video');
      setShowPremiumModal(true);
      return;
    }
    if (isVideoTooLarge(file)) {
      toast.show('Video too large! Please choose a video under 25MB.', 'error');
      return;
    }

    setIsProcessingMedia('video');
    try {
      let thumb: string | null = null;
      try { thumb = await generateVideoThumbnail(file); }
      catch (err) { console.error('Thumbnail failed', err); }

      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      let durationSec: number | undefined;
      try {
        durationSec = await new Promise<number>((resolve, reject) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.src = dataUrl;
          v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 0);
          v.onerror = () => reject(new Error('metadata failed'));
        });
      } catch { /* duration is optional */ }

      setForgePending({
        kind: 'video',
        image: thumb,
        video: dataUrl,
        bytes: file.size,
        durationSec,
      });
    } finally {
      setIsProcessingMedia(null);
    }
  };

  // ── Forge handlers ──────────────────────────────────────────────────────
  const handleForgeConfirm = ({ frame, caption }: { frame: ForgeFrame; caption: string }) => {
    if (!forgePending) return;
    setImage(forgePending.image);
    setVideo(forgePending.video);
    setMediaMeta({
      kind: forgePending.kind,
      bytes: forgePending.bytes,
      durationSec: forgePending.durationSec,
    });
    setForgeFrame(frame);
    if (caption) {
      // Merge caption into the text area without clobbering existing text.
      setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${caption}` : caption));
    }
    setForgePending(null);
  };

  const handleForgeRetry = () => {
    if (!forgePending) return;
    const kind = forgePending.kind;
    setForgePending(null);
    // Re-trigger the matching picker on the next tick.
    window.setTimeout(() => {
      if (kind === 'video') videoInputRef.current?.click();
      else void handlePhotoPick();
    }, 60);
  };

  const handleForgeClose = () => {
    setForgePending(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const removeMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImage(null);
    setVideo(null);
    setMediaMeta(null);
    setForgeFrame('none');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const replaceMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaMeta?.kind === 'video') {
      videoInputRef.current?.click();
    } else {
      void handlePhotoPick();
    }
  };

  const handleSave = async () => {
    if (!text.trim() && !image && !video && !pendingAudio) return;

    if (StorageService.hasReachedMemoryLimit()) {
      setPremiumContext('memory');
      setShowPremiumModal(true);
      return;
    }

    setIsSaving(true);
    feedback.tap();

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
      // Persist the visual frame so the timeline + detail view can
      // re-apply it — without this the polaroid/film/glow looks chosen
      // in MediaForge are silently dropped on save.
      frame: forgeFrame !== 'none' ? forgeFrame : undefined,
      ...(audioMeta || {}),
    };

    try {
      await StorageService.saveMemory(newMemory);
    } catch (e: any) {
      setIsSaving(false);
      toast.show(e?.message || 'Memory could not be saved.', 'error');
      return;
    }
    clearTextDraft();
    feedback.celebrate();
    confetti.trigger();
    setView('timeline');
  };

  const isDisabled = isSaving || (!text.trim() && !image && !video && !pendingAudio);
  const hasMedia = !!(image || video);

  // ══════════════════════════════════════════════════════════════════════
  // Display helpers
  // ══════════════════════════════════════════════════════════════════════
  const today = useMemo(() => new Date(), []);
  const dateLine = useMemo(() => today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), [today]);

  // ══════════════════════════════════════════════════════════════════════
  // Card surface — single composer card holds textarea + mood + previews.
  // Frosted white at ~86% opacity, soft elevation, tight 1px hairline.
  // ══════════════════════════════════════════════════════════════════════
  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.78))',
    border: '1px solid rgba(255,255,255,0.85)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 12px 28px rgba(90,60,80,0.07), 0 2px 6px rgba(90,60,80,0.04)',
    borderRadius: 22,
  };

  return (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden relative"
        style={{ background: 'transparent' }}
    >
      {/* ══════════════════════════════════════════════════════════════
           AMBIENT WASH — two soft pools behind the composer. Pulled way
           back from the prior design so the page reads quiet, not staged.
         ══════════════════════════════════════════════════════════════ */}
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            top: '-25%', left: '-25%', width: '80vw', height: '80vw',
            background: 'radial-gradient(circle, rgba(244,114,182,0.13), transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-30%', right: '-25%', width: '85vw', height: '85vw',
            background: 'radial-gradient(circle, rgba(168,85,247,0.10), transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════
           HEADER — minimal: back chevron, date label, mirror spacer.
         ══════════════════════════════════════════════════════════════ */}
      <div
        className="relative z-10 flex items-center justify-between px-5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)', paddingBottom: 8 }}
      >
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => { feedback.tap(); setView('home'); }}
          aria-label="Back"
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(255,255,255,0.70)',
            border: '1px solid rgba(0,0,0,0.04)',
            color: 'var(--color-text-primary)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <ArrowLeft size={17} strokeWidth={2.2} />
        </motion.button>

        <span
          className="text-[10.5px] font-semibold uppercase"
          style={{
            color: 'var(--color-text-secondary)',
            opacity: 0.55,
            letterSpacing: '0.20em',
          }}
        >
          {dateLine}
        </span>

        <span className="w-10 h-10" aria-hidden />
      </div>

      {/* ══════════════════════════════════════════════════════════════
           SCROLL BODY — single composer, one mood row, one add-media row.
         ══════════════════════════════════════════════════════════════ */}
      <div
        data-lenis-prevent
        className="lenis-inner relative z-[1] flex-1 min-h-0 overflow-y-auto px-5 pt-3 pb-32"
      >
        {/* Hero — slim, single line. The composer is the focus. */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif mb-6"
          style={{
            fontSize: 'clamp(26px, 7.4vw, 32px)',
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
          }}
        >
          A new memory
        </motion.h1>

        {/* ── COMPOSER CARD ───────────────────────────────────────────
            One unified surface holding: attached media (if any),
            voice note preview (if any), the textarea, and the mood
            row separated by a hairline. */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
          style={cardStyle}
        >
          {/* Media thumbnail — only when attached. */}
          <AnimatePresence mode="popLayout">
            {hasMedia && (
              <motion.div
                key="media-preview"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <div className="relative overflow-hidden" style={{ background: '#000' }}>
                  {video && image ? (
                    <div className="relative">
                      <img
                        src={image}
                        alt=""
                        className="w-full object-cover"
                        style={{ maxHeight: 220, filter: forgeFrame === 'film' ? 'saturate(1.15) contrast(1.04) sepia(0.10)' : undefined }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.16)' }}>
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center"
                          style={{
                            background: 'rgba(255,255,255,0.28)',
                            border: '1.5px solid rgba(255,255,255,0.45)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                          }}
                        >
                          <Play size={18} fill="white" style={{ color: '#fff', marginLeft: 2 }} />
                        </div>
                      </div>
                    </div>
                  ) : video ? (
                    <video src={video} controls className="w-full" style={{ maxHeight: 220, background: '#000' }} />
                  ) : image ? (
                    <img
                      src={image}
                      alt=""
                      className="w-full object-cover"
                      style={{ maxHeight: 220, filter: forgeFrame === 'film' ? 'saturate(1.15) contrast(1.04) sepia(0.10)' : undefined }}
                    />
                  ) : null}

                  {/* Tiny meta chip */}
                  {mediaMeta && (
                    <div
                      className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold text-white"
                      style={{
                        background: 'rgba(0,0,0,0.42)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {mediaMeta.kind === 'video' ? <Video size={10} strokeWidth={2.4} /> : <ImagePlus size={10} strokeWidth={2.4} />}
                      <span className="capitalize">{mediaMeta.kind}</span>
                      {mediaMeta.kind === 'video' && typeof mediaMeta.durationSec === 'number' && mediaMeta.durationSec > 0 && (
                        <span className="tabular-nums opacity-80">{formatDuration(mediaMeta.durationSec)}</span>
                      )}
                    </div>
                  )}

                  {/* Replace + Remove — quiet pills, top-right */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={replaceMedia}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="Replace media"
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: 'rgba(255,255,255,0.22)',
                        border: '1px solid rgba(255,255,255,0.32)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        color: '#fff',
                      }}
                    >
                      <ImagePlus size={13} strokeWidth={2.2} />
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={removeMedia}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="Remove media"
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: 'rgba(0,0,0,0.50)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        color: '#fff',
                      }}
                    >
                      <X size={13} strokeWidth={2.2} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Voice preview — inline strip, only when audio exists */}
          <AnimatePresence mode="popLayout">
            {pendingAudio && !isRecording && (
              <motion.div
                key="voice-strip"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="px-4 py-3 flex items-center gap-3"
                style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={toggleAudioPlayback}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: audioPlaying ? 'linear-gradient(135deg, #f472b6, #ec4899)' : 'rgba(244,114,182,0.12)',
                    color: audioPlaying ? '#fff' : '#ec4899',
                    boxShadow: audioPlaying ? '0 4px 12px rgba(244,114,182,0.32)' : 'none',
                  }}
                  aria-label={audioPlaying ? 'Pause' : 'Play'}
                >
                  {audioPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 1 }} />}
                </motion.button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[2px] h-5">
                    {Array.from({ length: 28 }).map((_, i) => {
                      const seed = ((i * 7) % 11) / 11;
                      const baseHeight = 0.25 + seed * 0.65;
                      const progressX = audioProgress * 28;
                      const isPast = i < progressX;
                      return (
                        <span
                          key={i}
                          className="flex-1 rounded-full"
                          style={{
                            height: `${baseHeight * 100}%`,
                            background: isPast ? '#ec4899' : 'rgba(244,114,182,0.22)',
                          }}
                        />
                      );
                    })}
                  </div>
                  <span
                    className="block mt-1 text-[10px] tabular-nums font-semibold"
                    style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}
                  >
                    {formatDuration(pendingAudio.duration)} voice note
                  </span>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={removeAudio}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}
                  aria-label="Remove voice note"
                >
                  <Trash2 size={13} strokeWidth={2.2} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Processing skeleton — same card, slim band */}
          <AnimatePresence>
            {isProcessingMedia && !hasMedia && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="relative overflow-hidden flex items-center justify-center py-6"
                style={{
                  background: 'linear-gradient(90deg, rgba(244,114,182,0.04), rgba(168,85,247,0.04))',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 w-[40%]"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)' }}
                  initial={{ x: '-100%' }}
                  animate={{ x: '300%' }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
                />
                <span className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.18em', color: '#ec4899' }}>
                  {isProcessingMedia === 'video' ? 'Processing video…' : 'Compressing photo…'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TEXTAREA — the heart of the page */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What happened? Who was there? What did it feel like?"
            inputMode="text"
            enterKeyHint="done"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            className="block w-full min-h-[160px] px-5 py-4 text-[16px] leading-relaxed resize-none outline-none bg-transparent placeholder:opacity-40"
            style={{ color: 'var(--color-text-primary)', fontWeight: 400 }}
          />

          {/* MOOD ROW — hairline divider, then inline emoji chips */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
          >
            <span
              className="text-[11px] font-semibold flex-shrink-0"
              style={{ color: 'var(--color-text-secondary)', opacity: 0.62 }}
            >
              How did it feel?
            </span>
            <div className="flex items-center gap-1">
              {Moods.map((m) => {
                const active = selectedMood === m.id;
                return (
                  <motion.button
                    key={m.id}
                    type="button"
                    whileTap={{ scale: 0.88 }}
                    onClick={() => { setSelectedMood(m.id); feedback.tap(); }}
                    aria-label={m.label}
                    aria-pressed={active}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: active ? 'rgba(244,114,182,0.16)' : 'transparent',
                      border: active ? '1.5px solid rgba(244,114,182,0.45)' : '1px solid transparent',
                      transform: active ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <span className="text-[19px] leading-none">{m.emoji}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.section>

        {/* ── ADD MEDIA ROW ──────────────────────────────────────────
            Three quiet action chips. Highlighted when their attachment
            is already in place; the Voice chip disables itself once a
            recording exists (one voice note per memory). */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.10, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 grid grid-cols-3 gap-2"
        >
          {[
            { id: 'photo', label: 'Photo', Icon: Camera, onTap: handlePhotoPick, active: !!image && !video, disabled: false },
            { id: 'video', label: 'Video', Icon: Video, onTap: () => { feedback.tap(); videoInputRef.current?.click(); }, active: !!video, disabled: false },
            { id: 'voice', label: 'Voice', Icon: Mic, onTap: pendingAudio ? undefined : startRecording, active: !!pendingAudio, disabled: !!pendingAudio },
          ].map((act) => (
            <motion.button
              key={act.id}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={act.onTap}
              disabled={act.disabled}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl disabled:opacity-60"
              style={{
                background: act.active ? 'rgba(244,114,182,0.10)' : 'rgba(255,255,255,0.78)',
                border: `1px solid ${act.active ? 'rgba(244,114,182,0.32)' : 'rgba(0,0,0,0.04)'}`,
                color: act.active ? '#ec4899' : 'var(--color-text-primary)',
              }}
            >
              <act.Icon size={15} strokeWidth={2.0} />
              <span className="text-[12.5px] font-semibold">{act.label}</span>
            </motion.button>
          ))}
        </motion.div>

        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
        <input type="file" accept="video/*" ref={videoInputRef} className="hidden" onChange={handleVideoUpload} />
      </div>

      {/* ══════════════════════════════════════════════════════════════
           STICKY CTA — single rose pill, full width, calm shadow.
         ══════════════════════════════════════════════════════════════ */}
      <div
        className="fixed bottom-0 inset-x-0 z-[45] px-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <div
          aria-hidden
          className="absolute -top-10 inset-x-0 h-10 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--theme-bg-main, #f5d2dc))' }}
        />
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.985 }}
          onClick={handleSave}
          disabled={isDisabled}
          className="relative w-full flex items-center justify-center gap-2 overflow-hidden disabled:cursor-not-allowed"
          style={{
            height: 54,
            borderRadius: 18,
            background: isDisabled
                ? 'rgba(255,255,255,0.55)'
                : 'linear-gradient(180deg, #ec4899 0%, #be3d72 100%)',
            color: isDisabled ? 'rgba(80,40,60,0.45)' : '#fff5f8',
            boxShadow: isDisabled
                ? '0 6px 14px rgba(90,60,80,0.06)'
                : '0 12px 28px rgba(236,72,153,0.32), 0 3px 8px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.22)',
            fontWeight: 700,
            fontSize: 14.5,
            letterSpacing: '0.01em',
            transition: 'opacity 0.2s, box-shadow 0.2s',
          }}
          aria-label="Save memory"
        >
          {isSaving ? (
            <>
              <motion.span
                aria-hidden
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.85, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
              <span>Saving…</span>
            </>
          ) : (
            <>
              <Sparkles size={14} strokeWidth={2.2} />
              <span>Save memory</span>
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

      <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} featureContext={premiumContext} />

      {/* Full-screen Forge — opens on every photo/video pick before commit */}
      <MediaForge
        isOpen={!!forgePending}
        kind={forgePending?.kind ?? 'photo'}
        imageSrc={forgePending?.image ?? null}
        videoSrc={forgePending?.video ?? null}
        bytes={forgePending?.bytes}
        durationSec={forgePending?.durationSec}
        initialCaption={text}
        onConfirm={handleForgeConfirm}
        onRetry={handleForgeRetry}
        onClose={handleForgeClose}
      />
    </motion.div>
  );
};

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Play, Pause, Calendar, Film, Lock, Check, X, Heart, Crown,
  ChevronLeft, ChevronRight, ArrowLeft, RotateCcw, Download, Sparkles, RefreshCw
} from 'lucide-react';
import { ViewState, VideoMomentDay, MonthlyVideoCompilation, DailyVideoClip } from '../types';
import { VideoMomentsService, videoMomentsEventTarget } from '../services/videoMoments';
import { VideoCompilerService } from '../services/videoCompiler';
import { toast } from '../utils/toast';
import { feedback } from '../utils/feedback';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { StorageService } from '../services/storage';

interface DailyVideoViewProps {
  setView: (view: ViewState) => void;
}

type ViewMode = 'today' | 'calendar' | 'compilations';
type RecordingPhase = 'preview' | 'countdown' | 'recording' | 'review';

const MAX_DURATION_MS = 10000;

type MonthSummary = {
  month: string;
  totalClips: number;
  daysCaptured: number;
  duetDays: number;
  totalDurationMs: number;
  coverage: number;
};

const formatDurationLabel = (durationMs: number): string => {
  if (durationMs < 60000) return `${Math.ceil(durationMs / 1000)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const summarizeMonth = (month: string, clips: DailyVideoClip[]): MonthSummary => {
  const uniqueDays = new Set(clips.map(clip => clip.clipDate));
  const byDay = new Map<string, number>();

  clips.forEach((clip) => {
    byDay.set(clip.clipDate, (byDay.get(clip.clipDate) || 0) + 1);
  });

  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = getDaysInMonth(new Date(year, monthNumber - 1, 1));

  return {
    month,
    totalClips: clips.length,
    daysCaptured: uniqueDays.size,
    duetDays: [...byDay.values()].filter((count) => count > 1).length,
    totalDurationMs: clips.reduce((sum, clip) => sum + clip.durationMs, 0),
    coverage: daysInMonth > 0 ? Math.round((uniqueDays.size / daysInMonth) * 100) : 0,
  };
};

const useClipThumbnail = (clip?: DailyVideoClip | null) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!clip) {
      setThumbnailUrl(null);
      return undefined;
    }

    VideoMomentsService.getThumbnailUrl(clip).then((url) => {
      if (!cancelled) setThumbnailUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [clip?.id, clip?.thumbnailId, clip?.thumbnailStoragePath]);

  return thumbnailUrl;
};

const useCompilationThumbnail = (compilation?: MonthlyVideoCompilation | null) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!compilation) {
      setThumbnailUrl(null);
      return undefined;
    }

    VideoMomentsService.getCompilationThumbnailUrl(compilation).then((url) => {
      if (!cancelled) setThumbnailUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [compilation?.id, compilation?.thumbnailId, compilation?.thumbnailStoragePath]);

  return thumbnailUrl;
};

// ── Countdown Ring ────────────────────────────────────────────────────
const CountdownRing: React.FC<{ progress: number; size?: number }> = ({ progress, size = 160 }) => {
  const radius = (size / 2) - 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);
  const color = progress < 0.5 ? '#a855f7' : progress < 0.8 ? '#ec4899' : '#f97316';

  return (
    <svg width={size} height={size} className="absolute">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="6"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        animate={{ strokeDashoffset, stroke: color }}
        transition={{ duration: 0.1 }}
      />
    </svg>
  );
};

// ── Camera Recorder Component ─────────────────────────────────────────
interface CameraRecorderProps {
  onComplete: (blob: Blob, duration: number, thumbnail: string) => void;
  onCancel: () => void;
}

const CameraRecorder: React.FC<CameraRecorderProps> = ({ onComplete, onCancel }) => {
  const [phase, setPhase] = useState<RecordingPhase>('preview');
  const [countdownNum, setCountdownNum] = useState(3);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordedThumbnail, setRecordedThumbnail] = useState('');

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Initialize camera on mount
  useEffect(() => {
    initCamera();
    return () => stopStream();
  }, []);

  const stopStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  }, []);

  const initCamera = useCallback(async (facingMode: 'user' | 'environment' = 'user') => {
    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      streamRef.current = stream;
      setHasPermission(true);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.muted = true;
        await videoPreviewRef.current.play();
      }
    } catch (err) {
      console.error('Camera init failed:', err);
      setHasPermission(false);
      toast.show('Camera access required', 'error');
    }
  }, []);

  const switchCamera = async () => {
    const newFacing = isFrontCamera ? 'environment' : 'user';
    setIsFrontCamera(!isFrontCamera);
    await initCamera(newFacing);
    feedback.tap();
  };

  const startCountdown = () => {
    if (!streamRef.current) return;
    setPhase('countdown');
    setCountdownNum(3);
    feedback.tap();

    let count = 3;
    const countInterval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdownNum(count);
        feedback.tap();
      } else {
        clearInterval(countInterval);
        startRecording();
      }
    }, 1000);
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    setPhase('recording');
    setRecordingTime(0);
    startTimeRef.current = Date.now();

    const mimeType = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType,
      videoBitsPerSecond: 2500000
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const duration = Date.now() - startTimeRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType });

      // Generate thumbnail
      const thumbnail = await generateThumbnail(blob);

      setRecordedBlob(blob);
      setRecordedDuration(Math.min(duration, MAX_DURATION_MS));
      setRecordedThumbnail(thumbnail);
      setPhase('review');
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(100);

    // Timer for UI
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setRecordingTime(Math.min(elapsed, MAX_DURATION_MS));

      // Auto-stop at max duration
      if (elapsed >= MAX_DURATION_MS) {
        stopRecording();
      }
    }, 50);

    feedback.tap();
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    stopStream();
  };

  const generateThumbnail = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.currentTime = 0.5;
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(video.src);
          resolve(dataUrl);
        } else {
          resolve('');
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve('');
      };

      video.src = URL.createObjectURL(blob);
    });
  };

  const handleRetake = () => {
    setRecordedBlob(null);
    setRecordedDuration(0);
    setRecordedThumbnail('');
    setPhase('preview');
    initCamera(isFrontCamera ? 'user' : 'environment');
  };

  const handleKeep = () => {
    if (recordedBlob) {
      onComplete(recordedBlob, recordedDuration, recordedThumbnail);
    }
  };

  const handleCancel = () => {
    stopStream();
    onCancel();
  };

  const progress = recordingTime / MAX_DURATION_MS;
  const remainingSeconds = Math.ceil((MAX_DURATION_MS - recordingTime) / 1000);

  // Permission denied state
  if (hasPermission === false) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
      >
        <Video size={48} className="text-white/40 mb-4" />
        <p className="text-white/60 text-center px-8 mb-6">
          Camera access is required to record your daily moment
        </p>
        <button
          onClick={handleCancel}
          className="px-6 py-3 rounded-full bg-white/10 text-white font-medium"
        >
          Go Back
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Preview / Recording Phase */}
      {(phase === 'preview' || phase === 'countdown' || phase === 'recording') && (
        <>
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: isFrontCamera ? 'scaleX(-1)' : 'none' }}
            />

            {/* Gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 p-5 pt-[max(1.25rem,env(safe-area-inset-top))] flex items-center justify-between">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleCancel}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm"
              >
                <X size={20} className="text-white" />
              </motion.button>

              {phase === 'preview' && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={switchCamera}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm"
                >
                  <RotateCcw size={18} className="text-white" />
                </motion.button>
              )}

              {phase === 'recording' && (
                <div className="px-3 py-1.5 rounded-full bg-red-500/80 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span className="text-white text-sm font-medium">REC</span>
                </div>
              )}
            </div>

            {/* Center content */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <AnimatePresence mode="wait">
                {phase === 'countdown' && (
                  <motion.div
                    key="countdown"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    className="w-32 h-32 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center"
                  >
                    <span className="text-7xl font-bold text-white">{countdownNum}</span>
                  </motion.div>
                )}

                {phase === 'recording' && (
                  <motion.div
                    key="recording"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative w-40 h-40 flex items-center justify-center"
                  >
                    <CountdownRing progress={progress} />
                    <span className="text-5xl font-light text-white">{remainingSeconds}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Preview instruction */}
            {phase === 'preview' && (
              <div className="absolute left-0 right-0 bottom-32 flex justify-center">
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-white/70 text-sm px-4 py-2 rounded-full bg-black/30 backdrop-blur-sm"
                >
                  Tap record for your 10-second moment
                </motion.p>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="p-8 pb-[max(2rem,env(safe-area-inset-bottom))] flex justify-center">
            {phase === 'preview' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={startCountdown}
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                  boxShadow: '0 0 30px rgba(168, 85, 247, 0.5)'
                }}
              >
                <Video size={32} className="text-white" strokeWidth={1.5} />
              </motion.button>
            )}

            {phase === 'countdown' && (
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-white/10">
                <span className="text-white/50 text-sm">Get ready...</span>
              </div>
            )}

            {phase === 'recording' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={stopRecording}
                className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <div className="w-7 h-7 rounded-md bg-white" />
              </motion.button>
            )}
          </div>
        </>
      )}

      {/* Review Phase */}
      {phase === 'review' && recordedBlob && (
        <>
          <div className="flex-1 relative overflow-hidden bg-gray-900">
            <video
              ref={reviewVideoRef}
              src={URL.createObjectURL(recordedBlob)}
              autoPlay
              loop
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: isFrontCamera ? 'scaleX(-1)' : 'none' }}
            />

            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
              <p className="text-center text-white/80 font-medium">Preview your moment</p>
            </div>

            {/* Duration badge */}
            <div className="absolute top-20 right-5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
              <span className="text-white text-sm">{Math.ceil(recordedDuration / 1000)}s</span>
            </div>
          </div>

          {/* Review actions */}
          <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex gap-4">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleRetake}
              className="flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-medium bg-white/10"
            >
              <RefreshCw size={18} className="text-white" />
              <span className="text-white">Retake</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleKeep}
              className="flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-medium"
              style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
            >
              <Check size={18} className="text-white" />
              <span className="text-white">Keep</span>
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  );
};

// ── Success Animation ─────────────────────────────────────────────────
const SuccessAnimation: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)' }}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className="relative"
      >
        <motion.div
          className="w-28 h-28 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(168, 85, 247, 0.4)',
              '0 0 0 40px rgba(168, 85, 247, 0)',
            ]
          }}
          transition={{ duration: 1.2, repeat: 1 }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: 'spring' }}
          >
            <Check size={48} className="text-white" strokeWidth={2.5} />
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8 text-center"
      >
        <h2 className="text-2xl font-bold text-white mb-2">Moment Captured!</h2>
        <p className="text-white/60">Your clip has been saved</p>
      </motion.div>
    </motion.div>
  );
};

// ── Today View ────────────────────────────────────────────────────────
const TodayView: React.FC<{
  todayClips: VideoMomentDay;
  streak: number;
  longestStreak: number;
  totalClips: number;
  partnerName: string;
  onRecord: () => void;
  onReRecord: () => void;
}> = ({ todayClips, streak, longestStreak, totalClips, partnerName, onRecord, onReRecord }) => {
  const [playingVideo, setPlayingVideo] = useState<'user' | 'partner' | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const userThumbnail = useClipThumbnail(todayClips.userClip);
  const partnerThumbnail = useClipThumbnail(todayClips.partnerClip);

  const userRecorded = !!todayClips.userClip;
  const partnerRecorded = !!todayClips.partnerClip;
  const isUnlocked = userRecorded;

  const headline = todayClips.bothRecorded
    ? 'Today is fully captured'
    : userRecorded
      ? `Your clip is in. Waiting for ${partnerName}.`
      : partnerRecorded
        ? `${partnerName} already dropped a moment`
        : 'Record today\'s 10 seconds';

  const supportingCopy = todayClips.bothRecorded
    ? 'Both sides of the day are in the vault. Watch them now or let them feed next month\'s film.'
    : userRecorded
      ? 'Your partner will unlock this pair the moment they post theirs.'
      : partnerRecorded
        ? 'Record yours to unlock their clip and keep the ritual alive.'
        : 'A tiny ritual done consistently becomes the premium part of the story.';

  const handlePlay = async (whose: 'user' | 'partner') => {
    const clip = whose === 'user' ? todayClips.userClip : todayClips.partnerClip;
    if (!clip) return;

    const url = await VideoMomentsService.getVideoUrl(clip);
    if (url) {
      setVideoUrl(url);
      setPlayingVideo(whose);

      if (whose === 'partner' && !clip.watchedByPartner) {
        VideoMomentsService.markWatched(clip.id);
      }
    }
    feedback.tap();
  };

  return (
    <div className="flex flex-col flex-1 px-5 py-6">
      {/* Video Player Modal */}
      <AnimatePresence>
        {playingVideo && videoUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            onClick={() => { setPlayingVideo(null); setVideoUrl(null); }}
          >
            <video
              src={videoUrl}
              autoPlay
              playsInline
              controls
              className="max-w-full max-h-full"
              onEnded={() => { setPlayingVideo(null); setVideoUrl(null); }}
            />
            <button
              onClick={() => { setPlayingVideo(null); setVideoUrl(null); }}
              className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 rounded-full bg-white/20"
            >
              <X size={20} className="text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streak Badge */}
      {streak > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="self-center mb-6 px-4 py-2 rounded-full flex items-center gap-2"
          style={{ background: 'rgba(251, 191, 36, 0.15)' }}
        >
          <span className="text-xl">🔥</span>
          <span className="text-sm font-semibold text-amber-300">{streak} day streak!</span>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {!userRecorded ? (
          <>
            {/* Record prompt */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center mb-10"
            >
              <h2 className="text-2xl font-bold text-white mb-2">Record Today's Moment</h2>
              <p className="text-white/50">Capture 10 seconds of your day</p>
            </motion.div>

            {/* Record Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onRecord}
              className="w-28 h-28 rounded-full flex items-center justify-center shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                boxShadow: '0 0 60px rgba(168, 85, 247, 0.5)'
              }}
            >
              <Video size={40} className="text-white" strokeWidth={1.5} />
            </motion.button>
          </>
        ) : (
          <>
            {/* Already Recorded */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full space-y-4"
            >
              {/* Status */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-green-500/20">
                  <Check size={28} className="text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Today's clip recorded</h2>
                <p className="text-white/50 text-sm">
                  {partnerRecorded ? `Both of you captured today ✨` : `Waiting for ${partnerName}...`}
                </p>
              </div>

              {/* Your Clip Card */}
              <motion.div
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)' }}
              >
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handlePlay('user')}
                  className="w-14 h-14 rounded-xl flex items-center justify-center bg-purple-500/30"
                >
                  <Play size={22} className="text-purple-300 ml-1" fill="currentColor" />
                </motion.button>
                <div className="flex-1">
                  <p className="text-white font-medium">Your moment</p>
                  <p className="text-white/40 text-sm">{Math.ceil(todayClips.userClip!.durationMs / 1000)}s</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onReRecord}
                  className="px-3 py-2 rounded-lg bg-white/10"
                >
                  <RefreshCw size={16} className="text-white/60" />
                </motion.button>
              </motion.div>

              {/* Partner's Clip Card */}
              {partnerRecorded && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(236, 72, 153, 0.15)', border: '1px solid rgba(236, 72, 153, 0.3)' }}
                >
                  {isUnlocked ? (
                    <div className="p-4 flex items-center gap-4">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handlePlay('partner')}
                        className="w-14 h-14 rounded-xl flex items-center justify-center bg-pink-500/30"
                      >
                        <Play size={22} className="text-pink-300 ml-1" fill="currentColor" />
                      </motion.button>
                      <div className="flex-1">
                        <p className="text-white font-medium">{partnerName}'s moment</p>
                        <p className="text-white/40 text-sm">
                          {Math.ceil(todayClips.partnerClip!.durationMs / 1000)}s
                          {!todayClips.partnerClip!.watchedByPartner && (
                            <span className="ml-2 text-pink-400">• New</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 px-4 flex flex-col items-center">
                      <Lock size={24} className="text-white/30 mb-3" />
                      <p className="text-white/50 text-sm text-center">
                        Record your clip to unlock {partnerName}'s
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Calendar View ─────────────────────────────────────────────────────
const CalendarView: React.FC<{ partnerName: string }> = ({ partnerName }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<VideoMomentDay | null>(null);
  const [monthClips, setMonthClips] = useState<Map<string, VideoMomentDay>>(new Map());
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  useEffect(() => {
    VideoMomentsService.getClipsForMonth(year, month).then(setMonthClips);
  }, [year, month]);

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDayOfWeek = getDay(startOfMonth(currentDate));

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
    setSelectedDay(null);
  };

  const goToNextMonth = () => {
    const now = new Date();
    if (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
      setCurrentDate(new Date(year, month, 1));
      setSelectedDay(null);
    }
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayData = monthClips.get(dateStr);
    setSelectedDay(dayData || null);
    feedback.tap();
  };

  const handlePlayClip = async (clip: DailyVideoClip) => {
    const url = await VideoMomentsService.getVideoUrl(clip);
    if (url) {
      setPlayingVideo(url);
      feedback.tap();
    }
  };

  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} className="aspect-square" />);
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayData = monthClips.get(dateStr);
    const hasClips = !!dayData;
    const bothRecorded = dayData?.bothRecorded || false;
    const isToday = dateStr === todayStr;
    const isSelected = selectedDay?.date === dateStr;

    days.push(
      <motion.button
        key={day}
        whileTap={{ scale: 0.9 }}
        onClick={() => handleDayClick(day)}
        className="aspect-square rounded-xl flex items-center justify-center text-sm relative transition-colors"
        style={{
          background: isSelected
            ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)'
            : bothRecorded
              ? 'rgba(168, 85, 247, 0.4)'
              : hasClips
                ? 'rgba(168, 85, 247, 0.2)'
                : 'rgba(255,255,255,0.05)',
          color: hasClips || isSelected ? 'white' : 'rgba(255,255,255,0.4)',
          border: isToday ? '2px solid rgba(168, 85, 247, 0.7)' : 'none'
        }}
      >
        {day}
        {bothRecorded && !isSelected && (
          <div className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-green-400" />
        )}
      </motion.button>
    );
  }

  return (
    <div className="flex-1 px-4 py-4 flex flex-col">
      {/* Video Player Modal */}
      <AnimatePresence>
        {playingVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            onClick={() => setPlayingVideo(null)}
          >
            <video
              src={playingVideo}
              autoPlay
              playsInline
              controls
              onEnded={() => setPlayingVideo(null)}
              className="max-w-full max-h-full"
            />
            <button
              onClick={() => setPlayingVideo(null)}
              className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 rounded-full bg-white/20"
            >
              <X size={20} className="text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-5">
        <motion.button whileTap={{ scale: 0.9 }} onClick={goToPrevMonth} className="p-2">
          <ChevronLeft size={22} className="text-white/60" />
        </motion.button>
        <h3 className="text-base font-semibold text-white">
          {format(currentDate, 'MMMM yyyy')}
        </h3>
        <motion.button whileTap={{ scale: 0.9 }} onClick={goToNextMonth} className="p-2">
          <ChevronRight size={22} className="text-white/60" />
        </motion.button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-xs text-white/40 py-1.5">{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1.5 mb-5">
        {days}
      </div>

      {/* Selected Day Detail */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {selectedDay ? (
            <motion.div
              key={selectedDay.date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-white/60 text-sm mb-3">
                {format(new Date(selectedDay.date), 'EEEE, MMMM d')}
              </p>

              <div className="space-y-2">
                {selectedDay.userClip && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePlayClip(selectedDay.userClip!)}
                    className="w-full p-3 rounded-xl flex items-center gap-3 bg-purple-500/20"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500/30">
                      <Play size={16} className="text-purple-300 ml-0.5" fill="currentColor" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white/90 text-sm font-medium">Your clip</p>
                      <p className="text-white/40 text-xs">{Math.ceil(selectedDay.userClip.durationMs / 1000)}s</p>
                    </div>
                  </motion.button>
                )}

                {selectedDay.partnerClip && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePlayClip(selectedDay.partnerClip!)}
                    className="w-full p-3 rounded-xl flex items-center gap-3 bg-pink-500/20"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-pink-500/30">
                      <Play size={16} className="text-pink-300 ml-0.5" fill="currentColor" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white/90 text-sm font-medium">{partnerName}'s clip</p>
                      <p className="text-white/40 text-xs">{Math.ceil(selectedDay.partnerClip.durationMs / 1000)}s</p>
                    </div>
                  </motion.button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center h-32 text-white/30 text-sm"
            >
              Select a day to view clips
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ── Compilations View ─────────────────────────────────────────────────
const CompilationsView: React.FC = () => {
  const [months, setMonths] = useState<string[]>([]);
  const [compilations, setCompilations] = useState<MonthlyVideoCompilation[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  useEffect(() => {
    VideoMomentsService.getMonthsWithRecordings().then(setMonths);
    VideoMomentsService.getAllCompilations().then(setCompilations);
  }, []);

  const handleGenerate = async (month: string) => {
    setGenerating(month);
    setProgress(0);

    try {
      const result = await VideoCompilerService.compileMonthlyVideo(month, {
        onProgress: setProgress
      });

      const clips = await VideoMomentsService.getClipsForCompilation(month);

      await VideoMomentsService.saveCompilation(
        month,
        result.blob,
        result.thumbnail,
        result.duration,
        clips.length
      );

      setCompilations(await VideoMomentsService.getAllCompilations());
      toast.show('Compilation created!', 'success');
      feedback.celebrate();
    } catch (err) {
      console.error('Compilation failed:', err);
      toast.show('Failed to create compilation', 'error');
    } finally {
      setGenerating(null);
    }
  };

  const handlePlay = async (compilation: MonthlyVideoCompilation) => {
    const url = await VideoMomentsService.getCompilationVideoUrl(compilation);
    if (url) {
      setPlayingUrl(url);
      feedback.tap();
    }
  };

  const handleDownload = async (compilation: MonthlyVideoCompilation) => {
    const url = await VideoMomentsService.getCompilationVideoUrl(compilation);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `our-moments-${compilation.month}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      feedback.tap();
      toast.show('Download started', 'success');
    }
  };

  const getCompilationForMonth = (month: string) =>
    compilations.find(c => c.month === month);

  if (months.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 bg-white/5">
          <Film size={32} className="text-white/30" />
        </div>
        <h3 className="text-white font-semibold mb-2">No recordings yet</h3>
        <p className="text-white/40 text-sm text-center max-w-xs">
          Record daily clips to create monthly compilation videos
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-4">
      {/* Video Player Modal */}
      <AnimatePresence>
        {playingUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            onClick={() => setPlayingUrl(null)}
          >
            <video
              src={playingUrl}
              autoPlay
              playsInline
              controls
              className="max-w-full max-h-full"
            />
            <button
              onClick={() => setPlayingUrl(null)}
              className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 rounded-full bg-white/20"
            >
              <X size={20} className="text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {months.map(month => {
          const compilation = getCompilationForMonth(month);
          const [y, m] = month.split('-');
          const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'long' });
          const isGenerating = generating === month;

          return (
            <motion.div
              key={month}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 overflow-hidden"
              style={{
                background: compilation
                  ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)'
                  : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-semibold">{monthName} {y}</h4>
                  {compilation && (
                    <p className="text-white/40 text-xs mt-0.5">
                      {compilation.clipCount} clips • {Math.ceil(compilation.durationMs / 1000)}s
                    </p>
                  )}
                </div>

                {compilation ? (
                  <div className="flex gap-2">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handlePlay(compilation)}
                      className="p-2.5 rounded-xl bg-purple-500/30"
                    >
                      <Play size={16} className="text-purple-300" fill="currentColor" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDownload(compilation)}
                      className="p-2.5 rounded-xl bg-white/10"
                    >
                      <Download size={16} className="text-white/60" />
                    </motion.button>
                  </div>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleGenerate(month)}
                    disabled={isGenerating}
                    className="px-4 py-2 rounded-xl flex items-center gap-2 font-medium disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                  >
                    {isGenerating ? (
                      <>
                        <Sparkles size={14} className="text-white animate-pulse" />
                        <span className="text-white text-sm">{Math.round(progress * 100)}%</span>
                      </>
                    ) : (
                      <>
                        <Film size={14} className="text-white" />
                        <span className="text-white text-sm">Create</span>
                      </>
                    )}
                  </motion.button>
                )}
              </div>

              {isGenerating && (
                <div className="mt-3 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

const PremiumTodayView: React.FC<{
  todayClips: VideoMomentDay;
  streak: number;
  longestStreak: number;
  totalClips: number;
  partnerName: string;
  onRecord: () => void;
  onReRecord: () => void;
}> = ({ todayClips, streak, longestStreak, totalClips, partnerName, onRecord, onReRecord }) => {
  const [playingVideo, setPlayingVideo] = useState<'user' | 'partner' | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const userThumbnail = useClipThumbnail(todayClips.userClip);
  const partnerThumbnail = useClipThumbnail(todayClips.partnerClip);
  const userRecorded = !!todayClips.userClip;
  const partnerRecorded = !!todayClips.partnerClip;

  const headline = todayClips.bothRecorded
    ? 'Today is fully captured'
    : userRecorded
      ? `Your clip is in. Waiting for ${partnerName}.`
      : partnerRecorded
        ? `${partnerName} already posted`
        : 'Record today\'s 10 seconds';

  const supportingCopy = todayClips.bothRecorded
    ? 'Both sides of the day are ready to replay, and they will roll straight into the monthly film.'
    : userRecorded
      ? 'Your side is safe. The pair completes when your partner drops theirs.'
      : partnerRecorded
        ? 'Record yours to unlock their clip and keep the ritual alive.'
        : 'One honest clip per day is what makes this feel premium by the end of the month.';

  const handlePlay = async (whose: 'user' | 'partner') => {
    const clip = whose === 'user' ? todayClips.userClip : todayClips.partnerClip;
    if (!clip) return;
    const url = await VideoMomentsService.getVideoUrl(clip);
    if (url) {
      setVideoUrl(url);
      setPlayingVideo(whose);
      if (whose === 'partner' && !clip.watchedByPartner) {
        VideoMomentsService.markWatched(clip.id);
      }
    }
    feedback.tap();
  };

  return (
    <div className="flex flex-col flex-1 px-4 py-4">
      <AnimatePresence>
        {playingVideo && videoUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => { setPlayingVideo(null); setVideoUrl(null); }}>
            <video src={videoUrl} autoPlay playsInline controls className="max-w-full max-h-full" onEnded={() => { setPlayingVideo(null); setVideoUrl(null); }} />
            <button onClick={() => { setPlayingVideo(null); setVideoUrl(null); }} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 rounded-full bg-white/20">
              <X size={20} className="text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-[2rem] p-5" style={{ background: 'linear-gradient(145deg, rgba(30,21,29,0.92) 0%, rgba(73,41,46,0.88) 56%, rgba(127,78,66,0.82) 100%)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 18px 42px rgba(18,10,16,0.24)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
            <Crown size={12} />
            10 Seconds Daily
          </div>
          {streak > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-300/12 px-3 py-1 text-[11px] font-semibold text-amber-100">
              <Heart size={13} />
              {streak} day streak
            </div>
          )}
        </div>
        <h2 className="mt-4 font-serif text-[1.95rem] leading-[1.02] text-white">{headline}</h2>
        <p className="mt-3 text-[0.92rem] leading-relaxed text-white/68">{supportingCopy}</p>
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {[
            { label: 'Clips saved', value: totalClips.toString() },
            { label: 'Current streak', value: streak.toString() },
            { label: 'Best streak', value: longestStreak.toString() },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/8 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">{item.label}</p>
              <p className="mt-1 text-[1.05rem] font-medium text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-4">
        {!userRecorded ? (
          <>
            <div className="rounded-[2rem] p-6 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/46">Today\'s prompt</p>
              <h3 className="mt-3 font-serif text-[1.7rem] leading-[1.06] text-white">Capture one unfiltered slice of the day</h3>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-white/62">No montage. No editing. Just one real moment that future-you will be glad you kept.</p>
              <motion.button whileTap={{ scale: 0.95 }} onClick={onRecord} className="mt-6 inline-flex h-20 w-20 items-center justify-center rounded-full shadow-2xl" style={{ background: 'linear-gradient(135deg, #8b5c56 0%, #d59d73 100%)', boxShadow: '0 0 44px rgba(213,157,115,0.28)' }}>
                <Video size={30} className="text-white" strokeWidth={1.6} />
              </motion.button>
            </div>
            {partnerRecorded ? (
              <div className="overflow-hidden rounded-[1.75rem]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="relative h-40">
                  {partnerThumbnail ? <img src={partnerThumbnail} alt={`${partnerName}'s clip preview`} className="h-full w-full object-cover blur-[10px] scale-110" /> : <div className="h-full w-full bg-gradient-to-br from-rose-400/25 to-amber-300/10" />}
                  <div className="absolute inset-0 bg-black/35" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                    <Lock size={22} className="text-white/80" />
                    <p className="mt-3 text-sm font-medium text-white">{partnerName} already recorded today</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/68">Record your own 10 seconds to unlock their clip.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] bg-white/6 px-4 py-4 text-[0.88rem] leading-relaxed text-white/58">
                When both of you keep this ritual alive, the month starts feeling like a real film instead of a pile of clips.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="overflow-hidden rounded-[1.85rem]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="relative h-44">
                {userThumbnail ? <img src={userThumbnail} alt="Your daily clip" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-br from-amber-300/20 to-rose-300/10" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-4 p-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/52">Your clip</p>
                    <p className="mt-1 text-[1.1rem] font-medium text-white">{formatDurationLabel(todayClips.userClip!.durationMs)}</p>
                  </div>
                  <div className="flex gap-2">
                    <motion.button whileTap={{ scale: 0.92 }} onClick={() => handlePlay('user')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/18 backdrop-blur-sm"><Play size={18} className="ml-0.5 text-white" fill="currentColor" /></motion.button>
                    <motion.button whileTap={{ scale: 0.92 }} onClick={onReRecord} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12 backdrop-blur-sm"><RefreshCw size={17} className="text-white/78" /></motion.button>
                  </div>
                </div>
              </div>
            </div>

            {partnerRecorded ? (
              <div className="overflow-hidden rounded-[1.85rem]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="relative h-44">
                  {partnerThumbnail ? <img src={partnerThumbnail} alt={`${partnerName}'s clip`} className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-br from-rose-300/18 to-amber-200/10" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-4 p-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/52">{partnerName}'s clip</p>
                      <p className="mt-1 text-[1.1rem] font-medium text-white">{formatDurationLabel(todayClips.partnerClip!.durationMs)}{!todayClips.partnerClip!.watchedByPartner && <span className="ml-2 text-xs text-amber-200">New</span>}</p>
                    </div>
                    <motion.button whileTap={{ scale: 0.92 }} onClick={() => handlePlay('partner')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/18 backdrop-blur-sm"><Play size={18} className="ml-0.5 text-white" fill="currentColor" /></motion.button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] bg-white/6 px-4 py-4 text-[0.88rem] leading-relaxed text-white/58">
                Your side of the day is locked in. When {partnerName} adds theirs, both clips will roll straight into the same monthly film.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const DayDetailCard: React.FC<{ day: VideoMomentDay | null; partnerName: string; onPlay: (clip: DailyVideoClip) => void }> = ({ day, partnerName, onPlay }) => {
  const userThumbnail = useClipThumbnail(day?.userClip);
  const partnerThumbnail = useClipThumbnail(day?.partnerClip);

  if (!day) {
    return <div className="rounded-[1.5rem] bg-white/6 px-4 py-5 text-[0.88rem] leading-relaxed text-white/58">Tap any recorded day to inspect the clips saved there.</div>;
  }

  return (
    <div className="rounded-[1.7rem] p-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="text-[0.82rem] text-white/56">{format(new Date(day.date), 'EEEE, MMMM d')}</p>
      <div className="mt-4 space-y-3">
        {[day.userClip && { title: 'Your clip', clip: day.userClip, thumb: userThumbnail }, day.partnerClip && { title: `${partnerName}'s clip`, clip: day.partnerClip, thumb: partnerThumbnail }].filter(Boolean).map((item) => {
          const safeItem = item as { title: string; clip: DailyVideoClip; thumb: string | null };
          return (
            <button key={safeItem.clip.id} onClick={() => onPlay(safeItem.clip)} className="flex w-full items-center gap-3 overflow-hidden rounded-[1.35rem] bg-white/6 p-3 text-left">
              <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/8">
                {safeItem.thumb ? <img src={safeItem.thumb} alt={safeItem.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Play size={16} className="text-white/58" /></div>}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{safeItem.title}</p>
                <p className="mt-1 text-xs text-white/52">{formatDurationLabel(safeItem.clip.durationMs)}</p>
              </div>
              <Play size={16} className="text-white/64" fill="currentColor" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

const CalendarExperience: React.FC<{ partnerName: string }> = ({ partnerName }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<VideoMomentDay | null>(null);
  const [monthClips, setMonthClips] = useState<Map<string, VideoMomentDay>>(new Map());
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const loadMonth = useCallback(async () => {
    setMonthClips(await VideoMomentsService.getClipsForMonth(year, month));
  }, [month, year]);

  useEffect(() => {
    loadMonth();
    const handleUpdate = () => loadMonth();
    videoMomentsEventTarget.addEventListener('video-moments-update', handleUpdate);
    return () => videoMomentsEventTarget.removeEventListener('video-moments-update', handleUpdate);
  }, [loadMonth]);

  const dayEntries = [...monthClips.values()];
  const summary = summarizeMonth(`${year}-${String(month).padStart(2, '0')}`, dayEntries.flatMap((day) => [day.userClip, day.partnerClip].filter(Boolean) as DailyVideoClip[]));
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDayOfWeek = getDay(startOfMonth(currentDate));

  const handlePlayClip = async (clip: DailyVideoClip) => {
    const url = await VideoMomentsService.getVideoUrl(clip);
    if (url) setPlayingVideo(url);
  };

  const days = [];
  for (let i = 0; i < firstDayOfWeek; i += 1) days.push(<div key={`empty-${i}`} className="aspect-square" />);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayData = monthClips.get(dateStr);
    const bothRecorded = dayData?.bothRecorded || false;
    const hasClips = !!dayData;
    days.push(
      <button key={dateStr} onClick={() => setSelectedDay(dayData || null)} className="aspect-square rounded-xl text-sm transition-colors" style={{ background: bothRecorded ? 'rgba(213,157,115,0.45)' : hasClips ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)', color: hasClips ? '#fff' : 'rgba(255,255,255,0.4)' }}>
        {day}
      </button>
    );
  }

  return (
    <div className="flex-1 px-4 py-4 space-y-4">
      <AnimatePresence>{playingVideo && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setPlayingVideo(null)}><video src={playingVideo} autoPlay playsInline controls className="max-w-full max-h-full" /><button onClick={() => setPlayingVideo(null)} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 rounded-full bg-white/20"><X size={20} className="text-white" /></button></motion.div>}</AnimatePresence>

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Days captured', value: summary.daysCaptured },
          { label: 'Duet days', value: summary.duetDays },
          { label: 'Coverage', value: `${summary.coverage}%` },
        ].map((item) => <div key={item.label} className="rounded-2xl bg-white/6 px-3 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">{item.label}</p><p className="mt-1 text-[1.05rem] font-medium text-white">{item.value}</p></div>)}
      </div>

      <div className="rounded-[1.8rem] p-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => { setCurrentDate(new Date(year, month - 2, 1)); setSelectedDay(null); }} className="p-2"><ChevronLeft size={20} className="text-white/66" /></button>
          <h3 className="text-base font-semibold text-white">{format(currentDate, 'MMMM yyyy')}</h3>
          <button onClick={() => { const now = new Date(); if (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) { setCurrentDate(new Date(year, month, 1)); setSelectedDay(null); } }} className="p-2"><ChevronRight size={20} className="text-white/66" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 mb-2">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => <div key={d} className="text-center text-xs text-white/40 py-1.5">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1.5">{days}</div>
      </div>

      <DayDetailCard day={selectedDay} partnerName={partnerName} onPlay={handlePlayClip} />
    </div>
  );
};

const FilmCard: React.FC<{
  month: string;
  compilation: MonthlyVideoCompilation | null;
  summary: MonthSummary | null;
  generating: boolean;
  progress: number;
  onGenerate: () => void;
  onPlay: () => void;
  onDownload: () => void;
}> = ({ month, compilation, summary, generating, progress, onGenerate, onPlay, onDownload }) => {
  const thumbnail = useCompilationThumbnail(compilation);
  const [year, monthNumber] = month.split('-');
  const monthTitle = new Date(Number(year), Number(monthNumber) - 1, 1).toLocaleString('default', { month: 'long' });

  return (
    <div className="overflow-hidden rounded-[1.8rem]" style={{ background: compilation ? 'linear-gradient(145deg, rgba(32,24,31,0.94) 0%, rgba(89,53,49,0.88) 100%)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="relative h-36">
        {thumbnail ? <img src={thumbnail} alt={`${monthTitle} compilation`} className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-br from-amber-300/18 to-rose-300/10" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/46">{monthTitle} {year}</p>
          <p className="mt-1 text-[1.12rem] font-medium text-white">{summary ? `${summary.daysCaptured} days captured` : 'Monthly film'}</p>
          <p className="text-xs text-white/58">{summary ? `${summary.totalClips} clips, ${summary.duetDays} duet days, ${summary.coverage}% coverage` : 'Ready when the archive has enough moments.'}</p>
        </div>
      </div>
      <div className="p-4">
        {compilation ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/62">{formatDurationLabel(compilation.durationMs)}</p>
            <div className="flex gap-2">
              <button onClick={onPlay} className="rounded-full bg-white/12 p-2.5"><Play size={16} className="text-white" fill="currentColor" /></button>
              <button onClick={onDownload} className="rounded-full bg-white/12 p-2.5"><Download size={16} className="text-white/78" /></button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={onGenerate} disabled={generating} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #8b5c56 0%, #d59d73 100%)' }}>
              <Film size={14} />
              {generating ? `${Math.round(progress * 100)}%` : 'Create film'}
            </button>
            {generating && <div className="mt-3 h-1.5 w-full rounded-full bg-white/10 overflow-hidden"><motion.div className="h-full bg-gradient-to-r from-amber-300 to-rose-300" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.2 }} /></div>}
          </div>
        )}
      </div>
    </div>
  );
};

const FilmsExperience: React.FC = () => {
  const [months, setMonths] = useState<string[]>([]);
  const [compilations, setCompilations] = useState<MonthlyVideoCompilation[]>([]);
  const [summaries, setSummaries] = useState<Record<string, MonthSummary>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const loadFilms = useCallback(async () => {
    const monthKeys = await VideoMomentsService.getMonthsWithRecordings();
    const allCompilations = await VideoMomentsService.getAllCompilations();
    const monthEntries = await Promise.all(monthKeys.map(async (month) => {
      const clips = await VideoMomentsService.getClipsForCompilation(month);
      return [month, summarizeMonth(month, clips)] as const;
    }));
    setMonths(monthKeys);
    setCompilations(allCompilations);
    setSummaries(Object.fromEntries(monthEntries));
  }, []);

  useEffect(() => {
    loadFilms();
    const handleUpdate = () => loadFilms();
    videoMomentsEventTarget.addEventListener('video-moments-update', handleUpdate);
    return () => videoMomentsEventTarget.removeEventListener('video-moments-update', handleUpdate);
  }, [loadFilms]);

  const handleGenerate = async (month: string) => {
    setGenerating(month);
    setProgress(0);
    try {
      const result = await VideoCompilerService.compileMonthlyVideo(month, { onProgress: setProgress });
      const clips = await VideoMomentsService.getClipsForCompilation(month);
      await VideoMomentsService.saveCompilation(month, result.blob, result.thumbnail, result.duration, clips.length);
      await loadFilms();
      feedback.celebrate();
    } catch (err) {
      console.error('Compilation failed:', err);
      toast.show('Failed to create compilation', 'error');
    } finally {
      setGenerating(null);
    }
  };

  const handlePlay = async (compilation: MonthlyVideoCompilation) => {
    const url = await VideoMomentsService.getCompilationVideoUrl(compilation);
    if (url) setPlayingUrl(url);
  };

  const handleDownload = async (compilation: MonthlyVideoCompilation) => {
    const url = await VideoMomentsService.getCompilationVideoUrl(compilation);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `lior-10-seconds-daily-${compilation.month}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.show('Download started', 'success');
  };

  if (months.length === 0) {
    return <div className="flex-1 flex flex-col items-center justify-center px-6"><div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 bg-white/5"><Film size={32} className="text-white/30" /></div><h3 className="text-white font-semibold mb-2">No monthly films yet</h3><p className="text-white/40 text-sm text-center max-w-xs">Start recording daily clips and this section turns into your premium archive.</p></div>;
  }

  return (
    <div className="flex-1 px-4 py-4 space-y-4">
      <AnimatePresence>{playingUrl && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setPlayingUrl(null)}><video src={playingUrl} autoPlay playsInline controls className="max-w-full max-h-full" /><button onClick={() => setPlayingUrl(null)} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 rounded-full bg-white/20"><X size={20} className="text-white" /></button></motion.div>}</AnimatePresence>
      <div className="rounded-[1.7rem] bg-white/6 px-4 py-4 text-[0.9rem] leading-relaxed text-white/64">Each monthly film now reads like a highlight reel instead of dumping full raw clips end to end.</div>
      <div className="space-y-3">
        {months.map((month) => {
          const compilation = compilations.find((item) => item.month === month) || null;
          return (
            <FilmCard
              key={month}
              month={month}
              compilation={compilation}
              summary={summaries[month] || null}
              generating={generating === month}
              progress={progress}
              onGenerate={() => handleGenerate(month)}
              onPlay={() => compilation && handlePlay(compilation)}
              onDownload={() => compilation && handleDownload(compilation)}
            />
          );
        })}
      </div>
    </div>
  );
};

// ── Main View ─────────────────────────────────────────────────────────
export const DailyVideoView: React.FC<DailyVideoViewProps> = ({ setView }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [todayClips, setTodayClips] = useState<VideoMomentDay>({ date: '', bothRecorded: false });
  const [showRecorder, setShowRecorder] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [streak, setStreak] = useState(0);

  const partnerName = useMemo(() => {
    try {
      const profile = StorageService.getCoupleProfile();
      return profile.partnerName || 'Partner';
    } catch {
      return 'Partner';
    }
  }, []);

  const loadData = useCallback(async () => {
    const clips = await VideoMomentsService.getTodayClips();
    setTodayClips(clips);
    const currentStreak = await VideoMomentsService.getCurrentStreak();
    setStreak(currentStreak);
  }, []);

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    videoMomentsEventTarget.addEventListener('video-moments-update', handleUpdate);
    return () => videoMomentsEventTarget.removeEventListener('video-moments-update', handleUpdate);
  }, [loadData]);

  const handleRecordComplete = async (blob: Blob, duration: number, thumbnail: string) => {
    setShowRecorder(false);

    await VideoMomentsService.recordClip(blob, duration, thumbnail);

    setShowSuccess(true);
    feedback.celebrate();
  };

  const handleSuccessComplete = () => {
    setShowSuccess(false);
    loadData();
  };

  const isUnlocked = !!todayClips.userClip;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full min-h-screen"
        style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setView('home')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10"
          >
            <ArrowLeft size={18} className="text-white" />
          </motion.button>
          <h1 className="text-lg font-semibold text-white">Daily Video</h1>
          <div className="w-10" />
        </div>

        {/* Tab Navigation */}
        <div className="flex px-4 py-2 gap-2">
          {[
            { id: 'today' as const, label: 'Today', icon: Video },
            { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
            { id: 'compilations' as const, label: 'Films', icon: Film },
          ].map(tab => (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode(tab.id)}
              className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all"
              style={{
                background: viewMode === tab.id
                  ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.4) 0%, rgba(236, 72, 153, 0.4) 100%)'
                  : 'rgba(255,255,255,0.05)',
                color: viewMode === tab.id ? 'white' : 'rgba(255,255,255,0.5)'
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {viewMode === 'today' && (
              <motion.div
                key="today"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex-1 flex flex-col"
              >
                <TodayView
                  todayClips={todayClips}
                  isUnlocked={isUnlocked}
                  streak={streak}
                  partnerName={partnerName}
                  onRecord={() => setShowRecorder(true)}
                  onReRecord={() => setShowRecorder(true)}
                />
              </motion.div>
            )}

            {viewMode === 'calendar' && (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col overflow-auto"
              >
                <CalendarView partnerName={partnerName} />
              </motion.div>
            )}

            {viewMode === 'compilations' && (
              <motion.div
                key="compilations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col overflow-auto"
              >
                <CompilationsView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Camera Recorder Overlay */}
      <AnimatePresence>
        {showRecorder && (
          <CameraRecorder
            onComplete={handleRecordComplete}
            onCancel={() => setShowRecorder(false)}
          />
        )}
      </AnimatePresence>

      {/* Success Animation */}
      <AnimatePresence>
        {showSuccess && (
          <SuccessAnimation onComplete={handleSuccessComplete} />
        )}
      </AnimatePresence>
    </>
  );
};

export default DailyVideoView;

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNativeShell } from '../hooks/useNativeShell';
import { motion, AnimatePresence, animate, useMotionValue, useReducedMotion, type PanInfo } from 'framer-motion';
import { Mic, MicOff, Square, Play, Pause, Trash2, X } from 'lucide-react';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_SOFT_SPRING,
    GOLD_PRESS_SPRING,
    goldRise,
    goldStagger,
    GoldCTA,
    GoldSectionHeader,
} from '../components/premium/GoldKit';
import { PremiumModal } from '../components/PremiumModal';
import type { ViewState, VoiceNote } from '../types';
import { StorageService } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { listRemoveExit } from '../utils/motion';

interface VoiceNotesViewProps {
    setView: (view: ViewState) => void;
}

const ACCENT = '#f43f5e';
const FREE_VOICE_NOTE_LIMIT = 5;
const WAVEFORM_BARS = 40;
const CARD_BARS = 26;

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Deterministic decorative waveform derived from a note id (purely visual). */
function seededBars(seed: string, count: number): number[] {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Array.from({ length: count }, () => {
        h ^= h << 13;
        h ^= h >>> 17;
        h ^= h << 5;
        return 0.18 + (((h >>> 0) % 1000) / 1000) * 0.82;
    });
}

// ── Static jewel waveform with a gold progress sweep ───────────────────────

const JewelWaveform: React.FC<{
    bars: number[];
    progress: number;
    height?: number;
    className?: string;
}> = ({ bars, progress, height = 30, className }) => {
    const clamped = Math.min(1, Math.max(0, progress));
    return (
        <div className={`relative ${className ?? 'w-full'}`} style={{ height }}>
            <div className="absolute inset-0 flex items-center gap-[2px]">
                {bars.map((v, i) => (
                    <div
                        key={i}
                        className="flex-1 rounded-full"
                        style={{ height: `${Math.max(14, v * 100)}%`, background: 'rgba(255,246,230,0.14)' }}
                    />
                ))}
            </div>
            <div
                className="absolute inset-0 flex items-center gap-[2px]"
                style={{ clipPath: `inset(0 ${(1 - clamped) * 100}% 0 0)` }}
            >
                {bars.map((v, i) => (
                    <div
                        key={i}
                        className="flex-1 rounded-full"
                        style={{
                            height: `${Math.max(14, v * 100)}%`,
                            background: 'linear-gradient(180deg, #f6c768 0%, #d99c3e 100%)',
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

// ── Breathing record orb ───────────────────────────────────────────────────

const RecordOrb: React.FC<{ onTap: () => void }> = ({ onTap }) => (
    <motion.button
        whileTap={{ scale: 0.94 }}
        transition={GOLD_PRESS_SPRING}
        onClick={onTap}
        aria-label="Record a voice note"
        className="relative"
    >
        {/* Soft halo */}
        <div
            className="absolute -inset-7 rounded-full blur-2xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(244,63,94,0.26) 0%, rgba(246,199,104,0.16) 45%, transparent 70%)' }}
        />
        <div className="lp-emblem">
            <div className="lp-orbit"><span className="lp-orbit__spark" /></div>
            <div className="lp-orbit lp-orbit--reverse"><span className="lp-orbit__spark" /></div>
            {/* Static glow rings */}
            <div className="absolute -inset-[18px] rounded-full pointer-events-none" style={{ border: '1px solid rgba(246,199,104,0.16)' }} />
            <div className="absolute -inset-[34px] rounded-full pointer-events-none" style={{ border: '1px solid rgba(244,63,94,0.1)' }} />
            <div
                className="relative flex items-center justify-center rounded-full w-[104px] h-[104px]"
                style={{
                    background: 'radial-gradient(circle at 33% 26%, #fdeec9 0%, #f6c768 32%, #ef7060 66%, #b91c3c 100%)',
                    border: '1px solid rgba(253,238,201,0.55)',
                    boxShadow:
                        '0 22px 60px rgba(244,63,94,0.35), 0 10px 30px rgba(246,199,104,0.22), inset 0 2px 6px rgba(255,248,231,0.55), inset 0 -14px 28px rgba(110,12,34,0.45)',
                }}
            >
                <Mic size={34} strokeWidth={1.9} style={{ color: '#3b0714' }} />
            </div>
        </div>
    </motion.button>
);

// ── Jewel playback card ────────────────────────────────────────────────────

const VoiceNoteCard: React.FC<{
    note: VoiceNote;
    onDelete: (id: string) => void;
    index: number;
}> = ({ note, onDelete, index }) => {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const bars = useMemo(() => seededBars(note.id, CARD_BARS), [note.id]);

    useEffect(() => {
        let active = true;
        StorageService.getVoiceNoteAudio(note).then(url => {
            if (active && url) setAudioUrl(url);
        });
        return () => { active = false; };
    }, [note]);

    const togglePlay = () => {
        if (!audioUrl) return;
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrl);
            audioRef.current.ontimeupdate = () => {
                if (!audioRef.current) return;
                const p = audioRef.current.currentTime / (audioRef.current.duration || 1);
                setProgress(p);
                setCurrentTime(audioRef.current.currentTime);
            };
            audioRef.current.onended = () => {
                setIsPlaying(false);
                setProgress(0);
                setCurrentTime(0);
            };
        }
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().catch(() => {});
            setIsPlaying(true);
            feedback.tap();
        }
    };

    useEffect(() => {
        return () => { audioRef.current?.pause(); };
    }, []);

    const dateLabel = new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={listRemoveExit}
            transition={{ delay: index * 0.04, type: 'spring', stiffness: 500, damping: 32 }}
            className="relative"
        >
            <div
                className="relative overflow-hidden rounded-[1.4rem] p-4"
                style={{
                    background: GOLD.cardBg,
                    border: isPlaying ? `1px solid ${ACCENT}55` : GOLD.cardBorder,
                    boxShadow: isPlaying ? '0 14px 40px rgba(244,63,94,0.14)' : 'none',
                    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                }}
            >
                {isPlaying && (
                    <div
                        className="absolute -top-10 -right-10 w-36 h-36 rounded-full blur-3xl pointer-events-none"
                        style={{ background: 'radial-gradient(circle, rgba(244,63,94,0.16) 0%, transparent 70%)' }}
                    />
                )}

                <div className="relative z-10 flex items-center gap-3.5">
                    {/* Play / pause */}
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        transition={GOLD_PRESS_SPRING}
                        onClick={togglePlay}
                        disabled={!audioUrl}
                        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
                        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-30"
                        style={{
                            background: isPlaying
                                ? `linear-gradient(135deg, #f6c768 0%, ${ACCENT} 100%)`
                                : 'rgba(255,255,255,0.07)',
                            border: isPlaying ? '1px solid rgba(246,199,104,0.5)' : '1px solid rgba(255,255,255,0.12)',
                            boxShadow: isPlaying ? '0 8px 24px rgba(244,63,94,0.3)' : 'none',
                            transition: 'background 0.3s ease, box-shadow 0.3s ease',
                        }}
                    >
                        {isPlaying
                            ? <Pause size={15} fill={GOLD.inkOnGold} style={{ color: GOLD.inkOnGold }} />
                            : <Play size={15} fill="#f3cd86" style={{ color: '#f3cd86', marginLeft: 2 }} />
                        }
                    </motion.button>

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                        <p className="font-serif text-[15px] leading-tight truncate" style={{ color: GOLD.textHigh, letterSpacing: '-0.01em' }}>
                            {note.title || `Untitled — ${dateLabel}`}
                        </p>
                        <p className="mt-1 text-[10.5px]" style={{ color: GOLD.textLow }}>
                            {timeAgo(note.createdAt)}
                        </p>
                    </div>

                    {/* Delete */}
                    <motion.button
                        whileTap={{ scale: 0.82 }}
                        transition={GOLD_PRESS_SPRING}
                        onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                        aria-label="Delete voice note"
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)' }}
                    >
                        <Trash2 size={13} style={{ color: 'rgba(253,164,175,0.85)' }} />
                    </motion.button>
                </div>

                {/* Mini waveform + duration chip */}
                <div className="relative z-10 mt-3 flex items-center gap-3">
                    <JewelWaveform bars={bars} progress={progress} height={30} className="flex-1 min-w-0" />
                    <span
                        className="px-2 py-[3px] rounded-full text-[10px] font-semibold tabular-nums shrink-0"
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.09)',
                            color: isPlaying ? '#f3cd86' : GOLD.textMid,
                        }}
                    >
                        {isPlaying ? formatDuration(currentTime) : formatDuration(note.duration)}
                    </span>
                </div>
            </div>
        </motion.div>
    );
};

// ── Review playback preview (pendingAudio) ─────────────────────────────────

const PendingPreview: React.FC<{ dataUri: string; duration: number }> = ({ dataUri, duration }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const bars = useMemo(() => seededBars(`pending-${duration}-${dataUri.length}`, 30), [dataUri, duration]);

    const togglePlay = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio(dataUri);
            audioRef.current.ontimeupdate = () => {
                if (!audioRef.current) return;
                const total = Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
                    ? audioRef.current.duration
                    : duration || 1;
                setProgress(audioRef.current.currentTime / total);
            };
            audioRef.current.onended = () => {
                setIsPlaying(false);
                setProgress(0);
            };
        }
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().catch(() => {});
            setIsPlaying(true);
            feedback.tap();
        }
    };

    useEffect(() => {
        return () => { audioRef.current?.pause(); };
    }, []);

    return (
        <div
            className="flex items-center gap-3.5 px-4 py-4 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
            <motion.button
                whileTap={{ scale: 0.9 }}
                transition={GOLD_PRESS_SPRING}
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                style={{
                    background: isPlaying
                        ? `linear-gradient(135deg, #f6c768 0%, ${ACCENT} 100%)`
                        : 'rgba(255,255,255,0.07)',
                    border: isPlaying ? '1px solid rgba(246,199,104,0.5)' : '1px solid rgba(255,255,255,0.12)',
                    boxShadow: isPlaying ? '0 8px 24px rgba(244,63,94,0.3)' : 'none',
                    transition: 'background 0.3s ease, box-shadow 0.3s ease',
                }}
            >
                {isPlaying
                    ? <Pause size={15} fill={GOLD.inkOnGold} style={{ color: GOLD.inkOnGold }} />
                    : <Play size={15} fill="#f3cd86" style={{ color: '#f3cd86', marginLeft: 2 }} />
                }
            </motion.button>
            <JewelWaveform bars={bars} progress={progress} height={34} className="flex-1 min-w-0" />
            <span
                className="px-2 py-[3px] rounded-full text-[10px] font-semibold tabular-nums shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: GOLD.textMid }}
            >
                {formatDuration(duration)}
            </span>
        </div>
    );
};

// ── Main view ──────────────────────────────────────────────────────────────

export const VoiceNotesView: React.FC<VoiceNotesViewProps> = ({ setView }) => {
    // Keyboard lift for the review sheet's autoFocus title input (fixed
    // items-end portal; overlay keyboard mode does not resize the WebView).
    const { keyboardOpen, keyboardHeight } = useNativeShell();
    const [notes, setNotes] = useState<VoiceNote[]>(() => StorageService.getVoiceNotes());
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingDurationRef = useRef(0);
    const [pendingAudio, setPendingAudio] = useState<{ dataUri: string; duration: number } | null>(null);
    const [title, setTitle] = useState('');
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [waveformData, setWaveformData] = useState<number[]>(new Array(WAVEFORM_BARS).fill(0));
    const [hasPermission, setHasPermission] = useState(true);
    const reducedMotion = useReducedMotion();

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const animFrameRef = useRef<number | null>(null);

    useEffect(() => {
        setNotes(StorageService.getVoiceNotes());
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            try { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); } catch {}
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            audioCtxRef.current?.close();
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
        const profile = StorageService.getCoupleProfile();
        if (!profile.isPremium && notes.length >= FREE_VOICE_NOTE_LIMIT) {
            setShowPremiumModal(true);
            return;
        }

        let stream: MediaStream | undefined;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            setHasPermission(true);

            audioCtxRef.current = new AudioContext();
            const source = audioCtxRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioCtxRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);
            drawWaveform();

            const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : '';
            const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            const recordedStream = stream;
            chunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
                const reader = new FileReader();
                reader.onload = ev => {
                    setPendingAudio({ dataUri: ev.target?.result as string, duration: recordingDurationRef.current });
                };
                reader.readAsDataURL(blob);
                recordedStream.getTracks().forEach(t => t.stop());
                if (streamRef.current === recordedStream) streamRef.current = null;
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
        } catch (err) {
            // Release any mic/audio resources acquired before the failure so the mic isn't held.
            stream?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            try { audioCtxRef.current?.close(); } catch {}
            const name = (err as DOMException)?.name;
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                setHasPermission(false);
                toast.show('Microphone access denied', 'error');
            } else {
                toast.show('Could not start recording', 'error');
            }
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
    };

    const handleSave = async () => {
        if (!pendingAudio) return;
        setIsSaving(true);

        const id = generateId();
        const audioId = `vn_${id}`;

        const newNote: VoiceNote = {
            id,
            title: title.trim() || `Voice Note ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            audioId,
            duration: pendingAudio.duration,
            createdAt: new Date().toISOString(),
            senderId: StorageService.getDeviceId(),
        };

        try {
            const audioResult = await StorageService.saveVoiceNoteAudio(id, pendingAudio.dataUri, { createdAt: newNote.createdAt });
            newNote.audioBytes = audioResult.byteSize;
            newNote.audioMimeType = audioResult.mimeType;
            if (audioResult.storagePath) newNote.audioStoragePath = audioResult.storagePath;

            await StorageService.saveVoiceNote(newNote);
            setNotes(StorageService.getVoiceNotes());

            setPendingAudio(null);
            setTitle('');
            feedback.celebrate();
            toast.show('Voice note saved!', 'success');
        } catch (error: any) {
            toast.show(error?.message || 'Voice note could not be saved.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        setPendingAudio(null);
        setTitle('');
    };

    const handleDelete = async (id: string) => {
        await StorageService.deleteVoiceNote(id);
        setNotes(prev => prev.filter(n => n.id !== id));
        feedback.tap();
    };

    const profile = StorageService.getCoupleProfile();
    const canRecord = profile.isPremium || notes.length < FREE_VOICE_NOTE_LIMIT;

    const handleOrbTap = () => {
        if (canRecord) {
            startRecording();
        } else {
            feedback.tap();
            setShowPremiumModal(true);
        }
    };

    // Hardware back while recording → stop (recording flows into review).
    useEffect(() => {
        if (!isRecording) return;
        const handleBack = (e: Event) => { e.preventDefault(); stopRecording(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRecording]);

    // Hardware back on the review sheet → discard (close).
    useEffect(() => {
        if (!pendingAudio || isRecording) return;
        const handleBack = (e: Event) => { e.preventDefault(); handleDiscard(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingAudio, isRecording]);

    // Pan-based pull-to-dismiss for the review sheet (PremiumModal pattern —
    // drag + exit on the same node breaks AnimatePresence unmounting).
    const sheetY = useMotionValue(0);

    useEffect(() => {
        if (!pendingAudio) sheetY.set(0);
    }, [pendingAudio, sheetY]);

    const handleSheetPan = (_: unknown, info: PanInfo) => {
        sheetY.set(info.offset.y > 0 ? info.offset.y : info.offset.y * 0.06);
    };

    const handleSheetPanEnd = (_: unknown, info: PanInfo) => {
        if (info.offset.y > 130 || info.velocity.y > 700) {
            feedback.tap();
            handleDiscard();
        } else {
            animate(sheetY, 0, { type: 'spring', stiffness: 420, damping: 34 });
        }
    };

    return (
        <>
            <GoldShell eyebrow="Voice Notes" accent={ACCENT}>
                <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                    {/* ── Record orb ────────────────────────────────── */}
                    <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-12 pb-2">
                        <RecordOrb onTap={handleOrbTap} />
                        <p className="mt-12 text-[12px]" style={{ color: GOLD.textLow }}>
                            {!hasPermission ? 'Microphone access needed' : 'Tap the orb to record'}
                        </p>
                        {!profile.isPremium && (
                            <span
                                className="mt-2.5 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tabular-nums tracking-[0.08em]"
                                style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', color: '#fda4af' }}
                            >
                                {notes.length}/{FREE_VOICE_NOTE_LIMIT} free
                            </span>
                        )}
                        {!hasPermission && (
                            <div className="mt-3 flex items-center justify-center gap-2">
                                <MicOff size={13} style={{ color: ACCENT }} />
                                <span className="text-[11px] font-medium" style={{ color: '#fda4af' }}>
                                    Grant microphone access in settings
                                </span>
                            </div>
                        )}
                    </motion.div>

                    {/* ── Empty state ───────────────────────────────── */}
                    {notes.length === 0 && (
                        <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-6 pb-4">
                            <h2 className="font-serif text-[1.5rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                Your voices, kept forever.
                            </h2>
                            <p className="mt-2.5 max-w-[30ch] text-[12.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                                A goodnight, a giggle, the way you say each other's names — record the everyday before it slips away.
                            </p>
                        </motion.div>
                    )}

                    {/* ── Kept moments ──────────────────────────────── */}
                    {notes.length > 0 && (
                        <>
                            <motion.div variants={goldRise}>
                                <GoldSectionHeader label="Kept moments" className="mt-9 mb-4" />
                            </motion.div>
                            <div className="flex flex-col gap-3">
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {notes.map((note, i) => (
                                        <VoiceNoteCard key={note.id} note={note} onDelete={handleDelete} index={i} />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </>
                    )}
                </motion.div>
            </GoldShell>

            {/* ══ Recording overlay — full dark stage ═══════════════════
                 Portal OUTSIDE AnimatePresence: React 19 portals are not
                 valid elements, AnimatePresence would drop a portal child. */}
            {ReactDOM.createPortal(
                <AnimatePresence>
                    {isRecording && (
                        <motion.div
                            key="recording-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.2 } }}
                            className="lp-stage z-[200] flex flex-col items-center justify-center overflow-hidden"
                            style={{ position: 'fixed', inset: 0 }}
                        >
                            <div className="lp-aurora">
                                <div className="lp-aurora__blob lp-aurora__blob--gold" />
                                <div
                                    className="lp-aurora__blob lp-aurora__blob--rose"
                                    style={{ background: 'radial-gradient(circle, rgba(244,63,94,0.34) 0%, transparent 65%)' }}
                                />
                            </div>
                            <div className="lp-grain" />

                            {/* Ambient pulse rings */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                {[0, 1, 2].map(ring => (
                                    <motion.div
                                        key={ring}
                                        className="absolute rounded-full"
                                        style={{
                                            width: 220 + ring * 110,
                                            height: 220 + ring * 110,
                                            border: `1px solid rgba(246,199,104,${0.13 - ring * 0.035})`,
                                        }}
                                        animate={reducedMotion ? undefined : { scale: [1, 1.15, 1], opacity: [0.4, 0.15, 0.4] }}
                                        transition={{ duration: 3 + ring * 0.5, repeat: Infinity, delay: ring * 0.6, ease: 'easeInOut' }}
                                    />
                                ))}
                            </div>

                            <div className="relative z-10 flex flex-col items-center w-full px-6">
                                {/* Status chip */}
                                <motion.div
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.08 }}
                                    className="flex items-center gap-2 mb-3"
                                >
                                    <motion.span
                                        animate={reducedMotion ? undefined : { scale: [1, 1.4, 1] }}
                                        transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                                        className="w-2 h-2 rounded-full"
                                        style={{ background: ACCENT, boxShadow: '0 0 12px rgba(244,63,94,0.7)' }}
                                    />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                                        Recording
                                    </span>
                                </motion.div>

                                {/* Elapsed time */}
                                <motion.span
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.12 }}
                                    className="font-serif text-[3.4rem] leading-none tabular-nums"
                                    style={{ color: 'rgba(255,250,242,0.96)', letterSpacing: '-0.02em' }}
                                >
                                    {formatDuration(recordingDuration)}
                                </motion.span>

                                {/* Live waveform — gold bars rising from a center line */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="relative w-[86%] max-w-[330px] h-20 mt-9 mb-12"
                                >
                                    <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: 'rgba(246,199,104,0.18)' }} />
                                    <div className="absolute inset-0 flex items-center gap-[3px]">
                                        {waveformData.map((v, i) => (
                                            <motion.div
                                                key={i}
                                                className="flex-1 h-full rounded-full"
                                                style={{
                                                    transformOrigin: 'center',
                                                    background: 'linear-gradient(180deg, rgba(253,238,201,0.95) 0%, #f6c768 45%, rgba(217,156,62,0.85) 100%)',
                                                    boxShadow: v > 0.5 ? `0 0 8px rgba(246,199,104,${v * 0.35})` : 'none',
                                                }}
                                                animate={{ scaleY: Math.max(0.05, v) }}
                                                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                            />
                                        ))}
                                    </div>
                                </motion.div>

                                {/* Stop — pulsing */}
                                <div className="relative">
                                    {!reducedMotion && (
                                        <motion.span
                                            className="absolute -inset-3 rounded-full pointer-events-none"
                                            style={{ border: '1.5px solid rgba(244,63,94,0.4)' }}
                                            animate={{ scale: [1, 1.22, 1], opacity: [0.5, 0.1, 0.5] }}
                                            transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
                                        />
                                    )}
                                    <motion.button
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        whileTap={{ scale: 0.88 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.15 }}
                                        onClick={stopRecording}
                                        aria-label="Stop recording"
                                        className="relative w-20 h-20 rounded-full flex items-center justify-center"
                                        style={{
                                            background: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
                                            boxShadow: '0 8px 40px rgba(244,63,94,0.45), 0 0 0 6px rgba(244,63,94,0.14), inset 0 1px 0 rgba(255,255,255,0.18)',
                                        }}
                                    >
                                        <Square size={22} fill="#fff" style={{ color: '#fff' }} />
                                    </motion.button>
                                </div>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-[12px] font-medium mt-5"
                                    style={{ color: GOLD.textLow }}
                                >
                                    Tap to stop
                                </motion.p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ══ Review sheet — keep it or let it go ═══════════════════ */}
            {ReactDOM.createPortal(
                <AnimatePresence>
                    {pendingAudio && !isRecording && (
                        <motion.div
                            key="review-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.22 } }}
                            className="fixed inset-0 z-[200] flex items-end justify-center"
                            style={{
                                backgroundColor: 'rgba(13,7,15,0.66)',
                                backdropFilter: 'blur(18px)',
                                WebkitBackdropFilter: 'blur(18px)',
                                paddingBottom: keyboardOpen ? keyboardHeight : undefined,
                                transition: 'padding-bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                        >
                            <motion.div
                                initial={{ y: '104%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '104%', transition: { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] } }}
                                transition={GOLD_SOFT_SPRING}
                                onPan={handleSheetPan}
                                onPanEnd={handleSheetPanEnd}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Keep this voice note"
                                className="lp-stage relative w-full max-w-[440px] overflow-hidden"
                                style={{
                                    y: sheetY,
                                    borderRadius: '32px 32px 0 0',
                                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                                    touchAction: 'none',
                                }}
                            >
                                <div className="lp-aurora">
                                    <div className="lp-aurora__blob lp-aurora__blob--gold" style={{ width: 300, height: 300, top: -110 }} />
                                    <div
                                        className="lp-aurora__blob lp-aurora__blob--rose"
                                        style={{ width: 280, height: 280, background: 'radial-gradient(circle, rgba(244,63,94,0.3) 0%, transparent 65%)' }}
                                    />
                                </div>
                                <div className="lp-grain" />
                                <div className="absolute top-0 left-0 right-0 h-px z-10 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

                                <div className="relative z-10 px-6 pt-3 pb-7">
                                    {/* Drag handle */}
                                    <div className="flex justify-center mb-5">
                                        <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,246,230,0.18)' }} />
                                    </div>

                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-5">
                                        <div className="flex items-center gap-3.5">
                                            <div
                                                className="flex w-11 h-11 shrink-0 items-center justify-center rounded-2xl"
                                                style={{ background: 'rgba(244,63,94,0.14)', border: '1px solid rgba(244,63,94,0.3)' }}
                                            >
                                                <Mic size={18} style={{ color: '#fda4af' }} />
                                            </div>
                                            <div>
                                                <h2 className="font-serif text-[1.35rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                                    A moment, captured
                                                </h2>
                                                <p className="mt-1 text-[11.5px] tabular-nums" style={{ color: GOLD.textMid }}>
                                                    {formatDuration(pendingAudio.duration)} recorded — listen back, then keep it
                                                </p>
                                            </div>
                                        </div>
                                        <motion.button
                                            whileTap={{ scale: 0.85 }}
                                            transition={GOLD_PRESS_SPRING}
                                            onClick={() => { feedback.tap(); handleDiscard(); }}
                                            aria-label="Discard recording"
                                            className="lp-glass w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                            style={{ color: 'rgba(255,246,230,0.6)' }}
                                        >
                                            <X size={15} />
                                        </motion.button>
                                    </div>

                                    {/* Playback preview */}
                                    <PendingPreview dataUri={pendingAudio.dataUri} duration={pendingAudio.duration} />

                                    {/* Title input */}
                                    <input
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="Name this note (optional)"
                                        autoFocus
                                        className="mt-4 w-full px-4 py-3.5 rounded-2xl text-[14px] outline-none placeholder:opacity-40"
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            color: GOLD.textHigh,
                                            caretColor: GOLD.primary,
                                        }}
                                    />

                                    {/* Actions */}
                                    <div className="mt-4">
                                        <GoldCTA onClick={handleSave} disabled={isSaving}>
                                            {isSaving ? (
                                                <span className="inline-flex items-center justify-center gap-2">
                                                    {reducedMotion ? 'Saving…' : (
                                                        <motion.span
                                                            animate={{ rotate: 360 }}
                                                            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                                                            className="block w-4 h-4 rounded-full border-2"
                                                            style={{ borderColor: 'rgba(255,246,230,0.25)', borderTopColor: 'rgba(255,246,230,0.85)' }}
                                                        />
                                                    )}
                                                </span>
                                            ) : 'Keep it'}
                                        </GoldCTA>
                                    </div>
                                    <button
                                        onClick={() => { feedback.tap(); handleDiscard(); }}
                                        className="mt-1 w-full py-3 text-[13px] font-medium active:scale-95 transition-transform"
                                        style={{ color: 'rgba(255,246,230,0.35)' }}
                                    >
                                        Discard
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} featureContext="voice" />
        </>
    );
};

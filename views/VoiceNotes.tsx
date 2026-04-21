import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Play, Pause, Trash2, MicOff, Send, X } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal } from '../components/PremiumModal';
import { ViewState, VoiceNote } from '../types';
import { StorageService } from '../services/storage';
import { toast } from '../utils/toast';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';

interface VoiceNotesViewProps {
    setView: (view: ViewState) => void;
}

const FREE_VOICE_NOTE_LIMIT = 5;
const WAVEFORM_BARS = 40;

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

// ── Playback card ──────────────────────────────────────────────────────────

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
    const [showDelete, setShowDelete] = useState(false);

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

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -80, transition: { duration: 0.2 } }}
            transition={{ delay: index * 0.04, type: 'spring', stiffness: 500, damping: 32 }}
            onTap={() => setShowDelete(false)}
            className="group relative"
        >
            <motion.div
                className="rounded-[20px] p-4 relative overflow-hidden"
                style={{
                    background: isPlaying
                        ? 'linear-gradient(135deg, rgba(255,255,255,0.75), rgba(251,207,232,0.35))'
                        : 'rgba(255,255,255,0.55)',
                    border: isPlaying
                        ? '1.5px solid rgba(244,114,182,0.3)'
                        : '1px solid rgba(255,255,255,0.7)',
                    boxShadow: isPlaying
                        ? '0 8px 32px rgba(244,114,182,0.12), 0 2px 8px rgba(0,0,0,0.04)'
                        : '0 2px 8px rgba(0,0,0,0.03)',
                    transition: 'all 0.3s ease',
                }}
            >
                {/* Playing glow accent */}
                {isPlaying && (
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(244,114,182,0.08), transparent 60%)' }}
                    />
                )}

                <div className="flex items-center gap-3.5 relative z-[1]">
                    {/* Play button */}
                    <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={togglePlay}
                        disabled={!audioUrl}
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 disabled:opacity-30"
                        style={{
                            background: isPlaying
                                ? 'var(--theme-nav-center-bg-active)'
                                : 'linear-gradient(135deg, rgba(244,114,182,0.15), rgba(251,207,232,0.25))',
                            boxShadow: isPlaying
                                ? '0 4px 16px rgba(244,114,182,0.35)'
                                : 'none',
                            transition: 'all 0.3s ease',
                        }}
                    >
                        {isPlaying
                            ? <Pause size={16} fill="white" style={{ color: '#fff' }} />
                            : <Play size={16} fill="var(--color-nav-active)" style={{ color: 'var(--color-nav-active)', marginLeft: 1 }} />
                        }
                    </motion.button>

                    {/* Info + progress */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                                {note.title || 'Voice Note'}
                            </p>
                            <span className="text-[10px] flex-shrink-0 opacity-40 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                                {timeAgo(note.createdAt)}
                            </span>
                        </div>

                        {/* Scrubber bar */}
                        <div className="flex items-center gap-2.5 mt-2">
                            <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.1)' }}>
                                <motion.div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${progress * 100}%`,
                                        background: isPlaying
                                            ? 'var(--theme-nav-center-bg-active)'
                                            : 'rgba(var(--theme-particle-1-rgb),0.3)',
                                        transition: 'background 0.3s',
                                    }}
                                />
                            </div>
                            <span className="text-[10px] tabular-nums flex-shrink-0 font-medium" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                                {isPlaying ? formatDuration(currentTime) : formatDuration(note.duration)}
                            </span>
                        </div>
                    </div>

                    {/* Delete (long-press reveal or always visible) */}
                    <motion.button
                        whileTap={{ scale: 0.8 }}
                        onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 opacity-0 group-active:opacity-100 transition-opacity"
                        style={{ background: 'rgba(239,68,68,0.08)' }}
                    >
                        <Trash2 size={13} style={{ color: '#ef4444' }} />
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ── Main View ──────────────────────────────────────────────────────────────

export const VoiceNotesView: React.FC<VoiceNotesViewProps> = ({ setView }) => {
    const [notes, setNotes] = useState<VoiceNote[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingDurationRef = useRef(0);
    const [pendingAudio, setPendingAudio] = useState<{ dataUri: string; duration: number } | null>(null);
    const [title, setTitle] = useState('');
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [waveformData, setWaveformData] = useState<number[]>(new Array(WAVEFORM_BARS).fill(0));
    const [hasPermission, setHasPermission] = useState(true);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const animFrameRef = useRef<number | null>(null);

    useEffect(() => {
        setNotes(StorageService.getVoiceNotes());
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
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

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setHasPermission(true);

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
            setHasPermission(false);
            toast.show('Microphone access denied', 'error');
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
    const isOverlayOpen = isRecording || !!pendingAudio;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full min-h-screen"
            style={{ background: 'transparent' }}
        >
            <ViewHeader title="Voice Notes" onBack={() => setView('home')} variant="centered" />

            {/* ── Notes list ── */}
            <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-4 pt-2 pb-48 space-y-3">
                {/* Inline record FAB — always at top of list */}
                {!isOverlayOpen && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { if (canRecord) startRecording(); else setShowPremiumModal(true); }}
                        className="w-full flex items-center gap-4 p-4 rounded-[20px]"
                        style={{
                            background: 'linear-gradient(135deg, rgba(244,114,182,0.06), rgba(251,207,232,0.12))',
                            border: '1.5px dashed rgba(244,114,182,0.25)',
                        }}
                    >
                        <div
                            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 4px 16px rgba(244,114,182,0.3)' }}
                        >
                            <Mic size={18} className="text-white" strokeWidth={2} />
                        </div>
                        <div className="text-left flex-1">
                            <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                Record a voice note
                            </p>
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                                {!hasPermission ? 'Microphone access needed' : 'Tap to start recording'}
                            </p>
                        </div>
                        {!profile.isPremium && (
                            <span className="text-[10px] font-medium px-2 py-1 rounded-full flex-shrink-0" style={{ background: 'rgba(var(--theme-particle-1-rgb),0.1)', color: 'var(--color-text-secondary)' }}>
                                {notes.length}/{FREE_VOICE_NOTE_LIMIT}
                            </span>
                        )}
                    </motion.button>
                )}

                {!hasPermission && !isOverlayOpen && (
                    <div className="flex items-center justify-center gap-2 py-2">
                        <MicOff size={13} style={{ color: '#ef4444' }} />
                        <span className="text-[11px] font-medium" style={{ color: '#ef4444' }}>Grant microphone access in settings</span>
                    </div>
                )}

                <AnimatePresence mode="popLayout">
                    {notes.map((note, i) => (
                        <VoiceNoteCard key={note.id} note={note} onDelete={handleDelete} index={i} />
                    ))}
                </AnimatePresence>
                {notes.length === 0 && !isOverlayOpen && (
                    <div className="pt-4">
                        <EmptyState variant="voiceNotes" />
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                 FULL-SCREEN RECORDING / SAVE OVERLAY
                 Renders as a portal-like fixed overlay ABOVE the nav bar (z-[60]).
                 This guarantees the stop button is never occluded.
               ══════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {isRecording && (
                    <motion.div
                        key="recording-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                        className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
                        style={{
                            background: 'linear-gradient(180deg, rgba(15,5,10,0.85) 0%, rgba(40,10,25,0.95) 100%)',
                            backdropFilter: 'blur(40px) saturate(1.3)',
                            WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
                        }}
                    >
                        {/* Ambient pulse rings */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                            {[0, 1, 2].map(ring => (
                                <motion.div
                                    key={ring}
                                    className="absolute rounded-full"
                                    style={{
                                        width: 200 + ring * 100,
                                        height: 200 + ring * 100,
                                        border: `1px solid rgba(244,114,182,${0.12 - ring * 0.03})`,
                                    }}
                                    animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.15, 0.4] }}
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
                                className="text-[56px] font-extralight tabular-nums leading-none"
                                style={{ color: 'rgba(255,255,255,0.95)', letterSpacing: '0.04em' }}
                            >
                                {formatDuration(recordingDuration)}
                            </span>
                        </motion.div>

                        {/* Live waveform */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="relative z-[1] flex items-end justify-center gap-[3px] h-16 w-[85%] max-w-xs mt-10 mb-12"
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

                        {/* Stop button — big, centered, unmissable */}
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

            {/* ── Save / discard overlay ── */}
            <AnimatePresence>
                {pendingAudio && !isRecording && (
                    <motion.div
                        key="save-overlay"
                        initial={{ opacity: 0, y: '100%' }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: '100%' }}
                        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                        className="fixed inset-x-0 bottom-0 z-[60] flex flex-col"
                        style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,245,248,0.98) 100%)',
                            backdropFilter: 'blur(50px)',
                            WebkitBackdropFilter: 'blur(50px)',
                            borderRadius: '28px 28px 0 0',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.08), 0 -2px 12px rgba(244,114,182,0.06)',
                            maxHeight: '70vh',
                            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)',
                        }}
                    >
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.2)' }} />
                        </div>

                        <div className="px-5 pb-4 space-y-4">
                            {/* Recorded badge */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div
                                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, rgba(244,114,182,0.15), rgba(251,207,232,0.25))' }}
                                    >
                                        <Mic size={15} style={{ color: 'var(--color-nav-active)' }} />
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                            Voice recorded
                                        </p>
                                        <p className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                                            {formatDuration(pendingAudio.duration)} long
                                        </p>
                                    </div>
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.85 }}
                                    onClick={handleDiscard}
                                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                                    style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)' }}
                                >
                                    <X size={15} style={{ color: 'var(--color-text-secondary)' }} />
                                </motion.button>
                            </div>

                            {/* Title input */}
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Name this note... (optional)"
                                autoFocus
                                className="w-full px-4 py-3.5 rounded-2xl text-[14px] outline-none"
                                style={{
                                    background: 'rgba(255,255,255,0.7)',
                                    border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)',
                                    color: 'var(--color-text-primary)',
                                }}
                            />

                            {/* Action buttons */}
                            <div className="flex gap-3">
                                <motion.button
                                    whileTap={{ scale: 0.94 }}
                                    onClick={handleDiscard}
                                    className="flex-1 py-3.5 rounded-2xl font-semibold text-[13px]"
                                    style={{
                                        background: 'rgba(var(--theme-particle-2-rgb),0.08)',
                                        color: 'var(--color-text-secondary)',
                                    }}
                                >
                                    Discard
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.94 }}
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-[2] py-3.5 rounded-2xl font-bold text-[13px] text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{
                                        background: 'var(--theme-nav-center-bg-active)',
                                        boxShadow: '0 4px 20px rgba(244,114,182,0.3)',
                                    }}
                                >
                                    {isSaving ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                                            className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                                        />
                                    ) : (
                                        <>
                                            <Send size={14} />
                                            Save Note
                                        </>
                                    )}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        </motion.div>
    );
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Play, Pause, Trash2, MicOff } from 'lucide-react';
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

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

const VoiceNoteCard: React.FC<{ note: VoiceNote; onDelete: (id: string) => void }> = ({ note, onDelete }) => {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

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
                setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
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
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="rounded-3xl p-5"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)' }}
        >
            <div className="flex items-center gap-4">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={togglePlay}
                    disabled={!audioUrl}
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm disabled:opacity-40"
                    style={{ background: 'var(--theme-nav-center-bg-active)' }}
                >
                    {isPlaying
                        ? <Pause size={18} className="text-white" fill="white" />
                        : <Play size={18} className="text-white" fill="white" style={{ marginLeft: 2 }} />
                    }
                </motion.button>
                <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {note.title || 'Voice Note'}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                        {/* Progress bar */}
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.12)' }}>
                            <motion.div
                                className="h-full rounded-full"
                                style={{ width: `${progress * 100}%`, background: 'var(--theme-nav-center-bg-active)' }}
                            />
                        </div>
                        <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                            {formatDuration(note.duration)}
                        </span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                        {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                </div>
                <button onClick={() => onDelete(note.id)} className="opacity-30 hover:opacity-60 p-1 flex-shrink-0 transition-opacity active:scale-90">
                    <Trash2 size={14} style={{ color: 'var(--color-text-primary)' }} />
                </button>
            </div>
        </motion.div>
    );
};

export const VoiceNotesView: React.FC<VoiceNotesViewProps> = ({ setView }) => {
    const [notes, setNotes] = useState<VoiceNote[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingDurationRef = useRef(0);
    const [pendingAudio, setPendingAudio] = useState<{ dataUri: string; duration: number } | null>(null);
    const [title, setTitle] = useState('');
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [waveformData, setWaveformData] = useState<number[]>(new Array(30).fill(0));
    const [hasPermission, setHasPermission] = useState(true);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

        // Sample 30 bars evenly
        const step = Math.floor(bufferLength / 30);
        const bars = Array.from({ length: 30 }, (_, i) => dataArray[i * step] / 255);
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

            // Set up AudioContext for waveform
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
                setWaveformData(new Array(30).fill(0));
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

        // Save audio to IDB first, then attempt R2 upload
        const cloudUrl = await StorageService.saveVoiceNoteAudio(id, pendingAudio.dataUri);
        if (cloudUrl) newNote.audioStoragePath = cloudUrl;

        await StorageService.saveVoiceNote(newNote);
        setNotes(StorageService.getVoiceNotes());

        setPendingAudio(null);
        setTitle('');
        setIsSaving(false);
        feedback.celebrate();
        toast.show('Voice note saved!', 'success');
    };

    const handleDiscard = () => {
        setPendingAudio(null);
        setTitle('');
    };

    const handleDelete = async (id: string) => {
        await StorageService.deleteVoiceNote(id);
        setNotes(prev => prev.filter(n => n.id !== id));
    };

    const profile = StorageService.getCoupleProfile();
    const canRecord = profile.isPremium || notes.length < FREE_VOICE_NOTE_LIMIT;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full min-h-screen"
            style={{ background: 'transparent' }}
        >
            <ViewHeader title="Voice Notes" onBack={() => setView('home')} variant="centered" />

            <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto p-4 pb-8 space-y-4">
                <AnimatePresence mode="popLayout">
                    {notes.map(note => (
                        <VoiceNoteCard key={note.id} note={note} onDelete={handleDelete} />
                    ))}
                </AnimatePresence>
                {notes.length === 0 && !isRecording && !pendingAudio && (
                    <EmptyState variant="voiceNotes" />
                )}
            </div>

            {/* Bottom recording area */}
            <div className="p-4 pb-8 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.3)', background: 'var(--theme-bg-main)' }}>
                <AnimatePresence mode="wait">
                    {pendingAudio ? (
                        /* Save flow */
                        <motion.div
                            key="save"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-3"
                        >
                            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(var(--theme-particle-1-rgb),0.08)' }}>
                                <Mic size={16} style={{ color: 'var(--color-text-secondary)' }} />
                                <span className="text-[14px]" style={{ color: 'var(--color-text-primary)' }}>
                                    Recorded {formatDuration(pendingAudio.duration)}
                                </span>
                            </div>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Add a title... (optional)"
                                autoFocus
                                className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
                                style={{ background: 'rgba(255,255,255,0.6)', border: '1.5px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-primary)' }}
                            />
                            <div className="flex gap-3">
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={handleDiscard}
                                    className="flex-1 py-3.5 rounded-2xl font-semibold text-[14px] opacity-50"
                                    style={{ background: 'rgba(var(--theme-particle-2-rgb),0.1)' }}
                                >
                                    Discard
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-1 py-3.5 rounded-2xl font-bold text-[14px] text-white disabled:opacity-50"
                                    style={{ background: 'var(--theme-nav-center-bg-active)' }}
                                >
                                    {isSaving ? 'Saving...' : 'Save Note'}
                                </motion.button>
                            </div>
                        </motion.div>
                    ) : isRecording ? (
                        /* Recording flow */
                        <motion.div
                            key="recording"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center gap-4"
                        >
                            {/* Waveform */}
                            <div className="flex items-center gap-0.5 h-12 w-full px-2">
                                {waveformData.map((v, i) => (
                                    <motion.div
                                        key={i}
                                        className="flex-1 rounded-full"
                                        style={{
                                            height: `${Math.max(8, v * 100)}%`,
                                            background: `rgba(var(--theme-particle-1-rgb), ${0.5 + v * 0.5})`,
                                        }}
                                        animate={{ height: `${Math.max(8, v * 100)}%` }}
                                        transition={{ duration: 0.05 }}
                                    />
                                ))}
                            </div>

                            <div className="flex items-center gap-6">
                                <span className="text-[24px] font-mono tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                                    {formatDuration(recordingDuration)}
                                </span>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={stopRecording}
                                    className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                    style={{ background: 'rgba(239,68,68,0.9)' }}
                                >
                                    <Square size={22} className="text-white" fill="white" />
                                </motion.button>
                            </div>
                        </motion.div>
                    ) : (
                        /* Idle — record button */
                        <motion.div
                            key="idle"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center gap-2"
                        >
                            {!hasPermission && (
                                <div className="flex items-center gap-2 mb-2">
                                    <MicOff size={14} style={{ color: '#ef4444' }} />
                                    <span className="text-[12px]" style={{ color: '#ef4444' }}>Microphone access needed</span>
                                </div>
                            )}
                            <motion.button
                                whileTap={{ scale: 0.94 }}
                                onClick={() => { if (canRecord) { startRecording(); } else { setShowPremiumModal(true); } }}
                                className="w-20 h-20 rounded-full flex items-center justify-center shadow-xl"
                                style={{ background: 'var(--theme-nav-center-bg-active)' }}
                            >
                                <Mic size={28} className="text-white" strokeWidth={1.8} />
                            </motion.button>
                            <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                                Tap to record
                            </p>
                            {!profile.isPremium && (
                                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }}>
                                    {notes.length}/{FREE_VOICE_NOTE_LIMIT} free notes used
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        </motion.div>
    );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Heart, Mic, MoonStar, PhoneCall, Radio, RefreshCw, Sparkles, Volume2, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { NightlightEntry, PresenceTrace, ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { feedback } from '../utils/feedback';

interface PresenceRoomProps {
    setView: (view: ViewState) => void;
}

interface NightIntent {
    id: string;
    label: string;
    short: string;
    fallback: string;
    color: string;
    palette: [string, string, string];
    icon: LucideIcon;
}

interface LiveSignal {
    kind: 'knock' | 'left';
    senderName: string;
    note: string;
    color: string;
}

const MAX_NOTE = 120;
const MAX_RECORD_SECONDS = 18;
const MAX_NIGHTLIGHTS = 18;
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

const INTENTS: NightIntent[] = [
    { id: 'goodnight', label: 'Goodnight', short: 'Sleep beside this', fallback: 'Goodnight, love. Keep me close tonight.', color: '#a78bfa', palette: ['#c4b5fd', '#93c5fd', '#f9a8d4'], icon: MoonStar },
    { id: 'miss-you', label: 'Miss You', short: 'The distance feels loud', fallback: 'I miss you too much tonight.', color: '#fb7185', palette: ['#fb7185', '#fdba74', '#f9a8d4'], icon: Heart },
    { id: 'quiet-company', label: 'Quiet Company', short: 'Just stay near', fallback: 'No pressure. I just want to feel you near me.', color: '#f472b6', palette: ['#f9a8d4', '#fde68a', '#c4b5fd'], icon: Wind },
    { id: 'need-your-voice', label: 'Need Your Voice', short: 'Call me when you can', fallback: 'If you can, I really need your voice tonight.', color: '#f59e0b', palette: ['#f59e0b', '#fda4af', '#fcd34d'], icon: PhoneCall },
];

const findIntent = (id?: string) => INTENTS.find((item) => item.id === id) || INTENTS[0];
const nightKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fmtNight = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
const fmtClock = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
const fmtSecs = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const prune = (items: NightlightEntry[] = []) => items
    .filter((item) => Date.now() - new Date(item.updatedAt || item.createdAt).getTime() < KEEP_MS)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_NIGHTLIGHTS);

const inferLegacyIntent = (trace: PresenceTrace) => {
    const text = `${trace.title} ${trace.subtitle} ${trace.note}`.toLowerCase();
    if (text.includes('goodnight') || text.includes('sleep')) return 'goodnight';
    if (text.includes('voice') || text.includes('call')) return 'need-your-voice';
    if (text.includes('miss')) return 'miss-you';
    return 'quiet-company';
};

const migrateLegacy = (profile: ReturnType<typeof StorageService.getCoupleProfile>) => {
    if (!profile.presenceTraces?.length) return null;
    const existing = new Set((profile.nightlights || []).map((item) => item.id));
    const migrated = profile.presenceTraces
        .filter((trace) => !existing.has(trace.id))
        .map((trace) => {
            const intent = findIntent(inferLegacyIntent(trace));
            return {
                id: trace.id,
                senderName: trace.senderName,
                targetName: trace.targetName,
                nightKey: nightKey(new Date(trace.createdAt)),
                intentId: intent.id,
                title: intent.label,
                subtitle: intent.short,
                detail: intent.short,
                note: trace.note,
                color: trace.color || intent.color,
                palette: intent.palette,
                createdAt: trace.createdAt,
                updatedAt: trace.createdAt,
            } satisfies NightlightEntry;
        });
    if (!migrated.length) return null;
    return { ...profile, presenceTraces: [], nightlights: prune([...(profile.nightlights || []), ...migrated]) };
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Audio conversion failed.'));
    reader.onerror = () => reject(reader.error || new Error('Audio conversion failed.'));
    reader.readAsDataURL(blob);
});

const Glass = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div
        className={`rounded-[1.8rem] backdrop-blur-[20px] ${className}`}
        style={{
            background: 'color-mix(in srgb, var(--color-glass, rgba(255,255,255,0.75)) 92%, rgba(255,255,255,0.42))',
            border: '1px solid rgba(var(--theme-particle-2-rgb),0.16)',
            boxShadow: 'var(--shadow-float)',
        }}
    >
        {children}
    </div>
);

export const PresenceRoom: React.FC<PresenceRoomProps> = ({ setView }) => {
    const reduceMotion = useReducedMotion();
    const [profile, setProfile] = useState(StorageService.getCoupleProfile());
    const [selectedIntentId, setSelectedIntentId] = useState(INTENTS[0].id);
    const [note, setNote] = useState('');
    const [draftAudio, setDraftAudio] = useState<string>();
    const [draftAudioSeconds, setDraftAudioSeconds] = useState(0);
    const [statusCopy, setStatusCopy] = useState('Leave one feeling for tonight.');
    const [connected, setConnected] = useState(SyncService.isConnected);
    const [partnerHere, setPartnerHere] = useState(false);
    const [partnerIntentId, setPartnerIntentId] = useState(INTENTS[0].id);
    const [incoming, setIncoming] = useState<LiveSignal | null>(null);
    const [recording, setRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [micLoading, setMicLoading] = useState(false);
    const [recordError, setRecordError] = useState('');
    const intent = useMemo(() => findIntent(selectedIntentId), [selectedIntentId]);
    const partnerIntent = useMemo(() => findIntent(partnerIntentId), [partnerIntentId]);
    const pulseAtRef = useRef(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<number | null>(null);
    const startedAtRef = useRef<number | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const today = nightKey();

    const lights = useMemo(() => prune(profile.nightlights || []), [profile]);
    const myTonight = useMemo(() => lights.find((item) => item.senderName === profile.myName && item.targetName === profile.partnerName && item.nightKey === today), [lights, profile.myName, profile.partnerName, today]);
    const waiting = useMemo(() => lights.find((item) => item.targetName === profile.myName && !item.openedAt) || lights.find((item) => item.targetName === profile.myName) || null, [lights, profile.myName]);
    const hasDraftWhisper = Boolean(draftAudio);
    const actionLocked = recording || micLoading;
    const knockDisabled = actionLocked || !connected;
    const sendLabel = myTonight ? 'Update nightlight' : 'Send nightlight';

    useEffect(() => {
        const migrated = migrateLegacy(StorageService.getCoupleProfile());
        if (migrated) {
            StorageService.saveCoupleProfile(migrated);
            setProfile(migrated);
        }
    }, []);

    useEffect(() => {
        if (myTonight) {
            setSelectedIntentId(myTonight.intentId);
            setNote(myTonight.note || '');
            setDraftAudio(myTonight.whisperAudio);
            setDraftAudioSeconds(myTonight.whisperDurationSec || 0);
        } else {
            setSelectedIntentId(INTENTS[0].id);
            setNote('');
            setDraftAudio(undefined);
            setDraftAudioSeconds(0);
        }
    }, [myTonight?.id, myTonight?.updatedAt]);

    const saveProfile = useCallback((updater: (current: ReturnType<typeof StorageService.getCoupleProfile>) => ReturnType<typeof StorageService.getCoupleProfile>, source: 'user' | 'sync' = 'user') => {
        const next = updater(StorageService.getCoupleProfile());
        StorageService.saveCoupleProfile(next, source);
        setProfile(next);
    }, []);

    const emit = useCallback((signalType: string, extra?: Record<string, unknown>) => {
        const current = StorageService.getCoupleProfile();
        const selected = findIntent(selectedIntentId);
        SyncService.sendSignal(signalType, {
            senderName: current.myName,
            intentId: selected.id,
            title: selected.label,
            subtitle: selected.short,
            detail: selected.short,
            color: selected.color,
            nightKey: today,
            ...extra,
        });
    }, [selectedIntentId, today]);

    const cleanupRecorder = useCallback(() => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        startedAtRef.current = null;
        chunksRef.current = [];
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    }, []);

    const startRecording = useCallback(async () => {
        if (recording || micLoading) return;
        if (typeof window === 'undefined' || !window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
            setRecordError('Voice not supported here.');
            return;
        }

        try {
            setMicLoading(true);
            setRecordError('');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((value) => MediaRecorder.isTypeSupported(value));
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            streamRef.current = stream;
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];
            startedAtRef.current = Date.now();
            setDraftAudio(undefined);
            setDraftAudioSeconds(0);
            setRecordSeconds(0);
            setRecording(true);
            setMicLoading(false);
            feedback.tap();

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                const elapsed = Math.min(MAX_RECORD_SECONDS, Math.max(1, Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000)));
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
                cleanupRecorder();
                setRecording(false);
                setRecordSeconds(0);
                if (!blob.size) return setRecordError('That whisper came through empty.');
                try {
                    setDraftAudio(await blobToDataUrl(blob));
                    setDraftAudioSeconds(elapsed);
                    setStatusCopy('Whisper ready.');
                } catch {
                    setRecordError('Could not save whisper.');
                }
            };

            recorder.start();
            timerRef.current = window.setInterval(() => {
                const elapsed = Math.min(MAX_RECORD_SECONDS, Math.max(0, Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000)));
                setRecordSeconds(elapsed);
                if (elapsed >= MAX_RECORD_SECONDS) stopRecording();
            }, 150);
        } catch {
            cleanupRecorder();
            setRecording(false);
            setMicLoading(false);
            setRecordError('Mic access blocked.');
        }
    }, [cleanupRecorder, micLoading, recording, stopRecording]);

    const saveNightlight = useCallback(() => {
        const text = note.trim() || intent.fallback;
        const now = new Date().toISOString();
        saveProfile((current) => {
            const existing = prune(current.nightlights || []).find((item) => item.senderName === current.myName && item.targetName === current.partnerName && item.nightKey === today);
            const next: NightlightEntry = {
                id: existing?.id || crypto.randomUUID(),
                senderName: current.myName,
                targetName: current.partnerName,
                nightKey: today,
                intentId: intent.id,
                title: intent.label,
                subtitle: intent.short,
                detail: intent.short,
                note: text,
                color: intent.color,
                palette: intent.palette,
                createdAt: existing?.createdAt || now,
                updatedAt: now,
                whisperAudio: draftAudio,
                whisperDurationSec: draftAudio ? draftAudioSeconds : undefined,
            };
            return { ...current, nightlights: prune([next, ...(current.nightlights || []).filter((item) => item.id !== existing?.id)]) };
        });
        emit('NIGHTLIGHT_LEFT', { note: text });
        feedback.celebrate();
        setStatusCopy('Nightlight sent.');
    }, [draftAudio, draftAudioSeconds, emit, intent, note, saveProfile, today]);

    const knockNow = useCallback(() => {
        emit('NIGHTLIGHT_KNOCK', { note: note.trim() || intent.fallback });
        feedback.interact();
        setStatusCopy('Soft knock sent.');
    }, [emit, intent.fallback, note]);

    const markOpened = useCallback(() => {
        if (!waiting || waiting.openedAt) return;
        saveProfile((current) => ({
            ...current,
            nightlights: prune((current.nightlights || []).map((item) => item.id === waiting.id ? { ...item, openedAt: new Date().toISOString() } : item)),
        }));
        setIncoming(null);
        setStatusCopy('Nightlight opened.');
        feedback.tap();
    }, [saveProfile, waiting]);

    const markFelt = useCallback(() => {
        if (!waiting || waiting.feltAt) return;
        saveProfile((current) => ({
            ...current,
            nightlights: prune((current.nightlights || []).map((item) => item.id === waiting.id ? { ...item, feltAt: new Date().toISOString() } : item)),
        }));
        setIncoming(null);
        feedback.celebrate();
        setStatusCopy('Marked felt.');
    }, [saveProfile, waiting]);

    useEffect(() => {
        const onStorage = () => setProfile(StorageService.getCoupleProfile());
        const onSync = () => setConnected(SyncService.isConnected);
        storageEventTarget.addEventListener('storage-update', onStorage);
        syncEventTarget.addEventListener('sync-update', onSync);
        return () => {
            storageEventTarget.removeEventListener('storage-update', onStorage);
            syncEventTarget.removeEventListener('sync-update', onSync);
        };
    }, []);

    useEffect(() => {
        const current = StorageService.getCoupleProfile();
        const cleaned = prune(current.nightlights || []);
        if (cleaned.length !== (current.nightlights || []).length) {
            StorageService.saveCoupleProfile({ ...current, nightlights: cleaned }, 'sync');
        }
    }, []);

    useEffect(() => {
        const onSignal = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            const payload = detail.payload;
            if (!payload || payload.senderName !== profile.partnerName) return;
            if (detail.signalType === 'NIGHTLIGHT_ROOM_ENTER' || detail.signalType === 'NIGHTLIGHT_ROOM_PULSE') {
                pulseAtRef.current = Date.now();
                setPartnerHere(true);
                setPartnerIntentId(payload.intentId || INTENTS[0].id);
                return;
            }
            if (detail.signalType === 'NIGHTLIGHT_ROOM_EXIT') return setPartnerHere(false);
            if (detail.signalType === 'NIGHTLIGHT_KNOCK' || detail.signalType === 'NIGHTLIGHT_LEFT') {
                pulseAtRef.current = Date.now();
                setPartnerHere(true);
                setPartnerIntentId(payload.intentId || INTENTS[0].id);
                setIncoming({
                    kind: detail.signalType === 'NIGHTLIGHT_LEFT' ? 'left' : 'knock',
                    senderName: payload.senderName,
                    note: payload.note || payload.detail,
                    color: payload.color,
                });
                feedback.celebrate();
            }
        };

        syncEventTarget.addEventListener('signal-received', onSignal);
        return () => syncEventTarget.removeEventListener('signal-received', onSignal);
    }, [profile.partnerName]);

    useEffect(() => {
        emit('NIGHTLIGHT_ROOM_ENTER');
        const pulse = window.setInterval(() => emit('NIGHTLIGHT_ROOM_PULSE'), 12000);
        return () => {
            window.clearInterval(pulse);
            SyncService.sendSignal('NIGHTLIGHT_ROOM_EXIT', { senderName: StorageService.getCoupleProfile().myName });
        };
    }, [emit]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (pulseAtRef.current && Date.now() - pulseAtRef.current > 18000) setPartnerHere(false);
        }, 4000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!incoming) return;
        const timeout = window.setTimeout(() => setIncoming(null), 4200);
        return () => window.clearTimeout(timeout);
    }, [incoming]);

    useEffect(() => () => cleanupRecorder(), [cleanupRecorder]);

    return (
        <div className="min-h-screen relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: 'var(--theme-bg-main)' }} />
            <div className="absolute inset-0" style={{ background: 'var(--theme-vignette)', opacity: 0.9 }} />
            <div className="absolute inset-0 pointer-events-none">
                {[{ c: (partnerHere ? partnerIntent : intent).palette[0], x: '10%', y: '8%' }, { c: (partnerHere ? partnerIntent : intent).palette[1], x: '58%', y: '14%' }, { c: (partnerHere ? partnerIntent : intent).palette[2], x: '18%', y: '60%' }].map((blob, i) => (
                    <motion.div
                        key={`${blob.c}-${i}`}
                        className="absolute h-64 w-64 rounded-full"
                        style={{ left: blob.x, top: blob.y, background: blob.c, opacity: 0.12, filter: 'blur(88px)' }}
                        animate={reduceMotion ? undefined : { x: [0, i % 2 ? -18 : 16, 0], y: [0, i === 1 ? 18 : -14, 0] }}
                        transition={{ duration: 11 + i * 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                ))}
            </div>

            <div className="relative z-10 px-4 pt-4 pb-14">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setView('home')}
                        className="w-11 h-11 rounded-full backdrop-blur-xl flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lior-500/60"
                        style={{ background: 'rgba(255,255,255,0.56)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
                        aria-label="Go back"
                    >
                        <ArrowLeft size={20} />
                    </button>

                    <div className="px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.24em] font-semibold" style={{ background: 'rgba(255,255,255,0.56)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-secondary)' }}>
                        {partnerHere ? 'Both here' : connected ? 'Nightlight' : 'Offline'}
                    </div>
                </div>

                <div className="pt-6 text-center">
                    <p className="text-[11px] uppercase tracking-[0.3em] font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Nightlight</p>
                    <div className="mx-auto relative h-56 w-56 flex items-center justify-center">
                        <motion.div
                            className="absolute inset-0 rounded-full"
                            style={{ background: `radial-gradient(circle at 50% 42%, ${intent.palette[0]}88 0%, ${intent.palette[1]}36 34%, rgba(255,255,255,0.62) 68%, rgba(255,255,255,0.92) 100%)`, boxShadow: `0 0 90px ${intent.color}20, inset 0 0 70px rgba(255,255,255,0.24)` }}
                            animate={reduceMotion ? undefined : { scale: partnerHere ? [0.97, 1.05, 0.97] : [0.99, 1.02, 0.99] }}
                            transition={{ duration: partnerHere ? 3.2 : 4.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <div className="relative text-center px-8">
                            <h1 className="font-serif text-[2.2rem] leading-none mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                {waiting && !waiting.openedAt ? 'Waiting' : intent.label}
                            </h1>
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                {waiting && !waiting.openedAt ? `${waiting.senderName} left one for you` : intent.short}
                            </p>
                        </div>
                    </div>
                </div>

                {waiting && (
                    <Glass className="p-4 mb-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.24em] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                    {fmtNight(waiting.nightKey)}
                                </p>
                                <p className="font-semibold mt-1" style={{ color: 'var(--color-text-primary)' }}>
                                    {waiting.senderName}
                                </p>
                            </div>
                            {!waiting.feltAt && (
                                <button
                                    onClick={waiting.openedAt ? markFelt : markOpened}
                                    className="rounded-full px-4 py-2.5 text-sm font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lior-500/50"
                                    style={{ background: waiting.openedAt ? waiting.color : 'rgba(255,255,255,0.5)', color: waiting.openedAt ? '#fff' : 'var(--color-text-primary)', border: waiting.openedAt ? 'none' : '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}
                                >
                                    {waiting.openedAt ? 'Let them know' : 'Open it'}
                                </button>
                            )}
                        </div>

                        {waiting.openedAt ? (
                            <>
                                <p className="text-sm leading-relaxed mt-4" style={{ color: 'var(--color-text-primary)' }}>
                                    {waiting.note}
                                </p>
                                {waiting.whisperAudio && (
                                    <div className="mt-4">
                                        <audio controls className="w-full" src={waiting.whisperAudio} />
                                    </div>
                                )}
                                <div className="flex gap-2 mt-4">
                                    <div className="px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ background: 'rgba(255,255,255,0.48)', color: 'var(--color-text-secondary)' }}>
                                        {fmtClock(waiting.openedAt)}
                                    </div>
                                    {waiting.feltAt && (
                                        <div className="px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ background: `${waiting.color}12`, color: 'var(--color-text-primary)', border: `1px solid ${waiting.color}22` }}>
                                            {fmtClock(waiting.feltAt)}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="mt-4 rounded-[1.3rem] px-4 py-5 text-sm text-center" style={{ background: 'rgba(255,255,255,0.42)', color: 'var(--color-text-secondary)' }}>
                                Tap to open
                            </div>
                        )}
                    </Glass>
                )}

                <Glass className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                        {INTENTS.map((item) => {
                            const Icon = item.icon;
                            const active = item.id === intent.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        feedback.tap();
                                        setSelectedIntentId(item.id);
                                    }}
                                    disabled={actionLocked}
                                    className="rounded-[1.45rem] p-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lior-500/50"
                                    style={{
                                        background: active ? `linear-gradient(145deg, ${item.color}16 0%, rgba(255,255,255,0.56) 100%)` : 'rgba(255,255,255,0.34)',
                                        border: active ? `1px solid ${item.color}44` : '1px solid rgba(var(--theme-particle-2-rgb),0.12)',
                                        opacity: actionLocked ? 0.55 : 1,
                                    }}
                                >
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${item.color}18`, color: item.color }}>
                                        <Icon size={18} />
                                    </div>
                                    <p className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{item.label}</p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{item.short}</p>
                                </button>
                            );
                        })}
                    </div>

                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
                        rows={3}
                        placeholder="Optional note"
                        className="w-full mt-4 rounded-[1.3rem] px-4 py-3 outline-none resize-none focus:ring-2 focus:ring-lior-500/30"
                        style={{ background: 'rgba(255,255,255,0.42)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.16)', color: 'var(--color-text-primary)' }}
                    />

                    <div className="flex items-center justify-between gap-3 mt-3">
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {note.length}/{MAX_NOTE}
                        </p>

                        <button
                            onClick={recording ? stopRecording : startRecording}
                            disabled={micLoading}
                            className="rounded-full px-4 py-2.5 text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lior-500/60"
                            style={{ background: recording ? intent.color : 'rgba(255,255,255,0.44)', color: recording ? '#fff' : 'var(--color-text-primary)', border: recording ? 'none' : '1px solid rgba(var(--theme-particle-2-rgb),0.14)' }}
                        >
                            {micLoading ? <RefreshCw size={15} className="animate-spin" /> : <><Mic size={15} />{recording ? fmtSecs(recordSeconds) : hasDraftWhisper ? 'Replace whisper' : 'Whisper'}</>}
                        </button>
                    </div>

                    {draftAudio && !recording && (
                        <div className="mt-3">
                            <audio controls className="w-full" src={draftAudio} />
                            <button
                                onClick={() => {
                                    setDraftAudio(undefined);
                                    setDraftAudioSeconds(0);
                                    setStatusCopy('Whisper removed.');
                                    feedback.tap();
                                }}
                                className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] cursor-pointer"
                                style={{ color: 'var(--color-text-secondary)' }}
                            >
                                Remove whisper
                            </button>
                        </div>
                    )}

                    {recordError && (
                        <p className="text-xs mt-3" style={{ color: 'var(--color-text-secondary)' }}>
                            {recordError}
                        </p>
                    )}

                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <button
                            onClick={knockNow}
                            disabled={knockDisabled}
                            className="rounded-[1.35rem] px-4 py-4 text-sm font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lior-500/50"
                            style={{ background: 'rgba(255,255,255,0.42)', color: 'var(--color-text-primary)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.14)', opacity: knockDisabled ? 0.5 : 1 }}
                        >
                            {!connected ? 'Offline' : recording ? 'Recording...' : 'Knock now'}
                        </button>
                        <button
                            onClick={saveNightlight}
                            disabled={actionLocked}
                            className="rounded-[1.35rem] px-4 py-4 text-sm font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lior-500/50"
                            style={{ background: `linear-gradient(145deg, ${intent.color} 0%, ${intent.palette[1]} 100%)`, boxShadow: `0 18px 36px ${intent.color}22`, opacity: actionLocked ? 0.6 : 1 }}
                        >
                            {recording ? 'Finish recording' : sendLabel}
                        </button>
                    </div>
                </Glass>

                <div className="mt-4 text-center">
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {myTonight?.feltAt ? 'They felt tonight’s one.' : myTonight?.openedAt ? 'They opened tonight’s one.' : statusCopy}
                    </p>
                </div>
            </div>

            <AnimatePresence>
                {incoming && (
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 18 }}
                        className="fixed left-4 right-4 bottom-28 z-[60]"
                    >
                        <Glass className="px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${incoming.color}18`, color: incoming.color }}>
                                    {incoming.kind === 'left' ? <MoonStar size={18} /> : <Radio size={18} />}
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.24em] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                        {incoming.kind === 'left' ? 'Nightlight' : 'Soft knock'}
                                    </p>
                                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-primary)' }}>
                                        {incoming.senderName}: {incoming.note}
                                    </p>
                                </div>
                            </div>
                        </Glass>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

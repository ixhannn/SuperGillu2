import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    Archive,
    Camera,
    Image as ImageIcon,
    LockKeyhole,
    Mic,
    RotateCcw,
    StickyNote,
    Trash2,
    Upload,
    Video,
    X,
} from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { PinPad } from '../components/PinPad';
import { ConfirmModal } from '../components/ConfirmModal';
import { StorageService, storageEventTarget } from '../services/storage';
import { useLiorMedia } from '../hooks/useLiorImage';
import { PrivacyLock, PIN_LENGTH } from '../services/privacyLock';
import { feedback } from '../utils/feedback';
import { useTapOrigin } from '../hooks/useTapOrigin';
import { listRemoveExit } from '../utils/motion';
import { PrivateSpaceItem, PrivateSpaceItemKind, ViewState } from '../types';

interface PrivateSpaceProps {
    setView: (view: ViewState) => void;
}

type Filter = 'all' | PrivateSpaceItemKind;

const readFileAsDataUri = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const formatVaultDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const kindMeta: Record<PrivateSpaceItemKind, { label: string; singular: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
    photo: { label: 'Photos', singular: 'Photo', icon: ImageIcon },
    video: { label: 'Videos', singular: 'Video', icon: Video },
    audio: { label: 'Audio', singular: 'Audio', icon: Mic },
    note: { label: 'Notes', singular: 'Note', icon: StickyNote },
};

const NEU_BG = '#f1edf3';
const NEU_SURFACE = '#f6f2f8';
const NEU_ELEVATED = 'linear-gradient(145deg, #ffffff, #f4eff6)';
const NEU_INK = '#5a5266';
const NEU_INK_SOFT = '#867b94';
const NEU_LILAC = '#b8a4c8';

const neuBgStyle: React.CSSProperties = {
    background: NEU_BG,
    color: NEU_INK,
    marginTop: 'calc(0px - env(safe-area-inset-top, 0px))',
    paddingTop: 'env(safe-area-inset-top, 0px)',
};

const neuDotPattern: React.CSSProperties = {
    backgroundImage: 'radial-gradient(circle, rgba(142,120,162,0.18) 1px, transparent 1.2px)',
    backgroundSize: '14px 14px',
    backgroundPosition: '0 0',
};

const neuPanelStyle: React.CSSProperties = {
    background: NEU_SURFACE,
    borderRadius: '2rem',
    boxShadow: '18px 18px 40px rgba(174,154,194,0.22), -10px -10px 30px rgba(255,255,255,0.9)',
};

const neuRaisedStyle: React.CSSProperties = {
    background: NEU_ELEVATED,
    boxShadow: '8px 8px 20px rgba(174,154,194,0.22), -6px -6px 16px rgba(255,255,255,0.95), inset 1px 1px 2px rgba(255,255,255,0.9)',
};

const neuRaisedSoftStyle: React.CSSProperties = {
    background: NEU_ELEVATED,
    boxShadow: '5px 5px 14px rgba(174,154,194,0.18), -4px -4px 12px rgba(255,255,255,0.92), inset 1px 1px 2px rgba(255,255,255,0.85)',
};

const neuInsetStyle: React.CSSProperties = {
    background: '#eee9f1',
    boxShadow: 'inset 5px 5px 10px rgba(174,154,194,0.22), inset -4px -4px 10px rgba(255,255,255,0.92)',
};

const fieldStyle: React.CSSProperties = {
    background: '#f4eff6',
    border: 'none',
    boxShadow: 'inset 4px 4px 10px rgba(174,154,194,0.18), inset -3px -3px 8px rgba(255,255,255,0.9)',
};

const bottomNavClearanceStyle: React.CSSProperties = {
    paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 20px) + 8rem)',
};

const shelfPanelStyle: React.CSSProperties = neuPanelStyle;

const PrivateMediaPreview: React.FC<{ item: PrivateSpaceItem; mode?: 'card' | 'detail' }> = ({ item, mode = 'card' }) => {
    const isPhoto = item.kind === 'photo';
    const isVideo = item.kind === 'video';
    // Resolve photo/video through the shared warm-cache hook. The old manual
    // effect ran `setSrc(null)` on every `item` identity change and re-fetched a
    // fresh URL — so a private-space cache REBUILD (new item objects, same media:
    // cold mount / account switch) blanked and reloaded every thumbnail in the
    // vault at once. useLiorMedia seeds from its module cache, so unchanged media
    // re-paints from the first frame with no blank → no flash.
    const { src } = useLiorMedia(
        isPhoto ? item.imageId : isVideo ? item.videoId : undefined,
        isPhoto ? item.image : isVideo ? item.video : undefined,
        isPhoto ? item.storagePath : isVideo ? item.videoStoragePath : undefined,
    );
    const [audioSrc, setAudioSrc] = useState<string | null>(null);
    const isDetail = mode === 'detail';

    useEffect(() => {
        if (item.kind !== 'audio') return;
        let cancelled = false;
        setAudioSrc(null);
        StorageService.getPrivateSpaceAudio(item).then((value) => {
            if (!cancelled) setAudioSrc(value);
        });
        return () => { cancelled = true; };
    }, [item]);

    if (item.kind === 'photo' && src) {
        return <img src={src} alt={item.title || 'Private photo'} className="h-full w-full object-cover" loading="lazy" decoding="async" />;
    }

    if (item.kind === 'video' && src) {
        return (
            <video
                src={src}
                className="h-full w-full object-cover"
                controls={isDetail}
                muted={!isDetail}
                playsInline
            />
        );
    }

    if (item.kind === 'audio') {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-lior-200/35 blur-xl" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-white text-lior-500 shadow-soft">
                        <Mic size={24} />
                    </div>
                </div>
                {isDetail && audioSrc ? <audio src={audioSrc} controls className="w-full max-w-[18rem]" /> : (
                    <div className="flex gap-1.5">
                        {[16, 28, 22, 36, 24, 42, 18].map((height, index) => (
                            <span
                                key={index}
                                className="w-1.5 rounded-full bg-lior-300/75"
                                style={{ height }}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (item.kind === 'note') {
        return (
            <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-amber-50 to-rose-50 p-5">
                <StickyNote size={26} className="text-amber-500/80" />
                <p className="line-clamp-5 text-left font-serif text-[1.03rem] leading-snug text-gray-700">
                    {item.note || item.title || 'A private note'}
                </p>
            </div>
        );
    }

    const Icon = kindMeta[item.kind].icon;
    return (
        <div className="flex h-full w-full items-center justify-center bg-lior-50 text-lior-300">
            <Icon size={34} />
        </div>
    );
};

type LockMode = 'setup' | 'confirm' | 'enter';

export const PrivateSpace: React.FC<PrivateSpaceProps> = ({ setView }) => {
    const profile = StorageService.getCoupleProfile();
    const [locked, setLocked] = useState(() => !PrivacyLock.isSessionUnlocked());
    const [lockMode, setLockMode] = useState<LockMode>(() => (PrivacyLock.hasPin() ? 'enter' : 'setup'));
    const [pinEntry, setPinEntry] = useState('');
    const [firstPin, setFirstPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [pinShake, setPinShake] = useState(0);
    const [pinBusy, setPinBusy] = useState(false);
    const [lockoutMs, setLockoutMs] = useState(() => PrivacyLock.getLockoutRemainingMs());
    const [showPinReset, setShowPinReset] = useState(false);
    const [items, setItems] = useState<PrivateSpaceItem[]>(() => StorageService.getPrivateSpaceItems());
    const [filter, setFilter] = useState<Filter>('all');
    const [showComposer, setShowComposer] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [deleteCandidate, setDeleteCandidate] = useState<PrivateSpaceItem | null>(null);
    const [pendingDelete, setPendingDelete] = useState<PrivateSpaceItem | null>(null);
    const [kind, setKind] = useState<PrivateSpaceItemKind>('photo');
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const deleteTimerRef = useRef<number | null>(null);
    const pendingDeleteRef = useRef<PrivateSpaceItem | null>(null);

    // Reconcile the PIN across its three copies (localStorage cache, IndexedDB
    // mirror, synced couple profile) on mount AND whenever the couple profile
    // updates. Two cases this heals:
    //   • WebView eviction between launches — the sync localStorage check at
    //     mount misses a PIN the IndexedDB mirror still holds.
    //   • Full reinstall — the PIN arrives later from the cloud when
    //     couple_profile syncs down after login (fires a storage-update).
    // Once hydrate() restores it we flip the pad setup→enter so the user is
    // asked to ENTER their existing PIN, never to silently overwrite it.
    useEffect(() => {
        let cancelled = false;
        const reconcile = () => {
            void PrivacyLock.hydrate().then(() => {
                if (cancelled) return;
                if (PrivacyLock.hasPin()) {
                    setLockMode((mode) => (mode === 'setup' ? 'enter' : mode));
                    setLocked((wasLocked) => wasLocked && !PrivacyLock.isSessionUnlocked());
                    setFirstPin('');
                    setPinEntry('');
                }
            });
        };
        reconcile();
        const onStorage = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail || ['couple_profile', 'init'].includes(detail.table)) reconcile();
        };
        storageEventTarget.addEventListener('storage-update', onStorage);
        return () => {
            cancelled = true;
            storageEventTarget.removeEventListener('storage-update', onStorage);
        };
    }, []);

    // Re-lock the vault whenever the app is backgrounded, so returning to it always
    // requires the PIN. sessionStorage (the unlock token) survives a Capacitor
    // WebView background, so without this an open vault stays visible to whoever
    // reopens the phone. The 5-minute unlock TTL remains a secondary fallback.
    useEffect(() => {
        // hasPin() is checked at event time, not mount time: after a WebView
        // eviction the PIN is absent at mount and only restored by hydrate(),
        // so an early bail here would leave the re-lock disarmed for the session.
        const onVisibility = () => {
            if (document.hidden && PrivacyLock.hasPin()) {
                PrivacyLock.relock();
                setLocked(true);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);
    // Derive the open detail item from the live list so cache/storage refreshes
    // keep the modal in sync (and auto-close it if the item is removed) rather
    // than rendering a stale snapshot captured at tap time.
    const selected = useMemo(
        () => (selectedId ? items.find((i) => i.id === selectedId) ?? null : null),
        [items, selectedId],
    );
    // Grow the media-preview detail modal OUT OF the tapped grid card instead of
    // from screen centre — matches the route-open bloom feel.
    const { ref: detailRef, origin: detailOrigin } = useTapOrigin<HTMLDivElement>(!!selected);

    useEffect(() => {
        const onStorage = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail || ['private_space_items', 'init'].includes(detail.table)) {
                setItems(StorageService.getPrivateSpaceItems());
            }
        };
        storageEventTarget.addEventListener('storage-update', onStorage);
        return () => storageEventTarget.removeEventListener('storage-update', onStorage);
    }, []);

    const visibleItems = useMemo(() => (
        pendingDelete ? items.filter((item) => item.id !== pendingDelete.id) : items
    ), [items, pendingDelete]);

    const counts = useMemo(() => ({
        all: visibleItems.length,
        photo: visibleItems.filter((item) => item.kind === 'photo').length,
        video: visibleItems.filter((item) => item.kind === 'video').length,
        audio: visibleItems.filter((item) => item.kind === 'audio').length,
        note: visibleItems.filter((item) => item.kind === 'note').length,
    }), [visibleItems]);

    const filteredItems = useMemo(() => (
        filter === 'all' ? visibleItems : visibleItems.filter((item) => item.kind === filter)
    ), [filter, visibleItems]);

    const resetComposer = () => {
        setTitle('');
        setNote('');
        setPendingFile(null);
        setError('');
        setKind('photo');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const saveItem = async () => {
        const trimmedTitle = title.trim();
        const trimmedNote = note.trim();
        if (!trimmedTitle && !trimmedNote && !pendingFile) {
            setError('Add a title, note, or media before sealing this item.');
            return;
        }
        if (kind !== 'note' && !pendingFile) {
            setError(`Choose ${kind === 'audio' ? 'an audio clip' : kind === 'video' ? 'a video' : 'a photo'} to add.`);
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            const now = new Date().toISOString();
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const base: PrivateSpaceItem = {
                id,
                kind,
                title: trimmedTitle || (kind === 'note' ? 'Untitled note' : pendingFile?.name || 'Private item'),
                note: trimmedNote,
                addedBy: profile.myName || 'You',
                createdAt: now,
                updatedAt: now,
            };

            if (pendingFile && kind !== 'note') {
                const dataUri = await readFileAsDataUri(pendingFile);
                if (kind === 'photo') base.image = dataUri;
                if (kind === 'video') base.video = dataUri;
                if (kind === 'audio') base.audio = dataUri;
            }

            await StorageService.savePrivateSpaceItem(base);
            setItems(StorageService.getPrivateSpaceItems());
            setShowComposer(false);
            resetComposer();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Could not save this private item.');
        } finally {
            setIsSaving(false);
        }
    };

    const filters: Array<{ id: Filter; label: string; icon: React.ComponentType<{ size?: number }> }> = [
        { id: 'all', label: 'All', icon: Archive },
        { id: 'photo', label: 'Photos', icon: ImageIcon },
        { id: 'video', label: 'Videos', icon: Video },
        { id: 'audio', label: 'Audio', icon: Mic },
        { id: 'note', label: 'Notes', icon: StickyNote },
    ];

    const composerKinds: Array<{ kind: PrivateSpaceItemKind; label: string; icon: React.ComponentType<{ size?: number }> }> = [
        { kind: 'photo', label: 'Photo', icon: Camera },
        { kind: 'video', label: 'Video', icon: Video },
        { kind: 'audio', label: 'Voice', icon: Mic },
        { kind: 'note', label: 'Note', icon: StickyNote },
    ];

    const openComposer = () => {
        setKind('photo');
        setPendingFile(null);
        setError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowComposer(true);
    };

    const chooseComposerKind = (nextKind: PrivateSpaceItemKind) => {
        setKind(nextKind);
        setPendingFile(null);
        setError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    useEffect(() => {
        const handlePrivateAdd = () => openComposer();
        window.addEventListener('private-space:add', handlePrivateAdd);
        return () => window.removeEventListener('private-space:add', handlePrivateAdd);
    }, []);

    useEffect(() => () => {
        if (deleteTimerRef.current !== null) {
            window.clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = null;
            // Flush a confirmed-but-not-yet-persisted delete so navigating away
            // within the 6s undo window does not silently revert it.
            const pending = pendingDeleteRef.current;
            if (pending) {
                void StorageService.deletePrivateSpaceItem(pending.id);
                pendingDeleteRef.current = null;
            }
        }
    }, []);

    // Tick down the failed-attempt cooldown while the pad is locked out.
    useEffect(() => {
        if (!locked || lockoutMs <= 0) return;
        const interval = window.setInterval(() => {
            const remaining = PrivacyLock.getLockoutRemainingMs();
            setLockoutMs(remaining);
            if (remaining <= 0) setPinError('');
        }, 1000);
        return () => window.clearInterval(interval);
    }, [locked, lockoutMs > 0]);

    const failPinEntry = (message: string) => {
        feedback.error();
        setPinError(message);
        setPinShake((value) => value + 1);
        setPinEntry('');
    };

    const submitPin = async (pin: string) => {
        if (lockMode === 'setup') {
            setFirstPin(pin);
            setPinEntry('');
            setPinError('');
            setLockMode('confirm');
            return;
        }

        if (lockMode === 'confirm') {
            if (pin !== firstPin) {
                setFirstPin('');
                setLockMode('setup');
                failPinEntry("PINs didn't match — start again");
                return;
            }
            setPinBusy(true);
            try {
                await PrivacyLock.setPin(pin);
                feedback.celebrate();
                setPinEntry('');
                setPinError('');
                setLocked(false);
            } catch {
                failPinEntry("Couldn't save your PIN — try again");
            } finally {
                setPinBusy(false);
            }
            return;
        }

        setPinBusy(true);
        try {
            const result = await PrivacyLock.verifyPin(pin);
            if (result.ok) {
                feedback.tap();
                setPinEntry('');
                setPinError('');
                setLocked(false);
                return;
            }
            if (result.lockedForMs && result.lockedForMs > 0) {
                setLockoutMs(result.lockedForMs);
                failPinEntry('Too many tries');
                return;
            }
            const remaining = result.remainingAttempts ?? 0;
            failPinEntry(`Wrong PIN — ${remaining} ${remaining === 1 ? 'try' : 'tries'} left`);
        } finally {
            setPinBusy(false);
        }
    };

    const handlePinChange = (next: string) => {
        setPinEntry(next);
        if (pinError && lockoutMs <= 0) setPinError('');
        if (next.length === PIN_LENGTH) void submitPin(next);
    };

    const resetPin = () => {
        PrivacyLock.clearPin();
        setShowPinReset(false);
        setFirstPin('');
        setPinEntry('');
        setPinError('');
        setLockoutMs(0);
        setLockMode('setup');
    };

    const confirmDelete = () => {
        const item = deleteCandidate;
        if (!item) return;
        if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);

        setDeleteCandidate(null);
        setSelectedId(null);
        setPendingDelete(item);
        pendingDeleteRef.current = item;
        deleteTimerRef.current = window.setTimeout(() => {
            deleteTimerRef.current = null;
            pendingDeleteRef.current = null;
            StorageService.deletePrivateSpaceItem(item.id).then(() => {
                setItems(StorageService.getPrivateSpaceItems());
                setPendingDelete((current) => current?.id === item.id ? null : current);
            }).catch(() => {
                setPendingDelete(null);
                setItems(StorageService.getPrivateSpaceItems());
            });
        }, 6000);
    };

    const undoDelete = () => {
        if (deleteTimerRef.current !== null) {
            window.clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = null;
        }
        pendingDeleteRef.current = null;
        setPendingDelete(null);
    };

    if (locked) {
        const lockedOut = lockoutMs > 0;
        const lockCopy: Record<LockMode, { title: string; sub: string }> = {
            setup: { title: 'Create your PIN', sub: `Set your own ${PIN_LENGTH}-digit PIN. ${profile.partnerName || 'Your partner'} uses theirs — either one opens your shared shelf.` },
            confirm: { title: 'Confirm your PIN', sub: 'Type the same digits once more.' },
            enter: { title: 'Only you two.', sub: 'Enter your PIN to open the shelf.' },
        };

        return (
            <div className="relative min-h-[100dvh] overflow-hidden" style={neuBgStyle}>
                <div className="absolute inset-0 opacity-60" style={neuDotPattern} />
                <div className="absolute left-1/2 top-[26%] h-80 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(232,200,230,0.35),transparent_70%)] blur-2xl" />
                <ViewHeader title="Private Space" subtitle="locked" onBack={() => setView('home')} tone="romance" />

                <div className="relative z-10 flex min-h-[84vh] flex-col items-center justify-center px-6 pb-10">
                    <motion.div
                        initial={{ opacity: 0, y: 22 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                        className="flex w-full max-w-[22rem] flex-col items-center text-center"
                    >
                        <div className="relative mb-6 flex h-[4.6rem] w-[4.6rem] items-center justify-center rounded-full" style={neuRaisedStyle}>
                            <motion.span
                                className="pointer-events-none absolute inset-[-30%] rounded-full"
                                animate={{ opacity: [0.5, 0.8, 0.5], scale: [1, 1.06, 1] }}
                                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                                style={{
                                    background: 'radial-gradient(circle at 30% 30%, rgba(200,220,255,0.55), transparent 55%), radial-gradient(circle at 70% 70%, rgba(255,200,220,0.55), transparent 55%)',
                                    filter: 'blur(18px)',
                                }}
                            />
                            <LockKeyhole size={26} strokeWidth={1.7} style={{ color: NEU_LILAC }} />
                        </div>

                        <p className="text-[0.6rem] font-bold uppercase tracking-[0.26em]" style={{ color: NEU_INK_SOFT }}>
                            Private Space
                        </p>
                        <h1 className="mt-2 font-serif text-[1.85rem] font-bold leading-[1.05] tracking-[-0.04em]" style={{ color: NEU_INK }}>
                            {lockCopy[lockMode].title}
                        </h1>
                        <p className="mt-2 mb-8 max-w-[18rem] text-[0.84rem] leading-6" style={{ color: NEU_INK_SOFT }}>
                            {lockCopy[lockMode].sub}
                        </p>

                        <div className="w-full" style={{ color: NEU_LILAC }}>
                            <PinPad
                                value={pinEntry}
                                onChange={handlePinChange}
                                length={PIN_LENGTH}
                                disabled={pinBusy || lockedOut}
                                errorSignal={pinShake}
                                keyStyle={{ ...neuRaisedSoftStyle, color: NEU_INK }}
                                dotStyle={{ background: 'rgba(142,120,162,0.22)' }}
                                filledDotStyle={{ background: NEU_LILAC }}
                            />
                        </div>

                        <div className="mt-5 min-h-[1.4rem]" role="status" aria-live="polite">
                            {lockedOut ? (
                                <p className="text-[0.8rem] font-semibold" style={{ color: '#b8526b' }}>
                                    Too many tries — wait {Math.ceil(lockoutMs / 1000)}s
                                </p>
                            ) : pinError ? (
                                <p className="text-[0.8rem] font-semibold" style={{ color: '#b8526b' }}>{pinError}</p>
                            ) : null}
                        </div>

                        {lockMode === 'enter' && (
                            <button
                                onClick={() => setShowPinReset(true)}
                                className="mt-2 min-h-11 rounded-full px-4 text-[0.72rem] font-bold uppercase tracking-[0.18em] transition-transform active:scale-[0.97]"
                                style={{ color: NEU_INK_SOFT }}
                            >
                                Forgot PIN?
                            </button>
                        )}

                        <p className="mt-4 text-[0.68rem]" style={{ color: NEU_INK_SOFT }}>
                            Shared with {profile.partnerName || 'your partner'} · Re-locks after a few minutes away
                        </p>
                    </motion.div>
                </div>

                <ConfirmModal
                    isOpen={showPinReset}
                    title="Reset your PIN?"
                    message="This removes the current PIN so you can create a new one. Your sealed items stay safe."
                    confirmLabel="Reset PIN"
                    cancelLabel="Keep current PIN"
                    variant="danger"
                    onConfirm={resetPin}
                    onCancel={() => setShowPinReset(false)}
                />
            </div>
        );
    }

    return (
        <div className="relative min-h-[100dvh] overflow-hidden" style={neuBgStyle}>
            <div className="absolute inset-0 opacity-55" style={neuDotPattern} />
            <div className="absolute -left-24 top-40 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(220,200,240,0.38),transparent_70%)] blur-3xl" />
            <div className="absolute -right-20 top-[55%] h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(255,210,225,0.32),transparent_70%)] blur-3xl" />
            <ViewHeader title="Private Space" subtitle="shared vault" onBack={() => setView('home')} tone="romance" />

            <main className="relative z-10 px-5" style={bottomNavClearanceStyle}>
                <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                    className="relative mb-5 flex items-center justify-between gap-3 pt-1"
                >
                    <div>
                        <p className="inline-flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-[0.22em]" style={{ color: NEU_LILAC }}>
                            <LockKeyhole size={11} strokeWidth={2.4} />
                            Only you two
                        </p>
                        <h2 className="mt-1.5 font-serif text-[1.38rem] font-bold leading-[1.05] tracking-[-0.03em]" style={{ color: NEU_INK }}>
                            Private Space
                        </h2>
                        <p className="mt-1 max-w-[17rem] text-[0.74rem] leading-5" style={{ color: NEU_INK_SOFT }}>
                            Hidden from memories and recaps.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {counts.all > 0 && (
                            <div
                                className="rounded-full px-3.5 py-2 text-[0.66rem] font-bold"
                                style={{ ...neuRaisedSoftStyle, color: NEU_INK_SOFT }}
                            >
                                {counts.all} sealed
                            </div>
                        )}
                        <button
                            onClick={() => {
                                feedback.tap();
                                PrivacyLock.relock();
                                setPinEntry('');
                                setPinError('');
                                setLockMode(PrivacyLock.hasPin() ? 'enter' : 'setup');
                                setLocked(true);
                            }}
                            aria-label="Lock Private Space now"
                            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
                            style={{ ...neuRaisedSoftStyle, color: NEU_LILAC }}
                        >
                            <LockKeyhole size={17} strokeWidth={2.1} />
                        </button>
                    </div>
                </motion.section>

                {visibleItems.length > 0 && (
                    <div
                        className="mb-4 flex gap-1 overflow-x-auto rounded-full p-1.5"
                        style={neuInsetStyle}
                    >
                        {filters.filter((entry) => entry.id === 'all' || counts[entry.id] > 0).map((entry) => {
                            const active = filter === entry.id;
                            return (
                                <button
                                    key={entry.id}
                                    onClick={() => setFilter(entry.id)}
                                    className={cx(
                                        'flex min-h-[2.1rem] flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[0.72rem] font-bold transition-all',
                                    )}
                                    style={active ? {
                                        ...neuRaisedSoftStyle,
                                        color: NEU_INK,
                                    } : {
                                        background: 'transparent',
                                        color: NEU_INK_SOFT,
                                    }}
                                >
                                    {entry.label}
                                    {active && <span className="text-[0.62rem] opacity-70">· {counts[entry.id]}</span>}
                                </button>
                            );
                        })}
                    </div>
                )}

                {filteredItems.length === 0 ? (
                    <div
                        className="flex min-h-[19rem] flex-col items-center justify-center rounded-[2rem] p-8 text-center"
                        style={neuPanelStyle}
                    >
                        <div className="relative mb-5">
                            <motion.span
                                className="pointer-events-none absolute inset-[-40%] rounded-full"
                                animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.08, 1] }}
                                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                                style={{
                                    background: 'radial-gradient(circle at 30% 30%, rgba(200,220,255,0.45), transparent 55%), radial-gradient(circle at 70% 70%, rgba(255,200,220,0.45), transparent 55%)',
                                    filter: 'blur(14px)',
                                }}
                            />
                            <div
                                className="relative flex h-16 w-16 items-center justify-center rounded-full"
                                style={neuRaisedStyle}
                            >
                                <LockKeyhole size={24} strokeWidth={1.8} style={{ color: NEU_LILAC }} />
                            </div>
                        </div>
                        <h3 className="font-serif text-[1.32rem] font-bold leading-tight tracking-[-0.02em]" style={{ color: NEU_INK }}>
                            Nothing sealed yet
                        </h3>
                        <p className="mt-2 max-w-[18rem] text-[0.82rem] leading-5" style={{ color: NEU_INK_SOFT }}>
                            Anything you add lives only here — no feeds, no recaps.
                        </p>
                        <button
                            onClick={openComposer}
                            className="mt-6 flex min-h-[2.9rem] items-center gap-2 rounded-full px-5 text-[0.8rem] font-bold transition-transform active:scale-[0.97]"
                            style={{ ...neuRaisedStyle, color: NEU_INK }}
                        >
                            <LockKeyhole size={14} style={{ color: NEU_LILAC }} />
                            Seal your first item
                        </button>
                    </div>
                ) : (
                    <motion.div className="grid grid-cols-2 gap-3">
                        <AnimatePresence mode="popLayout" initial={false}>
                        {filteredItems.map((item, index) => {
                            const isPhoto = item.kind === 'photo';
                            const isVideo = item.kind === 'video';
                            const isAudio = item.kind === 'audio';
                            const isNote = item.kind === 'note';
                            const isMedia = isPhoto || isVideo;
                            const isHero = filter === 'all' && index === 0 && filteredItems.length >= 3;
                            return (
                                <motion.button
                                    key={item.id}
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={listRemoveExit}
                                    transition={{ type: 'spring', stiffness: 300, damping: 26, delay: Math.min(index * 0.025, 0.18) }}
                                    whileTap={{ scale: 0.965 }}
                                    onClick={() => setSelectedId(item.id)}
                                    className={cx(
                                        'perf-card-shell',
                                        'group relative overflow-hidden rounded-[1.6rem] text-left',
                                        isHero ? 'col-span-2 aspect-[2.08]' : 'aspect-square'
                                    )}
                                    style={neuRaisedStyle}
                                >
                                    {isMedia && (
                                        <>
                                            <div className="absolute inset-0">
                                                <PrivateMediaPreview item={item} />
                                            </div>
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/62 via-black/22 to-transparent" />
                                            <div className="absolute inset-x-0 bottom-0 p-3">
                                                <p className="line-clamp-1 text-[0.8rem] font-semibold text-white drop-shadow-sm">{item.title}</p>
                                                <p className="mt-0.5 text-[0.6rem] font-medium uppercase tracking-[0.1em] text-white/75">
                                                    {formatVaultDate(item.createdAt)}
                                                </p>
                                            </div>
                                            {isVideo && (
                                                <div className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/38 text-white backdrop-blur-sm">
                                                    <Video size={13} strokeWidth={2.3} />
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {isNote && (
                                        <div className="flex h-full flex-col justify-between p-4">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full" style={neuRaisedSoftStyle}>
                                                <StickyNote size={14} strokeWidth={2} style={{ color: NEU_LILAC }} />
                                            </div>
                                            <p className="line-clamp-4 font-serif text-[0.92rem] leading-snug" style={{ color: NEU_INK }}>
                                                {item.note || item.title}
                                            </p>
                                            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em]" style={{ color: NEU_INK_SOFT }}>
                                                {formatVaultDate(item.createdAt)}
                                            </p>
                                        </div>
                                    )}

                                    {isAudio && (
                                        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                                            <div className="relative">
                                                <div className="pointer-events-none absolute inset-[-38%] rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(200,220,255,0.5), transparent 55%), radial-gradient(circle at 70% 70%, rgba(255,200,220,0.5), transparent 55%)', filter: 'blur(14px)' }} />
                                                <div
                                                    className="relative flex h-14 w-14 items-center justify-center rounded-full"
                                                    style={neuRaisedStyle}
                                                >
                                                    <Mic size={22} strokeWidth={1.8} style={{ color: NEU_LILAC }} />
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                {[14, 22, 18, 28, 20, 26, 16].map((height, barIndex) => (
                                                    <span key={barIndex} className="w-1 rounded-full" style={{ height, background: NEU_LILAC, opacity: 0.55 }} />
                                                ))}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="line-clamp-1 text-[0.82rem] font-semibold" style={{ color: NEU_INK }}>{item.title}</p>
                                                <p className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em]" style={{ color: NEU_INK_SOFT }}>
                                                    Voice · {formatVaultDate(item.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </motion.button>
                            );
                        })}
                        </AnimatePresence>
                    </motion.div>
                )}
            </main>

            <AnimatePresence>
                {showComposer && (
                    <motion.div
                        key="private-space-composer"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-end bg-[rgba(60,48,76,0.26)] p-3 backdrop-blur-xl"
                        onClick={() => { setShowComposer(false); resetComposer(); }}
                    >
                        <motion.div
                            initial={{ y: 54, opacity: 0, scale: 0.985 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 44, opacity: 0, scale: 0.99 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 27 }}
                            className="max-h-[88vh] w-full overflow-y-auto rounded-[2rem] p-5"
                            style={{
                                background: NEU_BG,
                                boxShadow: '0 -22px 54px rgba(174,154,194,0.26)',
                            }}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="mb-5 flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.22em]" style={{ color: NEU_LILAC }}>Private shelf</p>
                                    <h3 className="mt-1 font-serif text-[1.72rem] font-bold tracking-[-0.035em]" style={{ color: NEU_INK }}>Add private item</h3>
                                </div>
                                <button
                                    onClick={() => { setShowComposer(false); resetComposer(); }}
                                    className="flex h-11 w-11 items-center justify-center rounded-full"
                                    style={{ ...neuRaisedSoftStyle, color: NEU_INK_SOFT }}
                                    aria-label="Close composer"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="mb-5 grid grid-cols-4 gap-2.5">
                                {composerKinds.map((entry) => {
                                    const Icon = entry.icon;
                                    const active = kind === entry.kind;
                                    return (
                                        <button
                                            key={entry.kind}
                                            onClick={() => chooseComposerKind(entry.kind)}
                                            className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-[1.25rem] text-[0.68rem] font-bold transition-transform active:scale-95"
                                            style={active ? {
                                                ...neuInsetStyle,
                                                color: NEU_INK,
                                            } : {
                                                ...neuRaisedSoftStyle,
                                                color: NEU_INK_SOFT,
                                            }}
                                        >
                                            <Icon size={20} />
                                            {entry.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {kind !== 'note' && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mb-4 flex min-h-[5.2rem] w-full items-center justify-between rounded-[1.4rem] px-4 text-left"
                                    style={neuRaisedSoftStyle}
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-full" style={neuInsetStyle}>
                                            {kind === 'photo' ? <Camera size={20} style={{ color: NEU_LILAC }} /> : kind === 'video' ? <Video size={20} style={{ color: NEU_LILAC }} /> : <Mic size={20} style={{ color: NEU_LILAC }} />}
                                        </span>
                                        <span>
                                            <span className="block text-sm font-bold" style={{ color: NEU_INK }}>{pendingFile ? pendingFile.name : `Choose ${kind}`}</span>
                                            <span className="mt-1 block text-xs" style={{ color: NEU_INK_SOFT }}>Kept out of memories and recaps</span>
                                        </span>
                                    </span>
                                    <Upload size={20} style={{ color: NEU_LILAC }} />
                                </button>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept={kind === 'photo' ? 'image/*' : kind === 'video' ? 'video/*' : 'audio/*'}
                                onChange={(event) => setPendingFile(event.target.files?.[0] || null)}
                            />

                            <label className="mb-3 block">
                                <span className="mb-2 block text-[0.64rem] font-bold uppercase tracking-[0.2em]" style={{ color: NEU_LILAC }}>Title</span>
                                <input
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    placeholder="Name this private item"
                                    inputMode="text"
                                    enterKeyHint="next"
                                    autoCapitalize="sentences"
                                    autoCorrect="on"
                                    className="min-h-[3.3rem] w-full rounded-[1.15rem] px-4 text-[1rem] font-semibold outline-none"
                                    style={{ ...fieldStyle, color: NEU_INK }}
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-[0.64rem] font-bold uppercase tracking-[0.2em]" style={{ color: NEU_LILAC }}>
                                    {kind === 'note' ? 'Note' : 'Caption'}
                                </span>
                                <textarea
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    placeholder={kind === 'note' ? 'Write what only you two should see...' : 'Add context, a secret, or a memory cue...'}
                                    rows={4}
                                    inputMode="text"
                                    enterKeyHint="done"
                                    autoCapitalize="sentences"
                                    autoCorrect="on"
                                    spellCheck
                                    className="w-full resize-none rounded-[1.15rem] px-4 py-3 text-[16px] leading-6 outline-none"
                                    style={{ ...fieldStyle, color: NEU_INK }}
                                />
                            </label>

                            {error && <p className="mt-3 rounded-[1rem] px-4 py-3 text-sm font-semibold" style={{ ...neuInsetStyle, color: '#b8526b' }}>{error}</p>}

                            <button
                                onClick={saveItem}
                                disabled={isSaving}
                                className="mt-6 flex min-h-[3.6rem] w-full items-center justify-center gap-2.5 rounded-full text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-55"
                                style={{ ...neuRaisedStyle, color: NEU_INK }}
                            >
                                <LockKeyhole size={18} style={{ color: NEU_LILAC }} />
                                {isSaving ? 'Sealing...' : 'Seal into Private Space'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}

                {selected && (
                    <motion.div
                        key={`private-space-selected-${selected.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgba(60,48,76,0.32)] p-4 backdrop-blur-xl"
                        onClick={() => setSelectedId(null)}
                    >
                        <motion.div
                            ref={detailRef}
                            initial={{ y: 20, opacity: 0, scale: 0.88 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 16, opacity: 0, scale: 0.985 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem]"
                            style={{ background: NEU_BG, boxShadow: '0 24px 60px rgba(174,154,194,0.30)', transformOrigin: detailOrigin }}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="relative aspect-square max-h-[52vh]" style={{ background: '#ece6f0' }}>
                                <PrivateMediaPreview item={selected} mode="detail" />
                                <button
                                    onClick={() => setSelectedId(null)}
                                    className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md"
                                    style={{
                                        background: 'rgba(255,255,255,0.72)',
                                        boxShadow: '4px 4px 10px rgba(174,154,194,0.25), -2px -2px 8px rgba(255,255,255,0.85)',
                                        color: NEU_INK,
                                    }}
                                    aria-label="Close item"
                                >
                                    <X size={19} />
                                </button>
                            </div>
                            <div className="p-5">
                                <p className="text-[0.6rem] font-bold uppercase tracking-[0.22em]" style={{ color: NEU_LILAC }}>{kindMeta[selected.kind].label}</p>
                                <h3 className="mt-1 font-serif text-[1.65rem] font-bold leading-tight tracking-[-0.035em]" style={{ color: NEU_INK }}>{selected.title}</h3>
                                {selected.note && <p className="mt-3 whitespace-pre-wrap text-[0.95rem] leading-6" style={{ color: NEU_INK_SOFT }}>{selected.note}</p>}
                                <div className="mt-4 flex items-center gap-2 rounded-full px-3.5 py-2" style={neuInsetStyle}>
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[0.58rem] font-bold" style={{ ...neuRaisedSoftStyle, color: NEU_LILAC }}>
                                        {(selected.addedBy || 'Y').charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-[0.7rem] font-semibold" style={{ color: NEU_INK_SOFT }}>
                                        {selected.addedBy} · {formatVaultDate(selected.createdAt)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setDeleteCandidate(selected)}
                                    className="mt-5 flex min-h-[3.2rem] w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition-transform active:scale-[0.98]"
                                    style={{ ...neuRaisedSoftStyle, color: '#b8526b' }}
                                >
                                    <Trash2 size={17} />
                                    Delete from Private Space
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {deleteCandidate && (
                    <motion.div
                        key={`private-space-delete-${deleteCandidate.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-end bg-[rgba(60,48,76,0.28)] p-3 backdrop-blur-xl"
                        onClick={() => setDeleteCandidate(null)}
                    >
                        <motion.div
                            initial={{ y: 36, opacity: 0, scale: 0.985 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 28, opacity: 0, scale: 0.99 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 27 }}
                            className="w-full rounded-[2rem] p-5"
                            style={{ background: NEU_BG, boxShadow: '0 -22px 54px rgba(174,154,194,0.26)' }}
                            onClick={(event) => event.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="delete-private-item-title"
                        >
                            <div className="mb-4 flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={neuRaisedSoftStyle}>
                                    <AlertTriangle size={20} style={{ color: '#c46a7e' }} />
                                </div>
                                <div>
                                    <h3 id="delete-private-item-title" className="font-serif text-[1.4rem] font-bold leading-tight" style={{ color: NEU_INK }}>
                                        Delete this private item?
                                    </h3>
                                    <p className="mt-2 text-[0.84rem] leading-5" style={{ color: NEU_INK_SOFT }}>
                                        It disappears from the shelf now. You have a few seconds to undo.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => setDeleteCandidate(null)}
                                    className="min-h-[3rem] flex-1 rounded-full text-sm font-bold transition-transform active:scale-[0.98]"
                                    style={{ ...neuRaisedSoftStyle, color: NEU_INK_SOFT }}
                                >
                                    Keep it
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="min-h-[3rem] flex-1 rounded-full text-sm font-bold transition-transform active:scale-[0.98]"
                                    style={{ ...neuRaisedStyle, color: '#b8526b' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {pendingDelete && (
                    <motion.div
                        key={`private-space-undo-${pendingDelete.id}`}
                        initial={{ y: 26, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 18, opacity: 0, scale: 0.98 }}
                        className="fixed left-4 right-4 z-[82] mx-auto flex max-w-md items-center justify-between gap-3 rounded-full p-2.5 pl-4"
                        style={{
                            bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 20px) + 5.85rem)',
                            ...neuRaisedStyle,
                        }}
                    >
                        <span className="min-w-0 truncate text-sm font-semibold" style={{ color: NEU_INK }}>
                            Removed {pendingDelete.title}
                        </span>
                        <button
                            onClick={undoDelete}
                            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-transform active:scale-[0.98]"
                            style={{ ...neuInsetStyle, color: NEU_LILAC }}
                        >
                            <RotateCcw size={15} />
                            Undo
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

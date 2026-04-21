import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Heart, Save, Palette, Check, Download, Upload, Database, ShieldCheck, HardDrive, LogOut, Music, Trash2, AlertCircle, Users, Volume2, VolumeX, Vibrate, Zap, Sparkles, Mic, Gift, Lock } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { SectionDivider } from './Home';
import { ViewState, CoupleProfile } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { ThemeService, THEMES, ThemeId } from '../services/theme';
import { SupabaseService } from '../services/supabase';
import { Haptics } from '../services/haptics';
import { Audio } from '../services/audio';
import { formatBytes } from '../shared/mediaPolicy.js';
import { InternalAdminService } from '../services/internalAdmin';

interface ProfileProps {
    setView: (view: ViewState) => void;
}

const THEME_DESCRIPTIONS: Record<ThemeId, string> = {
    rose: 'Classic romance',
    'baby-pink': 'Soft romantic',
    'warm-beige': 'Cozy warmth',
    teal: 'Fresh calm',
    ocean: 'Serene blue',
    rosewood: 'Deep romance',
    sunset: 'Golden hour',
    lavender: 'Dreamy violet',
    'starry-night': 'Under the stars',
};

const FROSTED_PANEL_STYLE: React.CSSProperties = {
    background: 'var(--theme-surface-glass)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1.5px solid var(--theme-border-crisp)',
    boxShadow: 'var(--shadow-sm)',
};

const APPLE_GLASS_STYLE: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.45)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.55)',
    boxShadow: '0 2px 20px rgba(0, 0, 0, 0.05), 0 0.5px 1px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
};

const REQUIRED_CORE_BACKUP_KEYS = [
    'memories',
    'notes',
    'dates',
    'envelopes',
    'dailyPhotos',
    'dinnerOptions',
    'keepsakes',
    'profile',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isValidDateString = (value: unknown) => (
    typeof value === 'string' && !Number.isNaN(Date.parse(value))
);

const isValidProfileBackup = (value: unknown): value is CoupleProfile => {
    if (!isRecord(value)) return false;
    if (typeof value.myName !== 'string' || typeof value.partnerName !== 'string' || typeof value.anniversaryDate !== 'string') return false;
    if (value.anniversaryDate && !isValidDateString(value.anniversaryDate)) return false;
    if ('photo' in value && value.photo != null && typeof value.photo !== 'string') return false;
    if ('theme' in value && value.theme != null && typeof value.theme !== 'string') return false;
    if ('isPremium' in value && value.isPremium != null && typeof value.isPremium !== 'boolean') return false;
    if ('coupleId' in value && value.coupleId != null && typeof value.coupleId !== 'string') return false;
    if ('partnerUserId' in value && value.partnerUserId != null && typeof value.partnerUserId !== 'string') return false;
    if ('missedAuras' in value && value.missedAuras != null && !Array.isArray(value.missedAuras)) return false;
    if ('presenceTraces' in value && value.presenceTraces != null && !Array.isArray(value.presenceTraces)) return false;
    if ('nightlights' in value && value.nightlights != null && !Array.isArray(value.nightlights)) return false;
    if ('questions' in value && value.questions != null && !Array.isArray(value.questions)) return false;
    if ('bonsaiState' in value && value.bonsaiState != null && !isRecord(value.bonsaiState)) return false;
    if ('streakData' in value && value.streakData != null) {
        if (!isRecord(value.streakData)) return false;
        if (!isRecord(value.streakData.checkIns)) return false;
        if (typeof value.streakData.count !== 'number' || typeof value.streakData.lastMutualDate !== 'string' || typeof value.streakData.bestStreak !== 'number') return false;
        if ('lastBrokenCount' in value.streakData && value.streakData.lastBrokenCount != null && typeof value.streakData.lastBrokenCount !== 'number') return false;
        if ('lastBrokenDate' in value.streakData && value.streakData.lastBrokenDate != null && typeof value.streakData.lastBrokenDate !== 'string') return false;
    }
    return true;
};

const isValidStatusBackup = (value: unknown) => (
    isRecord(value)
    && (value.state === 'awake' || value.state === 'sleeping')
    && (value.timestamp === '' || isValidDateString(value.timestamp))
);

const isValidPetBackup = (value: unknown) => (
    isRecord(value)
    && typeof value.name === 'string'
    && (value.type === 'dog' || value.type === 'cat' || value.type === 'bunny' || value.type === 'bear')
    && isValidDateString(value.lastFed)
    && isValidDateString(value.lastPetted)
    && typeof value.happiness === 'number'
    && typeof value.xp === 'number'
    && typeof value.careStreak === 'number'
    && typeof value.presenceStreak === 'number'
    && typeof value.bondMoments === 'number'
    && typeof value.coins === 'number'
    && Array.isArray(value.inventory)
    && isRecord(value.equipped)
    && (!('hat' in value.equipped) || value.equipped.hat == null || typeof value.equipped.hat === 'string')
    && (!('accessory' in value.equipped) || value.equipped.accessory == null || typeof value.equipped.accessory === 'string')
    && (!('environment' in value.equipped) || value.equipped.environment == null || typeof value.equipped.environment === 'string')
);

const isValidTogetherMusicBackup = (value: unknown) => {
    if (value === null) return true;
    if (!isRecord(value) || typeof value.base64 !== 'string') return false;
    if (!('meta' in value) || value.meta == null) return true;
    return isRecord(value.meta)
        && typeof value.meta.name === 'string'
        && isValidDateString(value.meta.date)
        && typeof value.meta.size === 'number'
        && (!('mimeType' in value.meta) || value.meta.mimeType == null || typeof value.meta.mimeType === 'string')
        && (!('ownerUserId' in value.meta) || value.meta.ownerUserId == null || typeof value.meta.ownerUserId === 'string');
};

const isFullBackupPayload = (value: unknown): value is Record<string, unknown> => {
    if (!isRecord(value)) return false;
    if (!REQUIRED_CORE_BACKUP_KEYS.every((key) => key in value)) return false;

    return Array.isArray(value.memories)
        && Array.isArray(value.notes)
        && Array.isArray(value.dates)
        && Array.isArray(value.envelopes)
        && Array.isArray(value.dailyPhotos)
        && Array.isArray(value.dinnerOptions)
        && Array.isArray(value.keepsakes)
        && isValidProfileBackup(value.profile)
        && (!('pet' in value) || isValidPetBackup(value.pet))
        && (!('userStatus' in value) || isValidStatusBackup(value.userStatus))
        && (!('partnerStatus' in value) || isValidStatusBackup(value.partnerStatus))
        && (!('comments' in value) || Array.isArray(value.comments))
        && (!('moodEntries' in value) || Array.isArray(value.moodEntries))
        && (!('togetherMusic' in value) || isValidTogetherMusicBackup(value.togetherMusic));
};

const normalizeBackupPayload = async (value: Record<string, unknown>) => {
    const currentTogetherMusicSource = await StorageService.getStoredTogetherMusicSource();
    const currentTogetherMusic = currentTogetherMusicSource ? {
        base64: currentTogetherMusicSource,
        meta: StorageService.getTogetherMusicMetadata(),
    } : null;
    const restoredTogetherMusic = 'togetherMusic' in value
        ? (isRecord(value.togetherMusic) && typeof value.togetherMusic.base64 === 'string'
            ? {
                base64: value.togetherMusic.base64,
                meta: value.togetherMusic.meta ?? {
                    name: 'Restored shared song',
                    date: new Date().toISOString(),
                    size: 0,
                },
            }
            : value.togetherMusic)
        : currentTogetherMusic;

    return {
        ...value,
        pet: 'pet' in value ? value.pet : StorageService.getPetStats(),
        userStatus: 'userStatus' in value ? value.userStatus : StorageService.getStatus(),
        partnerStatus: 'partnerStatus' in value ? value.partnerStatus : StorageService.getPartnerStatus(),
        comments: Array.isArray(value.comments) ? value.comments : StorageService.getComments(),
        moodEntries: Array.isArray(value.moodEntries) ? value.moodEntries : StorageService.getMoodEntries(),
        togetherMusic: restoredTogetherMusic,
    };
};

export const Profile: React.FC<ProfileProps> = ({ setView }) => {
    const [profile, setProfile] = useState<CoupleProfile>({
        myName: '',
        partnerName: '',
        anniversaryDate: new Date().toISOString(),
        theme: 'rose'
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [hapticsOn, setHapticsOn] = useState(Haptics.isEnabled());
    const [audioOn, setAudioOn] = useState(Audio.isEnabled());
    const [showIdentityModal, setShowIdentityModal] = useState(false);
    const [storageInfo, setStorageInfo] = useState<{ used: string, type: string }>({ used: '0 KB', type: 'Checking...' });
    const [managedStats, setManagedStats] = useState(StorageService.getManagedStorageStats());
    const [isInternalAdmin, setIsInternalAdmin] = useState(false);
    const [musicMeta, setMusicMeta] = useState<{ name: string } | null>(null);
    const [musicError, setMusicError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const backupInputRef = useRef<HTMLInputElement>(null);
    const musicInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const refreshStorageStats = () => {
            setManagedStats(StorageService.getManagedStorageStats());
        };
        InternalAdminService.isAllowed().then(setIsInternalAdmin).catch(() => setIsInternalAdmin(false));
        const data = StorageService.getCoupleProfile();
        setProfile(data);

        // Get Storage Stats
        StorageService.getStorageUsage().then(est => {
            if (est && est.usage) {
                const mb = (est.usage / (1024 * 1024)).toFixed(2);
                setStorageInfo({
                    used: `${mb} MB`,
                    type: StorageService.isPersisted ? 'Persistent (Safe)' : 'Standard (Volatile)'
                });
            } else {
                setStorageInfo({ used: 'Unknown', type: 'Standard' });
            }
        });

        const meta = StorageService.getTogetherMusicMetadata();
        setMusicMeta(meta);

        const handleStorageUpdate = () => refreshStorageStats();
        storageEventTarget.addEventListener('storage-update', handleStorageUpdate);
        refreshStorageStats();

        return () => {
            storageEventTarget.removeEventListener('storage-update', handleStorageUpdate);
            ThemeService.cleanup();
        };
    }, []);

    const handleChange = (field: keyof CoupleProfile, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    const handleThemeChange = (themeId: ThemeId, target?: HTMLElement | null) => {
        handleChange('theme', themeId);
        const rect = target?.getBoundingClientRect();
        ThemeService.applyTheme(themeId, rect ? {
            origin: {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            },
        } : undefined);
        Haptics.select();
        Audio.play('select');
    };

    const handleToggleHaptics = () => {
        const next = !hapticsOn;
        Haptics.setEnabled(next);
        setHapticsOn(next);
        if (next) { Haptics.success(); Audio.play('toggleOn'); }
        else { Audio.play('toggleOff'); }
    };

    const handleToggleAudio = () => {
        const next = !audioOn;
        Audio.setEnabled(next);
        setAudioOn(next);
        if (next) { Haptics.toggleOn(); Audio.play('toggleOn'); }
        else { Haptics.toggleOff(); Audio.play('toggleOff'); }
    };

    const currentThemeId = profile.theme || 'rose';
    const activeThemeId = (currentThemeId in THEMES ? currentThemeId : 'rose') as ThemeId;
    const activeTheme = THEMES[activeThemeId];

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const size = 500;
                    canvas.width = size;
                    canvas.height = size;

                    // Smart Center Crop
                    let sx = 0, sy = 0, sw = img.width, sh = img.height;
                    if (img.width > img.height) {
                        sw = img.height;
                        sx = (img.width - img.height) / 2;
                    } else {
                        sh = img.width;
                        sy = (img.height - img.width) / 2;
                    }

                    ctx?.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    setProfile(prev => ({ ...prev, photo: dataUrl }));
                };
                img.onerror = () => {
                    alert("We couldn't open that photo. Choose a JPG, PNG, or WebP image.");
                };
            };
            reader.onerror = () => {
                alert("We couldn't read that file. Try a different photo.");
            };
            reader.readAsDataURL(file);
        }
    };

    const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setMusicError(null);

        if (file) {
            try {
                if (!file.type.startsWith('audio/')) {
                    setMusicError("Choose an audio file for your shared song.");
                    return;
                }

                // STRICT LIMIT: 10MB to match storage service limit
                if (file.size > 10 * 1024 * 1024) {
                    setMusicError("This audio file is too large. Choose one under 10 MB.");
                    return;
                }

                await StorageService.saveTogetherMusic(file);
                setMusicMeta({ name: file.name });
                alert("Your shared song is ready. It will play the next time you're both online.");
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "We couldn't upload that song. Please try again.";
                setMusicError(message);
            } finally {
                if (musicInputRef.current) musicInputRef.current.value = '';
            }
        }
    };

    const handleRemoveMusic = async () => {
        if (confirm("Remove your shared song? Lior will go back to the default theme music.")) {
            try {
                await StorageService.deleteTogetherMusic();
                setMusicMeta(null);
                setMusicError(null);
            } catch (error) {
                console.error(error);
                setMusicError("We couldn't remove your shared song. Please try again.");
            }
        }
    };

    const save = () => {
        setIsSaving(true);
        Haptics.success();
        Audio.play('confirm');
        StorageService.saveCoupleProfile(profile);
        setTimeout(() => {
            setIsSaving(false);
            setView('home');
        }, 600);
    };

    const handleSwitchIdentityClick = () => {
        setShowIdentityModal(true);
    };

    const handleIdentitySelect = (selectedName: string) => {
        const partner = selectedName === 'Tulika' ? 'Ishan' : 'Tulika';
        const newProfile = {
            ...profile,
            myName: selectedName,
            partnerName: partner
        };
        StorageService.saveCoupleProfile(newProfile);
        window.location.reload();
    };

    const handleSignOut = async () => {
        if (confirm("Sign out on this device? You can sign back in anytime.")) {
            try {
                if (SupabaseService.client) {
                    const { error } = await SupabaseService.client.auth.signOut();
                    if (error) {
                        alert("We couldn't sign you out right now. Please try again.");
                        return;
                    }
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                alert("We couldn't sign you out right now. Please try again.");
            }
        }
    };

    const handleDownloadBackup = async () => {
        setIsBackingUp(true);
        try {
            const data = await StorageService.exportAllData();
            const jsonStr = JSON.stringify(data);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lior_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert("We couldn't create your backup file. Try again in a moment.");
        }
        setIsBackingUp(false);
    };

    const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data: unknown = JSON.parse(ev.target?.result as string);
                if (!isFullBackupPayload(data)) {
                    alert("That backup file is incomplete. Choose a full Lior backup file.");
                    return;
                }
                const normalizedData = await normalizeBackupPayload(data);
                if (confirm("Restore this backup? Any data included in this file will replace the matching data on this device. Shared song settings only change if this backup includes one.")) {
                    const success = await StorageService.importData(normalizedData);
                    if (success) {
                        alert("Backup restored. Your saved memories and profile details are ready.");
                        setProfile(StorageService.getCoupleProfile()); // Refresh local state
                        setMusicMeta(StorageService.getTogetherMusicMetadata());
                    } else {
                        alert("We couldn't find anything new to restore from that backup.");
                    }
                }
            } catch (e) {
                alert("That backup file couldn't be read. Choose a Lior backup JSON file.");
            }
        };
        reader.readAsText(file);
    };

    // ── Toggle row component (reused for haptics + sound) ──────────────────────
    const ToggleRow = ({
        icon, label, description, on, onToggle, noBorder,
    }: { icon: React.ReactNode; label: string; description: string; on: boolean; onToggle: () => void; noBorder?: boolean }) => (
        <div
            className="flex items-center justify-between py-4"
            style={noBorder ? {} : { borderBottom: '1px solid rgba(0,0,0,0.05)' }}
        >
            <div className="flex items-center gap-3">
                <div
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                        background: on
                            ? `linear-gradient(135deg, ${activeTheme.palette[400]}, ${activeTheme.palette[600]})`
                            : `${activeTheme.palette[100]}`,
                        border: on ? 'none' : `1px solid ${activeTheme.palette[200]}80`,
                        boxShadow: on ? `0 4px 14px ${activeTheme.palette[500]}35` : 'none',
                    }}
                >
                    <span style={{ color: on ? '#fff' : activeTheme.palette[500] }}>{icon}</span>
                </div>
                <div>
                    <p className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
                    <p className="text-[11px] mt-0.5 leading-snug font-medium" style={{ color: 'var(--color-text-primary)', opacity: 0.35 }}>{description}</p>
                </div>
            </div>
            <button
                onClick={onToggle}
                className="relative flex-shrink-0 transition-all duration-300 spring-press outline-none"
                style={{
                    width: 48, height: 28, borderRadius: 100,
                    background: on
                        ? `linear-gradient(135deg, ${activeTheme.palette[400]}, ${activeTheme.palette[600]})`
                        : 'rgba(0,0,0,0.08)',
                    boxShadow: on ? `0 4px 12px ${activeTheme.palette[500]}40` : 'none',
                }}
                aria-pressed={on}
                aria-label={`${label}: ${on ? 'On' : 'Off'}`}
            >
                <span
                    className="absolute rounded-full transition-all duration-300"
                    style={{
                        width: 22, height: 22, top: 3,
                        left: on ? 23 : 3,
                        background: '#fff',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                    }}
                />
            </button>
        </div>
    );

    return (
        <div className="flex flex-col h-full min-h-screen">
            <ViewHeader
                title="Profile"
                onBack={() => setView('home')}
                variant="centered"
                rightSlot={
                    <button
                        onClick={save}
                        disabled={isSaving}
                        className="px-5 py-2.5 rounded-full text-[13px] font-bold flex items-center gap-2 transition-all text-white tracking-[-0.01em]"
                        style={{
                            background: `linear-gradient(135deg, var(--color-nav-active), ${activeTheme.palette[600]})`,
                            opacity: isSaving ? 0.7 : 1,
                            boxShadow: `0 4px 14px ${activeTheme.palette[400]}44, 0 1px 2px rgba(0,0,0,0.1)`,
                        }}
                    >
                        {isSaving ? <><Save size={14} className="animate-spin" /> Saving…</> : 'Save'}
                    </button>
                }
            />

            <div className="view-container space-y-6 pb-24 pt-2">

                {/* ── PROFILE HEADER ─────────────────────────────────────── */}
                <div className="px-5">
                    <div className="rounded-2xl overflow-hidden" style={APPLE_GLASS_STYLE}>
                        <div className="flex items-center gap-4 p-4">
                            {/* Photo */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="relative cursor-pointer spring-press bg-transparent border-0 p-0 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                                aria-label={profile.photo ? 'Change profile photo' : 'Add profile photo'}
                            >
                                <div className="w-[72px] h-[72px] rounded-full overflow-hidden" style={{
                                    boxShadow: `0 0 0 3px ${activeTheme.palette[200]}, 0 8px 24px rgba(0,0,0,0.1)`,
                                }}>
                                    {profile.photo ? (
                                        <img src={profile.photo} className="w-full h-full object-cover" alt="Couple" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${activeTheme.palette[300]}, ${activeTheme.palette[500]})` }}>
                                            <Heart size={28} fill="currentColor" style={{ color: 'rgba(255,255,255,0.85)' }} />
                                        </div>
                                    )}
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full flex items-center justify-center" style={{
                                    background: activeTheme.palette[500],
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                    border: '2px solid white',
                                }}>
                                    <Camera size={12} color="white" />
                                </div>
                            </button>
                            <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />

                            <div className="flex-1 min-w-0">
                                {profile.myName || profile.partnerName ? (
                                    <>
                                        <p className="font-serif text-[22px] font-bold leading-tight tracking-[-0.02em] truncate" style={{ color: 'var(--color-text-primary)' }}>
                                            {profile.myName || '—'} <span className="text-[16px] font-light" style={{ opacity: 0.35 }}>&</span> {profile.partnerName || '—'}
                                        </p>
                                        {profile.anniversaryDate && (
                                            <p className="text-[12px] mt-1 font-medium" style={{ color: activeTheme.palette[500] }}>
                                                Together since {new Date(profile.anniversaryDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-[15px] font-medium" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>Tap to add your names</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── PERSONAL INFO GROUP ───────────────────────────────── */}
                <div className="px-5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2 ml-1" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>Personal Info</p>
                    <div className="rounded-2xl overflow-hidden" style={APPLE_GLASS_STYLE}>
                        {[
                            { label: 'Your Name', value: profile.myName, field: 'myName' as const, placeholder: 'Enter your name', type: 'text' },
                            { label: "Partner's Name", value: profile.partnerName, field: 'partnerName' as const, placeholder: 'Enter their name', type: 'text' },
                        ].map((item, i, arr) => (
                            <div key={item.field} className="flex items-center px-4 min-h-[48px]" style={i < arr.length - 1 ? { borderBottom: '0.5px solid rgba(0,0,0,0.08)' } : { borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                                <label className="text-[15px] font-medium w-[110px] flex-shrink-0" style={{ color: 'var(--color-text-primary)' }}>{item.label}</label>
                                <input
                                    type="text"
                                    value={item.value}
                                    onChange={(e) => handleChange(item.field, e.target.value)}
                                    className="flex-1 bg-transparent py-3 text-[15px] outline-none text-right placeholder:opacity-25"
                                    style={{ color: 'var(--color-text-primary)' }}
                                    placeholder={item.placeholder}
                                />
                            </div>
                        ))}
                        <div className="flex items-center px-4 min-h-[48px]">
                            <label className="text-[15px] font-medium w-[110px] flex-shrink-0" style={{ color: 'var(--color-text-primary)' }}>Anniversary</label>
                            <input
                                type="date"
                                value={profile.anniversaryDate ? new Date(profile.anniversaryDate).toISOString().split('T')[0] : ''}
                                onChange={(e) => handleChange('anniversaryDate', e.target.value ? new Date(e.target.value).toISOString() : '')}
                                className="flex-1 bg-transparent py-3 text-[15px] outline-none text-right"
                                style={{ color: 'var(--color-text-primary)' }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── THEME PICKER ──────────────────────────────────────── */}
                <div className="px-5">
                    <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] mb-3.5 ml-1" style={{ color: 'var(--color-text-primary)', opacity: 0.85 }}>Aesthetic Studio</p>
                    <div className="rounded-[2.5rem] glass-card-premium overflow-hidden p-0 border-none ring-1 ring-inset ring-white/10" style={FROSTED_PANEL_STYLE}>

                        {/* Active theme hero */}
                        <div className="mx-4 mb-4 rounded-2xl overflow-hidden relative" style={{
                            background: `linear-gradient(145deg, ${activeTheme.palette[200]} 0%, ${activeTheme.palette[400]} 50%, ${activeTheme.palette[600]} 100%)`,
                            boxShadow: `0 16px 40px ${activeTheme.palette[400]}44, 0 4px 12px ${activeTheme.palette[300]}33`,
                        }}>
                            <div className="absolute inset-0 pointer-events-none" style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.08) 40%, transparent 70%)',
                            }} />
                            <div className="absolute bottom-0 left-0 right-0 h-1/2 pointer-events-none" style={{
                                background: 'linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 100%)',
                            }} />
                            <div className="relative px-4 py-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.22em] font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                            Active Theme
                                        </p>
                                        <p className="text-lg font-bold text-white leading-tight mt-0.5">
                                            {activeTheme.label}
                                        </p>
                                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                            {THEME_DESCRIPTIONS[activeThemeId]}
                                        </p>
                                    </div>
                                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{
                                        background: 'rgba(255,255,255,0.22)',
                                        color: 'white',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                    }}>
                                        <Check size={10} />
                                        Live
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    {([activeTheme.palette[100], activeTheme.palette[200], activeTheme.palette[300], activeTheme.palette[400], activeTheme.palette[500], activeTheme.palette[600]] as string[]).map((shade, i) => (
                                        <span
                                            key={`active-dot-${i}`}
                                            className="rounded-full"
                                            style={{
                                                width: 22,
                                                height: 22,
                                                backgroundColor: shade,
                                                border: '2px solid rgba(255,255,255,0.4)',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Theme grid — 3 columns */}
                        <div className="grid grid-cols-3 gap-2.5 px-4 pb-4">
                            {Object.entries(THEMES).map(([id, theme]) => {
                                const isSelected = (profile.theme || 'rose') === id;
                                return (
                                     <button
                                         key={id}
                                         onClick={(e) => handleThemeChange(id as ThemeId, e.currentTarget)}
                                         aria-label={`${theme.label} theme - ${THEME_DESCRIPTIONS[id as ThemeId]}`}
                                         aria-pressed={isSelected}
                                         className="relative overflow-hidden focus-visible:outline-none"
                                        style={{
                                            borderRadius: 14,
                                            aspectRatio: '1 / 1',
                                            background: `linear-gradient(145deg, ${theme.palette[200]} 0%, ${theme.palette[400]} 55%, ${theme.palette[600]} 100%)`,
                                            border: isSelected ? 'none' : `1.5px solid ${theme.palette[400]}55`,
                                            boxShadow: isSelected
                                                ? `0 0 0 2.5px white, 0 0 0 4.5px ${theme.palette[500]}, 0 10px 28px ${theme.palette[400]}55`
                                                : `0 6px 18px ${theme.palette[400]}40, 0 2px 6px ${theme.palette[300]}30`,
                                            transform: isSelected ? 'scale(1.06)' : 'scale(1)',
                                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                        }}
                                    >
                                        {/* Top-left shimmer */}
                                        <div className="absolute inset-0 pointer-events-none" style={{
                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.05) 45%, transparent 100%)',
                                        }} />
                                        {/* Bottom name fade */}
                                        <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none" style={{
                                            background: 'linear-gradient(to top, rgba(0,0,0,0.32) 0%, transparent 100%)',
                                            borderBottomLeftRadius: 14,
                                            borderBottomRightRadius: 14,
                                        }} />
                                        {/* Stacked palette dots — top right */}
                                        {!isSelected && (
                                            <div className="absolute top-2 right-2 flex">
                                                {[theme.palette[300], theme.palette[400], theme.palette[500]].map((c, i) => (
                                                    <span
                                                        key={i}
                                                        className="rounded-full"
                                                        style={{
                                                            width: 11,
                                                            height: 11,
                                                            backgroundColor: c,
                                                            border: '1.5px solid rgba(255,255,255,0.5)',
                                                            marginLeft: i > 0 ? -4 : 0,
                                                            zIndex: 3 - i,
                                                            position: 'relative',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {/* Selected check */}
                                        {isSelected && (
                                            <span
                                                className="absolute top-2 right-2 flex items-center justify-center rounded-full"
                                                style={{
                                                    width: 20,
                                                    height: 20,
                                                    background: 'rgba(255,255,255,0.35)',
                                                    border: '1px solid rgba(255,255,255,0.55)',
                                                }}
                                            >
                                                <Check size={11} style={{ color: 'white' }} />
                                            </span>
                                        )}
                                        {/* Name at bottom */}
                                        <span
                                            className="absolute bottom-2 left-2 right-2 text-[11.5px] font-bold leading-tight tracking-[-0.005em]"
                                            style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.25)' }}
                                        >
                                            {theme.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── TOGETHER SONG — featured card ──────────────────── */}
                <div className="px-5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2 ml-1" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>Together Song</p>
                    <div className="rounded-2xl overflow-hidden relative" style={{
                        background: `linear-gradient(145deg, ${activeTheme.palette[200]}, ${activeTheme.palette[100]}, ${activeTheme.palette[200]})`,
                        border: `1px solid ${activeTheme.palette[300]}88`,
                        boxShadow: `0 6px 28px ${activeTheme.palette[400]}25, 0 2px 6px rgba(0,0,0,0.06)`,
                    }}>
                        {/* Decorative music notes */}
                        <div className="absolute top-2 right-3 opacity-[0.12] pointer-events-none">
                            <Music size={48} style={{ color: activeTheme.palette[500] }} />
                        </div>

                        {musicMeta ? (
                            <div className="relative flex items-center gap-3.5 p-4">
                                {/* Album-style icon */}
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{
                                    background: `linear-gradient(135deg, ${activeTheme.palette[400]}, ${activeTheme.palette[600]})`,
                                    boxShadow: `0 6px 20px ${activeTheme.palette[500]}30`,
                                }}>
                                    <Music size={22} color="white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[16px] font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{musicMeta.name}</p>
                                    <p className="text-[12px] mt-0.5 font-medium" style={{ color: activeTheme.palette[500] }}>♪ Plays when you're both online</p>
                                </div>
                                <button
                                    onClick={handleRemoveMusic}
                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 spring-press"
                                    style={{ background: 'rgba(0,0,0,0.05)' }}
                                    title="Remove shared song"
                                >
                                    <Trash2 size={14} style={{ color: 'var(--color-text-primary)', opacity: 0.35 }} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => musicInputRef.current?.click()}
                                className="relative w-full flex items-center gap-3.5 p-4 spring-press text-left active:opacity-80"
                            >
                                {/* Dashed upload icon */}
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{
                                    border: `2px dashed ${activeTheme.palette[300]}80`,
                                    background: `${activeTheme.palette[100]}40`,
                                }}>
                                    <Upload size={20} style={{ color: activeTheme.palette[400] }} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[16px] font-bold" style={{ color: 'var(--color-text-primary)' }}>Add your song</p>
                                    <p className="text-[12px] mt-0.5 font-medium" style={{ color: activeTheme.palette[400] }}>The song that plays when you're both here · Up to 10 MB</p>
                                </div>
                            </button>
                        )}
                        <input type="file" accept="audio/*" ref={musicInputRef} className="hidden" onChange={handleMusicUpload} />
                        {musicError && (
                            <div className="px-4 pb-3">
                                <p className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: '#dc2626' }}>
                                    <AlertCircle size={12} /> {musicError}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── PREFERENCES GROUP (Toggles) ──────────────────────── */}
                <div className="px-5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2 ml-1" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>Preferences</p>
                    <div className="rounded-2xl overflow-hidden" style={APPLE_GLASS_STYLE}>
                        {/* Haptic toggle */}
                        <div className="px-4">
                            <ToggleRow
                                icon={<Vibrate size={15} />}
                                label="Haptic Feedback"
                                description="Vibrations on taps"
                                on={hapticsOn}
                                onToggle={handleToggleHaptics}
                            />
                        </div>

                        {/* Sound toggle */}
                        <div className="px-4">
                            <ToggleRow
                                icon={audioOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                                label="UI Sounds"
                                description="Soft taps and chimes"
                                on={audioOn}
                                onToggle={handleToggleAudio}
                                noBorder
                            />
                        </div>
                    </div>
                </div>

                {/* ── STORAGE & BACKUP GROUP ────────────────────────────── */}
                <div className="px-5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2 ml-1" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>Storage &amp; Backup</p>
                    <div className="rounded-2xl overflow-hidden" style={APPLE_GLASS_STYLE}>
                        {/* Device storage */}
                        <div className="flex items-center justify-between px-4 min-h-[48px]" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${activeTheme.palette[100]}` }}>
                                    <Database size={14} style={{ color: activeTheme.palette[500] }} />
                                </div>
                                <p className="text-[15px] font-medium" style={{ color: 'var(--color-text-primary)' }}>On this device</p>
                            </div>
                            <span className="text-[13px] font-mono font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)', opacity: 0.5 }}>{storageInfo.used}</span>
                        </div>

                        {/* Cloud media */}
                        <div className="px-4 py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${activeTheme.palette[100]}` }}>
                                        <HardDrive size={14} style={{ color: activeTheme.palette[500] }} />
                                    </div>
                                    <p className="text-[15px] font-medium" style={{ color: 'var(--color-text-primary)' }}>Cloud media</p>
                                </div>
                                <span className="text-[13px] font-mono font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)', opacity: 0.5 }}>
                                    {formatBytes(managedStats.totalBytes)}<span style={{ opacity: 0.4 }}> / {formatBytes(managedStats.totalQuotaBytes)}</span>
                                </span>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2.5 ml-11 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                <div className="h-full rounded-full" style={{
                                    width: `${Math.min(100, managedStats.totalQuotaBytes > 0 ? (managedStats.totalBytes / managedStats.totalQuotaBytes) * 100 : 0)}%`,
                                    background: `linear-gradient(90deg, ${activeTheme.palette[400]}, ${activeTheme.palette[500]})`,
                                    minWidth: managedStats.totalBytes > 0 ? '4px' : '0',
                                    transition: 'width 0.5s ease',
                                }} />
                            </div>
                            {managedStats.breakdown.some((e) => e.bytes > 0) && (
                                <div className="mt-2 space-y-0.5 ml-11">
                                    {managedStats.breakdown
                                        .filter((entry) => entry.bytes > 0)
                                        .sort((a, b) => b.bytes - a.bytes)
                                        .slice(0, 3)
                                        .map((entry) => (
                                            <div key={entry.feature} className="flex items-center justify-between">
                                                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>
                                                    {entry.label}{entry.itemCount > 0 ? ` · ${entry.itemCount}` : ''}
                                                </span>
                                                <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>
                                                    {formatBytes(entry.bytes)}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        {/* Export / Import buttons */}
                        <div className="flex">
                            <button
                                onClick={handleDownloadBackup}
                                disabled={isBackingUp}
                                className="flex-1 flex items-center justify-center gap-2 py-3.5 spring-press text-[14px] font-semibold active:opacity-70"
                                style={{ color: activeTheme.palette[500], borderRight: '0.5px solid rgba(0,0,0,0.08)' }}
                            >
                                {isBackingUp ? <Download size={14} className="animate-bounce" /> : <Download size={14} />}
                                Export
                            </button>
                            <button
                                onClick={() => backupInputRef.current?.click()}
                                className="flex-1 flex items-center justify-center gap-2 py-3.5 spring-press text-[14px] font-semibold active:opacity-70"
                                style={{ color: activeTheme.palette[500] }}
                            >
                                <Upload size={14} />
                                Import
                            </button>
                        </div>
                        <input type="file" accept=".json" ref={backupInputRef} className="hidden" onChange={handleRestoreBackup} />
                    </div>
                </div>

                {/* ── ACCOUNT GROUP ─────────────────────────────────────── */}
                <div className="px-5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2 ml-1" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>Account</p>
                    <div className="rounded-2xl overflow-hidden" style={APPLE_GLASS_STYLE}>
                        {/* Admin dashboard (conditional) */}
                        {isInternalAdmin && (
                            <button
                                onClick={() => setView('storage-console')}
                                className="w-full flex items-center gap-3 px-4 min-h-[48px] spring-press text-left active:opacity-70"
                                style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}
                            >
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${activeTheme.palette[100]}` }}>
                                    <ShieldCheck size={14} style={{ color: activeTheme.palette[500] }} />
                                </div>
                                <p className="flex-1 text-[15px] font-medium" style={{ color: 'var(--color-text-primary)' }}>Admin Dashboard</p>
                                <span className="text-[12px] font-mono tabular-nums" style={{ color: 'var(--color-text-primary)', opacity: 0.35 }}>{formatBytes(managedStats.totalBytes)}</span>
                            </button>
                        )}

                        {/* Switch identity */}
                        <button
                            onClick={handleSwitchIdentityClick}
                            className="w-full flex items-center gap-3 px-4 min-h-[48px] spring-press text-left active:opacity-70"
                            style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}
                        >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${activeTheme.palette[100]}` }}>
                                <Users size={14} style={{ color: activeTheme.palette[500] }} />
                            </div>
                            <p className="flex-1 text-[15px] font-medium" style={{ color: 'var(--color-text-primary)' }}>Switch Active Profile</p>
                        </button>

                        {/* Sign out */}
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-4 min-h-[48px] spring-press text-left active:opacity-70"
                        >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#fef2f2' }}>
                                <LogOut size={14} style={{ color: '#dc2626' }} />
                            </div>
                            <p className="flex-1 text-[15px] font-medium" style={{ color: '#dc2626' }}>Sign Out</p>
                        </button>
                    </div>
                </div>

            </div>

            {/* ── IDENTITY MODAL ─────────────────────────────────────────── */}
            {showIdentityModal && (
                <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
                    <div className="w-full max-w-lg rounded-t-[20px] relative" style={APPLE_GLASS_STYLE}>
                        {/* Handle bar */}
                        <div className="flex justify-center pt-2.5 pb-4">
                            <div className="w-9 h-[4px] rounded-full bg-black/10" />
                        </div>

                        <button
                            onClick={() => setShowIdentityModal(false)}
                            className="absolute top-3 right-4 w-7 h-7 rounded-full flex items-center justify-center spring-press"
                            style={{ background: 'rgba(0,0,0,0.06)' }}
                            aria-label="Close identity picker"
                        >
                            <X size={14} style={{ color: 'var(--color-text-primary)', opacity: 0.4 }} />
                        </button>

                        <div className="px-5 pb-8">
                            <h3 className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: 'var(--color-text-primary)' }}>Who's using this?</h3>
                            <p className="text-[13px] mt-1 mb-5" style={{ color: 'var(--color-text-primary)', opacity: 0.4 }}>Pick which profile this device opens as.</p>

                            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.03)' }}>
                                {[
                                    { name: 'Tulika', emoji: '👩🏻' },
                                    { name: 'Ishan',  emoji: '👨🏻' },
                                ].map(({ name, emoji }, i) => (
                                    <button
                                        key={name}
                                        onClick={() => handleIdentitySelect(name)}
                                        className="w-full flex items-center gap-3.5 px-4 py-3.5 spring-press text-left active:opacity-70"
                                        style={i === 0 ? { borderBottom: '0.5px solid rgba(0,0,0,0.08)' } : {}}
                                    >
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                                            background: `linear-gradient(135deg, ${activeTheme.palette[300]}, ${activeTheme.palette[500]})`,
                                        }}>
                                            <span className="text-[18px] leading-none">{emoji}</span>
                                        </div>
                                        <p className="flex-1 text-[16px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{name}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

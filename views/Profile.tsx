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
    background: 'var(--theme-surface-glass)',
    backdropFilter: 'blur(40px) saturate(220%) brightness(1.08)',
    WebkitBackdropFilter: 'blur(40px) saturate(220%) brightness(1.08)',
    borderTop: '1.5px solid rgba(255, 255, 255, 0.55)',
    borderLeft: '1.5px solid rgba(255, 255, 255, 0.35)',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 2px 2px rgba(255, 255, 255, 0.4), inset 1px 0 1px rgba(255, 255, 255, 0.2)',
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
    const [musicMeta, setMusicMeta] = useState<{ name: string } | null>(null);
    const [musicError, setMusicError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const backupInputRef = useRef<HTMLInputElement>(null);
    const musicInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const refreshStorageStats = () => {
            setManagedStats(StorageService.getManagedStorageStats());
        };
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
                    alert("Could not load image. Please use a standard JPEG or PNG file.");
                };
            };
            reader.onerror = () => {
                alert("Error reading file.");
            };
            reader.readAsDataURL(file);
        }
    };

    const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setMusicError(null);

        if (file) {
            if (file.type.startsWith('audio/')) {
                // STRICT LIMIT: 10MB to match storage service limit
                if (file.size > 10 * 1024 * 1024) {
                    setMusicError("File too large (Max 10MB). Please compress your MP3.");
                    return;
                }

                try {
                    await StorageService.saveTogetherMusic(file);
                    setMusicMeta({ name: file.name });
                    alert("Together song updated! 🎵\nIt will play next time you are both online.");
                } catch (e: any) {
                    setMusicError(e.message || "Upload failed");
                }
            } else {
                setMusicError("Invalid file type. Please select an audio file.");
            }
        }
    };

    const handleRemoveMusic = async () => {
        if (confirm("Remove custom song and use default theme?")) {
            await StorageService.deleteTogetherMusic();
            setMusicMeta(null);
            setMusicError(null);
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
        // Set override flag to ensure this choice persists over auto-login logic
        localStorage.setItem('lior_manual_override', 'true');
        window.location.reload();
    };

    const handleSignOut = async () => {
        if (confirm("Are you sure you want to sign out?")) {
            localStorage.removeItem('lior_manual_override'); // Clear override
            if (SupabaseService.client) {
                await SupabaseService.client.auth.signOut();
            }
            window.location.reload();
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
            alert("Backup failed. Your data might be too large for a single file download.");
        }
        setIsBackingUp(false);
    };

    const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string);
                if (confirm("Restore this backup? This will merge old memories with your current ones.")) {
                    const success = await StorageService.importData(data);
                    if (success) {
                        alert("Restore successful! ✨");
                        setProfile(StorageService.getCoupleProfile()); // Refresh local state
                    } else {
                        alert("No new data found or import failed.");
                    }
                }
            } catch (e) {
                alert("Invalid backup file.");
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
            style={noBorder ? {} : { borderBottom: '1px solid rgba(var(--color-text-primary-rgb, 45,31,37), 0.07)' }}
        >
            <div className="flex items-center gap-4">
                <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: on ? 'var(--color-nav-active)' : 'rgba(0,0,0,0.06)' }}
                >
                    <span style={{ color: on ? '#fff' : 'var(--color-text-secondary)' }}>{icon}</span>
                </div>
                <div>
                    <p className="text-base font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
                    <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
                </div>
            </div>
            <button
                onClick={onToggle}
                className="relative flex-shrink-0 transition-all duration-300 spring-press outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                    width: 50, height: 28, borderRadius: 100,
                    background: on ? 'var(--color-nav-active)' : 'rgba(0,0,0,0.12)',
                    boxShadow: on ? '0 2px 10px rgba(var(--theme-particle-1-rgb), 0.4)' : 'none',
                }}
                aria-pressed={on}
            >
                <span
                    className="absolute rounded-full bg-white shadow-sm transition-all duration-300"
                    style={{ width: 22, height: 22, top: 3, left: on ? 25 : 3 }}
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
                        className="px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all text-white"
                        style={{ background: 'var(--theme-nav-center-bg-active)', opacity: isSaving ? 0.7 : 1 }}
                    >
                        {isSaving ? <><Save size={14} className="animate-spin" /> Saving…</> : 'Save'}
                    </button>
                }
            />

            <div className="view-container space-y-6 pb-16">

                {/* ── HERO: photo + couple names ────────────────────────── */}
                <div className="px-5 pt-2">
                    <div
                        className="relative rounded-3xl overflow-hidden"
                        style={{
                            background: `linear-gradient(145deg, ${activeTheme.palette[100]} 0%, ${activeTheme.palette[300]} 60%, ${activeTheme.palette[500]} 100%)`,
                            boxShadow: `0 12px 40px ${activeTheme.palette[400]}44`,
                        }}
                    >
                        {/* shimmer */}
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.04) 55%, transparent 100%)' }} />

                        <div className="relative z-10 flex items-center gap-5 p-6">
                            {/* Photo */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="relative cursor-pointer flex-shrink-0 spring-press"
                            >
                                <div
                                    className="w-20 h-20 rounded-2xl overflow-hidden"
                                    style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 0 0 3px rgba(255,255,255,0.6)' }}
                                >
                                    {profile.photo ? (
                                        <img src={profile.photo} className="w-full h-full object-cover" alt="Couple" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.35)' }}>
                                            <Heart size={28} fill="currentColor" style={{ color: activeTheme.palette[600] }} />
                                        </div>
                                    )}
                                </div>
                                <div
                                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                                    style={{ background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                                >
                                    <Camera size={12} style={{ color: activeTheme.palette[500] }} />
                                </div>
                                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                            </div>

                            {/* Names */}
                            <div className="min-w-0">
                                {profile.myName || profile.partnerName ? (
                                    <p className="font-serif text-2xl font-bold text-white leading-tight drop-shadow-sm">
                                        {profile.myName || '—'}
                                        <span className="mx-2 opacity-60">&</span>
                                        {profile.partnerName || '—'}
                                    </p>
                                ) : (
                                    <p className="font-serif text-xl text-white/60">Add your names below</p>
                                )}
                                {profile.anniversaryDate && (
                                    <p className="text-[12px] mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                        Together since {new Date(profile.anniversaryDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── IDENTITY FIELDS ───────────────────────────────────── */}
                <div className="px-5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] mb-4 ml-1" style={{ color: 'var(--color-text-secondary)' }}>Your Identity</p>
                    <div className="rounded-[2rem] p-5 space-y-4" style={APPLE_GLASS_STYLE}>
                        {/* My Name */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--color-text-secondary)' }}>My Name</label>
                            <input
                                type="text"
                                value={profile.myName}
                                onChange={(e) => handleChange('myName', e.target.value)}
                                className="w-full rounded-2xl px-4 py-3.5 text-[20px] font-serif font-semibold outline-none placeholder:opacity-30 transition-all focus:ring-2 focus:ring-opacity-50"
                                style={{ color: 'var(--color-text-primary)', background: 'rgba(100,100,100, 0.08)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
                                placeholder="Your name"
                            />
                        </div>

                        {/* Partner Name */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-[0.1em] block mb-2 mt-1" style={{ color: 'var(--color-text-secondary)' }}>Partner's Name</label>
                            <input
                                type="text"
                                value={profile.partnerName}
                                onChange={(e) => handleChange('partnerName', e.target.value)}
                                className="w-full rounded-2xl px-4 py-3.5 text-[20px] font-serif font-semibold outline-none placeholder:opacity-30 transition-all focus:ring-2 focus:ring-opacity-50"
                                style={{ color: 'var(--color-text-primary)', background: 'rgba(100,100,100, 0.08)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
                                placeholder="Their name"
                            />
                        </div>

                        {/* Anniversary */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-[0.1em] block mb-2 mt-1" style={{ color: 'var(--color-text-secondary)' }}>Together Since</label>
                            <input
                                type="date"
                                value={profile.anniversaryDate ? new Date(profile.anniversaryDate).toISOString().split('T')[0] : ''}
                                onChange={(e) => handleChange('anniversaryDate', new Date(e.target.value).toISOString())}
                                className="w-full rounded-2xl px-4 py-3.5 text-[16px] font-semibold outline-none transition-all focus:ring-2 focus:ring-opacity-50"
                                style={{ color: 'var(--color-text-primary)', background: 'rgba(100,100,100, 0.08)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── THEME PICKER — UNCHANGED ──────────────────────────── */}
                <div className="px-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--color-text-secondary)' }}>Aesthetic Studio</p>
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
                                            className="absolute bottom-2 left-2 right-2 text-[10px] font-bold leading-tight"
                                            style={{ color: 'rgba(255,255,255,0.95)', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
                                        >
                                            {theme.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── YOUR SONG ─────────────────────────────────────────── */}
                <div className="px-5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] mb-4 ml-1" style={{ color: 'var(--color-text-secondary)' }}>Your Song</p>
                    <div className="rounded-2xl overflow-hidden premium-skeuo-glass">
                        {musicMeta ? (
                            /* Active song row */
                            <div className="flex items-center gap-4 p-5">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'var(--color-nav-active)', boxShadow: '0 4px 14px rgba(var(--theme-particle-1-rgb),0.4)' }}
                                >
                                    <Music size={20} color="#fff" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{musicMeta.name}</p>
                                    <p className="text-[12px] mt-0.5 font-medium" style={{ color: 'var(--color-nav-active)' }}>Playing in the background ♪</p>
                                </div>
                                <button
                                    onClick={handleRemoveMusic}
                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 spring-press"
                                    style={{ background: 'rgba(0,0,0,0.06)' }}
                                    title="Remove song"
                                >
                                    <Trash2 size={15} style={{ color: 'var(--color-text-secondary)' }} />
                                </button>
                            </div>
                        ) : (
                            /* Upload CTA */
                            <button
                                onClick={() => musicInputRef.current?.click()}
                                className="w-full flex items-center gap-4 p-5 spring-press transition-opacity active:opacity-70"
                            >
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(var(--theme-particle-1-rgb),0.1)', border: '1.5px dashed rgba(var(--theme-particle-1-rgb),0.3)' }}
                                >
                                    <Upload size={18} style={{ color: 'var(--color-nav-active)' }} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Add your song</p>
                                    <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>Plays softly in the background · Max 10 MB</p>
                                </div>
                            </button>
                        )}
                        <input type="file" accept="audio/*" ref={musicInputRef} className="hidden" onChange={handleMusicUpload} />
                        {musicError && (
                            <div className="px-5 pb-4">
                                <p className="text-[12px] text-red-500 font-medium flex items-center gap-1.5">
                                    <AlertCircle size={12} /> {musicError}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── FEEL: haptics + sound ──────────────────────────────── */}
                <div className="px-5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] mb-4 ml-1" style={{ color: 'var(--color-text-secondary)' }}>Feel & Sound</p>
                    <div className="rounded-2xl px-5" style={APPLE_GLASS_STYLE}>
                        <ToggleRow
                            icon={<Vibrate size={17} />}
                            label="Haptic Feedback"
                            description="Vibrations on taps and interactions"
                            on={hapticsOn}
                            onToggle={handleToggleHaptics}
                        />
                        <ToggleRow
                            icon={audioOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
                            label="UI Sounds"
                            description="Soft clicks, swooshes & chimes"
                            on={audioOn}
                            onToggle={handleToggleAudio}
                            noBorder
                        />
                    </div>
                </div>

                {/* ── DATA & BACKUP ─────────────────────────────────────── */}
                <div className="px-5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] mb-4 ml-1" style={{ color: 'var(--color-text-secondary)' }}>Your Data</p>
                    <div className="rounded-2xl overflow-hidden" style={APPLE_GLASS_STYLE}>
                        {/* Storage usage row */}
                        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(var(--color-text-primary-rgb,45,31,37), 0.07)' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                    <Database size={17} style={{ color: 'var(--color-text-secondary)' }} />
                                </div>
                                <div>
                                    <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Local storage</p>
                                    <p className="text-[13px] mt-0.5 opacity-80" style={{ color: 'var(--color-text-primary)' }}>{storageInfo.type}</p>
                                </div>
                            </div>
                            <span className="text-[15px] font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{storageInfo.used}</span>
                        </div>

                        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(var(--color-text-primary-rgb,45,31,37), 0.07)' }}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                                        <HardDrive size={17} style={{ color: '#2563eb' }} />
                                    </div>
                                    <div>
                                        <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Cloud media budget</p>
                                        <p className="text-[13px] mt-0.5 opacity-80" style={{ color: 'var(--color-text-primary)' }}>
                                            Managed R2 media tracked by feature
                                        </p>
                                    </div>
                                </div>
                                <span className="text-[13px] font-bold font-mono text-right" style={{ color: 'var(--color-text-primary)' }}>
                                    {formatBytes(managedStats.totalBytes)} / {formatBytes(managedStats.totalQuotaBytes)}
                                </span>
                            </div>
                            <div className="mt-3 space-y-2">
                                {managedStats.breakdown
                                    .filter((entry) => entry.bytes > 0)
                                    .sort((a, b) => b.bytes - a.bytes)
                                    .slice(0, 4)
                                    .map((entry) => (
                                        <div key={entry.feature} className="flex items-center justify-between text-[12px]">
                                            <span style={{ color: 'var(--color-text-secondary)' }}>
                                                {entry.label} {entry.itemCount > 0 ? `· ${entry.itemCount}` : ''}
                                            </span>
                                            <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>
                                                {formatBytes(entry.bytes)}
                                            </span>
                                        </div>
                                    ))}
                                {managedStats.breakdown.every((entry) => entry.bytes === 0) && (
                                    <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                                        No managed media stored yet.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Export row */}
                        <button
                            onClick={handleDownloadBackup}
                            disabled={isBackingUp}
                            className="w-full flex items-center justify-between px-5 py-4 spring-press transition-opacity active:opacity-70"
                            style={{ borderBottom: '1px solid rgba(var(--color-text-primary-rgb,45,31,37), 0.07)' }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                                    {isBackingUp ? <Download size={17} className="animate-bounce" style={{ color: '#059669' }} /> : <Download size={17} style={{ color: '#059669' }} />}
                                </div>
                                <div className="text-left">
                                    <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Export backup</p>
                                    <p className="text-[13px] mt-0.5 font-medium opacity-80" style={{ color: 'var(--color-text-primary)' }}>Download all your memories as a file</p>
                                </div>
                            </div>
                            <span className="text-[13px] font-semibold" style={{ color: '#059669' }}>Export</span>
                        </button>

                        {/* Import row */}
                        <button
                            onClick={() => backupInputRef.current?.click()}
                            className="w-full flex items-center justify-between px-5 py-4 spring-press transition-opacity active:opacity-70"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                                    <Upload size={17} style={{ color: '#3b82f6' }} />
                                </div>
                                <div className="text-left">
                                    <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Import backup</p>
                                    <p className="text-[13px] mt-0.5 font-medium opacity-80" style={{ color: 'var(--color-text-primary)' }}>Restore from a previous export file</p>
                                </div>
                            </div>
                            <span className="text-[13px] font-semibold" style={{ color: '#3b82f6' }}>Import</span>
                        </button>

                        <input type="file" accept=".json" ref={backupInputRef} className="hidden" onChange={handleRestoreBackup} />
                    </div>
                </div>

                {/* ── ACCOUNT ───────────────────────────────────────────── */}
                <div className="px-5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] mb-4 ml-1" style={{ color: 'var(--color-text-secondary)' }}>Account</p>
                    <div className="rounded-2xl overflow-hidden space-y-2">
                        <button
                            onClick={handleSwitchIdentityClick}
                            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl spring-press"
                            style={APPLE_GLASS_STYLE}
                        >
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                <Users size={17} style={{ color: 'var(--color-text-primary)' }} />
                            </div>
                            <div className="text-left flex-1 ml-2">
                                <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Switch identity</p>
                                <p className="text-[13px] mt-0.5 font-medium opacity-80" style={{ color: 'var(--color-text-primary)' }}>Change who you're logged in as</p>
                            </div>
                        </button>

                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl spring-press"
                            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}
                        >
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                                <LogOut size={17} style={{ color: '#ef4444' }} />
                            </div>
                            <div className="text-left flex-1 ml-2">
                                <p className="text-base font-semibold" style={{ color: '#ef4444' }}>Sign out</p>
                                <p className="text-[13px] mt-0.5" style={{ color: 'rgba(239,68,68,0.6)' }}>You can sign back in anytime</p>
                            </div>
                        </button>
                    </div>
                </div>

            </div>

            {/* ── IDENTITY MODAL ────────────────────────────────────────── */}
            {showIdentityModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)' }}>
                    <div className="w-full max-w-sm rounded-3xl p-6 relative" style={APPLE_GLASS_STYLE}>
                        <button
                            onClick={() => setShowIdentityModal(false)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center spring-press"
                            style={{ background: 'rgba(0,0,0,0.07)' }}
                        >
                            <X size={16} style={{ color: 'var(--color-text-secondary)' }} />
                        </button>

                        <h3 className="font-serif font-bold text-2xl mb-1" style={{ color: 'var(--color-text-primary)' }}>Who are you?</h3>
                        <p className="text-[13px] mb-6" style={{ color: 'var(--color-text-secondary)' }}>Choose your identity to switch the active profile.</p>

                        <div className="space-y-3">
                            {[
                                { name: 'Tulika', emoji: '👩🏻' },
                                { name: 'Ishan',  emoji: '👨🏻' },
                            ].map(({ name, emoji }) => (
                                <button
                                    key={name}
                                    onClick={() => handleIdentitySelect(name)}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl spring-press text-left"
                                    style={{ background: 'rgba(var(--theme-particle-1-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-1-rgb),0.15)' }}
                                >
                                    <span className="text-3xl leading-none">{emoji}</span>
                                    <div>
                                        <p className="text-[16px] font-bold" style={{ color: 'var(--color-text-primary)' }}>{name}</p>
                                        <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Switch to {name}'s view</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

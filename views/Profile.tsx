import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Heart, Save, Palette, Check, Download, Upload, Database, ShieldCheck, HardDrive, LogOut, Music, Trash2, AlertCircle, Users, Volume2, VolumeX, Vibrate, Zap } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { SectionDivider } from './Home';
import { ViewState, CoupleProfile } from '../types';
import { StorageService } from '../services/storage';
import { ThemeService, THEMES, ThemeId } from '../services/theme';
import { SupabaseService } from '../services/supabase';
import { Haptics } from '../services/haptics';
import { Audio } from '../services/audio';

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
    const [musicMeta, setMusicMeta] = useState<{ name: string } | null>(null);
    const [musicError, setMusicError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const backupInputRef = useRef<HTMLInputElement>(null);
    const musicInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
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

        return () => {
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

    return (
        <div className="flex flex-col h-full min-h-screen">
            <ViewHeader
                title="Couple Profile"
                onBack={() => setView('home')}
                variant="centered"
                rightSlot={
                    <button
                        onClick={save}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-all text-white"
                        style={{ background: 'var(--theme-nav-center-bg-active)' }}
                    >
                        {isSaving ? (
                            <>
                                <Save size={16} className="animate-bounce" /> Saved
                            </>
                        ) : 'Save'}
                    </button>
                }
            />

            <div className="view-container">
                {/* Photo Upload — Hero Alignment */}
                <div className="view-section flex flex-col items-center">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="group relative w-40 h-40 rounded-full border-2 border-white/20 overflow-hidden cursor-pointer mb-6 transition-all duration-500 spring-press ring-4 ring-lior-100/30"
                        style={{ background: 'var(--theme-surface-glass)', boxShadow: 'var(--shadow-lg)' }}
                    >
                        {profile.photo ? (
                            <img src={profile.photo} className="w-full h-full object-cover" alt="Couple" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-lior-300">
                                <Heart size={48} className="mb-1" fill="currentColor" />
                                <span className="text-micro-bold opacity-60">Upload Photo</span>
                            </div>
                        )}

                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="text-white" size={32} />
                        </div>

                        <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleImageUpload}
                        />
                    </div>
                </div>

                <div className="view-section space-y-4">
                    <div className="p-5 rounded-2xl glass-card-premium shadow-none border-none ring-1 ring-inset ring-white/10 group focus-within:ring-lior-400/40 transition-all duration-300" style={FROSTED_PANEL_STYLE}>
                        <label className="text-micro-bold text-gray-400 block mb-2 opacity-60 group-focus-within:opacity-100 group-focus-within:text-lior-500 transition-all">My Name</label>
                        <input
                            type="text"
                            value={profile.myName}
                            onChange={(e) => handleChange('myName', e.target.value)}
                            className="w-full bg-transparent font-serif text-2xl outline-none text-gray-800 placeholder:text-gray-300 transition-all"
                            placeholder="Your name"
                        />
                    </div>

                    <div className="p-5 rounded-2xl glass-card-premium shadow-none border-none ring-1 ring-inset ring-white/10 group focus-within:ring-lior-400/40 transition-all duration-300" style={FROSTED_PANEL_STYLE}>
                        <label className="text-micro-bold text-gray-400 block mb-2 opacity-60 group-focus-within:opacity-100 group-focus-within:text-lior-500 transition-all">Partner's Name</label>
                        <input
                            type="text"
                            value={profile.partnerName}
                            onChange={(e) => handleChange('partnerName', e.target.value)}
                            className="w-full bg-transparent font-serif text-2xl outline-none text-gray-800 placeholder:text-gray-300 transition-all"
                            placeholder="Their name"
                        />
                    </div>

                    <div className="p-5 rounded-2xl glass-card-premium shadow-none border-none ring-1 ring-inset ring-white/10 group focus-within:ring-lior-400/40 transition-all duration-300" style={FROSTED_PANEL_STYLE}>
                        <label className="text-micro-bold text-gray-400 block mb-2 opacity-60 group-focus-within:opacity-100 group-focus-within:text-lior-500 transition-all">Relationship Start Date</label>
                        <input
                            type="date"
                            value={profile.anniversaryDate ? new Date(profile.anniversaryDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => handleChange('anniversaryDate', new Date(e.target.value).toISOString())}
                            className="w-full bg-transparent font-bold text-lg outline-none text-gray-800 transition-all"
                        />
                    </div>
                </div>

                {/* Theme Selector — Aesthetic Personalization */}
                <div className="view-section">
                    <SectionDivider label="Aesthetic Studio" />
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

                {/* Music Upload — Shared Vibe */}
                <div className="view-section">
                    <SectionDivider label="Shared Vibe" />
                    <div className="p-6 rounded-[2.5rem] glass-card-premium border-none ring-1 ring-inset ring-white/10" style={FROSTED_PANEL_STYLE}>

                        {musicMeta ? (
                            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(var(--theme-particle-1-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-1-rgb),0.14)' }}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-2.5 rounded-full flex-shrink-0" style={{ background: 'rgba(var(--theme-particle-1-rgb),0.15)', color: 'var(--color-nav-active)' }}>
                                        <Music size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold truncate pr-2 leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                                            {musicMeta.name}
                                        </p>
                                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-nav-active)' }}>
                                            Custom Song Active
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleRemoveMusic}
                                    className="p-2 rounded-full transition-all"
                                    style={{ color: 'var(--color-text-secondary)' }}
                                    title="Remove song"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => musicInputRef.current?.click()}
                                        className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all"
                                        style={{ background: 'rgba(var(--theme-particle-2-rgb),0.12)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.18)', color: 'var(--color-text-primary)' }}
                                    >
                                        <Upload size={16} /> Upload Song
                                    </button>
                                    <input
                                        type="file"
                                        accept="audio/*"
                                        ref={musicInputRef}
                                        className="hidden"
                                        onChange={handleMusicUpload}
                                    />
                                </div>

                                {musicError ? (
                                    <p className="text-[10px] text-red-500 font-bold mt-2 flex items-center gap-1 animate-pulse">
                                        <AlertCircle size={10} /> {musicError}
                                    </p>
                                ) : (
                                    <p className="text-[10px] mt-2 leading-tight" style={{ color: 'var(--color-text-secondary)' }}>
                                        This song will play when both of you are online at the same time. Max 10MB.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Feel Settings — Haptics & Sound */}
                <div className="view-section">
                    <SectionDivider label="Tactile & Sound" />
                    <div className="p-6 rounded-[2.5rem] glass-card-premium border-none ring-1 ring-inset ring-white/10" style={FROSTED_PANEL_STYLE}>

                        {/* Haptics Toggle */}
                        <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `rgba(var(--theme-particle-1-rgb), 0.14)` }}>
                                    <Vibrate size={15} style={{ color: 'var(--color-nav-active)' }} />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Haptic Feedback</p>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Physical touch responses</p>
                                </div>
                            </div>
                            <button
                                onClick={handleToggleHaptics}
                                className="relative w-12 h-6 rounded-full transition-all duration-300 spring-press"
                                style={{
                                    background: hapticsOn ? `rgba(var(--theme-particle-1-rgb), 1)` : 'rgba(0,0,0,0.15)',
                                    boxShadow: hapticsOn ? `0 2px 12px rgba(var(--theme-particle-1-rgb), 0.4)` : 'none',
                                }}
                                aria-pressed={hapticsOn}
                            >
                                <span
                                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300"
                                    style={{ left: hapticsOn ? '26px' : '2px' }}
                                />
                            </button>
                        </div>

                        {/* Audio Toggle */}
                        <div className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `rgba(var(--theme-particle-1-rgb), 0.14)` }}>
                                    {audioOn
                                        ? <Volume2 size={15} style={{ color: 'var(--color-nav-active)' }} />
                                        : <VolumeX size={15} style={{ color: 'var(--color-text-secondary)' }} />
                                    }
                                </div>
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>UI Sounds</p>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Clicks, swooshes & chimes</p>
                                </div>
                            </div>
                            <button
                                onClick={handleToggleAudio}
                                className="relative w-12 h-6 rounded-full transition-all duration-300 spring-press"
                                style={{
                                    background: audioOn ? `rgba(var(--theme-particle-1-rgb), 1)` : 'rgba(0,0,0,0.15)',
                                    boxShadow: audioOn ? `0 2px 12px rgba(var(--theme-particle-1-rgb), 0.4)` : 'none',
                                }}
                                aria-pressed={audioOn}
                            >
                                <span
                                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300"
                                    style={{ left: audioOn ? '26px' : '2px' }}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Storage Status — Vault Integrity */}
                <div className="view-section">
                    <SectionDivider label="Vault Integrity" />
                    <div className="p-6 rounded-[2.5rem] glass-card-premium border-none ring-1 ring-inset ring-white/10" style={FROSTED_PANEL_STYLE}>
                        <div className="flex justify-between items-center mb-6">
                            <label className="text-micro-bold text-lior-500 flex items-center gap-2">
                                <HardDrive size={14} /> Local Storage
                            </label>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-lior-50 text-lior-500 ring-1 ring-lior-100">
                                <ShieldCheck size={12} /> {storageInfo.type}
                            </div>
                        </div>

                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-3xl font-mono font-bold text-gray-800">{storageInfo.used}</p>
                                <p className="text-micro-bold text-gray-400 opacity-60 mt-1">Local Memory Footprint</p>
                            </div>
                            <div className="text-right">
                                <p className="text-micro-bold text-gray-800">Database Engine</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest opacity-60">IndexedDB Active</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Data & Backup Section */}
                <div className="view-section">
                    <SectionDivider label="Continuity" />
                    <div className="p-6 rounded-[2.5rem] glass-card-premium border-none ring-1 ring-inset ring-white/10" style={FROSTED_PANEL_STYLE}>

                        <div className="flex gap-4">
                            <button
                                onClick={handleDownloadBackup}
                                disabled={isBackingUp}
                                className="flex-1 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest flex flex-col items-center gap-2 bg-gray-50 border border-gray-100 text-gray-700 active:scale-95 transition-all"
                            >
                                {isBackingUp ? <Download size={20} className="animate-bounce" /> : <Download size={20} />}
                                <span>Export</span>
                            </button>

                            <button
                                onClick={() => backupInputRef.current?.click()}
                                className="flex-1 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest flex flex-col items-center gap-2 bg-gray-50 border border-gray-100 text-gray-700 active:scale-95 transition-all"
                            >
                                <Upload size={20} />
                                <span>Import</span>
                            </button>
                            <input
                                type="file"
                                accept=".json"
                                ref={backupInputRef}
                                className="hidden"
                                onChange={handleRestoreBackup}
                            />
                        </div>
                        <p className="text-[11px] mt-6 leading-relaxed text-gray-500 font-medium">
                            Download a copy of your memories to keep them safe forever. You can restore this file anytime if you switch devices.
                        </p>
                    </div>
                </div>

                <div className="view-section pt-8 space-y-3 pb-12">
                    <button
                        onClick={handleSwitchIdentityClick}
                        className="w-full flex items-center justify-center gap-2 font-bold text-sm py-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-700 transition-all spring-press"
                    >
                        <Users size={16} /> Switch Identity
                    </button>

                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center justify-center gap-2 text-red-500 font-bold text-sm bg-red-50 py-4 rounded-2xl border border-red-100 transition-all spring-press"
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </div>

            {/* Identity Switch Modal */}
            {showIdentityModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-enter" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-card-hero w-full max-w-sm p-6 animate-modal-enter relative">
                        <button
                            onClick={() => setShowIdentityModal(false)}
                            className="absolute top-4 right-4 p-2 rounded-full transition-colors spring-press"
                            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.12)', color: 'var(--color-text-secondary)' }}
                        >
                            <X size={20} />
                        </button>

                        <h3 className="font-serif font-bold text-2xl text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>Who are you?</h3>
                        <p className="text-center text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>Select your identity to switch profiles.</p>

                        <div className="space-y-4">
                            <button
                                onClick={() => handleIdentitySelect('Tulika')}
                                className="w-full p-4 rounded-2xl flex items-center gap-4 transition-all group spring-press"
                                style={{ background: 'rgba(var(--theme-particle-1-rgb),0.10)', border: '1px solid rgba(var(--theme-particle-1-rgb),0.18)' }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-transform" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.15)' }}>👩🏻</div>
                                <div className="text-left">
                                    <span className="block font-bold text-lg transition-colors" style={{ color: 'var(--color-text-primary)' }}>Tulika</span>
                                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Switch to Tulika's view</span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleIdentitySelect('Ishan')}
                                className="w-full p-4 rounded-2xl flex items-center gap-4 transition-all group spring-press"
                                style={{ background: 'rgba(var(--theme-particle-2-rgb),0.10)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.18)' }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-transform" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.15)' }}>👨🏻</div>
                                <div className="text-left">
                                    <span className="block font-bold text-lg transition-colors" style={{ color: 'var(--color-text-primary)' }}>Ishan</span>
                                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Switch to Ishan's view</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

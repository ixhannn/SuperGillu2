import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Heart, Save, Palette, Check, Download, Upload, Database, ShieldCheck, HardDrive, LogOut, Music, Trash2, AlertCircle, Users } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState, CoupleProfile } from '../types';
import { StorageService } from '../services/storage';
import { ThemeService, THEMES, ThemeId } from '../services/theme';
import { SupabaseService } from '../services/supabase';

interface ProfileProps {
    setView: (view: ViewState) => void;
}

export const Profile: React.FC<ProfileProps> = ({ setView }) => {
    const [profile, setProfile] = useState<CoupleProfile>({
        myName: '',
        partnerName: '',
        anniversaryDate: new Date().toISOString(),
        theme: 'rose'
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
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
    }, []);

    const handleChange = (field: keyof CoupleProfile, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    const handleThemeChange = (themeId: ThemeId) => {
        handleChange('theme', themeId);
        ThemeService.applyTheme(themeId);
    };

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
        localStorage.setItem('tulika_manual_override', 'true');
        window.location.reload();
    };

    const handleSignOut = async () => {
        if (confirm("Are you sure you want to sign out?")) {
            localStorage.removeItem('tulika_manual_override'); // Clear override
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
            a.download = `tulika_backup_${new Date().toISOString().split('T')[0]}.json`;
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
                        className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-all ${isSaving ? 'bg-green-500 text-white' : 'bg-tulika-500 text-white'
                            }`}
                    >
                        {isSaving ? (
                            <>
                                <Save size={16} className="animate-bounce" /> Saved
                            </>
                        ) : 'Save'}
                    </button>
                }
            />

            <div className="p-6 pb-20 flex flex-col items-center overflow-y-auto">

                {/* Photo Upload */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative w-40 h-40 rounded-full border-2 border-white/20 overflow-hidden cursor-pointer mb-10 transition-all duration-500 spring-press"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                    {profile.photo ? (
                        <img src={profile.photo} className="w-full h-full object-cover" alt="Couple" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-tulika-200">
                            <Heart size={48} className="mb-1" fill="currentColor" />
                            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Upload</span>
                        </div>
                    )}

                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 transition-opacity">
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

                <div className="w-full space-y-6">
                    <div className="p-4 rounded-2xl focus-within:ring-2 focus-within:ring-tulika-200 transition-shadow" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">My Name</label>
                        <input
                            type="text"
                            value={profile.myName}
                            onChange={(e) => handleChange('myName', e.target.value)}
                            className="w-full bg-transparent font-serif text-xl text-gray-200 outline-none placeholder-gray-500"
                            placeholder="E.g. Romeo"
                        />
                    </div>

                    <div className="p-4 rounded-2xl focus-within:ring-2 focus-within:ring-tulika-200 transition-shadow" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Partner's Name</label>
                        <input
                            type="text"
                            value={profile.partnerName}
                            onChange={(e) => handleChange('partnerName', e.target.value)}
                            className="w-full bg-transparent font-serif text-xl text-gray-200 outline-none placeholder-gray-500"
                            placeholder="E.g. Juliet"
                        />
                    </div>

                    <div className="p-4 rounded-2xl focus-within:ring-2 focus-within:ring-tulika-200 transition-shadow" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Relationship Start Date</label>
                        <input
                            type="date"
                            value={profile.anniversaryDate ? new Date(profile.anniversaryDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => handleChange('anniversaryDate', new Date(e.target.value).toISOString())}
                            className="w-full bg-transparent font-medium text-lg text-gray-200 outline-none"
                        />
                    </div>

                    {/* Theme Selector */}
                    <div className="p-4 rounded-2xl transition-shadow" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3 flex items-center gap-2">
                            <Palette size={14} /> App Theme
                        </label>
                        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                            {Object.entries(THEMES).map(([id, theme]) => {
                                const isSelected = (profile.theme || 'rose') === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => handleThemeChange(id as ThemeId)}
                                        className={`flex flex-col items-center gap-2 flex-shrink-0 transition-all duration-300 ${isSelected ? 'scale-110' : 'opacity-60'}`}
                                    >
                                        <div
                                            className="w-12 h-12 rounded-full border-4 flex items-center justify-center transition-all"
                                            style={{
                                                backgroundColor: theme.palette[500],
                                                borderColor: isSelected ? theme.palette[200] : 'transparent'
                                            }}
                                        >
                                            {isSelected && <Check size={20} className="text-white" />}
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-wide ${isSelected ? 'text-gray-200' : 'text-gray-500'}`}>
                                            {theme.label.split(' ')[0]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Music Upload */}
                    <div className="p-4 rounded-2xl transition-shadow" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3 flex items-center gap-2">
                            <Music size={14} /> Together Song
                        </label>

                        {musicMeta ? (
                            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="bg-tulika-500/15 p-2.5 rounded-full text-tulika-400 flex-shrink-0">
                                        <Music size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-200 truncate pr-2 leading-tight">
                                            {musicMeta.name}
                                        </p>
                                        <p className="text-[10px] text-tulika-500 font-bold uppercase tracking-wide">
                                            Custom Song Active
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleRemoveMusic}
                                    className="text-gray-400 p-2 rounded-full transition-all"
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
                                        className="flex-1 bg-white/10 border border-white/10 text-gray-200 py-3 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all"
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
                                    <p className="text-[10px] text-gray-400 mt-2 leading-tight">
                                        This song will play when both of you are online at the same time. Max 10MB.
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {/* Storage Status */}
                    <div className="p-5 rounded-2xl mt-4" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.15)' }}>
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                                <HardDrive size={14} /> Storage Vault
                            </label>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-white/10 px-2 py-1 rounded-md">
                                <ShieldCheck size={12} /> {storageInfo.type}
                            </div>
                        </div>

                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-2xl font-mono font-bold text-gray-900">{storageInfo.used}</p>
                                <p className="text-[10px] text-indigo-400">Total stored locally</p>
                            </div>
                            <div className="h-8 w-px bg-indigo-500/30"></div>
                            <div className="text-right">
                                <p className="text-xs text-indigo-400 font-medium">Database Active</p>
                                <p className="text-[10px] text-indigo-500">IndexedDB Engine</p>
                            </div>
                        </div>
                    </div>

                    {/* Data & Backup Section */}
                    <div className="p-5 rounded-2xl mt-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-4 flex items-center gap-2">
                            <Database size={14} /> Backup & Restore
                        </label>

                        <div className="flex gap-3">
                            <button
                                onClick={handleDownloadBackup}
                                disabled={isBackingUp}
                                className="flex-1 bg-white/10 border border-white/10 text-gray-200 py-3 rounded-xl font-bold text-xs uppercase tracking-wide flex flex-col items-center gap-1 active:scale-95 transition-all"
                            >
                                {isBackingUp ? <Download size={20} className="animate-bounce" /> : <Download size={20} />}
                                <span>{isBackingUp ? 'Exporting...' : 'Backup'}</span>
                            </button>

                            <button
                                onClick={() => backupInputRef.current?.click()}
                                className="flex-1 bg-white/10 border border-white/10 text-gray-200 py-3 rounded-xl font-bold text-xs uppercase tracking-wide flex flex-col items-center gap-1 active:scale-95 transition-all"
                            >
                                <Upload size={20} />
                                <span>Restore</span>
                            </button>
                            <input
                                type="file"
                                accept=".json"
                                ref={backupInputRef}
                                className="hidden"
                                onChange={handleRestoreBackup}
                            />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                            Download a copy of your memories to keep them safe forever. You can restore this file anytime if you switch devices.
                        </p>
                    </div>

                    <div className="w-full mt-8 border-t border-white/8 pt-8 space-y-3">
                        <button
                            onClick={handleSwitchIdentityClick}
                            className="w-full flex items-center justify-center gap-2 text-gray-200 font-bold text-sm bg-white/10 border border-white/10 py-3 rounded-xl transition-colors"
                        >
                            <Users size={16} /> Switch Identity
                        </button>

                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center justify-center gap-2 text-red-400 font-bold text-sm bg-red-500/15 py-3 rounded-xl transition-colors"
                        >
                            <LogOut size={16} /> Sign Out
                        </button>
                    </div>
                </div>
            </div>

            {/* Identity Switch Modal */}
            {showIdentityModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-enter" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
                    <div className="w-full max-w-sm rounded-[2rem] p-6 animate-modal-enter relative" style={{ background: 'rgba(20,15,28,0.92)', backdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <button
                            onClick={() => setShowIdentityModal(false)}
                            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-gray-400 transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="font-serif font-bold text-2xl text-center text-gray-900 mb-2">Who are you?</h3>
                        <p className="text-center text-gray-400 text-sm mb-8">Select your identity to switch profiles.</p>

                        <div className="space-y-4">
                            <button
                                onClick={() => handleIdentitySelect('Tulika')}
                                className="w-full p-4 rounded-2xl border border-tulika-500/20 bg-tulika-500/10 flex items-center gap-4 transition-all group spring-press"
                            >
                                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl transition-transform">👩🏻</div>
                                <div className="text-left">
                                    <span className="block font-bold text-gray-900 text-lg transition-colors">Tulika</span>
                                    <span className="text-xs text-gray-400">Switch to Tulika's view</span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleIdentitySelect('Ishan')}
                                className="w-full p-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 flex items-center gap-4 transition-all group spring-press"
                            >
                                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl transition-transform">👨🏻</div>
                                <div className="text-left">
                                    <span className="block font-bold text-gray-900 text-lg transition-colors">Ishan</span>
                                    <span className="text-xs text-gray-400">Switch to Ishan's view</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
import React, { useEffect, useState } from 'react';
import { Sparkles, Heart, RefreshCw } from 'lucide-react';
import { syncEventTarget } from '../services/sync';
import { AmbientService } from '../services/ambient';
import { StorageService } from '../services/storage';
import { useNavigation } from '../App';

export const TogetherMode = () => {
    const [active, setActive] = useState(false);
    const [profile, setProfile] = useState(() => StorageService.getCoupleProfile());
    const { currentView } = useNavigation();

    useEffect(() => {
        const onStart = (e: any) => {
            const { startTime } = e.detail;
            setActive(true);
            setProfile(StorageService.getCoupleProfile());
            AmbientService.syncToSession(startTime);
        };

        const onEnd = () => {
            setActive(false);
            AmbientService.stop();
        };

        const refreshProfile = () => setProfile(StorageService.getCoupleProfile());

        syncEventTarget.addEventListener('together-session-start', onStart);
        syncEventTarget.addEventListener('together-session-end', onEnd);
        window.addEventListener('storage', refreshProfile);

        return () => {
            syncEventTarget.removeEventListener('together-session-start', onStart);
            syncEventTarget.removeEventListener('together-session-end', onEnd);
            window.removeEventListener('storage', refreshProfile);
        };
    }, []);

    if (!active || currentView === 'home') return null;

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-40 animate-spring-in w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.45rem)' }}
        >
            <div
                className="relative overflow-hidden rounded-[1.8rem] px-4 py-3 flex items-center gap-3"
                style={{
                    background: 'linear-gradient(135deg, rgba(255,249,251,0.86) 0%, rgba(255,240,246,0.78) 45%, rgba(245,255,249,0.82) 100%)',
                    backdropFilter: 'blur(28px) saturate(170%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(170%)',
                    border: '1px solid rgba(255,255,255,0.92)',
                    boxShadow: '0 18px 42px rgba(236,72,153,0.18), inset 0 1px 0 rgba(255,255,255,0.96)',
                }}
            >
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'radial-gradient(circle at 16% 24%, rgba(251,207,232,0.55) 0%, rgba(251,207,232,0.14) 22%, transparent 44%), radial-gradient(circle at 84% 24%, rgba(187,247,208,0.42) 0%, rgba(187,247,208,0.14) 22%, transparent 44%)',
                    }}
                />

                <div className="relative z-10">
                    <div className="absolute inset-0 rounded-full bg-lior-300 blur-md opacity-60" />
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/85 bg-white/70 shadow-[0_8px_18px_rgba(236,72,153,0.12)]">
                        <Heart size={17} fill="currentColor" className="animate-breathe text-lior-500" />
                    </div>
                </div>

                <div className="relative z-10 flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[1rem] font-semibold tracking-[-0.02em] text-slate-800">
                        {profile.myName} <span className="text-lior-500">&</span> {profile.partnerName}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-lior-600">
                        Together right now <Sparkles size={10} />
                    </span>
                </div>

                <div
                    className="relative z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                    style={{
                        background: 'linear-gradient(135deg, rgba(236,253,245,0.92) 0%, rgba(209,250,229,0.88) 100%)',
                        border: '1px solid rgba(167,243,208,0.95)',
                        boxShadow: '0 10px 20px rgba(16,185,129,0.12)',
                    }}
                >
                    <RefreshCw size={12} className="text-emerald-700" />
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-800">Synced</span>
                </div>
            </div>
        </div>
    );
};

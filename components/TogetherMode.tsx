import React, { useEffect, useState } from 'react';
import { Sparkles, Heart, Music } from 'lucide-react';
import { syncEventTarget } from '../services/sync';
import { AmbientService } from '../services/ambient';

export const TogetherMode = () => {
    const [active, setActive] = useState(false);

    useEffect(() => {
        const onStart = (e: any) => {
            const { startTime } = e.detail;
            setActive(true);
            AmbientService.syncToSession(startTime);
        };

        const onEnd = () => {
            setActive(false);
            AmbientService.stop();
        };

        syncEventTarget.addEventListener('together-session-start', onStart);
        syncEventTarget.addEventListener('together-session-end', onEnd);

        return () => {
            syncEventTarget.removeEventListener('together-session-start', onStart);
            syncEventTarget.removeEventListener('together-session-end', onEnd);
        };
    }, []);

    if (!active) return null;

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-spring-in w-max">
            <div className="bg-gradient-to-r from-indigo-900/90 to-purple-900/90 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-white/20">
                <div className="relative">
                    <div className="absolute inset-0 bg-tulika-500 rounded-full animate-ping opacity-50"></div>
                    <div className="bg-tulika-500 p-2 rounded-full relative z-10">
                        <Heart size={16} fill="currentColor" className="animate-breathe" />
                    </div>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-purple-200">Shared Session</span>
                    <span className="text-xs font-medium flex items-center gap-1">Syncing music... <Sparkles size={10} /></span>
                </div>
            </div>
        </div>
    );
};
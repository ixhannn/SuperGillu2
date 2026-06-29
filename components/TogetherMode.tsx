import React, { useEffect } from 'react';
import { syncEventTarget } from '../services/sync';
import { AmbientService } from '../services/ambient';
import { StorageService } from '../services/storage';
import { Haptics } from '../services/haptics';

export const TogetherMode = () => {
    // ── Start solo ambient playback on first user interaction ──
    useEffect(() => {
        let started = false;
        const tryStart = () => {
            if (started) return;
            started = true;
            StorageService.getTogetherMusic().then(src => {
                if (src) AmbientService.startSolo().catch(() => undefined);
            }).catch(() => undefined);
        };
        // Use capture so we catch the very first tap/click
        window.addEventListener('touchstart', tryStart, { once: true, capture: true, passive: true });
        window.addEventListener('mousedown',  tryStart, { once: true, capture: true });
        return () => {
            window.removeEventListener('touchstart', tryStart, { capture: true });
            window.removeEventListener('mousedown',  tryStart, { capture: true });
        };
    }, []);

    useEffect(() => {
        const onStart = (e: any) => {
            const startTime = typeof e.detail?.startTime === 'number' ? e.detail.startTime : Date.now();
            Haptics.doubleBeat().catch(() => undefined);
            AmbientService.syncToSession(startTime).catch(() => undefined);
        };

        const onEnd = () => {
            // Keep music playing but at solo (quieter) volume
            AmbientService.downgradeToSolo();
        };

        syncEventTarget.addEventListener('together-session-start', onStart);
        syncEventTarget.addEventListener('together-session-end', onEnd);

        return () => {
            syncEventTarget.removeEventListener('together-session-start', onStart);
            syncEventTarget.removeEventListener('together-session-end', onEnd);
        };
    }, []);

    return null;
};

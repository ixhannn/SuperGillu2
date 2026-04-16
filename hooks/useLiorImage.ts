import { useState, useEffect, useCallback, useRef } from 'react';
import { StorageService, storageEventTarget } from '../services/storage';

/**
 * Custom hook to resolve media (Images/Videos) from RAM -> IndexedDB -> Cloud Payload.
 *
 * Returns:
 *  - src: the resolved URL or base64 string (null while loading or unavailable)
 *  - isLoading: true while the initial resolution is in progress
 *  - handleError: attach to <img onError={handleError}> and <video onError={handleError}>
 *                 If a remote URL fails, this retries using local data first and
 *                 then a direct media download fallback.
 */
export const useLiorMedia = (mediaId?: string, fallbackData?: string, storagePath?: string) => {
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Keep a ref so handlers can inspect the current source without effect churn.
    const srcRef = useRef<string | null>(null);
    srcRef.current = src;

    useEffect(() => {
        let isMounted = true;

        const resolve = async () => {
            if (!mediaId && !fallbackData && !storagePath) {
                if (isMounted) {
                    setSrc(null);
                    setIsLoading(false);
                }
                return;
            }

            try {
                const data = await StorageService.getImage(mediaId || '', fallbackData, storagePath);
                if (isMounted) {
                    setSrc(data);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('[useLiorMedia] resolve failed', mediaId, error);
                if (isMounted) {
                    setSrc(fallbackData || null);
                    setIsLoading(false);
                }
            }
        };

        resolve();

        return () => {
            isMounted = false;
        };
    }, [mediaId, fallbackData, storagePath]);

    // If sync fills in missing metadata after first render, retry the full resolver.
    useEffect(() => {
        if (!mediaId && !fallbackData && !storagePath) return;

        const handler = async () => {
            const cur = srcRef.current;
            const isLocalData = cur !== null && !cur.startsWith('http');
            if (isLocalData) return;

            try {
                const data = await StorageService.getImage(mediaId || '', fallbackData, storagePath);
                if (data && data !== srcRef.current) setSrc(data);
            } catch {
                // Best-effort retry on the next storage update.
            }
        };

        storageEventTarget.addEventListener('storage-update', handler);
        return () => storageEventTarget.removeEventListener('storage-update', handler);
    }, [mediaId, fallbackData, storagePath]);

    // Retry if sync finishes after mount or the first request races the UI.
    useEffect(() => {
        if (!mediaId && !fallbackData && !storagePath) return;

        const delays = [2000, 5000, 12000];
        const timers: ReturnType<typeof setTimeout>[] = [];

        for (const delay of delays) {
            timers.push(setTimeout(async () => {
                if (srcRef.current !== null) return;
                try {
                    const data = await StorageService.getImage(mediaId || '', fallbackData, storagePath);
                    if (data) setSrc(data);
                } catch {
                    // Best-effort retry only.
                }
            }, delay));
        }

        return () => timers.forEach(t => clearTimeout(t));
    }, [mediaId, fallbackData, storagePath]);

    /**
     * Call this as onError on <img> / <video> elements.
     * When a remote URL fails to render, retry with local cache first and then
     * a direct media download fallback so the component can recover to a data URI.
     */
    const handleError = useCallback(async () => {
        if (!src || !src.startsWith('http')) return;
        try {
            const localSrc = await StorageService.getImageLocalOnly(mediaId || '', fallbackData, storagePath);
            if (localSrc) {
                setSrc(localSrc);
                return;
            }
            setSrc(null);
        } catch {
            setSrc(null);
        }
    }, [src, mediaId, fallbackData, storagePath]);

    return { src, isLoading, handleError };
};

// Re-export for backward compatibility if needed, or alias
export const useLiorImage = useLiorMedia;

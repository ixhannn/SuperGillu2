import { useState, useEffect, useCallback, useRef } from 'react';
import { StorageService, storageEventTarget } from '../services/storage';

const mediaRequestCache = new Map<string, Promise<string | null>>();
const mediaValueCache = new Map<string, string | null>();

const buildMediaKey = (mediaId?: string, fallbackData?: string, storagePath?: string) => (
    [mediaId || '', storagePath || '', fallbackData ? `fallback:${fallbackData.length}` : ''].join('|')
);

const resolveCachedMedia = async (mediaId?: string, fallbackData?: string, storagePath?: string) => {
    const key = buildMediaKey(mediaId, fallbackData, storagePath);
    if (mediaValueCache.has(key)) return mediaValueCache.get(key) ?? null;

    const existing = mediaRequestCache.get(key);
    if (existing) return existing;

    const request = StorageService.getImage(mediaId || '', fallbackData, storagePath)
        .then((value) => {
            mediaValueCache.set(key, value ?? null);
            return value ?? null;
        })
        .finally(() => {
            mediaRequestCache.delete(key);
        });

    mediaRequestCache.set(key, request);
    return request;
};

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
                const data = await resolveCachedMedia(mediaId, fallbackData, storagePath);
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
        if (src !== null) return;

        let timer: ReturnType<typeof setTimeout> | null = null;
        const retry = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                if (srcRef.current !== null) return;
                try {
                    const data = await resolveCachedMedia(mediaId, fallbackData, storagePath);
                    if (data) setSrc(data);
                } catch {
                    // Best-effort retry only.
                }
            }, 900);
        };

        storageEventTarget.addEventListener('storage-update', retry);
        return () => {
            if (timer) clearTimeout(timer);
            storageEventTarget.removeEventListener('storage-update', retry);
        };
    }, [mediaId, fallbackData, storagePath, src]);

    /**
     * Call this as onError on <img> / <video> elements.
     * When a remote URL fails to render, retry with local cache first and then
     * a direct media download fallback so the component can recover to a data URI.
     */
    const handleError = useCallback(async () => {
        if (!src || !src.startsWith('http')) return;
        try {
            mediaValueCache.delete(buildMediaKey(mediaId, fallbackData, storagePath));
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

import { useState, useEffect } from 'react';
import { StorageService } from '../services/storage';

/**
 * Custom hook to resolve media (Images/Videos) from RAM -> IndexedDB -> Cloud Payload.
 */
export const useTulikaMedia = (mediaId?: string, fallbackData?: string, storagePath?: string) => {
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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
                console.error("Media resolution failed", error);
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

    return { src, isLoading };
};

// Re-export for backward compatibility if needed, or alias
export const useTulikaImage = useTulikaMedia;
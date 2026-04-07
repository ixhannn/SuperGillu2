import { SupabaseService } from './supabase';

const BUCKET = 'tulika-media';
const SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

// In-memory cache for signed URLs to avoid re-generating on every render
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const downloadedMediaCache = new Map<string, string>();

function dataUriToBlob(dataUri: string): { blob: Blob; contentType: string } {
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        const binary = atob(dataUri);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { blob: new Blob([bytes], { type: 'image/jpeg' }), contentType: 'image/jpeg' };
    }

    const contentType = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type: contentType }), contentType };
}

export const MediaStorageService = {
    async buildPath(prefix: string, itemId: string, type: 'image' | 'video'): Promise<string> {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const coupleId = await SupabaseService.getCurrentCoupleId();
        return coupleId ? `${coupleId}/${prefix}/${itemId}/${type}.${ext}` : `${prefix}/${itemId}/${type}.${ext}`;
    },

    async isScopedToCurrentUser(storagePath: string): Promise<boolean> {
        const coupleId = await SupabaseService.getCurrentCoupleId();
        return !!coupleId && storagePath.startsWith(`${coupleId}/`);
    },

    async ensureBucket(): Promise<boolean> {
        if (!SupabaseService.client) return false;
        try {
            // Private bucket — no public access, requires signed URLs
            const { error } = await SupabaseService.client.storage.createBucket(BUCKET, {
                public: false,
                fileSizeLimit: 15 * 1024 * 1024,
                allowedMimeTypes: ['image/*', 'video/*'],
            });
            if (error && !error.message?.includes('already exists')) {
                console.warn('Bucket creation failed:', error.message);
            }
            return true;
        } catch (e) {
            console.warn('Bucket setup error:', e);
            return false;
        }
    },

    async uploadMedia(base64DataUri: string, storagePath: string): Promise<string | null> {
        if (!SupabaseService.client || !base64DataUri) return null;

        try {
            const { blob, contentType } = dataUriToBlob(base64DataUri);
            const { error } = await SupabaseService.client.storage
                .from(BUCKET)
                .upload(storagePath, blob, { upsert: true, contentType });

            if (error) {
                console.warn('Storage upload failed:', error.message);
                return null;
            }
            return storagePath;
        } catch (e) {
            console.warn('Upload exception:', e);
            return null;
        }
    },

    /**
     * Get a signed (temporary) URL for a private file.
     * URLs are cached in memory and refreshed 5 minutes before expiry.
     */
    async getSignedUrl(storagePath: string): Promise<string | null> {
        if (!SupabaseService.client || !storagePath) return null;

        // Check cache — reuse if still valid (with 5 min buffer)
        const cached = signedUrlCache.get(storagePath);
        if (cached && cached.expiresAt > Date.now() + 300_000) {
            return cached.url;
        }

        try {
            const { data, error } = await SupabaseService.client.storage
                .from(BUCKET)
                .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

            if (error || !data?.signedUrl) {
                console.warn('Signed URL failed:', error?.message);
                return null;
            }

            signedUrlCache.set(storagePath, {
                url: data.signedUrl,
                expiresAt: Date.now() + SIGNED_URL_EXPIRY * 1000,
            });

            return data.signedUrl;
        } catch (e) {
            console.warn('Signed URL exception:', e);
            return null;
        }
    },

    async getAccessibleUrl(storagePath: string): Promise<string | null> {
        if (!storagePath) return null;

        const signedUrl = await this.getSignedUrl(storagePath);
        if (signedUrl) return signedUrl;
        if (!SupabaseService.client) return null;

        const cachedDownload = downloadedMediaCache.get(storagePath);
        if (cachedDownload) return cachedDownload;

        try {
            const { data, error } = await SupabaseService.client.storage
                .from(BUCKET)
                .download(storagePath);

            if (error || !data) {
                console.warn('Storage download failed:', error?.message);
                return null;
            }

            const objectUrl = URL.createObjectURL(data);
            downloadedMediaCache.set(storagePath, objectUrl);
            return objectUrl;
        } catch (e) {
            console.warn('Storage download exception:', e);
            return null;
        }
    },

    async deleteMedia(storagePath: string): Promise<void> {
        if (!SupabaseService.client || !storagePath) return;
        try {
            await SupabaseService.client.storage.from(BUCKET).remove([storagePath]);
            signedUrlCache.delete(storagePath);
            const objectUrl = downloadedMediaCache.get(storagePath);
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                downloadedMediaCache.delete(storagePath);
            }
        } catch (e) {
            console.warn('Storage delete failed:', e);
        }
    },
};

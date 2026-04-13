import { SupabaseService } from './supabase';

const WORKER_URL = (import.meta.env.VITE_R2_WORKER_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const UPLOAD_KEY = (import.meta.env.VITE_R2_UPLOAD_KEY as string | undefined) ?? '';

const authHeaders = () => ({
    'X-Upload-Key': UPLOAD_KEY,
});

/** Convert a base64 data URI to an ArrayBuffer + MIME type. */
function base64ToBuffer(dataUri: string): { buffer: ArrayBuffer; mimeType: string } {
    const [header, data] = dataUri.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { buffer: bytes.buffer, mimeType };
}

/**
 * Compress an image data URI using Canvas.
 * - Resizes to at most `maxPx` on the longest side.
 * - Re-encodes as JPEG at `quality`.
 * - Skips SVGs and non-image URIs (returns original unchanged).
 * - Falls back to the original on any error.
 */
export async function compressImage(
    dataUri: string,
    maxPx = 1920,
    quality = 0.85,
): Promise<string> {
    if (!dataUri || !dataUri.startsWith('data:image/')) return dataUri;
    if (dataUri.startsWith('data:image/svg')) return dataUri; // SVG: no compression needed

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxPx || height > maxPx) {
                const ratio = Math.min(maxPx / width, maxPx / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(dataUri); return; }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUri); // fallback: keep original
        img.src = dataUri;
    });
}

export const MediaStorageService = {
    async buildPath(prefix: string, itemId: string, type: 'image' | 'video'): Promise<string> {
        const coupleId = await SupabaseService.getCurrentCoupleId();
        const scope = coupleId ?? 'guest';
        return `${scope}/${prefix}/${itemId}/${type}`;
    },

    async isScopedToCurrentUser(_storagePath: string): Promise<boolean> {
        return true;
    },

    async ensureBucket(): Promise<boolean> {
        return true;
    },

    async uploadMedia(base64DataUri: string, storagePath: string): Promise<string | null> {
        if (!base64DataUri) return null;
        if (!WORKER_URL) {
            console.warn('[R2] VITE_R2_WORKER_URL not configured — upload skipped.');
            return null;
        }
        if (!UPLOAD_KEY) {
            console.warn('[R2] VITE_R2_UPLOAD_KEY not configured — upload skipped.');
            return null;
        }

        try {
            let body: BodyInit;
            let contentType: string;

            if (base64DataUri.startsWith('data:')) {
                const { buffer, mimeType } = base64ToBuffer(base64DataUri);
                body = buffer;
                contentType = mimeType;
            } else {
                // Already a URL (e.g. re-upload from existing http URL) — fetch and forward
                const res = await fetch(base64DataUri);
                body = await res.arrayBuffer();
                contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
            }

            const res = await fetch(`${WORKER_URL}/${storagePath}`, {
                method: 'PUT',
                headers: { ...authHeaders(), 'Content-Type': contentType },
                body,
            });

            if (!res.ok) {
                console.warn(`[R2] Upload failed (${res.status}):`, await res.text());
                return null;
            }

            // Return the public URL the app will use for display
            return `${WORKER_URL}/${storagePath}`;
        } catch (e) {
            console.warn('[R2] Upload exception:', e);
            return null;
        }
    },

    async getSignedUrl(storagePath: string): Promise<string | null> {
        return MediaStorageService.getAccessibleUrl(storagePath);
    },

    async getAccessibleUrl(storagePath: string): Promise<string | null> {
        if (!storagePath) return null;
        // Already an absolute URL (Cloudinary legacy or full Worker URL)
        if (storagePath.startsWith('http')) return storagePath;
        // Relative R2 path → build Worker URL
        if (WORKER_URL) return `${WORKER_URL}/${storagePath}`;
        return null;
    },

    async deleteMedia(storagePath: string): Promise<void> {
        if (!storagePath || !WORKER_URL || !UPLOAD_KEY) return;
        // Resolve to a relative key if a full URL was stored
        const key = storagePath.startsWith(WORKER_URL)
            ? storagePath.slice(WORKER_URL.length + 1)
            : storagePath;
        try {
            const res = await fetch(`${WORKER_URL}/${key}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (!res.ok) console.warn(`[R2] Delete failed (${res.status}):`, await res.text());
        } catch (e) {
            console.warn('[R2] Delete exception:', e);
        }
    },
};

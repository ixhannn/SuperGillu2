/**
 * Shared media processing utilities.
 *
 * Single source of truth for image compression, video thumbnail generation,
 * and validation constants used across DailyMoments, AddMemory, and KeepsakeBox.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum dimension (width or height) for compressed images */
export const IMAGE_MAX_SIZE = 800;

/** Maximum dimension for video thumbnails (smaller for fast grid rendering) */
export const THUMB_MAX_SIZE = 600;

/** JPEG quality for all compressed outputs */
export const IMAGE_QUALITY = 0.7;

/** Maximum video file size in bytes (25 MB) */
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clamp dimensions to fit within `maxSize` while preserving aspect ratio.
 * Returns rounded integer dimensions ready for canvas use.
 */
const clampDimensions = (
    w: number,
    h: number,
    maxSize: number
): { width: number; height: number } => {
    if (w <= maxSize && h <= maxSize) return { width: w, height: h };
    const ratio = Math.min(maxSize / w, maxSize / h);
    return {
        width: Math.round(w * ratio),
        height: Math.round(h * ratio),
    };
};

// ─── Public API ──────────────────────────────────────────────────────────────

import imageCompression from 'browser-image-compression';

/**
 * Compress an image file to a JPEG data-URL.
 */
export const compressImage = async (file: File): Promise<string> => {
    const options = {
        maxSizeMB: 0.2, // ~200KB
        maxWidthOrHeight: IMAGE_MAX_SIZE,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: IMAGE_QUALITY
    };
    
    try {
        const compressedFile = await imageCompression(file, options);
        // Convert Blob to Data URL
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(compressedFile);
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Generate a JPEG thumbnail data-URL from a video file.
 *
 * - Seeks to 0.5 s to avoid a black first-frame.
 * - Scales down to fit within `THUMB_MAX_SIZE` px.
 * - Calculates target dimensions *before* setting canvas size (avoids a resize
 *   bug present in earlier inline implementations).
 * - Revokes the object URL after capture to prevent memory leaks.
 * - Returns an empty string on failure so callers can gracefully degrade.
 */
export const generateVideoThumbnail = (file: File): Promise<string> =>
    new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onerror = () => {
            URL.revokeObjectURL(video.src);
            resolve('');
        };

        video.onloadedmetadata = () => {
            video.currentTime = 0.5;
        };

        video.onseeked = () => {
            const { width, height } = clampDimensions(
                video.videoWidth,
                video.videoHeight,
                THUMB_MAX_SIZE
            );
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
            URL.revokeObjectURL(video.src);
        };

        video.src = URL.createObjectURL(file);
    });

/**
 * Returns `true` when the file exceeds the allowed video size limit.
 */
export const isVideoTooLarge = (file: File): boolean =>
    file.size > VIDEO_MAX_BYTES;

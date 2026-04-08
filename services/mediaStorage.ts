import { SupabaseService } from './supabase';

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/upload`;
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const MediaStorageService = {
    async buildPath(prefix: string, itemId: string, type: 'image' | 'video'): Promise<string> {
        const coupleId = await SupabaseService.getCurrentCoupleId();
        // Return without extension for Cloudinary public_id
        return coupleId ? `${coupleId}/${prefix}/${itemId}/${type}` : `guest/${prefix}/${itemId}/${type}`;
    },

    async isScopedToCurrentUser(storagePath: string): Promise<boolean> {
        return true; 
    },

    async ensureBucket(): Promise<boolean> {
        return true; 
    },

    async uploadMedia(base64DataUri: string, storagePath: string): Promise<string | null> {
        if (!base64DataUri) return null;
        if (!import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || !import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET) {
            console.warn('Cloudinary not configured. Missing VITE_CLOUDINARY_CLOUD_NAME or VITE_CLOUDINARY_UPLOAD_PRESET.');
            return null;
        }

        try {
            const formData = new FormData();
            formData.append('file', base64DataUri);
            formData.append('upload_preset', CLOUDINARY_PRESET);
            formData.append('public_id', storagePath);

            const response = await fetch(CLOUDINARY_URL, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            if (data.secure_url) {
                return data.secure_url;
            }
            console.warn('Cloudinary upload failed:', data);
            return null;
        } catch (e) {
            console.warn('Cloudinary Upload exception:', e);
            return null;
        }
    },

    async getSignedUrl(storagePath: string): Promise<string | null> {
        if (storagePath.startsWith('http')) return storagePath;
        return null;
    },

    async getAccessibleUrl(storagePath: string): Promise<string | null> {
        if (storagePath?.startsWith('http')) return storagePath;
        return null;
    },

    async deleteMedia(storagePath: string): Promise<void> {
        // Cloudinary unsigned uploads do not support direct client-side deletion.
        // Requires a backend signature. 
        console.warn('Delete media skipped for unsigned Cloudinary config.');
    },
};

import { MediaAssetUploadInput, SupabaseService } from './supabase';
import {
    estimateDataUriBytes,
    getMaxUploadBytesForManagedAsset,
    getMimeTypeFromDataUri,
    isManagedUploadKey as isManagedUploadKeyShared,
    isMimeAllowedForManagedAsset,
    normalizeMimeType,
    parseManagedMediaKey,
} from '../shared/mediaPolicy.js';

const WORKER_URL = (import.meta.env.VITE_R2_WORKER_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const UPLOAD_KEY = (import.meta.env.VITE_R2_UPLOAD_KEY as string | undefined)?.trim() ?? '';
const LEGACY_SUPABASE_BUCKETS = ['lior-media', 'tulika-media'] as const;
const R2_EXISTENCE_CACHE = new Map<string, boolean>();
const MISSING_READ_REPORT_CACHE = new Map<string, number>();

type LegacySupabaseRef = {
    bucket: string;
    key: string;
    absoluteUrl?: string;
};

type ManagedFeature =
    | 'memories'
    | 'daily-moments'
    | 'keepsakes'
    | 'time-capsules'
    | 'surprises'
    | 'voice-notes'
    | 'together-music';

type ManagedAssetRole = 'image' | 'video' | 'audio' | 'track';

type BuildPathOptions = {
    coupleId?: string | null;
    ownerUserId?: string | null;
    timestamp?: string | null;
    feature?: ManagedFeature;
    assetRole?: ManagedAssetRole;
};

type UploadMediaOptions = {
    sourceTable?: string;
    logicalRowId?: string;
    itemId?: string;
    ownerUserId?: string | null;
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
};

const FEATURE_BY_PREFIX: Record<string, ManagedFeature> = {
    mem: 'memories',
    daily: 'daily-moments',
    keep: 'keepsakes',
    cap: 'time-capsules',
    surp: 'surprises',
    vn: 'voice-notes',
};
const SOURCE_TABLE_BY_FEATURE: Record<ManagedFeature, string> = {
    memories: 'memories',
    'daily-moments': 'daily_photos',
    keepsakes: 'keepsakes',
    'time-capsules': 'time_capsules',
    surprises: 'surprises',
    'voice-notes': 'voice_notes',
    'together-music': 'together_music',
};

const MANAGED_KEY_PREFIX = 'v2/couples/';

const authHeaders = async (): Promise<Record<string, string> | null> => {
    if (!SupabaseService.init()) return null;

    const accessToken = await SupabaseService.getAccessToken();
    const { anonKey } = SupabaseService.getProjectConfig();
    if (!accessToken || !anonKey) return null;

    return {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
    };
};

const managedWriteHeaders = async (): Promise<Record<string, string> | null> => {
    const supabaseHeaders = await authHeaders();
    if (supabaseHeaders) {
        return supabaseHeaders;
    }

    if (UPLOAD_KEY) {
        return {
            'X-Upload-Key': UPLOAD_KEY,
        };
    }

    return null;
};

/** Convert a base64 data URI to an ArrayBuffer + MIME type. */
function base64ToBuffer(dataUri: string): { buffer: ArrayBuffer; mimeType: string } {
    const [header, data] = dataUri.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { buffer: bytes.buffer, mimeType };
}

const stripLeadingSlash = (value: string) => value.replace(/^\/+/, '');

const tryParseUrl = (value: string): URL | null => {
    try {
        return new URL(value);
    } catch {
        return null;
    }
};

const encodePathSegments = (value: string) => value.split('/').map(encodeURIComponent).join('/');

const joinWorkerUrl = (key: string) => WORKER_URL ? `${WORKER_URL}/${encodePathSegments(stripLeadingSlash(key))}` : null;

const sanitizePathSegment = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'unknown';
    return trimmed.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown';
};

const normalizeManagedSegment = (value?: string | null, fallback = 'unknown') => {
    const normalized = sanitizePathSegment(value ?? '');
    return normalized || fallback;
};

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const getUtcBucket = (timestamp?: string | null) => {
    const parsed = timestamp ? new Date(timestamp) : new Date();
    const effective = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return {
        year: String(effective.getUTCFullYear()),
        month: String(effective.getUTCMonth() + 1).padStart(2, '0'),
    };
};

const isManagedUploadKey = (value: string): boolean => {
    return isManagedUploadKeyShared(stripLeadingSlash(value));
};

const isCanonicalManagedKeyForCouple = (value: string, coupleId?: string | null): boolean => {
    const key = stripLeadingSlash(value);
    if (!coupleId) return key.startsWith(MANAGED_KEY_PREFIX);
    return key.startsWith(`${MANAGED_KEY_PREFIX}${sanitizePathSegment(coupleId)}/`);
};

const buildManagedMediaKey = ({
    coupleId,
    ownerUserId,
    feature,
    itemId,
    assetRole,
    timestamp,
}: {
    coupleId?: string | null;
    ownerUserId?: string | null;
    feature: ManagedFeature;
    itemId: string;
    assetRole: ManagedAssetRole;
    timestamp?: string | null;
}) => {
    const { year, month } = getUtcBucket(timestamp);
    const normalizedCoupleId = normalizeManagedSegment(coupleId, 'guest');
    const normalizedItemId = normalizeManagedSegment(itemId, 'item');
    const normalizedFeature = normalizeManagedSegment(feature);
    const normalizedAssetRole = normalizeManagedSegment(assetRole);
    const normalizedOwner = ownerUserId ? normalizeManagedSegment(ownerUserId) : null;
    const ownerNamespace = normalizedOwner
        ? `users/${normalizedOwner}`
        : 'legacy';

    return `v2/couples/${normalizedCoupleId}/${ownerNamespace}/${normalizedFeature}/${year}/${month}/${normalizedItemId}/${normalizedAssetRole}`;
};

const normalizeSignedUrl = (value?: string | null) => {
    if (!value) return null;
    if (value.startsWith('http')) return value;
    if (!SUPABASE_URL) return value;
    return `${SUPABASE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
};

const blobToDataUri = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});

const bufferToHex = (buffer: ArrayBuffer): string =>
    Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(digest);
};

const shouldReportMissingRead = (key: string) => {
    const now = Date.now();
    const last = MISSING_READ_REPORT_CACHE.get(key) ?? 0;
    if (now - last < 15 * 60 * 1000) return false;
    MISSING_READ_REPORT_CACHE.set(key, now);
    return true;
};

const reportMissingRead = async (storagePath: string, reason: string) => {
    const key = extractCandidateR2Key(storagePath);
    if (!key || !shouldReportMissingRead(key) || !SupabaseService.init()) return;
    const parsedKey = parseManagedMediaKey(key);
    await SupabaseService.recordStorageEvent({
        eventType: 'media.read_missing',
        severity: 'warning',
        feature: parsedKey?.feature ?? null,
        r2Key: key,
        sourceTable: null,
        logicalRowId: parsedKey?.itemId ?? null,
        metadata: { storagePath, reason },
    });
};

const downloadUrlAsDataUri = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) return null;
    return blobToDataUri(await res.blob());
};

const parseSupabaseStorageRef = (storagePath: string): LegacySupabaseRef | null => {
    const parsed = tryParseUrl(storagePath);
    if (!parsed) return null;

    const marker = '/storage/v1/object/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const rest = parsed.pathname.slice(markerIndex + marker.length);
    const segments = rest.split('/').filter(Boolean);
    if (segments.length < 3) return null;

    if (segments[0] === 'render' && segments[1] === 'image' && segments.length >= 5) {
        return {
            bucket: segments[3],
            key: decodeURIComponent(segments.slice(4).join('/')),
            absoluteUrl: parsed.toString(),
        };
    }

    return {
        bucket: segments[1],
        key: decodeURIComponent(segments.slice(2).join('/')),
        absoluteUrl: parsed.toString(),
    };
};

const extractCandidateR2Key = (storagePath: string): string | null => {
    const parsedSupabase = parseSupabaseStorageRef(storagePath);
    if (parsedSupabase?.key) return stripLeadingSlash(parsedSupabase.key);

    const parsed = tryParseUrl(storagePath);
    if (parsed) {
        return stripLeadingSlash(decodeURIComponent(parsed.pathname));
    }

    return stripLeadingSlash(storagePath);
};

const extractR2Key = (storagePath: string): string | null => {
    if (!storagePath || storagePath.startsWith('data:')) return null;

    return extractCandidateR2Key(storagePath);
};

const isLegacyMediaReference = (value?: string | null): boolean => {
    if (!value || value.startsWith('data:') || value.startsWith('blob:')) return false;
    if (parseSupabaseStorageRef(value)) return true;
    if (tryParseUrl(value)) return true;
    return value.includes('/');
};

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
    if (dataUri.startsWith('data:image/svg')) return dataUri;

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
        img.onerror = () => resolve(dataUri);
        img.src = dataUri;
    });
}

async function downloadFromSupabaseBucket(bucket: string, key: string): Promise<string | null> {
    if (!key || !SupabaseService.init() || !SupabaseService.client) return null;

    try {
        const { data, error } = await SupabaseService.client.storage.from(bucket).download(key);
        if (error || !data) return null;
        return await blobToDataUri(data);
    } catch {
        return null;
    }
}

async function deleteFromSupabaseBucket(bucket: string, key: string): Promise<void> {
    if (!key || !SupabaseService.init() || !SupabaseService.client) return;

    try {
        await SupabaseService.client.storage.from(bucket).remove([key]);
    } catch {
        // Best-effort cleanup only.
    }
}

export const MediaStorageService = {
    isMediaReference(value?: string | null): boolean {
        return isLegacyMediaReference(value);
    },

    isManagedUploadKey(value: string): boolean {
        return isManagedUploadKey(value);
    },

    toR2Key(storagePath: string): string | null {
        return extractR2Key(storagePath);
    },

    async buildPath(prefix: string, itemId: string, type: 'image' | 'video', options: BuildPathOptions = {}): Promise<string> {
        const coupleId = options.coupleId ?? await SupabaseService.getCurrentCoupleId();
        const ownerUserId = hasOwn(options, 'ownerUserId')
            ? options.ownerUserId ?? null
            : await SupabaseService.getCurrentUserId();
        const feature = options.feature ?? FEATURE_BY_PREFIX[prefix] ?? 'memories';
        const assetRole = options.assetRole ?? type;

        return buildManagedMediaKey({
            coupleId,
            ownerUserId,
            feature,
            itemId,
            assetRole,
            timestamp: options.timestamp,
        });
    },

    async buildCustomPath(itemId: string, feature: ManagedFeature, assetRole: ManagedAssetRole, options: BuildPathOptions = {}): Promise<string> {
        const coupleId = options.coupleId ?? await SupabaseService.getCurrentCoupleId();
        const ownerUserId = hasOwn(options, 'ownerUserId')
            ? options.ownerUserId ?? null
            : await SupabaseService.getCurrentUserId();

        return buildManagedMediaKey({
            coupleId,
            ownerUserId,
            feature,
            itemId,
            assetRole,
            timestamp: options.timestamp,
        });
    },

    async probeR2Path(storagePath: string): Promise<boolean | null> {
        const key = extractR2Key(storagePath);
        const url = key ? joinWorkerUrl(key) : null;
        if (!key || !url) return false;
        if (R2_EXISTENCE_CACHE.has(key)) return R2_EXISTENCE_CACHE.get(key)!;

        try {
            const res = await fetch(url, { method: 'HEAD' });
            if (res.ok) {
                R2_EXISTENCE_CACHE.set(key, true);
                return true;
            }
            if (res.status === 404) {
                R2_EXISTENCE_CACHE.set(key, false);
                reportMissingRead(storagePath, 'head-404').catch(() => {});
                return false;
            }
            return null;
        } catch {
            return null;
        }
    },

    async isScopedToCurrentUser(storagePath: string): Promise<boolean> {
        const key = extractR2Key(storagePath);
        if (!key) return false;

        const coupleId = await SupabaseService.getCurrentCoupleId();
        if (!isCanonicalManagedKeyForCouple(key, coupleId)) return false;

        const exists = await MediaStorageService.probeR2Path(storagePath);
        return exists !== false;
    },

    async ensureBucket(): Promise<boolean> {
        return true;
    },

    async uploadMedia(base64DataUri: string, storagePath: string, options: UploadMediaOptions = {}): Promise<string | null> {
        if (!base64DataUri) return null;
        if (!WORKER_URL) {
            console.warn('[R2] VITE_R2_WORKER_URL not configured - upload skipped.');
            return null;
        }

        try {
            let bodyBuffer: ArrayBuffer;
            let contentType: string;

            if (base64DataUri.startsWith('data:')) {
                const { buffer, mimeType } = base64ToBuffer(base64DataUri);
                bodyBuffer = buffer;
                contentType = mimeType;
            } else {
                const res = await fetch(base64DataUri);
                bodyBuffer = await res.arrayBuffer();
                contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
            }

            const key = stripLeadingSlash(storagePath);
            if (!isManagedUploadKey(key)) {
                console.warn('[R2] Refusing upload for non-managed key:', key);
                return null;
            }
            const parsedKey = parseManagedMediaKey(key);
            if (!parsedKey) {
                console.warn('[R2] Refusing upload for malformed managed key:', key);
                return null;
            }
            const normalizedContentType = normalizeMimeType(contentType || getMimeTypeFromDataUri(base64DataUri));
            if (!isMimeAllowedForManagedAsset(parsedKey.feature, parsedKey.assetRole, normalizedContentType)) {
                console.warn(`[R2] Refusing upload for mismatched MIME ${normalizedContentType} on ${parsedKey.feature}/${parsedKey.assetRole}`);
                return null;
            }
            const byteSize = bodyBuffer.byteLength || estimateDataUriBytes(base64DataUri);
            const sizeLimit = getMaxUploadBytesForManagedAsset(parsedKey.feature, parsedKey.assetRole);
            if (sizeLimit && byteSize > sizeLimit) {
                console.warn(`[R2] Refusing upload over limit (${byteSize} > ${sizeLimit}) for ${parsedKey.feature}/${parsedKey.assetRole}`);
                return null;
            }
            const checksumSha256 = await sha256Hex(bodyBuffer);
            if (SupabaseService.init()) {
                try {
                    const logicalRowId = options.logicalRowId || parsedKey.itemId;
                    const assetRecord: MediaAssetUploadInput = {
                        sourceTable: options.sourceTable || SOURCE_TABLE_BY_FEATURE[parsedKey.feature as ManagedFeature] || parsedKey.feature.replace(/-/g, '_'),
                        logicalRowId,
                        itemId: options.itemId || parsedKey.itemId,
                        feature: parsedKey.feature,
                        assetRole: parsedKey.assetRole,
                        r2Key: key,
                        byteSize,
                        mimeType: normalizedContentType,
                        checksumSha256,
                        ownerUserId: options.ownerUserId ?? parsedKey.ownerUserId ?? null,
                        expiresAt: options.expiresAt ?? null,
                        metadata: options.metadata ?? {},
                    };
                    await SupabaseService.prepareMediaAssetUpload(assetRecord);
                } catch (error) {
                    console.warn('[R2] Media asset prepare failed - falling back to direct worker upload:', error);
                }
            }

            const url = joinWorkerUrl(key);
            if (!url) return null;
            const workerAuthHeaders = await managedWriteHeaders();
            if (!workerAuthHeaders) {
                console.warn('[R2] Missing managed worker credentials - upload skipped.');
                return null;
            }

            const res = await fetch(url, {
                method: 'PUT',
                headers: { ...workerAuthHeaders, 'Content-Type': normalizedContentType },
                body: bodyBuffer,
            });

            if (!res.ok) {
                console.warn(`[R2] Upload failed (${res.status}):`, await res.text());
                return null;
            }
            const uploadedMeta = await res.json().catch(() => null);
            if (uploadedMeta) {
                const uploadedBytes = Number(uploadedMeta.bytes || 0);
                const uploadedChecksum = String(uploadedMeta.checksumSha256 || '');
                if (uploadedBytes !== byteSize || uploadedChecksum !== checksumSha256) {
                    console.warn('[R2] Upload verification mismatch:', { key, expectedBytes: byteSize, uploadedBytes, expectedChecksum: checksumSha256, uploadedChecksum });
                    return null;
                }
            }

            R2_EXISTENCE_CACHE.set(key, true);
            return key;
        } catch (e) {
            console.warn('[R2] Upload exception:', e);
            return null;
        }
    },

    async getSignedUrl(storagePath: string): Promise<string | null> {
        return MediaStorageService.getAccessibleUrl(storagePath);
    },

    async getLegacySupabaseUrl(storagePath: string): Promise<string | null> {
        const parsedRef = parseSupabaseStorageRef(storagePath);
        if (parsedRef?.absoluteUrl) return parsedRef.absoluteUrl;

        if (!SupabaseService.init() || !SupabaseService.client) return null;

        const key = parsedRef?.key || stripLeadingSlash(storagePath);
        const buckets = parsedRef ? [parsedRef.bucket] : [...LEGACY_SUPABASE_BUCKETS];

        for (const bucket of buckets) {
            try {
                const { data, error } = await SupabaseService.client.storage.from(bucket).createSignedUrl(key, 60 * 60);
                if (!error && data?.signedUrl) {
                    return normalizeSignedUrl(data.signedUrl);
                }
            } catch {
                // Try the next bucket.
            }
        }

        return null;
    },

    async getAccessibleUrl(storagePath: string): Promise<string | null> {
        if (!storagePath) return null;

        const key = extractCandidateR2Key(storagePath);
        if (key) {
            const probe = await MediaStorageService.probeR2Path(storagePath);
            if (probe !== false) {
                const workerUrl = joinWorkerUrl(key);
                if (workerUrl) return workerUrl;
            }
        }

        const legacyUrl = await MediaStorageService.getLegacySupabaseUrl(storagePath);
        if (legacyUrl) return legacyUrl;

        reportMissingRead(storagePath, 'no-accessible-url').catch(() => {});
        if (storagePath.startsWith('http')) return storagePath;
        return null;
    },

    async downloadLegacyMedia(storagePath: string): Promise<string | null> {
        if (!storagePath) return null;
        if (storagePath.startsWith('data:')) return storagePath;

        const parsedRef = parseSupabaseStorageRef(storagePath);
        if (parsedRef) {
            const viaClient = await downloadFromSupabaseBucket(parsedRef.bucket, parsedRef.key);
            if (viaClient) return viaClient;
            if (parsedRef.absoluteUrl) return downloadUrlAsDataUri(parsedRef.absoluteUrl);
            return null;
        }

        const absoluteUrl = tryParseUrl(storagePath);
        if (absoluteUrl) {
            return downloadUrlAsDataUri(storagePath);
        }

        const key = stripLeadingSlash(storagePath);
        for (const bucket of LEGACY_SUPABASE_BUCKETS) {
            const viaClient = await downloadFromSupabaseBucket(bucket, key);
            if (viaClient) return viaClient;
        }

        return null;
    },

    async downloadMedia(storagePath: string): Promise<string | null> {
        if (!storagePath) return null;
        const accessibleUrl = await MediaStorageService.getAccessibleUrl(storagePath);
        if (accessibleUrl) {
            try {
                return await downloadUrlAsDataUri(accessibleUrl);
            } catch {
                // Fall through to direct legacy bucket access.
            }
        }
        return MediaStorageService.downloadLegacyMedia(storagePath);
    },

    async mirrorLegacyMediaToR2(storagePath: string, targetPath: string): Promise<string | null> {
        const existingProbe = await MediaStorageService.probeR2Path(storagePath);
        const existingKey = extractR2Key(storagePath);
        if (existingProbe === true && existingKey) {
            return existingKey;
        }

        const payload = await MediaStorageService.downloadLegacyMedia(storagePath);
        if (!payload) return null;

        const uploaded = await MediaStorageService.uploadMedia(payload, targetPath);
        if (!uploaded) return null;

        await MediaStorageService.deleteLegacyMedia(storagePath);
        return uploaded;
    },

    async deleteLegacyMedia(storagePath: string): Promise<void> {
        const parsedRef = parseSupabaseStorageRef(storagePath);
        if (parsedRef) {
            await deleteFromSupabaseBucket(parsedRef.bucket, parsedRef.key);
            return;
        }

        const key = stripLeadingSlash(storagePath);
        for (const bucket of LEGACY_SUPABASE_BUCKETS) {
            await deleteFromSupabaseBucket(bucket, key);
        }
    },

    async deleteMedia(storagePath: string): Promise<void> {
        if (!storagePath) return;

        const key = extractR2Key(storagePath);
        if (key && isManagedUploadKey(key)) {
            if (!WORKER_URL) return;
            const url = joinWorkerUrl(key);
            if (url) {
                try {
                    const workerAuthHeaders = await managedWriteHeaders();
                    if (!workerAuthHeaders) {
                        console.warn('[R2] Missing managed worker credentials - delete skipped.');
                        return;
                    }
                    const res = await fetch(url, {
                        method: 'DELETE',
                        headers: workerAuthHeaders,
                    });
                    if (!res.ok && res.status !== 404) {
                        console.warn(`[R2] Delete failed (${res.status}):`, await res.text());
                    }
                    R2_EXISTENCE_CACHE.delete(key);
                } catch (e) {
                    console.warn('[R2] Delete exception:', e);
                }
            }
            return;
        }

        await MediaStorageService.deleteLegacyMedia(storagePath);
    },
};

const MiB = 1024 * 1024;
const EMAIL_LIKE_SEGMENT = /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/i;

export const MANAGED_MEDIA_KEY_PREFIX = 'v2/couples/';

export const MEDIA_FEATURE_POLICIES = Object.freeze({
  memories: Object.freeze({
    label: 'Memories',
    storageBudgetBytes: 192 * MiB,
    rolePolicies: Object.freeze({
      image: Object.freeze({ maxBytes: 8 * MiB, mimePrefixes: ['image/'] }),
      video: Object.freeze({ maxBytes: 35 * MiB, mimePrefixes: ['video/', 'application/octet-stream'] }),
    }),
  }),
  'daily-moments': Object.freeze({
    label: 'Daily Moments',
    storageBudgetBytes: 96 * MiB,
    rolePolicies: Object.freeze({
      image: Object.freeze({ maxBytes: 8 * MiB, mimePrefixes: ['image/'] }),
      video: Object.freeze({ maxBytes: 35 * MiB, mimePrefixes: ['video/', 'application/octet-stream'] }),
    }),
  }),
  keepsakes: Object.freeze({
    label: 'Keepsakes',
    storageBudgetBytes: 160 * MiB,
    rolePolicies: Object.freeze({
      image: Object.freeze({ maxBytes: 8 * MiB, mimePrefixes: ['image/'] }),
      video: Object.freeze({ maxBytes: 35 * MiB, mimePrefixes: ['video/', 'application/octet-stream'] }),
    }),
  }),
  'time-capsules': Object.freeze({
    label: 'Time Capsules',
    storageBudgetBytes: 128 * MiB,
    rolePolicies: Object.freeze({
      image: Object.freeze({ maxBytes: 8 * MiB, mimePrefixes: ['image/'] }),
    }),
  }),
  surprises: Object.freeze({
    label: 'Surprises',
    storageBudgetBytes: 96 * MiB,
    rolePolicies: Object.freeze({
      image: Object.freeze({ maxBytes: 8 * MiB, mimePrefixes: ['image/'] }),
    }),
  }),
  'voice-notes': Object.freeze({
    label: 'Voice Notes',
    storageBudgetBytes: 96 * MiB,
    rolePolicies: Object.freeze({
      audio: Object.freeze({ maxBytes: 12 * MiB, mimePrefixes: ['audio/', 'application/octet-stream'] }),
    }),
  }),
  'together-music': Object.freeze({
    label: 'Together Music',
    storageBudgetBytes: 12 * MiB,
    rolePolicies: Object.freeze({
      track: Object.freeze({ maxBytes: 10 * MiB, mimePrefixes: ['audio/', 'application/octet-stream'] }),
    }),
  }),
});

export const COUPLE_TOTAL_STORAGE_BUDGET_BYTES = 512 * MiB;

export function normalizeMimeType(mimeType) {
  return String(mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
}

export function formatBytes(bytes) {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe < 1024) return `${safe} B`;
  if (safe < MiB) return `${(safe / 1024).toFixed(1)} KB`;
  if (safe < 1024 * MiB) return `${(safe / MiB).toFixed(1)} MB`;
  return `${(safe / (1024 * MiB)).toFixed(2)} GB`;
}

export function estimateBase64Bytes(base64) {
  const normalized = String(base64 || '').replace(/\s+/g, '');
  if (!normalized) return 0;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function estimateDataUriBytes(dataUri) {
  if (typeof dataUri !== 'string') return 0;
  const commaIndex = dataUri.indexOf(',');
  if (commaIndex < 0) return 0;
  return estimateBase64Bytes(dataUri.slice(commaIndex + 1));
}

export function getMimeTypeFromDataUri(dataUri) {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) return 'application/octet-stream';
  const match = dataUri.match(/^data:([^;,]+)[;,]/i);
  return normalizeMimeType(match?.[1]);
}

export function getFeatureStorageBudgetBytes(feature) {
  return MEDIA_FEATURE_POLICIES[feature]?.storageBudgetBytes ?? null;
}

export function getManagedRolePolicy(feature, assetRole) {
  return MEDIA_FEATURE_POLICIES[feature]?.rolePolicies?.[assetRole] ?? null;
}

export function getMaxUploadBytesForManagedAsset(feature, assetRole) {
  return getManagedRolePolicy(feature, assetRole)?.maxBytes ?? null;
}

export function isMimeAllowedForManagedAsset(feature, assetRole, mimeType) {
  const rolePolicy = getManagedRolePolicy(feature, assetRole);
  if (!rolePolicy) return false;
  const normalized = normalizeMimeType(mimeType);
  return rolePolicy.mimePrefixes.some((prefix) => normalized.startsWith(prefix));
}

export function parseManagedMediaKey(value) {
  const key = String(value || '').replace(/^\/+/, '');
  if (!key.startsWith(MANAGED_MEDIA_KEY_PREFIX)) return null;

  const segments = key.split('/').filter(Boolean);
  if (segments.some((segment) => EMAIL_LIKE_SEGMENT.test(segment))) return null;
  if (segments[0] !== 'v2' || segments[1] !== 'couples') return null;

  const coupleId = segments[2];
  const namespace = segments[3];

  if (namespace === 'users') {
    if (segments.length !== 10) return null;
    const feature = segments[5];
    const assetRole = segments[9];
    if (!MEDIA_FEATURE_POLICIES[feature]) return null;
    if (!MEDIA_FEATURE_POLICIES[feature].rolePolicies[assetRole]) return null;
    return {
      key,
      coupleId,
      namespace,
      ownerUserId: segments[4],
      feature,
      year: segments[6],
      month: segments[7],
      itemId: segments[8],
      assetRole,
    };
  }

  if (namespace === 'legacy') {
    if (segments.length !== 9) return null;
    const feature = segments[4];
    const assetRole = segments[8];
    if (!MEDIA_FEATURE_POLICIES[feature]) return null;
    if (!MEDIA_FEATURE_POLICIES[feature].rolePolicies[assetRole]) return null;
    return {
      key,
      coupleId,
      namespace,
      ownerUserId: null,
      feature,
      year: segments[5],
      month: segments[6],
      itemId: segments[7],
      assetRole,
    };
  }

  return null;
}

export function isManagedUploadKey(value) {
  return !!parseManagedMediaKey(value);
}

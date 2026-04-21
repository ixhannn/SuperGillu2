export const MEDIA_RETENTION_MS = Object.freeze({
  'daily-moments': 24 * 60 * 60 * 1000,
  memories: null,
  keepsakes: null,
  'time-capsules': null,
  surprises: null,
  'voice-notes': null,
  'together-music': null,
});

export function getMediaRetentionMs(feature) {
  return Object.prototype.hasOwnProperty.call(MEDIA_RETENTION_MS, feature)
    ? MEDIA_RETENTION_MS[feature]
    : null;
}

export function isFeatureEphemeral(feature) {
  return Number.isFinite(getMediaRetentionMs(feature));
}

export function resolveExpiryMs(feature, expiresAt, createdAt = null) {
  const retentionMs = getMediaRetentionMs(feature);
  if (!Number.isFinite(retentionMs)) return null;

  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  if (!Number.isNaN(expiresMs)) return expiresMs;

  const createdMs = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  if (!Number.isNaN(createdMs)) return createdMs + retentionMs;

  return null;
}

export function isExpiredAt(feature, expiresAt, now = Date.now(), createdAt = null) {
  const expiresMs = resolveExpiryMs(feature, expiresAt, createdAt);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs <= now;
}

export function isDailyMomentExpired(item, now = Date.now()) {
  return isExpiredAt('daily-moments', item?.expiresAt, now, item?.createdAt);
}

export function getDailyMomentCountdown(item, now = Date.now()) {
  const expiresMs = resolveExpiryMs('daily-moments', item?.expiresAt, item?.createdAt);
  if (!Number.isFinite(expiresMs)) {
    return {
      state: 'unknown',
      label: 'Expiring soon',
      compactLabel: 'Soon',
      expiresMs: null,
    };
  }

  const diff = expiresMs - now;
  if (diff <= 0) {
    return {
      state: 'expired',
      label: 'Expired',
      compactLabel: 'Expired',
      expiresMs,
    };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const compactLabel = `${hours}h ${minutes}m`;

  return {
    state: 'active',
    label: `${compactLabel} left`,
    compactLabel,
    hours,
    minutes,
    expiresMs,
  };
}

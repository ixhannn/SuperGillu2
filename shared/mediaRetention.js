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

export function isExpiredAt(feature, expiresAt, now = Date.now()) {
  const retentionMs = getMediaRetentionMs(feature);
  if (!Number.isFinite(retentionMs)) return false;
  if (!expiresAt) return false;

  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs <= now;
}

export function isDailyMomentExpired(item, now = Date.now()) {
  return isExpiredAt('daily-moments', item?.expiresAt, now);
}


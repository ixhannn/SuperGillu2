const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|ogg|ogv|avi|mkv)(?:$|[?#])/i;

export function isVideoMediaReference(value?: string | null, mimeType?: string | null): boolean {
  if (mimeType?.toLowerCase().startsWith('video/')) return true;
  if (!value) return false;

  const normalized = value.split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase();
  return normalized.endsWith('/video') || VIDEO_EXTENSIONS.test(value);
}

export function selectImageStoragePath(storagePath?: string | null, mimeType?: string | null): string | undefined {
  return isVideoMediaReference(storagePath, mimeType) ? undefined : storagePath || undefined;
}

export function selectVideoStoragePath(
  videoStoragePath?: string | null,
  storagePath?: string | null,
  mimeType?: string | null,
): string | undefined {
  return videoStoragePath || (isVideoMediaReference(storagePath, mimeType) ? storagePath || undefined : undefined);
}

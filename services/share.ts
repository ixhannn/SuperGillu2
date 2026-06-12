/**
 * ShareService — hands memories to the OS share sheet.
 *
 * Native (Capacitor): media is written to the app cache and shared as a real
 * file URI via @capacitor/share, so the receiving app gets the actual photo.
 * Web: Web Share API level 2 with file support where available, falling back
 * to text-only share, then to clipboard.
 *
 * Both plugin modules are imported lazily so the web bundle never pays for
 * them and the share path stays off the app's critical boot path.
 */

import { Capacitor } from '@capacitor/core';
import { Memory } from '../types';
import { StorageService } from './storage';
import { DiagnosticsService } from './diagnostics';

interface ShareMemoryResult {
  shared: boolean;
  /** 'native' | 'web-file' | 'web-text' | 'clipboard' — which path delivered. */
  via: string;
}

const dataUrlToBase64 = (dataUrl: string): { base64: string; mime: string } | null => {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || 'image/jpeg';
  if (match[2]) return { base64: match[3], mime };
  try {
    return { base64: btoa(decodeURIComponent(match[3])), mime };
  } catch {
    return null;
  }
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const resolveMediaPayload = async (
  memory: Memory,
): Promise<{ base64: string; mime: string } | null> => {
  try {
    const src = await StorageService.getImage(
      memory.imageId || '',
      memory.image,
      memory.storagePath,
    );
    if (!src) return null;
    if (src.startsWith('data:')) return dataUrlToBase64(src);
    // blob: or http(s): — fetch and encode.
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return {
      base64: await blobToBase64(blob),
      mime: blob.type || 'image/jpeg',
    };
  } catch (error: unknown) {
    DiagnosticsService.recordError('share.resolve_media', error);
    return null;
  }
};

const extensionFor = (mime: string): string => {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
};

const buildShareText = (memory: Memory): string => {
  const date = new Date(memory.date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const lines = [memory.text?.trim(), date, '— from our Lior'].filter(Boolean) as string[];
  return lines.join('\n');
};

const shareNative = async (
  payload: { base64: string; mime: string } | null,
  text: string,
): Promise<ShareMemoryResult> => {
  const [{ Share }, filesystem] = await Promise.all([
    import('@capacitor/share'),
    payload ? import('@capacitor/filesystem') : Promise.resolve(null),
  ]);

  if (payload && filesystem) {
    const { Filesystem, Directory } = filesystem;
    const path = `share/lior-memory.${extensionFor(payload.mime)}`;
    const written = await Filesystem.writeFile({
      path,
      data: payload.base64,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: 'A memory from Lior', text, files: [written.uri] });
    return { shared: true, via: 'native' };
  }

  await Share.share({ title: 'A memory from Lior', text });
  return { shared: true, via: 'native' };
};

const shareWeb = async (
  payload: { base64: string; mime: string } | null,
  text: string,
): Promise<ShareMemoryResult> => {
  if (payload && typeof navigator.canShare === 'function') {
    const bytes = Uint8Array.from(atob(payload.base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], `lior-memory.${extensionFor(payload.mime)}`, {
      type: payload.mime,
    });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return { shared: true, via: 'web-file' };
    }
  }
  if (navigator.share) {
    await navigator.share({ text });
    return { shared: true, via: 'web-text' };
  }
  await navigator.clipboard.writeText(text);
  return { shared: true, via: 'clipboard' };
};

export const ShareService = {
  /**
   * Share a memory (photo + note when resolvable, text otherwise).
   * Returns shared=false when the user cancels the OS sheet.
   */
  async shareMemory(memory: Memory): Promise<ShareMemoryResult> {
    const text = buildShareText(memory);
    const payload = await resolveMediaPayload(memory);
    try {
      return Capacitor.isNativePlatform()
        ? await shareNative(payload, text)
        : await shareWeb(payload, text);
    } catch (error: unknown) {
      // The user backing out of the OS sheet rejects — that is not an error.
      const message = error instanceof Error ? error.message : '';
      if (!/abort|cancel|dismiss/i.test(message)) {
        DiagnosticsService.recordError('share.memory', error);
      }
      return { shared: false, via: 'cancelled' };
    }
  },
};

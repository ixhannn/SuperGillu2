/**
 * Shares the bonsai card through the OS share sheet.
 * Native: PNG written to app cache, shared as a real file (share.ts pattern).
 * Web: Web Share API with file support, falling back to a download.
 */

import { Capacitor } from '@capacitor/core';
import { DiagnosticsService } from './diagnostics';

const FILE_NAME = 'our-bonsai.png';

const dataUrlBase64 = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

const shareNative = async (dataUrl: string, text: string): Promise<boolean> => {
  const [{ Share }, { Filesystem, Directory }] = await Promise.all([
    import('@capacitor/share'),
    import('@capacitor/filesystem'),
  ]);
  const written = await Filesystem.writeFile({
    path: `share/${FILE_NAME}`,
    data: dataUrlBase64(dataUrl),
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({ title: 'Our Bonsai', text, files: [written.uri] });
  return true;
};

const shareWeb = async (dataUrl: string, text: string): Promise<boolean> => {
  const bytes = Uint8Array.from(atob(dataUrlBase64(dataUrl)), (c) => c.charCodeAt(0));
  const file = new File([bytes], FILE_NAME, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return true;
  }
  // Headless/no-share-sheet fallback: just download the card.
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = FILE_NAME;
  a.click();
  return true;
};

export const BonsaiShareService = {
  /** Returns false only when the user backs out of the OS sheet. */
  async shareCard(dataUrl: string, text: string): Promise<boolean> {
    try {
      return Capacitor.isNativePlatform()
        ? await shareNative(dataUrl, text)
        : await shareWeb(dataUrl, text);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (!/abort|cancel|dismiss/i.test(message)) {
        DiagnosticsService.recordError('bonsai.share', error);
      }
      return false;
    }
  },
};

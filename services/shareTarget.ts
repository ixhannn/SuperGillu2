/**
 * ShareTargetService — receives photos shared INTO Lior from other apps.
 *
 * The native side (ShareTargetPlugin.java) parks the shared image and/or
 * fires a `shareReceived` event. This service normalizes both paths into a
 * single in-memory pending image that AddMemory consumes:
 *   cold start: getPendingShare() pull after boot
 *   warm start: shareReceived listener while the app is alive
 *
 * No-op on web — the plugin only exists in the Android shell.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { DiagnosticsService } from './diagnostics';

interface SharedImagePayload {
  base64?: string;
  mimeType?: string;
}

interface ShareTargetPluginApi {
  getPendingShare(): Promise<SharedImagePayload>;
  addListener(
    eventName: 'shareReceived',
    listenerFunc: (payload: SharedImagePayload) => void,
  ): Promise<PluginListenerHandle>;
}

/** Window event AddMemory listens for while it is already mounted. */
export const SHARE_TARGET_EVENT = 'lior:share-target';

let pendingImageDataUrl: string | null = null;

const toDataUrl = (payload: SharedImagePayload): string | null => {
  if (!payload.base64) return null;
  return `data:${payload.mimeType || 'image/jpeg'};base64,${payload.base64}`;
};

const acceptPayload = (payload: SharedImagePayload, onShare: () => void): void => {
  const dataUrl = toDataUrl(payload);
  if (!dataUrl) return;
  pendingImageDataUrl = dataUrl;
  onShare();
  window.dispatchEvent(new CustomEvent(SHARE_TARGET_EVENT));
};

export const ShareTargetService = {
  /**
   * Begin listening for shared images. `onShare` should navigate the app to
   * the Add Memory view. Returns a cleanup function.
   */
  start(onShare: () => void): () => void {
    if (!Capacitor.isNativePlatform()) return () => {};

    let disposed = false;
    let listener: PluginListenerHandle | null = null;
    const plugin = registerPlugin<ShareTargetPluginApi>('ShareTarget');

    void (async () => {
      try {
        const cold = await plugin.getPendingShare();
        if (!disposed) acceptPayload(cold, onShare);
        const handle = await plugin.addListener('shareReceived', (payload) => {
          acceptPayload(payload, onShare);
        });
        if (disposed) void handle.remove();
        else listener = handle;
      } catch (error: unknown) {
        DiagnosticsService.recordError('share_target.start', error);
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  },

  /** One-shot consume of the pending shared image (data URL). */
  consumePendingImage(): string | null {
    const dataUrl = pendingImageDataUrl;
    pendingImageDataUrl = null;
    return dataUrl;
  },
};

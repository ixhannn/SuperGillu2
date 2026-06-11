import { Capacitor } from '@capacitor/core';

export type NativePhotoPick = {
  dataUrl: string;
  format: string;
};

const isUserCancel = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /cancel|dismiss|user denied/i.test(message);
};

export const NativeMediaService = {
  isNativeAvailable(): boolean {
    return Capacitor.isNativePlatform();
  },

  async pickPhoto(): Promise<NativePhotoPick | null> {
    if (!Capacitor.isNativePlatform()) return null;

    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 82,
        allowEditing: false,
        correctOrientation: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });

      if (!photo.dataUrl) return null;
      return {
        dataUrl: photo.dataUrl,
        format: photo.format || 'jpeg',
      };
    } catch (error) {
      if (isUserCancel(error)) return null;
      throw error;
    }
  },
};

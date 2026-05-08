import { Capacitor } from '@capacitor/core';

type NavigatorWithDeviceMemory = Navigator & { deviceMemory?: number };

export const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return typeof window !== 'undefined'
      && typeof (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
      && (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
  }
};

export const isCompactViewport = (): boolean => (
  typeof window !== 'undefined' && window.innerWidth <= 480
);

export const isLowPowerDevice = (): boolean => false;

// Tier gating disabled — every device gets every effect.
export const shouldGateHeavyView = (): boolean => false;

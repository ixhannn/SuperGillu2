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

export const isLowPowerDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const hardwareConcurrency = navigator.hardwareConcurrency;
  const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  return (
    (typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0 && hardwareConcurrency <= 6)
    || (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 4)
  );
};

export const shouldGateHeavyView = (): boolean => (
  isNativePlatform() || isCompactViewport() || isLowPowerDevice()
);

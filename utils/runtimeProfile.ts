import { Capacitor } from '@capacitor/core';

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

type NavigatorRuntimeProfile = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
  deviceMemory?: number;
};

export const isLowPowerDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;

  const runtimeNavigator = navigator as NavigatorRuntimeProfile;
  const hardwareConcurrency = runtimeNavigator.hardwareConcurrency ?? 8;
  const deviceMemory = runtimeNavigator.deviceMemory ?? 8;
  const connection = runtimeNavigator.connection;

  return (
    hardwareConcurrency <= 4
    || deviceMemory <= 4
    || connection?.saveData === true
    || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')
  );
};

export const shouldGateHeavyView = (): boolean => (
  isNativePlatform()
  || isCompactViewport()
  || isLowPowerDevice()
);

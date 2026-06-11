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
    // Device Memory API rounds DOWN to buckets (…, 2, 4, 8): real 4GB and
    // 6GB phones — the app's main audience — all report exactly 4. Gating at
    // <= 4 silently killed the signature ambient background on virtually
    // every device. <= 2 catches only genuinely low-end (≤3GB) hardware;
    // everything above that is protected adaptively by the AnimationEngine
    // tier system + FrameHealth downgrades instead of a static kill switch.
    || deviceMemory <= 2
    || connection?.saveData === true
    || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')
  );
};

export const shouldGateHeavyView = (): boolean => (
  isNativePlatform()
  || isCompactViewport()
  || isLowPowerDevice()
);

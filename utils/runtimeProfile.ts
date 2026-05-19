import { Capacitor } from '@capacitor/core';

type NavigatorWithDeviceMemory = Navigator & { deviceMemory?: number };

// Cache native-platform / device-class detection — these never change after
// boot and were previously recomputed on every call site (some of which run
// hundreds of times during a render pass).
let _isNativeCached: boolean | null = null;
let _isLowPowerCached: boolean | null = null;

export const isNativePlatform = (): boolean => {
  if (_isNativeCached !== null) return _isNativeCached;
  try {
    _isNativeCached = Capacitor.isNativePlatform();
  } catch {
    _isNativeCached = typeof window !== 'undefined'
      && typeof (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
      && (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
  }
  return _isNativeCached!;
};

export const isCompactViewport = (): boolean => (
  typeof window !== 'undefined' && window.innerWidth <= 480
);

export const isLowPowerDevice = (): boolean => {
  if (_isLowPowerCached !== null) return _isLowPowerCached;
  if (typeof navigator === 'undefined') { _isLowPowerCached = false; return false; }
  const hardwareConcurrency = navigator.hardwareConcurrency;
  const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  // Tightened thresholds — modern mid-range Android (6 cores / 4 GB) is
  // perfectly capable of running our scenes at 60fps. Previously we were
  // dropping these phones to the CSS-only fallback unnecessarily.
  _isLowPowerCached = (
    (typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0 && hardwareConcurrency <= 4)
    || (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 2)
  );
  return _isLowPowerCached;
};

// Heavy *views* (room renderer, 3D bonsai, etc.) — gate these on tight RAM
// only. The pure-particle ambient layers don't need to be gated because
// AnimationEngine downgrades them adaptively when frame budget is missed.
export const shouldGateHeavyView = (): boolean => (
  isLowPowerDevice()
);

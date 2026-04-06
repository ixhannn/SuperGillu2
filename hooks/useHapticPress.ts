/**
 * useHapticPress — Tulika
 *
 * Returns pointer event handlers that fire haptic + audio on pointerdown
 * (before the click event fires — makes interactions feel instantaneous).
 *
 * Usage:
 *   const bind = useHapticPress({ haptic: 'tap', sound: 'tap' });
 *   <button {...bind} onClick={doSomething}>…</button>
 */

import { useCallback, useRef } from 'react';
import { Haptics } from '../services/haptics';
import { Audio } from '../services/audio';

export type { HapticIntensity } from '../services/haptics';

type HapticName =
  | 'tap' | 'softTap' | 'press' | 'heavy' | 'rigidStop'
  | 'select' | 'success' | 'warning' | 'error'
  | 'toggleOn' | 'toggleOff' | 'confirm' | 'destroy'
  | 'heartbeat' | 'doubleBeat' | 'celebrate';

type SoundName = Parameters<typeof Audio.play>[0];

interface HapticPressOptions {
  haptic?: HapticName;
  sound?: SoundName;
  /** Fire on pointerdown for instant feel. Default: true. */
  fireOnDown?: boolean;
}

export function useHapticPress(options: HapticPressOptions = {}) {
  const { haptic = 'tap', sound = 'tap', fireOnDown = true } = options;

  // Prevent double-fire on devices that emit both touchstart and click
  const fired = useRef(false);

  const fire = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    (Haptics[haptic] as (() => void))?.();
    Audio.play(sound);
    setTimeout(() => { fired.current = false; }, 100);
  }, [haptic, sound]);

  return fireOnDown ? { onPointerDown: fire } : { onClick: fire };
}

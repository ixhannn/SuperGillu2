// Ambient 3D background preference — governs the heavy WebGL "animated blob".
//
// Default ON. When the user turns it OFF, the 3D scene is hidden + paused on
// every page EXCEPT Home, where it ALWAYS stays on. The Home exception is
// enforced by the consumer (AmbientVisuals reads isHome), not here — this module
// only persists the global on/off intent and notifies subscribers so the
// background reacts live, the moment the toggle flips.
//
// Mirrors the localStorage + change-event pattern used by services/audio.ts and
// services/haptics.ts.
const KEY = 'lior_ambient_3d';
const target = new EventTarget();

const read = (): boolean => {
  try {
    // Only an explicit '0' means OFF; absent / anything else defaults to ON.
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
};

export const AmbientPrefs = {
  /** True when the animated 3D blob is enabled for non-Home pages. */
  is3DEnabled(): boolean {
    return read();
  },

  set3DEnabled(value: boolean): void {
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      /* storage unavailable — the change event still drives this session */
    }
    target.dispatchEvent(new Event('change'));
  },

  /** Subscribe to on/off changes. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void {
    target.addEventListener('change', cb);
    return () => target.removeEventListener('change', cb);
  },
};

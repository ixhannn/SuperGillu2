import React, { Suspense, useEffect, useState } from 'react';
import { LiveBackground } from './LiveBackground';
import { SafeRender } from './SafeRender';
import { shouldGateHeavyView } from '../utils/runtimeProfile';

const LazyLiveBackground3D = React.lazy(() =>
  import('./LiveBackground3D').then((module) => ({ default: module.LiveBackground3D })),
);

const LazyFloatingHeartsScene = React.lazy(() =>
  import('./FloatingHeartsScene').then((module) => ({ default: module.FloatingHeartsScene })),
);

interface AmbientVisualsProps {
  /**
   * Optional pause hint. When omitted (the recommended path) the heavy WebGL
   * layers internally watch `<html data-transitioning="1">` set by
   * TransitionEngine. This avoids re-rendering AmbientVisuals via prop on
   * every navigation, which used to break Layout's React.memo and cascade
   * extra reconciliations through the entire keep-alive cache.
   */
  paused?: boolean;
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export const AmbientVisuals: React.FC<AmbientVisualsProps> = ({ paused = false }) => {
  const [ambientReady, setAmbientReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (shouldGateHeavyView()) return;

    const win = window as WindowWithIdleCallback;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const enable = () => { if (!cancelled) setAmbientReady(true); };

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(enable, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(enable, 600);
    }
    return () => {
      cancelled = true;
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      <LiveBackground />
      {ambientReady && (
        <Suspense fallback={null}>
          <div data-testid="ambient-visuals-3d" aria-hidden="true">
            <SafeRender><LazyLiveBackground3D paused={paused} /></SafeRender>
            <SafeRender><LazyFloatingHeartsScene paused={paused} /></SafeRender>
          </div>
        </Suspense>
      )}
    </>
  );
};

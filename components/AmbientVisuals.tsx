import React, { Suspense, useEffect, useState } from 'react';
import { LiveBackground } from './LiveBackground';
import { SafeRender } from './SafeRender';
import { isLowPowerDevice } from '../utils/runtimeProfile';
import { observeDocumentAttributes, observeDocumentVisibility } from '../utils/documentObserverBus';
import { scheduleIdleTask } from '../utils/scheduler';

const LazyLiveBackground3D = React.lazy(() =>
  import('./LiveBackground3D').then((module) => ({ default: module.LiveBackground3D })),
);

const LazyFloatingHeartsScene = React.lazy(() =>
  import('./FloatingHeartsScene').then((module) => ({ default: module.FloatingHeartsScene })),
);

interface AmbientVisualsProps {
  /**
   * Optional pause hint for app-level throttling. Tab navigation deliberately
   * does not pass or toggle this so the ambient scene remains continuous.
   */
  paused?: boolean;
}

const AMBIENT_PAUSE_ATTRIBUTES = ['data-ambient-motion-paused', 'data-transitioning'];
type AmbientStage = 'fallback' | 'live-3d' | 'hearts';

const isDocumentAmbientMotionPaused = (): boolean => {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return (
    document.visibilityState === 'hidden'
    || Boolean(root.dataset.ambientMotionPaused)
    || Boolean(root.dataset.transitioning)
  );
};

const useAmbientMotionPaused = (paused: boolean): boolean => {
  const [documentPaused, setDocumentPaused] = useState(isDocumentAmbientMotionPaused);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const syncPaused = () => {
      const next = isDocumentAmbientMotionPaused();
      // Skip state writes when nothing changed — avoid pointless React commits
      // that would otherwise fire on every `style` mutation on <html> (theme
      // transitions thrash this constantly).
      setDocumentPaused((prev) => (prev === next ? prev : next));
    };

    syncPaused();
    const stopAttr = observeDocumentAttributes(AMBIENT_PAUSE_ATTRIBUTES, syncPaused);
    const stopVis = observeDocumentVisibility(syncPaused);
    return () => {
      stopAttr();
      stopVis();
    };
  }, []);

  return paused || documentPaused;
};

const AmbientMotionFallback: React.FC<{ paused?: boolean }> = ({ paused = false }) => (
  <div
    data-testid="ambient-visuals-motion-fallback"
    data-lior-ambient-stage="true"
    aria-hidden="true"
    className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
    style={{ contain: 'strict' }}
  >
    <style>
      {`
        @keyframes liorAmbientWashDrift {
          0% {
            transform: translate3d(-2.5%, -1.5%, 0) scale(1.04);
            opacity: 0.72;
          }
          50% {
            transform: translate3d(1.5%, 1%, 0) scale(1.07);
            opacity: 0.88;
          }
          100% {
            transform: translate3d(2.25%, -0.75%, 0) scale(1.05);
            opacity: 0.78;
          }
        }

        @keyframes liorAmbientSheenSweep {
          0% { transform: rotate(-8deg) translate3d(-5%, -3%, 0) scale(1.08); opacity: 0.12; }
          50% { transform: rotate(4deg) translate3d(3%, 2%, 0) scale(1.12); opacity: 0.22; }
          100% { transform: rotate(9deg) translate3d(5%, -1%, 0) scale(1.09); opacity: 0.14; }
        }

        [data-tier="css-only"] [data-lior-ambient-motion] {
          animation-iteration-count: infinite !important;
        }

        [data-tier="css-only"] [data-lior-ambient-motion="wash"] {
          animation-duration: 26s !important;
        }

        [data-tier="css-only"] [data-lior-ambient-motion="sheen"] {
          animation-duration: 34s !important;
        }

        :root[data-ambient-motion-paused] [data-lior-ambient-motion],
        :root[data-transitioning] [data-lior-ambient-motion] {
          animation-play-state: paused !important;
        }

        @media (prefers-reduced-motion: reduce) {
          [data-lior-ambient-motion] {
            animation: none !important;
          }
        }
      `}
    </style>
    <div
      data-lior-ambient-motion="wash"
      className="absolute"
      style={{
        inset: '-16%',
        background: [
          'linear-gradient(132deg, rgba(var(--theme-particle-1-rgb), 0.24), transparent 46%)',
          'linear-gradient(228deg, rgba(var(--theme-particle-3-rgb), 0.20), transparent 50%)',
          'linear-gradient(18deg, rgba(var(--theme-particle-4-rgb), 0.11), transparent 56%)',
          'radial-gradient(ellipse at 50% 36%, rgba(255,255,255,0.26), transparent 62%)',
        ].join(', '),
        backgroundSize: '150% 150%, 160% 160%, 145% 145%, 130% 130%',
        filter: 'saturate(116%)',
        animation: 'liorAmbientWashDrift 24s ease-in-out infinite alternate',
        animationPlayState: paused ? 'paused' : 'running',
        willChange: 'transform, opacity',
      }}
    />
    <div
      data-lior-ambient-motion="sheen"
      className="absolute"
      style={{
        inset: '-20%',
        background: 'conic-gradient(from 190deg at 52% 54%, rgba(var(--theme-particle-2-rgb),0.16), transparent 24%, rgba(var(--theme-particle-1-rgb),0.13), transparent 68%, rgba(255,255,255,0.16))',
        mixBlendMode: 'normal',
        opacity: 0.68,
        animation: 'liorAmbientSheenSweep 30s ease-in-out infinite alternate',
        animationPlayState: paused ? 'paused' : 'running',
        willChange: 'transform, opacity',
      }}
    />
  </div>
);

export const AmbientVisuals: React.FC<AmbientVisualsProps> = ({ paused = false }) => {
  const [ambientStage, setAmbientStage] = useState<AmbientStage>('fallback');
  const effectivePaused = useAmbientMotionPaused(paused);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Only skip the heavy WebGL ambient scene on genuinely low-power
    // hardware (≤4 cores / ≤4GB RAM / save-data). It must NOT be gated
    // by viewport width or "is native" — Lior is a mobile app and the
    // AnimationEngine is locked at the 'ultra' tier, so the signature
    // animated background is meant to run on phones. Gating by
    // isCompactViewport()/isNativePlatform() killed it on every real
    // device and left only the static gradient.
    if (isLowPowerDevice()) return;

    const cancelers: Array<() => void> = [];
    const cancelLive3D = scheduleIdleTask(() => {
      setAmbientStage('live-3d');
      cancelers.push(scheduleIdleTask(() => {
        setAmbientStage('hearts');
      }, { timeout: 2200, delay: 900 }));
    }, { timeout: 1400, delay: 450 });
    cancelers.push(cancelLive3D);

    return () => {
      cancelers.forEach((cancel) => cancel());
    };
  }, []);

  return (
    <>
      <LiveBackground />
      <AmbientMotionFallback paused={effectivePaused} />
      {ambientStage !== 'fallback' && (
        <div data-testid="ambient-visuals-3d" aria-hidden="true">
          <Suspense fallback={null}>
            <SafeRender><LazyLiveBackground3D paused={effectivePaused} /></SafeRender>
          </Suspense>
          {ambientStage === 'hearts' && (
            <Suspense fallback={null}>
              <SafeRender><LazyFloatingHeartsScene paused={effectivePaused} /></SafeRender>
            </Suspense>
          )}
        </div>
      )}
    </>
  );
};

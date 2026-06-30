import React, { Suspense, useEffect, useState } from 'react';
import { LiveBackground } from './LiveBackground';
import { SafeRender } from './SafeRender';
import { observeDocumentAttributes, observeDocumentVisibility } from '../utils/documentObserverBus';
import { hasPendingUserInput, scheduleIdleTask } from '../utils/scheduler';
import { AmbientPrefs } from '../services/ambientPrefs';

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

const AMBIENT_PAUSE_ATTRIBUTES = ['data-ambient-motion-paused', 'data-transitioning', 'data-tab-transitioning'];
type AmbientStage = 'fallback' | 'live-3d' | 'hearts';

const isDocumentAmbientMotionPaused = (): boolean => {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return (
    document.visibilityState === 'hidden'
    || Boolean(root.dataset.ambientMotionPaused)
    || Boolean(root.dataset.transitioning)
    || Boolean(root.dataset.tabTransitioning)
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

// The user's Settings toggle for the heavy 3D blob. Reacts live to flips.
const useAmbient3DEnabled = (): boolean => {
  const [enabled, setEnabled] = useState<boolean>(() => AmbientPrefs.is3DEnabled());
  useEffect(() => AmbientPrefs.subscribe(() => setEnabled(AmbientPrefs.is3DEnabled())), []);
  return enabled;
};

// Whether the active route is Home, read from <html data-route> (App keeps it in
// sync). Home ALWAYS shows the blob regardless of the toggle, so this overrides
// the preference. Reading an attribute keeps AmbientVisuals prop-free, so Layout's
// memo and the keep-alive shells underneath never re-render on navigation.
const useIsHomeRoute = (): boolean => {
  const [isHome, setIsHome] = useState<boolean>(
    () => typeof document !== 'undefined' && document.documentElement.dataset.route === 'home',
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      const next = document.documentElement.dataset.route === 'home';
      setIsHome((prev) => (prev === next ? prev : next));
    };
    sync();
    return observeDocumentAttributes(['data-route'], sync);
  }, []);
  return isHome;
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
        :root[data-transitioning] [data-lior-ambient-motion],
        :root[data-tab-transitioning] [data-lior-ambient-motion] {
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
        // No standing willChange: the infinite alternate animation auto-promotes
        // this full-viewport layer while it moves; pinning it held a permanent
        // backing texture even on paused/reduced-motion screens.
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
        // No standing willChange: the infinite alternate animation auto-promotes
        // this full-viewport layer while it moves; pinning it held a permanent
        // backing texture even on paused/reduced-motion screens.
      }}
    />
  </div>
);

// Memoized below: Layout re-renders on navigation (its children prop is a
// fresh element tree), and without memo that re-reconciled the ambient layer
// hosts each time. Props are stable, so the bailout always holds.
const AmbientVisualsImpl: React.FC<AmbientVisualsProps> = ({ paused = false }) => {
  const [ambientStage, setAmbientStage] = useState<AmbientStage>('fallback');
  const effectivePaused = useAmbientMotionPaused(paused);
  const enabled3D = useAmbient3DEnabled();
  const isHomeRoute = useIsHomeRoute();
  // The heavy 3D blob shows when EITHER the route is Home (always on there) OR the
  // user's global toggle is on. When false it is hidden + paused on every other
  // page, falling back to the static gradient wash beneath.
  const show3D = isHomeRoute || enabled3D;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Respect prefers-reduced-motion: stay on the static gradient fallback and
    // never promote to the animated WebGL bokeh / morphing-glass scene. The CSS
    // (@media prefers-reduced-motion) already freezes the wash/sheen layers; this
    // gate stops the heavier WebGL layers from ever starting for that cohort.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // No device gating — visuals are locked to 'ultra' on every device (the user
    // asked for this). The heavy WebGL scene is still built lazily here; whether
    // it is actually shown/rendered is governed by `show3D` (the Settings toggle,
    // with Home always-on) at the render + paused level below.

    let cancelled = false;
    const cancelers: Array<() => void> = [];

    const retryWhenQuiet = (task: () => void) => {
      cancelers.push(scheduleIdleTask(task, { timeout: 2400, delay: 700 }));
    };

    const runWhenQuiet = (task: () => void) => {
      if (cancelled) return;
      if (isDocumentAmbientMotionPaused() || hasPendingUserInput()) {
        retryWhenQuiet(() => runWhenQuiet(task));
        return;
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          if (isDocumentAmbientMotionPaused() || hasPendingUserInput()) {
            retryWhenQuiet(() => runWhenQuiet(task));
            return;
          }
          task();
        });
      });
    };

    const promoteLive3DWhenQuiet = () => runWhenQuiet(() => {
      setAmbientStage('live-3d');
      cancelers.push(scheduleIdleTask(() => {
        promoteHeartsWhenQuiet();
      }, { timeout: 2600, delay: 1200 }));
    });

    const promoteHeartsWhenQuiet = () => runWhenQuiet(() => {
      setAmbientStage('hearts');
    });

    const cancelLive3D = scheduleIdleTask(() => {
      promoteLive3DWhenQuiet();
    }, { timeout: 1800, delay: 900 });
    cancelers.push(cancelLive3D);

    return () => {
      cancelled = true;
      cancelers.forEach((cancel) => cancel());
    };
  }, []);

  return (
    <>
      <LiveBackground />
      <AmbientMotionFallback paused={effectivePaused} />
      {ambientStage !== 'fallback' && (
        <div
          data-testid="ambient-visuals-3d"
          aria-hidden="true"
          style={{
            // Hidden (revealing the static gradient beneath) when the blob is
            // toggled off on a non-Home page. A soft fade so toggling / leaving
            // Home reads as a gentle dissolve, never a pop.
            opacity: show3D ? 1 : 0,
            transition: 'opacity 600ms ease',
            // No standing willChange: the 600ms opacity transition auto-promotes
            // this full-screen WebGL wrapper for the fade; pinning it kept a
            // viewport-sized backing texture allocated over the live canvas for
            // the whole app lifetime.
          }}
        >
          <Suspense fallback={null}>
            <SafeRender><LazyLiveBackground3D paused={effectivePaused || !show3D} /></SafeRender>
          </Suspense>
          {ambientStage === 'hearts' && (
            <Suspense fallback={null}>
              <SafeRender><LazyFloatingHeartsScene paused={effectivePaused || !show3D} /></SafeRender>
            </Suspense>
          )}
        </div>
      )}
    </>
  );
};

export const AmbientVisuals = React.memo(AmbientVisualsImpl);

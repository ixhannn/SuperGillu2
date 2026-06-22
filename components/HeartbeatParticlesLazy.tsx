import React, { Suspense, forwardRef } from 'react';

export type { HeartbeatParticlesHandle } from './HeartbeatParticles';
import type { HeartbeatParticlesHandle } from './HeartbeatParticles';

/**
 * Lazy boundary for the HeartbeatParticles WebGL heart.
 *
 * HeartbeatParticles statically pulls in three.js + @react-three/fiber (~600KB
 * parsed). It is rendered by Home and DailyQuestion — both on the cold-launch
 * path — so importing it eagerly forced the entire three stack to parse before
 * the first interactive screen. This wrapper defers that import to the moment
 * the heart actually mounts.
 *
 * The imperative handle (triggerButtonDissolve / triggerReceive / triggerSend)
 * is forwarded through React.lazy unchanged. Until the chunk resolves the ref is
 * null — every call site already guards with `?.`, so a heartbeat fired in the
 * (sub-second) loading window simply no-ops rather than throwing.
 */
const LazyHeartbeatParticles = React.lazy(() =>
  import('./HeartbeatParticles').then((m) => ({ default: m.HeartbeatParticles })),
);

export const HeartbeatParticles = forwardRef<HeartbeatParticlesHandle>(
  function HeartbeatParticlesLazyBoundary(_props, ref) {
    return (
      <Suspense fallback={null}>
        <LazyHeartbeatParticles ref={ref} />
      </Suspense>
    );
  },
);

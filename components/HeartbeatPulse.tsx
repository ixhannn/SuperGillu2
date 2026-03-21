/**
 * HeartbeatPulse — Two synced glowing orbs pulsing in heartbeat rhythm
 *
 * Pure CSS @keyframes on transform: scale() and opacity only —
 * runs entirely on the compositor thread, cannot be janked by JS.
 *
 * Physiologically accurate lub-dub: quick double pulse, then rest.
 * Two orbs slightly offset — "two hearts, one rhythm."
 *
 * Place behind hero content for ambient emotional warmth.
 */

import React from 'react';
import { PerformanceManager } from '../services/performance';

export const HeartbeatPulse: React.FC = () => {
  if (PerformanceManager.reducedMotion) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden="true">
      {/* First heart — slightly left of center, warm rose */}
      <div
        className="absolute top-1/2 left-[40%] -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full animate-heartbeat-1"
        style={{
          background: 'radial-gradient(circle, rgba(244,63,94,0.12) 0%, rgba(244,63,94,0) 70%)',
          filter: 'blur(20px)',
        }}
      />
      {/* Second heart — slightly right, offset timing creates "lub-dub" */}
      <div
        className="absolute top-1/2 left-[60%] -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full animate-heartbeat-2"
        style={{
          background: 'radial-gradient(circle, rgba(251,113,133,0.1) 0%, rgba(251,113,133,0) 70%)',
          filter: 'blur(16px)',
        }}
      />
    </div>
  );
};

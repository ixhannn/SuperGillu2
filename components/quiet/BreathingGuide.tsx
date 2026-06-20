// Quiet Mode — Guided Breathing overlay
// ─────────────────────────────────────────────────────────────────────────────
// A slow, optional breathing pacer that turns Quiet Mode from a passive
// slideshow into an active moment of calm. A soft ring expands on the inhale,
// holds, then contracts on the exhale, following a 4-4-6 cadence (a gentle,
// sustainable resting rhythm). Pointer-transparent so it floats over the
// memories without stealing taps.

import React, { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../utils/motion';

type Phase = 'in' | 'hold' | 'out';

const CADENCE: Record<Phase, { next: Phase; ms: number; label: string }> = {
  in:   { next: 'hold', ms: 4000, label: 'Breathe in' },
  hold: { next: 'out',  ms: 4000, label: 'Hold' },
  out:  { next: 'in',   ms: 6000, label: 'Breathe out' },
};

const SCALE: Record<Phase, number> = { in: 1.18, hold: 1.18, out: 0.74 };

export const BreathingGuide: React.FC = () => {
  const reduced = prefersReducedMotion();
  const [phase, setPhase] = useState<Phase>('in');

  useEffect(() => {
    const step = CADENCE[phase];
    const t = setTimeout(() => setPhase(step.next), step.ms);
    return () => clearTimeout(t);
  }, [phase]);

  const { label, ms } = CADENCE[phase];
  // Hold keeps the previous scale (no visible motion), so only in/out animate.
  const transitionMs = phase === 'hold' ? 0 : ms;

  return (
    <div className="absolute inset-0 z-[8] flex flex-col items-center justify-center pointer-events-none select-none">
      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
        {/* Outer aura */}
        <div
          className="absolute rounded-full"
          style={{
            width: 240, height: 240,
            background: 'radial-gradient(circle, rgba(253,164,175,0.18), rgba(253,164,175,0) 70%)',
            transform: reduced ? 'scale(1)' : `scale(${SCALE[phase]})`,
            transition: `transform ${transitionMs}ms cubic-bezier(0.37,0,0.36,1)`,
          }}
        />
        {/* Breathing ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 150, height: 150,
            border: '1.5px solid rgba(255,255,255,0.55)',
            boxShadow: '0 0 40px rgba(253,164,175,0.35), inset 0 0 30px rgba(255,255,255,0.12)',
            background: 'radial-gradient(circle, rgba(255,255,255,0.08), rgba(255,255,255,0) 65%)',
            transform: reduced ? 'scale(1)' : `scale(${SCALE[phase]})`,
            transition: `transform ${transitionMs}ms cubic-bezier(0.37,0,0.36,1)`,
          }}
        />
        {/* Inner soft dot */}
        <div
          className="absolute rounded-full"
          style={{
            width: 8, height: 8,
            background: 'rgba(255,255,255,0.85)',
            boxShadow: '0 0 14px rgba(255,255,255,0.8)',
          }}
        />
      </div>
      <p
        key={label}
        className="mt-10 text-white/80 text-sm tracking-[0.35em] uppercase font-light"
        style={{ animation: 'quietFadeIn 700ms ease both' }}
      >
        {label}
      </p>
    </div>
  );
};

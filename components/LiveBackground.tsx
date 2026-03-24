/**
 * LiveBackground — Warm ambient glow.
 *
 * Three slowly drifting color pools: amber, soft rose, cream.
 * Pure CSS — zero JS animation overhead, GPU composited.
 */

import React from 'react';

export const LiveBackground: React.FC = () => (
  <div
    aria-hidden="true"
    className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
  >
    {/* Pink pool — top left */}
    <div
      className="absolute animate-drift-1"
      style={{
        width: '70vw', height: '70vw', maxWidth: '520px', maxHeight: '520px',
        top: '-15%', left: '-15%',
        background: 'radial-gradient(circle, rgba(251,207,232,0.18) 0%, rgba(244,114,182,0.06) 50%, transparent 70%)',
        filter: 'blur(72px)',
        borderRadius: '50%',
      }}
    />

    {/* Soft rose pool — bottom right */}
    <div
      className="absolute animate-drift-2"
      style={{
        width: '65vw', height: '65vw', maxWidth: '480px', maxHeight: '480px',
        bottom: '-12%', right: '-12%',
        background: 'radial-gradient(circle, rgba(249,168,212,0.14) 0%, rgba(251,207,232,0.05) 50%, transparent 70%)',
        filter: 'blur(80px)',
        borderRadius: '50%',
      }}
    />

    {/* Pink highlight — center */}
    <div
      className="absolute animate-drift-3"
      style={{
        width: '55vw', height: '55vw', maxWidth: '420px', maxHeight: '420px',
        top: '25%', left: '22%',
        background: 'radial-gradient(circle, rgba(251,207,232,0.12) 0%, rgba(244,114,182,0.04) 50%, transparent 70%)',
        filter: 'blur(88px)',
        borderRadius: '50%',
      }}
    />
  </div>
);

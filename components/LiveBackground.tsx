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
    {/* Amber pool — top left */}
    <div
      className="absolute animate-drift-1"
      style={{
        width: '70vw', height: '70vw', maxWidth: '520px', maxHeight: '520px',
        top: '-15%', left: '-15%',
        background: 'radial-gradient(circle, rgba(244,63,94,0.12) 0%, transparent 70%)',
        filter: 'blur(48px)',
        borderRadius: '50%',
      }}
    />

    {/* Soft rose pool — bottom right */}
    <div
      className="absolute animate-drift-2"
      style={{
        width: '65vw', height: '65vw', maxWidth: '480px', maxHeight: '480px',
        bottom: '-12%', right: '-12%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)',
        filter: 'blur(56px)',
        borderRadius: '50%',
      }}
    />

    {/* Cream highlight — center */}
    <div
      className="absolute animate-drift-3"
      style={{
        width: '55vw', height: '55vw', maxWidth: '420px', maxHeight: '420px',
        top: '25%', left: '22%',
        background: 'radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)',
        filter: 'blur(64px)',
        borderRadius: '50%',
      }}
    />
  </div>
);

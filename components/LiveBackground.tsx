/**
 * LiveBackground — Warm ambient glow (mobile-only).
 *
 * Static radial pools anchored to the corners. Avoids runtime blur filters
 * and continuously animated fixed layers, which are expensive on WebView
 * during resize, scrolling, and route transitions.
 */

import React from 'react';

export const LiveBackground: React.FC = () => (
  <div
    aria-hidden="true"
    className="fixed inset-0 z-0 pointer-events-none"
    style={{
      contain: 'strict',
      background: [
        'radial-gradient(64% 42% at -18% -14%, rgba(var(--theme-particle-2-rgb), 0.20) 0%, rgba(var(--theme-particle-1-rgb), 0.055) 46%, transparent 72%)',
        'radial-gradient(58% 38% at 118% 112%, rgba(var(--theme-particle-4-rgb), 0.16) 0%, rgba(var(--theme-particle-2-rgb), 0.045) 48%, transparent 74%)',
        'radial-gradient(72% 44% at 52% -18%, rgba(255, 255, 255, 0.20) 0%, transparent 62%)',
      ].join(', '),
    }}
  />
);

/**
 * DebugOverlay — Engineering visibility.
 *
 * Only visible in development. Shows:
 * · Live fps graph (last 120 samples)
 * · Per-effect estimated GPU/CPU cost (declared by subscribers)
 * · Current quality tier
 * · Dropped frame indicator
 * · Toggle with Shift+D
 */

import React, { useState, useEffect, useRef } from 'react';
import { AnimationEngine, type QualityTier } from '../utils/AnimationEngine';
import { PerformanceManager } from '../utils/PerformanceManager';

const GRAPH_W = 180;
const GRAPH_H = 60;

const TIER_COLOR: Record<QualityTier, string> = {
  ultra:      '#34d399',
  high:       '#60a5fa',
  medium:     '#fbbf24',
  low:        '#f97316',
  'css-only': '#ef4444',
};

const EFFECT_BUDGETS: { id: string; cpu: string; gpu: string; tier: QualityTier }[] = [
  { id: 'breathing-rhythm',    cpu: '0.15ms', gpu: '—',      tier: 'css-only' },
  { id: 'constellation',       cpu: '1.8ms',  gpu: '—',      tier: 'medium'   },
  { id: 'touch-trail',         cpu: '1.5ms',  gpu: '—',      tier: 'medium'   },
  { id: 'gravity-bloom',       cpu: '1.2ms',  gpu: '—',      tier: 'medium'   },
  { id: 'heartbeat-resonance', cpu: '1.8ms',  gpu: '—',      tier: 'medium'   },
  { id: 'physics-confetti',    cpu: '3.0ms',  gpu: '—',      tier: 'medium'   },
  { id: 'live-background',     cpu: '0.5ms',  gpu: '≤3ms',   tier: 'low'      },
];

export const DebugOverlay: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [fps, setFps]         = useState(120);
  const [tier, setTier]       = useState<QualityTier>('ultra');
  const canvasRef             = useRef<HTMLCanvasElement>(null);
  const rafRef                = useRef(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'D') setVisible(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) { cancelAnimationFrame(rafRef.current); return; }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width  = GRAPH_W;
    canvas.height = GRAPH_H;

    PerformanceManager.setTierChangeCallback(t => setTier(t));

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      // Update scalar stats
      setFps(AnimationEngine.fps);
      setTier(AnimationEngine.tier);

      // Draw fps graph
      ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);

      // Grid lines at 30, 60, 120 fps
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (const target of [30, 60, 120]) {
        const y = GRAPH_H - (target / 140) * GRAPH_H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GRAPH_W, y); ctx.stroke();
      }

      // FPS line
      ctx.beginPath();
      const samples = PerformanceManager.fpsHistory;
      const idx = (PerformanceManager as any).histIdx || 0;
      for (let i = 0; i < 120; i++) {
        const sampleIdx = (idx - 120 + i + 240) % 120;
        const x = (i / 119) * GRAPH_W;
        const y = GRAPH_H - Math.min(samples[sampleIdx] / 140, 1) * GRAPH_H;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = TIER_COLOR[AnimationEngine.tier];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible]);

  if (!import.meta.env.DEV || !visible) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[200] font-mono text-[10px] select-none"
      style={{
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        padding: '10px',
        color: '#e2e8f0',
        width: `${GRAPH_W + 20}px`,
        border: `1px solid rgba(255,255,255,0.1)`,
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <span style={{ color: '#94a3b8' }}>TULIKA DEBUG</span>
        <span style={{ color: TIER_COLOR[tier], fontWeight: 'bold' }}>{tier.toUpperCase()}</span>
      </div>

      {/* FPS readout */}
      <div className="flex justify-between mb-1">
        <span style={{ color: '#94a3b8' }}>fps</span>
        <span style={{ color: fps >= 100 ? '#34d399' : fps >= 60 ? '#fbbf24' : '#ef4444', fontWeight: 'bold' }}>
          {fps}
        </span>
      </div>

      {/* Graph */}
      <canvas ref={canvasRef} style={{ width: `${GRAPH_W}px`, height: `${GRAPH_H}px`, display: 'block', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }} />

      {/* Frame budget table */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
        <div className="flex justify-between mb-1" style={{ color: '#94a3b8' }}>
          <span style={{ width: '110px' }}>effect</span>
          <span style={{ width: '35px', textAlign: 'right' }}>cpu</span>
          <span style={{ width: '35px', textAlign: 'right' }}>gpu</span>
        </div>
        {EFFECT_BUDGETS.map(e => {
          const tierRank = { 'css-only': 0, low: 1, medium: 2, high: 3, ultra: 4 };
          const active = tierRank[AnimationEngine.tier] >= tierRank[e.tier];
          return (
            <div key={e.id} className="flex justify-between" style={{ opacity: active ? 1 : 0.35, marginBottom: '1px' }}>
              <span style={{ width: '110px', color: active ? '#e2e8f0' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.id}
              </span>
              <span style={{ width: '35px', textAlign: 'right', color: '#93c5fd' }}>{e.cpu}</span>
              <span style={{ width: '35px', textAlign: 'right', color: '#a78bfa' }}>{e.gpu}</span>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '6px', paddingTop: '4px', color: '#475569' }}>
        Shift+D to hide
      </div>
    </div>
  );
};

/**
 * FPSMonitor — Dev-only performance overlay.
 *
 * Renders ONLY in import.meta.env.DEV — zero cost in production.
 *
 * Shows:
 *   - Actual FPS (from AnimationEngine ring buffer)
 *   - Current quality tier (with color indicator)
 *   - Per-subscriber budget bars (declared vs actual cost)
 *   - Frame budget overview (8.33ms = 120fps)
 *   - Total JS cost this frame
 *
 * Draggable so it never covers content.
 * Toggle with: AnimationEngine's data-tier attribute visible on <html>.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimationEngine, QualityTier } from '../utils/AnimationEngine';

if (!import.meta.env.DEV) {
  // Bail fast — ensure zero runtime in production
}

const FRAME_BUDGET = 8.33; // ms at 120fps
const POLL_MS      = 200;  // refresh rate of the overlay itself

const TIER_COLOR: Record<QualityTier, string> = {
  'ultra':    '#22c55e',
  'high':     '#86efac',
  'medium':   '#facc15',
  'low':      '#fb923c',
  'css-only': '#ef4444',
};

interface SubCost {
  id: string;
  cost: number;
  budget: number;
}

const FPSMonitor: React.FC = () => {
  const [fps, setFps]         = useState(0);
  const [tier, setTier]       = useState<QualityTier>('ultra');
  const [costs, setCosts]     = useState<SubCost[]>([]);
  const [totalCost, setTotal] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  // Drag
  const posRef      = useRef({ x: 10, y: 10 });
  const dragging    = useRef(false);
  const dragOff     = useRef({ x: 0, y: 0 });
  const panelRef    = useRef<HTMLDivElement>(null);

  // Poll AnimationEngine at POLL_MS (never at 120fps — that would be ironic)
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const id = setInterval(() => {
      setFps(AnimationEngine.fps);
      setTier(AnimationEngine.tier);

      let total = 0;
      const arr: SubCost[] = [];
      for (const [id, cost] of AnimationEngine.costs) {
        total += cost;
        // Find the subscriber to get declared budget
        arr.push({ id, cost, budget: 2 }); // default budget for display
      }
      arr.sort((a, b) => b.cost - a.cost);
      setCosts(arr);
      setTotal(parseFloat(total.toFixed(2)));
    }, POLL_MS);

    return () => clearInterval(id);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragOff.current  = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !panelRef.current) return;
    posRef.current = { x: e.clientX - dragOff.current.x, y: e.clientY - dragOff.current.y };
    panelRef.current.style.left = `${posRef.current.x}px`;
    panelRef.current.style.top  = `${posRef.current.y}px`;
  }, []);

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  if (!import.meta.env.DEV) return null;

  const fpsColor  = fps >= 110 ? '#22c55e' : fps >= 55 ? '#facc15' : '#ef4444';
  const costColor = totalCost <= 2 ? '#22c55e' : totalCost <= 5 ? '#facc15' : '#ef4444';
  const budgetPct = Math.min((totalCost / FRAME_BUDGET) * 100, 100);

  return (
    <div
      ref={panelRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position:      'fixed',
        left:          posRef.current.x,
        top:           posRef.current.y,
        zIndex:        99999,
        background:    'rgba(0,0,0,0.88)',
        backdropFilter:'blur(12px)',
        borderRadius:  10,
        padding:       collapsed ? '5px 10px' : '8px 12px',
        fontFamily:    '"SF Mono", "Fira Code", monospace',
        fontSize:      10,
        lineHeight:    1.6,
        userSelect:    'none',
        cursor:        'grab',
        touchAction:   'none',
        minWidth:      collapsed ? 0 : 200,
        color:         '#e2e8f0',
        border:        '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header row — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: fpsColor, fontWeight: 700, fontSize: 13 }}>{fps}</span>
        <span style={{ color: '#64748b' }}>fps</span>
        <span style={{
          background: TIER_COLOR[tier],
          color: '#000',
          fontWeight: 700,
          borderRadius: 4,
          padding: '0 5px',
          fontSize: 9,
          letterSpacing: '0.05em',
        }}>{tier.toUpperCase()}</span>
        <span style={{ color: costColor, marginLeft: 'auto' }}>{totalCost}ms</span>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: 11 }}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Frame budget bar */}
          <div style={{ marginTop: 6, marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 2 }}>
              <span>JS budget ({FRAME_BUDGET}ms max)</span>
              <span>{budgetPct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width:  `${budgetPct}%`,
                background: budgetPct < 30 ? '#22c55e' : budgetPct < 65 ? '#facc15' : '#ef4444',
                borderRadius: 2,
                transition: 'width 0.2s ease',
              }} />
            </div>
          </div>

          {/* Per-subscriber cost bars */}
          {costs.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
              {costs.slice(0, 8).map(({ id, cost }) => {
                const pct     = Math.min((cost / FRAME_BUDGET) * 100, 100);
                const barColor = cost <= 1 ? '#22c55e' : cost <= 3 ? '#facc15' : '#ef4444';
                const label   = id.length > 22 ? id.slice(0, 22) + '…' : id;
                return (
                  <div key={id} style={{ marginBottom: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
                      <span style={{ color: '#94a3b8' }}>{label}</span>
                      <span style={{ color: barColor }}>{cost.toFixed(2)}ms</span>
                    </div>
                    <div style={{ height: 2, background: '#1e293b', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width:  `${pct}%`,
                        background: barColor,
                        borderRadius: 1,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tier legend */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 5, marginTop: 4, fontSize: 9, color: '#475569' }}>
            ultra≥108 · high≥90 · medium≥60 · low≥30 · css
          </div>
        </>
      )}
    </div>
  );
};

export default FPSMonitor;

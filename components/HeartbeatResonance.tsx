/**
 * HeartbeatResonance — The most emotional effect in the app.
 *
 * Two glowing cores pulse in the center. They start with slightly different
 * rhythms. Over 8 seconds, they gradually synchronize. When they align
 * perfectly — a silent shockwave of light expands from the midpoint,
 * washing the screen in soft bloom. Then the cycle resets.
 *
 * Watching it happen feels like watching something real.
 */

import React, { useRef, useEffect } from 'react';
import { AnimationEngine } from '../utils/AnimationEngine';

interface HeartbeatResonanceProps {
  className?: string;
}

export const HeartbeatResonance: React.FC<HeartbeatResonanceProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    let W = 0, H = 0;
    const resize = () => {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Heartbeat parameters ──────────────────────────────────────
    const PERIOD_A = 2100;  // ms — my heartbeat
    const PERIOD_B = 2380;  // ms — partner heartbeat (slightly different)
    const SYNC_DURATION = 8000; // ms to full sync

    let syncT = 0;           // 0–1 sync progress
    let lastSync = performance.now();
    let waveR = 0;
    let waveActive = false;
    let waveAlpha = 0;
    let justSynced = false;

    // Double-bump heartbeat waveform (lub-dub)
    const hbPulse = (t: number, period: number): number => {
      const phase = (t % period) / period; // 0–1
      const b1 = Math.exp(-Math.pow((phase - 0.12) * 18, 2));
      const b2 = Math.exp(-Math.pow((phase - 0.28) * 22, 2)) * 0.55;
      return Math.max(b1 + b2, 0);
    };

    AnimationEngine.register({
      id: 'heartbeat-resonance',
      priority: 7,
      budgetMs: 1.8,
      minTier: 'medium',

      tick(delta, timestamp) {
        ctx.clearRect(0, 0, W, H);

        const t = timestamp;

        // ── Sync convergence ──────────────────────────────────────
        // Phase A: fixed period_A
        // Phase B: period slowly converges toward period_A
        const elapsed = t - lastSync;
        syncT = Math.min(elapsed / SYNC_DURATION, 1);
        const lerpedPeriodB = PERIOD_B + (PERIOD_A - PERIOD_B) * syncT;

        const hb0 = hbPulse(t, PERIOD_A);
        const hb1 = hbPulse(t, lerpedPeriodB);

        const cx = W / 2;
        const cy = H / 2;
        const separation = W * 0.14;

        const x0 = cx - separation;
        const x1 = cx + separation;
        const y0 = cy, y1 = cy;

        // ── Perfect sync detection ────────────────────────────────
        const phaseA = (t % PERIOD_A)         / PERIOD_A;
        const phaseB = (t % lerpedPeriodB)    / lerpedPeriodB;
        const phaseDiff = Math.abs(phaseA - phaseB);
        const synced = phaseDiff < 0.015 && syncT > 0.85;

        if (synced && !justSynced) {
          justSynced = true;
          waveActive = true;
          waveR = 0;
          waveAlpha = 0.6;
        }
        if (!synced) justSynced = false;

        // ── Shockwave ─────────────────────────────────────────────
        if (waveActive) {
          waveR += delta * 2.8;
          waveAlpha -= delta * 0.0004;
          if (waveAlpha <= 0) { waveActive = false; waveAlpha = 0; }

          const midX = (x0 + x1) / 2;
          const midY = (y0 + y1) / 2;
          const bloom = ctx.createRadialGradient(midX, midY, 0, midX, midY, waveR);
          bloom.addColorStop(0,   `rgba(244,63,94,${(waveAlpha * 0.4).toFixed(3)})`);
          bloom.addColorStop(0.3, `rgba(251,113,133,${(waveAlpha * 0.25).toFixed(3)})`);
          bloom.addColorStop(0.7, `rgba(244,63,94,${(waveAlpha * 0.08).toFixed(3)})`);
          bloom.addColorStop(1,   `rgba(244,63,94,0)`);
          ctx.fillStyle = bloom;
          ctx.fillRect(0, 0, W, H);

          // Reset sync after a brief pause so the cycle restarts
          if (waveR > Math.max(W, H) * 1.5) {
            waveActive = false;
            syncT = 0;
            lastSync = t + 1000; // 1s gap before resync begins
          }
        }

        // ── Draw cores ────────────────────────────────────────────
        const drawCore = (
          x: number, y: number,
          hb: number,
          primaryColor: string,
          glowColor: string,
        ) => {
          const baseR = W * 0.042;
          const r = baseR * (1 + hb * 0.55);
          const glowR = r * 4.5;

          // Outer atmospheric glow
          const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
          outerGlow.addColorStop(0,   `rgba(${glowColor},${(0.25 + hb * 0.3).toFixed(3)})`);
          outerGlow.addColorStop(0.4, `rgba(${glowColor},${(0.08 + hb * 0.12).toFixed(3)})`);
          outerGlow.addColorStop(1,   `rgba(${glowColor},0)`);
          ctx.beginPath();
          ctx.arc(x, y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = outerGlow;
          ctx.fill();

          // Inner core with radial highlight
          const core = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
          core.addColorStop(0, `rgba(255,255,255,${(0.7 + hb * 0.3).toFixed(3)})`);
          core.addColorStop(0.4, primaryColor);
          core.addColorStop(1, `rgba(${glowColor},0.9)`);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = core;
          ctx.fill();
        };

        drawCore(x0, y0, hb0, 'rgba(244,63,94,0.95)',  '244,63,94');
        drawCore(x1, y1, hb1, 'rgba(251,191,36,0.95)', '251,191,36');

        // ── Thread between them (brightens as sync increases) ─────
        const threadAlpha = 0.15 + syncT * 0.6;
        const thread = ctx.createLinearGradient(x0, y0, x1, y1);
        thread.addColorStop(0,   `rgba(244,63,94,${threadAlpha})`);
        thread.addColorStop(0.5, `rgba(255,255,255,${threadAlpha * 0.8})`);
        thread.addColorStop(1,   `rgba(251,191,36,${threadAlpha})`);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        // Slight sway
        const sway = Math.sin(t * 0.0008) * 12 * syncT;
        ctx.quadraticCurveTo(cx, cy + sway, x1, y1);
        ctx.strokeStyle = thread;
        ctx.lineWidth = 1 + syncT * 2;
        ctx.stroke();

        // ── Sync progress indicator — tiny text ──────────────────
        if (syncT > 0 && syncT < 0.99 && import.meta.env.DEV) {
          ctx.fillStyle = 'rgba(244,63,94,0.4)';
          ctx.font = '10px monospace';
          ctx.fillText(`sync ${(syncT * 100).toFixed(0)}%`, cx - 20, cy + H * 0.25);
        }
      },
    });

    return () => {
      AnimationEngine.unregister('heartbeat-resonance');
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`w-full ${className}`}
      style={{ height: '120px', display: 'block' }}
    />
  );
};

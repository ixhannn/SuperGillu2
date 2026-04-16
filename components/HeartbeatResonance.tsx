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
import { readThemeRgbTriplet } from '../utils/themeVars';

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

    let resonanceARgb = '244,63,94';
    let resonanceBRgb = '251,191,36';
    let starCoreRgb = '253,164,175';

    const syncThemeColors = () => {
      resonanceARgb = readThemeRgbTriplet('--theme-resonance-a-rgb', '244,63,94');
      resonanceBRgb = readThemeRgbTriplet('--theme-resonance-b-rgb', '251,191,36');
      starCoreRgb = readThemeRgbTriplet('--theme-star-core-rgb', '253,164,175');
    };
    syncThemeColors();

    const themeObserver = new MutationObserver(syncThemeColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme'],
    });

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
          bloom.addColorStop(0,   `rgba(${resonanceARgb},${(waveAlpha * 0.4).toFixed(3)})`);
          bloom.addColorStop(0.3, `rgba(${starCoreRgb},${(waveAlpha * 0.25).toFixed(3)})`);
          bloom.addColorStop(0.7, `rgba(${resonanceARgb},${(waveAlpha * 0.08).toFixed(3)})`);
          bloom.addColorStop(1,   `rgba(${resonanceARgb},0)`);
          ctx.fillStyle = bloom;
          ctx.fillRect(0, 0, W, H);

          // Reset sync after a brief pause so the cycle restarts
          if (waveR > Math.max(W, H) * 1.5) {
            waveActive = false;
            syncT = 0;
            lastSync = t + 1000; // 1s gap before resync begins
          }
        }

        // ── Draw cores ─────────────────────────────────────────────
        // shadowBlur = GPU compositor path, zero gradient allocations per frame.
        const drawCore = (
          x: number, y: number,
          hb: number,
          primaryColor: string,
          glowColor: string,
        ) => {
          const baseR = W * 0.042;
          const r = baseR * (1 + hb * 0.55);

          // Outer atmospheric glow via shadowBlur (hardware-accelerated, no GC)
          ctx.shadowBlur  = r * 10 * (0.6 + hb * 0.4);
          ctx.shadowColor = `rgba(${glowColor},${(0.5 + hb * 0.3).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = primaryColor;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Specular highlight — tiny white arc, no allocation
          ctx.beginPath();
          ctx.arc(x - r * 0.22, y - r * 0.22, r * 0.32, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${(0.55 + hb * 0.35).toFixed(2)})`;
          ctx.fill();
        };

        drawCore(x0, y0, hb0, `rgba(${resonanceARgb},0.95)`, resonanceARgb);
        drawCore(x1, y1, hb1, `rgba(${resonanceBRgb},0.95)`, resonanceBRgb);

        // ── Thread between them (brightens as sync increases) ─────
        const threadAlpha = 0.15 + syncT * 0.6;
        const thread = ctx.createLinearGradient(x0, y0, x1, y1);
        thread.addColorStop(0,   `rgba(${resonanceARgb},${threadAlpha})`);
        thread.addColorStop(0.5, `rgba(255,255,255,${threadAlpha * 0.8})`);
        thread.addColorStop(1,   `rgba(${resonanceBRgb},${threadAlpha})`);
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
          ctx.fillStyle = `rgba(${resonanceARgb},0.4)`;
          ctx.font = '10px monospace';
          ctx.fillText(`sync ${(syncT * 100).toFixed(0)}%`, cx - 20, cy + H * 0.25);
        }
      },
    });

    return () => {
      AnimationEngine.unregister('heartbeat-resonance');
      ro.disconnect();
      themeObserver.disconnect();
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

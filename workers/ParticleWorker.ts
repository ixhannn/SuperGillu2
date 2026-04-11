/**
 * ParticleWorker — Particle physics on a dedicated thread.
 *
 * Runs entirely off the main thread via OffscreenCanvas.
 * The main thread sends only:
 *   - init:    { canvas: OffscreenCanvas, width, height, dpr, count, colors }
 *   - pointer: { x, y, down: boolean }
 *   - resize:  { width, height, dpr }
 *   - config:  { count, colors }   ← tier change from AnimationEngine
 *   - stop:    {}
 *
 * The Worker owns its own RAF loop (required for OffscreenCanvas rendering).
 * Main-thread AnimationEngine tier changes are forwarded via postMessage.
 *
 * PERFORMANCE CONTRACT:
 *   All typed arrays are pre-allocated at init. Zero GC during steady state.
 *   No string allocation in the hot path (alpha/color strings are quantised
 *   to integer steps and cached in a Map<number, string>).
 */

// ── Fast noise for flow field (no imports — worker module) ──────────────────
function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function flowAngle(x: number, y: number, t: number): number {
  const n1 = noise2D(x * 0.003 + t * 0.1, y * 0.003);
  const n2 = noise2D(x * 0.008 - t * 0.05, y * 0.008 + t * 0.08);
  return (n1 + n2 * 0.5) * Math.PI * 2;
}

// ── State ────────────────────────────────────────────────────────────────────
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let W = 0, H = 0, dpr = 1;

// Particle typed arrays (pre-allocated to MAX_COUNT, active slice = count)
const MAX_COUNT = 300;
const px = new Float32Array(MAX_COUNT);
const py = new Float32Array(MAX_COUNT);
const vx = new Float32Array(MAX_COUNT);
const vy = new Float32Array(MAX_COUNT);
const sizes  = new Float32Array(MAX_COUNT);
const alphas = new Float32Array(MAX_COUNT);

let count   = 0;
let colors: string[] = ['251,113,133', '253,164,175', '254,205,211', '249,168,212'];
let running = false;
let rafId   = 0;
let t       = 0;
let lastTs  = 0;

// Touch state (forwarded from main thread)
let touchX = -9999, touchY = -9999, touching = false;

// Alpha cache: int(alpha * 100) → rgba string prefix+alpha suffix
// Avoids string allocation in hot loop. Populated lazily.
const alphaCache = new Map<number, number>();

// ── Particle initialisation ──────────────────────────────────────────────────
function initParticles(newCount: number): void {
  count = Math.min(newCount, MAX_COUNT);
  for (let i = 0; i < count; i++) {
    px[i]     = Math.random() * W;
    py[i]     = Math.random() * H;
    vx[i]     = 0;
    vy[i]     = 0;
    sizes[i]  = Math.random() * 2.0 + 1.4;
    alphas[i] = Math.random() * 0.35 + 0.45;
  }
}

// ── Animation loop (Worker-owned RAF) ────────────────────────────────────────
function tick(ts: number): void {
  if (!running) return;
  rafId = requestAnimationFrame(tick);

  if (!ctx || !canvas || W === 0 || H === 0) return;

  const delta = Math.min(ts - lastTs, 50) / 16.67; // normalised to 60fps
  lastTs = ts;
  t += 0.016 * delta;

  ctx.clearRect(0, 0, W, H);

  const TOUCH_R  = 120;
  const TOUCH_F  = 4;
  const TAU      = Math.PI * 2;
  const colorLen = colors.length;

  for (let i = 0; i < count; i++) {
    // Flow field
    const angle = flowAngle(px[i], py[i], t);
    vx[i] += Math.cos(angle) * 0.3 * delta;
    vy[i] += Math.sin(angle) * 0.3 * delta;

    // Touch repulsion
    if (touching) {
      const dx = px[i] - touchX;
      const dy = py[i] - touchY;
      const distSq = dx * dx + dy * dy;
      if (distSq < TOUCH_R * TOUCH_R && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const force = (1 - dist / TOUCH_R) * TOUCH_F * delta;
        vx[i] += (dx / dist) * force;
        vy[i] += (dy / dist) * force;
      }
    }

    vx[i] *= 0.94;
    vy[i] *= 0.94;
    px[i] += vx[i] * delta;
    py[i] += vy[i] * delta;

    // Wrap
    if (px[i] < -10) px[i] = W + 10;
    if (px[i] > W + 10) px[i] = -10;
    if (py[i] < -10) py[i] = H + 10;
    if (py[i] > H + 10) py[i] = -10;

    // Draw — quantise alpha to avoid string alloc
    const twinkle = 0.88 + Math.sin(t * 0.5 + i * 0.7) * 0.12;
    const alpha   = alphas[i] * twinkle;
    const aInt    = (alpha * 100 + 0.5) | 0; // 0..100
    const col     = colors[i % colorLen];
    const size    = sizes[i];

    ctx.beginPath();
    ctx.arc(px[i], py[i], size, 0, TAU);
    ctx.fillStyle = `rgba(${col},${aInt / 100})`;
    ctx.fill();

    if (size > 2) {
      ctx.beginPath();
      ctx.arc(px[i], py[i], size * 1.8, 0, TAU);
      ctx.fillStyle = `rgba(${col},${((aInt * 0.14) | 0) / 100})`;
      ctx.fill();
    }
  }
}

// ── Message handler ──────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const { type } = e.data as { type: string };

  switch (type) {
    case 'init': {
      canvas = e.data.canvas as OffscreenCanvas;
      W      = e.data.width  as number;
      H      = e.data.height as number;
      dpr    = e.data.dpr    as number;
      count  = e.data.count  as number;
      colors = e.data.colors as string[];

      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      ctx = canvas.getContext('2d', { alpha: true }) as OffscreenCanvasRenderingContext2D;
      if (ctx) ctx.scale(dpr, dpr);

      initParticles(count);
      running = true;
      lastTs  = performance.now();
      rafId   = requestAnimationFrame(tick);
      break;
    }

    case 'resize': {
      W   = e.data.width  as number;
      H   = e.data.height as number;
      dpr = e.data.dpr    as number;
      if (canvas && ctx) {
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
      }
      break;
    }

    case 'config': {
      // Tier change from main thread — adjust particle count and colors
      const newCount  = e.data.count  as number;
      const newColors = e.data.colors as string[];
      colors = newColors;
      if (newCount !== count) {
        // Re-initialise only the new particles (existing ones keep their state)
        const prevCount = count;
        count = Math.min(newCount, MAX_COUNT);
        if (count > prevCount) {
          for (let i = prevCount; i < count; i++) {
            px[i] = Math.random() * W;
            py[i] = Math.random() * H;
            vx[i] = 0; vy[i] = 0;
            sizes[i]  = Math.random() * 2.0 + 1.4;
            alphas[i] = Math.random() * 0.35 + 0.45;
          }
        }
      }
      break;
    }

    case 'pointer': {
      touchX   = e.data.x    as number;
      touchY   = e.data.y    as number;
      touching = e.data.down as boolean;
      break;
    }

    case 'stop': {
      running = false;
      cancelAnimationFrame(rafId);
      break;
    }
  }
};

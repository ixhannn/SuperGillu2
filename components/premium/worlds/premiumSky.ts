/* Premium Worlds — cinematic nebula: drifting volumetric clouds, a parallax
 * starfield, and a slow camera drift. Ported from the Lior Design System
 * handoff (premium/premium-sky.js).
 *
 * initPremiumSky(canvas, state) where state = { hexes, motion 0..10, dawn }.
 * Returns a cleanup fn. Respects prefers-reduced-motion (renders one frame). */

export interface SkyState {
  /** 3 accent hexes used to tint the nebula clouds. */
  hexes: [string, string, string] | string[];
  /** 0..10 — overall liveliness of drift / camera. */
  motion: number;
  /** Light atmosphere — dims the nebula and inverts star colour. */
  dawn: boolean;
}

type RGB = [number, number, number];

function hexToRgb(h: string): RGB {
  const m = h.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function cloudSprite(rgb: RGB): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = 256;
  const g = s.getContext('2d');
  if (!g) return s;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`);
  grd.addColorStop(0.42, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.28)`);
  grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return s;
}

export function initPremiumSky(cv: HTMLCanvasElement | null, state: SkyState): () => void {
  if (!cv) return () => {};
  const ctx = cv.getContext('2d');
  if (!ctx) return () => {};

  const mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduce = !!mql && mql.matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
  let W = 0;
  let H = 0;
  let sprites: HTMLCanvasElement[] = [];
  let key = '';

  const size = (): void => {
    W = cv.clientWidth || 402;
    H = cv.clientHeight || 872;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();

  const build = (): void => {
    const hx = state.hexes || ['#8b8ff6', '#c4b5fd', '#f4a9d0'];
    sprites = hx.map(hexToRgb).map(cloudSprite);
    key = hx.join();
  };
  build();

  // volumetric clouds — few, large, soft, drifting
  const clouds = Array.from({ length: 9 }, (_, i) => ({
    x: Math.random(), y: Math.random(), s: rnd(1.5, 3.4),
    vx: rnd(-1, 1), vy: rnd(-0.7, 0.7), rot: Math.random() * 6.2832, vr: rnd(-0.4, 0.4),
    a: rnd(0.3, 0.62), sp: i % 3, depth: rnd(0.35, 1),
  }));
  // parallax starfield — depth-sorted
  const stars = Array.from({ length: 96 }, () => {
    const d = Math.random();
    return {
      x: Math.random(), y: Math.random(), r: 0.5 + d * 1.7, a: rnd(0.3, 0.95),
      ph: Math.random() * 6.2832, tw: rnd(0.5, 1.5), depth: 0.2 + d,
    };
  });

  let raf = 0;
  let t = 0;
  const draw = (): void => {
    if ((state.hexes || []).join() !== key) build();
    const m = Math.max(0, Math.min(10, state.motion == null ? 7 : state.motion)) / 7;
    const dawn = !!state.dawn;
    const camX = Math.sin(t * 0.05) * 24 * m;
    const camY = Math.cos(t * 0.043) * 17 * m;
    ctx.clearRect(0, 0, W, H);

    // nebula
    ctx.globalCompositeOperation = dawn ? 'source-over' : 'lighter';
    for (const c of clouds) {
      const px = (((c.x + t * 0.004 * c.vx * m) % 1) + 1) % 1 * W + camX * c.depth;
      const py = (((c.y + t * 0.004 * c.vy * m) % 1) + 1) % 1 * H + camY * c.depth;
      const sz = 150 * c.s;
      ctx.globalAlpha = c.a * (dawn ? 0.16 : 0.5);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(c.rot + t * 0.01 * c.vr);
      ctx.drawImage(sprites[c.sp % sprites.length], -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }

    // parallax stars
    for (const s of stars) {
      const px = (((s.x * W + camX * s.depth * 2.4) % W) + W) % W;
      const py = (((s.y * H + camY * s.depth * 2.4) % H) + H) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * s.tw + s.ph);
      ctx.globalAlpha = (dawn ? 0.16 : 0.9) * s.a * tw;
      ctx.fillStyle = dawn ? '#6b6280' : '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // Throttle to ~30fps. This canvas runs its OWN rAF (outside AnimationEngine),
  // so without a gate it redraws 9 additive cloud sprites + 96 stars at the
  // panel's native rate (120Hz) — a continuous battery/heat cost while the user
  // sits on this screen. The nebula drift is slow enough to be visually
  // identical at 30fps. Advance `t` by REAL elapsed seconds (not a fixed
  // per-frame step) so drift speed is frame-rate independent.
  const FRAME_MS = 1000 / 30;
  let lastDraw = -Infinity;
  const loop = (now: number): void => {
    const dt = now - lastDraw;
    if (dt >= FRAME_MS) { t += Math.min(dt, 100) / 1000; lastDraw = now; draw(); }
    raf = requestAnimationFrame(loop);
  };

  let running = false;
  const start = (): void => {
    if (running || reduce || (typeof document !== 'undefined' && document.hidden)) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const stop = (): void => { running = false; cancelAnimationFrame(raf); };

  // Pause the loop when the screen is backgrounded / covered — many app shells
  // keep this view mounted, so a free-running rAF would drain battery unseen.
  const onVisibility = (): void => { if (document.hidden) stop(); else start(); };
  // Re-evaluate reduced-motion live if the OS setting changes mid-session.
  const onMotionPref = (): void => {
    reduce = !!mql && mql.matches;
    if (reduce) { stop(); draw(); } else start();
  };
  // Re-measure on resize, and repaint immediately when the loop isn't driving
  // (reduced-motion / paused) so the static frame stays correct.
  const onResize = (): void => { size(); if (reduce || !running) draw(); };
  const ro = new ResizeObserver(onResize);
  ro.observe(cv);
  document.addEventListener('visibilitychange', onVisibility);
  mql?.addEventListener?.('change', onMotionPref);

  if (reduce) draw(); else start();

  return (): void => {
    stop();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    mql?.removeEventListener?.('change', onMotionPref);
  };
}

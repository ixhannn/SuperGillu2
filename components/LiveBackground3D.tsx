/**
 * LiveBackground3D — Cinematic atmospheric bokeh field.
 *
 * Two-layer particle system:
 *   Layer A — 60 large dreamy bokeh orbs, slow Lissajous orbits
 *   Layer B — 35 tiny sparkle dots, faster drift
 *
 * Features:
 *   • Per-particle breathing alpha via shader phase attribute
 *   • Dual-ring bokeh (outer glow + bright core) for cinematic depth
 *   • Lissajous orbits (mismatched X/Y frequencies) for organic paths
 *   • Slow camera Z-breath for living parallax
 *   • Depth fog and scroll parallax
 *   • Graceful CSS fallback for low-tier / no-WebGL devices
 */

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { AnimationEngine, QualityTier } from '../utils/AnimationEngine';
import { LiveBackground } from './LiveBackground';
import { readThemeColorList } from '../utils/themeVars';
import { observeDocumentAttributes } from '../utils/documentObserverBus';

export type ParticlePreset = 'spark' | 'plasma' | 'ink';

// ── Particle counts ────────────────────────────────────────────────
const BOKEH_COUNT   = 24;   // large, slow, dreamy
const SPARKLE_COUNT = 10;   // small, drifting accents
const TOTAL         = BOKEH_COUNT + SPARKLE_COUNT;

// Cap the ambient render to ~30fps. The bokeh motion is so slow (a full orbit
// takes 40–350s) that 30fps is visually identical — but every rendered frame
// makes the page's backdrop-filter glass ABOVE this full-screen canvas
// re-resolve its blur, so rendering 30x/s instead of up to 120x/s cuts that
// (the Home lag) ~4x. Refresh-rate-independent: 33ms gate = ~30fps on any panel.
const RENDER_MIN_INTERVAL_MS = 1000 / 24;

const PRESETS: Record<ParticlePreset, {
  bokehColors: string[];
  sparkleColors: string[];
  bokehFreqMult: number;
  sparkleFreqMult: number;
  alphaScale: number;
}> = {
  spark: {
    bokehColors: ['#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d'],
    sparkleColors: ['#f472b6', '#ec4899', '#db2777', '#ffffff'],
    bokehFreqMult: 1,
    sparkleFreqMult: 0.55,
    alphaScale: 0.55,
  },
  plasma: {
    bokehColors: ['#f472b6', '#e879f9', '#c084fc', '#a855f7', '#7e22ce'],
    sparkleColors: ['#f0abfc', '#e879f9', '#c084fc', '#ffffff'],
    bokehFreqMult: 1.2,
    sparkleFreqMult: 0.65,
    alphaScale: 0.58,
  },
  ink: {
    bokehColors: ['#374151', '#4b5563', '#6b7280', '#be185d', '#9d174d'],
    sparkleColors: ['#6b7280', '#9ca3af', '#f9a8d4', '#ffffff'],
    bokehFreqMult: 0.8,
    sparkleFreqMult: 0.50,
    alphaScale: 0.50,
  },
};

// ── Seeded random helper ───────────────────────────────────────────
const createSeededRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};

interface LiveBackground3DProps {
  preset?: ParticlePreset;
  paused?: boolean;
}

export const LiveBackground3D: React.FC<LiveBackground3DProps> = ({ preset = 'spark', paused = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [useFallback, setUseFallback] = useState(false);
  const pausedRef = useRef(paused);

  pausedRef.current = paused;

  useEffect(() => {
    const activePreset = PRESETS[preset];
    const rand = createSeededRandom(42);
    let bokehColors = readThemeColorList('--theme-live-3d-bokeh', activePreset.bokehColors).map((c) => new THREE.Color(c));
    let sparkleColors = readThemeColorList('--theme-live-3d-sparkle', activePreset.sparkleColors).map((c) => new THREE.Color(c));

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── WebGL check ───────────────────────────────────────────────
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    } catch (_) { /* no WebGL */ }
    if (!gl) { setUseFallback(true); return; }

    // ── Renderer ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    // Render at reduced resolution — the bokeh shader already produces soft
    // Gaussian particles, so a lower pixel ratio creates a naturally blurred
    // look without the massive GPU cost of a CSS filter: blur() post-process.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0) * 0.35);

    // ── Scene & Camera ────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 250);
    camera.position.z = 55;

    // ── Particle data arrays ──────────────────────────────────────
    const positions  = new Float32Array(TOTAL * 3);
    const colors     = new Float32Array(TOTAL * 3);
    const sizes      = new Float32Array(TOTAL);
    const phases     = new Float32Array(TOTAL); // per-particle breath phase

    // Motion parameters (not in GPU geometry — stay in JS)
    const orbitRX    = new Float32Array(TOTAL);
    const orbitRY    = new Float32Array(TOTAL);
    const freqX      = new Float32Array(TOTAL); // Lissajous X frequency
    const freqY      = new Float32Array(TOTAL); // Lissajous Y frequency
    const phaseOff   = new Float32Array(TOTAL); // initial angle offset
    const centerX    = new Float32Array(TOTAL);
    const centerY    = new Float32Array(TOTAL);
    const baseZ      = new Float32Array(TOTAL);
    const zDriftAmp  = new Float32Array(TOTAL);
    const zDriftFreq = new Float32Array(TOTAL);

    // ── Init BOKEH layer ──────────────────────────────────────────
    for (let i = 0; i < BOKEH_COUNT; i++) {
      orbitRX[i]    = 10 + rand() * 40;
      orbitRY[i]    = 8  + rand() * 32;
      // Lissajous: slight irrational frequency ratio → organic figure patterns
      const baseFreq = (0.018 + rand() * 0.04) * activePreset.bokehFreqMult;
      freqX[i]      = baseFreq;
      freqY[i]      = baseFreq * (0.85 + rand() * 0.35); // slight mismatch
      phaseOff[i]   = rand() * Math.PI * 2;
      centerX[i]    = (rand() - 0.5) * 22;
      centerY[i]    = (rand() - 0.5) * 18;
      baseZ[i]      = -25 + rand() * 60;
      zDriftAmp[i]  = 2 + rand() * 5;
      zDriftFreq[i] = 0.06 + rand() * 0.12;
      phases[i]     = rand() * Math.PI * 2;

      const angle = phaseOff[i];
      positions[i * 3]     = centerX[i] + Math.cos(angle) * orbitRX[i];
      positions[i * 3 + 1] = centerY[i] + Math.sin(angle) * orbitRY[i];
      positions[i * 3 + 2] = baseZ[i];

      const col = bokehColors[i % bokehColors.length];
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      const depth = (baseZ[i] + 25) / 60; // 0=far → 1=near
      sizes[i] = (3.5 + rand() * 5.5) * (0.4 + depth * 1.0);
    }

    // ── Init SPARKLE layer ────────────────────────────────────────
    for (let i = BOKEH_COUNT; i < TOTAL; i++) {
      orbitRX[i]    = 4  + rand() * 18;
      orbitRY[i]    = 3  + rand() * 15;
      const baseFreq = (0.05 + rand() * 0.10) * activePreset.sparkleFreqMult;
      freqX[i]      = baseFreq;
      freqY[i]      = baseFreq * (0.7 + rand() * 0.6);
      phaseOff[i]   = rand() * Math.PI * 2;
      centerX[i]    = (rand() - 0.5) * 28;
      centerY[i]    = (rand() - 0.5) * 22;
      baseZ[i]      = -10 + rand() * 30;
      zDriftAmp[i]  = 1 + rand() * 3;
      zDriftFreq[i] = 0.12 + rand() * 0.20;
      phases[i]     = rand() * Math.PI * 2;

      const angle = phaseOff[i];
      positions[i * 3]     = centerX[i] + Math.cos(angle) * orbitRX[i];
      positions[i * 3 + 1] = centerY[i] + Math.sin(angle) * orbitRY[i];
      positions[i * 3 + 2] = baseZ[i];

      const col = sparkleColors[(i - BOKEH_COUNT) % sparkleColors.length];
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      const depth = (baseZ[i] + 10) / 30;
      sizes[i] = (0.8 + rand() * 1.8) * (0.5 + depth * 0.8);
    }

    const rebuildThemePalettes = () => {
      bokehColors = readThemeColorList('--theme-live-3d-bokeh', activePreset.bokehColors).map((c) => new THREE.Color(c));
      sparkleColors = readThemeColorList('--theme-live-3d-sparkle', activePreset.sparkleColors).map((c) => new THREE.Color(c));

      for (let i = 0; i < BOKEH_COUNT; i++) {
        const col = bokehColors[i % bokehColors.length];
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }

      for (let i = BOKEH_COUNT; i < TOTAL; i++) {
        const col = sparkleColors[(i - BOKEH_COUNT) % sparkleColors.length];
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }
    };

    // ── Geometry ──────────────────────────────────────────────────
    const geometry = new THREE.BufferGeometry();
    const posAttrBuf = new THREE.BufferAttribute(positions, 3);
    posAttrBuf.usage = THREE.DynamicDrawUsage;
    geometry.setAttribute('position', posAttrBuf);
    geometry.setAttribute('color',    new THREE.BufferAttribute(colors,  3));
    geometry.setAttribute('size',     new THREE.BufferAttribute(sizes,   1));
    geometry.setAttribute('phase',    new THREE.BufferAttribute(phases,  1));

    // ── Shader — dual-ring cinematic bokeh ────────────────────────
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime:       { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uAlphaScale: { value: activePreset.alphaScale },
      },
      vertexShader: /* glsl */`
        attribute float size;
        attribute float phase;
        varying vec3  vColor;
        varying float vAlpha;
        varying float vIsSparkle;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uAlphaScale;

        void main() {
          vColor     = color;
          vIsSparkle = float(size < 2.0);

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = -mvPosition.z;

          // Steady bright presence — less dim breathing
          float breathe   = 0.82 + 0.18 * sin(uTime * 0.38 + phase);
          float depthFade = clamp(1.0 - dist / 75.0, 0.0, 1.0);
          float depthFade2 = depthFade * depthFade;

          // Whisper-quiet — stays atmospheric, never fights content
          vAlpha = breathe * mix(0.16, 0.08, 1.0 - depthFade2) * uAlphaScale;

          gl_PointSize = size * uPixelRatio * (52.0 / max(dist, 4.0));
          gl_Position  = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3  vColor;
        varying float vAlpha;
        varying float vIsSparkle;

        void main() {
          vec2  uv = gl_PointCoord - vec2(0.5);
          float d  = length(uv);
          if (d > 0.5) discard;

          float alpha;

          if (vIsSparkle > 0.5) {
            // Sparkles: soft diffuse point — no crisp edge
            float core = exp(-d * d * 40.0);
            float halo = exp(-d * d * 10.0) * 0.25;
            alpha = vAlpha * (core + halo);
          } else {
            // Bokeh: pure soft Gaussian — no hard disc, no punchy core
            float glow = exp(-d * d * 8.0);
            alpha = vAlpha * glow;
          }

          // Gentle warm highlight at centre (reduced intensity)
          vec3 col = vColor + exp(-d * d * 35.0) * vec3(0.08, 0.04, 0.03);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.NormalBlending, // Fix: Changed from Additive to Normal so it doesn't blow out the light background to pure white
      vertexColors: true,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const stopThemeObserver = observeDocumentAttributes(['style', 'data-theme'], () => {
      rebuildThemePalettes();
      colorAttr.needsUpdate = true;
    });

    // ── Resize ────────────────────────────────────────────────────
    // Coalesce resize bursts (mobile keyboard / orientation fire many per
    // frame) into a single rAF, and early-out when the size is unchanged so
    // the full GL drawing buffer is only reallocated when dimensions truly
    // change. The final applied size is always window.innerWidth/Height, so
    // the rendered framebuffer is identical.
    let lastW = -1;
    let lastH = -1;
    let resizeRaf = 0;
    const applyResize = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (W === lastW && H === lastH) return;
      lastW = W;
      lastH = H;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        applyResize();
      });
    };
    applyResize();
    window.addEventListener('resize', onResize, { passive: true });

    // ── Scroll parallax ───────────────────────────────────────────
    // The app scrolls inside the fixed mobile shell, not the window.
    // Reading the real scroll root keeps the ambient parallax alive in the APK.
    // Single listener (not both scrollRoot + window) — the wrapper owns the
    // scroll; the window scroll path is never used in the production shell.
    let scrollY = 0;
    const scrollRoot = document.querySelector<HTMLElement>('.lenis-wrapper');
    const readScrollY = () => scrollRoot?.scrollTop ?? window.scrollY ?? 0;
    const onScroll = () => { scrollY = readScrollY(); };
    onScroll();
    if (scrollRoot) {
      scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ── Animation ─────────────────────────────────────────────────
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const posArr  = posAttr.array as Float32Array;
    let lastRenderTs = -Infinity;

    AnimationEngine.register({
      id:        'live-bg-3d',
      priority:  3,
      budgetMs:  4,
      minTier:   'medium' as QualityTier,

      tick(_delta, timestamp) {
        if (pausedRef.current) return;
        // Hand the GPU back to the page transition during view switches —
        // ambient particles are invisible during a 220ms slide anyway.
        if (typeof document !== 'undefined' && document.documentElement.dataset.transitioning) return;
        // ~30fps cap — see RENDER_MIN_INTERVAL_MS. Throttling the render is what
        // throttles the costly backdrop-filter re-blur it triggers on Home.
        if (timestamp - lastRenderTs < RENDER_MIN_INTERVAL_MS) return;
        lastRenderTs = timestamp;
        const t = timestamp * 0.001;
        material.uniforms.uTime.value = t;

        // Always update every frame — no skip to avoid breathing/position desync blink
        for (let i = 0; i < TOTAL; i++) {
          const ax = phaseOff[i] + t * freqX[i];
          const ay = phaseOff[i] + t * freqY[i];
          posArr[i * 3]     = centerX[i] + Math.cos(ax) * orbitRX[i];
          posArr[i * 3 + 1] = centerY[i] + Math.sin(ay) * orbitRY[i];
          posArr[i * 3 + 2] = baseZ[i]   + Math.sin(t * zDriftFreq[i] + phaseOff[i]) * zDriftAmp[i];
        }
        posAttr.needsUpdate = true;

        // Camera: scroll parallax + very slow gentle breath on Z
        camera.position.y = -scrollY * 0.006;
        camera.position.z = 55 + Math.sin(t * 0.07) * 3;

        renderer.render(scene, camera);
      },
    });

    return () => {
      stopThemeObserver();
      AnimationEngine.unregister('live-bg-3d');
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', onResize);
      if (scrollRoot) {
        scrollRoot.removeEventListener('scroll', onScroll);
      } else {
        window.removeEventListener('scroll', onScroll);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [preset]);

  if (useFallback) return <LiveBackground />;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ display: 'block', width: '100vw', height: '100vh', transform: 'scale(1.06)' }}
    />
  );
};

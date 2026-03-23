/**
 * LiveBackground3D — Atmospheric 3D particle field.
 *
 * Soft, warm bokeh lights drifting in gentle elliptical orbits.
 * Creates depth through z-spread and varying opacity.
 * Falls back to CSS LiveBackground on low-tier devices or no WebGL.
 */

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { AnimationEngine, QualityTier } from '../utils/AnimationEngine';
import { LiveBackground } from './LiveBackground';

const PARTICLE_COUNT = 100;

// Warm Tulika palette for particles
const COLORS = [
  new THREE.Color('#f43f5e'),  // rose
  new THREE.Color('#a855f7'),  // violet
  new THREE.Color('#6366f1'),  // indigo
  new THREE.Color('#ec4899'),  // pink
  new THREE.Color('#8b5cf6'),  // purple
  new THREE.Color('#f472b6'),  // soft pink
  new THREE.Color('#7c3aed'),  // deep violet
  new THREE.Color('#c084fc'),  // light purple
];

export const LiveBackground3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── WebGL check ───────────────────────────────────────────────
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    } catch (_) { /* no WebGL */ }
    if (!gl) {
      setUseFallback(true);
      return;
    }

    // ── Renderer ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.z = 50;

    // ── Particle system ───────────────────────────────────────────
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    // Per-particle orbital data (not stored in geometry — local arrays)
    const orbitRadiusX = new Float32Array(PARTICLE_COUNT);
    const orbitRadiusY = new Float32Array(PARTICLE_COUNT);
    const orbitSpeed = new Float32Array(PARTICLE_COUNT);
    const orbitPhase = new Float32Array(PARTICLE_COUNT);
    const orbitCenterX = new Float32Array(PARTICLE_COUNT);
    const orbitCenterY = new Float32Array(PARTICLE_COUNT);
    const baseZ = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Orbital parameters — gentle ellipses
      orbitRadiusX[i] = 8 + Math.random() * 35;
      orbitRadiusY[i] = 6 + Math.random() * 28;
      orbitSpeed[i] = 0.03 + Math.random() * 0.06;
      orbitPhase[i] = Math.random() * Math.PI * 2;
      orbitCenterX[i] = (Math.random() - 0.5) * 20;
      orbitCenterY[i] = (Math.random() - 0.5) * 16;
      baseZ[i] = -20 + Math.random() * 50;

      // Initial positions
      const angle = orbitPhase[i];
      positions[i * 3] = orbitCenterX[i] + Math.cos(angle) * orbitRadiusX[i];
      positions[i * 3 + 1] = orbitCenterY[i] + Math.sin(angle) * orbitRadiusY[i];
      positions[i * 3 + 2] = baseZ[i];

      // Color
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // Size — bigger particles farther forward for depth perception
      const depthFactor = (baseZ[i] + 20) / 50; // 0 (far) to 1 (near)
      sizes[i] = (1.5 + Math.random() * 3) * (0.5 + depthFactor * 0.8);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // ── Custom shader for soft glowing circles ────────────────────
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;

        void main() {
          vColor = color;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = -mvPosition.z;

          // Depth-based alpha — farther = more transparent
          vAlpha = clamp(0.04 + (1.0 - dist / 80.0) * 0.1, 0.02, 0.14);

          gl_PointSize = size * uPixelRatio * (50.0 / dist);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Soft circle with gaussian falloff
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = vAlpha * exp(-d * d * 8.0);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // ── Resize ────────────────────────────────────────────────────
    const resize = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // ── Scroll parallax ───────────────────────────────────────────
    let scrollY = 0;
    const onScroll = () => { scrollY = window.scrollY || 0; };
    window.addEventListener('scroll', onScroll, { passive: true });

    // ── Animation ─────────────────────────────────────────────────
    AnimationEngine.register({
      id: 'live-bg-3d',
      priority: 3,
      budgetMs: 2,
      minTier: 'medium' as QualityTier,

      tick(delta, timestamp) {
        const t = timestamp * 0.001;
        material.uniforms.uTime.value = t;

        const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const angle = orbitPhase[i] + t * orbitSpeed[i];
          posAttr.array[i * 3] = orbitCenterX[i] + Math.cos(angle) * orbitRadiusX[i];
          posAttr.array[i * 3 + 1] = orbitCenterY[i] + Math.sin(angle) * orbitRadiusY[i];
          // Subtle z-wave for depth movement
          posAttr.array[i * 3 + 2] = baseZ[i] + Math.sin(t * 0.15 + orbitPhase[i]) * 3;
        }
        posAttr.needsUpdate = true;

        // Scroll parallax — shift camera slightly
        camera.position.y = -scrollY * 0.008;

        renderer.render(scene, camera);
      },
    });

    // ── Tier change listener — switch to CSS fallback if needed ───
    const tierCheck = setInterval(() => {
      const tier = AnimationEngine.tier;
      if (tier === 'low' || tier === 'css-only') {
        setUseFallback(true);
      }
    }, 2000);

    return () => {
      clearInterval(tierCheck);
      AnimationEngine.unregister('live-bg-3d');
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  if (useFallback) {
    return <LiveBackground />;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ display: 'block', width: '100vw', height: '100vh' }}
    />
  );
};

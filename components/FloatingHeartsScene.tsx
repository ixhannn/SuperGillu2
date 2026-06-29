/**
 * FloatingHeartsScene — Dark glass morphing heart with Fresnel rim lighting,
 * organic noise displacement, particle dust, and concentric ring ripples.
 * Inspired by modern metaball/fluid glass aesthetics.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
// Bloom removed — forced second full render pass at 120fps; use CSS glow instead
import * as THREE from 'three';
import { readThemeVar } from '../utils/themeVars';
import { observeDocumentAttributes } from '../utils/documentObserverBus';
import { AnimationEngine } from '../utils/AnimationEngine';
import { installThreeWarningFilter } from '../utils/threeConsole';

installThreeWarningFilter();

const createSeededRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};


// ── GLSL Noise functions ────────────────────────────────────────────────
const noiseGLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

// ── Heart shape SDF for morphing target ─────────────────────────────────
const heartGLSL = /* glsl */ `
  // Heart parametric — returns displacement to morph sphere toward heart
  vec3 heartDisplace(vec3 pos, float blend) {
    float r = length(pos);
    if (r < 0.001) return vec3(0.0);
    vec3 n = pos / r;

    // Parametric heart in xz plane
    float theta = atan(n.x, -n.y);  // angle around Y
    float heartR = 2.0 - 2.0 * sin(theta) + sin(theta) * sqrt(abs(cos(theta))) / (sin(theta) + 1.4);
    heartR *= 0.35;

    float targetR = mix(1.0, heartR, blend);
    return n * targetR * r / max(r, 0.001) - pos + n * (targetR - 1.0) * r;
  }
`;

// ── Dark glass blob shader material ─────────────────────────────────────
const DarkGlassMaterial = shaderMaterial(
  {
    uTime: 0,
    // Richer multi-frequency noise — deeper organic motion, more visible
    // surface detail without overdriving the mesh.
    uNoiseScale: 0.95,
    uNoiseSpeed: 0.16,
    uNoiseStrength: 0.36,
    // Tighter fresnel = brighter, more defined rim halo (the euphoric glow)
    uFresnelPower: 2.4,
    uRimColor: new THREE.Color('#ffd6e8'),  /* Brighter pink rim */
    uAccentColor: new THREE.Color('#ffb3c1'), /* Warmer rose accent */
    // Body + glow colors are re-derived from the active theme's accent in
    // DarkGlassBlob — these are just the rose-theme defaults.
    uDeepColor: new THREE.Color(0.42, 0.02, 0.14),
    uWarmColor: new THREE.Color(0.78, 0.18, 0.42),
    uGlowColor: new THREE.Color(0.92, 0.55, 0.72),
    uHeartBlend: 0.0,
  },
  // Vertex shader
  /* glsl */ `
    ${noiseGLSL}
    uniform float uTime;
    uniform float uNoiseScale;
    uniform float uNoiseSpeed;
    uniform float uNoiseStrength;
    uniform float uHeartBlend;

    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying float vDisplacement;
    varying float vNoise;

    void main() {
      vec3 pos = position;

      // Two-octave noise displacement (was three). The third 4× octave was
      // adding jittery high-frequency surface ripples that, at our low DPR,
      // aliased into the "ant crawl" noise. Two octaves give the same
      // organic motion with smooth, photographic surface gradients.
      float t = uTime * uNoiseSpeed;
      float n1 = snoise(pos * uNoiseScale + t);
      float n2 = snoise(pos * uNoiseScale * 2.0 + t * 1.3) * 0.5;
      float noise = n1 + n2;

      // Organic displacement along normal
      vec3 displaced = pos + normal * noise * uNoiseStrength;

      vDisplacement = noise;
      vNoise = n1;
      vNormal = normalMatrix * normal;
      vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
      vViewPosition = -mvPos.xyz;
      vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;

      gl_Position = projectionMatrix * mvPos;
    }
  `,
  // Fragment shader
  /* glsl */ `
    uniform float uTime;
    uniform float uFresnelPower;
    uniform vec3 uRimColor;
    uniform vec3 uAccentColor;
    uniform vec3 uDeepColor;
    uniform vec3 uWarmColor;
    uniform vec3 uGlowColor;

    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying float vDisplacement;
    varying float vNoise;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);

      // Fresnel — strong rim, dark center (the key effect)
      float fresnel = pow(1.0 - abs(dot(normal, viewDir)), uFresnelPower);

      // Caustic-like highlights from noise
      float caustic = smoothstep(0.3, 0.8, abs(vNoise)) * 0.4;

      // Warm accent in specific areas (like the golden reflection)
      float accentMask = smoothstep(0.2, 0.6, vNoise) * smoothstep(0.5, 0.0, abs(vWorldPosition.y - 0.3));
      vec3 accent = uAccentColor * accentMask * 0.3;

      // Moving specular highlights — softer power so they read as wide
      // glints (not pinpricks) which would also feel like noise at low DPR.
      float spec1 = pow(max(dot(reflect(-viewDir, normal), normalize(vec3(sin(uTime * 0.5), cos(uTime * 0.3), 1.0))), 0.0), 18.0);
      float spec2 = pow(max(dot(reflect(-viewDir, normal), normalize(vec3(-cos(uTime * 0.4), sin(uTime * 0.6), 0.5))), 0.0), 28.0);

      // ── REMOVED: per-pixel hash-based dust sparkle ──
      // Was: smoothstep(0.97..1.0) of fract(sin(world * 40)*43758) — at our
      // low DPR (0.55–0.85) those single-pixel dots aliased into a constantly
      // crawling ant-like texture across the entire blob. Atmosphere is now
      // contributed entirely by the proper geometry-based DustField (motes
      // with size attenuation), which doesn't alias and reads as soft sparkle.

      // Body modulated by noise — gives the surface a living, breathing
      // gradient instead of a flat color. Deep theme core fades into a
      // warmer flush where the noise displacement is highest.
      vec3 bodyColor = mix(uDeepColor, uWarmColor, smoothstep(-0.4, 0.6, vNoise));

      vec3 rimLight     = uRimColor * fresnel * 1.15;
      vec3 causticLight = uGlowColor * caustic * fresnel * 1.3;
      vec3 specLight    = vec3(1.0, 0.92, 0.96) * (spec1 * 0.55 + spec2 * 0.4);

      // Soft inner aurora glow — second fresnel pass at a wider angle adds
      // depth without flattening the form.
      float innerGlow = pow(1.0 - abs(dot(normal, viewDir)), 1.6) * 0.35;
      vec3 auroraGlow = uGlowColor * innerGlow;

      vec3 color = bodyColor + rimLight + causticLight + specLight + accent + auroraGlow;

      // Slightly more transparent edges so the rim feels more glowy/atmospheric
      float alpha = 0.82 + fresnel * 0.18;

      gl_FragColor = vec4(color, alpha);
    }
  `,
  // Set mediump on the material so Three.js emits mediump precision in its
  // shader header — halves fragment ALU cost on mid-range mobile GPUs.
  (mat) => { if (mat) (mat as THREE.ShaderMaterial).precision = 'mediump'; },
);

extend({ DarkGlassMaterial });

// Type augmentation for R3F
declare module '@react-three/fiber' {
  interface ThreeElements {
    darkGlassMaterial: any;
  }
}

// ── Concentric ring ripples ─────────────────────────────────────────────
const RingRipple: React.FC<{ delay: number; maxScale: number; color: string }> = ({ delay, maxScale, color }) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = ((clock.elapsedTime * 0.3 + delay) % 4.0) / 4.0; // 0-1 loop over 4s
    const scale = 0.5 + t * maxScale;
    // Ease-in-out alpha curve so rings fade in softly, peak in the middle,
    // then fade out — feels more breath-like than a hard linear decay.
    const eased = Math.sin(t * Math.PI);
    const opacity = eased * 0.22;

    ref.current.scale.setScalar(scale);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = opacity;

    // Slightly more wobble for the layered ripples to feel less rigid
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.22 + delay) * 0.14;
    ref.current.rotation.y = Math.cos(clock.elapsedTime * 0.17 + delay) * 0.10;
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      {/* Slightly thicker ring band — reads better on retina at this opacity */}
      <ringGeometry args={[0.93, 1.0, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        precision="mediump"
      />
    </mesh>
  );
};

// ── Wispy orbital lines (like the concentric expanding curves) ──────────
const OrbitalLine: React.FC<{ index: number; total: number }> = ({ index, total }) => {
  const ref = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 64;
    const baseRadius = 1.3 + index * 0.25;
    const phase = (index / total) * Math.PI * 2;

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const wobble = Math.sin(t * 3 + phase) * 0.15 + Math.sin(t * 5 + phase * 2) * 0.08;
      const r = baseRadius + wobble;
      points.push(new THREE.Vector3(
        Math.cos(t) * r,
        Math.sin(t) * r * 0.3,
        Math.sin(t) * r
      ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [index, total]);

  const material = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mat.precision = 'mediump';
    return mat;
  }, []);

  const line = useMemo(() => new THREE.Line(geometry, material), [geometry, material]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const cycle = ((t * 0.15 + index * 0.5) % 5.0) / 5.0;
    const scale = 0.8 + cycle * 1.5;
    const opacity = (1.0 - cycle) * 0.12;

    ref.current.scale.setScalar(scale);
    (ref.current.material as THREE.LineBasicMaterial).opacity = opacity;
    ref.current.rotation.y = t * 0.05 + index * 0.3;
    ref.current.rotation.x = Math.sin(t * 0.1 + index) * 0.15;
    ref.current.rotation.z = Math.cos(t * 0.08 + index) * 0.1;
  });

  return <primitive object={line} ref={ref} />;
};

// ── Main morphing dark glass blob ───────────────────────────────────────
const DarkGlassBlob: React.FC<{ rimColor: string; accentColor: string }> = ({ rimColor, accentColor }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uRimColor = new THREE.Color(rimColor);
    materialRef.current.uAccentColor = new THREE.Color(accentColor);

    // Derive the blob body + glow tints from the theme accent's hue so the
    // surface itself re-themes (it used to stay crimson on every theme).
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(accentColor).getHSL(hsl);
    const sat = Math.min(1, hsl.s);
    materialRef.current.uDeepColor = new THREE.Color().setHSL(hsl.h, sat, 0.16);
    materialRef.current.uWarmColor = new THREE.Color().setHSL(hsl.h, sat, 0.44);
    materialRef.current.uGlowColor = new THREE.Color().setHSL(hsl.h, sat * 0.75, 0.72);
  }, [rimColor, accentColor]);

  useFrame(({ clock }) => {
    if (!materialRef.current || !meshRef.current) return;

    materialRef.current.uTime = clock.elapsedTime;

    // Slow gentle rotation
    meshRef.current.rotation.y = clock.elapsedTime * 0.08;
    meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.1) * 0.15;

    // Breathing scale
    const breath = 1.0 + Math.sin(clock.elapsedTime * 0.5) * 0.03;
    meshRef.current.scale.setScalar(breath);
  });

  return (
    <mesh ref={meshRef}>
      {/* Detail 3 (≈320 tris). The mid-frequency noise displacement now has
          enough vertices to express its detail without smearing — this is
          the visible "more detailed" leap from the previous detail-2 mesh. */}
      <icosahedronGeometry args={[1.7, 3]} />
      <darkGlassMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// ── Floating dust motes — fully GPU-driven ───────────────────────────────
// Initial positions and per-axis drift phases are buffer attributes set once.
// The vertex shader computes the current world position from uTime every frame
// on the GPU — zero CPU→GPU buffer uploads, no posAttr.needsUpdate per frame.
const DustField: React.FC<{ dustColor: string }> = ({ dustColor }) => {
  const count = 12;

  const { geometry, material } = useMemo(() => {
    const rand = createSeededRandom(420);
    const initPos = new Float32Array(count * 3);
    const phases  = new Float32Array(count * 3); // per-axis sinusoidal phase offsets

    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi   = Math.acos(2 * rand() - 1);
      const r     = 1.5 + rand() * 2.5;
      initPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      initPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      initPos[i * 3 + 2] = r * Math.cos(phi);
      phases[i * 3]      = rand() * Math.PI * 2;
      phases[i * 3 + 1]  = rand() * Math.PI * 2;
      phases[i * 3 + 2]  = rand() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(initPos, 3));
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 3));

    const mat = new THREE.ShaderMaterial({
      precision: 'mediump',
      uniforms: {
        uTime:  { value: 0 },
        uColor: { value: new THREE.Color(dustColor) },
      },
      vertexShader: /* glsl */`
        attribute vec3 aPhase;
        uniform float uTime;
        void main() {
          float t    = uTime * 0.05;
          vec3  pos  = position + vec3(
            sin(t * 0.9 + aPhase.x) * 0.7,
            sin(t * 0.7 + aPhase.y) * 0.5,
            sin(t * 0.8 + aPhase.z) * 0.7
          );
          vec4 mvPos   = modelViewMatrix * vec4(pos, 1.0);
          gl_Position  = projectionMatrix * mvPos;
          gl_PointSize = 38.0 / -mvPos.z;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * 0.14;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [dustColor]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  // One uniform write per frame — no buffer re-upload, no GPU stall
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return <points geometry={geometry} material={material} />;
};

// ── Scene composition ───────────────────────────────────────────────────
interface FloatingThemeColors {
  rimColor: string;
  accentColor: string;
  dustColor: string;
  lightA: string;
  lightB: string;
}

const Scene: React.FC<{ theme: FloatingThemeColors }> = ({ theme }) => (
  <>
    {/* Minimal lighting — the shader does most of the work */}
    <ambientLight intensity={0.05} />
    <pointLight position={[3, 3, 4]} intensity={0.3} color={theme.lightA} distance={12} decay={2} />
    <pointLight position={[-3, -2, 2]} intensity={0.15} color={theme.lightB} distance={10} decay={2} />

    {/* The main dark glass blob */}
    <DarkGlassBlob rimColor={theme.rimColor} accentColor={theme.accentColor} />

    {/* Three concentric ring ripples — staggered phase creates a continuous
        breathing pulse outward instead of a single sweep that has dead time. */}
    <RingRipple delay={0}    maxScale={3.0} color={theme.rimColor} />
    <RingRipple delay={1.3}  maxScale={3.4} color={theme.rimColor} />
    <RingRipple delay={2.6}  maxScale={3.8} color={theme.rimColor} />

    {/* Three orbital wisps at different radii — adds the layered cosmic
        feeling (think aurora bands wrapping around the form). */}
    <OrbitalLine index={0} total={3} />
    <OrbitalLine index={1} total={3} />
    <OrbitalLine index={2} total={3} />

    {/* Floating dust particles */}
    <DustField dustColor={theme.dustColor} />
  </>
);

const AnimationEngineFrameInvalidator: React.FC<{ paused: boolean }> = ({ paused }) => {
  const invalidate = useThree((state) => state.invalidate);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    AnimationEngine.register({
      id: 'floating-hearts-r3f',
      priority: 3,
      budgetMs: 0.2,
      minTier: 'medium',
      tick() {
        if (pausedRef.current) return;
        // Hard-pause the instant a route transition starts. The `paused` prop
        // arrives via an observer -> setState -> prop hop that lags the attribute
        // mutation by a frame or two, so the blob would otherwise keep
        // invalidating 1-2 frames into the transition (GPU contention exactly
        // when the slide needs the budget). A direct dataset read is 0-latency,
        // matching LiveBackground3D's tick.
        if (typeof document !== 'undefined'
            && document.documentElement.dataset.transitioning === '1') return;
        invalidate();
      },
    });

    return () => AnimationEngine.unregister('floating-hearts-r3f');
  }, [invalidate]);

  return null;
};

export const FloatingHeartsScene: React.FC<{ paused?: boolean }> = ({ paused = false }) => {
  const [theme, setTheme] = React.useState<FloatingThemeColors>(() => ({
    rimColor: readThemeVar('--theme-floating-rim', '#fbcfe8'),
    accentColor: readThemeVar('--theme-floating-accent', '#fda4af'),
    dustColor: readThemeVar('--theme-floating-dust', '#d4c5a9'),
    lightA: readThemeVar('--theme-floating-light-a', '#f5e6d3'),
    lightB: readThemeVar('--theme-floating-light-b', '#ffffff'),
  }));

  useEffect(() => {
    const syncTheme = () => {
      // Skip the React state write when the theme strings actually match —
      // avoids re-mounting shader uniforms on every <html> style mutation.
      setTheme((prev) => {
        const next = {
          rimColor: readThemeVar('--theme-floating-rim', '#fbcfe8'),
          accentColor: readThemeVar('--theme-floating-accent', '#fda4af'),
          dustColor: readThemeVar('--theme-floating-dust', '#d4c5a9'),
          lightA: readThemeVar('--theme-floating-light-a', '#f5e6d3'),
          lightB: readThemeVar('--theme-floating-light-b', '#ffffff'),
        };
        if (
          prev.rimColor === next.rimColor
          && prev.accentColor === next.accentColor
          && prev.dustColor === next.dustColor
          && prev.lightA === next.lightA
          && prev.lightB === next.lightB
        ) return prev;
        return next;
      });
    };

    return observeDocumentAttributes(['style', 'data-theme'], syncTheme);
  }, []);

  // ── Global transition gating ────────────────────────────────────────────
  // R3F runs its own rAF; we toggle it to 'never' during view switches so the
  // GPU is fully available for the slide-in animation. Avoids the "blob jitters
  // mid-transition" + "FPS dips into 50s on tab change" symptoms.
  const [globalPause, setGlobalPause] = React.useState<boolean>(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => {
      const next = Boolean(root.dataset.transitioning);
      setGlobalPause((prev) => (prev === next ? prev : next));
    };
    sync();
    return observeDocumentAttributes(['data-transitioning'], sync);
  }, []);
  const effectivePause = paused || globalPause;

  // Mobile-only app: blob is centered on the viewport as a hero ambient
  // backdrop the content floats over. Camera distance + canvas size are tuned
  // for phone aspect ratios — large enough to read as a recognisable form,
  // small enough to leave breathing room around the cards.
  return (
    <div
      className="fixed pointer-events-none z-[1]"
      aria-hidden="true"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '140vw',
        height: '140vw',
        maxHeight: '125vh',
        opacity: 0.5,
        willChange: 'transform', // promote to GPU compositor layer
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 6.4], fov: 52 }}
        dpr={[0.55, 0.85]}
        frameloop="demand"
        flat
        performance={{ min: 0.5 }}
        gl={{
          alpha: true,
          antialias: false,
          powerPreference: 'high-performance',
          depth: false,
          stencil: false,
        }}
      >
        <AnimationEngineFrameInvalidator paused={effectivePause} />
        <Scene theme={theme} />
      </Canvas>
    </div>
  );
};

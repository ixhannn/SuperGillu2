/**
 * FloatingHeartsScene — Dark glass morphing heart with Fresnel rim lighting,
 * organic noise displacement, particle dust, and concentric ring ripples.
 * Inspired by modern metaball/fluid glass aesthetics.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

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
    uMouse: new THREE.Vector2(0, 0),
    uNoiseScale: 0.8,
    uNoiseSpeed: 0.12, /* Slower, more hypnotic and soothing */
    uNoiseStrength: 0.28,
    uFresnelPower: 3.0,
    uRimColor: new THREE.Color('#fbcfe8'), /* Soft pink rim */
    uAccentColor: new THREE.Color('#fda4af'), /* Rose accent */
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
    uniform vec2 uMouse;

    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying float vDisplacement;
    varying float vNoise;

    void main() {
      vec3 pos = position;

      // Multi-octave noise displacement
      float t = uTime * uNoiseSpeed;
      float n1 = snoise(pos * uNoiseScale + t);
      float n2 = snoise(pos * uNoiseScale * 2.0 + t * 1.3) * 0.5;
      float n3 = snoise(pos * uNoiseScale * 4.0 + t * 0.7) * 0.25;
      float noise = n1 + n2 + n3;

      // Organic displacement along normal
      vec3 displaced = pos + normal * noise * uNoiseStrength;

      // Subtle mouse interaction — push/pull
      vec3 mouseDir = vec3(uMouse.x * 0.3, uMouse.y * 0.3, 0.0);
      displaced += mouseDir * 0.08 * (1.0 - length(pos));

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

      // Moving specular highlights
      float spec1 = pow(max(dot(reflect(-viewDir, normal), normalize(vec3(sin(uTime * 0.5), cos(uTime * 0.3), 1.0))), 0.0), 32.0);
      float spec2 = pow(max(dot(reflect(-viewDir, normal), normalize(vec3(-cos(uTime * 0.4), sin(uTime * 0.6), 0.5))), 0.0), 64.0);

      // Particle dust effect — fine sparkles based on world position
      float dust = smoothstep(0.97, 1.0, fract(sin(dot(vWorldPosition.xy * 40.0 + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453));
      dust += smoothstep(0.98, 1.0, fract(sin(dot(vWorldPosition.yz * 30.0 - uTime * 0.05, vec2(39.346, 11.135))) * 43758.5453));

      // Compose: deep hypnotic crimson/blood red body + bright soft luminous edges
      vec3 bodyColor = vec3(0.55, 0.02, 0.15); // Deep soothing crimson/red
      vec3 rimLight = uRimColor * fresnel * 0.85; // A bit stronger glow
      vec3 causticLight = vec3(1.0, 0.4, 0.5) * caustic * fresnel; // Reddish caustics
      vec3 specLight = vec3(1.0, 0.8, 0.9) * (spec1 * 0.4 + spec2 * 0.3); // Soft speculars
      vec3 dustLight = vec3(1.0, 0.5, 0.6) * dust * 0.4; // Soft red dust

      vec3 color = bodyColor + rimLight + causticLight + specLight + dustLight + accent;

      // Very subtle transparency — mostly opaque dark glass
      float alpha = 0.85 + fresnel * 0.15;

      gl_FragColor = vec4(color, alpha);
    }
  `
);

extend({ DarkGlassMaterial });

// Type augmentation for R3F
declare module '@react-three/fiber' {
  interface ThreeElements {
    darkGlassMaterial: any;
  }
}

// ── Concentric ring ripples ─────────────────────────────────────────────
const RingRipple: React.FC<{ delay: number; maxScale: number }> = ({ delay, maxScale }) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = ((clock.elapsedTime * 0.3 + delay) % 4.0) / 4.0; // 0-1 loop over 4s
    const scale = 0.5 + t * maxScale;
    const opacity = (1.0 - t) * 0.15;

    ref.current.scale.setScalar(scale);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = opacity;

    // Subtle wobble on the ring
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.2 + delay) * 0.1;
    ref.current.rotation.y = Math.cos(clock.elapsedTime * 0.15 + delay) * 0.08;
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.95, 1.0, 64]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

// ── Wispy orbital lines (like the concentric expanding curves) ──────────
const OrbitalLine: React.FC<{ index: number; total: number }> = ({ index, total }) => {
  const ref = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 128;
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

  return (
    <line ref={ref} geometry={geometry}>
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </line>
  );
};

// ── Main morphing dark glass blob ───────────────────────────────────────
const DarkGlassBlob = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  const mouse = useRef(new THREE.Vector2(0, 0));
  const targetMouse = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      targetMouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      targetMouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame(({ clock }) => {
    if (!materialRef.current || !meshRef.current) return;

    materialRef.current.uTime = clock.elapsedTime;

    // Smooth mouse follow
    mouse.current.x += (targetMouse.current.x - mouse.current.x) * 0.03;
    mouse.current.y += (targetMouse.current.y - mouse.current.y) * 0.03;
    materialRef.current.uMouse = mouse.current;

    // Slow gentle rotation
    meshRef.current.rotation.y = clock.elapsedTime * 0.08;
    meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.1) * 0.15;

    // Breathing scale
    const breath = 1.0 + Math.sin(clock.elapsedTime * 0.5) * 0.03;
    meshRef.current.scale.setScalar(breath);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.6, 32]} />
      <darkGlassMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// ── Floating dust motes ─────────────────────────────────────────────────
const DustField = () => {
  const count = 80;
  const ref = useRef<THREE.Points>(null);

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distribute in a sphere around the blob
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.5 + Math.random() * 3;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      vel[i * 3] = (Math.random() - 0.5) * 0.003;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.003;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }
    return [pos, vel];
  }, []);

  useFrame(() => {
    if (!ref.current) return;
    const posAttr = ref.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      posAttr.array[ix] += velocities[ix];
      posAttr.array[ix + 1] += velocities[ix + 1];
      posAttr.array[ix + 2] += velocities[ix + 2];

      // Soft boundary — wrap around (distSq avoids sqrt per particle)
      const distSq = posAttr.array[ix] ** 2 + posAttr.array[ix + 1] ** 2 + posAttr.array[ix + 2] ** 2;
      if (distSq > 25) {
        const scale = 1.8 / Math.sqrt(distSq);
        posAttr.array[ix] *= scale;
        posAttr.array[ix + 1] *= scale;
        posAttr.array[ix + 2] *= scale;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#d4c5a9"
        size={0.015}
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// ── Camera rig with smooth mouse follow ─────────────────────────────────
const CameraRig = () => {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  const smooth = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame(() => {
    smooth.current.x += (mouse.current.x - smooth.current.x) * 0.015;
    smooth.current.y += (mouse.current.y - smooth.current.y) * 0.015;
    camera.position.x = smooth.current.x * 0.4;
    camera.position.y = smooth.current.y * 0.25;
    camera.lookAt(0, 0, 0);
  });

  return null;
};

// ── Scene composition ───────────────────────────────────────────────────
const Scene = () => (
  <>
    {/* Minimal lighting — the shader does most of the work */}
    <ambientLight intensity={0.05} />
    <pointLight position={[3, 3, 4]} intensity={0.3} color="#f5e6d3" distance={12} decay={2} />
    <pointLight position={[-3, -2, 2]} intensity={0.15} color="#ffffff" distance={10} decay={2} />

    {/* The main dark glass blob */}
    <DarkGlassBlob />

    {/* Concentric expanding rings — reduced to 2 */}
    {Array.from({ length: 2 }, (_, i) => (
      <RingRipple key={`ring-${i}`} delay={i * 1.8} maxScale={2.5 + i * 0.4} />
    ))}

    {/* Wispy orbital curves — reduced to 2 */}
    {Array.from({ length: 2 }, (_, i) => (
      <OrbitalLine key={`orbit-${i}`} index={i} total={2} />
    ))}

    {/* Floating dust particles */}
    <DustField />

    {/* Camera follows pointer */}
    <CameraRig />

    {/* Post-processing — no mipmapBlur, higher threshold */}
    <EffectComposer>
      <Bloom
        intensity={0.5}
        luminanceThreshold={0.5}
        luminanceSmoothing={0.9}
      />
    </EffectComposer>
  </>
);

export const FloatingHeartsScene: React.FC = () => (
  <div
    className="fixed inset-0 z-[1] pointer-events-none"
    aria-hidden="true"
    style={{ opacity: 0.45 }}
  >
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50 }}
      dpr={[1, 1]}
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
    >
      <Scene />
    </Canvas>
  </div>
);

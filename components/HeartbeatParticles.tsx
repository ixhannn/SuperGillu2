/**
 * HeartbeatParticles — "Molten Rose" GPU particle heart (three.js / R3F).
 *
 * Replaces the old 2-D canvas faux-3-D effect. One THREE.Points cloud, one
 * custom ShaderMaterial; ALL motion is computed in the vertex shader from a
 * handful of float uniforms — zero per-frame CPU→GPU buffer uploads.
 *
 * triggerButtonDissolve(rect, onDone) — the hero "send heartbeat" gesture:
 *   1. ARM / DROP  — the button liquefies into a warm bead of light.
 *   2. POUR        — the bead self-levels into a luminous 3-D heart (the gasp).
 *   3. BEAT        — two anatomical lub-dub pulses + a drifting rose-gold glint.
 *   4. SENT        — on the peak it releases as one soft, upward-biased
 *                    membrane-ring ("carried up to them"). onDone fires here.
 *
 * Light-background strategy (the cream app bg washes out additive blending):
 *   deep SOURCE-OVER cores carry the heart by CONTRAST; a gentle warm CSS
 *   spotlight + halo (driven off the SAME clock as the WebGL beat) give it
 *   depth; the rose-gold sheen is a clamped, scrim-bound highlight only.
 *
 * Everything is theme-token driven, so the effect re-skins across all 9
 * accent themes. prefers-reduced-motion gets a CSS-only fallback (no WebGL).
 *
 * triggerSend / triggerReceive remain on the handle (legacy/partner-pulse).
 */

import React, { useRef, useMemo, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { readThemeRgbTriplet } from '../utils/themeVars';
import { installThreeWarningFilter } from '../utils/threeConsole';
import { PerformanceManager } from '../services/performance';

installThreeWarningFilter();

// ─────────────────────────────────────────────── easing helpers ──────────────
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const eio = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Asymmetric anatomical pulse: fast systole, slow diastole. Peak ≈ 1.35. */
function beatEnv(t: number, center: number): number {
  const RISE = 70, FALL = 360, W = RISE + FALL;
  const start = center - RISE;
  if (t < start || t > center + FALL) return 0;
  const bt = (t - start) / W;
  return Math.pow(bt, 0.45) * Math.pow(1 - bt, 1.8) * 4.3;
}

// ─────────────────────────────────────────── heart point cloud (static) ──────
//
// Emoji-accurate heart: a diamond body + two tangent top lobes (the same shape
// the old effect used). We rejection-sample points inside that silhouette, give
// each a pillow Z-dome for volume, and pre-compute rim proximity (for the glint
// and the last-to-arrive stagger) + an outward normal (for the release ring).

const COUNT = 20000;            // dense enough to read as a solid, glowing heart
const S = 0.72;                 // lobe/diamond scale in normalized units
const CIRC_R2 = (S * S) / 2;    // lobe radius²
const Y_SHIFT = S * 0.89;       // centres the visual centroid near the origin
const DOME = 0.23;              // half-thickness of the Z pillow (volume)

function heartDepth(xc: number, yc: number): number {
  // Signed "inside depth" of the union of {diamond, left lobe, right lobe}.
  // > 0 inside; the deeper inside, the larger. Used for inside-test + rim.
  const y = yc + Y_SHIFT;
  const diamond = S - (Math.abs(xc) + Math.abs(y - S));
  const dxL = xc + S / 2, dyL = y - S / 2;
  const lobeL = Math.sqrt(CIRC_R2) - Math.sqrt(dxL * dxL + dyL * dyL);
  const dxR = xc - S / 2, dyR = y - S / 2;
  const lobeR = Math.sqrt(CIRC_R2) - Math.sqrt(dxR * dxR + dyR * dyR);
  return Math.max(diamond, lobeL, lobeR);
}

interface HeartCloud {
  position: Float32Array;  // aHeartTarget (vec3) — recentred + scaled to half-height 1
  seed: Float32Array;      // aSeed (vec3) — phase / size / velocity jitter
  rim: Float32Array;       // aRim (float) — 1 near the silhouette edge
  normal: Float32Array;    // aNormal (vec3) — outward direction for the release
  size: Float32Array;      // aSize (float) — base sprite size in CSS px
}

const HEART: HeartCloud = (() => {
  // Deterministic LCG so the cloud is identical every render.
  let s = 0x9e3779b9 >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);

  const xs: number[] = [], ys: number[] = [], rims: number[] = [];
  while (xs.length < COUNT) {
    const x = (rnd() * 2 - 1) * 1.15;
    const y = (rnd() * 2 - 1) * 1.15;
    const d = heartDepth(x, y);
    if (d <= 0) continue;
    xs.push(x); ys.push(y);
    // rim → 1 at the edge, → 0 deep inside (k tuned for a crisp silhouette band)
    rims.push(Math.exp(-d * 7.0));
  }

  // Recentre on the sampled centroid and scale so the half-height ≈ 1.
  let my = 0;
  for (let i = 0; i < COUNT; i++) my += ys[i];
  my /= COUNT;
  let maxAbsY = 0;
  for (let i = 0; i < COUNT; i++) maxAbsY = Math.max(maxAbsY, Math.abs(ys[i] - my));
  const scale = 1 / maxAbsY;

  const position = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 3);
  const rim = new Float32Array(COUNT);
  const normal = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    const x = xs[i] * scale;
    const y = (ys[i] - my) * scale;
    const r2 = x * x + y * y;
    const z = DOME * (rnd() * 2 - 1) * Math.sqrt(Math.max(0, 1 - r2 / 1.6));

    position[i * 3] = x;
    position[i * 3 + 1] = y;
    position[i * 3 + 2] = z;

    const nx = x, ny = y, nz = z * 1.4;
    const nl = Math.hypot(nx, ny, nz) || 1;
    normal[i * 3] = nx / nl;
    normal[i * 3 + 1] = ny / nl;
    normal[i * 3 + 2] = nz / nl;

    seed[i * 3] = rnd();
    seed[i * 3 + 1] = rnd();
    seed[i * 3 + 2] = rnd();

    rim[i] = rims[i];
    // Smaller, denser grains now there are many more — they overlap into a
    // continuous luminous surface; rim grains a touch smaller for a crisp edge.
    size[i] = (1.7 + rnd() * 1.4) * (1 - rims[i] * 0.28);
  }

  return { position, seed, rim, normal, size };
})();

// One shared geometry for the lifetime of the app (CPU buffers, cheap, static).
const heartGeometry = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(HEART.position, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(HEART.seed, 3));
  g.setAttribute('aRim', new THREE.BufferAttribute(HEART.rim, 1));
  g.setAttribute('aNormal', new THREE.BufferAttribute(HEART.normal, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(HEART.size, 1));
  return g;
})();

// ───────────────────────────────────────────────────────── shaders ───────────

const VERT = /* glsl */ `
  attribute vec3  aSeed;
  attribute float aRim;
  attribute vec3  aNormal;
  attribute float aSize;

  uniform vec2  uViewport;     // CSS px (w, h)
  uniform vec2  uOrigin;       // button / source centre, CSS px (y-down)
  uniform vec2  uOriginSpread; // half-extent of the source, CSS px
  uniform vec2  uHeartCenter;  // CSS px (y-down)
  uniform float uHeartScale;   // px per heart unit
  uniform float uDpr;
  uniform float uFov;

  uniform float uTime;     // seconds
  uniform float uForm;     // 0 bead → 1 heart   (eased)
  uniform float uSend;     // 0 → 1 release       (eased)
  uniform float uAppear;   // 0 → 1 fade-in
  uniform float uBeat;     // pulse envelope
  uniform float uSendDir;  // +1 outward (send) / -1 inward (receive)

  varying float vDepth;
  varying float vGlint;
  varying float vRim;
  varying float vFade;

  // Cheap divergence-ish swirl for the "pour" — no texture reads.
  vec2 curl2(vec2 p, float t) {
    return vec2(
      sin(p.x * 1.7 + t) * cos(p.y * 1.3 - t * 1.1),
      cos(p.x * 1.1 - t * 0.9) * sin(p.y * 1.9 + t)
    );
  }

  void main() {
    vec3 hp = position;                 // heart-local target
    float beatScale = 1.0 + uBeat * 0.05;

    // Object-space liquid ripple on the held heart skin.
    float ripple = sin(dot(hp.xy, vec2(6.0, 5.0)) - uTime * 3.0) * uBeat * 0.015;
    vec3 lp = hp * beatScale + aNormal * ripple;

    // Gentle breathing turn so it never looks frozen (stays heart-facing).
    float ay = sin(uTime * 0.5 + 0.3) * 0.22;
    float ax = sin(uTime * 0.4) * 0.10;
    float cy = cos(ay), sy = sin(ay);
    float cx = cos(ax), sx = sin(ax);
    float rx =  lp.x * cy + lp.z * sy;
    float rz = -lp.x * sy + lp.z * cy;
    float ry =  lp.y * cx - rz * sx;
    rz       =  lp.y * sx + rz * cx;

    vDepth = clamp(0.5 - rz * 1.5, 0.0, 1.0);   // 1 = facing viewer
    float persp = uFov / (uFov + rz);

    // Heart position projected to screen px. The sampled cloud already uses a
    // screen-down convention (tip at +y, lobes at −y), so map ry directly:
    // lobes land at the top, the tapered tip at the bottom.
    vec2 heartPx = uHeartCenter + vec2(rx, ry) * uHeartScale * persp;

    // Bead/source position: scattered across the source rect, breaking up over
    // a curl field that decays as the heart forms.
    vec2 beadPx = uOrigin
      + (aSeed.xy * 2.0 - 1.0) * uOriginSpread * 0.92
      + curl2(hp.xy * 2.0 + aSeed.z * 6.28, uTime * 1.2) * (1.0 - uForm) * 18.0;

    // Stagger the pour by height + seed so the silhouette crisps in last.
    float stagger = clamp((hp.y * 0.5 + 0.5) * 0.35 + aRim * 0.25, 0.0, 0.6);
    float fw = clamp((uForm - stagger) / (1.0 - stagger), 0.0, 1.0);
    fw = fw * fw * (3.0 - 2.0 * fw);

    vec2 pos = mix(beadPx, heartPx, fw);

    // Release: push outward along the projected radial + a soft upward bias.
    vec2 radial = normalize(heartPx - uHeartCenter + vec2(0.0001));
    float sEase = uSend * uSend;
    float reach = (0.4 + aSeed.z * 0.6) * uHeartScale * 0.5;   // contained — no screen-wide dust
    vec2 sendOff = uSendDir * radial * sEase * reach + vec2(0.0, -sEase * uHeartScale * 0.42);
    pos += sendOff;

    // Direct CSS-px → clip mapping (no camera dependence → robust screen sync).
    vec2 clip = vec2(pos.x / uViewport.x * 2.0 - 1.0, 1.0 - pos.y / uViewport.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);

    // Fade-in on appear, fade-out (cores first) on release.
    float fade = uAppear * (1.0 - smoothstep(0.1, 0.95, uSend));
    vFade = fade;

    // Drifting rose-gold sheen sweeping around the rim (fades with the cores).
    float ang = atan(ry, rx + 1e-4);   // +eps guards atan(0,0) at the centroid
    float band = smoothstep(0.55, 1.0, sin(ang + uTime * 1.6) * 0.5 + 0.5);
    vGlint = band * aRim * vDepth * fade;
    vRim = aRim * fade;   // steady warm rim so the whole silhouette catches light

    float sizePulse = (1.0 + uBeat * 0.12) * (1.0 + uSend * 0.25);
    gl_PointSize = aSize * uDpr * persp * sizePulse * (0.35 + 0.65 * fade) * (0.7 + 0.3 * vDepth);
    gl_PointSize = clamp(gl_PointSize, 1.0, 22.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3  uCoreDeep;    // shadow / back faces
  uniform vec3  uCoreBright;  // lit faces
  uniform vec3  uGlint;       // warm rose highlight (star-core lifted 14% toward white), rim-only + hard-clamped
  uniform float uScrim;       // 0 → 1 current spotlight depth (gates the sheen)

  varying float vDepth;
  varying float vGlint;
  varying float vRim;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;

    float body = smoothstep(1.0, 0.04, d);   // soft round sprite
    float core = pow(body, 2.2);

    float fade = vFade;
    if (fade <= 0.001) discard;

    // Molten rose-gold: deep wine in shadow → warm rose → a LUMINOUS warm
    // pearl/gold core on the faces turned toward us, so the heart glows like
    // light and pops even over a bright pink card (not rose-lost-in-pink).
    vec3 col = mix(uCoreDeep, uCoreBright, smoothstep(0.0, 1.0, vDepth));
    col = mix(col, uGlint, pow(vDepth, 2.2) * (0.5 + 0.3 * uScrim));

    // Warm rim catch + the drifting glossy sheen. Hard-clamped below.
    col += uGlint * (vRim * 0.20 + vGlint * 0.85) * core * (0.5 + 0.5 * uScrim);
    col = min(col, vec3(1.0));

    float alpha = fade * body * (0.86 + 0.14 * core);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ─────────────────────────────────────────── theme palette (per trigger) ─────
type Rgb = [number, number, number];

function readTriplet(name: string, fallback: string): Rgb {
  const [r, g, b] = readThemeRgbTriplet(name, fallback).split(',').map(Number);
  return [r | 0, g | 0, b | 0];
}
function toVec3([r, g, b]: Rgb): THREE.Vector3 {
  return new THREE.Vector3(r / 255, g / 255, b / 255);
}
function scale([r, g, b]: Rgb, k: number): Rgb {
  return [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k)];
}
function mixWhite([r, g, b]: Rgb, k: number): Rgb {
  return [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k];
}
// Theme accent lifted to a luminous warm pearl / rose-gold light — high
// luminance so the heart's core reads as *light* and pops on any backdrop.
function warmPearl(accent: Rgb): Rgb {
  const light = mixWhite(accent, 0.5);
  const warm: Rgb = [255, 226, 198];
  return [(light[0] + warm[0]) / 2, (light[1] + warm[1]) / 2, (light[2] + warm[2]) / 2];
}

interface Palette {
  coreDeep: THREE.Vector3;
  coreBright: THREE.Vector3;
  glint: THREE.Vector3;
  scrimRgb: string;   // "r,g,b" for the warm CSS spotlight
  haloRgb: string;    // "r,g,b" for the CSS halo bloom
}

function readPalette(): Palette {
  const lior600 = readTriplet('--color-lior-600', '225,29,72');
  const lior500 = readTriplet('--color-lior-500', '244,63,94');
  const starCore = readTriplet('--theme-star-core-rgb', '253,164,175');
  return {
    coreDeep: toVec3(scale(lior600, 0.78)),     // deep wine shadow for form
    coreBright: toVec3(lior500),
    glint: toVec3(warmPearl(starCore)),         // luminous warm pearl / rose-gold core
    scrimRgb: '44,32,40',                       // neutral warm dusk (dims busy UI on any theme)
    haloRgb: warmPearl(lior500).map(Math.round).join(','),
  };
}

// ─────────────────────────────────────────────────────── timeline ────────────
interface Timeline {
  formStart: number; formEnd: number;
  beat1: number; beat2: number;
  sendStart: number; sendEnd: number;
  scrimIn: number; scrimOutStart: number; scrimOutEnd: number;
  scrimMax: number;
  sendDir: number;
  doneAt: number | null;
  total: number;
}

const SEND_TL: Timeline = {
  formStart: 260, formEnd: 1180,
  beat1: 1440, beat2: 2250,
  sendStart: 2900, sendEnd: 3560,
  scrimIn: 520, scrimOutStart: 2900, scrimOutEnd: 3480,
  scrimMax: 0.66,
  sendDir: 1,
  doneAt: 2980,
  total: 3850,
};

// Partner pulse arriving — lighter, no spotlight takeover, gentle inward settle.
const RECEIVE_TL: Timeline = {
  formStart: 120, formEnd: 820,
  beat1: 1000, beat2: 1620,
  sendStart: 2000, sendEnd: 2700,
  scrimIn: 400, scrimOutStart: 1900, scrimOutEnd: 2600,
  scrimMax: 0.16,
  sendDir: -1,
  doneAt: null,
  total: 2900,
};

// ───────────────────────────────────────────────── active-effect spec ────────
interface EffectSpec {
  id: number;
  origin: [number, number];
  spread: [number, number];
  tl: Timeline;
  onDone?: () => void;
  freezeAt?: number;  // DEV-only: pin the effect to a fixed elapsed ms
}

interface HeartFieldProps {
  spec: EffectSpec;
  palette: Palette;
  scrimRef: React.RefObject<HTMLDivElement | null>;
  haloRef: React.RefObject<HTMLDivElement | null>;
  onComplete: () => void;
}

const HeartField: React.FC<HeartFieldProps> = ({ spec, palette, scrimRef, haloRef, onComplete }) => {
  const dpr = useThree((s) => s.gl.getPixelRatio());
  const setSize = useThree((s) => s.setSize);
  const startRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const doneRef = useRef(false);

  const gl = useThree((s) => s.gl);

  const fireDone = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    spec.onDone?.();
  };

  // If this effect is torn down before it reaches its peak — superseded by
  // another trigger (an inbound partner heartbeat mid-send) or Home unmounting
  // on navigation — still resolve onDone exactly once. Without this, the
  // send's network signal is lost and the button stays stuck (isDissolving).
  // Idempotent: on the normal path fireDone already ran at the peak.
  useEffect(() => () => { fireDone(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const material = useMemo(() => {
    const W = window.innerWidth, H = window.innerHeight;
    return new THREE.ShaderMaterial({
      precision: 'mediump',
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uViewport: { value: new THREE.Vector2(W, H) },
        uOrigin: { value: new THREE.Vector2(spec.origin[0], spec.origin[1]) },
        uOriginSpread: { value: new THREE.Vector2(spec.spread[0], spec.spread[1]) },
        uHeartCenter: { value: new THREE.Vector2(W / 2, H * 0.42) },
        uHeartScale: { value: Math.min(W, H) * 0.27 },
        uDpr: { value: dpr },
        uFov: { value: 3.5 },
        uTime: { value: 0 },
        uForm: { value: 0 },
        uSend: { value: 0 },
        uAppear: { value: 0 },
        uBeat: { value: 0 },
        uSendDir: { value: spec.tl.sendDir },
        uCoreDeep: { value: palette.coreDeep.clone() },
        uCoreBright: { value: palette.coreBright.clone() },
        uGlint: { value: palette.glint.clone() },
        uScrim: { value: 0 },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  useEffect(() => () => { material.dispose(); }, [material]);

  // Drive the renderer size explicitly (R3F's ResizeObserver auto-measure can
  // miss the first layout for a portaled, transient canvas) and keep the
  // screen-mapping uniforms in sync with the live viewport on rotate/resize.
  useEffect(() => {
    const apply = () => {
      const W = window.innerWidth, H = window.innerHeight;
      setSize(W, H);
      const u = material.uniforms;
      u.uViewport.value.set(W, H);
      u.uHeartCenter.value.set(W / 2, H * 0.42);
      u.uHeartScale.value = Math.min(W, H) * 0.27;
      u.uDpr.value = gl.getPixelRatio();
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [material, setSize, gl]);

  // Defensive: never lose a "sent" signal if the app is backgrounded mid-effect.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') { fireDone(); finish(); }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    fireDone();           // safety — always fire exactly once
    onComplete();
  };

  useFrame(() => {
    const now = performance.now();
    if (startRef.current === null) startRef.current = now;
    const t = spec.freezeAt != null ? spec.freezeAt : now - startRef.current;
    const tl = spec.tl;
    const u = material.uniforms;

    const form = eio(clamp01((t - tl.formStart) / (tl.formEnd - tl.formStart)));
    const send = eio(clamp01((t - tl.sendStart) / (tl.sendEnd - tl.sendStart)));
    const appear = clamp01(t / 150);
    const beat = Math.min(1.5, beatEnv(t, tl.beat1) + beatEnv(t, tl.beat2));

    let scrim = clamp01(t / tl.scrimIn);
    if (t > tl.scrimOutStart) {
      scrim *= clamp01(1 - (t - tl.scrimOutStart) / (tl.scrimOutEnd - tl.scrimOutStart));
    }
    const scrimAlpha = scrim * tl.scrimMax;

    u.uTime.value = t / 1000;
    u.uForm.value = form;
    u.uSend.value = send;
    u.uAppear.value = appear;
    u.uBeat.value = beat;
    u.uScrim.value = scrim;

    // CSS spotlight + halo share THIS clock → never desync from the beat.
    const scrimEl = scrimRef.current;
    if (scrimEl) scrimEl.style.opacity = String(scrimAlpha);
    const haloEl = haloRef.current;
    if (haloEl) {
      // Gentle breath, not a strobe — soft beat coupling so two pulses read as
      // a heartbeat behind the form, never a pink flash on the calm cream bg.
      haloEl.style.opacity = String(scrim * (0.2 + Math.min(beat, 1.0) * 0.34));
      const s = 1 + beat * 0.1 + send * 0.4;
      haloEl.style.transform = `translate(-50%, -50%) scale(${s})`;
    }

    if (spec.freezeAt == null) {
      if (tl.doneAt !== null && t >= tl.doneAt) fireDone();
      if (t >= tl.total) finish();
    }
  });

  return <points geometry={heartGeometry} material={material} frustumCulled={false} />;
};

// ─────────────────────────────────────────────────────── component ───────────

export interface HeartbeatParticlesHandle {
  triggerSend:           (cx: number, cy: number) => void;
  triggerReceive:        (cx: number, cy: number) => void;
  triggerButtonDissolve: (rect: DOMRect, onDone: () => void) => void;
}

/** Legacy haptic pattern export (kept for backward compatibility). */
export const DISSOLVE_VIBRATION: number[] = [18, 1772, 42, 238, 28, 612, 42, 238, 28];

export const HeartbeatParticles = forwardRef<HeartbeatParticlesHandle>(
  function HeartbeatParticles(_props, ref) {
    const [spec, setSpec] = useState<EffectSpec | null>(null);
    const [palette, setPalette] = useState<Palette | null>(null);
    const scrimRef = useRef<HTMLDivElement>(null);
    const haloRef = useRef<HTMLDivElement>(null);
    const idRef = useRef(0);

    const launch = (next: Omit<EffectSpec, 'id'>) => {
      setPalette(readPalette());
      setSpec({ ...next, id: ++idRef.current });
    };

    const doDissolve = (rect: DOMRect, onDone: () => void) => {
      // Reduced motion: skip WebGL entirely, still confirm the send.
      if (PerformanceManager.reducedMotion) { window.setTimeout(onDone, 600); return; }
      launch({
        origin: [rect.left + rect.width / 2, rect.top + rect.height / 2],
        spread: [rect.width / 2, rect.height / 2],
        tl: SEND_TL,
        onDone,
      });
    };
    const doSend = (cx: number, cy: number) => {
      if (PerformanceManager.reducedMotion) return;
      launch({ origin: [cx, cy], spread: [34, 34], tl: SEND_TL });
    };
    const doReceive = (cx: number, cy: number) => {
      if (PerformanceManager.reducedMotion) return;
      const R = Math.min(window.innerWidth, window.innerHeight) * 0.42;
      launch({ origin: [cx, cy], spread: [R, R], tl: RECEIVE_TL });
    };

    useImperativeHandle(ref, () => ({
      triggerButtonDissolve: doDissolve,
      triggerSend: doSend,
      triggerReceive: doReceive,
    }));

    // DEV-only trigger hook so the effect can be exercised without a linked
    // partner (e.g. in a worktree preview). Never present in production builds.
    useEffect(() => {
      if (!import.meta.env.DEV) return;
      const devRect = () => new DOMRect(window.innerWidth / 2 - 90, window.innerHeight - 150, 180, 64);
      (window as unknown as Record<string, unknown>).__heartbeatFx = {
        dissolve: () => doDissolve(devRect(), () => {}),
        receive: () => doReceive(window.innerWidth / 2, window.innerHeight * 0.42),
        freeze: (t: number) => {
          const r = devRect();
          launch({
            origin: [r.left + r.width / 2, r.top + r.height / 2],
            spread: [r.width / 2, r.height / 2],
            tl: SEND_TL,
            freezeAt: t,
          });
        },
        clear: () => setSpec(null),
      };
      return () => { delete (window as unknown as Record<string, unknown>).__heartbeatFx; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const heartCenterTop = '42%';

    return createPortal(
      <div
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
      >
        {spec && palette && (
          <>
            {/* Warm spotlight — a vignette that focuses, never a black modal. */}
            <div
              ref={scrimRef}
              style={{
                position: 'absolute', inset: 0, opacity: 0,
                background: `radial-gradient(125% 100% at 50% ${heartCenterTop}, rgba(${palette.scrimRgb},0.82) 0%, rgba(${palette.scrimRgb},0.6) 44%, rgba(${palette.scrimRgb},0.44) 100%)`,
                willChange: 'opacity',
              }}
            />
            {/* Soft bloom behind the heart, pulsing on each beat (no GPU pass). */}
            <div
              ref={haloRef}
              style={{
                position: 'absolute', left: '50%', top: heartCenterTop,
                width: '58vmin', height: '58vmin', opacity: 0,
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(circle, rgba(${palette.haloRgb},0.55) 0%, rgba(${palette.haloRgb},0.2) 38%, rgba(${palette.haloRgb},0) 70%)`,
                filter: 'blur(10px)', willChange: 'opacity, transform',
              }}
            />
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh' }}>
              <Canvas
                key={spec.id}
                frameloop="always"
                flat
                /* Cap DPR at 1.5 (was 2): this is a THIRD WebGL context spun up
                   transiently on every Pulse send/receive. On a high-DPR phone a
                   full-screen 2x buffer allocated at that moment is a sharp
                   transient spike that can tip an already-loaded compositor into
                   eviction; 1.5 stays above the soft-particle visual floor. */
                dpr={[1, 1.5]}
                gl={{ alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: import.meta.env.DEV }}
              >
                <HeartField
                  spec={spec}
                  palette={palette}
                  scrimRef={scrimRef}
                  haloRef={haloRef}
                  onComplete={() => setSpec(null)}
                />
              </Canvas>
            </div>
          </>
        )}
      </div>,
      document.body,
    );
  },
);

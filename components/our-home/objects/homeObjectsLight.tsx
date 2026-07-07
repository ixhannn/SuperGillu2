/**
 * OUR HOME — light objects: the two floor lamps and the chamberstick candle,
 * redrawn for the 2:1 isometric corner room.
 *
 * Volumes come from homeIso (isoCylinder + shade with the shared room light:
 * top faces brightest, right dim, left darkest). Local coordinates: (0,0) is
 * the centre of the footprint ON the floor plane, negative y is up. No
 * filters, no blend modes — `oh-flame` is a hook for the app's CSS. Gradients
 * are limited to the warm glows inside a lit shade / flame plus subtle
 * face-light ramps derived from the same base colours, all with stable ids.
 */
import type React from 'react';
import {
  BRASS,
  CANDLE_GOLD,
  CREAM_WALL,
  CREAM_WALL_SHADE,
  EMBER,
  INK,
  INK_SOFT,
  LAMP_GOLD,
  LINEN,
  LINEN_SHADE,
  ROSE,
  SW,
  SW_FINE,
  SW_HAIR,
  softEllipse,
  WALNUT,
} from '../homeArt';
import { FACE_LEFT, FACE_RIGHT, FACE_TOP, isoCylinder, shade } from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/* ── Iso helpers (local to the light objects) ────────────────── */

/** Front edge of an iso ellipse of radius `r` at offset x (y below centre). */
const frontEdge = (x: number, r: number): number =>
  (r / 2) * Math.sqrt(Math.max(0, 1 - (x / r) ** 2));

/** The left (darkest) half of an isoCylinder's side. */
const cylLeftHalf = (r: number, h: number): string =>
  `M ${-r} 0 L ${-r} ${-h} A ${r} ${r / 2} 0 0 0 0 ${-h + r / 2} L 0 ${r / 2} A ${r} ${r / 2} 0 0 0 ${-r} 0 Z`;

interface CylProps {
  r: number;
  h: number;
  base: string;
  /** Screen px this cylinder floats above the resting plane. */
  lift?: number;
  sw?: number;
}

/** A shaded iso cylinder: right-lit side, dark left half, bright top disc. */
const Cyl = ({ r, h, base, lift = 0, sw = SW }: CylProps): React.JSX.Element => {
  const c = isoCylinder(r, h);
  return (
    <g transform={lift !== 0 ? `translate(0 ${-lift})` : undefined}>
      <path d={c.side} fill={shade(base, FACE_RIGHT)} stroke="none" />
      <path d={cylLeftHalf(r, h)} fill={shade(base, FACE_LEFT)} stroke="none" />
      <path d={c.side} fill="none" stroke={INK} strokeWidth={sw} />
      <ellipse
        cx={c.topCx}
        cy={c.topCy}
        rx={c.rx}
        ry={c.ry}
        fill={shade(base, FACE_TOP)}
        stroke={INK}
        strokeWidth={sw}
      />
    </g>
  );
};

/* ── Shared lamp-glow vocabulary ─────────────────────────────── */

/** Glow strength per vState — 'out' (or unknown) draws no glow at all. */
const glowLevel = (vState?: string): number => {
  if (vState === 'lit') return 1;
  if (vState === 'warm') return 0.55;
  if (vState === 'ember') return 0.25;
  return 0;
};

/** 'ember' cools the gold toward rose-amber; everything else stays gold. */
const glowFill = (idBase: string, vState?: string): string =>
  (vState === 'ember' ? `url(#${idBase}-ember)` : `url(#${idBase}-glow)`);

interface LampGlowDefsProps {
  /** Stable per-component id base, e.g. "oh-lampA-iso" — never random. */
  idBase: string;
}

/** One warm gradient plus its rose-amber ember sibling. */
const LampGlowDefs = ({ idBase }: LampGlowDefsProps): React.JSX.Element => (
  <defs>
    <radialGradient id={`${idBase}-glow`} cx="0.5" cy="0.55" r="0.62">
      <stop offset="0%" stopColor={LAMP_GOLD} stopOpacity={0.95} />
      <stop offset="55%" stopColor={LAMP_GOLD} stopOpacity={0.5} />
      <stop offset="100%" stopColor={LAMP_GOLD} stopOpacity={0} />
    </radialGradient>
    <radialGradient id={`${idBase}-ember`} cx="0.5" cy="0.55" r="0.62">
      <stop offset="0%" stopColor={EMBER} stopOpacity={0.85} />
      <stop offset="60%" stopColor={ROSE} stopOpacity={0.4} />
      <stop offset="100%" stopColor={ROSE} stopOpacity={0} />
    </radialGradient>
  </defs>
);

/* ── LampYoursArt — 1×1 tile · ~78px tall ────────────────────── */

const YOURS_SHADE_R = 15;
const YOURS_SHADE_H = 21;
const YOURS_SHADE_LIFT = 55;
const YOURS_SHADE_CYL = isoCylinder(YOURS_SHADE_R, YOURS_SHADE_H);

/** Seven pleat hairlines dropping down the linen shade (local to the lift). */
const YOURS_PLEATS: readonly string[] = [-12, -8, -4, 0, 4, 8, 12].map((x) => {
  const f = frontEdge(x, YOURS_SHADE_R);
  return `M ${x} ${(-YOURS_SHADE_H + f + 0.7).toFixed(1)} L ${x} ${(f - 0.7).toFixed(1)}`;
});

/**
 * Your lamp: brass stem on a round brass base, pleated linen empire shade —
 * a truncated cone suggested by the inner top ellipse.
 * vState: 'lit' | 'warm' | 'ember' | 'out' — only the glow layer changes.
 */
export const LampYoursArt = ({ vState }: ObjectArtProps): React.JSX.Element => {
  const glow = glowLevel(vState);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <LampGlowDefs idBase="oh-lampA-iso" />
      <defs>
        <linearGradient id="oh-lampA-g0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(LINEN, 0.25)} stopOpacity={0.55} />
          <stop offset="1" stopColor={shade(LINEN, 0.25)} stopOpacity={0} />
        </linearGradient>
        {/* linen side settles darker toward the floor; crown lifts toward the light */}
        <linearGradient id="oh-lampA-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(LINEN, 0.06)} />
          <stop offset="0.55" stopColor={LINEN} />
          <stop offset="1" stopColor={shade(LINEN, -0.08)} />
        </linearGradient>
        <linearGradient id="oh-lampA-top" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={shade(LINEN, FACE_TOP - 0.05)} />
          <stop offset="1" stopColor={shade(LINEN, FACE_TOP + 0.07)} />
        </linearGradient>
      </defs>
      {/* contact shadow grounding the lamp on the boards */}
      <ellipse cx={0} cy={1.5} rx={10.5} ry={3.4} fill="#3a2518" opacity={0.13} />
      {/* round brass base */}
      <Cyl r={9} h={4} base={BRASS} />
      {/* one crisp specular on the brass base + a hot glint on the lit shoulder */}
      <path d="M 4.2 -3.4 L 4.2 -1" fill="none" stroke={shade(BRASS, 0.5)} strokeWidth={1} opacity={0.9} />
      <circle cx={5} cy={-4.8} r={0.9} fill="#fff3dc" opacity={0.55} />
      {/* rim light along the base's lit top edge */}
      <path d="M 0 -8.5 A 9 4.5 0 0 1 9 -4" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
      {/* slender brass pole */}
      <path
        d="M -1.4 -56 L 1.4 -56 L 1.4 -4.2 L -1.4 -4.2 Z"
        fill={BRASS}
        stroke={INK}
        strokeWidth={SW_FINE}
      />
      {/* specular hairline riding the pole's lit edge */}
      <path d="M 0.55 -54 L 0.55 -6" fill="none" stroke={shade(BRASS, 0.45)} strokeWidth={0.7} opacity={0.85} />
      {/* the shade's own shadow falling down the pole */}
      <path d="M -1.4 -47.4 L 1.4 -47.4 L 1.4 -41 L -1.4 -41 Z" fill="#3a2518" opacity={0.13} stroke="none" />
      {/* neck collar under the shade */}
      <path
        d="M -2.6 -55 L 2.6 -55 L 2.1 -57 L -2.1 -57 Z"
        fill={BRASS}
        stroke={INK}
        strokeWidth={SW_FINE}
      />
      {/* pleated linen empire shade */}
      <g transform={`translate(0 ${-YOURS_SHADE_LIFT})`}>
        <path d={YOURS_SHADE_CYL.side} fill="url(#oh-lampA-side)" stroke="none" />
        <path
          d={cylLeftHalf(YOURS_SHADE_R, YOURS_SHADE_H)}
          fill={shade(LINEN, FACE_LEFT)}
          stroke="none"
        />
        {/* fabric roundness — a soft top-lit falloff over the linen */}
        <path d={YOURS_SHADE_CYL.side} fill="url(#oh-lampA-g0)" stroke="none" />
        {/* a plumper sheen where the light grazes the pleats */}
        <path d={softEllipse(8.5, -10.5, 2.6, 6.2, 4)} fill={shade(LINEN, 0.14)} opacity={0.25} stroke="none" />
        {/* warm glass-glow inside the shade */}
        {glow > 0 && (
          <g className="oh-flame" opacity={glow}>
            <ellipse
              cx={0}
              cy={-9.5}
              rx={11.5}
              ry={8}
              fill={glowFill('oh-lampA-iso', vState)}
              stroke="none"
            />
          </g>
        )}
        {/* pleats stay readable over the glow */}
        <g fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR}>
          {YOURS_PLEATS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <path d={YOURS_SHADE_CYL.side} fill="none" stroke={INK} strokeWidth={SW} />
        {/* occlusion tucked inside the bottom rim */}
        <path
          d={`M ${-YOURS_SHADE_R} -1.6 A ${YOURS_SHADE_R} ${YOURS_SHADE_R / 2} 0 0 0 ${YOURS_SHADE_R} -1.6`}
          fill="none"
          stroke={INK}
          strokeWidth={2.2}
          opacity={0.08}
        />
        {/* hem seam along the bottom rim */}
        <path
          d={`M ${-YOURS_SHADE_R} 0 A ${YOURS_SHADE_R} ${YOURS_SHADE_R / 2} 0 0 0 ${YOURS_SHADE_R} 0`}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
        />
        {/* shade top */}
        <ellipse
          cx={0}
          cy={-YOURS_SHADE_H}
          rx={YOURS_SHADE_R}
          ry={YOURS_SHADE_R / 2}
          fill="url(#oh-lampA-top)"
          stroke={INK}
          strokeWidth={SW}
        />
        {/* rim light where the crown faces the window light */}
        <path d="M 0 -28.5 A 15 7.5 0 0 1 15 -21" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
        {/* inner ellipse — the empire taper toward the crown */}
        <ellipse
          cx={0}
          cy={-YOURS_SHADE_H}
          rx={8}
          ry={4}
          fill={LINEN_SHADE}
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
        />
        {/* finial */}
        <circle cx={0} cy={-YOURS_SHADE_H - 2.2} r={1.7} fill={BRASS} stroke={INK} strokeWidth={SW_FINE} />
        <circle cx={0.5} cy={-YOURS_SHADE_H - 2.7} r={0.55} fill="#fff3dc" opacity={0.6} />
      </g>
    </g>
  );
};

/* ── LampTheirsArt — 1×1 tile · ~76px tall ───────────────────── */

const THEIRS_DRUM_R = 13;
const THEIRS_DRUM_H = 20;
const THEIRS_DRUM_LIFT = 54;
const THEIRS_DRUM_CYL = isoCylinder(THEIRS_DRUM_R, THEIRS_DRUM_H);

/** Scalloped linen hem swinging under the drum's front rim (local paths). */
const THEIRS_SCALLOPS = ((): { fillD: string; strokeD: string } => {
  const n = 6;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const x = -12.4 + (24.8 / n) * i;
    return { x, y: frontEdge(x, THEIRS_DRUM_R) };
  });
  const first = pts[0];
  let run = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let i = 1; i <= n; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    run += ` Q ${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2 + 2.6).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  const last = pts[n];
  return {
    strokeD: run,
    fillD: `${run} A ${THEIRS_DRUM_R} ${THEIRS_DRUM_R / 2} 0 0 0 ${first.x.toFixed(1)} ${first.y.toFixed(1)} Z`,
  };
})();

/**
 * Their lamp: same footprint, its own soul — a turned walnut pole with a
 * bead, and a drum shade finished with a scalloped hem.
 * vState: 'lit' | 'warm' | 'ember' | 'out' — only the glow layer changes.
 */
export const LampTheirsArt = ({ vState }: ObjectArtProps): React.JSX.Element => {
  const glow = glowLevel(vState);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <LampGlowDefs idBase="oh-lampB-iso" />
      <defs>
        <linearGradient id="oh-lampB-g0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(LINEN, 0.25)} stopOpacity={0.55} />
          <stop offset="1" stopColor={shade(LINEN, 0.25)} stopOpacity={0} />
        </linearGradient>
        {/* drum side settles darker toward the floor; top lifts toward the light */}
        <linearGradient id="oh-lampB-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(LINEN, 0.06)} />
          <stop offset="0.55" stopColor={LINEN} />
          <stop offset="1" stopColor={shade(LINEN, -0.08)} />
        </linearGradient>
        <linearGradient id="oh-lampB-top" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={shade(LINEN, FACE_TOP - 0.05)} />
          <stop offset="1" stopColor={shade(LINEN, FACE_TOP + 0.07)} />
        </linearGradient>
      </defs>
      {/* contact shadow grounding the lamp on the boards */}
      <ellipse cx={0} cy={1.5} rx={10.5} ry={3.4} fill="#3a2518" opacity={0.13} />
      {/* round brass base */}
      <Cyl r={9} h={4} base={BRASS} />
      {/* one crisp specular on the brass base + a hot glint on the lit shoulder */}
      <path d="M 4.2 -3.4 L 4.2 -1" fill="none" stroke={shade(BRASS, 0.5)} strokeWidth={1} opacity={0.9} />
      <circle cx={5} cy={-4.8} r={0.9} fill="#fff3dc" opacity={0.55} />
      {/* rim light along the base's lit top edge */}
      <path d="M 0 -8.5 A 9 4.5 0 0 1 9 -4" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
      {/* walnut pole */}
      <path
        d="M -1.4 -55 L 1.4 -55 L 1.4 -4.2 L -1.4 -4.2 Z"
        fill={WALNUT}
        stroke={INK}
        strokeWidth={SW_FINE}
      />
      {/* varnish highlight down the pole's lit edge */}
      <path d="M 0.55 -53 L 0.55 -6" fill="none" stroke={shade(WALNUT, 0.3)} strokeWidth={0.7} opacity={0.85} />
      {/* one grain hairline down the shaded flank */}
      <path d="M -0.5 -51 L -0.5 -7" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
      {/* the drum's own shadow falling down the pole */}
      <path d="M -1.4 -44.6 L 1.4 -44.6 L 1.4 -38.5 L -1.4 -38.5 Z" fill="#3a2518" opacity={0.13} stroke="none" />
      {/* turned walnut bead + ring — the accent that makes it theirs */}
      <ellipse cx={0} cy={-30} rx={3} ry={3.3} fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
      <path
        d="M -2.2 -25 L 2.2 -25 L 2 -23.8 L -2 -23.8 Z"
        fill={WALNUT}
        stroke={INK}
        strokeWidth={SW_HAIR}
      />
      {/* the bead's soft shadow resting on the ring below */}
      <ellipse cx={0} cy={-25.3} rx={1.9} ry={0.7} fill="#3a2518" opacity={0.12} />
      {/* drum shade with the scalloped hem */}
      <g transform={`translate(0 ${-THEIRS_DRUM_LIFT})`}>
        <path d={THEIRS_DRUM_CYL.side} fill="url(#oh-lampB-side)" stroke="none" />
        <path
          d={cylLeftHalf(THEIRS_DRUM_R, THEIRS_DRUM_H)}
          fill={shade(LINEN, FACE_LEFT)}
          stroke="none"
        />
        {/* fabric roundness — a soft top-lit falloff over the drum */}
        <path d={THEIRS_DRUM_CYL.side} fill="url(#oh-lampB-g0)" stroke="none" />
        {/* a plumper sheen where the light grazes the linen */}
        <path d={softEllipse(7.5, -10, 2.4, 5.8, 9)} fill={shade(LINEN, 0.14)} opacity={0.25} stroke="none" />
        {/* warm glass-glow inside the drum */}
        {glow > 0 && (
          <g className="oh-flame" opacity={glow}>
            <ellipse
              cx={0}
              cy={-9.5}
              rx={10}
              ry={7.5}
              fill={glowFill('oh-lampB-iso', vState)}
              stroke="none"
            />
          </g>
        )}
        <path d={THEIRS_DRUM_CYL.side} fill="none" stroke={INK} strokeWidth={SW} />
        {/* occlusion tucked inside the bottom rim */}
        <path
          d={`M ${-THEIRS_DRUM_R} -1.6 A ${THEIRS_DRUM_R} ${THEIRS_DRUM_R / 2} 0 0 0 ${THEIRS_DRUM_R} -1.6`}
          fill="none"
          stroke={INK}
          strokeWidth={2.2}
          opacity={0.08}
        />
        {/* scalloped hem swinging below the front rim */}
        <path d={THEIRS_SCALLOPS.fillD} fill={LINEN} stroke="none" />
        <path d={THEIRS_SCALLOPS.strokeD} fill="none" stroke={INK} strokeWidth={SW_FINE} />
        {/* drum top */}
        <ellipse
          cx={0}
          cy={-THEIRS_DRUM_H}
          rx={THEIRS_DRUM_R}
          ry={THEIRS_DRUM_R / 2}
          fill="url(#oh-lampB-top)"
          stroke={INK}
          strokeWidth={SW}
        />
        {/* rim light where the drum top faces the window light */}
        <path d="M 0 -26.5 A 13 6.5 0 0 1 13 -20" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
        {/* inner ring where the harp meets the linen */}
        <ellipse
          cx={0}
          cy={-THEIRS_DRUM_H}
          rx={7}
          ry={3.5}
          fill={LINEN_SHADE}
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
        />
        {/* finial */}
        <circle cx={0} cy={-THEIRS_DRUM_H - 2.1} r={1.6} fill={BRASS} stroke={INK} strokeWidth={SW_FINE} />
        <circle cx={0.5} cy={-THEIRS_DRUM_H - 2.6} r={0.5} fill="#fff3dc" opacity={0.6} />
      </g>
    </g>
  );
};

/* ── CandleArt — tiny surface item · ~16px ───────────────────── */

const CANDLE_STUB_CYL = isoCylinder(3, 9);

/**
 * A squat brass chamberstick (iso dish) with a ring handle and a dripping
 * cream stub. vState: 'lit' | 'out' — lit adds the teardrop flame + glow.
 */
export const CandleArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const lit = vState === 'lit';
  return (
    <g
      transform={facing === 1 ? 'scale(-1 1)' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <radialGradient id="oh-candle-iso-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={CANDLE_GOLD} stopOpacity={0.8} />
          <stop offset="60%" stopColor={CANDLE_GOLD} stopOpacity={0.3} />
          <stop offset="100%" stopColor={CANDLE_GOLD} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="oh-candle-g0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0.5} />
          <stop offset="1" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* contact shadow under the dish */}
      <ellipse cx={0} cy={1} rx={7} ry={2.2} fill="#3a2518" opacity={0.1} />
      {/* brass dish */}
      <Cyl r={7} h={3} base={BRASS} sw={SW_FINE} />
      {/* one crisp specular on the dish + a hot glint on the lit shoulder */}
      <path d="M 3.2 -2.5 L 3.2 -0.7" fill="none" stroke={shade(BRASS, 0.5)} strokeWidth={0.9} opacity={0.9} />
      <circle cx={4} cy={-3.9} r={0.7} fill="#fff3dc" opacity={0.6} />
      {/* rim light along the dish's lit top edge */}
      <path d="M 0 -6.5 A 7 3.5 0 0 1 7 -3" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
      {/* dish inner rim + the stub's shadow pooled inside it */}
      <ellipse cx={0} cy={-3} rx={5} ry={2.5} fill="#3a2518" opacity={0.12} stroke="none" />
      <ellipse cx={0} cy={-3} rx={5} ry={2.5} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {/* ring handle, with a glint on its lit shoulder */}
      <circle cx={8.8} cy={-2.6} r={2} fill="none" stroke={INK} strokeWidth={SW_FINE} />
      <circle cx={10.2} cy={-4} r={0.45} fill="#fff3dc" opacity={0.6} />
      {/* cream stub, waxy roundness from a soft vertical falloff */}
      <Cyl r={3} h={9} base={CREAM_WALL} lift={3} sw={SW_FINE} />
      <g transform="translate(0 -3)">
        <path d={CANDLE_STUB_CYL.side} fill="url(#oh-candle-g0)" stroke="none" />
      </g>
      {/* waxy vertical highlight on the lit flank + darker foot ring */}
      <path d="M 1.6 -11 L 1.6 -4.6" fill="none" stroke={CREAM_WALL} strokeWidth={1.1} opacity={0.3} />
      <path d="M -3 -3 A 3 1.5 0 0 0 3 -3" fill="none" stroke={shade(CREAM_WALL, -0.2)} strokeWidth={0.8} opacity={0.5} />
      {/* wax drips down the stub */}
      <path
        d="M 2.7 -11.4 C 3.6 -10 3.7 -8.6 2.9 -8 C 2.6 -9.2 2.6 -10.3 2.7 -11.4 Z"
        fill={CREAM_WALL_SHADE}
        stroke="none"
      />
      <path
        d="M -1.7 -11.7 C -1.2 -10.4 -1.2 -9.2 -2 -8.7 C -2.5 -9.7 -2.4 -10.8 -1.7 -11.7 Z"
        fill={CREAM_WALL_SHADE}
        stroke="none"
      />
      {/* wick */}
      <path d="M 0 -12.2 Q 0.5 -13.2 0.3 -14 " fill="none" stroke={INK} strokeWidth={SW_FINE} />
      {/* teardrop flame — static art, CSS breathes it */}
      {lit && (
        <g className="oh-flame">
          <circle cx={0} cy={-16.8} r={5.2} fill="url(#oh-candle-iso-glow)" />
          <path
            d="M 0 -20.8 C 1.9 -18.6 2.1 -16.4 0 -14.4 C -2.1 -16.4 -1.9 -18.6 0 -20.8 Z"
            fill={CANDLE_GOLD}
            stroke={EMBER}
            strokeWidth={SW_FINE}
          />
          {/* hot core at the flame's heart */}
          <path
            d="M 0 -18.9 C 0.9 -17.7 1 -16.3 0 -15.2 C -1 -16.3 -0.9 -17.7 0 -18.9 Z"
            fill="#fff3dc"
            opacity={0.75}
            stroke="none"
          />
        </g>
      )}
    </g>
  );
};

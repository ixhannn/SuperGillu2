/**
 * OUR HOME — green & glow: the lamp family (arc, tripod, table, lantern,
 * string lights) and the plant family (monstera, fiddle leaf, parlor palm,
 * hanging pothos) plus the aquarium, drawn for the 2:1 isometric corner room.
 *
 * Volumes come from homeIso (isoCylinder / isoBoxFaces + shade with the shared
 * room light: top faces brightest, right dim, left darkest). Local coords:
 * (0,0) is the centre of the footprint ON the floor plane, negative y is up.
 * Wall pieces (string lights, hanging plant) are drawn flat around their hang
 * point and wrapped in WALL_SKEW_L / WALL_SKEW_R by facing. No filters, no
 * blend modes, no animation — `oh-flame` / `oh-steam` are hooks for the app's
 * CSS. Gradients are stable-id only ("oh-<sku>-g<i>", never random).
 *
 * Premium finish pass: soft face gradients (always shade() siblings of the
 * base hue), '#fff6e6' rim lights toward the upper-right window, crisp
 * '#fff3dc' metal speculars, and one shadow pigment ('#3a2518') for every
 * contact-AO and self-shadow — still zero filters, zero blends.
 */
import type React from 'react';
import {
  BRASS,
  BRASS_BRIGHT,
  CANDLE_GOLD,
  CREAM_WALL,
  EMBER,
  INK,
  INK_SOFT,
  KRAFT,
  KRAFT_SHADE,
  LAMP_GOLD,
  LINEN,
  LINEN_SHADE,
  OAK,
  OAK_DEEP,
  ROSE,
  SAGE,
  SAGE_DEEP,
  SW,
  SW_FINE,
  SW_HAIR,
  TERRACOTTA,
  TERRACOTTA_DEEP,
  WALNUT,
  WALNUT_DEEP,
  wobblyLine,
} from '../homeArt';
import {
  FACE_LEFT,
  FACE_RIGHT,
  FACE_TOP,
  WALL_SKEW_L,
  WALL_SKEW_R,
  isoBoxFaces,
  isoCylinder,
  isoDiamond,
  shade,
} from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/* ── Premium finish language ─────────────────────────────────── */

/** The app's one shadow pigment — every soft AO / self-shadow uses it. */
const SHADOW = '#3a2518';
/** Near-white rim light for edges facing the upper-right window. */
const EDGE_LIGHT = '#fff6e6';
/** Crisp warm specular for brass shoulders and glass beads. */
const SPECULAR = '#fff3dc';

/** Lit-rim arc along a top disc's upper-right edge (toward the light). */
const rimLightArc = (r: number, ry: number, cy: number): string => {
  const p = (a: number) =>
    `${(r * Math.cos(a)).toFixed(1)} ${(cy + ry * Math.sin(a)).toFixed(1)}`;
  return `M ${p(-1.35)} A ${r.toFixed(1)} ${ry.toFixed(1)} 0 0 1 ${p(-0.2)}`;
};

/* ── Iso helpers (local to this family) ──────────────────────── */

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
  /** Draw a near-white rim light along the top disc's lit edge. */
  rim?: boolean;
}

/** A shaded iso cylinder: right-lit side, dark left half, bright top disc. */
const Cyl = ({ r, h, base, lift = 0, sw = SW, rim = false }: CylProps): React.JSX.Element => {
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
      {rim && (
        <path
          d={rimLightArc(c.rx * 0.86, c.ry * 0.86, c.topCy)}
          fill="none"
          stroke={EDGE_LIGHT}
          strokeWidth={1}
          opacity={0.45}
        />
      )}
    </g>
  );
};

/** Soft painted contact-AO where a footprint meets the floor. */
const ContactAO = ({ rx, opacity = 0.13 }: { rx: number; opacity?: number }): React.JSX.Element => (
  <ellipse cx={0} cy={1.5} rx={rx} ry={rx * 0.32} fill={SHADOW} opacity={opacity} stroke="none" />
);

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
  (vState === 'ember' ? `url(#${idBase}-g2)` : `url(#${idBase}-g1)`);

/** One warm gradient plus its rose-amber ember sibling (stable ids). */
const WarmGlowDefs = ({ idBase }: { idBase: string }): React.JSX.Element => (
  <defs>
    <radialGradient id={`${idBase}-g1`} cx="0.5" cy="0.55" r="0.62">
      <stop offset="0%" stopColor={LAMP_GOLD} stopOpacity={0.95} />
      <stop offset="55%" stopColor={LAMP_GOLD} stopOpacity={0.5} />
      <stop offset="100%" stopColor={LAMP_GOLD} stopOpacity={0} />
    </radialGradient>
    <radialGradient id={`${idBase}-g2`} cx="0.5" cy="0.55" r="0.62">
      <stop offset="0%" stopColor={EMBER} stopOpacity={0.85} />
      <stop offset="60%" stopColor={ROSE} stopOpacity={0.4} />
      <stop offset="100%" stopColor={ROSE} stopOpacity={0} />
    </radialGradient>
  </defs>
);

/* ── Shared clay pot (monstera · fiddle · hanging pothos) ────── */

interface PotProps {
  rimR: number;
  h: number;
  base: string;
  gradId: string;
  /** Hanging pots cast no floor AO. */
  floating?: boolean;
}

const Pot = ({ rimR, h, base, gradId, floating = false }: PotProps): React.JSX.Element => {
  const bR = rimR * 0.74;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={shade(base, FACE_LEFT)} />
          <stop offset="100%" stopColor={shade(base, 0.12)} />
        </linearGradient>
      </defs>
      {!floating && <ContactAO rx={bR + 2.5} />}
      {/* tapered clay body */}
      <path
        d={`M ${-rimR + 0.8} ${-h + 3} L ${-bR} -1 A ${bR} ${bR / 2} 0 0 0 ${bR} -1 L ${rimR - 0.8} ${-h + 3} Z`}
        fill={`url(#${gradId})`}
        stroke={INK}
        strokeWidth={SW}
      />
      {/* edge-light down the sunny side */}
      <path
        d={`M ${rimR - 2.4} ${-h + 4.5} L ${bR - 1.4} -2`}
        fill="none"
        stroke={shade(base, 0.35)}
        strokeWidth={1}
        opacity={0.8}
      />
      {/* rim's soft throw onto the clay body */}
      <path
        d={`M ${-rimR + 1.6} ${-h + 4.6} A ${rimR - 1.6} ${(rimR - 1.6) / 2} 0 0 0 ${rimR - 1.6} ${-h + 4.6}`}
        fill="none"
        stroke={SHADOW}
        strokeWidth={1.8}
        opacity={0.13}
      />
      {/* rim band, edge-lit toward the window */}
      <Cyl r={rimR} h={3.4} base={base} lift={h - 3.4} rim />
      {/* AO pooling inside the rim, then the soil */}
      <ellipse cx={0} cy={-h} rx={rimR - 1.6} ry={(rimR - 1.6) / 2} fill={INK} opacity={0.22} stroke="none" />
      <ellipse cx={0} cy={-h + 0.6} rx={rimR - 3.2} ry={(rimR - 3.2) / 2} fill={WALNUT_DEEP} stroke="none" />
    </g>
  );
};

/* ── ArcLampArt — 1×1 tile · ~84px tall ──────────────────────── */

/** Brass arc rising off the walnut weight and sweeping toward the viewer. */
const ARC_STEM =
  'M 0 -6 C -2 -42 3 -76 20 -80 C 31 -82.5 37 -75 36 -66 C 35.4 -62.5 34 -60.5 32.5 -59';

/**
 * Arc floor lamp: round walnut-weighted base, tall brass arc, dome shade
 * hanging at the sweep's end. vState: 'lit' | 'warm' | 'ember' | 'out'.
 */
export const ArcLampArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const glow = glowLevel(vState);
  return (
    <g
      transform={facing === 1 ? 'scale(-1 1)' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <WarmGlowDefs idBase="oh-arclamp" />
      <defs>
        <linearGradient id="oh-arclamp-g3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRASS_BRIGHT} />
          <stop offset="55%" stopColor={BRASS} />
          <stop offset="100%" stopColor={shade(BRASS, -0.3)} />
        </linearGradient>
      </defs>
      <ContactAO rx={12} />
      {/* the hanging dome's soft throw onto the floor */}
      <ellipse cx={31.5} cy={1.5} rx={9} ry={3} fill={SHADOW} opacity={0.08} stroke="none" />
      {/* walnut counterweight base, edge-lit */}
      <Cyl r={10} h={5} base={WALNUT} rim />
      {/* grain whispering across the walnut top */}
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3}>
        <path d={wobblyLine(-6.5, -6.2, 6.5, -6.2, 5, 0.4)} />
        <path d={wobblyLine(-5, -3.8, 5, -3.8, 9, 0.4)} />
      </g>
      {/* brass collar where the arc plants itself */}
      <ellipse cx={0} cy={-5.6} rx={3.4} ry={1.7} fill={BRASS} stroke={INK} strokeWidth={SW_FINE} />
      {/* the arc: ink body, brass core, specular thread */}
      <path d={ARC_STEM} fill="none" stroke={INK} strokeWidth={4.6} />
      <path d={ARC_STEM} fill="none" stroke={BRASS} strokeWidth={2.9} />
      <path d={ARC_STEM} fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.9} opacity={0.85} />
      {/* dome shade hanging from the arc's end */}
      <g transform="translate(31.5 -46)">
        {/* warm spill under the mouth */}
        {glow > 0 && (
          <g className="oh-flame" opacity={glow}>
            <ellipse cx={0} cy={7} rx={14} ry={8.5} fill={glowFill('oh-arclamp', vState)} stroke="none" />
          </g>
        )}
        {/* dome silhouette */}
        <path
          d="M -12 0 A 12 12 0 0 1 12 0 A 12 6 0 0 1 -12 0 Z"
          fill="url(#oh-arclamp-g3)"
          stroke={INK}
          strokeWidth={SW}
        />
        {/* mouth — glows when lit, falls to dark brass when out */}
        <ellipse
          cx={0}
          cy={1.2}
          rx={9.6}
          ry={4.6}
          fill={glow > 0 ? glowFill('oh-arclamp', vState) : shade(BRASS, -0.55)}
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
        />
        {/* specular arc along the sunny shoulder + one crisp glint */}
        <path d="M 2 -11.2 A 11 11 0 0 1 9.6 -6" fill="none" stroke={BRASS_BRIGHT} strokeWidth={1} opacity={0.9} />
        <circle cx={7.6} cy={-7.4} r={1} fill={SPECULAR} opacity={0.55} stroke="none" />
        {/* stem nub joining dome to arc */}
        <path d="M -1.4 -12 L 1.4 -12 L 1 -13.6 L -1 -13.6 Z" fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      </g>
    </g>
  );
};

/* ── TripodLampArt — 1×1 tile · ~70px tall ───────────────────── */

const TRIPOD_DRUM_R = 14;
const TRIPOD_DRUM_H = 17;
const TRIPOD_DRUM_LIFT = 46;
const TRIPOD_DRUM_CYL = isoCylinder(TRIPOD_DRUM_R, TRIPOD_DRUM_H);

/** Three walnut legs: apex to iso-spread feet (left · right · front). */
const TRIPOD_LEGS: readonly string[] = [
  'M 0 -42 C -5 -30 -9.5 -16 -13 -3',
  'M 0 -42 C 5 -30 9.5 -16 13 -3',
  'M 0 -42 C 0.5 -26 0.5 -12 0 11',
];

/**
 * Tripod lamp: three walnut legs under a linen drum with brass fittings.
 * vState: 'lit' | 'warm' | 'ember' | 'out'.
 */
export const TripodLampArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const glow = glowLevel(vState);
  return (
    <g
      transform={facing === 1 ? 'scale(-1 1)' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <WarmGlowDefs idBase="oh-tripodlamp" />
      <defs>
        <linearGradient id="oh-tripodlamp-g3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(LINEN, 0.07)} />
          <stop offset="100%" stopColor={shade(LINEN, -0.08)} />
        </linearGradient>
      </defs>
      {/* one soft AO per foot */}
      <ellipse cx={-13} cy={-3} rx={4} ry={1.7} fill={SHADOW} opacity={0.12} stroke="none" />
      <ellipse cx={13} cy={-3} rx={4} ry={1.7} fill={SHADOW} opacity={0.12} stroke="none" />
      <ellipse cx={0} cy={11} rx={4} ry={1.7} fill={SHADOW} opacity={0.13} stroke="none" />
      {/* legs: ink body, walnut core */}
      {TRIPOD_LEGS.map((d, i) => (
        <path key={`i${i}`} d={d} fill="none" stroke={INK} strokeWidth={4.2} />
      ))}
      {TRIPOD_LEGS.map((d, i) => (
        <path key={`w${i}`} d={d} fill="none" stroke={WALNUT} strokeWidth={2.5} />
      ))}
      {/* edge-light on the front leg */}
      <path d="M 0.9 -40 C 1.3 -27 1.3 -13 0.9 9" fill="none" stroke={shade(WALNUT, 0.35)} strokeWidth={0.8} opacity={0.8} />
      {/* brass hub binding the three legs, with one glint */}
      <Cyl r={3} h={3.4} base={BRASS} lift={41} sw={SW_FINE} />
      <circle cx={1} cy={-44.6} r={0.55} fill={SPECULAR} opacity={0.6} stroke="none" />
      {/* short brass stem up to the drum */}
      <path d="M -1.1 -49 L 1.1 -49 L 1.1 -44.4 L -1.1 -44.4 Z" fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      {/* linen drum */}
      <g transform={`translate(0 ${-TRIPOD_DRUM_LIFT})`}>
        <path d={TRIPOD_DRUM_CYL.side} fill="url(#oh-tripodlamp-g3)" stroke="none" />
        <path
          d={cylLeftHalf(TRIPOD_DRUM_R, TRIPOD_DRUM_H)}
          fill={shade(LINEN, FACE_LEFT)}
          stroke="none"
        />
        {glow > 0 && (
          <g className="oh-flame" opacity={glow}>
            <ellipse cx={0} cy={-8} rx={10.8} ry={7.5} fill={glowFill('oh-tripodlamp', vState)} stroke="none" />
          </g>
        )}
        <path d={TRIPOD_DRUM_CYL.side} fill="none" stroke={INK} strokeWidth={SW} />
        {/* hem seam along the bottom rim */}
        <path
          d={`M ${-TRIPOD_DRUM_R} 0 A ${TRIPOD_DRUM_R} ${TRIPOD_DRUM_R / 2} 0 0 0 ${TRIPOD_DRUM_R} 0`}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
        />
        {/* two faint weave bands following the drum's curve */}
        <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.16}>
          <path d={`M ${-TRIPOD_DRUM_R + 0.8} -11 A ${TRIPOD_DRUM_R - 0.8} ${(TRIPOD_DRUM_R - 0.8) / 2} 0 0 0 ${TRIPOD_DRUM_R - 0.8} -11`} />
          <path d={`M ${-TRIPOD_DRUM_R + 0.8} -5.6 A ${TRIPOD_DRUM_R - 0.8} ${(TRIPOD_DRUM_R - 0.8) / 2} 0 0 0 ${TRIPOD_DRUM_R - 0.8} -5.6`} />
        </g>
        <ellipse
          cx={0}
          cy={-TRIPOD_DRUM_H}
          rx={TRIPOD_DRUM_R}
          ry={TRIPOD_DRUM_R / 2}
          fill={shade(LINEN, FACE_TOP)}
          stroke={INK}
          strokeWidth={SW}
        />
        <ellipse
          cx={0}
          cy={-TRIPOD_DRUM_H}
          rx={7.4}
          ry={3.7}
          fill={LINEN_SHADE}
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
        />
        {/* rim light where the top disc meets the window light */}
        <path
          d={rimLightArc(TRIPOD_DRUM_R * 0.88, (TRIPOD_DRUM_R / 2) * 0.88, -TRIPOD_DRUM_H)}
          fill="none"
          stroke={EDGE_LIGHT}
          strokeWidth={1}
          opacity={0.45}
        />
        {/* brass finial with one crisp glint */}
        <circle cx={0} cy={-TRIPOD_DRUM_H - 2.1} r={1.6} fill={BRASS} stroke={INK} strokeWidth={SW_FINE} />
        <circle cx={0.5} cy={-TRIPOD_DRUM_H - 2.6} r={0.55} fill={SPECULAR} opacity={0.7} stroke="none" />
      </g>
    </g>
  );
};

/* ── TableLampArt — small surface item · ~22px ───────────────── */

/**
 * Ceramic sage gourd base under a small linen empire shade.
 * vState: 'lit' | 'out'.
 */
export const TableLampArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const lit = vState === 'lit';
  return (
    <g
      transform={facing === 1 ? 'scale(-1 1)' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <linearGradient id="oh-tablelamp-g1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={shade(SAGE, FACE_LEFT)} />
          <stop offset="100%" stopColor={shade(SAGE, 0.2)} />
        </linearGradient>
        <radialGradient id="oh-tablelamp-g2" cx="0.5" cy="0.55" r="0.62">
          <stop offset="0%" stopColor={LAMP_GOLD} stopOpacity={0.9} />
          <stop offset="60%" stopColor={LAMP_GOLD} stopOpacity={0.4} />
          <stop offset="100%" stopColor={LAMP_GOLD} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="oh-tablelamp-g3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(LINEN, 0.08)} />
          <stop offset="100%" stopColor={shade(LINEN, -0.07)} />
        </linearGradient>
      </defs>
      <ContactAO rx={6.5} opacity={0.1} />
      {/* gourd base */}
      <path
        d="M 0 -0.5 C -6.5 -0.5 -8 -4 -7.2 -7.5 C -6.6 -10.5 -3.5 -12 -2.2 -12.5 L 2.2 -12.5 C 3.5 -12 6.6 -10.5 7.2 -7.5 C 8 -4 6.5 -0.5 0 -0.5 Z"
        fill="url(#oh-tablelamp-g1)"
        stroke={INK}
        strokeWidth={SW_FINE}
      />
      {/* ceramic sheen */}
      <path d="M 4.6 -10.4 C 5.6 -9.2 6 -7.6 5.8 -6" fill="none" stroke={shade(SAGE, 0.5)} strokeWidth={0.9} opacity={0.9} />
      {/* the shade's soft throw onto the gourd's shoulders */}
      <ellipse cx={0} cy={-11.9} rx={4.8} ry={1.6} fill={SHADOW} opacity={0.12} stroke="none" />
      {/* brass neck */}
      <path d="M -1.2 -14 L 1.2 -14 L 1.2 -12.2 L -1.2 -12.2 Z" fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      {/* linen empire shade, settling darker toward its mouth */}
      <path
        d="M -6.8 -13 L -4.6 -20.5 L 4.6 -20.5 L 6.8 -13 A 6.8 2.7 0 0 1 -6.8 -13 Z"
        fill="url(#oh-tablelamp-g3)"
        stroke="none"
      />
      {lit && (
        <g className="oh-flame">
          <ellipse cx={0} cy={-16.4} rx={5.2} ry={3.6} fill="url(#oh-tablelamp-g2)" stroke="none" />
        </g>
      )}
      <path
        d="M -6.8 -13 L -4.6 -20.5 L 4.6 -20.5 L 6.8 -13 A 6.8 2.7 0 0 1 -6.8 -13 Z"
        fill="none"
        stroke={INK}
        strokeWidth={SW_FINE}
      />
      {/* shade top, rim-lit toward the window */}
      <ellipse cx={0} cy={-20.5} rx={4.6} ry={1.9} fill={shade(LINEN, FACE_TOP)} stroke={INK} strokeWidth={SW_FINE} />
      <path d={rimLightArc(4, 1.65, -20.5)} fill="none" stroke={EDGE_LIGHT} strokeWidth={1} opacity={0.4} />
      <circle cx={0} cy={-21.8} r={1.1} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={0.4} cy={-22.1} r={0.45} fill={SPECULAR} opacity={0.7} stroke="none" />
    </g>
  );
};

/* ── LanternArt — small surface/sill item · ~18px ────────────── */

/**
 * Brass candle lantern: glass panes around a stub candle, loop handle.
 * vState: 'lit' | 'out'.
 */
export const LanternArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const lit = vState === 'lit';
  return (
    <g
      transform={facing === 1 ? 'scale(-1 1)' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <radialGradient id="oh-lantern-g1" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={CANDLE_GOLD} stopOpacity={0.85} />
          <stop offset="60%" stopColor={CANDLE_GOLD} stopOpacity={0.32} />
          <stop offset="100%" stopColor={CANDLE_GOLD} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="oh-lantern-g2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRASS_BRIGHT} />
          <stop offset="100%" stopColor={shade(BRASS, -0.25)} />
        </linearGradient>
      </defs>
      <ContactAO rx={6} opacity={0.1} />
      {/* brass foot, edge-lit */}
      <Cyl r={5.5} h={1.8} base={BRASS} sw={SW_FINE} rim />
      {/* candle stub inside */}
      <Cyl r={1.8} h={5} base={CREAM_WALL} lift={1.8} sw={SW_HAIR} />
      <path d="M 0 -7 Q 0.4 -7.8 0.2 -8.4" fill="none" stroke={INK} strokeWidth={SW_HAIR} />
      {/* flame + inner glow */}
      {lit && (
        <g className="oh-flame">
          <circle cx={0} cy={-9.6} r={4.6} fill="url(#oh-lantern-g1)" stroke="none" />
          <path
            d="M 0 -11.6 C 1.2 -10.2 1.3 -8.9 0 -7.7 C -1.3 -8.9 -1.2 -10.2 0 -11.6 Z"
            fill={CANDLE_GOLD}
            stroke={EMBER}
            strokeWidth={SW_HAIR}
          />
        </g>
      )}
      {/* glass panes — barely-there fill + one diagonal glint */}
      <path d="M -4.6 -2.2 L -4.6 -12 L 0 -13 L 0 -1.2 Z" fill="#ffffff" opacity={0.13} stroke="none" />
      <path d="M 0 -1.2 L 0 -13 L 4.6 -12 L 4.6 -2.2 Z" fill="#ffffff" opacity={0.2} stroke="none" />
      <path d="M 1.4 -11 L 3.4 -5.4" fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.5} />
      {/* brass corner posts framing the glass */}
      <path d="M -4.6 -2 L -4.6 -12" fill="none" stroke={BRASS} strokeWidth={1.4} />
      <path d="M 4.6 -2 L 4.6 -12" fill="none" stroke={BRASS} strokeWidth={1.4} />
      <path d="M 0 -1.2 L 0 -13" fill="none" stroke={BRASS} strokeWidth={1.1} />
      {/* ink silhouette of the cage */}
      <path
        d="M -4.6 -2.2 L -4.6 -12 L 0 -13 L 4.6 -12 L 4.6 -2.2"
        fill="none"
        stroke={INK}
        strokeWidth={SW_HAIR}
      />
      {/* cap's soft throw onto the panes below */}
      <path d="M -4.2 -11.2 L 4.2 -11.2" fill="none" stroke={SHADOW} strokeWidth={1.3} opacity={0.13} />
      {/* brass cap (darker toward its underside) + specular ticks */}
      <path d="M -5.2 -12 L 5.2 -12 L 2.6 -15.4 L -2.6 -15.4 Z" fill="url(#oh-lantern-g2)" stroke={INK} strokeWidth={SW_FINE} />
      <path d="M 1.6 -14.6 L 3.6 -12.8" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.9} opacity={0.9} />
      <circle cx={2.2} cy={-13.8} r={0.55} fill={SPECULAR} opacity={0.7} stroke="none" />
      {/* loop handle with a bead of light on its shoulder */}
      <circle cx={0} cy={-17.2} r={2} fill="none" stroke={INK} strokeWidth={2.6} />
      <circle cx={0} cy={-17.2} r={2} fill="none" stroke={BRASS} strokeWidth={1.3} />
      <circle cx={1.3} cy={-18.5} r={0.5} fill={SPECULAR} opacity={0.65} stroke="none" />
    </g>
  );
};

/* ── StringLightsArt — WALL item · ~120px sag ────────────────── */

/** 9 bulb seats along the catenary (quadratic through (0,24)). */
const STRING_PTS: readonly { x: number; y: number }[] = Array.from({ length: 9 }, (_, i) => {
  const t = (i + 1) / 10;
  const mt = 1 - t;
  return {
    x: +(mt * mt * -60 + t * t * 60).toFixed(1),
    y: +(2 * mt * t * 24).toFixed(1),
  };
});

/**
 * A garland of fairy lights sagging between two brass nails.
 * Anchor = hang point; wrapped in the wall skew per facing.
 * vState: 'lit' | 'out'.
 */
export const StringLightsArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const lit = vState === 'lit';
  return (
    <g
      transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <radialGradient id="oh-stringlights-g1" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={CANDLE_GOLD} stopOpacity={0.65} />
          <stop offset="100%" stopColor={CANDLE_GOLD} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="oh-stringlights-g2" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0%" stopColor={shade(CANDLE_GOLD, 0.45)} />
          <stop offset="100%" stopColor={shade(CANDLE_GOLD, -0.06)} />
        </radialGradient>
        <radialGradient id="oh-stringlights-g3" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0%" stopColor={shade(LINEN_SHADE, 0.25)} />
          <stop offset="100%" stopColor={shade(LINEN_SHADE, -0.12)} />
        </radialGradient>
      </defs>
      {/* the garland's soft throw onto the wall behind */}
      <path d="M -60 1.8 Q 0 26 60 1.8" fill="none" stroke={SHADOW} strokeWidth={1.6} opacity={0.1} />
      {/* the linen wire */}
      <path d="M -60 0 Q 0 24 60 0" fill="none" stroke={LINEN_SHADE} strokeWidth={1.6} />
      {/* soft halos — one gentle pool per bulb */}
      {lit && (
        <g className="oh-flame">
          {STRING_PTS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y + 4.2} r={4.5} fill="url(#oh-stringlights-g1)" stroke="none" />
          ))}
        </g>
      )}
      {/* pendants + bulbs */}
      {STRING_PTS.map((p, i) => (
        <g key={i}>
          <path d={`M ${p.x} ${p.y} L ${p.x} ${p.y + 2.4}`} fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR} />
          <circle
            cx={p.x}
            cy={p.y + 4.2}
            r={1.9}
            fill={lit ? 'url(#oh-stringlights-g2)' : 'url(#oh-stringlights-g3)'}
            stroke={INK}
            strokeWidth={SW_HAIR}
          />
          {/* one bead of light on each glass shoulder */}
          <circle cx={p.x + 0.6} cy={p.y + 3.5} r={0.45} fill={EDGE_LIGHT} opacity={0.55} stroke="none" />
        </g>
      ))}
      {/* brass nails pinning each end, each with a glint */}
      <circle cx={-60} cy={0} r={1.4} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={60} cy={0} r={1.4} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={-59.6} cy={-0.4} r={0.4} fill={SPECULAR} opacity={0.7} stroke="none" />
      <circle cx={60.4} cy={-0.4} r={0.4} fill={SPECULAR} opacity={0.7} stroke="none" />
    </g>
  );
};

/* ── MonsteraArt — 1×1 tile · ~52px ──────────────────────────── */

/** One canonical split monstera leaf: base at (0,0), tip toward -y. */
const MONSTERA_LEAF_D = [
  'M 0 0',
  'C -3.5 -1.5 -8.5 -3 -10.5 -7.5',
  'L -4.5 -8.5',
  'L -11 -12',
  'C -12 -16.5 -10.5 -21 -7 -23.5',
  'L -3 -16.5',
  'L -4.5 -24.5',
  'C -2.5 -26.5 2.5 -26.5 4.5 -24.5',
  'L 3 -16.5',
  'L 7 -23.5',
  'C 10.5 -21 12 -16.5 11 -12',
  'L 4.5 -8.5',
  'L 10.5 -7.5',
  'C 8.5 -3 3.5 -1.5 0 0',
  'Z',
].join(' ');

const MonsteraLeaf = ({ fill, vein }: { fill: string; vein: string }): React.JSX.Element => (
  <g>
    {/* petiole reaching down into the pot */}
    <path d="M 0 7 C 0 4 0 2 0 0" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_FINE} />
    <path d={MONSTERA_LEAF_D} fill={fill} stroke={INK} strokeWidth={SW_FINE} />
    {/* midrib + paired vein strokes */}
    <g fill="none" stroke={vein} strokeWidth={SW_HAIR}>
      <path d="M 0 -1.5 C -0.4 -9 0 -17 0 -24" />
      <path d="M 0 -7 L -7 -10.5" />
      <path d="M 0 -7 L 7 -10.5" />
      <path d="M 0 -14 L -6.5 -18" />
      <path d="M 0 -14 L 6.5 -18" />
    </g>
  </g>
);

/**
 * Monstera in a terracotta pot: five big split leaves fanned around one
 * young leaf still unfurling.
 */
export const MonsteraArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="oh-monstera-g2" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor={SAGE_DEEP} />
        <stop offset="100%" stopColor={shade(SAGE, 0.15)} />
      </linearGradient>
    </defs>
    {/* foliage grows from the pot's mouth */}
    <g transform="translate(0 -16)">
      {/* back pair — flat deep sage */}
      <g transform="rotate(-55) scale(0.95)">
        <MonsteraLeaf fill={SAGE_DEEP} vein={shade(SAGE, 0.3)} />
      </g>
      <g transform="rotate(48) scale(0.9)">
        <MonsteraLeaf fill={SAGE_DEEP} vein={shade(SAGE, 0.3)} />
      </g>
      {/* mid pair — gradient depth */}
      <g transform="rotate(-24) scale(1.15)">
        <MonsteraLeaf fill="url(#oh-monstera-g2)" vein={shade(SAGE, 0.32)} />
      </g>
      <g transform="rotate(20) scale(1.2)">
        <MonsteraLeaf fill="url(#oh-monstera-g2)" vein={shade(SAGE, 0.32)} />
      </g>
      {/* the front leaf's soft throw onto the pair behind it */}
      <g transform="translate(1.6 4) rotate(-2) scale(1.05)">
        <path d={MONSTERA_LEAF_D} fill={SHADOW} opacity={0.1} stroke="none" />
      </g>
      {/* the front leaf, catching the most light */}
      <g transform="translate(0 2) rotate(-2) scale(1.05)">
        <MonsteraLeaf fill={SAGE} vein={SAGE_DEEP} />
        {/* waxy sheen beside the midrib */}
        <path d="M 1.5 -6 C 3.2 -10 3.8 -15 3 -20" fill="none" stroke={shade(SAGE, 0.35)} strokeWidth={SW_HAIR} opacity={0.7} />
      </g>
      {/* young unfurling spike */}
      <g transform="rotate(8)">
        <path
          d="M 2 0 C 1 -5 1 -10 3 -14 C 5 -11 4.6 -5 4 0 Z"
          fill={SAGE_DEEP}
          stroke={INK}
          strokeWidth={SW_HAIR}
        />
        <path d="M 3 -13 C 4.2 -12.2 4.2 -10.8 3.2 -10.4" fill="none" stroke={shade(SAGE, 0.3)} strokeWidth={SW_HAIR} />
      </g>
    </g>
    <Pot rimR={12} h={15} base={TERRACOTTA} gradId="oh-monstera-g1" />
  </g>
);

/* ── FiddleLeafArt — 1×1 tile · ~64px ────────────────────────── */

/** Broad obovate fiddle leaf: base at (0,0), tip toward -y. */
const FIDDLE_LEAF_D =
  'M 0 0 C -4.5 -2 -6.5 -6 -5.8 -10.5 C -5.2 -13.5 -2.8 -15 0 -15 C 2.8 -15 5.2 -13.5 5.8 -10.5 C 6.5 -6 4.5 -2 0 0 Z';

const FiddleLeaf = ({ fill, vein }: { fill: string; vein: string }): React.JSX.Element => (
  <g>
    <path d="M 0 3 L 0 0" fill="none" stroke={WALNUT_DEEP} strokeWidth={SW_HAIR} />
    <path d={FIDDLE_LEAF_D} fill={fill} stroke={INK} strokeWidth={SW_FINE} />
    <g fill="none" stroke={vein} strokeWidth={SW_HAIR}>
      <path d="M 0 -0.5 L 0 -14" />
      <path d="M 0 -4 L -4 -7" />
      <path d="M 0 -4 L 4 -7" />
      <path d="M 0 -8 L -4.2 -11" />
      <path d="M 0 -8 L 4.2 -11" />
      <path d="M 0 -11.5 L -2.8 -13.4" />
      <path d="M 0 -11.5 L 2.8 -13.4" />
    </g>
  </g>
);

/** Placement ladder up the trunk: [x, y, rotate, scale, front?]. */
const FIDDLE_SEATS: readonly [number, number, number, number, boolean][] = [
  [-1, -18, -76, 1, false],
  [1, -22, 72, 1.05, false],
  [-1, -28, -46, 1.1, false],
  [1, -34, 44, 1.15, true],
  [-0.5, -40, -20, 1.1, true],
  [0.5, -45, 18, 1.05, true],
  [0, -50, -4, 1.2, true],
];

/**
 * Fiddle-leaf fig: slim walnut trunk, seven broad leaves staggered up it.
 */
export const FiddleLeafArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="oh-fiddleleaf-g2" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor={SAGE_DEEP} />
        <stop offset="100%" stopColor={shade(SAGE, 0.18)} />
      </linearGradient>
    </defs>
    {/* slim trunk with node ticks */}
    <path
      d="M -1.2 -12 C -1.6 -28 -0.8 -42 -0.4 -50 L 1.2 -50 C 1.6 -42 1 -28 1.4 -12 Z"
      fill={WALNUT}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    <path d="M -0.9 -26 L 1 -26" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    <path d="M -0.8 -38 L 1 -38" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    {/* warm sheen up the trunk's lit side */}
    <path d="M 0.9 -14 C 1.2 -28 0.8 -42 0.5 -49" fill="none" stroke={shade(WALNUT, 0.35)} strokeWidth={0.7} opacity={0.8} />
    {/* back leaves, then front leaves over the trunk */}
    {FIDDLE_SEATS.filter(([, , , , front]) => !front).map(([x, y, r, s], i) => (
      <g key={`b${i}`} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
        <FiddleLeaf fill={SAGE_DEEP} vein={shade(SAGE, 0.3)} />
      </g>
    ))}
    {/* the crown leaf's soft throw onto the leaves below */}
    <g transform="translate(1.4 -47.5) rotate(-4) scale(1.2)">
      <path d={FIDDLE_LEAF_D} fill={SHADOW} opacity={0.1} stroke="none" />
    </g>
    {FIDDLE_SEATS.filter(([, , , , front]) => front).map(([x, y, r, s], i) => (
      <g key={`f${i}`} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
        <FiddleLeaf fill="url(#oh-fiddleleaf-g2)" vein={shade(SAGE, 0.32)} />
      </g>
    ))}
    {/* waxy sheen on the crown leaf */}
    <g transform="translate(0 -50) rotate(-4) scale(1.2)">
      <path d="M 1.8 -5 C 2.8 -8 2.9 -11 2 -13.5" fill="none" stroke={shade(SAGE, 0.35)} strokeWidth={SW_HAIR} opacity={0.7} />
    </g>
    <Pot rimR={10} h={13} base={TERRACOTTA} gradId="oh-fiddleleaf-g1" />
  </g>
);

/* ── PalmArt — 1×1 tile · ~56px ──────────────────────────────── */

interface Frond {
  d: string;
  mid: string;
}

/** A slim arching crescent frond from the basket's mouth. */
const frond = (angleDeg: number, len: number): Frond => {
  const a = (angleDeg * Math.PI) / 180;
  const tx = +(Math.sin(a) * len).toFixed(1);
  const ty = +(-Math.cos(a) * len * 0.82 - 4).toFixed(1);
  const oX = +(tx * 0.38).toFixed(1);
  const oY = +(ty * 0.72 - 9).toFixed(1);
  const iX = +(tx * 0.52).toFixed(1);
  const iY = +(ty * 0.58).toFixed(1);
  return {
    d: `M 0 0 Q ${oX} ${oY} ${tx} ${ty} Q ${iX} ${iY} 0 0 Z`,
    mid: `M 0 0 Q ${iX} ${iY - 2} ${tx} ${ty}`,
  };
};

/** [angle, length] fan — back (even) fronds render darker, behind. */
const PALM_FAN: readonly [number, number][] = [
  [-84, 30], [-62, 36], [-40, 40], [-18, 42], [4, 44], [26, 42], [48, 40], [70, 36], [88, 30],
];

/** The basket volume, kept around for the premium overlay passes. */
const PALM_BASKET_SIDE = isoCylinder(12, 13).side;

/**
 * Parlor palm: many arching fronds out of a woven oak basket.
 */
export const PalmArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="oh-palm-g1" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={SAGE_DEEP} />
        <stop offset="100%" stopColor={shade(SAGE, 0.2)} />
      </linearGradient>
      <linearGradient id="oh-palm-g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={SHADOW} stopOpacity={0} />
        <stop offset="100%" stopColor={SHADOW} stopOpacity={0.18} />
      </linearGradient>
    </defs>
    {/* fronds from the basket's mouth: dark back layer, lit front layer */}
    <g transform="translate(0 -12)">
      {PALM_FAN.filter((_, i) => i % 2 === 0).map(([a, l], i) => (
        <path key={`b${i}`} d={frond(a, l).d} fill={SAGE_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
      ))}
      {PALM_FAN.filter((_, i) => i % 2 === 1).map(([a, l], i) => (
        <path key={`f${i}`} d={frond(a, l).d} fill="url(#oh-palm-g1)" stroke={INK} strokeWidth={SW_HAIR} />
      ))}
      {/* midribs on the three front-facing fronds */}
      {[[-18, 42], [4, 44], [26, 42]].map(([a, l], i) => (
        <path
          key={`m${i}`}
          d={frond(a as number, l as number).mid}
          fill="none"
          stroke={shade(SAGE, 0.3)}
          strokeWidth={SW_HAIR}
        />
      ))}
    </g>
    {/* woven oak basket, edge-lit, settling darker toward the floor */}
    <ContactAO rx={13} />
    <Cyl r={12} h={13} base={OAK} rim />
    <path d={PALM_BASKET_SIDE} fill="url(#oh-palm-g2)" stroke="none" />
    <path d={PALM_BASKET_SIDE} fill="none" stroke={INK} strokeWidth={SW} />
    {/* the canopy's soft throw onto the basket's shoulder */}
    <ellipse cx={0} cy={-9.5} rx={8.5} ry={3} fill={SHADOW} opacity={0.1} stroke="none" />
    {/* weave: upright ribs + two wobbled binding bands */}
    <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
      {[-9, -6, -3, 0, 3, 6, 9].map((x) => (
        <path key={x} d={`M ${x} -11.5 L ${x} -1.5`} />
      ))}
      <path d={wobblyLine(-11, -8.5, 11, -8.5, 3, 0.5)} />
      <path d={wobblyLine(-11, -4.5, 11, -4.5, 7, 0.5)} />
    </g>
    {/* braid rim + soil with AO ring */}
    <ellipse cx={0} cy={-13} rx={12} ry={6} fill="none" stroke={OAK_DEEP} strokeWidth={1.4} />
    <ellipse cx={0} cy={-13} rx={9.5} ry={4.7} fill={INK} opacity={0.2} stroke="none" />
    <ellipse cx={0} cy={-12.6} rx={8} ry={4} fill={WALNUT_DEEP} stroke="none" />
  </g>
);

/* ── HangingPlantArt — WALL item · ~46px drop ────────────────── */

/** Little pothos heart leaf: tip at (0,0), body toward -y. */
const POTHOS_LEAF_D =
  'M 0 0 C -3 -0.6 -4.4 -3 -3 -4.8 C -1.8 -6.2 0 -5.4 0 -3.8 C 0 -5.4 1.8 -6.2 3 -4.8 C 4.4 -3 3 -0.6 0 0 Z';

/** [x, y, rotate, dark?] seats along the two trailing vines. */
const POTHOS_SEATS: readonly [number, number, number, boolean][] = [
  [-7, 28, -32, false],
  [-8, 34.5, 24, true],
  [-9.2, 41.5, -14, false],
  [6.5, 29, 30, true],
  [6, 36, -22, false],
  [7.2, 41, 16, true],
];

/**
 * Macramé hanger holding a terracotta pot, pothos trailing in two strands.
 * Anchor = hang point; wrapped in the wall skew per facing.
 */
export const HangingPlantArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* brass hook ring with one glint */}
    <circle cx={0} cy={1.6} r={1.8} fill="none" stroke={INK} strokeWidth={2.4} />
    <circle cx={0} cy={1.6} r={1.8} fill="none" stroke={BRASS} strokeWidth={1.2} />
    <circle cx={1.1} cy={0.5} r={0.45} fill={SPECULAR} opacity={0.7} stroke="none" />
    {/* linen macramé strands */}
    <g fill="none" stroke={LINEN_SHADE} strokeWidth={1.3}>
      <path d="M 0 3.4 C -3 8 -6 14 -7.5 21" />
      <path d="M 0 3.4 C 3 8 6 14 7.5 21" />
      <path d="M 0 3.4 C 0 9 0 15 0 23" />
    </g>
    {/* knot ticks where the net is tied */}
    <g fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR}>
      <path d="M -4.6 9.5 Q 0 11.5 4.6 9.5" />
      <path d="M -6.6 15.5 Q 0 18 6.6 15.5" />
      <path d="M -1.2 10.4 L 1.2 10.4" />
      <path d="M -1.4 16.6 L 1.4 16.6" />
      <path d="M -5.4 12.4 L -3.6 12.8" />
      <path d="M 3.6 12.8 L 5.4 12.4" />
    </g>
    {/* the leaves' soft throw onto the wall behind */}
    {POTHOS_SEATS.map(([x, y, r], i) => (
      <g key={`s${i}`} transform={`translate(${x + 1.2} ${y + 1.8}) rotate(${r})`}>
        <path d={POTHOS_LEAF_D} fill={SHADOW} opacity={0.08} stroke="none" />
      </g>
    ))}
    {/* trailing vines behind the pot's rim */}
    <g fill="none" stroke={SAGE_DEEP} strokeWidth={1.2}>
      <path d="M -5 24 C -9 29 -7 36 -9.5 43.5" />
      <path d="M 4 24 C 8 30 5 36 7 42" />
    </g>
    {/* pothos leaves along the vines, each with a centre vein */}
    {POTHOS_SEATS.map(([x, y, r, dark], i) => (
      <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
        <path d={POTHOS_LEAF_D} fill={dark ? SAGE_DEEP : SAGE} stroke={INK} strokeWidth={SW_HAIR} />
        <path d="M 0 -0.8 L 0 -4.4" fill="none" stroke={dark ? shade(SAGE, 0.3) : SAGE_DEEP} strokeWidth={SW_HAIR} opacity={0.7} />
      </g>
    ))}
    {/* the pot rides in the sling */}
    <g transform="translate(0 31)">
      <Pot rimR={8} h={9} base={TERRACOTTA} gradId="oh-hangingplant-g1" floating />
    </g>
  </g>
);

/* ── AquariumArt — 2×1 tiles · ~56px total ───────────────────── */

const AQ_STAND = isoBoxFaces(2, 1, 16);
const AQ_TANK = isoBoxFaces(2, 1, 40);

/** Tank footprint corners (w=2, d=1): brass runs up the visible edges. */
const AQ_E = { x: 30, y: 5 };
const AQ_S = { x: 10, y: 15 };
const AQ_W = { x: -30, y: -5 };
const AQ_N = { x: -10, y: -15 };

const Goldfish = (): React.JSX.Element => (
  <g>
    <path d="M -3.6 0 L -6.8 -2.4 L -6.8 2.4 Z" fill={TERRACOTTA_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
    <ellipse cx={0} cy={0} rx={4.2} ry={2.5} fill={TERRACOTTA} stroke={INK} strokeWidth={SW_HAIR} />
    {/* scale sheen along the back */}
    <path d="M -1.8 -1.3 Q 0.2 -2.1 2 -1.1" fill="none" stroke={shade(TERRACOTTA, 0.45)} strokeWidth={SW_HAIR} opacity={0.9} />
    <path d="M 0.2 0.6 Q 1.6 2 0.4 2.8" fill="none" stroke={TERRACOTTA_DEEP} strokeWidth={SW_HAIR} />
    <path d="M -0.6 -2.2 L 0.4 -3.6 L 1.2 -2.2" fill="none" stroke={TERRACOTTA_DEEP} strokeWidth={SW_HAIR} />
    <circle cx={2.6} cy={-0.6} r={0.5} fill={INK} stroke="none" />
  </g>
);

/**
 * Glass aquarium on a walnut stand: gravel, sprigs, two goldfish, a thin
 * column of bubbles, brass-edged panes with one white glint.
 */
export const AquariumArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="oh-aquarium-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={shade(SAGE, 0.55)} stopOpacity={0.42} />
        <stop offset="20%" stopColor={SAGE} stopOpacity={0.16} />
        <stop offset="100%" stopColor={SAGE} stopOpacity={0.24} />
      </linearGradient>
      <linearGradient id="oh-aquarium-g2" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor={shade(WALNUT, FACE_TOP - 0.05)} />
        <stop offset="100%" stopColor={shade(WALNUT, FACE_TOP + 0.07)} />
      </linearGradient>
      <linearGradient id="oh-aquarium-g3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={shade(WALNUT, FACE_RIGHT + 0.06)} />
        <stop offset="100%" stopColor={shade(WALNUT, FACE_RIGHT - 0.07)} />
      </linearGradient>
      <linearGradient id="oh-aquarium-g4" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={shade(WALNUT, FACE_LEFT + 0.06)} />
        <stop offset="100%" stopColor={shade(WALNUT, FACE_LEFT - 0.07)} />
      </linearGradient>
    </defs>
    {/* floor AO under the stand */}
    <path d={isoDiamond(2.15, 1.15)} fill={SHADOW} opacity={0.12} stroke="none" />
    {/* walnut stand — each face graded toward the room light */}
    <path d={AQ_STAND.top} fill="url(#oh-aquarium-g2)" stroke="none" />
    <path d={AQ_STAND.right} fill="url(#oh-aquarium-g3)" stroke="none" />
    <path d={AQ_STAND.left} fill="url(#oh-aquarium-g4)" stroke="none" />
    {/* grain drifting across the cabinet faces */}
    <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
      <path d={wobblyLine(12, 8.4, 28, 0.4, 17, 0.5)} opacity={0.3} />
      <path d={wobblyLine(12, 3.6, 28, -4.4, 29, 0.5)} opacity={0.3} />
      <path d={wobblyLine(-27, -11.5, 7, 5.5, 41, 0.5)} opacity={0.22} />
    </g>
    <path d={AQ_STAND.outline} fill="none" stroke={INK} strokeWidth={SW} />
    {/* rim light along the stand's lit top edge */}
    <path d="M -8.5 -30.2 L 28.3 -11.7" fill="none" stroke={EDGE_LIGHT} strokeWidth={1} opacity={0.4} />
    {/* cabinet door seam + brass pull on the sunny face */}
    <path d="M 20 3 L 20 13.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    <circle cx={17} cy={8.5} r={1.1} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
    <circle cx={17.4} cy={8.1} r={0.4} fill={SPECULAR} opacity={0.7} stroke="none" />
    {/* the tank rides the stand top */}
    <g transform="translate(0 -16)">
      {/* AO where glass meets walnut */}
      <path d={isoDiamond(2, 1)} fill={SHADOW} opacity={0.11} stroke="none" />
      {/* gravel bed + stones */}
      <ellipse cx={0} cy={1} rx={25} ry={7.5} fill={KRAFT_SHADE} stroke="none" />
      <path
        d="M -24 0 Q 0 9.5 24 -2"
        fill="none"
        stroke={INK_SOFT}
        strokeWidth={SW_HAIR}
        opacity={0.8}
      />
      <circle cx={-12} cy={2} r={1.1} fill={KRAFT} stroke="none" />
      <circle cx={-2} cy={5} r={1} fill={OAK_DEEP} stroke="none" />
      <circle cx={9} cy={3} r={1.2} fill={KRAFT} stroke="none" />
      <circle cx={16} cy={0} r={0.9} fill={OAK_DEEP} stroke="none" />
      {/* the goldfish's soft throws onto the gravel */}
      <ellipse cx={-8} cy={0.5} rx={4.5} ry={1.4} fill={SHADOW} opacity={0.1} stroke="none" />
      <ellipse cx={10} cy={-0.8} rx={4.5} ry={1.4} fill={SHADOW} opacity={0.08} stroke="none" />
      {/* three sage sprigs swaying up from the gravel */}
      <g fill="none" strokeWidth={1.5}>
        <path d="M -16 0 C -18 -6 -19 -11 -21 -14" stroke={SAGE_DEEP} />
        <path d="M -16 0 C -15 -7 -14.5 -12 -13 -16" stroke={SAGE} />
        <path d="M -2 4 C -4 -3 -4.5 -9 -6 -13" stroke={SAGE} />
        <path d="M -2 4 C -0.5 -3 0 -9 1.5 -12" stroke={SAGE_DEEP} />
        <path d="M 12 1 C 10.5 -5 10 -10 8.5 -13" stroke={SAGE_DEEP} />
        <path d="M 12 1 C 13.5 -5 14 -9 15.5 -12" stroke={SAGE} />
      </g>
      {/* two goldfish crossing at different depths */}
      <g transform="translate(-8 -19)">
        <Goldfish />
      </g>
      <g transform="translate(10 -27) scale(-1 1)">
        <Goldfish />
      </g>
      {/* a thin bubble column */}
      <g className="oh-steam">
        <circle cx={17} cy={-12} r={1} fill="#ffffff" opacity={0.55} stroke="none" />
        <circle cx={18.4} cy={-19} r={1.3} fill="#ffffff" opacity={0.5} stroke="none" />
        <circle cx={16.8} cy={-27} r={1.6} fill="#ffffff" opacity={0.45} stroke="none" />
      </g>
      {/* water — barely-there glass panes with a lighter band up top */}
      <path d={AQ_TANK.right} fill="url(#oh-aquarium-g1)" stroke="none" />
      <path d={AQ_TANK.left} fill="url(#oh-aquarium-g1)" stroke="none" />
      {/* water surface a touch below the rim */}
      <path
        d={isoDiamond(1.9, 0.9, 35)}
        fill={shade(SAGE, 0.5)}
        opacity={0.35}
        stroke={shade(SAGE, 0.6)}
        strokeWidth={0.8}
      />
      {/* light breaking on the water near the lit corner */}
      <path d="M 7 -39.6 L 12 -38.2" fill="none" stroke={EDGE_LIGHT} strokeWidth={1} opacity={0.45} />
      <path d="M 14 -42 L 18 -40.8" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.8} opacity={0.35} />
      {/* one diagonal glint down the sunny pane */}
      <path d="M 12 -34 L 24 -16" fill="none" stroke="#ffffff" strokeWidth={2} opacity={0.5} />
      <path d="M 8 -35 L 17 -21" fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.4} />
      {/* ink silhouette, then brass frame edges over it */}
      <path d={AQ_TANK.outline} fill="none" stroke={INK} strokeWidth={SW_FINE} />
      <g fill="none" stroke={BRASS} strokeWidth={1.6}>
        <path d={`M ${AQ_W.x} ${AQ_W.y} L ${AQ_W.x} ${AQ_W.y - 40}`} />
        <path d={`M ${AQ_S.x} ${AQ_S.y} L ${AQ_S.x} ${AQ_S.y - 40}`} />
        <path d={`M ${AQ_E.x} ${AQ_E.y} L ${AQ_E.x} ${AQ_E.y - 40}`} />
        <path
          d={`M ${AQ_N.x} ${AQ_N.y - 40} L ${AQ_E.x} ${AQ_E.y - 40} L ${AQ_S.x} ${AQ_S.y - 40} L ${AQ_W.x} ${AQ_W.y - 40} Z`}
        />
      </g>
      {/* crisp glint where the lit frame edges meet */}
      <circle cx={AQ_E.x} cy={AQ_E.y - 40} r={1} fill={SPECULAR} opacity={0.55} stroke="none" />
      {/* specular thread on the nearest brass corner */}
      <path
        d={`M ${AQ_S.x + 0.9} ${AQ_S.y - 2} L ${AQ_S.x + 0.9} ${AQ_S.y - 36}`}
        fill="none"
        stroke={BRASS_BRIGHT}
        strokeWidth={0.7}
        opacity={0.9}
      />
    </g>
  </g>
);

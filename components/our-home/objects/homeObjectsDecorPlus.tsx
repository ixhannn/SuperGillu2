/**
 * OUR HOME — decor plus (isometric).
 *
 * The music corner and the softer layers: a record player, an upright piano,
 * a guitar on its stand, a crate of vinyl, stacked books wearing reading
 * glasses, a desk globe, a brass telescope, two heirloom rugs, and three
 * wall pieces (a tapestry, a tiny landscape, a tasteful abstract).
 *
 * Storybook realism kit: subtle 2-stop gradients (stable ids
 * "oh-<sku>-g<i>"), warm umber ground shadows (#3a2518), near-white edge
 * lights (#fff6e6) and brass speculars (#fff3dc) on lit rims, cast
 * self-shadows under overhangs, wood grain + varnish bands, weave ticks.
 * INK outlines everywhere; light from the upper right (top faces brightest,
 * left faces darkest). Floor pieces anchor at (0,0) = footprint centre on
 * the floor plane (−y up); floor facing 1 mirrors with scale(-1,1). Wall
 * pieces draw flat around the hang point, then lie onto the wall with
 * WALL_SKEW_L (facing 0) or WALL_SKEW_R (facing 1).
 */
import React from 'react';
import {
  INK,
  INK_SOFT,
  CREAM_WALL,
  PAPER,
  PAPER_SHADE,
  KRAFT,
  KRAFT_SHADE,
  WINE,
  WINE_DEEP,
  ROSE,
  ROSE_PALE,
  PLUM_HEATHER,
  PLUM_HEATHER_DEEP,
  LINEN,
  LINEN_SHADE,
  OAK,
  OAK_DEEP,
  WALNUT,
  WALNUT_DEEP,
  BRASS,
  BRASS_BRIGHT,
  SAGE,
  SAGE_DEEP,
  DAWN_GOLD,
  LAMP_GOLD,
  INK_GOLD,
  SEAT_GOLD,
  SW,
  SW_FINE,
  SW_HAIR,
  wobblyLine,
  softEllipse,
  seedFrom,
} from '../homeArt';
import {
  isoBoxFaces,
  isoDiamond,
  shade,
  FACE_TOP,
  FACE_RIGHT,
  FACE_LEFT,
  WALL_SKEW_L,
  WALL_SKEW_R,
  TILE_W,
  TILE_H,
} from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/* ── Shared: floor-plane helpers (tiles → screen px, centred) ─── */

const ip = (c: number, r: number, lift = 0): string =>
  `${((c - r) * (TILE_W / 2)).toFixed(1)} ${((c + r) * (TILE_H / 2) - lift).toFixed(1)}`;

const ipx = (c: number, r: number): number => (c - r) * (TILE_W / 2);
const ipy = (c: number, r: number, lift = 0): number => (c + r) * (TILE_H / 2) - lift;

/** A small flat diamond (tile-space rectangle) centred at (c, r). */
const dia = (c: number, r: number, hw: number, hd: number, lift = 0): string =>
  `M ${ip(c - hw, r - hd, lift)} L ${ip(c + hw, r - hd, lift)} L ${ip(c + hw, r + hd, lift)} L ${ip(c - hw, r + hd, lift)} Z`;

const MIRROR = 'scale(-1 1)';

/* ── Shared: a lit iso box (top bright, right dim, left dark) ─── */

interface IsoBoxProps {
  w: number;
  d: number;
  h: number;
  color: string;
  /** Optional per-face fills (gradient urls) — `color` stays the shade source. */
  topFill?: string;
  rightFill?: string;
  leftFill?: string;
}

const IsoBox = ({ w, d, h, color, topFill, rightFill, leftFill }: IsoBoxProps): React.JSX.Element => {
  const faces = isoBoxFaces(w, d, h);
  return (
    <g>
      <path d={faces.left} fill={leftFill ?? shade(color, FACE_LEFT)} />
      <path d={faces.right} fill={rightFill ?? shade(color, FACE_RIGHT)} />
      <path d={faces.top} fill={topFill ?? shade(color, FACE_TOP)} />
      <path d={faces.outline} fill="none" stroke={INK} strokeWidth={SW} />
    </g>
  );
};

/* ══ Record player — 1×1 walnut console, ~30px ═════════════════
 * vState: 'spinning' (default) | 'still' — the vinyl disc group carries
 * className "oh-spin" only while spinning. */

const RP_SEED = seedFrom('oh-record-player');
const RP_VARNISH = isoDiamond(0.78, 0.54, 13);
const RP_EDGE_LIGHT = `M ${ip(-0.475, -0.35, 13)} L ${ip(0.475, -0.35, 13)}`;
const RP_GRAIN = wobblyLine(4, 1.6, 14.5, -3.6, RP_SEED * 9, 0.35);
const RP_GRAIN_B = wobblyLine(5.5, 4.6, 15.8, -0.2, RP_SEED * 17, 0.3);

export const RecordPlayerArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const spinning = vState !== 'still';
  return (
    <g transform={facing === 1 ? MIRROR : undefined} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-record-player-g1" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={shade(WALNUT, FACE_TOP - 0.05)} />
          <stop offset="1" stopColor={shade(WALNUT, FACE_TOP + 0.07)} />
        </linearGradient>
        <linearGradient id="oh-record-player-g2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(WALNUT, FACE_RIGHT + 0.06)} />
          <stop offset="1" stopColor={shade(WALNUT, FACE_RIGHT - 0.07)} />
        </linearGradient>
        <linearGradient id="oh-record-player-g3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(WALNUT, FACE_LEFT + 0.05)} />
          <stop offset="1" stopColor={shade(WALNUT, FACE_LEFT - 0.07)} />
        </linearGradient>
      </defs>
      {/* grounding shadow */}
      <ellipse cx={0} cy={1.5} rx={15.2} ry={4.9} fill="#3a2518" opacity={0.13} />
      {/* walnut console — faces graded toward the upper-right light */}
      <IsoBox
        w={0.95}
        d={0.7}
        h={13}
        color={WALNUT}
        topFill="url(#oh-record-player-g1)"
        rightFill="url(#oh-record-player-g2)"
        leftFill="url(#oh-record-player-g3)"
      />
      <path d={RP_GRAIN} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.35} />
      <path d={RP_GRAIN_B} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.22} />
      {/* varnish band + near-white lit top edge */}
      <path d={RP_VARNISH} fill="none" stroke={shade(WALNUT, 0.3)} strokeWidth={0.8} opacity={0.55} />
      <path d={RP_EDGE_LIGHT} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
      {/* platter self-shadow, thrown down-left of the light */}
      <ellipse cx={-0.9} cy={-13.1} rx={9.5} ry={4.5} fill="#3a2518" opacity={0.12} />
      {/* platter felt */}
      <ellipse cx={0} cy={-14} rx={9.2} ry={4.6} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_FINE} />
      {/* the wine vinyl — drawn round, squashed onto the deck, spun by class */}
      <g transform="translate(0 -14.6) scale(1 0.5)">
        <g className={spinning ? 'oh-spin' : undefined}>
          <circle cx={0} cy={0} r={8.4} fill={WINE_DEEP} stroke={INK} strokeWidth={SW_FINE} />
          {/* grooves: two thin catch-light arcs */}
          <path d="M -6.3 -1.6 A 6.5 6.5 0 0 1 1.8 -6.2" fill="none" stroke={WINE} strokeWidth={SW_HAIR} opacity={0.9} />
          <path d="M -4.4 2.2 A 4.9 4.9 0 0 1 -2 -4.3" fill="none" stroke={WINE} strokeWidth={SW_HAIR} opacity={0.7} />
          <path d="M 3.2 5.6 A 6.5 6.5 0 0 1 -3.4 5.7" fill="none" stroke={shade(WINE, 0.3)} strokeWidth={SW_HAIR} opacity={0.6} />
          {/* paper label with an off-centre press mark so the spin reads */}
          <circle cx={0} cy={0} r={2.4} fill={PAPER} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <path d="M 0.5 -1.7 L 1.3 -0.9" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <circle cx={0} cy={0} r={0.45} fill={INK} />
        </g>
      </g>
      {/* brass tonearm, parked over the rim */}
      <circle cx={11.4} cy={-13.6} r={1.5} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M 11.4 -15 L 10.6 -17.2 L 4.6 -16.4" fill="none" stroke={BRASS} strokeWidth={1.1} />
      <path d="M 11.2 -15.3 L 10.5 -17 L 5.2 -16.3" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.45} opacity={0.9} />
      <circle cx={4.2} cy={-16.3} r={0.8} fill={WALNUT_DEEP} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {/* a sleeve leaning against the left side */}
      <path d="M -19.5 3.4 L -11 7.6 L -9.3 -4.6 L -17.8 -8.6 Z" fill={SAGE} stroke={INK} strokeWidth={SW_FINE} />
      <path d="M -17.8 -8.6 L -9.3 -4.6" fill="none" stroke={shade(SAGE, 0.35)} strokeWidth={0.8} opacity={0.8} />
      <circle cx={-14.2} cy={-0.6} r={1.7} fill="none" stroke={shade(SAGE, -0.3)} strokeWidth={SW_HAIR} />
    </g>
  );
};

/* ══ Upright piano — 3×1 tiles, ~66px ══════════════════════════
 * Walnut upright: lower body with a paper keybed strip on the front-left
 * face, a set-back upper cabinet with sheet music on its stand, a slab lid
 * with a candle-worthy flat, and two brass pedals at the toe. */

const PIANO_SEED = seedFrom('oh-upright-piano');
/** Front-left face plane of the 3×1 lower body (west corner → south). */
const PIANO_FACE = 'matrix(1 0.5 0 1 -40 -10)';
/** Front-left face plane of the set-back upper cabinet. */
const PIANO_CAB_FACE = 'matrix(1 0.5 0 1 -30.5 -48.75)';
const PIANO_LID = isoBoxFaces(3.08, 0.62, 3);
const PIANO_KEY_TICKS = Array.from({ length: 16 }, (_, i) => {
  const x = (6.4 + i * 3.1).toFixed(1);
  return `M ${x} -32.4 L ${x} -27.2`;
}).join(' ');
const PIANO_BLACK_KEYS = [8, 18.2, 28.4, 38.6, 49];
const PIANO_GRAIN_A = wobblyLine(6, -12.5, 54, -13.5, PIANO_SEED * 3, 0.5);
const PIANO_GRAIN_B = wobblyLine(8, -18.5, 52, -19, PIANO_SEED * 7, 0.5);

export const UprightPianoArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? MIRROR : undefined} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-upright-piano-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(WALNUT, FACE_TOP - 0.06)} />
        <stop offset="1" stopColor={shade(WALNUT, FACE_TOP + 0.1)} />
      </linearGradient>
      <linearGradient id="oh-upright-piano-g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(WALNUT, FACE_RIGHT + 0.06)} />
        <stop offset="1" stopColor={shade(WALNUT, FACE_RIGHT - 0.07)} />
      </linearGradient>
      <linearGradient id="oh-upright-piano-g3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(WALNUT, FACE_LEFT + 0.05)} />
        <stop offset="1" stopColor={shade(WALNUT, FACE_LEFT - 0.07)} />
      </linearGradient>
    </defs>
    {/* grounding shadow */}
    <ellipse cx={0} cy={1.5} rx={36.8} ry={11.8} fill="#3a2518" opacity={0.13} />
    {/* lower body — faces graded toward the upper-right light */}
    <IsoBox
      w={3}
      d={1}
      h={34}
      color={WALNUT}
      topFill="url(#oh-upright-piano-g1)"
      rightFill="url(#oh-upright-piano-g2)"
      leftFill="url(#oh-upright-piano-g3)"
    />
    {/* front-left face detail, drawn flat then laid onto the face plane */}
    <g transform={PIANO_FACE}>
      {/* wood grain + lower panel moulding */}
      <path d={PIANO_GRAIN_A} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
      <path d={PIANO_GRAIN_B} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.25} />
      <rect x={6.5} y={-21} width={47} height={15.5} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.5} />
      {/* fallboard shadow line above the keys */}
      <rect x={3} y={-34.2} width={54} height={1.3} fill={WALNUT_DEEP} />
      {/* paper keybed strip */}
      <rect x={3} y={-33} width={54} height={6.4} fill={shade(PAPER, -0.04)} stroke={INK} strokeWidth={SW_FINE} />
      <rect x={3.2} y={-33} width={1.6} height={6.4} fill={WALNUT_DEEP} />
      <rect x={55.2} y={-33} width={1.6} height={6.4} fill={WALNUT_DEEP} />
      {/* white key ticks + five black-key blocks */}
      <path d={PIANO_KEY_TICKS} fill="none" stroke={INK} strokeWidth={SW_HAIR} opacity={0.75} />
      {PIANO_BLACK_KEYS.map((x) => (
        <rect key={x} x={x} y={-32.8} width={4.6} height={3.3} rx={0.5} fill={INK} />
      ))}
    </g>
    {/* set-back upper cabinet, near-white light along its lit rim */}
    <g transform="translate(5 -36.5)">
      <IsoBox
        w={3}
        d={0.55}
        h={26}
        color={WALNUT}
        topFill="url(#oh-upright-piano-g1)"
        rightFill="url(#oh-upright-piano-g2)"
        leftFill="url(#oh-upright-piano-g3)"
      />
      <path d={`M ${ip(-1.5, -0.275, 26)} L ${ip(1.5, -0.275, 26)}`} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
    </g>
    {/* music stand ledge + sheet music on the cabinet front */}
    <g transform={PIANO_CAB_FACE}>
      {/* soft shadow the slab lid drops onto the cabinet front */}
      <rect x={2} y={-26} width={56} height={2.8} fill="#3a2518" opacity={0.12} />
      <path d={wobblyLine(5, -3.2, 55, -3.6, PIANO_SEED * 11, 0.4)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
      <rect x={19} y={-9.6} width={22} height={1.7} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
      <g transform="rotate(-2.5 30 -16)">
        <rect x={23.5} y={-21.5} width={13} height={12.4} fill={PAPER} stroke={INK} strokeWidth={SW_FINE} />
        <path
          d="M 25.5 -19 L 34.8 -19 M 25.5 -16.6 L 34.8 -16.6 M 25.5 -14.2 L 34.8 -14.2 M 25.5 -11.8 L 31.8 -11.8"
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
          strokeDasharray="1.8 1.1"
        />
      </g>
    </g>
    {/* slab lid: varnished flat with a lit far edge */}
    <g transform="translate(5 -62.5)">
      <path d={PIANO_LID.left} fill={shade(WALNUT, FACE_LEFT)} />
      <path d={PIANO_LID.right} fill={shade(WALNUT, FACE_RIGHT)} />
      <path d={PIANO_LID.top} fill="url(#oh-upright-piano-g1)" />
      <path d={PIANO_LID.outline} fill="none" stroke={INK} strokeWidth={SW} />
      <path d={`M ${ip(-1.54, -0.31, 3)} L ${ip(1.54, -0.31, 3)}`} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.5} />
      <path d={isoDiamond(2.78, 0.44, 3)} fill="none" stroke={shade(WALNUT, 0.3)} strokeWidth={0.8} opacity={0.45} />
    </g>
    {/* two brass pedals at the toe, catching the light */}
    <g transform="translate(-16.6 4.2)">
      <ellipse cx={0} cy={1.6} rx={3} ry={1} fill="#3a2518" opacity={0.13} />
      <rect x={-2.2} y={-1} width={4.4} height={2} rx={1} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M -1.6 -0.5 L 1.4 -0.5" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.5} />
    </g>
    <g transform="translate(-9.2 7.9)">
      <ellipse cx={0} cy={1.6} rx={3} ry={1} fill="#3a2518" opacity={0.13} />
      <rect x={-2.2} y={-1} width={4.4} height={2} rx={1} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M -1.6 -0.5 L 1.4 -0.5" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.5} />
    </g>
  </g>
);

/* ══ Guitar stand — 1×1, ~46px ═════════════════════════════════
 * An oak-bodied acoustic resting on a slim ink wire stand, leaning back
 * just enough to trust it. */

const GUITAR_SEED = seedFrom('oh-guitar-stand');
const GUITAR_BODY =
  'M 0 -3 C 6.3 -3 10.2 -6.9 10.2 -12.3 C 10.2 -16.2 7.8 -18.2 5.5 -19.5 ' +
  'C 4.1 -20.3 4.1 -21.1 5.1 -22.3 C 6.7 -24.1 7.2 -26.7 5.5 -29 ' +
  'C 3.7 -31.4 -3.7 -31.4 -5.5 -29 C -7.2 -26.7 -6.7 -24.1 -5.1 -22.3 ' +
  'C -4.1 -21.1 -4.1 -20.3 -5.5 -19.5 C -7.8 -18.2 -10.2 -16.2 -10.2 -12.3 ' +
  'C -10.2 -6.9 -6.3 -3 0 -3 Z';

export const GuitarStandArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? MIRROR : undefined} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-guitar-stand-g1" x1="0.85" y1="0" x2="0.15" y2="1">
        <stop offset="0" stopColor={shade(OAK, 0.16)} />
        <stop offset="1" stopColor={shade(OAK, -0.1)} />
      </linearGradient>
    </defs>
    {/* grounding shadow */}
    <ellipse cx={0} cy={1.5} rx={11.5} ry={3.7} fill="#3a2518" opacity={0.13} />
    {/* wire stand: back post first, guitar hides its middle */}
    <path d="M 5.8 1.8 L 1.6 -24" fill="none" stroke={INK} strokeWidth={1.5} />
    {/* the guitar, tilted back on the cradle */}
    <g transform="rotate(-8 0 -2)">
      <path d={GUITAR_BODY} fill="url(#oh-guitar-stand-g1)" stroke={INK} strokeWidth={SW} />
      {/* edge light along the upper-right bout */}
      <path d="M 8.9 -8.2 C 9.9 -10.4 9.7 -13.4 8.5 -15.6" fill="none" stroke={shade(OAK, 0.4)} strokeWidth={1} opacity={0.85} />
      <path d="M 4.6 -27.9 C 5.6 -26.5 5.7 -24.9 4.9 -23.6" fill="none" stroke="#fff6e6" strokeWidth={0.8} opacity={0.45} />
      {/* soundhole + inner-lip shadow + rosette */}
      <circle cx={0} cy={-16.2} r={3.4} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_FINE} />
      <path d="M -2.5 -18.3 A 3.4 3.4 0 0 1 2.5 -18.3" fill="none" stroke="#3a2518" strokeWidth={1.1} opacity={0.35} />
      <circle cx={0} cy={-16.2} r={4.3} fill="none" stroke={INK_GOLD} strokeWidth={SW_HAIR} opacity={0.9} />
      {/* bridge + its soft drop onto the soundboard */}
      <path d="M -3.2 -7.5 L 3 -7.5" fill="none" stroke="#3a2518" strokeWidth={1.2} opacity={0.14} />
      <rect x={-3.4} y={-9.6} width={6.8} height={1.7} rx={0.7} fill={WALNUT} stroke={INK} strokeWidth={SW_HAIR} />
      {/* neck-heel shadow falling down-left onto the shoulder */}
      <path d="M -2.1 -29.9 Q -3.2 -27.8 -2.6 -25.9" fill="none" stroke="#3a2518" strokeWidth={1.3} opacity={0.12} />
      {/* walnut neck, three frets, headstock */}
      <path d="M -1.8 -30.6 L 1.8 -30.6 L 1.4 -43.4 L -1.4 -43.4 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
      <path d="M -1.6 -33.8 L 1.6 -33.8 M -1.5 -37 L 1.5 -37 M -1.5 -40.2 L 1.5 -40.2" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <path d="M -1.4 -43.4 L 1.4 -43.4 L 2.2 -48 L -2.2 -48 Z" fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_FINE} />
      <circle cx={-1.5} cy={-45} r={0.55} fill={BRASS} />
      <circle cx={1.5} cy={-45.6} r={0.55} fill={BRASS} />
      <circle cx={-1.6} cy={-47} r={0.55} fill={BRASS} />
      <circle cx={1.7} cy={-45.8} r={0.28} fill="#fff3dc" opacity={0.85} />
      {/* three brass string hairlines, bridge to nut */}
      <path d="M -0.9 -9.8 L -0.7 -43.2" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.4} opacity={0.9} />
      <path d="M 0 -9.8 L 0 -43.2" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.4} opacity={0.9} />
      <path d="M 0.9 -9.8 L 0.7 -43.2" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.4} opacity={0.9} />
      {/* faint grain across the lower bout */}
      <path d={wobblyLine(-7.5, -7.6, 7.5, -7.2, GUITAR_SEED * 5, 0.3)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
      <path d={wobblyLine(-6.4, -11.9, 6.6, -11.4, GUITAR_SEED * 9, 0.3)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.22} />
    </g>
    {/* wire legs + cradle arms in front */}
    <path d="M -8.2 3 L -2.6 -7.2 M 6.8 4.6 L 1.2 -6.6" fill="none" stroke={INK} strokeWidth={1.4} />
    <path d="M -5.4 -6.6 Q -3.8 -3.6 -1 -4.4 M 4.8 -5.4 Q 3 -2.8 0.6 -3.8" fill="none" stroke={INK} strokeWidth={1.2} />
    <path d="M -8.8 3.4 L -7.6 4 M 6.2 5 L 7.4 5.4" fill="none" stroke={INK} strokeWidth={1.6} />
  </g>
);

/* ══ Vinyl crate — 1×1 kraft crate, ~16px ══════════════════════
 * Eight sleeves standing in a slatted crate, two leaning out to be read. */

const CRATE_SEED = seedFrom('oh-vinyl-crate');
const CRATE_FACES = isoBoxFaces(0.85, 0.6, 14);
const CRATE_MOUTH = isoDiamond(0.71, 0.46, 14);
const CRATE_GRAIN_R = wobblyLine(4, -1, 13.5, -5.8, CRATE_SEED * 5, 0.3);
const CRATE_GRAIN_L = wobblyLine(-13.5, -4.2, -4, 0.6, CRATE_SEED * 7, 0.3);
const CRATE_SPINE_COLORS = [WINE, SAGE, PLUM_HEATHER, ROSE, WINE_DEEP, SAGE, ROSE, PLUM_HEATHER];
const CRATE_SLEEVES = Array.from({ length: 8 }, (_, i) => {
  const c = -0.28 + i * 0.076;
  const lean = i === 2 || i === 7;
  const h = lean ? 6.2 + seedFrom(`oh-crate-h${i}`) * 1.8 : 2 + seedFrom(`oh-crate-h${i}`) * 2.4;
  const tc = c + (lean ? 0.085 : 0.014);
  return {
    d: `M ${ip(c, -0.19, 13)} L ${ip(c, 0.19, 13)} L ${ip(tc, 0.19, 13 + h)} L ${ip(tc, -0.19, 13 + h)} Z`,
    top: `M ${ip(tc, -0.19, 13 + h)} L ${ip(tc, 0.19, 13 + h)}`,
    lx: ipx(tc, -0.02),
    ly: ipy(tc, -0.02, 13 + h - 2.2),
    color: CRATE_SPINE_COLORS[i],
    lean,
  };
});

export const VinylCrateArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? MIRROR : undefined} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-vinyl-crate-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(KRAFT, FACE_RIGHT + 0.06)} />
        <stop offset="1" stopColor={shade(KRAFT, FACE_RIGHT - 0.07)} />
      </linearGradient>
      <linearGradient id="oh-vinyl-crate-g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(KRAFT, FACE_LEFT + 0.05)} />
        <stop offset="1" stopColor={shade(KRAFT, FACE_LEFT - 0.07)} />
      </linearGradient>
    </defs>
    {/* grounding shadow */}
    <ellipse cx={0} cy={1.5} rx={13.3} ry={4.3} fill="#3a2518" opacity={0.13} />
    {/* crate walls (graded toward the floor) + slat grain + dark interior */}
    <path d={CRATE_FACES.left} fill="url(#oh-vinyl-crate-g2)" />
    <path d={CRATE_FACES.right} fill="url(#oh-vinyl-crate-g1)" />
    <path d={CRATE_GRAIN_L} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.25} />
    <path d={CRATE_GRAIN_R} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
    <path d={CRATE_MOUTH} fill={shade(KRAFT_SHADE, -0.38)} />
    {/* interior self-shadow hugging the lit-side inner wall */}
    <path d={`M ${ip(-0.3, -0.21, 13.6)} L ${ip(0.3, -0.21, 13.6)}`} fill="none" stroke="#3a2518" strokeWidth={2} opacity={0.3} />
    {/* the records, back to front */}
    {CRATE_SLEEVES.map((s, i) => (
      <g key={i}>
        <path d={s.d} fill={shade(s.color, -0.12)} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
        <path d={s.top} fill="none" stroke={shade(s.color, 0.28)} strokeWidth={0.7} opacity={0.9} />
        {s.lean && (
          <circle cx={s.lx} cy={s.ly} r={0.9} fill={PAPER} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
        )}
      </g>
    ))}
    {/* rim + slat gaps + handle slot */}
    <path d={CRATE_FACES.outline} fill="none" stroke={INK} strokeWidth={SW} />
    <path d={`M ${ip(-0.425, 0.3, 4.6)} L ${ip(0.425, 0.3, 4.6)}`} fill="none" stroke={shade(KRAFT, -0.42)} strokeWidth={1} opacity={0.55} />
    <path d={`M ${ip(-0.425, 0.3, 9.2)} L ${ip(0.425, 0.3, 9.2)}`} fill="none" stroke={shade(KRAFT, -0.42)} strokeWidth={1} opacity={0.55} />
    <path d={`M ${ip(0.425, -0.3, 4.6)} L ${ip(0.425, 0.3, 4.6)}`} fill="none" stroke={shade(KRAFT, -0.42)} strokeWidth={1} opacity={0.45} />
    <path d={`M ${ip(0.425, -0.3, 9.2)} L ${ip(0.425, 0.3, 9.2)}`} fill="none" stroke={shade(KRAFT, -0.42)} strokeWidth={1} opacity={0.45} />
    <path d={`M ${ip(0.425, -0.07, 10.6)} L ${ip(0.425, 0.07, 10.6)}`} fill="none" stroke={WALNUT_DEEP} strokeWidth={2.2} />
    {/* lit front rim edge + near-white light on the east rim */}
    <path d={`M ${ip(-0.425, 0.3, 14)} L ${ip(0.425, 0.3, 14)}`} fill="none" stroke={shade(KRAFT, 0.38)} strokeWidth={1} opacity={0.8} />
    <path d={`M ${ip(0.425, -0.3, 14)} L ${ip(0.425, 0.3, 14)}`} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.42} />
  </g>
);

/* ══ Book stack — surface item, ~10px ══════════════════════════
 * Four cloth-bound books, page edges catching the light, the top one set
 * down slightly askew with brass reading glasses resting on it. */

interface BookProps {
  w: number;
  d: number;
  h: number;
  color: string;
}

const Book = ({ w, d, h, color }: BookProps): React.JSX.Element => {
  const f = isoBoxFaces(w, d, h);
  const ex = (w + d) * (TILE_W / 4);
  const ey = (w - d) * (TILE_H / 4);
  const sx = (w - d) * (TILE_W / 4);
  const sy = (w + d) * (TILE_H / 4);
  const page = (t: number): string =>
    `M ${ex.toFixed(1)} ${(ey - h * t).toFixed(1)} L ${sx.toFixed(1)} ${(sy - h * t).toFixed(1)}`;
  return (
    <g>
      <path d={f.left} fill={shade(color, FACE_LEFT)} />
      <path d={f.right} fill={shade(PAPER, -0.06)} />
      <path d={`${page(0.35)} ${page(0.65)}`} fill="none" stroke={PAPER_SHADE} strokeWidth={SW_HAIR} />
      <path d={f.top} fill={shade(color, FACE_TOP)} />
      <path d={f.outline} fill="none" stroke={INK} strokeWidth={SW_FINE} />
    </g>
  );
};

export const BookStackArt = (_: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    {/* grounding shadow — small, surface-item language */}
    <ellipse cx={0} cy={0.8} rx={7.2} ry={2.5} fill="#3a2518" opacity={0.1} />
    <Book w={0.5} d={0.36} h={2.7} color={WINE} />
    {/* gilt title ticks on the bottom spine */}
    <path d="M -6.8 -1.3 L -5.2 -0.5 M -4.4 -0.9 L -2.8 -0.1" fill="none" stroke={SEAT_GOLD} strokeWidth={0.5} opacity={0.75} />
    <g transform="translate(0.7 -2.7)">
      <ellipse cx={-0.4} cy={0.5} rx={6.6} ry={2.1} fill="#3a2518" opacity={0.12} />
      <Book w={0.46} d={0.33} h={2.4} color={SAGE} />
    </g>
    <g transform="translate(-0.8 -5.1)">
      <ellipse cx={-0.4} cy={0.5} rx={6.2} ry={2} fill="#3a2518" opacity={0.12} />
      <Book w={0.43} d={0.31} h={2.3} color={PLUM_HEATHER} />
    </g>
    {/* top book, set down slightly rotated, rim catching the light */}
    <g transform="translate(0.4 -7.4) rotate(-9)">
      <ellipse cx={-0.4} cy={0.5} rx={5.8} ry={1.9} fill="#3a2518" opacity={0.12} />
      <Book w={0.4} d={0.28} h={2.2} color={KRAFT} />
      <path d={`M ${ip(-0.2, -0.14, 2.2)} L ${ip(0.2, -0.14, 2.2)}`} fill="none" stroke="#fff6e6" strokeWidth={0.8} opacity={0.4} />
    </g>
    {/* brass wire reading glasses resting on top */}
    <g transform="translate(0.2 -10.4)" fill="none">
      <ellipse cx={-2.3} cy={0} rx={2} ry={1.15} stroke={BRASS} strokeWidth={0.7} />
      <ellipse cx={2.3} cy={-0.3} rx={2} ry={1.15} stroke={BRASS} strokeWidth={0.7} />
      <path d="M -0.6 -0.1 Q 0 -0.9 0.6 -0.3" stroke={BRASS} strokeWidth={0.6} />
      <path d="M 4.3 -0.4 Q 6.6 -1 7.6 0.1" stroke={BRASS} strokeWidth={0.55} />
      <path d="M -3.6 -0.7 A 2 1.15 0 0 1 -2.2 -1.15" stroke={BRASS_BRIGHT} strokeWidth={0.4} opacity={0.9} />
      <path d="M 1 -1 A 2 1.15 0 0 1 2.4 -1.45" stroke={BRASS_BRIGHT} strokeWidth={0.4} opacity={0.9} />
    </g>
  </g>
);

/* ══ Desk globe — surface item, ~18px ══════════════════════════ */

export const GlobeArt = (_: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-globe-g1" x1="0.85" y1="0.1" x2="0.15" y2="0.95">
        <stop offset="0" stopColor={shade(LINEN, 0.24)} />
        <stop offset="1" stopColor={shade(LINEN, -0.16)} />
      </linearGradient>
    </defs>
    {/* walnut foot on its grounding shadow, rim catching the light */}
    <ellipse cx={0} cy={0.5} rx={4.4} ry={1.6} fill="#3a2518" opacity={0.1} />
    <ellipse cx={0} cy={0} rx={3.6} ry={1.6} fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -2.5 -1 A 3.6 1.6 0 0 1 2.4 -1.1" fill="none" stroke={shade(WALNUT, 0.35)} strokeWidth={0.6} opacity={0.8} />
    <ellipse cx={-0.8} cy={-0.3} rx={2.1} ry={0.8} fill="#3a2518" opacity={0.12} />
    <rect x={-0.7} y={-3.3} width={1.4} height={2.8} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
    {/* the sphere: linen seas, sage lands, soft meridians */}
    <circle cx={0} cy={-10} r={6.2} fill="url(#oh-globe-g1)" stroke={INK} strokeWidth={SW_FINE} />
    {/* core shadow hugging the dark limb + one paper-bright glint */}
    <path d="M -5.6 -10 A 5.6 5.6 0 0 0 0.9 -4.5" fill="none" stroke="#3a2518" strokeWidth={1.6} opacity={0.1} />
    <path d="M 2.8 -14.8 A 5.6 5.6 0 0 1 5.3 -11.9" fill="none" stroke="#fff6e6" strokeWidth={0.9} opacity={0.45} />
    <path
      d="M -3.4 -12.6 C -2 -14.3 0.7 -13.9 1.5 -12.4 C 2.4 -10.8 0.8 -9.9 -0.9 -10.2 C -2.7 -10.5 -4.2 -11.5 -3.4 -12.6 Z"
      fill={SAGE}
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      opacity={0.95}
    />
    <path
      d="M 1.2 -7.9 C 2.4 -8.9 4.1 -8.4 4.3 -7.2 C 4.5 -6.1 2.9 -5.4 1.7 -6 C 0.8 -6.5 0.5 -7.3 1.2 -7.9 Z"
      fill={SAGE_DEEP}
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      opacity={0.9}
    />
    {/* tilted axis: meridians + equator + brass semicircle arm */}
    <g transform="rotate(20 0 -10)">
      <ellipse cx={0} cy={-10} rx={2.3} ry={6.2} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.5} />
      <ellipse cx={0} cy={-10} rx={4.5} ry={6.2} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.35} />
      <ellipse cx={0} cy={-10} rx={6.2} ry={2.1} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.4} />
      <path d="M 0 -2.6 A 7.4 7.4 0 0 1 0 -17.4" fill="none" stroke={BRASS} strokeWidth={1.2} />
      <path d="M 0.9 -3.6 A 6.6 6.6 0 0 1 0.9 -16.4" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.45} opacity={0.9} />
      <circle cx={0} cy={-17.4} r={0.8} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={0.25} cy={-17.65} r={0.3} fill="#fff3dc" opacity={0.85} />
      <circle cx={0} cy={-2.6} r={0.8} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
    </g>
  </g>
);

/* ══ Telescope — 1×1, ~60px ════════════════════════════════════
 * A brass refractor on a walnut tripod, nosed up toward a window. */

const TELE_SEED = seedFrom('oh-telescope');

export const TelescopeArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? MIRROR : undefined} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-telescope-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={BRASS_BRIGHT} />
        <stop offset="1" stopColor={shade(BRASS, -0.26)} />
      </linearGradient>
    </defs>
    {/* feet grounding shadows */}
    <ellipse cx={-10} cy={4} rx={3} ry={1.1} fill="#3a2518" opacity={0.13} />
    <ellipse cx={10.5} cy={2} rx={3} ry={1.1} fill="#3a2518" opacity={0.13} />
    <ellipse cx={3} cy={-6.4} rx={2.6} ry={1} fill="#3a2518" opacity={0.1} />
    {/* back leg first, then the near pair */}
    <path d="M -0.6 -37.6 L 1.4 -37.8 L 4.4 -7.2 L 1.8 -6.9 Z" fill={shade(WALNUT, FACE_LEFT)} stroke={INK} strokeWidth={SW_HAIR} />
    <path d="M -1.4 -38 L -3.3 -37.3 L -11.4 3.2 L -8.8 3.9 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M 1.4 -38 L 3.3 -37.3 L 11.8 1.2 L 9.2 1.9 Z" fill={shade(WALNUT, FACE_RIGHT)} stroke={INK} strokeWidth={SW_FINE} />
    {/* grain running down the near legs */}
    <path d={wobblyLine(-2.9, -33, -9.6, 0.8, TELE_SEED * 3, 0.35)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
    <path d={wobblyLine(2.9, -33, 10, -1.4, TELE_SEED * 5, 0.35)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
    {/* spreader ticks */}
    <path d="M -6.6 -14 L 3.1 -16.6 M 3.1 -16.6 L 7.7 -13.4" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.6} />
    {/* saddle under the tube, wearing the tube's shadow */}
    <path d="M -2.4 -37 L 2.4 -37 L 1.6 -34 L -1.6 -34 Z" fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
    <path d="M -1.9 -36.4 L 1.4 -36.4" fill="none" stroke="#3a2518" strokeWidth={1.2} opacity={0.16} />
    {/* the tube, angled up toward the window light */}
    <g transform="translate(0 -40) rotate(-32)">
      <path d="M -9 -2.1 L 17 -3.1 L 17 3.1 L -9 2.1 Z" fill="url(#oh-telescope-g1)" stroke={INK} strokeWidth={SW_FINE} />
      <path d="M 17 -3.3 L 20.5 -3.5 L 20.5 3.5 L 17 3.3 Z" fill={shade(BRASS, -0.2)} stroke={INK} strokeWidth={SW_FINE} />
      <ellipse cx={20.6} cy={0} rx={0.9} ry={3.4} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
      <ellipse cx={20.5} cy={-1.2} rx={0.35} ry={1} fill="#fff3dc" opacity={0.55} />
      {/* mount collar + eyepiece + tiny eye cup */}
      <path d="M 2 -2.5 L 4.2 -2.6 L 4.2 2.6 L 2 2.5 Z" fill={shade(BRASS, -0.34)} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M -9 -1.3 L -12 -1.1 L -12 1.1 L -9 1.3 Z" fill={shade(BRASS, -0.28)} stroke={INK} strokeWidth={SW_FINE} />
      <circle cx={-12.6} cy={0} r={0.9} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
      {/* focus knob + long specular down the tube, with a hot core */}
      <circle cx={1} cy={3.3} r={1.1} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={1.35} cy={2.95} r={0.3} fill="#fff3dc" opacity={0.8} />
      <path d="M -7.8 -1.5 L 16.2 -2.4" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.7} opacity={0.95} />
      <path d="M 8.6 -2.1 L 15.4 -2.35" fill="none" stroke="#fff3dc" strokeWidth={0.45} opacity={0.8} />
    </g>
    {/* hinge hub with a brass glint */}
    <circle cx={0} cy={-38.2} r={1.9} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
    <path d="M -1.1 -39.2 A 1.9 1.9 0 0 1 1 -39.4" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.5} opacity={0.9} />
  </g>
);

/* ══ Persian rug — 3×2 tiles, flat (~2px pile) ═════════════════
 * Heirloom: wine field, gold border bands, a layered diamond medallion
 * with pendant hooks, corner motifs, and linen fringe on the short ends. */

const PR_SEED = seedFrom('oh-persian-rug');
const PR_LIFT = 1.6;
const PR_UNDER = isoDiamond(3, 2);
const PR_TOP = isoDiamond(3, 2, PR_LIFT);
const PR_BAND = isoDiamond(2.72, 1.72, PR_LIFT);
const PR_GUIDE_OUT = isoDiamond(2.94, 1.94, PR_LIFT);
const PR_GUIDE_IN = isoDiamond(2.48, 1.48, PR_LIFT);
const PR_EDGE_LIGHT = `M ${ip(-1.5, 1, PR_LIFT)} L ${ip(-1.5, -1, PR_LIFT)} L ${ip(1.5, -1, PR_LIFT)}`;
const PR_CORNERS: Array<[number, number]> = [[1.06, 0.62], [1.06, -0.62], [-1.06, 0.62], [-1.06, -0.62]];
const PR_HOOKS = PR_CORNERS.map(([c, r]) => {
  const sc = c > 0 ? 1 : -1;
  const sr = r > 0 ? 1 : -1;
  const hc = c * 0.62;
  const hr = r * 0.62;
  return `M ${ip(hc - sc * 0.12, hr, PR_LIFT)} L ${ip(hc, hr, PR_LIFT)} L ${ip(hc, hr - sr * 0.12, PR_LIFT)}`;
}).join(' ');
const PR_FRINGE = Array.from({ length: 9 }, (_, i) => {
  const r = -0.88 + i * 0.22;
  return `M ${ip(1.5, r, 1)} L ${ip(1.68, r, 0.2)} M ${ip(-1.5, r, 1)} L ${ip(-1.68, r, 0.2)}`;
}).join(' ');
const PR_WEAVE = Array.from({ length: 14 }, (_, i) => {
  const c = -1.15 + seedFrom(`oh-pr-wc${i}`) * 2.3;
  const r = -0.72 + seedFrom(`oh-pr-wr${i}`) * 1.44;
  return `M ${ip(c, r, PR_LIFT)} L ${ip(c + 0.07, r, PR_LIFT)}`;
}).join(' ');
/* abrash — dye-lot bands drifting the long way across the field */
const PR_ABRASH_A = wobblyLine(-18, -15.6, 28, 7.4, PR_SEED * 19, 0.6);
const PR_ABRASH_B = wobblyLine(-32.4, -9.4, 12.6, 13.1, PR_SEED * 23, 0.6);

export const PersianRugArt = (_: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-persian-rug-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(WINE, -0.05)} />
        <stop offset="1" stopColor={shade(WINE, 0.07)} />
      </linearGradient>
    </defs>
    {/* pile edge underneath, then the woven face graded toward the light */}
    <path d={PR_UNDER} fill={WINE_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    <path d={PR_TOP} fill="url(#oh-persian-rug-g1)" stroke={INK} strokeWidth={SW_FINE} />
    <path d={PR_ABRASH_A} fill="none" stroke={shade(WINE, -0.14)} strokeWidth={2.4} opacity={0.18} />
    <path d={PR_ABRASH_B} fill="none" stroke={shade(WINE, -0.14)} strokeWidth={2.4} opacity={0.14} />
    {/* gold border band + hairline guard stripes */}
    <path d={PR_BAND} fill="none" stroke={INK_GOLD} strokeWidth={3} opacity={0.95} />
    <path d={PR_GUIDE_OUT} fill="none" stroke={SEAT_GOLD} strokeWidth={0.6} opacity={0.9} />
    <path d={PR_GUIDE_IN} fill="none" stroke={SEAT_GOLD} strokeWidth={0.6} opacity={0.9} />
    {/* corner motifs */}
    {PR_CORNERS.map(([c, r], i) => (
      <path key={i} d={dia(c, r, 0.1, 0.1, PR_LIFT)} fill={INK_GOLD} stroke={WINE_DEEP} strokeWidth={SW_HAIR} />
    ))}
    {/* central medallion, layered like a pressed seal on its soft shadow */}
    <path d={dia(0.035, 0.055, 0.5, 0.5, PR_LIFT)} fill="#3a2518" opacity={0.1} />
    <path d={dia(0, 0, 0.5, 0.5, PR_LIFT)} fill={INK_GOLD} stroke={WINE_DEEP} strokeWidth={SW_HAIR} />
    <path d={dia(0, 0, 0.32, 0.32, PR_LIFT)} fill={WINE_DEEP} />
    <path d={dia(0, 0, 0.16, 0.16, PR_LIFT)} fill={SEAT_GOLD} />
    <ellipse cx={0} cy={-PR_LIFT} rx={1.3} ry={0.65} fill={LINEN} stroke={WINE_DEEP} strokeWidth={SW_HAIR} />
    {/* pendant diamonds + hook ticks */}
    <path d={dia(0.74, 0, 0.09, 0.09, PR_LIFT)} fill={INK_GOLD} />
    <path d={dia(-0.74, 0, 0.09, 0.09, PR_LIFT)} fill={INK_GOLD} />
    <path d={dia(0, 0.72, 0.08, 0.08, PR_LIFT)} fill={INK_GOLD} />
    <path d={dia(0, -0.72, 0.08, 0.08, PR_LIFT)} fill={INK_GOLD} />
    <path d={PR_HOOKS} fill="none" stroke={SEAT_GOLD} strokeWidth={SW_HAIR} opacity={0.9} />
    {/* weave ticks + lit far edges + fringe on the short ends */}
    <path d={PR_WEAVE} fill="none" stroke={LINEN} strokeWidth={SW_HAIR} opacity={0.18} />
    <path d={PR_EDGE_LIGHT} fill="none" stroke={shade(WINE, 0.32)} strokeWidth={0.8} opacity={0.8} />
    <path d={`M ${ip(-1.5, -1, PR_LIFT)} L ${ip(1.5, -1, PR_LIFT)}`} fill="none" stroke="#fff6e6" strokeWidth={0.7} opacity={0.35} />
    <path d={PR_FRINGE} fill="none" stroke={LINEN} strokeWidth={0.8} />
  </g>
);

/* ══ Round rug — 2×2 tiles, flat ═══════════════════════════════
 * A braided rose/cream/plum rug: concentric squashed rings with braid
 * dashes riding each seam. */

const RR_BANDS: Array<{ rx: number; color: string }> = [
  { rx: 37, color: ROSE },
  { rx: 30, color: CREAM_WALL },
  { rx: 23, color: PLUM_HEATHER },
  { rx: 16, color: CREAM_WALL },
  { rx: 9.5, color: ROSE_PALE },
];
const RR_BRAIDS: Array<{ rx: number; color: string }> = [
  { rx: 33.5, color: shade(ROSE, -0.28) },
  { rx: 26.5, color: shade(CREAM_WALL, -0.24) },
  { rx: 19.5, color: shade(PLUM_HEATHER, -0.28) },
  { rx: 12.7, color: shade(CREAM_WALL, -0.24) },
  { rx: 6, color: shade(ROSE_PALE, -0.24) },
];
const RR_WEAVE = Array.from({ length: 12 }, (_, i) => {
  const a = seedFrom(`oh-rr-a${i}`) * Math.PI * 2;
  const rr = 7 + seedFrom(`oh-rr-r${i}`) * 25;
  const x = Math.cos(a) * rr;
  const y = -0.7 + Math.sin(a) * rr * 0.48;
  return `M ${x.toFixed(1)} ${y.toFixed(1)} L ${(x + 1.8).toFixed(1)} ${(y + 0.5).toFixed(1)}`;
}).join(' ');

export const RoundRugArt = (_: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-round-rug-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(ROSE, -0.06)} />
        <stop offset="1" stopColor={shade(ROSE, 0.07)} />
      </linearGradient>
    </defs>
    {/* pile edge, then the braided face (outer coil graded to the light) */}
    <ellipse cx={0} cy={0.9} rx={37} ry={18.5} fill={shade(ROSE, -0.35)} stroke={INK} strokeWidth={SW_FINE} />
    {RR_BANDS.map((b, i) => (
      <ellipse
        key={i}
        cx={0}
        cy={-0.7}
        rx={b.rx}
        ry={b.rx / 2}
        fill={i === 0 ? 'url(#oh-round-rug-g1)' : b.color}
        stroke={i === 0 ? INK : INK_SOFT}
        strokeWidth={i === 0 ? SW_FINE : SW_HAIR}
      />
    ))}
    {/* braid dashes riding each seam */}
    {RR_BRAIDS.map((b, i) => (
      <ellipse
        key={i}
        cx={0}
        cy={-0.7}
        rx={b.rx}
        ry={b.rx / 2}
        fill="none"
        stroke={b.color}
        strokeWidth={0.9}
        strokeDasharray="2.8 2.2"
        opacity={0.75}
      />
    ))}
    {/* stray weave ticks + a soft top-light on the plum coil */}
    <path d={RR_WEAVE} fill="none" stroke={LINEN} strokeWidth={SW_HAIR} opacity={0.18} />
    <path d="M -19 -7.2 A 23 11.5 0 0 1 19 -7.2" fill="none" stroke={shade(PLUM_HEATHER, 0.3)} strokeWidth={0.8} opacity={0.5} />
    {/* pile self-shadow along the near rim, then the lit far rim */}
    <path d="M -30 10.1 A 37 18.5 0 0 0 30 10.1" fill="none" stroke="#3a2518" strokeWidth={1.4} opacity={0.1} />
    <path d="M -30 -11.5 A 37 18.5 0 0 1 30 -11.5" fill="none" stroke={shade(ROSE, 0.35)} strokeWidth={0.8} opacity={0.7} />
    <path d="M -26 -13.9 A 37 18.5 0 0 1 26 -13.9" fill="none" stroke="#fff6e6" strokeWidth={0.7} opacity={0.3} />
  </g>
);

/* ══ Tapestry — wall piece, ~64×80 ═════════════════════════════
 * A woven hanging on an oak rod: plum-heather field, a minimal gold
 * sun-arc over hills, linen fringe swinging at the hem. */

const TAP_SEED = seedFrom('oh-tapestry');
const TAP_FRINGE_A = Array.from({ length: 9 }, (_, i) => {
  const x = -24 + i * 6;
  const l = 8.5 + seedFrom(`oh-tap-f${i}`) * 2.5;
  return `M ${x} -11 L ${x} ${(-11 + l).toFixed(1)}`;
}).join(' ');
const TAP_FRINGE_B = Array.from({ length: 8 }, (_, i) => {
  const x = -21 + i * 6;
  const l = 8 + seedFrom(`oh-tap-g${i}`) * 2.5;
  return `M ${x} -11 L ${x} ${(-11 + l).toFixed(1)}`;
}).join(' ');
const TAP_WEAVE = Array.from({ length: 6 }, (_, i) => `M -23.5 ${-66 + i * 9} L 23.5 ${-66 + i * 9}`).join(' ');

export const TapestryArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-tapestry-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(PLUM_HEATHER, 0.07)} />
        <stop offset="1" stopColor={shade(PLUM_HEATHER, -0.07)} />
      </linearGradient>
    </defs>
    {/* oak rod with turned finials */}
    <rect x={-30} y={-80} width={60} height={3.4} rx={1.7} fill={OAK} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -28 -78.9 L 28 -78.9" fill="none" stroke="#fff6e6" strokeWidth={0.8} opacity={0.5} />
    <circle cx={-31.4} cy={-78.3} r={2.1} fill={OAK_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    <circle cx={31.4} cy={-78.3} r={2.1} fill={OAK_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    <circle cx={-30.8} cy={-79} r={0.5} fill={shade(OAK, 0.45)} opacity={0.85} />
    <circle cx={32} cy={-79} r={0.5} fill={shade(OAK, 0.45)} opacity={0.85} />
    {/* the cloth, wearing the rod's soft shadow across its shoulder */}
    <rect x={-26} y={-75} width={52} height={64} fill="url(#oh-tapestry-g1)" stroke={INK} strokeWidth={SW} />
    <rect x={-26} y={-75} width={52} height={2.6} fill="#3a2518" opacity={0.12} />
    {/* woven rows */}
    <path d={TAP_WEAVE} fill="none" stroke={LINEN} strokeWidth={SW_HAIR} strokeDasharray="1.6 2.6" opacity={0.14} />
    {/* stitched gold border */}
    <rect x={-23.5} y={-72.5} width={47} height={59} fill="none" stroke={SEAT_GOLD} strokeWidth={0.7} strokeDasharray="3 2.2" opacity={0.85} />
    {/* the motif: sun-arc over two hills, horizon thread */}
    <path d="M -20 -48 L 20 -48" fill="none" stroke={SEAT_GOLD} strokeWidth={0.8} opacity={0.8} />
    <path d="M -9 -48 A 9 9 0 0 1 9 -48 Z" fill={SEAT_GOLD} />
    <path d="M 0 -60.5 L 0 -63.5 M -7.4 -57.6 L -9.5 -59.7 M 7.4 -57.6 L 9.5 -59.7" fill="none" stroke={SEAT_GOLD} strokeWidth={0.9} />
    <path d="M -2 -13.5 L -2 -29 Q 10 -40 24 -31.5 L 24 -13.5 Z" fill={INK_GOLD} opacity={0.55} />
    <path d="M -24 -13.5 L -24 -24 Q -6 -36.5 12 -26 Q 19 -22 24 -25.5 L 24 -13.5 Z" fill={INK_GOLD} />
    {/* hem + fringe */}
    <rect x={-26} y={-12.4} width={52} height={1.6} fill={LINEN_SHADE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    <path d={TAP_FRINGE_A} fill="none" stroke={LINEN} strokeWidth={1.1} />
    <path d={TAP_FRINGE_B} fill="none" stroke={LINEN_SHADE} strokeWidth={1.1} />
    {/* hanging loops over the rod */}
    <rect x={-24} y={-80.6} width={5} height={7.2} rx={2.2} fill={PLUM_HEATHER_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
    <rect x={-2.5} y={-80.6} width={5} height={7.2} rx={2.2} fill={PLUM_HEATHER_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
    <rect x={19} y={-80.6} width={5} height={7.2} rx={2.2} fill={PLUM_HEATHER_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
    {/* faint hand-loomed wobble along the left selvedge */}
    <path d={wobblyLine(-25, -70, -25, -16, TAP_SEED * 13, 0.5)} fill="none" stroke={PLUM_HEATHER_DEEP} strokeWidth={SW_HAIR} opacity={0.4} />
  </g>
);

/* ══ Landscape frame — wall piece, ~48×36 ══════════════════════
 * A walnut frame around a miniature painted valley: dawn-gold sky,
 * layered sage hills, a wine-roofed cottage with one lit window. */

const LF_SEED = seedFrom('oh-landscape-frame');
const LF_GRAIN = wobblyLine(-21, -2.2, 21, -1.8, LF_SEED * 7, 0.4);

export const LandscapeFrameArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-landscape-frame-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(DAWN_GOLD, 0.3)} />
        <stop offset="1" stopColor={DAWN_GOLD} />
      </linearGradient>
      <linearGradient id="oh-landscape-frame-g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(WALNUT, 0.08)} />
        <stop offset="1" stopColor={shade(WALNUT, -0.08)} />
      </linearGradient>
    </defs>
    {/* walnut frame, graded down toward the floor */}
    <rect x={-24} y={-36} width={48} height={36} rx={1.2} fill="url(#oh-landscape-frame-g2)" stroke={INK} strokeWidth={SW} />
    <path d={LF_GRAIN} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.35} />
    <path d="M -22.8 -34.8 L 22.8 -34.8" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.5} />
    {/* the painting: sky, a haloed low sun, three ranks of hills */}
    <rect x={-20} y={-32} width={40} height={28} fill="url(#oh-landscape-frame-g1)" />
    <circle cx={7} cy={-22.5} r={4.8} fill={shade(DAWN_GOLD, 0.4)} opacity={0.35} />
    <circle cx={7} cy={-22.5} r={2.6} fill={shade(DAWN_GOLD, 0.45)} opacity={0.95} />
    <path d="M -20 -15.5 Q -10 -22.5 0 -17.5 Q 8 -13.8 20 -18.5 L 20 -4 L -20 -4 Z" fill={shade(SAGE, 0.25)} />
    <path d="M -20 -15.5 Q -10 -22.5 0 -17.5 Q 8 -13.8 20 -18.5" fill="none" stroke={shade(DAWN_GOLD, 0.4)} strokeWidth={0.8} opacity={0.55} />
    <path d="M -20 -12 Q -8 -18.5 4 -12.5 Q 13 -8.5 20 -12 L 20 -4 L -20 -4 Z" fill={SAGE} />
    <path d="M -20 -7 Q -4 -11.5 10 -7.5 Q 16 -6 20 -7.5 L 20 -4 L -20 -4 Z" fill={SAGE_DEEP} />
    {/* the cottage, wine-roofed, one window burning */}
    <g transform="translate(-7 -12.5)">
      <rect x={-2.5} y={-2.8} width={5} height={3.2} fill={PAPER} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <path d="M -3.1 -2.8 L 0 -5.4 L 3.1 -2.8 Z" fill={WINE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <rect x={1} y={-4.9} width={0.9} height={1.6} fill={WINE_DEEP} />
      <circle cx={-0.8} cy={-1.3} r={1.7} fill={LAMP_GOLD} opacity={0.22} />
      <rect x={-1.4} y={-1.9} width={1.2} height={1.2} fill={LAMP_GOLD} />
      <path d="M 0.8 -1.6 L 0.8 0.4" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    </g>
    {/* two far poplars */}
    <path d={softEllipse(12.5, -10.6, 1.2, 2, LF_SEED * 11)} fill={SAGE_DEEP} />
    <path d={softEllipse(15.2, -9.8, 0.9, 1.5, LF_SEED * 17)} fill={SAGE_DEEP} />
    <path d="M 12.5 -8.6 L 12.5 -7.2 M 15.2 -8.3 L 15.2 -7.2" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    {/* frame lip: inner shadow above and down the left, crisp rebate all round */}
    <path d="M -20 -31.4 L 20 -31.4" fill="none" stroke={INK} strokeWidth={1} opacity={0.18} />
    <path d="M -19.5 -31.6 L -19.5 -4.4" fill="none" stroke={INK} strokeWidth={1} opacity={0.12} />
    <rect x={-20.6} y={-32.6} width={41.2} height={29.2} fill="none" stroke={WALNUT_DEEP} strokeWidth={SW_HAIR} />
  </g>
);

/* ══ Abstract frame — wall piece, ~34×42 ═══════════════════════
 * A thin brass frame, paper ground, two bold organic shapes and one
 * confident ink arc — tasteful modern. */

const AF_SEED = seedFrom('oh-abstract-frame');
const AF_WINE_A = softEllipse(-4.5, -25.5, 7, 8.6, AF_SEED * 3);
const AF_WINE_B = softEllipse(-1.5, -20.5, 5.4, 5.8, AF_SEED * 5, 0.2);
const AF_SAGE = softEllipse(5.5, -14, 6.4, 5, AF_SEED * 7, 0.2);
/* inner crescents that turn each shape toward the light */
const AF_WINE_SHADOW = softEllipse(-6, -23.8, 5, 6.2, AF_SEED * 9);
const AF_WINE_LIGHT = softEllipse(-1.9, -29.4, 2.6, 3, AF_SEED * 11);
const AF_SAGE_SHADOW = softEllipse(4.6, -12.8, 4.9, 3.4, AF_SEED * 13, 0.2);

export const AbstractFrameArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-abstract-frame-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(PAPER, 0.03)} />
        <stop offset="1" stopColor={shade(PAPER, -0.05)} />
      </linearGradient>
    </defs>
    {/* paper ground with an ink contour + the frame's soft inner shadow */}
    <rect x={-17} y={-42} width={34} height={42} rx={0.6} fill="url(#oh-abstract-frame-g1)" stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -14.9 -39.5 L 14.9 -39.5" fill="none" stroke="#3a2518" strokeWidth={1} opacity={0.1} />
    {/* two organic shapes, wine over sage's shoulder, each turned by light */}
    <path d={AF_WINE_A} fill={WINE} />
    <path d={AF_WINE_B} fill={WINE} />
    <path d={AF_WINE_SHADOW} fill={shade(WINE, -0.16)} opacity={0.6} />
    <path d={AF_WINE_LIGHT} fill={shade(WINE, 0.14)} opacity={0.55} />
    <path d={AF_SAGE} fill={SAGE} opacity={0.95} />
    <path d={AF_SAGE_SHADOW} fill={shade(SAGE, -0.14)} opacity={0.6} />
    {/* one confident ink arc */}
    <path d="M -12 -8.5 C -6 -20 6 -34 13 -35.5" fill="none" stroke={INK} strokeWidth={SW} />
    {/* a pencil signature tick */}
    <path d="M 7 -4.5 L 12 -4.2" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeDasharray="1.6 1" />
    {/* thin brass frame: darkened underside, long specular, corner glint */}
    <rect x={-15.9} y={-40.9} width={31.8} height={39.8} fill="none" stroke={BRASS} strokeWidth={2} />
    <path d="M -15 -1.1 L 15.9 -1.1 L 15.9 -39.5" fill="none" stroke={shade(BRASS, -0.28)} strokeWidth={0.9} opacity={0.6} />
    <path d="M -15.1 -3.2 L -15.1 -40.1 L 14.6 -40.1" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.6} opacity={0.9} />
    <circle cx={14.9} cy={-40.3} r={0.6} fill="#fff3dc" opacity={0.8} />
  </g>
);

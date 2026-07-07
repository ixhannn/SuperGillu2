/**
 * OUR HOME — seating & soft things, redrawn for the 2:1 isometric room.
 *
 * Chunky Tuber-Simulator volumes built from isoBoxFaces / isoDiamond, one
 * shared light (top bright, right dim, left dark), sepia INK outlines.
 * Every component draws in local coordinates where (0,0) is the CENTRE of
 * its tile footprint on the floor plane and negative y is UP. Depth is
 * carried by same-hue face gradients, near-white rim glints and soft
 * grounding shadows — never filters or blend modes — and the INK outline
 * pass always rides on top.
 */
import type React from 'react';
import {
  INK,
  INK_SOFT,
  CREAM_WALL,
  WINE,
  ROSE,
  ROSE_PALE,
  PLUM_HEATHER,
  PLUM_HEATHER_DEEP,
  LINEN,
  LINEN_SHADE,
  OAK,
  WALNUT,
  SW,
  SW_FINE,
  SW_HAIR,
  seedFrom,
  softEllipse,
  wobblyLine,
} from '../homeArt';
import {
  isoBoxFaces,
  isoDiamond,
  shade,
  FACE_TOP,
  FACE_RIGHT,
  FACE_LEFT,
  TILE_W,
  TILE_H,
} from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/* ── Local iso helpers ───────────────────────────────────────── */

const HW = TILE_W / 2; // 20 — screen px per tile along the col axis (x)
const HH = TILE_H / 2; // 10 — screen px per tile along the col axis (y)

/** The app's shadow ink (matches the room plinth's cast-shadow language). */
const SHADOW = '#3a2518';
/** Near-white rim catch-light — the one "specular" the room allows. */
const GLINT = '#fff6e6';

/** A shaded, inked box volume — the room's basic brick.
 *  `topFill` / `rightFill` / `leftFill` let large faces carry a subtle
 *  2-stop gradient instead of the flat shade. */
const IsoBox = ({
  base, w, d, h, sw = SW, topFill, rightFill, leftFill,
}: {
  base: string; w: number; d: number; h: number; sw?: number;
  topFill?: string; rightFill?: string; leftFill?: string;
}): React.JSX.Element => {
  const f = isoBoxFaces(w, d, h);
  return (
    <g>
      <path d={f.top} fill={topFill ?? shade(base, FACE_TOP)} />
      <path d={f.right} fill={rightFill ?? shade(base, FACE_RIGHT)} />
      <path d={f.left} fill={leftFill ?? shade(base, FACE_LEFT)} />
      <path d={f.outline} fill="none" stroke={INK} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
};

/** An IsoBox whose top-face edges wear LINEN piping — upholstery language. */
const PipedBox = ({
  base, w, d, h, topFill, rightFill, leftFill,
}: {
  base: string; w: number; d: number; h: number;
  topFill?: string; rightFill?: string; leftFill?: string;
}): React.JSX.Element => {
  const f = isoBoxFaces(w, d, h);
  return (
    <g>
      <path d={f.top} fill={topFill ?? shade(base, FACE_TOP)} />
      <path d={f.right} fill={rightFill ?? shade(base, FACE_RIGHT)} />
      <path d={f.left} fill={leftFill ?? shade(base, FACE_LEFT)} />
      <path d={f.outline} fill="none" stroke={INK} strokeWidth={SW} strokeLinejoin="round" strokeLinecap="round" />
      <path d={f.top} fill="none" stroke={LINEN} strokeWidth={SW_FINE} strokeLinejoin="round" />
    </g>
  );
};

/** 1px edge light just inside the top face's north→east rim — the edge that
 *  greets the upper-right room light. Trimmed so it never wraps a corner. */
const edgeLight = (w: number, d: number, h: number): string => {
  const nx = ((d - w) * TILE_W) / 4;
  const ny = (-(w + d) * TILE_H) / 4 - h;
  const ex = ((w + d) * TILE_W) / 4;
  const ey = ((w - d) * TILE_H) / 4 - h;
  const ax = nx + (ex - nx) * 0.07;
  const ay = ny + (ey - ny) * 0.07 + 1;
  const bx = nx + (ex - nx) * 0.93;
  const by = ny + (ey - ny) * 0.93 + 1;
  return `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`;
};

/** The rim catch-light, ready to place: near-white, hairline, never loud. */
const EdgeGlint = ({
  w, d, h, opacity = 0.45,
}: { w: number; d: number; h: number; opacity?: number }): React.JSX.Element => (
  <path d={edgeLight(w, d, h)} fill="none" stroke={GLINT} strokeWidth={1} opacity={opacity} />
);

/** ONE soft grounding ellipse under a floor-standing body — the same shadow
 *  language the room's plinth casts. rx ≈ bodyHalfWidthPx × 0.92. */
const ContactShadow = ({
  rx, opacity = 0.13,
}: { rx: number; opacity?: number }): React.JSX.Element => (
  <ellipse cx={0} cy={1.5} rx={rx} ry={rx * 0.32} fill={SHADOW} opacity={opacity} />
);

/**
 * Cross-hatch inside a top-face diamond (w×d tiles at `lift` px): one family
 * of lines per diamond axis — woven rush, waffle knit, ticking weave.
 */
const diamondHatch = (w: number, d: number, lift: number, step: number): string => {
  const hc = w / 2;
  const hd = d / 2;
  let out = '';
  for (let v = -hd + step; v < hd - step / 2; v += step) {
    const u = hc * (1 - Math.abs(v) / hd) * 0.88;
    out += `M ${((-u - v) * HW).toFixed(1)} ${((-u + v) * HH - lift).toFixed(1)} L ${((u - v) * HW).toFixed(1)} ${((u + v) * HH - lift).toFixed(1)} `;
  }
  for (let u = -hc + step; u < hc - step / 2; u += step) {
    const v = hd * (1 - Math.abs(u) / hc) * 0.88;
    out += `M ${((u + v) * HW).toFixed(1)} ${((u - v) * HH - lift).toFixed(1)} L ${((u - v) * HW).toFixed(1)} ${((u + v) * HH - lift).toFixed(1)} `;
  }
  return out.trim();
};

/** One clipped line along the col axis of a top-face diamond (stripes, grain). */
const axisLine = (
  w: number, d: number, lift: number, v: number, trim = 0.84,
): { x1: number; y1: number; x2: number; y2: number } => {
  const u = (w / 2) * (1 - Math.abs(v) / (d / 2)) * trim;
  return {
    x1: (-u - v) * HW,
    y1: (-u + v) * HH - lift,
    x2: (u - v) * HW,
    y2: (u + v) * HH - lift,
  };
};

/* ── Armchair — 2×2 tiles, ~48px, facings 2 ──────────────────── */

/** Front feet peek from under the lifted body at the near corners. */
const ARMCHAIR_FEET: ReadonlyArray<readonly [number, number]> = [
  [0, -16], [32, 0], [-32, 0], [0, 16],
];

/**
 * Wine linen wingback: 2×2 seat block, tall back along the top-left (min-col)
 * edge, two arm boxes on the sides, plump piped cushion, walnut feet.
 * Facing 0 opens toward the lower-right; facing 1 mirrors.
 */
export const ArmchairArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <linearGradient id="oh-armchair-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(WINE, 0.3)} />
        <stop offset="1" stopColor={shade(WINE, 0.1)} />
      </linearGradient>
      <linearGradient id="oh-armchair-g1" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(WINE, 0.14)} />
        <stop offset="1" stopColor={shade(WINE, 0.02)} />
      </linearGradient>
      {/* vertical faces settle darker toward the floor */}
      <linearGradient id="oh-armchair-g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(WINE, FACE_RIGHT + 0.07)} />
        <stop offset="1" stopColor={shade(WINE, FACE_RIGHT - 0.07)} />
      </linearGradient>
      <linearGradient id="oh-armchair-g3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(WINE, FACE_LEFT + 0.06)} />
        <stop offset="1" stopColor={shade(WINE, FACE_LEFT - 0.06)} />
      </linearGradient>
    </defs>
    {/* one soft grounding shadow under everything */}
    <ContactShadow rx={36.8} />
    {/* walnut bun feet on the floor, far to near */}
    {ARMCHAIR_FEET.map(([fx, fy]) => (
      <g key={`${fx},${fy}`} transform={`translate(${fx} ${fy})`}>
        <IsoBox base={WALNUT} w={0.16} d={0.16} h={6} sw={SW_FINE} />
      </g>
    ))}
    {/* body rides 4px above the floor so the feet show */}
    <g transform="translate(0 -4)">
      {/* seat block, edge to edge */}
      <IsoBox
        base={WINE}
        w={2}
        d={2}
        h={16}
        topFill="url(#oh-armchair-g1)"
        rightFill="url(#oh-armchair-g2)"
        leftFill="url(#oh-armchair-g3)"
      />
      {/* linen sag lines across the lit and shaded skirts */}
      <path d="M 36 -12.6 Q 19 -3.6 4 2.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.55} />
      <path d="M -36 -12.6 Q -19 -3.6 -4 2.6" fill="none" stroke={shade(WINE, -0.42)} strokeWidth={SW_HAIR} opacity={0.7} />
      {/* wing back along the far north-west edge */}
      <g transform="translate(-14 -7)">
        <PipedBox
          base={WINE}
          w={0.6}
          d={2}
          h={44}
          rightFill="url(#oh-armchair-g2)"
          leftFill="url(#oh-armchair-g3)"
        />
        <EdgeGlint w={0.6} d={2} h={44} opacity={0.4} />
      </g>
      {/* far arm (north-east side) */}
      <g transform="translate(21 -4.5)">
        <PipedBox
          base={WINE}
          w={1.4}
          d={0.5}
          h={30}
          rightFill="url(#oh-armchair-g2)"
          leftFill="url(#oh-armchair-g3)"
        />
        <EdgeGlint w={1.4} d={0.5} h={30} opacity={0.4} />
      </g>
      {/* plump seat cushion resting between the arms */}
      <g transform="translate(6 -13)">
        {/* occlusion where the cushion sinks against the seat */}
        <path d={isoDiamond(1.42, 1.02, 0)} fill={SHADOW} opacity={0.13} stroke="none" />
        <PipedBox base={shade(WINE, 0.18)} w={1.35} d={0.95} h={7} topFill="url(#oh-armchair-g0)" />
        {/* crease shadow where the cushion tucks against the wing back */}
        <path d="M -23 -9 L -4 -18.5 L 1.9 -15.5 L -17.1 -6 Z" fill={SHADOW} opacity={0.1} stroke="none" />
        {/* plump sheen pooling toward the window light */}
        <path
          d={softEllipse(4.5, -10, 8.5, 3.2, seedFrom('oh-armchair-plump'), 0.18)}
          fill={LINEN}
          opacity={0.25}
        />
        {/* barely-there ticking weave across the crown */}
        <path
          d={diamondHatch(1.05, 0.72, 7, 0.16)}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
          opacity={0.12}
        />
        <EdgeGlint w={1.35} d={0.95} h={7} opacity={0.5} />
        {/* a sat-in dimple and two wrinkle ticks */}
        <path d="M -3.4 -8.8 Q 0 -7.4 3.4 -8.8" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.8} />
        <path d="M 15 -5.4 Q 12.4 -3.8 10.2 -4.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.6} />
      </g>
      {/* near arm (south-west side) */}
      <g transform="translate(-9 10.5)">
        <PipedBox
          base={WINE}
          w={1.4}
          d={0.5}
          h={30}
          rightFill="url(#oh-armchair-g2)"
          leftFill="url(#oh-armchair-g3)"
        />
        <EdgeGlint w={1.4} d={0.5} h={30} opacity={0.45} />
      </g>
    </g>
  </g>
);

/* ── Spindle chair — 1×1 tile, ~42px, facings 2 ──────────────── */

/** Spindle grooves carved into the backrest's front (lower-right) face. */
const SPINDLE_TS: readonly number[] = [0.28, 0.5, 0.72];
const SPINDLE_LINES = SPINDLE_TS
  .map((t) => {
    const x = 12.2 - TILE_W * t;
    const yb = -3.9 + TILE_H * t - 20;
    return `M ${x.toFixed(1)} ${yb.toFixed(1)} L ${x.toFixed(1)} ${(yb - 16).toFixed(1)}`;
  })
  .join(' ');

/** Honey oak block seat, thin tall backrest with three spindle lines, rush top. */
export const SpindleChairArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <linearGradient id="oh-spindle-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(OAK, 0.2)} />
        <stop offset="1" stopColor={shade(OAK, 0.03)} />
      </linearGradient>
      {/* vertical faces darken toward the floor — end-grain reads deeper */}
      <linearGradient id="oh-spindle-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(OAK, FACE_RIGHT + 0.06)} />
        <stop offset="1" stopColor={shade(OAK, FACE_RIGHT - 0.07)} />
      </linearGradient>
      <linearGradient id="oh-spindle-g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(OAK, FACE_LEFT + 0.05)} />
        <stop offset="1" stopColor={shade(OAK, FACE_LEFT - 0.07)} />
      </linearGradient>
    </defs>
    {/* one soft grounding shadow at the floor contact */}
    <ContactShadow rx={18.4} />
    {/* chunky seat block */}
    <IsoBox
      base={OAK}
      w={1}
      d={1}
      h={16}
      topFill="url(#oh-spindle-g0)"
      rightFill="url(#oh-spindle-g1)"
      leftFill="url(#oh-spindle-g2)"
    />
    <EdgeGlint w={1} d={1} h={16} opacity={0.45} />
    {/* hand-wobbled grain whispers on the lit right face */}
    <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.32}>
      <path d={wobblyLine(14, -8.6, 5, -4.1, seedFrom('oh-spindle-grain-a') * 89, 0.5)} />
      <path d={wobblyLine(11.5, -3.7, 4.5, -0.2, seedFrom('oh-spindle-grain-b') * 89, 0.5)} />
    </g>
    {/* a varnish sheen down the lit right face */}
    <path d="M 17 -13.3 Q 10.5 -9.6 4 -6.8" fill="none" stroke={shade(OAK, 0.28)} strokeWidth={SW_FINE} opacity={0.75} />
    {/* woven rush pad on the seat top, nudged toward the open side */}
    <g transform="translate(2 1)">
      {/* press shadow seating the pad into the block */}
      <path d={isoDiamond(0.8, 0.8, 16.4)} fill={SHADOW} opacity={0.1} stroke="none" />
      <path d={isoDiamond(0.72, 0.72, 17)} fill={LINEN} stroke={INK_SOFT} strokeWidth={SW_FINE} />
      <path d={diamondHatch(0.62, 0.62, 17, 0.155)} fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR} />
    </g>
    {/* backrest along the far north-west edge */}
    <g transform="translate(-7.8 -3.9)">
      <IsoBox
        base={OAK}
        w={0.22}
        d={1}
        h={40}
        rightFill="url(#oh-spindle-g1)"
        leftFill="url(#oh-spindle-g2)"
      />
      {/* long grain riding the backrest's front face, behind the grooves */}
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.28}>
        <path d={wobblyLine(10.5, -32, -6, -23.8, seedFrom('oh-spindle-grain-c') * 89, 0.45)} />
        <path d={wobblyLine(11, -18, -6.5, -9.3, seedFrom('oh-spindle-grain-d') * 89, 0.45)} />
      </g>
      <path d={SPINDLE_LINES} fill="none" stroke={INK_SOFT} strokeWidth={SW_FINE} />
      <EdgeGlint w={0.22} d={1} h={40} opacity={0.5} />
    </g>
  </g>
);

/* ── Floor cushion — 1×1 tile, ~8px, facings 1 ───────────────── */

/** Squat rose cushion: dark under-wedge, ticking stripes, one honest dimple. */
export const FloorCushionArt = (_props: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-cushion-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(ROSE, 0.26)} />
        <stop offset="1" stopColor={shade(ROSE, 0.03)} />
      </linearGradient>
    </defs>
    {/* one soft grounding shadow hugging the floor contact */}
    <ContactShadow rx={17.3} />
    {/* under-body — only its near wedge shows below the lifted top */}
    <path d={isoDiamond(0.94, 0.94, 0)} fill={shade(ROSE, -0.24)} stroke={INK} strokeWidth={SW} />
    {/* plump top — roundness carried by a soft light-to-base falloff */}
    <path d={isoDiamond(0.94, 0.94, 6.5)} fill="url(#oh-cushion-g0)" stroke={INK} strokeWidth={SW} />
    {/* three ticking stripes along the diamond axis */}
    {[-0.26, 0, 0.26].map((v) => {
      const l = axisLine(0.94, 0.94, 6.5, v);
      return (
        <path
          key={v}
          d={`M ${l.x1.toFixed(1)} ${l.y1.toFixed(1)} L ${l.x2.toFixed(1)} ${l.y2.toFixed(1)}`}
          fill="none"
          stroke={ROSE_PALE}
          strokeWidth={3.2}
        />
      );
    })}
    {/* barely-there weave crossing the stripes */}
    <path
      d={diamondHatch(0.78, 0.78, 6.5, 0.18)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      opacity={0.12}
    />
    {/* plump sheen where the crown meets the light */}
    <path
      d={softEllipse(4, -8.4, 7.5, 3, seedFrom('oh-cushion-plump'), 0.18)}
      fill={LINEN}
      opacity={0.25}
    />
    {/* stitched seam ring */}
    <path
      d={isoDiamond(0.68, 0.68, 6.5)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      strokeDasharray="2.5 3.5"
    />
    {/* edge light along the rim facing the window light */}
    <EdgeGlint w={0.94} d={0.94} h={6.5} opacity={0.5} />
    {/* centre dimple + corner wrinkle ticks */}
    <path d="M -3 -7.8 Q 0 -6.2 3 -7.8" fill="none" stroke={INK_SOFT} strokeWidth={SW_FINE} />
    <path d="M -15 -6.2 Q -13.6 -5.4 -12.2 -6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.7} />
    <path d="M 12.2 -6 Q 13.6 -5.4 15 -6.2" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.7} />
  </g>
);

/* ── Braided rug — 3×2 tiles, flat, facings 1 ────────────────── */

const RUG_RINGS: ReadonlyArray<{ w: number; d: number; fill: string }> = [
  { w: 3, d: 2, fill: WINE },
  { w: 2.35, d: 1.55, fill: ROSE },
  { w: 1.7, d: 1.12, fill: CREAM_WALL },
  { w: 1.05, d: 0.68, fill: ROSE_PALE },
];

const RUG_TICKS: ReadonlyArray<{ w: number; d: number }> = [
  { w: 2.68, d: 1.78 },
  { w: 2.02, d: 1.33 },
  { w: 1.38, d: 0.9 },
  { w: 0.62, d: 0.38 },
];

/** Concentric braided bands filling 3×2 tiles; dashed ticks read as braid. */
export const BraidedRugArt = (_props: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-rug-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(WINE, 0.12)} />
        <stop offset="1" stopColor={shade(WINE, -0.05)} />
      </linearGradient>
      <linearGradient id="oh-rug-g1" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(ROSE, 0.1)} />
        <stop offset="1" stopColor={shade(ROSE, -0.06)} />
      </linearGradient>
    </defs>
    {/* pile shadow peeking past the near edges, seating the rug on the boards */}
    <path d={isoDiamond(3.06, 2.06, 0)} fill={SHADOW} opacity={0.1} stroke="none" />
    {RUG_RINGS.map((ring, i) => (
      <path
        key={ring.fill}
        d={isoDiamond(ring.w, ring.d, 1)}
        fill={i === 0 ? 'url(#oh-rug-g0)' : i === 1 ? 'url(#oh-rug-g1)' : ring.fill}
        stroke={INK}
        strokeWidth={i === 0 ? SW : SW_FINE}
      />
    ))}
    {/* pile catching the room light along the far rims */}
    <EdgeGlint w={3} d={2} h={1} opacity={0.4} />
    <EdgeGlint w={2.35} d={1.55} h={1} opacity={0.35} />
    {RUG_TICKS.map((ring, i) => (
      <path
        key={`tick-${ring.w}`}
        d={isoDiamond(ring.w, ring.d, 1)}
        fill="none"
        stroke={INK_SOFT}
        strokeWidth={SW_HAIR}
        strokeDasharray="3 4.5"
        strokeDashoffset={(seedFrom(`rug-braid-${i}`) * 12).toFixed(1)}
      />
    ))}
    {/* the braid's second strand, catching light on the wine band */}
    <path
      d={isoDiamond(2.68, 1.78, 1)}
      fill="none"
      stroke={shade(WINE, 0.24)}
      strokeWidth={SW_HAIR}
      strokeDasharray="3 4.5"
      strokeDashoffset={(seedFrom('rug-braid-0') * 12 + 3.7).toFixed(1)}
      opacity={0.7}
    />
  </g>
);

/* ── Waffle throw — 1×1 tile, ~8px folded, facings 2 ─────────── */

/** Plum knit: two offset folded slabs, waffle grid on the crown; facing 1
 *  mirrors into a casual drape with a corner hanging over the near edge. */
export const WaffleThrowArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <linearGradient id="oh-throw-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(PLUM_HEATHER, 0.26)} />
        <stop offset="1" stopColor={shade(PLUM_HEATHER, 0.04)} />
      </linearGradient>
    </defs>
    {/* soft grounding shadow under the folded stack (small — it rides surfaces) */}
    <ContactShadow rx={13} opacity={0.1} />
    {/* bottom fold */}
    <IsoBox base={PLUM_HEATHER} w={0.85} d={0.72} h={4} sw={SW_FINE} />
    {/* dashed hem along the bottom fold's near-right face */}
    <path
      d="M 15.7 -1.4 L 1.3 5.9"
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      strokeDasharray="2.2 3"
    />
    {/* top fold, casually offset, wearing the waffle grid */}
    <g transform="translate(2 -4)">
      {/* occlusion where the folds press together */}
      <path d={isoDiamond(0.78, 0.66, 0)} fill={SHADOW} opacity={0.13} stroke="none" />
      <IsoBox base={PLUM_HEATHER} w={0.72} d={0.6} h={4} sw={SW_FINE} topFill="url(#oh-throw-g0)" />
      {/* knit sheen on the crown, under the waffle grid */}
      <path
        d={softEllipse(3.2, -5.4, 5, 2, seedFrom('oh-throw-sheen'), 0.15)}
        fill={LINEN}
        opacity={0.25}
      />
      <path d={diamondHatch(0.6, 0.5, 4.4, 0.125)} fill="none" stroke={PLUM_HEATHER_DEEP} strokeWidth={SW_HAIR} opacity={0.65} />
      <EdgeGlint w={0.72} d={0.6} h={4} opacity={0.45} />
    </g>
    {facing === 1 ? (
      /* the hanging corner — drapes over the near edge toward the floor */
      <g>
        {/* its small cast shadow pooling where the corner nears the floor */}
        <ellipse cx={9} cy={7.6} rx={4.5} ry={1.4} fill={SHADOW} opacity={0.1} />
        <path
          d="M 6 -6.5 L 15 -2 L 12.5 6.5 L 4.5 2 Z"
          fill={shade(PLUM_HEATHER, FACE_RIGHT)}
          stroke={INK}
          strokeWidth={SW_FINE}
        />
        <path d="M 8.6 -4.6 L 7 3" fill="none" stroke={PLUM_HEATHER_DEEP} strokeWidth={SW_HAIR} />
        <path d="M 11.6 -3.2 L 10 4.4" fill="none" stroke={PLUM_HEATHER_DEEP} strokeWidth={SW_HAIR} />
      </g>
    ) : null}
  </g>
);

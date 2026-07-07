/**
 * OUR HOME — seating plus: the deep-comfort set, redrawn for the 2:1 room.
 *
 * Chunky Tuber-Simulator volumes with a realism kit on top: subtle 2-3 stop
 * face gradients (tops brighten toward the upper-right light, verticals
 * darken to the floor), one soft #3a2518 grounding ellipse under every
 * floor-standing body, ambient-occlusion shading along contact edges,
 * near-white edge light on the lit (north→east) top rims, and honest
 * material language — sag curves, piping, tufting dots, wood grain,
 * crown-light pools, cast weight under loose pillows, one crisp specular
 * per brass part. Sepia INK outlines, one shared light
 * (top bright, right dim, left dark). Every component draws in local
 * coordinates where (0,0) is the CENTRE of its tile footprint on the floor
 * plane and negative y is UP. No filters, no blend modes — the scene owns
 * shadows.
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
  OAK_DEEP,
  WALNUT,
  BRASS,
  BRASS_BRIGHT,
  SAGE,
  SAGE_DEEP,
  SW,
  SW_FINE,
  SW_HAIR,
  wobblyLine,
  softEllipse,
} from '../homeArt';
import {
  isoBoxFaces,
  isoDiamond,
  isoCylinder,
  shade,
  FACE_TOP,
  FACE_RIGHT,
  FACE_LEFT,
  TILE_W,
  TILE_H,
  WALL_SKEW_L,
  WALL_SKEW_R,
} from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/* ── Local iso helpers ───────────────────────────────────────── */

const HW = TILE_W / 2; // 20 — px per tile along the col axis (x)
const HH = TILE_H / 2; // 10 — px per tile along the col axis (y)

/** t tiles along the col axis (toward the east corner) → screen offset. */
const col = (t: number): { x: number; y: number } => ({ x: t * HW, y: t * HH });
/** t tiles along the row axis (toward the west corner) → screen offset. */
const row = (t: number): { x: number; y: number } => ({ x: -t * HW, y: t * HH });

const at = (p: { x: number; y: number }, dy = 0): string =>
  `translate(${p.x.toFixed(1)} ${(p.y + dy).toFixed(1)})`;

/** The lit north→east top edge of a box — for 1px edge-light strokes. */
const litEdge = (w: number, d: number, h: number): string => {
  const nx = ((d - w) * HW) / 2;
  const ny = (-(w + d) * HH) / 2 - h;
  const ex = ((w + d) * HW) / 2;
  const ey = ((w - d) * HH) / 2 - h;
  return `M ${nx.toFixed(1)} ${ny.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
};

/* The room's shared light language — every glint and shadow speaks it. */
const EDGE_LIT = '#fff6e6'; // near-white rim light along lit top edges
const SPECULAR = '#fff3dc'; // one crisp glint per brass part
const CAST = '#3a2518'; // the colour of every soft cast shadow

/** One soft grounding ellipse under a floor-standing body — painted FIRST. */
const GroundShadow = ({ rx, o = 0.13 }: { rx: number; o?: number }): React.JSX.Element => (
  <ellipse cx={0} cy={1.5} rx={rx} ry={rx * 0.32} fill={CAST} opacity={o} />
);

/**
 * Face gradient with a stable id (duplicates across instances are fine).
 * Vertical by default (verticals darken to the floor); `h` runs west→east;
 * `lit` runs diagonally toward the upper-right light — for TOP faces, so
 * pass the DIM stop as `from` and the BRIGHT stop as `to`. An optional
 * `mid` stop gives big faces a rounder, 3-stop read.
 */
const Grad = ({
  id, from, to, mid, h = false, lit = false,
}: { id: string; from: string; to: string; mid?: string; h?: boolean; lit?: boolean }): React.JSX.Element => (
  <linearGradient
    id={id}
    x1="0"
    y1={lit ? '1' : '0'}
    x2={h || lit ? '1' : '0'}
    y2={h || lit ? '0' : '1'}
  >
    <stop offset="0" stopColor={from} />
    {mid ? <stop offset="0.55" stopColor={mid} /> : null}
    <stop offset="1" stopColor={to} />
  </linearGradient>
);

/** A box whose three faces take arbitrary paint (flat or url(#…) gradients). */
const FaceBox = ({
  w, d, h, top, right, left, sw = SW, edgeLight,
}: {
  w: number; d: number; h: number;
  top: string; right: string; left: string;
  sw?: number;
  /** Optional 1px near-white highlight along the lit north→east top edge. */
  edgeLight?: string;
}): React.JSX.Element => {
  const f = isoBoxFaces(w, d, h);
  return (
    <g>
      <path d={f.top} fill={top} />
      <path d={f.right} fill={right} />
      <path d={f.left} fill={left} />
      <path d={f.outline} fill="none" stroke={INK} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
      {edgeLight ? <path d={litEdge(w, d, h)} fill="none" stroke={edgeLight} strokeWidth={1} strokeOpacity={0.45} /> : null}
    </g>
  );
};

/** Flat-shaded box straight off the shared light — quick brick. */
const PlainBox = ({
  base, w, d, h, sw = SW,
}: { base: string; w: number; d: number; h: number; sw?: number }): React.JSX.Element => (
  <FaceBox
    w={w}
    d={d}
    h={h}
    top={shade(base, FACE_TOP)}
    right={shade(base, FACE_RIGHT)}
    left={shade(base, FACE_LEFT)}
    sw={sw}
  />
);

/** Soft ambient-occlusion pass along the near floor-contact edges (W→S→E). */
const ContactAO = ({ w, d, o = 0.16 }: { w: number; d: number; o?: number }): React.JSX.Element => {
  const ex = ((w + d) * HW) / 2;
  const ey = ((w - d) * HH) / 2;
  const sx = ((w - d) * HW) / 2;
  const sy = ((w + d) * HH) / 2;
  const wx = (-(w + d) * HW) / 2;
  const wy = ((d - w) * HH) / 2;
  return (
    <path
      d={`M ${wx.toFixed(1)} ${wy.toFixed(1)} L ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`}
      fill="none"
      stroke={INK}
      strokeOpacity={o}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

/** A walnut peg foot peeking from under a lifted body. */
const Foot = ({ x, y, h = 5 }: { x: number; y: number; h?: number }): React.JSX.Element => (
  <g transform={`translate(${x} ${y})`}>
    <PlainBox base={WALNUT} w={0.16} d={0.16} h={h} sw={SW_FINE} />
  </g>
);

/* ══ SofaThreeArt — 3×1 tiles, ~46px — the deep wine three-seater ═ */

const SOFA_FEET: ReadonlyArray<readonly [number, number]> = [
  [-14, -15], [-34, -8.5], [34, 8.5], [14, 15],
];

/** Positions (t along col) of the three seat cushions / back pillows. */
const SOFA_TS: readonly number[] = [-0.7, 0, 0.7];

/** One plump loose back-pillow, drawn frontal then laid into the back plane. */
const SofaBackPillow = ({ x, y, tilt }: { x: number; y: number; tilt: number }): React.JSX.Element => (
  <g transform={`translate(${x} ${y}) ${WALL_SKEW_R} rotate(${tilt})`}>
    {/* the pillow's own soft weight on the seat below */}
    <ellipse cx={0} cy={0.8} rx={8.4} ry={2.2} fill={CAST} opacity={0.12} />
    <path
      d="M -8.5 -1 Q -10 -8.5 -7.2 -14 Q 0 -16.6 7.2 -14 Q 10 -8.5 8.5 -1 Q 0 1.6 -8.5 -1 Z"
      fill="url(#oh-sofa3-pil)"
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    {/* cream piping tracks the pillow's seam just inside the silhouette */}
    <path
      d="M -6.8 -2 Q -8 -8.2 -5.8 -12.6 Q 0 -14.7 5.8 -12.6 Q 8 -8.2 6.8 -2 Q 0 0 -6.8 -2 Z"
      fill="none"
      stroke={CREAM_WALL}
      strokeWidth={SW_HAIR}
    />
    {/* karate-chop crease + a wrinkle tick */}
    <path d="M -3 -14.6 Q 0 -12.8 3 -14.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_FINE} />
    <path d="M -5.4 -5 Q -4 -6.4 -4.6 -8.4" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
  </g>
);

/** One deep seat cushion: gradient crown, cream piping, front sag, wrinkles. */
const SofaCushion = ({ t }: { t: number }): React.JSX.Element => (
  <g transform={at(col(t), -12)}>
    {/* AO where the cushion presses into the plinth */}
    <ContactAO w={0.66} d={0.8} o={0.24} />
    <g transform={at(row(0.06))}>
      <FaceBox
        w={0.66}
        d={0.8}
        h={8}
        top="url(#oh-sofa3-cush)"
        right="url(#oh-sofa3-cushr)"
        left={shade(WINE, FACE_LEFT + 0.06)}
        edgeLight={EDGE_LIT}
      />
      {/* cream piping around the crown */}
      <path d={isoDiamond(0.66, 0.8, 8)} fill="none" stroke={CREAM_WALL} strokeWidth={SW_FINE} strokeLinejoin="round" />
      {/* plump light pooling on the crown, leaning toward the window light */}
      <path d={softEllipse(2.6, -8.8, 5.6, 2.2, 4)} fill={shade(WINE, 0.14)} opacity={0.25} />
      {/* front sag — the cushion bellies over its own front edge */}
      <path d="M 12.2 -3.2 Q 7 0.4 1.6 4.4" fill="none" stroke={shade(WINE, -0.38)} strokeWidth={SW_FINE} />
      {/* two lazy wrinkle ticks */}
      <path d="M 9.4 -5.4 q -1.6 1.2 -1.2 2.6" fill="none" stroke={shade(WINE, -0.3)} strokeWidth={SW_HAIR} />
      <path d="M 4.6 -1.6 q -1.4 1 -1 2.4" fill="none" stroke={shade(WINE, -0.3)} strokeWidth={SW_HAIR} />
    </g>
  </g>
);

/** A rolled arm: tall box, lighter rolled crown, curl stroke on the near face. */
const SofaArm = ({ t }: { t: number }): React.JSX.Element => (
  <g transform={at(col(t))}>
    <FaceBox
      w={0.46}
      d={1}
      h={32}
      top="url(#oh-sofa3-arm)"
      right={shade(WINE, FACE_RIGHT)}
      left={shade(WINE, FACE_LEFT)}
      edgeLight={EDGE_LIT}
    />
    {/* the roll — a plump crown riding the arm's top */}
    <path d={isoDiamond(0.52, 1.02, 33.5)} fill="url(#oh-sofa3-arm)" stroke={INK} strokeWidth={SW_FINE} strokeLinejoin="round" />
    {/* scroll curl on the near face */}
    <path d="M 6.8 -28.2 q 3 1.6 0.6 3.6 q -2.2 1.6 -3.4 -0.4" fill="none" stroke={shade(WINE, -0.34)} strokeWidth={SW_FINE} />
  </g>
);

/**
 * Deep WINE linen three-seater — the hero. Plinth base on walnut pegs,
 * three gradient-crowned cushions with cream piping and front sag, rolled
 * arms, a tall back wearing three loose pillows.
 */
export const SofaThreeArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <Grad id="oh-sofa3-cush" from={shade(WINE, 0.04)} mid={shade(WINE, 0.12)} to={shade(WINE, 0.2)} lit />
      <Grad id="oh-sofa3-cushr" from={shade(WINE, -0.1)} to={shade(WINE, -0.26)} />
      <Grad id="oh-sofa3-arm" from={shade(WINE, 0.16)} to={shade(WINE, 0)} />
      <Grad id="oh-sofa3-back" from={shade(WINE, 0.1)} to={shade(WINE, -0.04)} />
      <Grad id="oh-sofa3-plinth" from={shade(WINE, -0.08)} to={shade(WINE, -0.28)} />
      <Grad id="oh-sofa3-pil" from={shade(WINE, 0.28)} to={shade(WINE, 0.08)} />
    </defs>
    {/* grounding — one soft cast ellipse, then occlusion at the contact line */}
    <GroundShadow rx={37} />
    <ContactAO w={3} d={1} />
    {/* walnut pegs on the floor; the body rides 4px above them */}
    {SOFA_FEET.map(([fx, fy]) => (
      <Foot key={`${fx},${fy}`} x={fx} y={fy} />
    ))}
    <g transform="translate(0 -4)">
      {/* plinth — the upholstered base frame */}
      <FaceBox w={3} d={1} h={12} top={shade(WINE, FACE_TOP)} right="url(#oh-sofa3-plinth)" left={shade(WINE, FACE_LEFT)} />
      {/* tall back along the far long edge */}
      <g transform={at(row(-0.34))}>
        <FaceBox
          w={3}
          d={0.32}
          h={38}
          top="url(#oh-sofa3-arm)"
          right="url(#oh-sofa3-back)"
          left={shade(WINE, FACE_LEFT)}
          edgeLight={EDGE_LIT}
        />
      </g>
      {/* far rolled arm (west end) */}
      <SofaArm t={-1.27} />
      {/* three deep seat cushions on the plinth */}
      {SOFA_TS.map((t) => (
        <SofaCushion key={`c${t}`} t={t} />
      ))}
      {/* three loose back-pillows leaning into the back plane */}
      <SofaBackPillow x={-9} y={-29.5} tilt={-4} />
      <SofaBackPillow x={5} y={-22.5} tilt={3} />
      <SofaBackPillow x={19} y={-15.5} tilt={-3} />
      {/* near rolled arm (east end) — painted last, it's closest */}
      <SofaArm t={1.27} />
    </g>
  </g>
);

/* ══ LoveseatArt — 2×1 tiles, ~44px — rose boucle two-seater ═════ */

const LOVESEAT_FEET: ReadonlyArray<readonly [number, number]> = [
  [-9, -12], [-24, -5.5], [24, 5.5], [9, 12],
];

/** One round boucle cushion: dotted texture ring reads as looped yarn. */
const LoveseatCushion = ({ t }: { t: number }): React.JSX.Element => (
  <g transform={at(col(t), -11)}>
    <ContactAO w={0.7} d={0.78} o={0.24} />
    <g transform={at(row(0.07))}>
      <FaceBox
        w={0.7}
        d={0.78}
        h={8}
        top="url(#oh-love2-cush)"
        right={shade(ROSE, FACE_RIGHT)}
        left={shade(ROSE, FACE_LEFT)}
        edgeLight={EDGE_LIT}
      />
      {/* boucle loops — a dotted ring over the crown */}
      <path
        d={isoDiamond(0.46, 0.5, 8)}
        fill="none"
        stroke={shade(ROSE, -0.2)}
        strokeWidth={SW_HAIR}
        strokeDasharray="0.5 3"
        strokeLinecap="round"
      />
      {/* light pooling on the boucle crown */}
      <path d={softEllipse(2.6, -8.8, 5.8, 2.3, 6)} fill={shade(ROSE, 0.14)} opacity={0.25} />
      {/* front sag */}
      <path d="M 12 -3.4 Q 7 0.2 2 4.2" fill="none" stroke={shade(ROSE, -0.34)} strokeWidth={SW_FINE} />
    </g>
  </g>
);

/** A low round arm: shorter box, plump elliptical roll on top. */
const LoveseatArm = ({ t }: { t: number }): React.JSX.Element => (
  <g transform={at(col(t))}>
    <FaceBox
      w={0.42}
      d={1}
      h={24}
      top="url(#oh-love2-arm)"
      right={shade(ROSE, FACE_RIGHT)}
      left={shade(ROSE, FACE_LEFT)}
    />
    {/* the soft roll */}
    <path d={isoDiamond(0.5, 1.04, 25.5)} fill="url(#oh-love2-arm)" stroke={INK} strokeWidth={SW_FINE} strokeLinejoin="round" />
    <path d="M 6 -20.6 q 2.6 1.4 0.4 3.2" fill="none" stroke={shade(ROSE, -0.3)} strokeWidth={SW_HAIR} />
  </g>
);

/**
 * ROSE boucle two-seater — the sofa's softer little sister. Rounder, lower
 * arms, two looped-yarn cushions, and one WINE lumbar pillow set square in
 * the middle of the back.
 */
export const LoveseatArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <Grad id="oh-love2-cush" from={shade(ROSE, 0.05)} mid={shade(ROSE, 0.13)} to={shade(ROSE, 0.22)} lit />
      <Grad id="oh-love2-arm" from={shade(ROSE, 0.18)} to={shade(ROSE, 0.02)} />
      <Grad id="oh-love2-back" from={shade(ROSE, 0.1)} to={shade(ROSE, -0.05)} />
      <Grad id="oh-love2-plinth" from={shade(ROSE, -0.08)} to={shade(ROSE, -0.26)} />
      <Grad id="oh-love2-lum" from={shade(WINE, 0.24)} to={shade(WINE, 0.05)} />
    </defs>
    <GroundShadow rx={27.5} />
    <ContactAO w={2} d={1} />
    {LOVESEAT_FEET.map(([fx, fy]) => (
      <Foot key={`${fx},${fy}`} x={fx} y={fy} h={4} />
    ))}
    <g transform="translate(0 -3.5)">
      {/* plinth */}
      <FaceBox w={2} d={1} h={11} top={shade(ROSE, FACE_TOP)} right="url(#oh-love2-plinth)" left={shade(ROSE, FACE_LEFT)} />
      {/* soft tall back along the far long edge */}
      <g transform={at(row(-0.33))}>
        <FaceBox
          w={2}
          d={0.34}
          h={35}
          top="url(#oh-love2-arm)"
          right="url(#oh-love2-back)"
          left={shade(ROSE, FACE_LEFT)}
          edgeLight={EDGE_LIT}
        />
      </g>
      <LoveseatArm t={-0.79} />
      <LoveseatCushion t={-0.45} />
      <LoveseatCushion t={0.45} />
      {/* the one WINE lumbar pillow, set into the back plane */}
      <g transform={`translate(4.6 -21.5) ${WALL_SKEW_R} rotate(2)`}>
        {/* its soft weight on the seat below */}
        <ellipse cx={0} cy={0.4} rx={10} ry={2.2} fill={CAST} opacity={0.12} />
        <path
          d="M -10.5 -1.5 Q -12 -5.5 -10 -10 Q 0 -12.2 10 -10 Q 12 -5.5 10.5 -1.5 Q 0 0.6 -10.5 -1.5 Z"
          fill="url(#oh-love2-lum)"
          stroke={INK}
          strokeWidth={SW_FINE}
        />
        <path
          d="M -8.6 -2.4 Q -9.8 -5.6 -8.2 -8.7 Q 0 -10.5 8.2 -8.7 Q 9.8 -5.6 8.6 -2.4 Q 0 -0.8 -8.6 -2.4 Z"
          fill="none"
          stroke={CREAM_WALL}
          strokeWidth={SW_HAIR}
        />
        <path d="M -3.4 -10.8 Q 0 -9.4 3.4 -10.8" fill="none" stroke={shade(WINE, -0.3)} strokeWidth={SW_HAIR} />
      </g>
      <LoveseatArm t={0.79} />
    </g>
  </g>
);

/* ══ RockingChairArt — 1×1 tile, ~48px — oak rocker with blankie ═ */

/** One curved rocker blade running along the facing (col) axis. */
const RockerBlade = ({ v }: { v: number }): React.JSX.Element => (
  <g transform={at(row(v))}>
    <path
      d="M -12 -10 Q 0 3 12 2 L 12 -0.6 Q 1 0.4 -9.8 -12 Z"
      fill={OAK_DEEP}
      stroke={INK}
      strokeWidth={SW_FINE}
      strokeLinejoin="round"
    />
  </g>
);

/** An oak rod: INK understroke + oak overstroke = outlined dowel. */
const OakRod = ({ d, wIn = 2.4, wOut = 4 }: { d: string; wIn?: number; wOut?: number }): React.JSX.Element => (
  <g>
    <path d={d} fill="none" stroke={INK} strokeWidth={wOut} strokeLinecap="round" />
    <path d={d} fill="none" stroke={OAK} strokeWidth={wIn} strokeLinecap="round" />
  </g>
);

/**
 * OAK rocking chair: two curved rocker blades, four dowel legs, a chunky
 * seat with a LINEN pad, a tall spindle back laid into the row-axis plane,
 * two armrests — and a folded SAGE blankie thrown over the near arm.
 */
export const RockingChairArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <Grad id="oh-rock-seat" from={shade(OAK, 0.14)} to={shade(OAK, 0)} />
      <Grad id="oh-rock-pad" from={shade(LINEN, 0.12)} to={shade(LINEN, -0.04)} />
      <Grad id="oh-rock-blank" from={shade(SAGE, 0.16)} to={shade(SAGE, -0.02)} />
    </defs>
    {/* grounding cast under the whole chair */}
    <GroundShadow rx={15} />
    {/* the two rocker blades on the floor */}
    <RockerBlade v={-0.32} />
    <RockerBlade v={0.32} />
    {/* dowel legs — far three first, front one after the seat */}
    <OakRod d="M 0 -7 L 0 -14" />
    <OakRod d="M -12 -1 L -12 -14" />
    <OakRod d="M 12 -1 L 12 -14" />
    {/* spindle back — frontal drawing laid into the left-wall plane */}
    <g transform={`translate(-8 -4) ${WALL_SKEW_L}`}>
      {/* stiles */}
      <OakRod d="M -8 -15 L -8 -41" wIn={2.2} wOut={3.8} />
      <OakRod d="M 8 -15 L 8 -41" wIn={2.2} wOut={3.8} />
      {/* three slender spindles */}
      <OakRod d="M -4 -17 L -4 -38" wIn={1.3} wOut={2.5} />
      <OakRod d="M 0 -17 L 0 -38" wIn={1.3} wOut={2.5} />
      <OakRod d="M 4 -17 L 4 -38" wIn={1.3} wOut={2.5} />
      {/* crest rail — gently bowed */}
      <path
        d="M -9.5 -40 Q 0 -45.5 9.5 -40 L 9.5 -43 Q 0 -48 -9.5 -43 Z"
        fill={OAK}
        stroke={INK}
        strokeWidth={SW_FINE}
        strokeLinejoin="round"
      />
      <path d={wobblyLine(-7, -42.6, 7, -42.6, 5, 0.5)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    </g>
    {/* chunky seat riding the legs */}
    <g transform="translate(0 -13)">
      <FaceBox w={0.9} d={0.9} h={4} top="url(#oh-rock-seat)" right={shade(OAK, FACE_RIGHT)} left={shade(OAK, FACE_LEFT)} edgeLight={EDGE_LIT} />
      {/* grain ghosting along the seat's near rim */}
      <path d={wobblyLine(13.8, -3, 2.8, 2.6, 7, 0.35)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeOpacity={0.32} />
      {/* the pad's soft weight pressed onto the seat */}
      <path d={isoDiamond(0.72, 0.72, 4.6)} fill={CAST} opacity={0.12} />
      {/* linen seat pad, tied on */}
      <path d={isoDiamond(0.68, 0.68, 6.5)} fill="url(#oh-rock-pad)" stroke={INK_SOFT} strokeWidth={SW_FINE} strokeLinejoin="round" />
      <path
        d={isoDiamond(0.5, 0.5, 6.5)}
        fill="none"
        stroke={LINEN_SHADE}
        strokeWidth={SW_HAIR}
        strokeDasharray="2 3"
      />
      <path d="M -2.6 -8.6 Q 0 -7.4 2.6 -8.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    </g>
    {/* armrests: back post to front, with front supports */}
    <OakRod d="M 0.2 -32.9 Q 8.6 -31.4 15.6 -25.2" wIn={2} wOut={3.4} />
    <OakRod d="M 15 -25.6 L 15 -16.8" wIn={1.6} wOut={2.8} />
    <OakRod d="M -14.2 -25.9 Q -6.2 -24.2 1.2 -18.2" wIn={2} wOut={3.4} />
    <OakRod d="M 0.6 -18.6 L 0.6 -10" wIn={1.6} wOut={2.8} />
    {/* front dowel leg over the near rocker */}
    <OakRod d="M 0 -1 L 0 -12" />
    {/* folded SAGE blankie over the near arm — flaps hang on both sides */}
    <g transform="translate(-6.4 -24.2) rotate(-8)">
      <path
        d="M -5.4 -2.2 Q 0 -4.8 5.4 -2.2 L 6 5.6 Q 4.4 7.4 2.8 6.2 L 2.4 0.8 L -2.2 0.8 L -2.8 7.4 Q -4.6 9 -6 7.2 Z"
        fill="url(#oh-rock-blank)"
        stroke={INK}
        strokeWidth={SW_FINE}
        strokeLinejoin="round"
      />
      {/* lit crest of the fold, then fold lines + fringe ticks */}
      <path d="M -4.8 -2 Q 0 -4.2 4.8 -2" fill="none" stroke={shade(SAGE, 0.28)} strokeWidth={1} strokeOpacity={0.5} />
      <path d="M -4.6 -1.4 Q 0 -3.4 4.6 -1.4" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_HAIR} />
      <path d="M 3.6 1.4 L 4 5.2 M -3.6 1.6 L -4 6" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_HAIR} />
      <path d="M -5.2 8 l 0.5 1.6 M -3.6 8.4 l 0.4 1.5 M 3.6 7.2 l 0.4 1.5 M 5.2 6.6 l 0.5 1.5" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_HAIR} />
    </g>
  </g>
);

/* ══ ChaiseArt — 2×1 tiles, ~40px — plum velvet chaise longue ════ */

/** Brass caster: a bright ball with one specular arc. */
const Caster = ({ x, y }: { x: number; y: number }): React.JSX.Element => (
  <g transform={`translate(${x} ${y})`}>
    <circle cx={0} cy={-2.4} r={2.4} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
    {/* dark underside, bright shoulder, one crisp specular */}
    <path d="M -1.7 -1.2 A 2 2 0 0 0 1.7 -1.2" fill="none" stroke={shade(BRASS, -0.32)} strokeWidth={0.8} />
    <path d="M -1.4 -3.6 A 1.9 1.9 0 0 1 0.6 -4.4" fill="none" stroke={BRASS_BRIGHT} strokeWidth={1} strokeLinecap="round" />
    <circle cx={0.9} cy={-3.3} r={0.7} fill={SPECULAR} opacity={0.55} />
  </g>
);

/** Tufting dot positions on the flat deck (u along col, v along row). */
const CHAISE_TUFTS: ReadonlyArray<readonly [number, number]> = [
  [-0.28, -0.2], [-0.28, 0.2], [0.14, -0.2], [0.14, 0.2], [0.56, -0.2], [0.56, 0.2],
];

/**
 * PLUM_HEATHER velvet chaise longue: low buttoned deck, one raised scrolled
 * end at the west, shallow diamond ticks between tuft dots, brass casters.
 */
export const ChaiseArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <Grad id="oh-chaise-top" from={shade(PLUM_HEATHER, 0.02)} mid={shade(PLUM_HEATHER, 0.1)} to={shade(PLUM_HEATHER, 0.18)} lit />
      <Grad id="oh-chaise-r" from={shade(PLUM_HEATHER, -0.1)} to={shade(PLUM_HEATHER, -0.28)} />
      <Grad id="oh-chaise-scroll" from={shade(PLUM_HEATHER, 0.2)} to={shade(PLUM_HEATHER, 0.04)} />
    </defs>
    <GroundShadow rx={27.5} />
    <ContactAO w={2} d={1} o={0.14} />
    {/* brass casters at the near corners */}
    <Caster x={-25} y={-4} />
    <Caster x={-8} y={-12} />
    <Caster x={8} y={12} />
    <Caster x={25} y={4} />
    <g transform="translate(0 -3)">
      {/* the low velvet deck */}
      <FaceBox
        w={2}
        d={1}
        h={13}
        top="url(#oh-chaise-top)"
        right="url(#oh-chaise-r)"
        left={shade(PLUM_HEATHER, FACE_LEFT)}
        edgeLight={EDGE_LIT}
      />
      {/* raised scrolled end at the west */}
      <g transform={at(col(-0.75))}>
        {/* AO where the scroll rises out of the deck + its soft cast on the velvet */}
        <path d="M 13 -6.6 L -1 -13.6" fill="none" stroke={CAST} strokeOpacity={0.12} strokeWidth={3.4} />
        <path d="M 12 -8 L -2 -15" fill="none" stroke={PLUM_HEATHER_DEEP} strokeOpacity={0.5} strokeWidth={1.6} />
        <FaceBox
          w={0.5}
          d={1}
          h={26}
          top="url(#oh-chaise-scroll)"
          right={shade(PLUM_HEATHER, FACE_RIGHT)}
          left={shade(PLUM_HEATHER, FACE_LEFT)}
        />
        {/* rolled crown + the scroll spiral on the near face */}
        <path d={isoDiamond(0.56, 1.04, 27.5)} fill="url(#oh-chaise-scroll)" stroke={INK} strokeWidth={SW_FINE} strokeLinejoin="round" />
        <path d="M 7.4 -22.6 q 3.4 1.8 0.8 4 q -2.6 1.8 -4 -0.6" fill="none" stroke={shade(PLUM_HEATHER, -0.3)} strokeWidth={SW_FINE} />
      </g>
      {/* buttoned top: tuft dots + shallow diamond ticks between them */}
      {CHAISE_TUFTS.map(([u, v]) => (
        <ellipse
          key={`${u},${v}`}
          cx={u * HW - v * HW}
          cy={u * HH + v * HH - 13}
          rx={1.5}
          ry={0.9}
          fill={PLUM_HEATHER_DEEP}
        />
      ))}
      {/* diamond ticks — the fabric pulled between buttons */}
      <path
        d="M 0.8 -14.2 L 4.6 -11.4 M 9.2 -12.4 L 13 -9.6 M -7.6 -12.1 L -3.8 -9.3 M 2.6 -8.6 L 6 -11 M -5 -6.8 L -1.6 -9.2 M 11 -4.9 L 14.4 -7.3"
        fill="none"
        stroke={PLUM_HEATHER_DEEP}
        strokeWidth={SW_HAIR}
      />
    </g>
  </g>
);

/* ══ OttomanArt — 1×1 tile, ~18px — wine tufted ottoman ══════════ */

const OTTO_TUFTS: ReadonlyArray<readonly [number, number]> = [
  [0, -13.2], [7, -9.6], [-7, -9.6], [0, -6],
];

/** WINE tufted ottoman on walnut pegs: 4 tuft dots, cream piping, edge light. */
export const OttomanArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <Grad id="oh-otto-top" from={shade(WINE, 0.04)} mid={shade(WINE, 0.12)} to={shade(WINE, 0.2)} lit />
      <Grad id="oh-otto-r" from={shade(WINE, -0.1)} to={shade(WINE, -0.28)} />
    </defs>
    <GroundShadow rx={16.5} />
    <ContactAO w={0.9} d={0.9} o={0.18} />
    <Foot x={0} y={-7.5} h={4} />
    <Foot x={-15} y={0} h={4} />
    <Foot x={15} y={0} h={4} />
    <Foot x={0} y={7.5} h={4} />
    <g transform="translate(0 -3.5)">
      <FaceBox
        w={0.9}
        d={0.9}
        h={12}
        top="url(#oh-otto-top)"
        right="url(#oh-otto-r)"
        left={shade(WINE, FACE_LEFT)}
        edgeLight={EDGE_LIT}
      />
      {/* cream piping around the crown */}
      <path d={isoDiamond(0.9, 0.9, 12)} fill="none" stroke={CREAM_WALL} strokeWidth={SW_FINE} strokeLinejoin="round" />
      {/* light pooling on the crown */}
      <path d={softEllipse(2.8, -12.6, 5.4, 2.1, 8)} fill={shade(WINE, 0.14)} opacity={0.25} />
      {/* four tuft dots + pulled-fabric ticks between them */}
      {OTTO_TUFTS.map(([tx, ty]) => (
        <ellipse key={`${tx},${ty}`} cx={tx} cy={ty} rx={1.4} ry={0.85} fill={shade(WINE, -0.42)} />
      ))}
      <path
        d="M -5.2 -10.6 L -1.6 -12.4 M 1.6 -12.4 L 5.2 -10.6 M -5.2 -8.6 L -1.6 -6.9 M 1.6 -6.9 L 5.2 -8.6"
        fill="none"
        stroke={shade(WINE, -0.34)}
        strokeWidth={SW_HAIR}
      />
    </g>
  </g>
);

/* ══ PoufArt — 1×1 tile, ~14px — sage chunky-knit pouf ═══════════ */

/** SAGE chunky-knit pouf: soft gradient drum, braid rows as curved pairs. */
export const PoufArt = ({ facing }: ObjectArtProps): React.JSX.Element => {
  const c = isoCylinder(15, 10);
  return (
    <g
      strokeLinecap="round"
      strokeLinejoin="round"
      transform={facing === 1 ? 'scale(-1 1)' : undefined}
    >
      <defs>
        <Grad id="oh-pouf-side" from={shade(SAGE, 0.02)} to={shade(SAGE, -0.28)} />
        <Grad id="oh-pouf-top" from={shade(SAGE, 0.06)} mid={shade(SAGE, 0.13)} to={shade(SAGE, 0.2)} lit />
      </defs>
      {/* grounding cast, then the soft drum body — dark at the floor line */}
      <GroundShadow rx={14} />
      <path d={c.side} fill="url(#oh-pouf-side)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {/* braid rows — paired curved strokes hugging the belly */}
      <path d="M -14.4 -3.4 A 14.4 7.2 0 0 0 14.4 -3.4" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_FINE} />
      <path d="M -14.1 -4.8 A 14.1 7 0 0 0 14.1 -4.8" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_HAIR} />
      <path d="M -14.9 -7.2 A 14.9 7.4 0 0 0 14.9 -7.2" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_FINE} />
      <path d="M -14.7 -8.6 A 14.7 7.3 0 0 0 14.7 -8.6" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_HAIR} />
      {/* crown */}
      <ellipse cx={c.topCx} cy={c.topCy} rx={c.rx} ry={c.ry} fill="url(#oh-pouf-top)" stroke={INK} strokeWidth={SW} />
      {/* light pooling on the crown */}
      <path d={softEllipse(3.4, -11.6, 5.4, 2.4, 9)} fill={shade(SAGE, 0.14)} opacity={0.25} />
      {/* knit swirl on top: dashed ring + centre dimple */}
      <ellipse
        cx={0}
        cy={-10}
        rx={8.5}
        ry={4.2}
        fill="none"
        stroke={SAGE_DEEP}
        strokeWidth={SW_HAIR}
        strokeDasharray="2 2.4"
      />
      <path d="M -2.6 -10.6 Q 0 -9.2 2.6 -10.6" fill="none" stroke={SAGE_DEEP} strokeWidth={SW_FINE} />
      {/* edge light on the lit rim */}
      <path d="M -4 -14.9 A 14.6 7.3 0 0 1 12 -12.6" fill="none" stroke={EDGE_LIT} strokeWidth={1} strokeOpacity={0.45} />
    </g>
  );
};

/* ══ BedArt — 3×2 tiles, ~40px — walnut platform bed ═════════════ */

/** One ROSE pillow leaning on the headboard, laid into the row-axis plane. */
const BedPillow = ({ x, y, tilt }: { x: number; y: number; tilt: number }): React.JSX.Element => (
  <g transform={`translate(${x} ${y}) ${WALL_SKEW_L} rotate(${tilt})`}>
    {/* soft weight on the duvet below */}
    <ellipse cx={0} cy={0.6} rx={9.6} ry={2.3} fill={CAST} opacity={0.12} />
    <path
      d="M -10.5 -1 Q -12.4 -6.5 -10 -11.5 Q 0 -13.8 10 -11.5 Q 12.4 -6.5 10.5 -1 Q 0 1.4 -10.5 -1 Z"
      fill="url(#oh-bed-pil)"
      stroke={INK}
      strokeWidth={SW_FINE}
      strokeLinejoin="round"
    />
    {/* crease ticks where the pillow slumps */}
    <path d="M -3.6 -12 Q 0 -10.4 3.6 -12" fill="none" stroke={shade(ROSE, -0.28)} strokeWidth={SW_HAIR} />
    <path d="M -7.4 -3.4 q 1.2 -1.8 0.6 -3.8 M 7.4 -3.4 q -1.2 -1.8 -0.6 -3.8" fill="none" stroke={shade(ROSE, -0.28)} strokeWidth={SW_HAIR} />
  </g>
);

/**
 * WALNUT platform bed: grained platform, headboard along the far upper-left
 * edge, thick LINEN duvet with fold lines and a turned-down corner showing
 * the ROSE_PALE sheet, two ROSE pillows leaning on the headboard.
 */
export const BedArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <Grad id="oh-bed-duvet" from={shade(LINEN, -0.02)} mid={shade(LINEN, 0.06)} to={shade(LINEN, 0.14)} lit />
      <Grad id="oh-bed-duvr" from={shade(LINEN, -0.06)} to={shade(LINEN, -0.2)} />
      <Grad id="oh-bed-wood" from={shade(WALNUT, 0.08)} to={shade(WALNUT, -0.06)} />
      <Grad id="oh-bed-pil" from={shade(ROSE, 0.26)} to={shade(ROSE, 0.06)} />
    </defs>
    <GroundShadow rx={46} />
    <ContactAO w={3} d={2} o={0.14} />
    {/* headboard first — it lives along the far (min-col) edge */}
    <g transform={at(col(-1.38))}>
      <FaceBox
        w={0.24}
        d={2}
        h={28}
        top="url(#oh-bed-wood)"
        right={shade(WALNUT, FACE_RIGHT)}
        left={shade(WALNUT, FACE_LEFT)}
        edgeLight={EDGE_LIT}
      />
      {/* grain + a varnish highlight band on the inward face */}
      <path d={wobblyLine(19, -25, -14.6, -8.2, 11, 0.6)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <path d={wobblyLine(18.4, -19.4, -15.2, -2.6, 12, 0.6)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <path d="M 20.4 -33.8 L -15.6 -15.8" fill="none" stroke={shade(WALNUT, 0.3)} strokeWidth={1.2} />
    </g>
    {/* walnut platform */}
    <FaceBox w={3} d={2} h={9} top="url(#oh-bed-wood)" right={shade(WALNUT, FACE_RIGHT)} left={shade(WALNUT, FACE_LEFT)} edgeLight={EDGE_LIT} />
    <path d={wobblyLine(44, 3.6, 16, 17.6, 13, 0.7)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    <path d={wobblyLine(42, 6.8, 18, 18.8, 14, 0.6)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeOpacity={0.5} />
    <path d="M 46 -2.6 L 14 13.4" fill="none" stroke={shade(WALNUT, 0.3)} strokeWidth={1} />
    {/* mattress + duvet riding the platform, nudged toward the foot */}
    <g transform={at(col(0.15), -9)}>
      {/* AO where the duvet settles onto the frame */}
      <ContactAO w={2.5} d={1.85} o={0.2} />
      <FaceBox
        w={2.5}
        d={1.85}
        h={11}
        top="url(#oh-bed-duvet)"
        right="url(#oh-bed-duvr)"
        left={shade(LINEN, FACE_LEFT)}
        edgeLight={EDGE_LIT}
      />
      {/* broad light pooling where the duvet crowns */}
      <path d={softEllipse(6, -12.6, 13, 4.6, 12)} fill={shade(LINEN, 0.14)} opacity={0.22} />
      {/* fold lines running parallel to the headboard */}
      <path d={wobblyLine(9, -22.5, -23, -6.5, 21, 0.9)} fill="none" stroke={LINEN_SHADE} strokeWidth={SW_FINE} />
      <path d={wobblyLine(22, -16, -10, 0, 22, 0.9)} fill="none" stroke={LINEN_SHADE} strokeWidth={SW_FINE} />
      <path d={wobblyLine(30, -12.4, 6, -0.4, 23, 0.7)} fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR} />
      {/* hem wrinkles on the near face */}
      <path d="M 30 -4 q -1.6 2.4 -1 5 M 20 1 q -1.6 2.4 -1 5" fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR} />
      {/* turned-down corner at the foot: rose sheet revealed, flap folded back */}
      <path d="M 27.5 -15.75 L 43.5 -7.75 L 31.7 -1.85 Z" fill={ROSE_PALE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {/* the folded flap's warm cast on the revealed sheet */}
      <path d="M 27.5 -15.75 L 31.7 -1.85 L 34.6 -3.3 L 30.2 -14.4 Z" fill={CAST} opacity={0.1} />
      <path d="M 33 -9.5 L 39 -6.5" fill="none" stroke={shade(ROSE_PALE, -0.14)} strokeWidth={SW_HAIR} />
      <path d="M 27.5 -15.75 L 31.7 -1.85 L 15.7 -9.85 Z" fill={shade(LINEN, 0.18)} stroke={INK} strokeWidth={SW_FINE} strokeLinejoin="round" />
      <path d="M 27.5 -15.75 L 31.7 -1.85" fill="none" stroke={LINEN_SHADE} strokeWidth={SW_FINE} />
      <path d="M 22.6 -11.4 L 26.6 -9.2" fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR} />
    </g>
    {/* two rose pillows against the headboard — far one first */}
    <BedPillow x={-7.4} y={-33.3} tilt={4} />
    <BedPillow x={-26.6} y={-23.7} tilt={-5} />
  </g>
);

/* ══ BenchArt — 2×1 tiles, ~20px — oak slat bench ════════════════ */

const BENCH_LEGS: ReadonlyArray<readonly [number, number]> = [
  [-6, -11], [-24, -4], [24, 4], [6, 11],
];

const BENCH_SLAT_VS: readonly number[] = [-0.36, -0.12, 0.12, 0.36];

/**
 * OAK slat bench: four slats with shadow gaps reading through, gentle wood
 * grain, a varnish glint on the near slat, and one small WINE cushion
 * parked on the east end.
 */
export const BenchArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
  >
    <defs>
      <Grad id="oh-bench-slat" from={shade(OAK, 0.12)} to={shade(OAK, 0)} />
      <Grad id="oh-bench-cush" from={shade(WINE, 0.2)} to={shade(WINE, 0.04)} />
    </defs>
    <GroundShadow rx={27.5} />
    <ContactAO w={2} d={1} o={0.12} />
    {/* legs */}
    {BENCH_LEGS.map(([lx, ly]) => (
      <g key={`${lx},${ly}`} transform={`translate(${lx} ${ly})`}>
        <PlainBox base={OAK_DEEP} w={0.14} d={0.14} h={9} sw={SW_FINE} />
      </g>
    ))}
    {/* the dark seat shadow under the slats — the gaps read against it */}
    <path d={isoDiamond(1.92, 0.94, 9.5)} fill={shade(OAK, -0.55)} stroke="none" />
    {/* four slats, far to near */}
    {BENCH_SLAT_VS.map((v, i) => (
      <g key={v} transform={at(row(v), -9.5)}>
        <FaceBox
          w={1.9}
          d={0.16}
          h={3}
          top="url(#oh-bench-slat)"
          right={shade(OAK, FACE_RIGHT)}
          left={shade(OAK, FACE_LEFT)}
          sw={SW_FINE}
        />
        {/* gentle grain down the slat's length */}
        <path
          d={wobblyLine(-15, -3.9, 15, 11.1, 31 + i, 0.5)}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
          strokeOpacity={0.35}
        />
      </g>
    ))}
    {/* varnish glint along the nearest slat's lit edge */}
    <g transform={at(row(0.36), -9.5)}>
      <path d={litEdge(1.9, 0.16, 3)} fill="none" stroke={EDGE_LIT} strokeWidth={1} strokeOpacity={0.45} />
    </g>
    {/* one small WINE cushion on the east end */}
    <g transform={at(col(0.55), -12.2)}>
      <ContactAO w={0.55} d={0.72} o={0.22} />
      <FaceBox
        w={0.55}
        d={0.72}
        h={4.5}
        top="url(#oh-bench-cush)"
        right={shade(WINE, FACE_RIGHT)}
        left={shade(WINE, FACE_LEFT)}
        sw={SW_FINE}
        edgeLight={EDGE_LIT}
      />
      <path d={isoDiamond(0.55, 0.72, 4.5)} fill="none" stroke={CREAM_WALL} strokeWidth={SW_HAIR} strokeLinejoin="round" />
      {/* light pooling on the little crown */}
      <path d={softEllipse(1.8, -5, 3.8, 1.5, 10)} fill={shade(WINE, 0.14)} opacity={0.25} />
      <path d="M 8.6 -1.4 Q 5 1 1.6 3.4" fill="none" stroke={shade(WINE, -0.34)} strokeWidth={SW_HAIR} />
    </g>
  </g>
);

/**
 * OUR HOME — kept things (isometric).
 *
 * The shoebox of notes, a bowl of shells, a pressed flower, a ticket stub,
 * the parcel on the doormat and the torn paper the other partner sweeps.
 * Hand-inked storybook style: INK outlines, flat fills plus one darker
 * sibling-shade, deliberate wobble.
 *
 * Floor pieces are anchored at (0,0) = the centre of their footprint on the
 * floor plane and built from the shared iso volumes (light from the upper
 * right: top brightest, left darkest). The pressed flower is the one wall
 * piece here — drawn flat around its hang point, then laid onto the wall
 * with WALL_SKEW_L (facing 0) or WALL_SKEW_R (facing 1).
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
  LINEN,
  LINEN_SHADE,
  OAK,
  OAK_DEEP,
  ROSE,
  SAGE,
  BLOOM_ROSE,
  SW,
  SW_FINE,
  SW_HAIR,
  softEllipse,
  wobblyLine,
  seedFrom,
} from '../homeArt';
import {
  isoBoxFaces,
  isoDiamond,
  isoCylinder,
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

/* ── Shared: a lit iso box (top bright, right dim, left dark) ─── */

interface IsoBoxProps {
  w: number;
  d: number;
  h: number;
  color: string;
  /** Optional 2-stop gradient sheen for the top face. */
  topFill?: string;
  /** Optional gradient fills for the vertical faces (default: flat face shades). */
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

/** 1.1px edge light just inside a top face's north→east rim — the edge that
 *  greets the upper-right room light. Trimmed clear of the corners. */
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

/* ── Shared: a length of linen twine (shade under, linen over) ── */

const Twine = ({ d }: { d: string }): React.JSX.Element => (
  <g fill="none">
    <path d={d} stroke={LINEN_SHADE} strokeWidth={2.4} />
    <path d={d} stroke={LINEN} strokeWidth={1.3} />
  </g>
);

/* ── Shared: the parcel's little paper gift tag ───────────────── */

const ParcelTag = ({ transform }: { transform: string }): React.JSX.Element => (
  <g transform={transform}>
    <rect x={-4.2} y={-2.6} width={8.4} height={5.2} rx={1} fill={PAPER} stroke={INK} strokeWidth={SW_FINE} />
    {/* warm tick along the tag's near edge */}
    <path d="M -3.4 2 L 3.4 2" fill="none" stroke={PAPER_SHADE} strokeWidth={0.6} opacity={0.9} />
    <circle cx={-2.9} cy={0} r={0.6} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    <path
      d="M -1.4 -0.6 L 2.9 -0.6 M -1.4 1 L 1.6 1"
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      strokeDasharray="1.6 1.1"
    />
  </g>
);

/* ── Shared: floor-plane point (tiles → screen px, centred) ───── */

const ip = (c: number, r: number, lift = 0): string =>
  `${((c - r) * (TILE_W / 2)).toFixed(1)} ${((c + r) * (TILE_H / 2) - lift).toFixed(1)}`;

/* ── Shoebox — 0.8 × 0.5 tiles, 12 tall; vState: 'closed' | 'open' */

const SHOEBOX_SEED = seedFrom('oh-shoebox');
const SHOEBOX_FACES = isoBoxFaces(0.8, 0.5, 12);
const SHOEBOX_MOUTH = isoDiamond(0.6, 0.32, 12);

export const ShoeboxArt = ({ vState }: ObjectArtProps): React.JSX.Element => {
  const open = vState === 'open';
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-shoebox-g0" x1="0.8" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={shade(WINE, 0.18)} />
          <stop offset="1" stopColor={shade(WINE, 0.02)} />
        </linearGradient>
        {/* kraft body: right face eases toward the floor, left face deeper still */}
        <linearGradient id="oh-shoebox-g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(KRAFT, FACE_RIGHT + 0.06)} />
          <stop offset="1" stopColor={shade(KRAFT, FACE_RIGHT - 0.07)} />
        </linearGradient>
        <linearGradient id="oh-shoebox-g2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(KRAFT, FACE_LEFT + 0.05)} />
          <stop offset="1" stopColor={shade(KRAFT, FACE_LEFT - 0.07)} />
        </linearGradient>
        {/* open-box rim brightening toward the upper-right light */}
        <linearGradient id="oh-shoebox-g3" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={shade(KRAFT, FACE_TOP - 0.04)} />
          <stop offset="1" stopColor={shade(KRAFT, FACE_TOP + 0.07)} />
        </linearGradient>
      </defs>
      {/* soft contact shadow grounding the box */}
      <ellipse cx={0} cy={1.5} rx={12} ry={3.8} fill="#3a2518" opacity={0.13} stroke="none" />
      {open ? (
        <g>
          {/* kraft body, mouth open — faces graded toward the light */}
          <path d={SHOEBOX_FACES.left} fill="url(#oh-shoebox-g2)" />
          <path d={SHOEBOX_FACES.right} fill="url(#oh-shoebox-g1)" />
          <path d={SHOEBOX_FACES.top} fill="url(#oh-shoebox-g3)" />
          <path d={SHOEBOX_MOUTH} fill={KRAFT_SHADE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          {/* depth pooled inside the open mouth */}
          <path d={isoDiamond(0.5, 0.24, 11.6)} fill={INK} opacity={0.1} stroke="none" />
          {/* the notes' soft shade settled on the rim */}
          <ellipse cx={-3.4} cy={-11.4} rx={3} ry={1.1} fill="#3a2518" opacity={0.1} stroke="none" />
          <ellipse cx={1.4} cy={-11.1} rx={2.7} ry={1} fill="#3a2518" opacity={0.1} stroke="none" />
          <ellipse cx={5.8} cy={-11.7} rx={2.4} ry={0.9} fill="#3a2518" opacity={0.1} stroke="none" />
          {/* kept note corners peeking over the rim, page edges catching warm */}
          <g transform="translate(-3.6 -12.4) rotate(-8)">
            <rect x={-2.6} y={-6} width={5.2} height={6.6} fill={PAPER} stroke={INK} strokeWidth={SW_FINE} />
            <path d="M 2 -5.4 L 2 0" fill="none" stroke={PAPER_SHADE} strokeWidth={0.6} opacity={0.9} />
          </g>
          <g transform="translate(1.2 -12) rotate(5)">
            <rect x={-2.4} y={-5} width={4.8} height={5.6} fill={PAPER} stroke={INK} strokeWidth={SW_FINE} />
            <path d="M 1.8 -4.4 L 1.8 0" fill="none" stroke={PAPER_SHADE} strokeWidth={0.6} opacity={0.9} />
          </g>
          <g transform="translate(5.6 -12.6) rotate(-3)">
            <rect x={-2.1} y={-5.4} width={4.2} height={6} fill={PAPER} stroke={INK} strokeWidth={SW_FINE} />
            <path d="M 1.5 -4.8 L 1.5 0" fill="none" stroke={PAPER_SHADE} strokeWidth={0.6} opacity={0.9} />
          </g>
          <path d={SHOEBOX_FACES.outline} fill="none" stroke={INK} strokeWidth={SW} />
          {/* rim edge greeting the light */}
          <path d={edgeLight(0.8, 0.5, 12)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
          {/* wine lid leaning against the right side, grounded in its own shade */}
          <ellipse cx={15} cy={4.6} rx={6} ry={1.8} fill="#3a2518" opacity={0.1} stroke="none" />
          <path d="M 11.5 5.5 L 21.5 0.5 L 18.5 -11.5 L 8.5 -6.5 Z" fill={WINE} stroke={INK} strokeWidth={SW} />
          <path d="M 11.5 5.5 L 8.5 -6.5 L 10.2 -7.3 L 13.2 4.6 Z" fill={WINE_DEEP} />
          {/* sheen along the lid's lit edge */}
          <path d="M 20.6 0.3 L 17.8 -10.6" fill="none" stroke={shade(WINE, 0.24)} strokeWidth={0.8} opacity={0.7} />
        </g>
      ) : (
        <g>
          {/* kraft body, faces graded toward the light */}
          <IsoBox w={0.8} d={0.5} h={12} color={KRAFT} rightFill="url(#oh-shoebox-g1)" leftFill="url(#oh-shoebox-g2)" />
          {/* card-grain hairlines, one per near face */}
          <path
            d={wobblyLine(3.5, 0.6, 12.5, -3.9, SHOEBOX_SEED * 9, 0.4)}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={SW_HAIR}
            opacity={0.45}
          />
          <path
            d={wobblyLine(-11.5, -6.8, 1, -0.5, SHOEBOX_SEED * 13, 0.35)}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={SW_HAIR}
            opacity={0.3}
          />
          {/* wine lid: a thin slab resting on top, lip overhanging */}
          <g transform="translate(0 -9.5)">
            {/* the lid's occlusion pressed onto the kraft body */}
            <path d={isoDiamond(0.98, 0.68, 0)} fill="#3a2518" opacity={0.12} stroke="none" />
            <IsoBox w={0.92} d={0.62} h={4} color={WINE} topFill="url(#oh-shoebox-g0)" />
            <path d={edgeLight(0.92, 0.62, 4)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
          </g>
        </g>
      )}
    </g>
  );
};

/* ── Shell bowl — shallow cream cylinder, r 8 × 4 tall ────────── */

const BOWL_SEED = seedFrom('oh-shellbowl');
const BOWL = isoCylinder(8, 4);

export const ShellBowlArt = (_: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-shellbowl-g0" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0.5} />
        <stop offset="1" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0} />
      </linearGradient>
      {/* rim brightening toward the upper-right light */}
      <linearGradient id="oh-shellbowl-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(CREAM_WALL, FACE_TOP - 0.04)} />
        <stop offset="1" stopColor={shade(CREAM_WALL, FACE_TOP + 0.06)} />
      </linearGradient>
      {/* the bowl's inner cup, dimming into its far corner */}
      <linearGradient id="oh-shellbowl-g2" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(PAPER_SHADE, 0.05)} />
        <stop offset="1" stopColor={shade(PAPER_SHADE, -0.07)} />
      </linearGradient>
    </defs>
    {/* soft contact shadow grounding the bowl */}
    <ellipse cx={0} cy={2} rx={8.6} ry={2.8} fill="#3a2518" opacity={0.13} />
    {/* shallow cream bowl, ceramic softness down its side */}
    <path d={BOWL.side} fill={shade(CREAM_WALL, FACE_RIGHT)} stroke={INK} strokeWidth={SW} />
    <path d={BOWL.side} fill="url(#oh-shellbowl-g0)" stroke="none" />
    {/* darker foot ring where the ceramic meets the floor */}
    <path d="M -7.5 0.9 A 7.5 3.6 0 0 0 7.5 0.9" fill="none" stroke={shade(CREAM_WALL, -0.26)} strokeWidth={1} opacity={0.5} />
    <ellipse
      cx={BOWL.topCx}
      cy={BOWL.topCy}
      rx={BOWL.rx}
      ry={BOWL.ry}
      fill="url(#oh-shellbowl-g1)"
      stroke={INK}
      strokeWidth={SW}
    />
    {/* rim catching the light */}
    <path d="M -5.8 -5.7 A 6.7 3.35 0 0 1 5.8 -5.7" fill="none" stroke="#fff6e6" strokeWidth={0.9} opacity={0.5} />
    <ellipse cx={0} cy={-4} rx={6.1} ry={2.9} fill="url(#oh-shellbowl-g2)" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    {/* shadow pooled against the inner rim */}
    <ellipse cx={0} cy={-4.3} rx={5.4} ry={2.4} fill={INK} opacity={0.07} stroke="none" />
    {/* three small shells resting inside, each seated in its own shade */}
    <ellipse cx={-2.8} cy={-4.2} rx={2.2} ry={1.1} fill={INK} opacity={0.1} stroke="none" />
    <ellipse cx={1.4} cy={-4.8} rx={2.3} ry={1.2} fill={INK} opacity={0.1} stroke="none" />
    <ellipse cx={3.2} cy={-3} rx={1.9} ry={1} fill={INK} opacity={0.1} stroke="none" />
    <path d={softEllipse(-2.8, -4.7, 2.3, 1.5, BOWL_SEED * 11)} fill={LINEN} stroke={INK} strokeWidth={SW_FINE} />
    <path d={softEllipse(1.4, -5.3, 2.4, 1.6, BOWL_SEED * 17)} fill={LINEN} stroke={INK} strokeWidth={SW_FINE} />
    <path d={softEllipse(3.2, -3.5, 2, 1.3, BOWL_SEED * 23)} fill={LINEN} stroke={INK} strokeWidth={SW_FINE} />
    {/* a plumper pass of light on each shell's crown */}
    <path d={softEllipse(-2.3, -5.1, 1.2, 0.7, BOWL_SEED * 29)} fill={shade(LINEN, 0.16)} opacity={0.55} stroke="none" />
    <path d={softEllipse(1.9, -5.7, 1.25, 0.75, BOWL_SEED * 31)} fill={shade(LINEN, 0.16)} opacity={0.55} stroke="none" />
    <path d={softEllipse(3.6, -3.8, 1, 0.6, BOWL_SEED * 37)} fill={shade(LINEN, 0.16)} opacity={0.55} stroke="none" />
    {/* spiral ticks */}
    <path
      d="M -3.8 -4.7 Q -2.8 -5.9 -1.8 -5 M -3.2 -4.2 Q -2.6 -4.8 -2.1 -4.4"
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    <path
      d="M 0.4 -5.3 Q 1.4 -6.5 2.5 -5.6 M 0.9 -4.7 Q 1.5 -5.3 2 -4.9"
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    <path
      d="M 2.3 -3.6 Q 3.2 -4.6 4.2 -3.9 M 2.8 -3 Q 3.4 -3.6 3.9 -3.2"
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
  </g>
);

/* ── Pressed flower — wall piece, slim oak frame 20 × 26 ──────── */

/** Five petals with a seeded hand-drawn wobble, computed once. */
const PETALS = Array.from({ length: 5 }, (_, i) => ({
  angle: i * 72 + (seedFrom(`oh-petal-${i}`) - 0.5) * 14,
  rx: 1.5 + seedFrom(`oh-petal-r-${i}`) * 0.5,
}));

export const PressedFlowerArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-pressedflower-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(OAK, 0.14)} />
        <stop offset="1" stopColor={shade(OAK, -0.04)} />
      </linearGradient>
      {/* the mat, warming toward the upper-right light */}
      <linearGradient id="oh-pressedflower-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(PAPER, -0.03)} />
        <stop offset="1" stopColor={shade(PAPER, 0.05)} />
      </linearGradient>
    </defs>
    {/* slim oak frame, deep inner edge, paper mat */}
    <rect x={-10} y={-26} width={20} height={26} rx={1} fill="url(#oh-pressedflower-g0)" stroke={INK} strokeWidth={SW} />
    {/* near-white rim along the frame's lit top edge */}
    <path d="M -8.8 -25.1 L 8.8 -25.1" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
    {/* one grain whisper along the bottom rail */}
    <path d={wobblyLine(-8, -0.9, 8, -0.9, seedFrom('oh-flower-grain') * 9, 0.25)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.5} />
    {/* darker end-grain down the shaded left rail, warm sheen down the lit right */}
    <path d="M -9.2 -24.8 L -9.2 -1" fill="none" stroke={shade(OAK, -0.22)} strokeWidth={1.1} opacity={0.5} />
    <path d="M 9.2 -24.4 L 9.2 -1.4" fill="none" stroke={shade(OAK, 0.18)} strokeWidth={0.8} opacity={0.6} />
    <rect x={-8.4} y={-24.4} width={16.8} height={22.8} fill="url(#oh-pressedflower-g1)" stroke={OAK_DEEP} strokeWidth={SW_HAIR} />
    {/* the frame's shadow tucked under its top rail + a warm paper tick */}
    <rect x={-8.4} y={-24.4} width={16.8} height={1.8} fill={INK} opacity={0.1} />
    <path d="M 7.7 -22.2 L 7.7 -2.4" fill="none" stroke={PAPER_SHADE} strokeWidth={0.7} opacity={0.9} />
    {/* sage stem and two flat leaves, pressed in two tones */}
    <path d="M 0.7 -4.6 C 0.3 -8 -0.5 -11.5 -0.2 -16" fill="none" stroke={SAGE} strokeWidth={SW_FINE} />
    <ellipse
      cx={-2.2}
      cy={-9.8}
      rx={2.1}
      ry={1}
      transform="rotate(-32 -2.2 -9.8)"
      fill={SAGE}
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    <ellipse
      cx={-1.6}
      cy={-10.1}
      rx={1}
      ry={0.45}
      transform="rotate(-32 -2.2 -9.8)"
      fill={shade(SAGE, 0.12)}
      opacity={0.55}
      stroke="none"
    />
    <path d="M -3.9 -9.8 L -0.6 -9.8" transform="rotate(-32 -2.2 -9.8)" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.7} />
    <ellipse
      cx={2.1}
      cy={-12.2}
      rx={1.9}
      ry={0.9}
      transform="rotate(28 2.1 -12.2)"
      fill={SAGE}
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    <ellipse
      cx={2.7}
      cy={-12.5}
      rx={0.9}
      ry={0.4}
      transform="rotate(28 2.1 -12.2)"
      fill={shade(SAGE, 0.12)}
      opacity={0.55}
      stroke="none"
    />
    <path d="M 0.6 -12.2 L 3.6 -12.2" transform="rotate(28 2.1 -12.2)" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.7} />
    {/* the bloom, pressed flat — its shade sunk gently into the mat */}
    <ellipse cx={-0.2} cy={-17.9} rx={5.6} ry={5.2} fill="#3a2518" opacity={0.08} stroke="none" />
    <g transform="translate(-0.2 -18.4)">
      {PETALS.map((p, i) => (
        <g key={i} transform={`rotate(${p.angle})`}>
          <ellipse cx={0} cy={-2.4} rx={p.rx} ry={2.5} fill={BLOOM_ROSE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <ellipse cx={0} cy={-3.1} rx={p.rx * 0.55} ry={1.3} fill={shade(BLOOM_ROSE, 0.12)} opacity={0.55} stroke="none" />
        </g>
      ))}
      {/* petals seated in a deeper heart */}
      <circle cx={0} cy={0} r={2.1} fill={shade(BLOOM_ROSE, -0.12)} opacity={0.6} stroke="none" />
      <circle cx={0} cy={0} r={1.35} fill={PAPER_SHADE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    </g>
  </g>
);

/* ── Ticket stub — a flat paper parallelogram on the floor ────── */

const TICKET_LIFT = 0.8;
const TICKET_BODY = `M ${ip(-0.25, -0.1, TICKET_LIFT)} L ${ip(0.25, -0.1, TICKET_LIFT)} L ${ip(0.25, 0.1, TICKET_LIFT)} L ${ip(-0.25, 0.1, TICKET_LIFT)} Z`;
const TICKET_BAND = `M ${ip(-0.25, -0.1, TICKET_LIFT)} L ${ip(-0.14, -0.1, TICKET_LIFT)} L ${ip(-0.14, 0.1, TICKET_LIFT)} L ${ip(-0.25, 0.1, TICKET_LIFT)} Z`;
const TICKET_PERF = `M ${ip(0.09, -0.08, TICKET_LIFT)} L ${ip(0.09, 0.08, TICKET_LIFT)}`;
const TICKET_LINE_A = `M ${ip(-0.09, -0.03, TICKET_LIFT)} L ${ip(0.04, -0.03, TICKET_LIFT)}`;
const TICKET_LINE_B = `M ${ip(-0.09, 0.03, TICKET_LIFT)} L ${ip(0, 0.03, TICKET_LIFT)}`;
const TICKET_LINE_C = `M ${ip(0.14, -0.01, TICKET_LIFT)} L ${ip(0.2, -0.01, TICKET_LIFT)}`;

export const TicketStubArt = (_: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      {/* paper warming toward the upper-right light */}
      <linearGradient id="oh-ticket-g0" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(PAPER, -0.03)} />
        <stop offset="1" stopColor={shade(PAPER, 0.05)} />
      </linearGradient>
    </defs>
    {/* soft contact shade pooled under the flat paper */}
    <ellipse cx={0.3} cy={0.5} rx={7} ry={2.2} fill="#3a2518" opacity={0.1} stroke="none" />
    <path d={TICKET_BODY} fill="url(#oh-ticket-g0)" />
    {/* warm edge tick along the near paper edge, near-white along the lit far edge */}
    <path d={`M ${ip(-0.23, 0.09, TICKET_LIFT)} L ${ip(0.23, 0.09, TICKET_LIFT)}`} fill="none" stroke={PAPER_SHADE} strokeWidth={0.7} opacity={0.9} />
    <path d={`M ${ip(-0.23, -0.09, TICKET_LIFT)} L ${ip(0.23, -0.09, TICKET_LIFT)}`} fill="none" stroke="#fff6e6" strokeWidth={0.8} opacity={0.45} />
    {/* rose accent band along the near end, seamed where it meets the paper */}
    <path d={TICKET_BAND} fill={ROSE} />
    <path d={`M ${ip(-0.14, -0.1, TICKET_LIFT)} L ${ip(-0.14, 0.1, TICKET_LIFT)}`} fill="none" stroke={shade(ROSE, -0.18)} strokeWidth={0.7} opacity={0.7} />
    {/* perforated tear line */}
    <path d={TICKET_PERF} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeDasharray="1.3 1.6" />
    {/* tiny letters, suggested as dashes */}
    <path d={TICKET_LINE_A} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeDasharray="2 1.3" />
    <path d={TICKET_LINE_B} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeDasharray="1.5 1.2" />
    <path d={TICKET_LINE_C} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeDasharray="1.2 1" />
    <path d={TICKET_BODY} fill="none" stroke={INK} strokeWidth={SW_FINE} />
  </g>
);

/* ── Parcel — 0.9 × 0.9 tiles, 16 tall; 'sealed' | 'bow' | 'open' */

const PARCEL_SEED = seedFrom('oh-parcel');
const PARCEL_FACES = isoBoxFaces(0.9, 0.9, 16);
const PARCEL_MOUTH = isoDiamond(0.66, 0.66, 16);

export const ParcelArt = ({ vState }: ObjectArtProps): React.JSX.Element => {
  const stage = vState === 'bow' || vState === 'open' ? vState : 'sealed';
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-parcel-g0" x1="0.8" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={shade(KRAFT, 0.16)} />
          <stop offset="1" stopColor={shade(KRAFT, 0.02)} />
        </linearGradient>
        {/* kraft walls easing darker toward the floor */}
        <linearGradient id="oh-parcel-g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(KRAFT, FACE_RIGHT + 0.06)} />
          <stop offset="1" stopColor={shade(KRAFT, FACE_RIGHT - 0.07)} />
        </linearGradient>
        <linearGradient id="oh-parcel-g2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(KRAFT, FACE_LEFT + 0.05)} />
          <stop offset="1" stopColor={shade(KRAFT, FACE_LEFT - 0.07)} />
        </linearGradient>
      </defs>
      {/* soft contact shadow grounding the parcel on the mat */}
      <ellipse cx={0} cy={1.5} rx={16.6} ry={5.3} fill="#3a2518" opacity={0.13} stroke="none" />
      {stage === 'sealed' && (
        <g>
          {/* kraft box, walls graded toward the light */}
          <IsoBox w={0.9} d={0.9} h={16} color={KRAFT} topFill="url(#oh-parcel-g0)" rightFill="url(#oh-parcel-g1)" leftFill="url(#oh-parcel-g2)" />
          <path d={edgeLight(0.9, 0.9, 16)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
          <path
            d={wobblyLine(3.5, -2.8, 15.5, -8.8, PARCEL_SEED * 7, 0.4)}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={SW_HAIR}
            opacity={0.4}
          />
          <path
            d={wobblyLine(-15, -6.5, -2, 0, PARCEL_SEED * 11, 0.4)}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={SW_HAIR}
            opacity={0.35}
          />
          {/* the bow's soft shade pressed onto the paper */}
          <ellipse cx={0} cy={-15.2} rx={7} ry={2.3} fill="#3a2518" opacity={0.1} stroke="none" />
          {/* twine cross: over the top, down the two near faces */}
          <Twine d="M -9 -20.5 C -3 -17.6 3 -14.4 9 -11.5 C 9.1 -6.2 8.9 -0.8 9 4.5" />
          <Twine d="M 9 -20.5 C 3 -17.6 -3 -14.4 -9 -11.5 C -9.1 -6.2 -8.9 -0.8 -9 4.5" />
          {/* the tag, resting on the top face in its own warm shade */}
          <path d="M 1.4 -16 C 3.6 -15.2 5.4 -14 6.8 -12.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <ellipse cx={9.2} cy={-8.4} rx={4.6} ry={1.6} fill="#3a2518" opacity={0.1} stroke="none" />
          <ParcelTag transform="translate(9.6 -10.8) rotate(14)" />
          {/* a generous bow at the crossing */}
          <path
            d="M -0.6 -17 C -4.4 -23.2 -11.6 -21.4 -9.2 -17.8 C -7.8 -15.6 -3.6 -15.6 -0.6 -17 Z"
            fill={LINEN}
            stroke={INK}
            strokeWidth={SW_FINE}
          />
          <path
            d="M 0.6 -17 C 4.4 -23.2 11.6 -21.4 9.2 -17.8 C 7.8 -15.6 3.6 -15.6 0.6 -17 Z"
            fill={LINEN}
            stroke={INK}
            strokeWidth={SW_FINE}
          />
          <Twine d="M -1 -15.6 C -2.8 -13 -1.8 -11 -3.2 -8.8" />
          <Twine d="M 1 -15.6 C 2.6 -13.2 1.8 -11.2 3.2 -9" />
          <circle cx={0} cy={-16.4} r={1.7} fill={LINEN_SHADE} stroke={INK} strokeWidth={SW_FINE} />
        </g>
      )}
      {stage === 'bow' && (
        <g>
          <IsoBox w={0.9} d={0.9} h={16} color={KRAFT} topFill="url(#oh-parcel-g0)" rightFill="url(#oh-parcel-g1)" leftFill="url(#oh-parcel-g2)" />
          <path d={edgeLight(0.9, 0.9, 16)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
          <path
            d={wobblyLine(-15, -6.5, -2, 0, PARCEL_SEED * 11, 0.4)}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={SW_HAIR}
            opacity={0.35}
          />
          {/* the east corner of the paper lifting — underside showing, shade beneath */}
          <path d="M 12.5 -12.6 L 6.6 -15.4" fill="none" stroke="#3a2518" strokeWidth={1.2} opacity={0.12} />
          <path d="M 12 -19 L 18 -16 L 12 -13 Z" fill={PAPER_SHADE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <path d="M 12 -19 L 12 -13 L 6 -16 Z" fill={KRAFT_SHADE} stroke={INK} strokeWidth={SW_FINE} />
          {/* twine gone slack */}
          <Twine d="M -9 -20.5 C -3 -16.2 3 -13.2 9 -11.5 C 9.4 -6.2 8.6 -0.8 9.2 4.5" />
          <Twine d="M 9 -20.5 C 3 -16.2 -3 -13.2 -9 -11.5 C -9.4 -6.2 -8.6 -0.8 -9.2 4.5" />
          {/* one loop still holding, the other pulled long */}
          <path
            d="M -0.4 -16.8 C -4.6 -21.6 -10.2 -19.4 -7.8 -16.6 C -6.2 -14.8 -2.4 -15 -0.4 -16.8 Z"
            fill={LINEN}
            stroke={INK}
            strokeWidth={SW_FINE}
          />
          <Twine d="M 1 -16 C 6 -12.4 8.4 -5.2 13 1.5" />
          <circle cx={0.2} cy={-15.9} r={1.5} fill={LINEN_SHADE} stroke={INK} strokeWidth={SW_FINE} />
          <path d="M 1.6 -15.4 C 3.8 -14.6 5.6 -13.6 7 -12.2" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <ellipse cx={9.4} cy={-8} rx={4.6} ry={1.6} fill="#3a2518" opacity={0.1} stroke="none" />
          <ParcelTag transform="translate(9.8 -10.4) rotate(22)" />
        </g>
      )}
      {stage === 'open' && (
        <g>
          {/* back flaps folded outward, standing behind the rim */}
          <path d="M 0 -25 L -18 -16 L -23.5 -24.5 L -6 -33.5 Z" fill={shade(KRAFT, FACE_LEFT)} stroke={INK} strokeWidth={SW} />
          <path d="M 0 -25 L 18 -16 L 23.5 -24.5 L 6 -33.5 Z" fill={KRAFT} stroke={INK} strokeWidth={SW} />
          <path
            d={wobblyLine(4.5, -26.8, 16, -21.2, PARCEL_SEED * 23, 0.4)}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={SW_HAIR}
            opacity={0.35}
          />
          {/* box walls and rim, graded toward the light */}
          <path d={PARCEL_FACES.left} fill="url(#oh-parcel-g2)" />
          <path d={PARCEL_FACES.right} fill="url(#oh-parcel-g1)" />
          <path d={PARCEL_FACES.top} fill="url(#oh-parcel-g0)" />
          <path d={PARCEL_FACES.outline} fill="none" stroke={INK} strokeWidth={SW} />
          <path d={edgeLight(0.9, 0.9, 16)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
          {/* paper-lined interior, depth pooled toward its heart */}
          <path d={PARCEL_MOUTH} fill={PAPER_SHADE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <path d={isoDiamond(0.56, 0.56, 15.4)} fill="#3a2518" opacity={0.12} stroke="none" />
          {/* tissue lip catching the light along the mouth's east edge */}
          <path d="M 1.3 -21.9 L 11.5 -16.9" fill="none" stroke={shade(PAPER_SHADE, 0.18)} strokeWidth={0.9} opacity={0.8} />
          {/* the gift: a soft paper-wrapped bundle rising out, crown lit */}
          <path d={softEllipse(0, -18.5, 7.5, 4.2, PARCEL_SEED * 13)} fill={PAPER} stroke={INK} strokeWidth={SW} />
          <path d={softEllipse(1.6, -20.2, 4.2, 2.1, PARCEL_SEED * 19)} fill={shade(PAPER, 0.14)} opacity={0.4} stroke="none" />
          <path d="M -4.2 -20 Q 0 -21.8 4 -19.8" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          <path d="M -0.8 -22.4 Q 0 -23.6 1 -22.5" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
          {/* front flaps folded down over the near faces, creased in shade */}
          <path d="M -18 -16 L 0 -7 L 0 1 L -18 -8 Z" fill={shade(KRAFT_SHADE, FACE_LEFT)} stroke={INK} strokeWidth={SW_FINE} />
          <path d="M 18 -16 L 0 -7 L 0 1 L 18 -8 Z" fill={shade(KRAFT_SHADE, FACE_RIGHT)} stroke={INK} strokeWidth={SW_FINE} />
          <path d="M -17.4 -15 L 0 -6.2 M 17.4 -15 L 0 -6.2" fill="none" stroke="#3a2518" strokeWidth={1.2} opacity={0.12} />
          {/* twine set aside, still holding a loop */}
          <ellipse cx={-21} cy={6.8} rx={8} ry={2} fill="#3a2518" opacity={0.08} stroke="none" />
          <Twine d="M -28 7 C -24 3.4 -19 4.2 -20.2 6.6 C -21 8.2 -24.4 7.4 -22.6 5 C -21 2.8 -16.6 4.4 -14.2 6" />
          {/* the tag, face-up where it can be read */}
          <ellipse cx={25.4} cy={4} rx={5} ry={1.6} fill="#3a2518" opacity={0.08} stroke="none" />
          <ParcelTag transform="translate(25 3) scale(1 0.6) rotate(-14)" />
        </g>
      )}
    </g>
  );
};

/* ── Torn paper — a tender drift of swept wrapping ────────────── */

export const TornPaperArt = (_: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      {/* torn kraft warming toward the upper-right light */}
      <linearGradient id="oh-tornpaper-g0" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(KRAFT, -0.02)} />
        <stop offset="1" stopColor={shade(KRAFT, 0.07)} />
      </linearGradient>
    </defs>
    {/* slivers of contact shade seating each scrap on the floor */}
    <path d="M -16.6 1 L -9.6 -1" fill="none" stroke="#3a2518" strokeWidth={1} opacity={0.12} />
    <path d="M 6.2 1.7 L 13.4 0.7" fill="none" stroke="#3a2518" strokeWidth={1} opacity={0.12} />
    <path d="M -0.6 1.3 L 5.6 0.7" fill="none" stroke="#3a2518" strokeWidth={0.8} opacity={0.1} />
    {/* the tag corner, peeking from under a scrap */}
    <path d="M -1 0.8 L 5.8 0.2 L 6.2 -3 L 0 -2.4 Z" fill={PAPER} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M 1.8 -1.2 L 4.4 -1.4" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeDasharray="1.4 1" />
    {/* four torn kraft scraps lying flat, one underside-up */}
    <path d="M -17 0.5 L -9.4 -1.5 L -11 -5 L -16.4 -4.2 Z" fill="url(#oh-tornpaper-g0)" stroke={INK} strokeWidth={SW_FINE} />
    {/* the sliver of shade under an overlapping scrap */}
    <path d="M -5.2 3.4 L 2.6 2.4" fill="none" stroke="#3a2518" strokeWidth={1} opacity={0.12} />
    <path d="M -5.2 2.8 L 2.6 1.8 L 4 -1.4 L -2.4 -2.6 Z" fill={KRAFT_SHADE} stroke={INK} strokeWidth={SW_FINE} />
    {/* a crease where the underside-up scrap folded */}
    <path d="M -3.4 1.6 L 2.2 -1.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.45} />
    <path d="M 6.4 1.2 L 13.6 0.2 L 12.2 -3 L 6 -2 Z" fill="url(#oh-tornpaper-g0)" stroke={INK} strokeWidth={SW_FINE} />
    {/* warm edge ticks where the paper curls from the light */}
    <path d="M -16.4 0.2 L -10 -1.5" fill="none" stroke={KRAFT_SHADE} strokeWidth={0.7} opacity={0.9} />
    <path d="M 6.8 0.9 L 13 0" fill="none" stroke={KRAFT_SHADE} strokeWidth={0.7} opacity={0.9} />
    {/* near-white ticks along the far edges greeting the light */}
    <path d="M -15.8 -4 L -11.5 -4.7" fill="none" stroke="#fff6e6" strokeWidth={0.7} opacity={0.4} />
    <path d="M 6.5 -1.9 L 11.8 -2.7" fill="none" stroke="#fff6e6" strokeWidth={0.7} opacity={0.4} />
    <path d="M 15.4 2.4 L 19.8 1.6 L 18.6 -0.9 L 15 -0.2 Z" fill={KRAFT} stroke={INK} strokeWidth={SW_FINE} />
    {/* torn-fibre ticks */}
    <path
      d="M -13.4 -4.8 L -12.8 -5.6 M -11.9 -4.5 L -11.4 -5.2 M 10.6 -2.8 L 11.1 -3.5"
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    {/* the twine, still holding the shape of its bow — shade trailing under it */}
    <path
      d="M -13.2 -0.2 C -7 -3.4 -1.6 1 3 -1.2 C 6.4 -2.8 5.6 -5.2 3.4 -4.2 C 1.4 -3.2 4 -0.6 8.6 -1.3 C 12.4 -1.8 14.6 -0.4 17 -0.9"
      fill="none"
      stroke="#3a2518"
      strokeWidth={2.2}
      opacity={0.08}
    />
    <Twine d="M -13.2 -1 C -7 -4.2 -1.6 0.2 3 -2 C 6.4 -3.6 5.6 -6 3.4 -5 C 1.4 -4 4 -1.4 8.6 -2.1 C 12.4 -2.6 14.6 -1.2 17 -1.7" />
  </g>
);

/**
 * OUR HOME — surfaces (tables, shelf, bookcase), redrawn for the 2:1 iso room.
 *
 * Chunky Tuber-Simulator volumes built from isoBoxFaces / isoCylinder, one
 * shared light (top bright, right dim, left dark), sepia INK outlines.
 * Floor pieces draw around (0,0) = the centre of their tile footprint on the
 * floor plane (negative y up). The floating shelf is a wall piece: drawn flat
 * around its hang point, then skewed onto the wall plane. Finish pass: large
 * faces carry subtle shade()-derived gradients, floor pieces ground on a soft
 * #3a2518 contact ellipse, and lit rims get a near-white edge light — still
 * no filters and no blend modes, only the palette, shaded.
 */
import type React from 'react';
import {
  INK,
  INK_SOFT,
  WINE,
  ROSE,
  PLUM_HEATHER,
  OAK,
  OAK_DEEP,
  WALNUT,
  WALNUT_DEEP,
  BRASS,
  SAGE,
  TERRACOTTA,
  SW,
  SW_FINE,
  SW_HAIR,
  wobblyLine,
  seedFrom,
} from '../homeArt';
import {
  isoBoxFaces,
  isoCylinder,
  isoDiamond,
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

const HW = TILE_W / 2; // 20 — screen px per tile along the col axis (x)
const HH = TILE_H / 2; // 10 — screen px per tile along the col axis (y)

/** A shaded, inked box volume — the room's basic brick.
 *  `topFill` / `rightFill` / `leftFill` let large faces carry a subtle
 *  2-stop gradient sheen instead of the flat face shade. */
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

/** 1.1px edge light just inside the top face's north→east rim — the edge
 *  greeting the upper-right room light. Trimmed clear of the corners. */
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

/** A hand-wobbled grain stroke along the col axis of a top face (w×d, lifted). */
const topGrain = (w: number, d: number, lift: number, v: number, seed: number): string => {
  const u = (w / 2) * (1 - Math.abs(v) / (d / 2)) * 0.9;
  return wobblyLine(
    (-u - v) * HW,
    (-u + v) * HH - lift,
    (u - v) * HW,
    (u + v) * HH - lift,
    seed,
    0.4,
  );
};

/* ── Side table — 1×1 tile, h 30, facings 1 ──────────────────── */

const SIDE_TABLE_TOP = isoCylinder(17, 6);

/** Round walnut slab on three splayed legs — the evening-things perch. */
export const SideTableArt = (_props: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-sidetable-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(WALNUT, 0.2)} />
        <stop offset="1" stopColor={shade(WALNUT, 0.02)} />
      </linearGradient>
      <linearGradient id="oh-sidetable-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(WALNUT_DEEP, 0.08)} />
        <stop offset="1" stopColor={shade(WALNUT_DEEP, -0.08)} />
      </linearGradient>
    </defs>
    {/* one soft contact shadow grounding the whole piece */}
    <ellipse cx={0} cy={1.5} rx={14.7} ry={4.7} fill="#3a2518" opacity={0.13} />
    {/* ambient occlusion pooled under each foot */}
    <ellipse cx={-12.5} cy={2.8} rx={3.2} ry={1.5} fill={INK} opacity={0.1} />
    <ellipse cx={12.5} cy={2.8} rx={3.2} ry={1.5} fill={INK} opacity={0.1} />
    <ellipse cx={0} cy={-6.7} rx={2.6} ry={1.2} fill={INK} opacity={0.09} />
    {/* back leg (deeper into the room, so higher on screen) */}
    <path d="M -1.6 -18 L 1.6 -18 L 1.3 -7 L -1.3 -7 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    {/* two splayed front legs */}
    <path d="M -4.6 -19 L -1.6 -19 L -11 2.5 L -14 2.5 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M 1.6 -19 L 4.6 -19 L 14 2.5 L 11 2.5 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    {/* the slab's self-shadow riding down each leg where it emerges */}
    <g fill="#3a2518" opacity={0.12} stroke="none">
      <path d="M -5.9 -16 L -2.9 -16 L -5.1 -11 L -8.1 -11 Z" />
      <path d="M 2.9 -16 L 5.9 -16 L 8.1 -11 L 5.1 -11 Z" />
      <path d="M -1.5 -15 L 1.5 -15 L 1.4 -11.5 L -1.4 -11.5 Z" />
    </g>
    {/* round top slab, lifted to −24..−30 */}
    <g transform="translate(0 -24)">
      <path d={SIDE_TABLE_TOP.side} fill="url(#oh-sidetable-g1)" stroke={INK} strokeWidth={SW} />
      <ellipse
        cx={SIDE_TABLE_TOP.topCx}
        cy={SIDE_TABLE_TOP.topCy}
        rx={SIDE_TABLE_TOP.rx}
        ry={SIDE_TABLE_TOP.ry}
        fill="url(#oh-sidetable-g0)"
        stroke={INK}
        strokeWidth={SW}
      />
      {/* turned-wood rings on the disc */}
      <ellipse cx={0} cy={-6} rx={10} ry={5} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <ellipse cx={0} cy={-6} rx={4.5} ry={2.2} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {/* two grain whispers riding the disc */}
      <path d={wobblyLine(-9, -4.4, 8, -5.2, 4.7, 0.3)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.5} />
      <path d={wobblyLine(-7, -8.2, 6.5, -8.8, 9.3, 0.3)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.4} />
      {/* varnish highlight crescent toward the light */}
      <path d="M 3.5 -9.6 A 12.5 6.2 0 0 1 12.6 -4.4" fill="none" stroke={shade(WALNUT, 0.32)} strokeWidth={1.1} opacity={0.85} />
      {/* near-white edge light along the disc's lit upper-right rim */}
      <path d="M 4.8 -13.4 A 15.6 7.8 0 0 1 14.5 -8.9" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
    </g>
  </g>
);

/* ── Low table — 2×1 tiles, h 22, facings 1 ──────────────────── */

/** Leg posts near the four footprint corners, drawn far to near. */
const LOW_TABLE_LEGS: ReadonlyArray<readonly [number, number]> = [
  [-9, -10.5], [-21, -4.5], [21, 4.5], [9, 10.5],
];
const LOW_TABLE_SEED = 6.4 + seedFrom('low-table-grain') * 9;

/** Honey oak slab on four square legs; grain rides the diamond axes. */
export const LowTableArt = (_props: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-lowtable-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(OAK, 0.18)} />
        <stop offset="1" stopColor={shade(OAK, 0.02)} />
      </linearGradient>
    </defs>
    {/* one soft contact shadow grounding the whole piece */}
    <ellipse cx={0} cy={1.5} rx={25.8} ry={8.3} fill="#3a2518" opacity={0.13} />
    {/* ambient occlusion pooled under each leg */}
    {LOW_TABLE_LEGS.map(([lx, ly]) => (
      <ellipse key={`ao-${lx},${ly}`} cx={lx} cy={ly + 0.6} rx={3} ry={1.4} fill={INK} opacity={0.1} />
    ))}
    {LOW_TABLE_LEGS.map(([lx, ly]) => (
      <g key={`${lx},${ly}`} transform={`translate(${lx} ${ly})`}>
        <IsoBox base={OAK_DEEP} w={0.18} d={0.18} h={17} sw={SW_FINE} />
        {/* slab's self-shadow hugging the top of the post */}
        <path
          d="M -3.6 -17 L 0 -15.2 L 3.6 -17 L 3.6 -11 L 0 -9.2 L -3.6 -11 Z"
          fill="#3a2518"
          opacity={0.12}
          stroke="none"
        />
      </g>
    ))}
    {/* the slab — full 2×1 footprint, lifted onto the legs */}
    <g transform="translate(0 -16)">
      <IsoBox base={OAK} w={2} d={1} h={6} topFill="url(#oh-lowtable-g0)" />
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
        <path d={topGrain(2, 1, 6, -0.22, LOW_TABLE_SEED)} />
        <path d={topGrain(2, 1, 6, 0.03, LOW_TABLE_SEED * 3)} />
        <path d={topGrain(2, 1, 6, 0.26, LOW_TABLE_SEED * 5)} />
        {/* end-grain whisper along the apron's long lit face */}
        <path d={wobblyLine(27, 2.4, 13, 9.4, LOW_TABLE_SEED * 7, 0.3)} opacity={0.42} />
      </g>
      {/* near-white edge light + a varnish crescent near the lit east corner */}
      <path d={edgeLight(2, 1, 6)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.5} />
      <path d="M 14 -6 Q 20 -4.5 24 -1.6" fill="none" stroke={shade(OAK, 0.34)} strokeWidth={1} opacity={0.8} />
    </g>
  </g>
);

/* ── Floating shelf — wall item, plank 72×8, facings 2 ───────── */

/** Walnut plank + two brass brackets, drawn flat around the hang point and
 *  skewed onto the wall: facing 0 hangs on the LEFT wall, facing 1 the RIGHT. */
export const FloatingShelfArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L}
  >
    <defs>
      <linearGradient id="oh-shelf-g0" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(WALNUT, 0.12)} />
        <stop offset="1" stopColor={shade(WALNUT, -0.06)} />
      </linearGradient>
      <linearGradient id="oh-shelf-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(BRASS, 0.06)} />
        <stop offset="1" stopColor={shade(BRASS, -0.22)} />
      </linearGradient>
    </defs>
    {/* soft occlusion where plank and brackets meet the wall */}
    <rect x={-33} y={0} width={66} height={1.8} fill={INK} opacity={0.08} stroke="none" />
    {/* brass brackets below the plank — lit shoulder up, underside falling dark */}
    <path d="M -26 0 L -15.5 0 L -26 9.5 Z" fill="url(#oh-shelf-g1)" stroke={INK} strokeWidth={SW_FINE} />
    <path d="M 15.5 0 L 26 0 L 26 9.5 Z" fill="url(#oh-shelf-g1)" stroke={INK} strokeWidth={SW_FINE} />
    {/* the plank's shadow pooling on each bracket's shoulder */}
    <path d="M -26 0 L -15.5 0 L -17.9 2.2 L -26 2.2 Z" fill="#3a2518" opacity={0.13} stroke="none" />
    <path d="M 15.5 0 L 26 0 L 26 2.2 L 17.9 2.2 Z" fill="#3a2518" opacity={0.13} stroke="none" />
    {/* one crisp specular on each bracket's lit shoulder */}
    <path d="M -18.4 1.6 L -24.2 6.8" fill="none" stroke="#fff3dc" strokeWidth={1} opacity={0.55} />
    <path d="M 24.6 1.6 L 24.6 7.4" fill="none" stroke="#fff3dc" strokeWidth={1} opacity={0.55} />
    {/* the plank — 72 wide, 8 thick, wearing a soft varnish falloff */}
    <rect x={-36} y={-8} width={72} height={8} rx={1.5} fill="url(#oh-shelf-g0)" stroke={INK} strokeWidth={SW} />
    <rect x={-34.6} y={-7} width={69.2} height={2.6} rx={1} fill={shade(WALNUT, 0.14)} />
    {/* darker end-grain caps at both cut ends */}
    <rect x={-35.4} y={-7.1} width={1.8} height={6.2} rx={0.8} fill={shade(WALNUT, -0.18)} stroke="none" />
    <rect x={33.6} y={-7.1} width={1.8} height={6.2} rx={0.8} fill={shade(WALNUT, -0.18)} stroke="none" />
    {/* near-white edge light along the lit top edge */}
    <path d="M -32 -7.1 L 32 -7.1" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
    {/* hairline grain along the plank */}
    <path
      d={wobblyLine(-30, -3.4, 30, -3.8, 8.2 + seedFrom('shelf-grain') * 6, 0.35)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    <path
      d={wobblyLine(-26, -1.8, 27, -2.1, 3.4 + seedFrom('shelf-grain-b') * 6, 0.3)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      opacity={0.55}
    />
  </g>
);

/* ── Bookcase — 2 tiles long × 1 deep, h 64, detail = spines ─── */

/**
 * The case is built as isoBoxFaces(1, 2, …) so its RIGHT face — the one that
 * faces the viewer's lower-right — spans the full 2-tile length and carries
 * the open front. Facing 1 mirrors the whole piece (front faces lower-left).
 */
const BC_EAST_X = (1 + 2) * (TILE_W / 4); // east corner of the 1×2 footprint
const BC_EAST_Y = (1 - 2) * (TILE_H / 4);
const bcX = (t: number): number => BC_EAST_X - t * HW;
const bcY = (t: number, y: number): number => BC_EAST_Y + t * HH + y;

/** A parallelogram painted on the case's open right face (t along, y up-neg). */
const bcRect = (t0: number, t1: number, y0: number, y1: number): string =>
  `M ${bcX(t0).toFixed(1)} ${bcY(t0, y0).toFixed(1)}`
  + ` L ${bcX(t1).toFixed(1)} ${bcY(t1, y0).toFixed(1)}`
  + ` L ${bcX(t1).toFixed(1)} ${bcY(t1, y1).toFixed(1)}`
  + ` L ${bcX(t0).toFixed(1)} ${bcY(t0, y1).toFixed(1)} Z`;

const SPINE_COLORS: readonly string[] = [
  WINE, SAGE, PLUM_HEATHER, ROSE, WALNUT, BRASS, TERRACOTTA,
];
/** Two shelf openings carved into the front: [bottom y, top y] in body coords. */
const BC_SHELVES: ReadonlyArray<readonly [number, number]> = [[-6, -23], [-29, -46]];
const BC_HOLLOW = shade(OAK_DEEP, -0.45);
/** The case body's faces — reused for the sheen overlay on the open front. */
const BC_BODY_FACES = isoBoxFaces(1, 2, 53);

/** Oak case: plinth, carved two-shelf front holding memory spines, cornice. */
export const BookcaseArt = ({ facing, detail }: ObjectArtProps): React.JSX.Element => {
  const count = Math.max(0, Math.min(14, Math.floor(detail ?? 0)));
  const spines: React.JSX.Element[] = [];
  for (let gi = 0; gi < count; gi += 1) {
    const [shelfBottom] = BC_SHELVES[gi < 7 ? 0 : 1];
    const slot = gi % 7;
    const t0 = 0.24 + slot * 0.215;
    const h = 11 + seedFrom(`bookcase-spine-${gi}`) * 5;
    const yTop = shelfBottom - h;
    const cloth = SPINE_COLORS[gi % SPINE_COLORS.length] ?? WINE;
    spines.push(
      <g key={gi}>
        <path
          d={bcRect(t0, t0 + 0.17, shelfBottom, yTop)}
          fill={cloth}
          stroke={INK}
          strokeWidth={SW_HAIR}
        />
        {/* hinge edge turning away from the light */}
        <path
          d={bcRect(t0 + 0.125, t0 + 0.165, shelfBottom - 0.5, yTop + 0.5)}
          fill={shade(cloth, -0.18)}
          stroke="none"
        />
        {/* lit head cap — the page block peeking over the spine */}
        <path
          d={`M ${bcX(t0 + 0.03).toFixed(1)} ${bcY(t0 + 0.03, yTop + 1.3).toFixed(1)} L ${bcX(t0 + 0.14).toFixed(1)} ${bcY(t0 + 0.14, yTop + 1.3).toFixed(1)}`}
          fill="none"
          stroke="#fff6e6"
          strokeWidth={SW_HAIR}
          opacity={0.4}
        />
      </g>,
    );
  }
  return (
    <g
      strokeLinecap="round"
      strokeLinejoin="round"
      transform={facing === 1 ? 'scale(-1 1)' : undefined}
    >
      <defs>
        <linearGradient id="oh-bookcase-g0" x1="0.8" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={shade(OAK, 0.18)} />
          <stop offset="1" stopColor={shade(OAK, 0.02)} />
        </linearGradient>
        <linearGradient id="oh-bookcase-g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(OAK, 0.25)} stopOpacity={0.3} />
          <stop offset="1" stopColor={shade(OAK, 0.25)} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="oh-bookcase-g2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(OAK, FACE_LEFT + 0.07)} />
          <stop offset="1" stopColor={shade(OAK, FACE_LEFT - 0.06)} />
        </linearGradient>
      </defs>
      {/* one soft contact shadow grounding the whole piece */}
      <ellipse cx={0} cy={1.5} rx={29} ry={9.3} fill="#3a2518" opacity={0.13} />
      {/* ambient occlusion where the plinth meets the floor */}
      <path d={isoDiamond(1.18, 2.18, 0)} fill={INK} opacity={0.08} stroke="none" />
      {/* plinth */}
      <IsoBox base={OAK_DEEP} w={1.08} d={2.08} h={5} sw={SW_FINE} />
      {/* the case body, riding the plinth */}
      <g transform="translate(0 -5)">
        <IsoBox base={OAK} w={1} d={2} h={53} leftFill="url(#oh-bookcase-g2)" />
        {/* varnish sheen falling down the open front */}
        <path d={BC_BODY_FACES.right} fill="url(#oh-bookcase-g1)" stroke="none" />
        {/* the cornice's shadow tucked under its overhang, both faces */}
        <path d={bcRect(0, 2, -49.8, -53)} fill="#3a2518" opacity={0.12} stroke="none" />
        <path d="M -30 -48 L -10 -38 L -10 -34.8 L -30 -44.8 Z" fill="#3a2518" opacity={0.12} stroke="none" />
        {/* grain whispers between the shelf openings */}
        <path d={`M ${bcX(0.2).toFixed(1)} ${bcY(0.2, -49.5).toFixed(1)} L ${bcX(1.8).toFixed(1)} ${bcY(1.8, -49.5).toFixed(1)}`} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.45} />
        <path d={`M ${bcX(0.25).toFixed(1)} ${bcY(0.25, -2.6).toFixed(1)} L ${bcX(1.75).toFixed(1)} ${bcY(1.75, -2.6).toFixed(1)}`} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.45} />
        {/* two shelf hollows carved into the open front */}
        {BC_SHELVES.map(([yb, yt]) => (
          <path
            key={yb}
            d={bcRect(0.16, 1.84, yb, yt)}
            fill={BC_HOLLOW}
            stroke={INK_SOFT}
            strokeWidth={SW_FINE}
          />
        ))}
        {/* occlusion tucked under each shelf's overhang */}
        {BC_SHELVES.map(([, yt]) => (
          <path
            key={`ao-${yt}`}
            d={bcRect(0.16, 1.84, yt + 4.5, yt)}
            fill={INK}
            opacity={0.18}
            stroke="none"
          />
        ))}
        {/* clothbound memory spines, bottom shelf first */}
        {spines}
        {/* occlusion where the spines meet the shelf floor */}
        {BC_SHELVES.map(([yb]) => (
          <path
            key={`aof-${yb}`}
            d={bcRect(0.16, 1.84, yb, yb - 1.6)}
            fill={INK}
            opacity={0.14}
            stroke="none"
          />
        ))}
      </g>
      {/* cornice slab */}
      <g transform="translate(0 -58)">
        <IsoBox base={OAK} w={1.14} d={2.14} h={6} sw={SW_FINE} topFill="url(#oh-bookcase-g0)" />
        <path d={edgeLight(1.14, 2.14, 6)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.5} />
      </g>
    </g>
  );
};

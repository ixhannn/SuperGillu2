/**
 * OUR HOME — small things: mugs, coffee pot, cookie plate, notepad, vase,
 * book, sill pot, Coco's basket and Coco herself — redrawn for the 2:1
 * isometric corner room.
 *
 * Volumes come from homeIso (isoBoxFaces / isoCylinder / isoDiamond + shade,
 * lit from the upper right: top faces brightest, right dim, left darkest).
 * Local coordinates: (0,0) is the centre of the footprint ON the resting
 * plane, negative y is up; table-things stay tight around the origin.
 * Depth is painted, never filtered: soft alpha gradients, '#3a2518'
 * grounding shadows and '#fff6e6' edge lights — no SVG filters, no blend
 * modes. `oh-steam` / `oh-breathe` are CSS animation hooks.
 */
import type React from 'react';
import {
  BLOOM_ROSE,
  BRASS,
  CREAM_WALL,
  INK,
  INK_SOFT,
  LINEN,
  LINEN_SHADE,
  OAK,
  OAK_DEEP,
  PAPER,
  PAPER_SHADE,
  ROSE,
  ROSE_PALE,
  SAGE,
  SW,
  SW_FINE,
  SW_HAIR,
  TERRACOTTA,
  WALNUT,
  WALNUT_DEEP,
  WINE,
  seedFrom,
  softEllipse,
  wobblyLine,
} from '../homeArt';
import {
  FACE_LEFT,
  FACE_RIGHT,
  FACE_TOP,
  isoBoxFaces,
  isoCylinder,
  isoDiamond,
  shade,
} from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/* ── Finish language (shared by every small thing) ───────────── */

/** Near-white edge light on rims that face the upper-right lamp. */
const EDGE_LIGHT = '#fff6e6';
/** One crisp specular for brass, silk and liquid. */
const SPECULAR = '#fff3dc';
/** The app's grounding-shadow colour. */
const GROUND = '#3a2518';

/* ── Iso helpers (local to the small things) ─────────────────── */

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
const Cyl = ({ r, h, base, lift = 0, sw = SW_FINE }: CylProps): React.JSX.Element => {
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

/* ── Mugs — isoCylinder r 4.5 h 8 · vState 'steam' | 'ring' | 'plain' ─ */

const MUG_WISPS: readonly string[] = [
  'M -1.7 -9.8 C -2.7 -11 -1.1 -11.8 -1.9 -13.2',
  'M 1.9 -9.6 C 1 -10.8 2.6 -11.6 1.8 -13',
];

const MUG_CYL = isoCylinder(4.5, 8);

interface MugBaseProps {
  rim: string;
  mirrored: boolean;
  vState?: string;
}

/** Shared stout mug: cream body, coloured rim ellipse, tiny handle arc. */
const MugBase = ({ rim, mirrored, vState }: MugBaseProps): React.JSX.Element => (
  <g
    transform={mirrored ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="oh-mug-g0" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0.5} />
        <stop offset="1" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0} />
      </linearGradient>
    </defs>
    {/* ring stain left on the surface plane */}
    {vState === 'ring' && (
      <ellipse cx={0.4} cy={0.4} rx={6.6} ry={3.3} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    )}
    {/* grounding shadow where the mug sits */}
    <ellipse cx={0} cy={0.5} rx={5} ry={2.4} fill={GROUND} opacity={0.1} />
    <Cyl r={4.5} h={8} base={CREAM_WALL} />
    {/* glaze — a soft vertical falloff down the ceramic */}
    <path d={MUG_CYL.side} fill="url(#oh-mug-g0)" stroke="none" />
    {/* darker foot ring where the glaze thins */}
    <path d="M -4.3 0 A 4.4 2.2 0 0 0 4.3 0" fill="none" stroke={shade(CREAM_WALL, -0.2)} strokeWidth={1} opacity={0.45} />
    {/* coloured rim + the coffee inside */}
    <ellipse cx={0} cy={-8} rx={4.5} ry={2.25} fill={rim} stroke={INK} strokeWidth={SW_FINE} />
    <ellipse cx={0} cy={-8} rx={3} ry={1.5} fill={WALNUT_DEEP} stroke="none" />
    {/* light skating across the coffee */}
    <path d="M -1.6 -8.4 Q 0 -9.1 1.6 -8.4" fill="none" stroke={SPECULAR} strokeWidth={0.6} opacity={0.55} />
    {/* rim catching the light */}
    <path d="M -3.4 -9.4 A 3.9 1.95 0 0 1 3.4 -9.4" fill="none" stroke={shade(rim, 0.32)} strokeWidth={0.8} opacity={0.9} />
    {/* near-white edge light along the lit lip */}
    <path d="M -3.9 -9.1 A 4.2 2.1 0 0 1 3.9 -9.1" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.7} opacity={0.4} />
    {/* tiny handle */}
    <path d="M 4.3 -6.6 C 7.1 -7 7.5 -3 4.5 -2.6" fill="none" stroke={INK} strokeWidth={SW_FINE} />
    {vState === 'steam' &&
      MUG_WISPS.map((d, i) => (
        <g key={i} className="oh-steam">
          <path d={d} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
        </g>
      ))}
  </g>
);

/** Wine-rimmed mug, handle to the right. */
export const MugWineArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => (
  <MugBase rim={WINE} mirrored={facing === 1} vState={vState} />
);

/** Brass-rimmed mug, handle to the left — the pair face one another. */
export const MugGoldArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => (
  <MugBase rim={BRASS} mirrored={facing !== 1} vState={vState} />
);

/* ── CoffeePotArt — isoCylinder r 7 h 14 · vState 'steam' | 'plain' ── */

const COFFEE_WISPS: readonly string[] = [
  'M -11 -16 C -12 -17.4 -10.2 -18.4 -11.2 -20',
  'M -9.8 -16.4 C -10.6 -17.8 -9 -18.8 -9.8 -20.4',
];

const POT_CYL = isoCylinder(7, 14);

/** Cream enamel pot: brass knob and spout, wisps rise when it's brewing. */
export const CoffeePotArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="oh-coffeepot-g0" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0.5} />
        <stop offset="1" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0} />
      </linearGradient>
      <linearGradient id="oh-coffeepot-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stopColor={shade(CREAM_WALL, -0.2)} stopOpacity={0} />
        <stop offset="1" stopColor={shade(CREAM_WALL, -0.2)} stopOpacity={0.4} />
      </linearGradient>
    </defs>
    {/* grounding shadow where the pot sits */}
    <ellipse cx={0} cy={0.6} rx={7.4} ry={3.4} fill={GROUND} opacity={0.11} />
    {/* brass spout, poured from the left — one crisp specular on its lip */}
    <path
      d="M -6.6 -8.2 C -10.4 -9.4 -12 -12 -11.4 -14.8 C -10 -13.4 -8.2 -12.6 -6.8 -12.4 Z"
      fill={BRASS}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    <path d="M -10.9 -14.2 C -9.9 -13.2 -8.6 -12.7 -7.6 -12.5" fill="none" stroke={shade(BRASS, 0.45)} strokeWidth={0.8} opacity={0.9} />
    {/* …and the spout's underside falling into shade */}
    <path d="M -7 -8.6 C -10 -9.8 -11.3 -11.9 -11.3 -13.9" fill="none" stroke={shade(BRASS, -0.3)} strokeWidth={0.8} opacity={0.7} />
    {/* enamel body, glaze falling soft down the ceramic */}
    <Cyl r={7} h={14} base={CREAM_WALL} sw={SW} />
    <path d={POT_CYL.side} fill="url(#oh-coffeepot-g0)" stroke="none" />
    {/* enamel settling darker toward the table */}
    <path d={POT_CYL.side} fill="url(#oh-coffeepot-g1)" stroke="none" />
    {/* handle */}
    <path d="M 6.7 -12.4 C 10.8 -11.6 10.8 -5.2 6.8 -4.4" fill="none" stroke={INK} strokeWidth={SW} />
    {/* near-white edge light along the lit rim */}
    <path d="M -5.7 -15.6 A 6.4 3.2 0 0 1 5.7 -15.6" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.9} opacity={0.4} />
    {/* lid seam + brass knob with a glint */}
    <ellipse cx={0} cy={-14} rx={4.8} ry={2.4} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    {/* the knob's soft print on the lid */}
    <ellipse cx={0.5} cy={-14.3} rx={2.4} ry={1.1} fill={GROUND} opacity={0.12} stroke="none" />
    <circle cx={0} cy={-16.2} r={1.9} fill={BRASS} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -0.9 -17 Q 0 -17.7 0.9 -17" fill="none" stroke={shade(BRASS, 0.5)} strokeWidth={0.7} opacity={0.9} />
    {/* steam from the spout */}
    {vState === 'steam' &&
      COFFEE_WISPS.map((d, i) => (
        <g key={i} className="oh-steam">
          <path d={d} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
        </g>
      ))}
  </g>
);

/* ── CookiePlateArt — flat ellipse rx 11 · detail = cookies left 0–5 ─ */

/** Scallop dips running the plate's front rim. */
const PLATE_SCALLOP_D = ((): string => {
  const rx = 11;
  const n = 8;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const x = -10.4 + (20.8 / n) * i;
    return { x, y: -1.2 + frontEdge(x, rx) };
  });
  const first = pts[0];
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let i = 1; i <= n; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    d += ` Q ${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2 + 1.1).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
})();

const COOKIE_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-5.2, -4.2],
  [0.4, -5.6],
  [5.4, -4],
  [-2.4, -2.2],
  [2.8, -2],
];
const COOKIE_CHIPS: ReadonlyArray<readonly [number, number]> = [
  [-0.7, -0.4],
  [0.8, -0.2],
  [0, 0.6],
];

/** Scalloped cream plate; `detail` cookies remain, crumbs when they're gone. */
export const CookiePlateArt = ({ detail }: ObjectArtProps): React.JSX.Element => {
  const cookies = Math.max(0, Math.min(5, Math.round(detail ?? 0)));
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-cookieplate-g0" x1="0.8" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={shade(CREAM_WALL, 0.2)} />
          <stop offset="1" stopColor={shade(CREAM_WALL, 0.03)} />
        </linearGradient>
      </defs>
      {/* grounding shadow where the plate rests */}
      <ellipse cx={0} cy={0.6} rx={10.8} ry={4.4} fill={GROUND} opacity={0.1} />
      {/* plate foot / under-rim */}
      <ellipse cx={0} cy={-1.2} rx={11} ry={5.5} fill={PAPER_SHADE} stroke={INK} strokeWidth={SW_FINE} />
      {/* darker foot ring shading the near under-rim */}
      <path d="M -9.4 0 A 10.4 5.2 0 0 0 9.4 0" fill="none" stroke={shade(PAPER_SHADE, -0.16)} strokeWidth={1.1} opacity={0.5} />
      {/* plate top */}
      <ellipse
        cx={0}
        cy={-2.4}
        rx={10.2}
        ry={5.1}
        fill="url(#oh-cookieplate-g0)"
        stroke={INK}
        strokeWidth={SW_FINE}
      />
      {/* rim catching the lamp along its back edge */}
      <path d="M -8.6 -4.9 A 10 5 0 0 1 8.6 -4.9" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.9} opacity={0.4} />
      {/* the plate's shallow well */}
      <ellipse cx={0} cy={-2.4} rx={7.4} ry={3.6} fill={INK} opacity={0.05} stroke="none" />
      {/* scalloped front edge */}
      <path d={PLATE_SCALLOP_D} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {/* cookies remaining — little oak discs, chips up */}
      {COOKIE_SPOTS.slice(0, cookies).map(([cx, cy], i) => (
        <g key={i}>
          {/* warm crumb-shadow pooled under each cookie */}
          <ellipse cx={cx + 0.4} cy={cy + 1.2} rx={2.7} ry={1.3} fill={GROUND} opacity={0.1} stroke="none" />
          <ellipse cx={cx} cy={cy + 0.7} rx={2.5} ry={1.5} fill={OAK_DEEP} stroke="none" />
          <ellipse cx={cx} cy={cy} rx={2.5} ry={1.5} fill={OAK} stroke={INK} strokeWidth={SW_HAIR} />
          {/* baked sheen on the lit shoulder */}
          <path
            d={`M ${(cx - 1.3).toFixed(1)} ${(cy - 0.7).toFixed(1)} Q ${cx.toFixed(1)} ${(cy - 1.4).toFixed(1)} ${(cx + 1.3).toFixed(1)} ${(cy - 0.7).toFixed(1)}`}
            fill="none"
            stroke={shade(OAK, 0.24)}
            strokeWidth={0.6}
            opacity={0.8}
          />
          {COOKIE_CHIPS.map(([dx, dy], j) => (
            <circle key={j} cx={cx + dx} cy={cy + dy} r={0.42} fill={INK_SOFT} />
          ))}
        </g>
      ))}
      {/* only crumbs left */}
      {cookies === 0 && (
        <g fill={INK_SOFT}>
          <circle cx={-3.2} cy={-2.6} r={0.7} />
          <circle cx={2.6} cy={-1.8} r={0.5} />
        </g>
      )}
    </g>
  );
};

/* ── NotepadArt — three flat sheets + a linen pencil cup ─────── */

/** One paper sheet laid flat on the surface plane. */
const SHEET_D = isoDiamond(0.42, 0.34);

/** Loose sheets slightly askew, and a linen cup holding an oak pencil. */
export const NotepadArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* sheet stack, each a touch crooked */}
    <g transform="translate(-3.5 0.6)">
      {/* warm cast shadow slipping out beneath the stack */}
      <ellipse cx={0.6} cy={0.8} rx={8.4} ry={3.3} fill={GROUND} opacity={0.08} stroke="none" />
      <g transform="rotate(-8)">
        <path d={SHEET_D} fill={PAPER_SHADE} stroke={INK} strokeWidth={SW_FINE} />
      </g>
      <g transform="rotate(6) translate(0.6 -0.4)">
        <path d={SHEET_D} fill={PAPER_SHADE} stroke={INK} strokeWidth={SW_FINE} />
      </g>
      <g transform="rotate(-2)">
        <path d={SHEET_D} fill={PAPER} stroke={INK} strokeWidth={SW_FINE} />
        {/* warm edge ticks along the sheet's near edges */}
        <path d="M 7 0.9 L 1.3 3.6" fill="none" stroke={PAPER_SHADE} strokeWidth={0.8} opacity={0.9} />
        <path d="M -6.9 -0.1 L 0.4 3.3" fill="none" stroke={PAPER_SHADE} strokeWidth={0.8} opacity={0.7} />
        {/* a scribbled line or two, following the plane */}
        <path d="M -4.2 -1.4 L 2.4 1.9" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
        <path d="M -4.8 0.2 L 0.6 2.9" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      </g>
    </g>
    {/* linen pencil cup */}
    <g transform="translate(7.5 -1.5)">
      {/* grounding shadow where the cup sits */}
      <ellipse cx={0} cy={0.4} rx={3.6} ry={1.7} fill={GROUND} opacity={0.1} />
      <Cyl r={3} h={6} base={LINEN} />
      {/* linen seams falling with the weave */}
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.5}>
        <path d="M -1.2 0.9 L -1.2 -4.3" />
        <path d="M 1.4 0.8 L 1.4 -4.4" />
      </g>
      {/* rim catching the lamp */}
      <path d="M -2.4 -6.6 A 2.8 1.4 0 0 1 2.4 -6.6" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.7} opacity={0.45} />
      <ellipse cx={0} cy={-6} rx={2} ry={1} fill={shade(LINEN, FACE_LEFT)} stroke="none" />
      {/* oak pencil leaning out */}
      <g transform="translate(1.1 -5.4) rotate(16)">
        <rect x={-0.9} y={-8.2} width={1.8} height={8.2} rx={0.4} fill={OAK} stroke={INK} strokeWidth={SW_HAIR} />
        {/* sheen along the pencil's lit edge */}
        <path d="M 0.45 -7.9 L 0.45 -0.5" fill="none" stroke={shade(OAK, 0.28)} strokeWidth={0.5} opacity={0.8} />
        <path d="M -0.9 -8.2 L 0 -10.2 L 0.9 -8.2 Z" fill={TERRACOTTA} stroke={INK} strokeWidth={SW_HAIR} />
      </g>
    </g>
  </g>
);

/* ── VaseArt — milk-glass isoCylinder r 5 h 12 · 'fresh' | 'dry' ─ */

/** Milk-glass flutes falling straight down the iso side. */
const VASE_FLUTES: readonly string[] = [-3.4, -1.2, 1.2, 3.4].map((x) => {
  const f = frontEdge(x, 5);
  return `M ${x} ${(-12 + f + 0.6).toFixed(1)} L ${x} ${(f - 0.6).toFixed(1)}`;
});

const VASE_CYL = isoCylinder(5, 12);

interface BlossomProps {
  x: number;
  y: number;
  fill: string;
}

/** A tri-lobed blossom, lower lobes falling into shade, crown catching light. */
const Blossom = ({ x, y, fill }: BlossomProps): React.JSX.Element => (
  <g>
    <circle cx={x} cy={y} r={2.1} fill={fill} stroke={INK} strokeWidth={SW_HAIR} />
    <circle cx={x - 1.4} cy={y + 0.9} r={1.2} fill={shade(fill, -0.1)} stroke={INK} strokeWidth={SW_HAIR} />
    <circle cx={x + 1.4} cy={y + 0.9} r={1.2} fill={shade(fill, -0.04)} stroke={INK} strokeWidth={SW_HAIR} />
    <path
      d={`M ${(x - 1.1).toFixed(1)} ${(y - 1.2).toFixed(1)} Q ${x.toFixed(1)} ${(y - 1.9).toFixed(1)} ${(x + 1.1).toFixed(1)} ${(y - 1.2).toFixed(1)}`}
      fill="none"
      stroke={EDGE_LIGHT}
      strokeWidth={0.6}
      opacity={0.5}
    />
    <circle cx={x} cy={y + 0.2} r={0.5} fill={INK_SOFT} />
  </g>
);

/** Fluted milk-glass vase; fresh blooms stand tall, dry ones droop and pale. */
export const VaseArt = ({ vState }: ObjectArtProps): React.JSX.Element => {
  const dry = vState === 'dry';
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-vase-g0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0.5} />
          <stop offset="1" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* grounding shadow where the vase rests */}
      <ellipse cx={0} cy={0.5} rx={5.6} ry={2.7} fill={GROUND} opacity={0.1} />
      {/* milk-glass body — a soft vertical sheen over the ceramic */}
      <Cyl r={5} h={12} base={CREAM_WALL} />
      <path d={VASE_CYL.side} fill="url(#oh-vase-g0)" stroke="none" />
      <g fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR}>
        {VASE_FLUTES.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* milk-glass sheen — one bright band on the lit side */}
      <path d="M 2.3 -9 L 2.3 1.2" fill="none" stroke={EDGE_LIGHT} strokeWidth={1.1} opacity={0.35} />
      {/* darker foot ring where the glass thickens */}
      <path d="M -4.3 0.4 A 4.6 2.3 0 0 0 4.3 0.4" fill="none" stroke={shade(CREAM_WALL, -0.2)} strokeWidth={1} opacity={0.45} />
      {/* stems rise from the mouth… */}
      {dry ? (
        <g fill="none" strokeWidth={SW_FINE}>
          <path d="M -0.6 -11.8 C -1.8 -14 -4.4 -14.4 -6.2 -12.8" stroke={shade(SAGE, -0.1)} />
          <path d="M 0 -12 C 0.3 -14.8 1.6 -15.8 3.2 -15" stroke={SAGE} />
          <path d="M 0.6 -11.8 C 1.8 -13.4 4.6 -13 6.2 -11" stroke={shade(SAGE, 0.1)} />
        </g>
      ) : (
        <g fill="none" strokeWidth={SW_FINE}>
          <path d="M -0.6 -11.8 C -1.4 -14.8 -3 -16.8 -4.4 -18.6" stroke={shade(SAGE, -0.1)} />
          <path d="M 0 -12 C 0.1 -15.2 0.1 -17.8 0 -20" stroke={SAGE} />
          <path d="M 0.6 -11.8 C 1.4 -14.8 3.2 -16 4.5 -17.4" stroke={shade(SAGE, 0.1)} />
        </g>
      )}
      {/* …and the mouth overlaps their feet — shadow pooled inside the rim */}
      <ellipse cx={0} cy={-12} rx={3.2} ry={1.6} fill={LINEN_SHADE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <ellipse cx={0} cy={-12} rx={2.2} ry={1} fill={INK} opacity={0.08} stroke="none" />
      {/* mouth lip catching the light */}
      <path d="M -2.6 -12.7 A 3 1.5 0 0 1 2.6 -12.7" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.6} opacity={0.5} />
      {dry ? (
        <g>
          <Blossom x={-6.6} y={-12.2} fill={ROSE_PALE} />
          <Blossom x={3.6} y={-14.4} fill={ROSE_PALE} />
          <Blossom x={6.5} y={-10.4} fill={ROSE_PALE} />
        </g>
      ) : (
        <g>
          <Blossom x={-4.5} y={-19} fill={BLOOM_ROSE} />
          <Blossom x={0} y={-20.4} fill={BLOOM_ROSE} />
          <Blossom x={4.6} y={-17.8} fill={BLOOM_ROSE} />
        </g>
      )}
    </g>
  );
};

/* ── BookArt — isoBoxFaces 0.45×0.3×5 · 'closed' | 'ribbon' | 'open' ─ */

const BOOK_FACES = isoBoxFaces(0.45, 0.3, 5);

/** The clothbound book lying flat, wine cover up, page block showing. */
const BookClosed = ({ ribbon }: { ribbon: boolean }): React.JSX.Element => (
  <g>
    <defs>
      <linearGradient id="oh-book-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(WINE, 0.22)} />
        <stop offset="1" stopColor={shade(WINE, 0.02)} />
      </linearGradient>
    </defs>
    {/* warm grounding shadow where the book lies */}
    <path d={isoDiamond(0.52, 0.37, 0)} fill={GROUND} opacity={0.1} stroke="none" />
    {/* brass ribbon spilling out onto the surface */}
    {ribbon && (
      <g>
        <path
          d="M 2 3.4 C 4 4.4 5.6 5.4 7 6.6 L 5.2 6.7 L 6 7.9 L 3.4 6.6 C 2.6 5.6 2.2 4.6 2 3.4 Z"
          fill={BRASS}
          stroke={INK}
          strokeWidth={SW_HAIR}
        />
        {/* one crisp glint along the silk */}
        <path d="M 3.1 4.3 C 4.3 5 5.3 5.7 6.1 6.4" fill="none" stroke={SPECULAR} strokeWidth={0.6} opacity={0.55} />
      </g>
    )}
    {/* paper page edges on the two side faces */}
    <path d={BOOK_FACES.right} fill={shade(PAPER, FACE_RIGHT)} stroke="none" />
    <path d={BOOK_FACES.left} fill={shade(PAPER, FACE_LEFT)} stroke="none" />
    {/* clothbound wine cover — sheen falling toward the viewer */}
    <path d={BOOK_FACES.top} fill="url(#oh-book-g0)" stroke="none" />
    {/* cloth grain sweeping the boards */}
    <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.16}>
      <path d={wobblyLine(-4.6, -6.4, 4.4, -3.9, 3, 0.3)} />
      <path d={wobblyLine(-3.4, -4.9, 4.6, -2.9, 8, 0.3)} />
    </g>
    {/* the cover's soft drop onto the page block */}
    <path d="M 7.3 -3.9 L 1.5 -1" fill="none" stroke={GROUND} strokeWidth={1.1} opacity={0.13} />
    <path d={BOOK_FACES.outline} fill="none" stroke={INK} strokeWidth={SW_FINE} />
    {/* edge light along the cover's lit rim */}
    <path d="M -0.9 -7.4 L 6.9 -3.6" fill="none" stroke={shade(WINE, 0.3)} strokeWidth={0.9} opacity={0.9} />
    <path d="M -1.2 -8.2 L 6.8 -4.1" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.7} opacity={0.4} />
    {/* cover boards pinching the page block */}
    <g fill="none" stroke={WINE} strokeWidth={1.4}>
      <path d="M 7.5 -3.15 L 1.5 -0.15" />
      <path d="M -7.5 -4.65 L 1.5 -0.15" />
      <path d="M 7.5 -0.35 L 1.5 2.65" />
      <path d="M -7.5 -1.85 L 1.5 2.65" />
    </g>
    {/* one soft page seam through the middle of the block */}
    <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
      <path d="M 7.5 -1.75 L 1.5 1.25" />
      <path d="M -7.5 -3.25 L 1.5 1.25" />
    </g>
  </g>
);

/** The same book splayed open, two paper pages catching the light. */
const BookOpen = (): React.JSX.Element => (
  <g>
    <defs>
      <linearGradient id="oh-book-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(PAPER, -0.05)} />
        <stop offset="1" stopColor={shade(PAPER, 0.07)} />
      </linearGradient>
    </defs>
    {/* warm grounding shadow under the splayed cover */}
    <path d={isoDiamond(1.06, 0.42, 0)} fill={GROUND} opacity={0.09} stroke="none" />
    {/* wine cover flat beneath */}
    <path d={isoDiamond(1.0, 0.36)} fill={WINE} stroke={INK} strokeWidth={SW_FINE} />
    {/* the pages' soft drop onto the boards */}
    <path d="M 12 2.5 L 6.1 5.5 M -11.9 -3.4 L -3.4 -1.5" fill="none" stroke={GROUND} strokeWidth={1.2} opacity={0.12} />
    {/* two pages, raised a whisper at the spine — light pooling upper-right */}
    <path
      d="M 3.2 -5.1 L 12.2 1.9 L 5.8 5.1 L -3.2 -1.9 Z"
      fill="url(#oh-book-g1)"
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    <path
      d="M 3.2 -5.1 L -5.8 -7.1 L -12.2 -3.9 L -3.2 -1.9 Z"
      fill="url(#oh-book-g1)"
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    {/* the far page tips a breath away from the lamp */}
    <path
      d="M 3.2 -5.1 L -5.8 -7.1 L -12.2 -3.9 L -3.2 -1.9 Z"
      fill={GROUND}
      opacity={0.05}
      stroke="none"
    />
    {/* lit page edge */}
    <path d="M 3.6 -4.2 L 11.3 1.7" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.7} opacity={0.4} />
    {/* centre gutter, with the pages' soft fall into it */}
    <path d="M 3.2 -5.1 L -3.2 -1.9" fill="none" stroke={INK} strokeWidth={2} opacity={0.07} />
    <path d="M 3.2 -5.1 L -3.2 -1.9" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    {/* faint text lines following each page's plane */}
    <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
      <path d="M 6.4 -1.7 L 3.1 0" />
      <path d="M 8.8 -0.1 L 5.5 1.6" />
      <path d="M -0.9 -4.7 L -4.2 -3" />
      <path d="M -3.3 -6.1 L -6.6 -4.4" />
    </g>
  </g>
);

/** Clothbound wine book: closed, ribbon-marked, or lying open. */
export const BookArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {vState === 'open' ? <BookOpen /> : <BookClosed ribbon={vState === 'ribbon'} />}
  </g>
);

/* ── SillPotArt — terracotta isoCylinder r 5.5 h 9 · detail 0–4 ─ */

/** A little sage leaf springing from (x, y), dir −1 left / +1 right. */
const potLeaf = (x: number, y: number, dir: 1 | -1): string => {
  const tip = x + dir * 3.2;
  const c1 = x + dir * 2.6;
  const c2 = x + dir * 3.8;
  const c3 = x + dir * 1.2;
  const c4 = x + dir * 0.2;
  return [
    `M ${x} ${y}`,
    `C ${c1} ${y - 0.4} ${c2} ${y - 2} ${tip} ${y - 3.2}`,
    `C ${c3} ${y - 2.6} ${c4} ${y - 1.2} ${x} ${y}`,
    'Z',
  ].join(' ');
};

interface PotLeafProps {
  x: number;
  y: number;
  dir: 1 | -1;
}

/** A potLeaf painted lit or shaded by its facing, with a soft central vein. */
const PotLeaf = ({ x, y, dir }: PotLeafProps): React.JSX.Element => (
  <g>
    <path d={potLeaf(x, y, dir)} fill={shade(SAGE, dir === 1 ? 0.09 : -0.09)} stroke={INK} strokeWidth={SW_HAIR} />
    <path
      d={`M ${x.toFixed(1)} ${y.toFixed(1)} Q ${(x + dir * 1.7).toFixed(1)} ${(y - 1.3).toFixed(1)} ${(x + dir * 2.7).toFixed(1)} ${(y - 2.6).toFixed(1)}`}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      opacity={0.6}
    />
  </g>
);

/** Five petals ringed around the full bloom. */
const BLOOM_PETALS: ReadonlyArray<readonly [number, number]> = [
  [0, -2],
  [1.9, -0.6],
  [1.2, 1.6],
  [-1.2, 1.6],
  [-1.9, -0.6],
];

const SILLPOT_CYL = isoCylinder(5.5, 9);

/** Terracotta sill pot; `detail` grows it from bare soil to full bloom. */
export const SillPotArt = ({ detail }: ObjectArtProps): React.JSX.Element => {
  const stage = Math.max(0, Math.min(4, Math.round(detail ?? 0)));
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-sillpot-g0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(TERRACOTTA, 0.28)} stopOpacity={0.45} />
          <stop offset="1" stopColor={shade(TERRACOTTA, 0.28)} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* grounding shadow where the pot rests */}
      <ellipse cx={0} cy={0.8} rx={6.2} ry={2.6} fill={GROUND} opacity={0.11} />
      {/* pot body, then the rolled rim */}
      <Cyl r={5.5} h={9} base={TERRACOTTA} sw={SW} />
      <path d={SILLPOT_CYL.side} fill="url(#oh-sillpot-g0)" stroke="none" />
      {/* darker foot ring at the base */}
      <path d="M -4.6 0.7 A 5.2 2.6 0 0 0 4.6 0.7" fill="none" stroke={shade(TERRACOTTA, -0.28)} strokeWidth={1} opacity={0.5} />
      {/* the rolled rim's soft drop onto the body */}
      <path d="M -5.2 -8.2 A 5.5 2.75 0 0 0 5.2 -8.2" fill="none" stroke={GROUND} strokeWidth={1.4} opacity={0.12} />
      <Cyl r={6.5} h={3} base={TERRACOTTA} lift={9} sw={SW} />
      {/* rim catching the lamp */}
      <path d="M -5.4 -13.4 A 6.2 3.1 0 0 1 5.4 -13.4" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.9} opacity={0.45} />
      {/* shadow tucked inside the rolled rim */}
      <ellipse cx={0} cy={-12} rx={5.6} ry={2.8} fill={INK} opacity={0.1} stroke="none" />
      {/* soil disc */}
      <ellipse cx={0} cy={-12} rx={5} ry={2.5} fill={WALNUT} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {/* soil pressed darker at the back */}
      <path d="M -3.4 -13.1 A 5 2.5 0 0 1 3.4 -13.1" fill="none" stroke={shade(WALNUT, -0.22)} strokeWidth={1.2} opacity={0.4} />
      {/* stage 0 — bare soil mound, freshly patted */}
      {stage === 0 && (
        <g>
          <path d="M -3.2 -12.2 Q 0 -14.4 3.2 -12.2 Z" fill={WALNUT} stroke="none" />
          <circle cx={-1.2} cy={-13} r={0.4} fill={INK_SOFT} />
          <circle cx={1.5} cy={-12.7} r={0.4} fill={INK_SOFT} />
        </g>
      )}
      {/* stage 1 — a sprout: two brave leaves */}
      {stage === 1 && (
        <g>
          <path d="M 0 -12.2 C 0.1 -13.8 0 -14.8 0 -15.6" fill="none" stroke={SAGE} strokeWidth={SW_FINE} />
          <PotLeaf x={0} y={-15.4} dir={-1} />
          <PotLeaf x={0} y={-15.2} dir={1} />
        </g>
      )}
      {/* stage 2 — a proper stem, four leaves */}
      {stage === 2 && (
        <g>
          <path d="M 0 -12.2 C 0.3 -15 0 -17.6 0 -20.4" fill="none" stroke={SAGE} strokeWidth={SW_FINE} />
          <PotLeaf x={0.1} y={-14.4} dir={1} />
          <PotLeaf x={0} y={-15.8} dir={-1} />
          <PotLeaf x={0.1} y={-17.6} dir={1} />
          <PotLeaf x={0} y={-18.8} dir={-1} />
        </g>
      )}
      {/* stage 3 — a rose bud, holding its breath */}
      {stage === 3 && (
        <g>
          <path d="M 0 -12.2 C 0.3 -15.5 0 -18.8 0 -22.2" fill="none" stroke={SAGE} strokeWidth={SW_FINE} />
          <PotLeaf x={0} y={-14.8} dir={-1} />
          <PotLeaf x={0.1} y={-17} dir={1} />
          <PotLeaf x={0} y={-19} dir={-1} />
          <path
            d="M 0 -24.6 C 1.6 -23 1.6 -21.6 0 -20.9 C -1.6 -21.6 -1.6 -23 0 -24.6 Z"
            fill={ROSE}
            stroke={INK}
            strokeWidth={SW_HAIR}
          />
          {/* the bud's lit cheek */}
          <path d="M 0.4 -23.8 Q 1 -23 1 -22.2" fill="none" stroke={shade(ROSE, 0.28)} strokeWidth={0.5} opacity={0.8} />
        </g>
      )}
      {/* stage 4 — full bloom */}
      {stage === 4 && (
        <g>
          <path d="M 0 -12.2 C 0.3 -15.5 0 -18.8 0 -22.6" fill="none" stroke={SAGE} strokeWidth={SW_FINE} />
          <PotLeaf x={0} y={-15} dir={-1} />
          <PotLeaf x={0.1} y={-17.8} dir={1} />
          {BLOOM_PETALS.map(([dx, dy], i) => (
            <circle
              key={i}
              cx={dx}
              cy={-23.4 + dy}
              r={1.75}
              fill={shade(BLOOM_ROSE, dx - dy > 0 ? 0.06 : -0.08)}
              stroke={INK}
              strokeWidth={SW_HAIR}
            />
          ))}
          <circle cx={0} cy={-23.4} r={0.9} fill={INK_SOFT} />
        </g>
      )}
    </g>
  );
};

/* ── CocoBasketArt — 1×1 tile wicker isoCylinder r 17 h 9 ────── */

const BASKET_SEED = seedFrom('oh-coco-basket');
const BASKET_R = 17;
const BASKET_H = 9;
const BASKET_CYL = isoCylinder(BASKET_R, BASKET_H);

/** Crossed weave hatches sweeping the basket's visible side. */
const BASKET_HATCH: readonly string[] = ((): string[] => {
  const out: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const x = -14 + i * 4;
    out.push(
      `M ${(x - 1.6).toFixed(1)} ${(-BASKET_H + frontEdge(x - 1.6, BASKET_R) + 0.8).toFixed(1)} L ${(x + 1.6).toFixed(1)} ${(frontEdge(x + 1.6, BASKET_R) - 0.8).toFixed(1)}`,
    );
    out.push(
      `M ${(x + 1.6).toFixed(1)} ${(-BASKET_H + frontEdge(x + 1.6, BASKET_R) + 0.8).toFixed(1)} L ${(x - 1.6).toFixed(1)} ${(frontEdge(x - 1.6, BASKET_R) - 0.8).toFixed(1)}`,
    );
  }
  return out;
})();

/** Round wicker basket, wine cushion sunk inside the rim. */
export const CocoBasketArt = (_props: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-cocobasket-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(WINE, 0.24)} />
        <stop offset="1" stopColor={shade(WINE, 0)} />
      </linearGradient>
      <linearGradient id="oh-cocobasket-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.4" stopColor={shade(OAK, -0.32)} stopOpacity={0} />
        <stop offset="1" stopColor={shade(OAK, -0.32)} stopOpacity={0.3} />
      </linearGradient>
    </defs>
    {/* grounding shadow pooling under the wicker */}
    <ellipse cx={0} cy={0.6} rx={17.8} ry={8.8} fill={GROUND} opacity={0.13} />
    {/* wicker drum */}
    <path d={BASKET_CYL.side} fill={shade(OAK, FACE_RIGHT)} stroke="none" />
    <path d={cylLeftHalf(BASKET_R, BASKET_H)} fill={shade(OAK, FACE_LEFT)} stroke="none" />
    {/* wicker settling darker toward the floor */}
    <path d={BASKET_CYL.side} fill="url(#oh-cocobasket-g1)" stroke="none" />
    {/* crossed weave + two runner bands */}
    <g fill="none" stroke={OAK_DEEP} strokeWidth={SW_HAIR}>
      {BASKET_HATCH.map((d, i) => (
        <path key={i} d={d} />
      ))}
      <path d={`M ${-BASKET_R} -2.5 A ${BASKET_R} ${BASKET_R / 2} 0 0 0 ${BASKET_R} -2.5`} />
      <path d={`M ${-BASKET_R} -5.5 A ${BASKET_R} ${BASKET_R / 2} 0 0 0 ${BASKET_R} -5.5`} />
    </g>
    <path d={BASKET_CYL.side} fill="none" stroke={INK} strokeWidth={SW} />
    {/* rim ring */}
    <ellipse
      cx={0}
      cy={-BASKET_H}
      rx={BASKET_R}
      ry={BASKET_R / 2}
      fill={shade(OAK, FACE_TOP)}
      stroke={INK}
      strokeWidth={SW}
    />
    {/* rim wicker catching the light */}
    <path
      d={`M ${(-(BASKET_R - 1.3) * 0.87).toFixed(1)} ${(-BASKET_H - (BASKET_R - 1.3) / 4).toFixed(1)} A ${(BASKET_R - 1.3).toFixed(1)} ${((BASKET_R - 1.3) / 2).toFixed(1)} 0 0 1 ${((BASKET_R - 1.3) * 0.87).toFixed(1)} ${(-BASKET_H - (BASKET_R - 1.3) / 4).toFixed(1)}`}
      fill="none"
      stroke={shade(OAK, 0.3)}
      strokeWidth={1.1}
      opacity={0.85}
    />
    {/* near-white edge light on the lit rim */}
    <path d="M -12.2 -14.4 A 16.2 8.1 0 0 1 12.2 -14.4" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.9} opacity={0.35} />
    {/* shadowed interior */}
    <ellipse cx={0} cy={-BASKET_H} rx={14.6} ry={7.1} fill={OAK_DEEP} stroke="none" />
    {/* occlusion pooled where the cushion meets the wicker */}
    <ellipse cx={0} cy={-7} rx={13.2} ry={5.4} fill={INK} opacity={0.12} stroke="none" />
    {/* wine cushion, well-loved — roundness from a soft falloff */}
    <path
      d={softEllipse(0, -8.4, 12.8, 6, BASKET_SEED * 21, 0.12)}
      fill="url(#oh-cocobasket-g0)"
      stroke={INK}
      strokeWidth={SW}
    />
    {/* a plumper second pass where the cushion catches the light */}
    <path d={softEllipse(1.5, -10.6, 8.6, 3.4, BASKET_SEED * 33, 0.2)} fill={shade(WINE, 0.16)} opacity={0.25} stroke="none" />
    <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
      <path d="M -6 -11.4 Q -5 -10.8 -4 -11.3" />
      <path d="M 3 -12 Q 4 -11.4 5 -11.9" />
    </g>
  </g>
);

/* ── CocoArt — ~1 tile pup · vState 'asleep' | 'sitting' ─────── */

const COCO_SEED = seedFrom('oh-coco');

/** Coco curled into a crescent, squashed onto the floor plane. */
const CocoAsleep = (): React.JSX.Element => (
  <g className="oh-breathe">
    <defs>
      <linearGradient id="oh-coco-g0" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0.35" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0} />
        <stop offset="1" stopColor={shade(CREAM_WALL, 0.3)} stopOpacity={0.4} />
      </linearGradient>
    </defs>
    {/* the warm dent she presses into the floor */}
    <ellipse cx={0} cy={0.4} rx={13.8} ry={4.6} fill={GROUND} opacity={0.12} />
    {/* curled body — an iso-squashed crescent */}
    <path
      d={softEllipse(0, -7.2, 15, 8, COCO_SEED * 5, 0.18)}
      fill={CREAM_WALL}
      stroke={INK}
      strokeWidth={SW}
    />
    {/* fur brightening toward the lamp */}
    <path d={softEllipse(0, -7.2, 15, 8, COCO_SEED * 5, 0.18)} fill="url(#oh-coco-g0)" stroke="none" />
    {/* soft belly shading where she meets the floor */}
    <path
      d="M -13.6 -4 C -7 -0.6 7 -0.6 13.6 -4 C 7 -2.4 -7 -2.4 -13.6 -4 Z"
      fill={LINEN_SHADE}
      stroke="none"
    />
    {/* curled haunch hint */}
    <path
      d="M -12.6 -4.5 C -13.8 -9.5 -10.6 -13.6 -5.6 -14.6"
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_FINE}
    />
    {/* lamplight along her back */}
    <path d="M -2.6 -14.6 C 0.4 -15 3.4 -14.7 6 -13.9" fill="none" stroke={EDGE_LIGHT} strokeWidth={1} opacity={0.4} />
    {/* tail wrapped round to her nose */}
    <path
      d="M -11 -2.4 C -4 -4.6 5 -4.8 12.6 -5 C 13.8 -4.8 13.8 -3.7 12.8 -3.5 C 5.4 -3.3 -3.6 -3 -9.9 -1.2 C -10.9 -1.3 -11.3 -1.9 -11 -2.4 Z"
      fill={CREAM_WALL}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    {/* the ear's soft drop onto her cheek */}
    <path d="M 7.8 -8.6 Q 10 -7.7 12.4 -8.3" fill="none" stroke={GROUND} strokeWidth={1.3} opacity={0.13} />
    {/* one oak floppy ear */}
    <path
      d="M 6.4 -14.4 C 9.6 -15.8 12.6 -14.4 13.4 -11.6 C 13 -9.8 11 -8.8 9.2 -9.2 C 8 -11 7 -12.8 6.4 -14.4 Z"
      fill={OAK}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    {/* the fold's darker inner turn */}
    <path d="M 8.2 -13.5 C 10.2 -14 11.8 -13.2 12.6 -11.8" fill="none" stroke={shade(OAK, -0.22)} strokeWidth={0.7} opacity={0.7} />
    {/* closed eye, deep in a good dream */}
    <path d="M 11.4 -7.6 Q 12.5 -8.6 13.6 -7.8" fill="none" stroke={INK} strokeWidth={SW_FINE} />
    {/* nose */}
    <ellipse cx={14.8} cy={-5.4} rx={1} ry={0.8} fill={INK} stroke="none" />
  </g>
);

/** Coco sitting up, ears perked, tail curled beside her. */
const CocoSitting = (): React.JSX.Element => (
  <g>
    {/* grounding shadow under her seat */}
    <ellipse cx={-0.5} cy={0.6} rx={9.2} ry={3} fill={GROUND} opacity={0.12} />
    {/* tail curled on the floor beside her */}
    <path
      d="M 7 -0.6 C 9.6 -3.4 13.4 -3.2 14 -1.4 C 14.2 -0.6 13.2 -0.2 12.2 -0.5 C 11.4 -1.8 9.6 -1.9 8.4 -0.5 Z"
      fill={CREAM_WALL}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    {/* haunch */}
    <path
      d={softEllipse(-4.5, -6, 7.4, 6, COCO_SEED * 11)}
      fill={CREAM_WALL}
      stroke={INK}
      strokeWidth={SW}
    />
    {/* lamplight over her haunch */}
    <path d="M -8.6 -10.2 C -6.6 -11.4 -4 -11.8 -1.8 -11.2" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.8} opacity={0.3} />
    {/* chest */}
    <path
      d="M 1.6 -13 C 5.6 -12.4 7.6 -7.6 7.4 -0.7 L -1.6 -0.7 C -1.3 -5.2 -0.9 -10 1.6 -13 Z"
      fill={CREAM_WALL}
      stroke={INK}
      strokeWidth={SW}
    />
    {/* her chin's soft drop onto the chest */}
    <path d="M 1.8 -12.4 Q 4.2 -11.7 6.2 -12.1" fill="none" stroke={GROUND} strokeWidth={1.2} opacity={0.12} />
    {/* lamplight down her chest */}
    <path d="M 5.4 -10.4 C 6.4 -7.8 6.8 -4.8 6.8 -2.2" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.9} opacity={0.35} />
    {/* soft shading under the haunch */}
    <path
      d="M -10.4 -1.6 C -7 -0.5 -3 -0.5 -0.4 -1.3 C -3.2 -2.7 -8 -2.8 -10.4 -1.6 Z"
      fill={LINEN_SHADE}
      stroke="none"
    />
    {/* front leg seam + paws */}
    <path d="M 3.9 -8.8 C 4 -6 4 -3.4 3.9 -1.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_FINE} />
    <ellipse cx={2} cy={-1} rx={1.9} ry={1.1} fill={CREAM_WALL} stroke={INK} strokeWidth={SW_FINE} />
    <ellipse cx={5.6} cy={-1} rx={1.9} ry={1.1} fill={CREAM_WALL} stroke={INK} strokeWidth={SW_FINE} />
    {/* head */}
    <circle cx={4.2} cy={-17.4} r={5.2} fill={CREAM_WALL} stroke={INK} strokeWidth={SW} />
    {/* lamplight on her crown */}
    <path d="M 0.4 -20 A 4.6 4.6 0 0 1 6.5 -21.4" fill="none" stroke={EDGE_LIGHT} strokeWidth={0.9} opacity={0.4} />
    {/* perked ears — the oak one keeps its flop */}
    <path
      d="M 0.9 -21 C 0 -23.2 0.6 -24.8 2 -25.4 C 3.1 -24 3.5 -22.2 3 -20.8 Z"
      fill={CREAM_WALL}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    <path
      d="M 6 -21 C 6.9 -23.4 8.3 -24.6 9.7 -24.8 C 9.8 -23 9 -21.2 7.6 -20.2 Z"
      fill={OAK}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    {/* the oak ear's darker inner turn */}
    <path d="M 6.9 -21.6 C 7.6 -23 8.5 -23.9 9.3 -24.2" fill="none" stroke={shade(OAK, -0.22)} strokeWidth={0.6} opacity={0.7} />
    {/* face */}
    <circle cx={2.6} cy={-18.2} r={0.7} fill={INK} />
    <circle cx={6.2} cy={-18} r={0.7} fill={INK} />
    <ellipse cx={8.4} cy={-16.8} rx={0.9} ry={0.7} fill={INK} stroke="none" />
    <path d="M 7.6 -15.6 Q 8.4 -15 9.2 -15.5" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
  </g>
);

/** The couple's small cream pup — the most-loved sprite in the app. */
export const CocoArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => (
  <g
    transform={facing === 1 ? 'scale(-1 1)' : undefined}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {vState === 'sitting' ? <CocoSitting /> : <CocoAsleep />}
  </g>
);

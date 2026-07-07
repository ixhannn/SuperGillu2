/**
 * OUR HOME — storage & big furniture, wave two (dining, desk, wardrobe,
 * shelving, cart, console) for the 2:1 iso room.
 *
 * Same language as homeObjectsSurfaces: chunky isoBoxFaces / isoCylinder
 * volumes, one shared light (top bright, right dim, left dark), sepia INK
 * outlines. Realism kit on top — subtle 2-stop gradients (stable ids
 * "oh-<sku>-g<i>", built by TopGrad/SideGrad), one grounding contact pool
 * per floor-standing body ('#3a2518' @ 0.13), ambient-occlusion at contact
 * edges and inside openings, 1px '#fff6e6' catch-lights on the rim edge
 * facing the window, wood grain + varnish bands, one specular stroke per
 * brass, low-opacity glass with a white glint. No filters, no blend modes,
 * no animation, no randomness. Floor pieces draw around (0,0) = footprint
 * centre on the floor plane (negative y up); facing 1 mirrors the piece.
 */
import type React from 'react';
import {
  INK,
  INK_SOFT,
  PAPER,
  LINEN,
  WINE,
  ROSE,
  PLUM_HEATHER,
  OAK,
  OAK_DEEP,
  WALNUT,
  WALNUT_DEEP,
  BRASS,
  BRASS_BRIGHT,
  TERRACOTTA,
  SAGE,
  SW,
  SW_FINE,
  SW_HAIR,
  wobblyLine,
  seedFrom,
  softEllipse,
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
} from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/* ── Local iso helpers ───────────────────────────────────────── */

const HW = TILE_W / 2; // 20 — px per tile along the col axis (x)
const HH = TILE_H / 2; // 10 — px per tile along the col axis (y)

/** Tile-space offset from the footprint centre → screen point. */
const pos = (c: number, r: number): { x: number; y: number } => ({
  x: (c - r) * HW,
  y: (c + r) * HH,
});

const P = (p: { x: number; y: number }): string => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

/**
 * A point ON the right (viewer-facing lower-right) face of a w×d box:
 * `t` runs 0..d from the east corner, `y` is px above the floor (negative up).
 */
const facePt = (w: number, d: number, t: number, y: number): { x: number; y: number } => ({
  x: (w + d) * (TILE_W / 4) - t * HW,
  y: (w - d) * (TILE_H / 4) + t * HH + y,
});

/** A parallelogram painted flat on the right face (drawers, doors, screens). */
const faceRect = (w: number, d: number, t0: number, t1: number, y0: number, y1: number): string =>
  `M ${P(facePt(w, d, t0, y0))} L ${P(facePt(w, d, t1, y0))}`
  + ` L ${P(facePt(w, d, t1, y1))} L ${P(facePt(w, d, t0, y1))} Z`;

/** A single stroke on the right face. */
const faceLine = (w: number, d: number, t0: number, y0: number, t1: number, y1: number): string =>
  `M ${P(facePt(w, d, t0, y0))} L ${P(facePt(w, d, t1, y1))}`;

/** The top leading edges (west → south → east) of a w×d box at height h. */
const frontEdgePath = (w: number, d: number, h: number): string => {
  const a = pos(-w / 2, d / 2);
  const b = pos(w / 2, d / 2);
  const c = pos(w / 2, -d / 2);
  return `M ${a.x.toFixed(1)} ${(a.y - h).toFixed(1)} L ${b.x.toFixed(1)} ${(b.y - h).toFixed(1)}`
    + ` L ${c.x.toFixed(1)} ${(c.y - h).toFixed(1)}`;
};

/** The upper-right (north → east) rim of a top face at height h. */
const litEdgePath = (w: number, d: number, h: number): string => {
  const a = pos(-w / 2, -d / 2);
  const b = pos(w / 2, -d / 2);
  return `M ${a.x.toFixed(1)} ${(a.y - h).toFixed(1)} L ${b.x.toFixed(1)} ${(b.y - h).toFixed(1)}`;
};

/* ── Realism kit (gradients, grounding, catch-lights) ────────── */

/** 2-stop gradient for a TOP face: brightens toward the upper-right light. */
const TopGrad = ({ id, base }: { id: string; base: string }): React.JSX.Element => (
  <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stopColor={shade(base, FACE_TOP - 0.05)} />
    <stop offset="1" stopColor={shade(base, FACE_TOP + 0.07)} />
  </linearGradient>
);

/** 2-stop gradient for a vertical face: darkens toward the floor. */
const SideGrad = ({ id, base, face }: { id: string; base: string; face: number }): React.JSX.Element => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={shade(base, face + 0.06)} />
    <stop offset="1" stopColor={shade(base, face - 0.07)} />
  </linearGradient>
);

/** The room's grounding language: one soft pool under a floor-standing body. */
const ContactShadow = ({ rx, cx = 0, cy = 1.5, opacity = 0.13 }: {
  rx: number; cx?: number; cy?: number; opacity?: number;
}): React.JSX.Element => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.32} fill="#3a2518" opacity={opacity} />
);

/** 1px near-white catch-light along the rim edge that faces the window. */
const EdgeLight = ({ w, d, h, opacity = 0.4 }: {
  w: number; d: number; h: number; opacity?: number;
}): React.JSX.Element => (
  <path d={litEdgePath(w, d, h)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={opacity} />
);

/**
 * A shaded, inked box volume — optional edge-light, contact AO, and per-face
 * gradient overrides (pass url(#…) fills from the component's own <defs>).
 */
const IsoBox = ({
  base, w, d, h, sw = SW, light = false, ao = false, topFill, rightFill, leftFill,
}: {
  base: string; w: number; d: number; h: number; sw?: number; light?: boolean; ao?: boolean;
  topFill?: string; rightFill?: string; leftFill?: string;
}): React.JSX.Element => {
  const f = isoBoxFaces(w, d, h);
  return (
    <g>
      <path d={f.top} fill={topFill ?? shade(base, FACE_TOP)} />
      <path d={f.right} fill={rightFill ?? shade(base, FACE_RIGHT)} />
      <path d={f.left} fill={leftFill ?? shade(base, FACE_LEFT)} />
      {ao ? (
        <path d={frontEdgePath(w, d, 0)} fill="none" stroke={shade(base, -0.55)} strokeWidth={1.8} opacity={0.45} />
      ) : null}
      {light ? (
        <path d={frontEdgePath(w, d, h)} fill="none" stroke={shade(base, 0.3)} strokeWidth={1} opacity={0.9} />
      ) : null}
      <path d={f.outline} fill="none" stroke={INK} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
};

/** A hand-wobbled grain stroke along the ROW (long) axis of a top face. */
const grainR = (w: number, d: number, lift: number, u: number, seed: number): string => {
  const v = (d / 2) * (1 - Math.abs(u) / (w / 2)) * 0.9;
  return wobblyLine(
    (u + v) * HW,
    (u - v) * HH - lift,
    (u - v) * HW,
    (u + v) * HH - lift,
    seed,
    0.4,
  );
};

/** Fine cross-hatch inside a face rect — the cane-weave impression. */
const caneHatch = (w: number, d: number, t0: number, t1: number, y0: number, y1: number): string => {
  const dt = (y0 - y1) / 30;
  let out = '';
  for (let t = t0 + 0.02; t + dt <= t1 - 0.02; t += 0.13) {
    out += `${faceLine(w, d, t, y0, t + dt, y1)} ${faceLine(w, d, t + dt, y0, t, y1)} `;
  }
  return out;
};

/* ── Dining table — 2×2 tiles, h ~30, round walnut pedestal ──── */

const DT_TOP = isoCylinder(34, 6);
const DT_PEDESTAL = isoCylinder(5.5, 19);
const DT_HUB = isoCylinder(9, 4);

/** Thick round walnut top on a turned pedestal + four splayed feet. */
export const DiningTableArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <linearGradient id="oh-dining-table-g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={shade(WALNUT, 0.18)} />
        <stop offset="1" stopColor={shade(WALNUT, 0.02)} />
      </linearGradient>
      <SideGrad id="oh-dining-table-g2" base={WALNUT_DEEP} face={0} />
      <SideGrad id="oh-dining-table-g3" base={WALNUT} face={FACE_RIGHT} />
    </defs>
    {/* grounding pool under the whole base */}
    <ContactShadow rx={22} />
    {/* four splayed feet on the floor plane */}
    <path d="M -2.2 -6 L 2.2 -6 L 1.6 -13 L -1.6 -13 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -3.5 -6 L -3.5 -0.5 L -24 1.4 L -24 -2.8 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M 3.5 -6 L 3.5 -0.5 L 24 1.4 L 24 -2.8 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -2.2 -2 L 2.2 -2 L 1.8 8.5 L -1.8 8.5 Z" fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    {/* turned hub the feet grow from */}
    <path d={DT_HUB.side} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    <ellipse cx={0} cy={-4} rx={9} ry={4.5} fill={WALNUT} stroke={INK} strokeWidth={SW_FINE} />
    {/* the slab's soft shadow falling over the base */}
    <ellipse cx={2} cy={-4} rx={12.5} ry={4.4} fill="#3a2518" opacity={0.1} />
    {/* pedestal column, darkening toward the floor */}
    <g transform="translate(0 -5)">
      <path d={DT_PEDESTAL.side} fill="url(#oh-dining-table-g3)" stroke={INK} strokeWidth={SW_FINE} />
    </g>
    {/* occlusion where the column meets the slab */}
    <ellipse cx={0} cy={-23.2} rx={6.5} ry={2.8} fill={shade(WALNUT_DEEP, -0.35)} />
    {/* the round top slab */}
    <g transform="translate(0 -24)">
      <path d={DT_TOP.side} fill="url(#oh-dining-table-g2)" stroke={INK} strokeWidth={SW} />
      <ellipse cx={0} cy={-6} rx={34} ry={17} fill="url(#oh-dining-table-g1)" stroke={INK} strokeWidth={SW} />
      {/* grain rings */}
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
        <ellipse cx={1} cy={-6.4} rx={24} ry={11.5} />
        <ellipse cx={-2} cy={-6} rx={15} ry={7} />
        <ellipse cx={2} cy={-5.6} rx={7} ry={3.2} />
      </g>
      {/* varnish highlight crescent + rim edge-lights */}
      <path d="M -13 -13.8 A 25 11.5 0 0 1 21 -9.6" fill="none" stroke={shade(WALNUT, 0.4)} strokeWidth={2.2} opacity={0.7} />
      <path d="M -32 -11.8 A 34 17 0 0 1 8.8 -22.4" fill="none" stroke={shade(WALNUT, 0.3)} strokeWidth={1} opacity={0.9} />
      <path d="M 6 -22.7 A 34 17 0 0 1 32 -11.8" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
    </g>
  </g>
);

/* ── Dining chair — 1×1 tile, h ~40 ──────────────────────────── */

/** Corner posts of the 0.6×0.6 leg square, far to near. */
const DC_LEGS: ReadonlyArray<readonly [number, number]> = [
  [0, -6], [-12, 0], [12, 0], [0, 6],
];

/** Walnut chair with a curved crest rail and a linen seat pad. */
export const DiningChairArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <TopGrad id="oh-dining-chair-g1" base={WALNUT} />
      <TopGrad id="oh-dining-chair-g2" base={LINEN} />
    </defs>
    {/* grounding pool under the leg square */}
    <ContactShadow rx={12} />
    {DC_LEGS.map(([lx, ly]) => (
      <g key={`${lx},${ly}`} transform={`translate(${lx} ${ly})`}>
        <IsoBox base={WALNUT_DEEP} w={0.12} d={0.12} h={12} sw={SW_FINE} />
      </g>
    ))}
    {/* back stiles rise along the upper-left edge */}
    <g transform="translate(-1.2 -21.4)">
      <IsoBox base={WALNUT} w={0.09} d={0.09} h={15} sw={SW_FINE} />
    </g>
    <g transform="translate(-10.8 -16.6)">
      <IsoBox base={WALNUT} w={0.09} d={0.09} h={15} sw={SW_FINE} />
    </g>
    {/* curved crest rail bridging the stiles + a varnish sheen on its lit edge */}
    <path
      d="M 1 -38.6 Q -5.5 -43.4 -12.8 -33.6 L -12.8 -29.8 Q -5.5 -38.6 1 -34.8 Z"
      fill={WALNUT}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    <path d="M 0 -37.9 Q -5.5 -42.4 -11.8 -33.9" fill="none" stroke={shade(WALNUT, 0.35)} strokeWidth={SW_HAIR} opacity={0.8} />
    {/* seat slab + the pad's soft press-shadow on it */}
    <g transform="translate(0 -12)">
      <IsoBox base={WALNUT} w={0.78} d={0.78} h={4} light topFill="url(#oh-dining-chair-g1)" />
      <path d={isoDiamond(0.72, 0.72, 4)} fill="#3a2518" opacity={0.12} />
    </g>
    <g transform="translate(0 -16)">
      <IsoBox base={LINEN} w={0.66} d={0.66} h={3} sw={SW_FINE} light topFill="url(#oh-dining-chair-g2)" />
      <EdgeLight w={0.66} d={0.66} h={3} />
      {/* plumper second highlight on the cushion crown */}
      <path
        d={softEllipse(0, -3.2, 7.6, 3, 6 + seedFrom('dining-chair-crown') * 4)}
        fill={shade(LINEN, 0.14)}
        opacity={0.25}
      />
      {/* stitch line across the pad top */}
      <path
        d={wobblyLine(-8, -2.2, 8, -3.4, 4.2 + seedFrom('dining-chair-stitch') * 5, 0.3)}
        fill="none"
        stroke={INK_SOFT}
        strokeWidth={SW_HAIR}
      />
    </g>
  </g>
);

/* ── Desk — 2×1 tiles, h ~32, writing desk ───────────────────── */

const DESK_GRAIN_SEED = 5.2 + seedFrom('desk-grain') * 8;

/** Walnut top slab, right drawer pedestal with brass pulls, open left leg. */
export const DeskArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <TopGrad id="oh-desk-g1" base={WALNUT} />
      <SideGrad id="oh-desk-g2" base={WALNUT} face={FACE_RIGHT} />
      <SideGrad id="oh-desk-g3" base={WALNUT} face={FACE_LEFT} />
    </defs>
    {/* grounding pool under legs + pedestal */}
    <ContactShadow rx={29} />
    {/* open left leg — two posts + a low stretcher */}
    <g transform="translate(-25.2 5)">
      <IsoBox base={WALNUT_DEEP} w={0.12} d={0.12} h={26} sw={SW_FINE} />
    </g>
    <g transform="translate(-10 12.6)">
      <IsoBox base={WALNUT_DEEP} w={0.12} d={0.12} h={26} sw={SW_FINE} />
    </g>
    <g transform="translate(-17 2.5)">
      <IsoBox base={WALNUT} w={0.72} d={0.1} h={2.5} sw={SW_FINE} />
    </g>
    {/* right-side two-drawer pedestal */}
    <g transform="translate(10 -5)">
      <IsoBox base={WALNUT} w={0.9} d={0.95} h={26} ao rightFill="url(#oh-desk-g2)" leftFill="url(#oh-desk-g3)" />
      {/* drawer fronts, recessed a breath */}
      <path d={faceRect(0.9, 0.95, 0.1, 0.85, -4, -12)} fill={shade(WALNUT, 0.06)} stroke={INK_SOFT} strokeWidth={SW_FINE} />
      <path d={faceRect(0.9, 0.95, 0.1, 0.85, -14, -22)} fill={shade(WALNUT, 0.06)} stroke={INK_SOFT} strokeWidth={SW_FINE} />
      {/* occlusion tucked under the slab */}
      <path d={faceLine(0.9, 0.95, 0.06, -24.8, 0.9, -24.8)} fill="none" stroke={shade(WALNUT, -0.5)} strokeWidth={1.4} opacity={0.5} />
      {/* brass pulls, one specular tick */}
      <circle cx={facePt(0.9, 0.95, 0.475, -8).x} cy={facePt(0.9, 0.95, 0.475, -8).y} r={1.8} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={facePt(0.9, 0.95, 0.475, -18).x} cy={facePt(0.9, 0.95, 0.475, -18).y} r={1.8} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path
        d={`M ${(facePt(0.9, 0.95, 0.475, -18).x - 0.9).toFixed(1)} ${(facePt(0.9, 0.95, 0.475, -18).y - 0.7).toFixed(1)} l 1 -0.5`}
        stroke={shade(BRASS, 0.55)}
        strokeWidth={0.8}
        fill="none"
      />
    </g>
    {/* the top slab */}
    <g transform="translate(0 -26)">
      <IsoBox base={WALNUT} w={1.04} d={2.08} h={6} light topFill="url(#oh-desk-g1)" />
      <EdgeLight w={1.04} d={2.08} h={6} />
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
        <path d={grainR(1.04, 2.08, 6, -0.3, DESK_GRAIN_SEED)} />
        <path d={grainR(1.04, 2.08, 6, 0.02, DESK_GRAIN_SEED * 3)} />
        <path d={grainR(1.04, 2.08, 6, 0.3, DESK_GRAIN_SEED * 5)} />
      </g>
      {/* paper notebook, left half of the top — warm cast shadow + page edge */}
      <g transform="translate(-11 5.5)">
        <path d={isoDiamond(0.42, 0.54, 6.4)} fill="#3a2518" opacity={0.1} transform="translate(-0.5 0.4)" />
        <path d={isoDiamond(0.4, 0.52, 6.8)} fill={PAPER} stroke={INK} strokeWidth={SW_HAIR} />
        <path d="M -1.2 -1.5 L 9.2 -6.7" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.6} />
        <path
          d={wobblyLine(-4, -7, 4, -6.6, 2.2, 0.25)}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={SW_HAIR}
        />
      </g>
      {/* an ink pen laid along the grain */}
      <path
        d={wobblyLine(2, 8.6, 12, 13.4, 5.1, 0.2)}
        transform="translate(0 -7)"
        fill="none"
        stroke={INK}
        strokeWidth={1.3}
      />
    </g>
  </g>
);

/* ── Desk chair — 1×1 tile, h ~36, oak swivel-look ───────────── */

const DKC_COLUMN = isoCylinder(2.6, 5);
const DKC_SEAT = isoCylinder(13, 4.5);

/** Round oak seat with a wine pad, low curved back, four splayed legs. */
export const DeskChairArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <linearGradient id="oh-desk-chair-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={shade(WINE, -0.05)} />
        <stop offset="1" stopColor={shade(WINE, 0.08)} />
      </linearGradient>
      <SideGrad id="oh-desk-chair-g2" base={OAK} face={FACE_RIGHT} />
    </defs>
    {/* grounding pool under the splayed legs */}
    <ContactShadow rx={12.5} />
    {/* four splayed legs */}
    <path d="M -1.3 -14.5 L 1.3 -14.5 L 0.9 -8.5 L -0.9 -8.5 Z" fill={OAK_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -4 -14.5 L -1.5 -14 L -10.5 -0.5 L -13.5 -1 Z" fill={OAK_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M 1.5 -14 L 4 -14.5 L 13.5 -1 L 10.5 -0.5 Z" fill={OAK_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -1.5 -14 L 1.5 -14 L 2 3.5 L -2 3.5 Z" fill={OAK_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    {/* column */}
    <g transform="translate(0 -13)">
      <path d={DKC_COLUMN.side} fill={OAK_DEEP} stroke={INK} strokeWidth={SW_FINE} />
    </g>
    {/* back supports + low curved back with a varnish sheen */}
    <path d="M -9.5 -24 L -7.5 -25 L -6.5 -32 L -8.5 -31.5 Z" fill={OAK} stroke={INK} strokeWidth={SW_FINE} />
    <path d="M -3.5 -26.5 L -1.5 -27 L -1.5 -33.5 L -3.5 -33 Z" fill={OAK} stroke={INK} strokeWidth={SW_FINE} />
    <path
      d="M -14.5 -30 Q -8 -41.5 3.5 -34.5 L 3.8 -31 Q -7 -37.5 -13.6 -26.8 Z"
      fill={OAK}
      stroke={INK}
      strokeWidth={SW_FINE}
    />
    <path d="M -13.4 -30.6 Q -8 -40.4 2.6 -34.6" fill="none" stroke={shade(OAK, 0.35)} strokeWidth={SW_HAIR} opacity={0.8} />
    {/* round seat */}
    <g transform="translate(0 -17)">
      <path d={DKC_SEAT.side} fill="url(#oh-desk-chair-g2)" stroke={INK} strokeWidth={SW} />
      <ellipse cx={0} cy={-4.5} rx={13} ry={6.5} fill={OAK} stroke={INK} strokeWidth={SW} />
      {/* rim catch-light facing the window */}
      <path d="M 3.4 -10.8 A 13 6.5 0 0 1 12.6 -6.2" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
    </g>
    {/* wine pad, resting under weight */}
    <ellipse cx={0} cy={-21} rx={10.8} ry={5.2} fill={shade(WINE, -0.25)} />
    <path d={softEllipse(0, -22.6, 10.5, 5, 3 + seedFrom('desk-chair-pad') * 7)} fill="url(#oh-desk-chair-g1)" stroke={INK} strokeWidth={SW_FINE} />
    {/* plumper crown highlight + the back's soft shadow across the far rim */}
    <path
      d={softEllipse(0, -23.4, 6.6, 2.7, 4 + seedFrom('desk-chair-crown') * 6)}
      fill={shade(WINE, 0.14)}
      opacity={0.25}
    />
    <path d="M -9 -25.6 Q -4.5 -27.4 0.5 -26.8" fill="none" stroke="#3a2518" strokeWidth={2.2} opacity={0.1} />
    <ellipse cx={0} cy={-22.8} rx={7.2} ry={3.2} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
  </g>
);

/* ── Nightstand — 1×1 tile, h ~26 ────────────────────────────── */

const NS_GRAIN_SEED = 3.1 + seedFrom('nightstand-grain') * 6;

/** Corner posts of the open lower frame, far to near. */
const NS_POSTS: ReadonlyArray<readonly [number, number]> = [
  [0, -7.8], [-15.6, 0], [15.6, 0], [0, 7.8],
];

/** Walnut nightstand: brass-knob drawer up top, book stack on the shelf. */
export const NightstandArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <TopGrad id="oh-nightstand-g1" base={WALNUT} />
      <SideGrad id="oh-nightstand-g2" base={WALNUT} face={FACE_RIGHT} />
      <SideGrad id="oh-nightstand-g3" base={WALNUT} face={FACE_LEFT} />
    </defs>
    {/* grounding pool under the corner posts */}
    <ContactShadow rx={14.4} />
    {NS_POSTS.map(([lx, ly]) => (
      <g key={`${lx},${ly}`} transform={`translate(${lx} ${ly})`}>
        <IsoBox base={WALNUT_DEEP} w={0.1} d={0.1} h={15} sw={SW_FINE} />
      </g>
    ))}
    {/* lower shelf plank */}
    <g transform="translate(0 -4.5)">
      <IsoBox base={WALNUT} w={0.8} d={0.8} h={2} sw={SW_FINE} />
    </g>
    {/* tiny book stack on the shelf — warm cast shadow under the covers */}
    <path d={isoDiamond(0.42, 0.52)} fill="#3a2518" opacity={0.1} transform="translate(0.5 -6.4)" />
    <g transform="translate(0 -6.5)">
      <IsoBox base={WINE} w={0.34} d={0.44} h={2.2} sw={SW_HAIR} />
    </g>
    <g transform="translate(1 -8.7)">
      <IsoBox base={SAGE} w={0.28} d={0.38} h={1.8} sw={SW_HAIR} />
    </g>
    {/* drawer box */}
    <g transform="translate(0 -15)">
      <IsoBox base={WALNUT} w={0.94} d={0.94} h={9} rightFill="url(#oh-nightstand-g2)" leftFill="url(#oh-nightstand-g3)" />
      <path d={faceRect(0.94, 0.94, 0.1, 0.84, -1.5, -7.5)} fill={shade(WALNUT, 0.07)} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {/* occlusion tucked under the proud top */}
      <path d={faceLine(0.94, 0.94, 0.05, -8.6, 0.9, -8.6)} fill="none" stroke={shade(WALNUT, -0.5)} strokeWidth={1.3} opacity={0.5} />
      <circle cx={facePt(0.94, 0.94, 0.47, -4.5).x} cy={facePt(0.94, 0.94, 0.47, -4.5).y} r={1.7} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path
        d={`M ${(facePt(0.94, 0.94, 0.47, -4.5).x - 0.8).toFixed(1)} ${(facePt(0.94, 0.94, 0.47, -4.5).y - 0.6).toFixed(1)} l 0.9 -0.5`}
        stroke={shade(BRASS, 0.55)}
        strokeWidth={0.7}
        fill="none"
      />
    </g>
    {/* proud top slab + grain + catch-light */}
    <g transform="translate(0 -24)">
      <IsoBox base={WALNUT} w={1} d={1} h={2.5} sw={SW_FINE} light topFill="url(#oh-nightstand-g1)" />
      <EdgeLight w={1} d={1} h={2.5} />
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3}>
        <path d={grainR(1, 1, 2.5, -0.16, NS_GRAIN_SEED)} />
        <path d={grainR(1, 1, 2.5, 0.18, NS_GRAIN_SEED * 3)} />
      </g>
    </g>
  </g>
);

/* ── Dresser — 2×1 tiles, h ~34, oak three-drawer ────────────── */

const DRESSER_GRAIN_SEED = 7.7 + seedFrom('dresser-grain') * 6;
/** Drawer rows on the body face: [bottom y, top y] in body coords. */
const DRESSER_ROWS: ReadonlyArray<readonly [number, number]> = [
  [-2, -8.5], [-9.5, -16], [-17, -23.5],
];

/** Oak dresser, three drawers with brass bar pulls, slightly proud top. */
export const DresserArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <TopGrad id="oh-dresser-g1" base={OAK} />
      <SideGrad id="oh-dresser-g2" base={OAK} face={FACE_RIGHT} />
      <SideGrad id="oh-dresser-g3" base={OAK} face={FACE_LEFT} />
      <SideGrad id="oh-dresser-g4" base={shade(OAK, 0.06)} face={0} />
    </defs>
    {/* grounding pool under the plinth */}
    <ContactShadow rx={28} />
    <IsoBox base={OAK_DEEP} w={1.02} d={2.02} h={4} sw={SW_FINE} ao />
    <g transform="translate(0 -4)">
      <IsoBox base={OAK} w={0.95} d={1.95} h={25} rightFill="url(#oh-dresser-g2)" leftFill="url(#oh-dresser-g3)" />
      {DRESSER_ROWS.map(([yb, yt]) => {
        const ym = (yb + yt) / 2;
        return (
          <g key={yb}>
            <path d={faceRect(0.95, 1.95, 0.12, 1.83, yb, yt)} fill="url(#oh-dresser-g4)" stroke={INK_SOFT} strokeWidth={SW_FINE} />
            <path d={faceLine(0.95, 1.95, 0.83, ym, 1.12, ym)} fill="none" stroke={INK} strokeWidth={3} />
            <path d={faceLine(0.95, 1.95, 0.83, ym, 1.12, ym)} fill="none" stroke={BRASS_BRIGHT} strokeWidth={1.6} />
          </g>
        );
      })}
      {/* one specular tick on the middle pull */}
      <path d={faceLine(0.95, 1.95, 0.86, -13.4, 0.96, -13.4)} fill="none" stroke={shade(BRASS, 0.55)} strokeWidth={0.7} />
      {/* occlusion under the proud top */}
      <path d={faceLine(0.95, 1.95, 0.06, -24.6, 1.9, -24.6)} fill="none" stroke={shade(OAK, -0.5)} strokeWidth={1.4} opacity={0.5} />
    </g>
    {/* proud top slab + grain + catch-light */}
    <g transform="translate(0 -29)">
      <IsoBox base={OAK} w={1.08} d={2.08} h={4} sw={SW_FINE} light topFill="url(#oh-dresser-g1)" />
      <EdgeLight w={1.08} d={2.08} h={4} />
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
        <path d={grainR(1.08, 2.08, 4, -0.3, DRESSER_GRAIN_SEED)} />
        <path d={grainR(1.08, 2.08, 4, 0, DRESSER_GRAIN_SEED * 3)} />
        <path d={grainR(1.08, 2.08, 4, 0.3, DRESSER_GRAIN_SEED * 5)} />
      </g>
    </g>
  </g>
);

/* ── Wardrobe — 2×1 tiles, h ~78, linen-painted ──────────────── */

/** Tall linen wardrobe: oak cornice + plinth, two recessed doors, brass knobs. */
export const WardrobeArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <linearGradient id="oh-wardrobe-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(LINEN, -0.03)} />
        <stop offset="1" stopColor={shade(LINEN, -0.13)} />
      </linearGradient>
      <TopGrad id="oh-wardrobe-g2" base={OAK} />
      <SideGrad id="oh-wardrobe-g3" base={LINEN} face={FACE_RIGHT} />
      <SideGrad id="oh-wardrobe-g4" base={LINEN} face={FACE_LEFT} />
    </defs>
    {/* grounding pool under the plinth */}
    <ContactShadow rx={28.7} />
    {/* oak plinth */}
    <IsoBox base={OAK_DEEP} w={1.06} d={2.06} h={5} sw={SW_FINE} ao />
    {/* painted body */}
    <g transform="translate(0 -5)">
      <IsoBox base={LINEN} w={0.98} d={1.98} h={66} rightFill="url(#oh-wardrobe-g3)" leftFill="url(#oh-wardrobe-g4)" />
      {/* two recessed door panels */}
      {([[0.14, 0.94], [1.04, 1.84]] as ReadonlyArray<readonly [number, number]>).map(([t0, t1]) => (
        <g key={t0}>
          <path d={faceRect(0.98, 1.98, t0, t1, -4, -60)} fill="url(#oh-wardrobe-g1)" stroke={INK_SOFT} strokeWidth={SW_FINE} />
          {/* occlusion along the recess top, edge-light along its sill */}
          <path d={faceLine(0.98, 1.98, t0, -60, t1, -60)} fill="none" stroke={shade(LINEN, -0.3)} strokeWidth={1.5} opacity={0.7} />
          <path d={faceLine(0.98, 1.98, t0, -4, t1, -4)} fill="none" stroke={shade(LINEN, 0.3)} strokeWidth={1} opacity={0.9} />
          {/* inner panel line */}
          <path d={faceRect(0.98, 1.98, t0 + 0.1, t1 - 0.1, -9, -55)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
        </g>
      ))}
      {/* shadowed gap between the doors */}
      <path d={faceLine(0.98, 1.98, 0.99, -3, 0.99, -61)} fill="none" stroke={shade(LINEN, -0.4)} strokeWidth={1.2} />
      {/* occlusion tucked under the cornice */}
      <path d={faceLine(0.98, 1.98, 0.03, -64.5, 1.95, -64.5)} fill="none" stroke={shade(LINEN, -0.3)} strokeWidth={1.6} opacity={0.55} />
      {/* brass knobs by the gap — one specular tick */}
      <circle cx={facePt(0.98, 1.98, 0.88, -33).x} cy={facePt(0.98, 1.98, 0.88, -33).y} r={2} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={facePt(0.98, 1.98, 1.1, -33).x} cy={facePt(0.98, 1.98, 1.1, -33).y} r={2} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path
        d={`M ${(facePt(0.98, 1.98, 0.88, -33).x - 1).toFixed(1)} ${(facePt(0.98, 1.98, 0.88, -33).y - 0.8).toFixed(1)} l 1.1 -0.5`}
        stroke={shade(BRASS, 0.55)}
        strokeWidth={0.8}
        fill="none"
      />
    </g>
    {/* oak cornice + catch-light */}
    <g transform="translate(0 -71)">
      <IsoBox base={OAK} w={1.1} d={2.1} h={6} sw={SW_FINE} light topFill="url(#oh-wardrobe-g2)" />
      <EdgeLight w={1.1} d={2.1} h={6} />
    </g>
  </g>
);

/* ── Tall bookshelf — 2×1 tiles, h ~84, detail = spines (0–24) ─ */

const BST_GRAIN_SEED = 6.3 + seedFrom('bookshelf-tall-grain') * 5;
const BST_SHELF_BOTTOMS: readonly number[] = [-5, -22, -39, -56];
const BST_SPINES: readonly string[] = [
  WINE, SAGE, PLUM_HEATHER, ROSE, WALNUT, BRASS, TERRACOTTA,
];
const BST_HOLLOW = shade(OAK_DEEP, -0.45);

/** Open oak shelf, four front openings, clothbound spines with a few leaners. */
export const BookshelfTallArt = ({ facing, detail }: ObjectArtProps): React.JSX.Element => {
  const count = Math.max(0, Math.min(24, Math.floor(detail ?? 0)));
  const spines: React.JSX.Element[] = [];
  for (let gi = 0; gi < count; gi += 1) {
    const yb = BST_SHELF_BOTTOMS[Math.floor(gi / 6)] ?? -5;
    const slot = gi % 6;
    const t0 = 0.22 + slot * 0.265;
    const s = seedFrom(`oh-bst-spine-${gi}`);
    const h = 9.5 + s * 4;
    const lean = s > 0.8 ? 0.085 : 0;
    spines.push(
      <path
        key={gi}
        d={
          `M ${P(facePt(1, 2, t0, yb))} L ${P(facePt(1, 2, t0 + 0.19, yb))}`
          + ` L ${P(facePt(1, 2, t0 + 0.19 + lean, yb - h))} L ${P(facePt(1, 2, t0 + lean, yb - h))} Z`
        }
        fill={BST_SPINES[gi % BST_SPINES.length] ?? WINE}
        stroke={INK}
        strokeWidth={SW_HAIR}
      />,
    );
  }
  return (
    <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
      <defs>
        <TopGrad id="oh-bookshelf-tall-g1" base={OAK} />
        <SideGrad id="oh-bookshelf-tall-g2" base={OAK} face={FACE_RIGHT} />
        <SideGrad id="oh-bookshelf-tall-g3" base={OAK} face={FACE_LEFT} />
      </defs>
      {/* grounding pool under the plinth */}
      <ContactShadow rx={28.7} />
      <IsoBox base={OAK_DEEP} w={1.06} d={2.06} h={5} sw={SW_FINE} ao />
      <g transform="translate(0 -5)">
        <IsoBox base={OAK} w={1} d={2} h={72} rightFill="url(#oh-bookshelf-tall-g2)" leftFill="url(#oh-bookshelf-tall-g3)" />
        {BST_SHELF_BOTTOMS.map((yb) => (
          <g key={yb}>
            <path d={faceRect(1, 2, 0.16, 1.84, yb, yb - 14)} fill={BST_HOLLOW} stroke={INK_SOFT} strokeWidth={SW_FINE} />
            {/* occlusion under the shelf above, edge-light on the lip */}
            <path d={faceRect(1, 2, 0.16, 1.84, yb - 11, yb - 14)} fill={shade(OAK_DEEP, -0.62)} />
            <path d={faceLine(1, 2, 0.16, yb, 1.84, yb)} fill="none" stroke={shade(OAK, 0.3)} strokeWidth={1} opacity={0.9} />
          </g>
        ))}
        {spines}
        {/* the books' resting shadow at their feet, only on filled shelves */}
        {BST_SHELF_BOTTOMS.slice(0, Math.ceil(count / 6)).map((yb) => (
          <path
            key={`ao-${yb}`}
            d={faceLine(1, 2, 0.2, yb - 0.6, 1.8, yb - 0.6)}
            fill="none"
            stroke="#3a2518"
            strokeWidth={1.1}
            opacity={0.12}
          />
        ))}
      </g>
      {/* cornice + grain + catch-light */}
      <g transform="translate(0 -77)">
        <IsoBox base={OAK} w={1.12} d={2.12} h={6} sw={SW_FINE} light topFill="url(#oh-bookshelf-tall-g1)" />
        <EdgeLight w={1.12} d={2.12} h={6} />
        <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3}>
          <path d={grainR(1.12, 2.12, 6, -0.25, BST_GRAIN_SEED)} />
          <path d={grainR(1.12, 2.12, 6, 0.2, BST_GRAIN_SEED * 3)} />
        </g>
      </g>
    </g>
  );
};

/* ── Ladder shelf — 1×1 tile, h ~70 ──────────────────────────── */

const LS_GRAIN_SEED = 4.9 + seedFrom('ladder-shelf-grain') * 6;

/** Rungs, bottom to top: [lift px, c offset (lean-back), depth in tiles]. */
const LS_RUNGS: ReadonlyArray<readonly [number, number, number]> = [
  [12, 0.3, 0.5], [27, 0.12, 0.4], [42, -0.06, 0.32], [57, -0.24, 0.26],
];

/** Walnut ladder shelf: rungs widening downward, books + a tiny plant. */
export const LadderShelfArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    {/* grounding pool between the rail feet */}
    <ContactShadow rx={13} cx={9.5} cy={4.8} />
    {/* far rail */}
    <path d="M 18 0.6 L 2.4 -69.2" fill="none" stroke={INK} strokeWidth={4.2} />
    <path d="M 18 0.6 L 2.4 -69.2" fill="none" stroke={WALNUT} strokeWidth={2.6} />
    {/* rungs, bottom to top, leaning back with the rails */}
    {LS_RUNGS.map(([lift, c, depth], k) => {
      const at = pos(c, 0);
      return (
        <g key={lift} transform={`translate(${at.x.toFixed(1)} ${(at.y - lift).toFixed(1)})`}>
          <IsoBox base={WALNUT} w={depth} d={0.8} h={2.5} sw={SW_FINE} light={k === 0} />
          {k === 0 ? (
            <path d={grainR(depth, 0.8, 2.5, 0.05, LS_GRAIN_SEED)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.35} />
          ) : null}
        </g>
      );
    })}
    {/* books leaning on the bottom rung — warm cast shadow at their feet */}
    <g transform="translate(6 -11.5)">
      <ellipse cx={-1.4} cy={0.3} rx={4.4} ry={1.4} fill="#3a2518" opacity={0.1} />
      <path d="M -5 0 L -2.2 0 L -1.4 -8.5 L -4.2 -8.5 Z" fill={WINE} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M -1.8 0 L 0.8 0 L 2.4 -7.5 L -0.2 -7.5 Z" fill={SAGE} stroke={INK} strokeWidth={SW_HAIR} />
    </g>
    {/* a flat book on the second rung */}
    <g transform="translate(1.4 -28.3)">
      <IsoBox base={PLUM_HEATHER} w={0.3} d={0.4} h={2} sw={SW_HAIR} />
    </g>
    {/* one leaner on the third */}
    <g transform="translate(-1.2 -43.3)">
      <path d="M -2.2 0 L 0.4 0 L 1.8 -6.5 L -0.8 -6.5 Z" fill={ROSE} stroke={INK} strokeWidth={SW_HAIR} />
    </g>
    {/* tiny potted plant on the top rung */}
    <g transform="translate(-4.8 -61.9)">
      <path d="M -1.8 0 L 1.8 0 L 2.5 -4.5 L -2.5 -4.5 Z" fill={TERRACOTTA} stroke={INK} strokeWidth={SW_FINE} />
      {/* soil shadow inside the rim + a rim highlight */}
      <ellipse cx={0} cy={-4.4} rx={1.9} ry={0.55} fill="#3a2518" opacity={0.3} />
      <path d="M -2.3 -4.5 L 2.3 -4.5" fill="none" stroke={shade(TERRACOTTA, 0.35)} strokeWidth={0.7} opacity={0.9} />
      {/* two-tone leaves: shaded side away from the window */}
      <g stroke={INK} strokeWidth={SW_HAIR}>
        <ellipse cx={-2} cy={-6.5} rx={2.4} ry={1.3} transform="rotate(-28 -2 -6.5)" fill={shade(SAGE, -0.1)} />
        <ellipse cx={2} cy={-6.8} rx={2.4} ry={1.3} transform="rotate(24 2 -6.8)" fill={shade(SAGE, 0.1)} />
        <ellipse cx={0} cy={-8} rx={1.4} ry={2.4} fill={SAGE} />
      </g>
      {/* central veins */}
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.7}>
        <path d="M -3.9 -5.6 L -0.1 -7.4" />
        <path d="M 0.2 -7.6 L 3.8 -6" />
        <path d="M 0 -6.2 L 0 -9.8" />
      </g>
    </g>
    {/* near rail + a varnish sheen along its lit side */}
    <path d="M 1.2 9 L -14.4 -60.8" fill="none" stroke={INK} strokeWidth={4.2} />
    <path d="M 1.2 9 L -14.4 -60.8" fill="none" stroke={WALNUT} strokeWidth={2.6} />
    <path d="M 2 8.6 L -13.6 -61.2" fill="none" stroke={shade(WALNUT, 0.35)} strokeWidth={0.8} opacity={0.7} />
    {/* contact shadow ticks at the rail feet */}
    <path d="M 15.6 1.6 L 20 1.6 M -1 10 L 3.4 10" stroke={INK} strokeWidth={1.4} opacity={0.18} fill="none" />
  </g>
);

/* ── Bar cart — 1×1 tile, h ~34, brass two-tier ──────────────── */

const BAR_GRAIN_SEED = 2.6 + seedFrom('bar-cart-grain') * 6;

/** Post corners of the 0.8×0.8 frame, far to near (near post drawn last). */
const BAR_POSTS_BACK: ReadonlyArray<readonly [number, number]> = [
  [0, -8], [-16, 0], [16, 0],
];

/** Brass cart on casters: glass top with a glint, bottles + tumblers. */
export const BarCartArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <TopGrad id="oh-bar-cart-g1" base={WALNUT} />
    </defs>
    {/* grounding pool under the casters */}
    <ContactShadow rx={15} />
    {/* back + side posts */}
    {BAR_POSTS_BACK.map(([px, py]) => (
      <g key={`${px},${py}`}>
        <path d={`M ${px} ${py} L ${px} ${py - 28}`} fill="none" stroke={INK} strokeWidth={3} />
        <path d={`M ${px} ${py} L ${px} ${py - 28}`} fill="none" stroke={BRASS} strokeWidth={1.6} />
      </g>
    ))}
    {/* one specular stroke on the east post */}
    <path d="M 16.6 -6 L 16.6 -18" fill="none" stroke={shade(BRASS, 0.55)} strokeWidth={0.8} opacity={0.9} />
    {/* lower walnut shelf + brass rail */}
    <g transform="translate(0 -8)">
      <IsoBox base={WALNUT} w={0.72} d={0.72} h={2} sw={SW_FINE} topFill="url(#oh-bar-cart-g1)" />
      <path d={grainR(0.72, 0.72, 2, 0.1, BAR_GRAIN_SEED)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
    </g>
    <path d={isoDiamond(0.8, 0.8, 8)} fill="none" stroke={INK} strokeWidth={2.4} />
    <path d={isoDiamond(0.8, 0.8, 8)} fill="none" stroke={BRASS} strokeWidth={1.2} />
    {/* two bottles on the shelf — sage + wine glass, soft shadows at their feet */}
    <g transform="translate(-4 -10)">
      <ellipse cx={0} cy={-1.6} rx={3} ry={1.2} fill="#3a2518" opacity={0.12} />
      <rect x={-2.2} y={-11} width={4.4} height={9} rx={1.8} fill={SAGE} opacity={0.85} stroke={INK} strokeWidth={SW_HAIR} />
      <rect x={-0.9} y={-15.5} width={1.8} height={5} fill={SAGE} opacity={0.85} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M -1.1 -10.2 L -1.1 -3.6" stroke="#ffffff" strokeWidth={0.8} opacity={0.55} fill="none" />
    </g>
    <g transform="translate(3.5 -9.5)">
      <ellipse cx={0} cy={-1.4} rx={2.8} ry={1.1} fill="#3a2518" opacity={0.12} />
      <rect x={-2} y={-9.5} width={4} height={7.8} rx={1.6} fill={WINE} opacity={0.88} stroke={INK} strokeWidth={SW_HAIR} />
      <rect x={-0.8} y={-13.5} width={1.6} height={4.4} fill={WINE} opacity={0.88} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M -0.9 -8.8 L -0.9 -3" stroke="#ffffff" strokeWidth={0.7} opacity={0.5} fill="none" />
    </g>
    {/* glass top: brass frame, low-opacity pane, white glint + frame specular */}
    <path d={isoDiamond(0.8, 0.8, 28)} fill="none" stroke={INK} strokeWidth={3} />
    <path d={isoDiamond(0.8, 0.8, 28)} fill="none" stroke={BRASS_BRIGHT} strokeWidth={1.5} />
    <path d="M 3 -21.6 L 11 -25.6" fill="none" stroke="#fff3dc" strokeWidth={1} opacity={0.55} />
    <path d={isoDiamond(0.72, 0.72, 28.4)} fill="#ffffff" opacity={0.15} />
    <path d="M -9 -30.4 L 7 -26.4" stroke="#ffffff" strokeWidth={1} opacity={0.6} fill="none" />
    {/* two tumblers riding the glass, faint shadows under their bases */}
    <g transform="translate(-5 -29)">
      <ellipse cx={0} cy={-0.4} rx={2.2} ry={0.9} fill="#3a2518" opacity={0.08} />
      <rect x={-1.8} y={-5} width={3.6} height={5} rx={0.8} fill="#ffffff" opacity={0.3} stroke={INK} strokeWidth={SW_HAIR} />
      <path d="M -0.8 -4.2 L -0.8 -1" stroke="#ffffff" strokeWidth={0.7} opacity={0.6} fill="none" />
    </g>
    <g transform="translate(2 -27.5)">
      <ellipse cx={0} cy={-0.4} rx={2} ry={0.8} fill="#3a2518" opacity={0.08} />
      <rect x={-1.6} y={-4.4} width={3.2} height={4.4} rx={0.8} fill="#ffffff" opacity={0.3} stroke={INK} strokeWidth={SW_HAIR} />
    </g>
    {/* near post */}
    <path d="M 0 8 L 0 -20" fill="none" stroke={INK} strokeWidth={3} />
    <path d="M 0 8 L 0 -20" fill="none" stroke={BRASS} strokeWidth={1.6} />
    {/* casters */}
    <circle cx={0} cy={-6.2} r={1.8} fill={shade(INK, -0.1)} />
    <circle cx={-16} cy={1.8} r={1.8} fill={shade(INK, -0.1)} />
    <circle cx={16} cy={1.8} r={1.8} fill={shade(INK, -0.1)} />
    <circle cx={0} cy={9.6} r={1.8} fill={shade(INK, -0.1)} />
  </g>
);

/* ── TV console — 2×1 tiles, console h ~24 + TV → ~58 total ──── */

const TVC_GRAIN_SEED = 4.4 + seedFrom('tv-console-grain') * 7;

/** Leg corners of the console, far to near. */
const TVC_LEGS: ReadonlyArray<readonly [number, number]> = [
  [9.4, -12.3], [24.6, -4.7], [-24.6, 4.7], [-9.4, 12.3],
];

/** Walnut cane-door console with a slim near-black TV standing on it. */
export const TvConsoleArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g strokeLinecap="round" strokeLinejoin="round" transform={facing === 1 ? 'scale(-1 1)' : undefined}>
    <defs>
      <TopGrad id="oh-tv-console-g1" base={WALNUT} />
      <SideGrad id="oh-tv-console-g2" base={WALNUT} face={FACE_RIGHT} />
      <SideGrad id="oh-tv-console-g3" base={WALNUT} face={FACE_LEFT} />
    </defs>
    {/* grounding pool under the legs */}
    <ContactShadow rx={26} />
    {TVC_LEGS.map(([lx, ly]) => (
      <g key={`${lx},${ly}`} transform={`translate(${lx} ${ly})`}>
        <IsoBox base={WALNUT_DEEP} w={0.1} d={0.1} h={4} sw={SW_FINE} />
      </g>
    ))}
    {/* console body with cane-weave doors */}
    <g transform="translate(0 -4)">
      <IsoBox base={WALNUT} w={0.9} d={1.9} h={16} ao rightFill="url(#oh-tv-console-g2)" leftFill="url(#oh-tv-console-g3)" />
      {([[0.14, 0.88], [1.02, 1.76]] as ReadonlyArray<readonly [number, number]>).map(([t0, t1]) => (
        <g key={t0}>
          <path d={faceRect(0.9, 1.9, t0, t1, -2, -13.5)} fill={shade(OAK, 0.18)} stroke={INK_SOFT} strokeWidth={SW_FINE} />
          <path d={caneHatch(0.9, 1.9, t0, t1, -2, -13.5)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.8} />
        </g>
      ))}
      {/* occlusion tucked under the top slab */}
      <path d={faceLine(0.9, 1.9, 0.05, -15.6, 1.85, -15.6)} fill="none" stroke={shade(WALNUT, -0.5)} strokeWidth={1.3} opacity={0.5} />
      {/* brass door knobs, one specular tick */}
      <circle cx={facePt(0.9, 1.9, 0.84, -8).x} cy={facePt(0.9, 1.9, 0.84, -8).y} r={1.5} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <circle cx={facePt(0.9, 1.9, 1.06, -8).x} cy={facePt(0.9, 1.9, 1.06, -8).y} r={1.5} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path
        d={`M ${(facePt(0.9, 1.9, 0.84, -8).x - 0.7).toFixed(1)} ${(facePt(0.9, 1.9, 0.84, -8).y - 0.5).toFixed(1)} l 0.8 -0.4`}
        stroke={shade(BRASS, 0.55)}
        strokeWidth={0.7}
        fill="none"
      />
    </g>
    {/* console top slab + grain + catch-light */}
    <g transform="translate(0 -20)">
      <IsoBox base={WALNUT} w={1.02} d={2.02} h={3} sw={SW_FINE} light topFill="url(#oh-tv-console-g1)" />
      <EdgeLight w={1.02} d={2.02} h={3} />
      <g fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR}>
        <path d={grainR(1.02, 2.02, 3, 0.1, TVC_GRAIN_SEED)} />
        <path d={grainR(1.02, 2.02, 3, -0.24, TVC_GRAIN_SEED * 3)} opacity={0.6} />
      </g>
    </g>
    {/* the television, standing on the console */}
    <g transform="translate(0 -23)">
      {/* the panel's soft shadow pooling on the console top */}
      <ellipse cx={0} cy={0.8} rx={15} ry={2.6} fill="#3a2518" opacity={0.12} />
      {/* small feet */}
      <g transform="translate(10.4 -4.8)">
        <IsoBox base={shade(INK, -0.2)} w={0.14} d={0.1} h={2} sw={SW_HAIR} />
      </g>
      <g transform="translate(-9.6 5.2)">
        <IsoBox base={shade(INK, -0.2)} w={0.14} d={0.1} h={2} sw={SW_HAIR} />
      </g>
      {/* slim panel */}
      <g transform="translate(0 -2)">
        <IsoBox base={shade(INK, -0.15)} w={0.12} d={1.55} h={32} sw={SW_FINE} />
        {/* near-black screen inside a thin bezel */}
        <path d={faceRect(0.12, 1.55, 0.07, 1.48, -4.5, -29.5)} fill={shade(INK, -0.4)} stroke={shade(INK, 0.18)} strokeWidth={0.8} />
        {/* faint window-light glint, diagonal */}
        <path
          d={
            `M ${P(facePt(0.12, 1.55, 0.32, -27.5))} L ${P(facePt(0.12, 1.55, 0.55, -27.5))}`
            + ` L ${P(facePt(0.12, 1.55, 1.12, -6.5))} L ${P(facePt(0.12, 1.55, 0.89, -6.5))} Z`
          }
          fill="#ffffff"
          opacity={0.07}
        />
        <path d={faceLine(0.12, 1.55, 0.42, -27.5, 1.05, -6.5)} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.13} />
      </g>
    </g>
  </g>
);

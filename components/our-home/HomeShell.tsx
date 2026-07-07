/**
 * OUR HOME — the architecture shell (bare box).
 *
 * Deliberately empty: two deep-eucalyptus walls with walnut panel wainscot
 * and cream rails, a rich walnut tile floor, and a pool of warm stage light.
 * Everything else — windows, the front door, the hearth — is furniture the
 * couple places themselves. The shell takes no props and never re-renders.
 */
import React from 'react';
import {
  FLOOR_WALNUT, FLOOR_WALNUT_DEEP, INK, STAGE_GLOW, SW, SW_HAIR,
  WALL_TEAL_L, WALL_TEAL_R, WALL_TRIM, WALNUT,
} from './homeArt';
import {
  FLOOR_CORNERS, GRID, ISO_ORIGIN, WALL_H, isoDiamond, shade, tileToScene,
  wallRect,
} from './homeIso';

const pt = (p: { x: number; y: number }) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

const WAINSCOT_H = 36;
const PLINTH_H = 26;

const HomeShellBase = (): React.JSX.Element => {
  const top = ISO_ORIGIN;
  const L = FLOOR_CORNERS.left;
  const R = FLOOR_CORNERS.right;
  const B = FLOOR_CORNERS.bottom;

  return (
    <g>
      {/* diorama glow — the room sits in a pool of warm stage light */}
      <defs>
        <radialGradient id="oh-stageglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={STAGE_GLOW} stopOpacity="0.26" />
          <stop offset="0.55" stopColor={STAGE_GLOW} stopOpacity="0.09" />
          <stop offset="1" stopColor={STAGE_GLOW} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oh-keycore" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f7d492" stopOpacity="0.30" />
          <stop offset="0.6" stopColor="#f0bd72" stopOpacity="0.10" />
          <stop offset="1" stopColor="#f0bd72" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oh-floorpool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f8d89c" stopOpacity="0.24" />
          <stop offset="0.68" stopColor="#f2c37b" stopOpacity="0.07" />
          <stop offset="1" stopColor="#f2c37b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oh-cast" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7a5138" stopOpacity="0.48" />
          <stop offset="0.62" stopColor="#7a5138" stopOpacity="0.22" />
          <stop offset="1" stopColor="#7a5138" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oh-bounce" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c9a876" stopOpacity="0.12" />
          <stop offset="0.65" stopColor="#c9a876" stopOpacity="0.05" />
          <stop offset="1" stopColor="#c9a876" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="oh-wallL" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(WALL_TEAL_L, 0.17)} />
          <stop offset="1" stopColor={shade(WALL_TEAL_L, -0.06)} />
        </linearGradient>
        <linearGradient id="oh-wallR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(WALL_TEAL_R, 0.15)} />
          <stop offset="1" stopColor={shade(WALL_TEAL_R, -0.05)} />
        </linearGradient>
      </defs>
      {/* two-layer warm key light: a wide ambient wash + a hot core over the room */}
      <ellipse cx={top.x} cy={304} rx={274} ry={198} fill="url(#oh-stageglow)" />
      <ellipse cx={top.x} cy={286} rx={160} ry={134} fill="url(#oh-keycore)" />

      {/* the room rests on a lit onyx plinth, grounded by one soft cast shadow;
          a faint kraft bounce-glow gives the void below a believable stage floor */}
      <ellipse cx={B.x} cy={B.y + PLINTH_H + 8} rx={220} ry={45} fill="url(#oh-bounce)" />
      <ellipse cx={B.x} cy={B.y + PLINTH_H + 8} rx={185} ry={38} fill="url(#oh-cast)" />
      <path
        d={`M ${L.x} ${L.y} L ${B.x} ${B.y} L ${B.x} ${B.y + PLINTH_H} L ${L.x} ${L.y + PLINTH_H} Z`}
        fill="#bd9b7b" stroke="none"
      />
      <path
        d={`M ${R.x} ${R.y} L ${B.x} ${B.y} L ${B.x} ${B.y + PLINTH_H} L ${R.x} ${R.y + PLINTH_H} Z`}
        fill="#cfae8b" stroke="none"
      />
      <path
        d={`M ${L.x} ${(L.y + PLINTH_H).toFixed(1)} L ${B.x} ${(B.y + PLINTH_H).toFixed(1)} L ${R.x} ${(R.y + PLINTH_H).toFixed(1)}`}
        fill="none" stroke={INK} strokeWidth={SW_HAIR} opacity={0.5}
      />

      {/* walls — deep eucalyptus, lit from the right */}
      <path
        d={`M ${pt(top)} L ${pt(L)} L ${L.x.toFixed(1)} ${(L.y - WALL_H).toFixed(1)} L ${top.x.toFixed(1)} ${(top.y - WALL_H).toFixed(1)} Z`}
        fill="url(#oh-wallL)" stroke={INK} strokeWidth={SW}
      />
      <path
        d={`M ${pt(top)} L ${pt(R)} L ${R.x.toFixed(1)} ${(R.y - WALL_H).toFixed(1)} L ${top.x.toFixed(1)} ${(top.y - WALL_H).toFixed(1)} Z`}
        fill="url(#oh-wallR)" stroke={INK} strokeWidth={SW}
      />
      {/* soft ambient-occlusion down the inner corner where the walls meet */}
      <path
        d={`M ${top.x} ${(top.y - WALL_H).toFixed(1)} L ${top.x} ${top.y}`}
        fill="none" stroke={INK} strokeWidth={2.4} strokeOpacity={0.14}
      />
      {/* a warm rim-light traces the lit box's top silhouette against the dark stage */}
      <path
        d={`M ${L.x} ${(L.y - WALL_H).toFixed(1)} L ${top.x} ${(top.y - WALL_H).toFixed(1)} L ${R.x} ${(R.y - WALL_H).toFixed(1)}`}
        fill="none" stroke="#fffaf0" strokeOpacity={0.5} strokeWidth={SW_HAIR}
      />
      {/* light settles darker just above the wainscot */}
      <path d={wallRect('L', 0, WAINSCOT_H + 3, GRID, 34)} fill={shade(WALL_TEAL_L, -0.12)} stroke="none" opacity={0.5} />
      <path d={wallRect('R', 0, WAINSCOT_H + 3, GRID, 34)} fill={shade(WALL_TEAL_R, -0.09)} stroke="none" opacity={0.45} />

      {/* walnut panel wainscot with a cream cap rail */}
      <path d={wallRect('L', 0, 0, GRID, WAINSCOT_H)} fill={shade(WALNUT, -0.12)} stroke="none" />
      <path d={wallRect('R', 0, 0, GRID, WAINSCOT_H)} fill={shade(WALNUT, 0.02)} stroke="none" />
      {Array.from({ length: GRID }, (_, i) => (
        <g key={`wp-${i}`}>
          <path d={wallRect('L', i + 0.14, 6, 0.72, WAINSCOT_H - 13)} fill="none" stroke={shade(WALNUT, -0.34)} strokeWidth={SW_HAIR} />
          <path d={wallRect('R', i + 0.14, 6, 0.72, WAINSCOT_H - 13)} fill="none" stroke={shade(WALNUT, -0.24)} strokeWidth={SW_HAIR} />
        </g>
      ))}
      <path d={wallRect('L', 0, WAINSCOT_H, GRID, 3.5)} fill={shade(WALL_TRIM, -0.16)} stroke="none" />
      <path d={wallRect('R', 0, WAINSCOT_H, GRID, 3.5)} fill={WALL_TRIM} stroke="none" />
      {/* a cream picture rail high on both walls */}
      <path d={wallRect('L', 0, 118, GRID, 2.4)} fill={shade(WALL_TRIM, -0.2)} stroke="none" opacity={0.8} />
      <path d={wallRect('R', 0, 118, GRID, 2.4)} fill={shade(WALL_TRIM, -0.06)} stroke="none" opacity={0.85} />

      {/* floor — rich walnut boards */}
      <path
        d={`M ${pt(top)} L ${pt(R)} L ${pt(B)} L ${pt(L)} Z`}
        fill={FLOOR_WALNUT} stroke={INK} strokeWidth={SW}
      />
      {/* soft alternate-tile weave so the grid reads without shouting */}
      {Array.from({ length: GRID }, (_, c) => Array.from({ length: GRID }, (_, r) => {
        if ((c + r) % 2 === 0) return null;
        const ctr = tileToScene(c + 0.5, r + 0.5);
        return (
          <path
            key={`${c}-${r}`}
            d={isoDiamond(1, 1)}
            transform={`translate(${ctr.x}, ${ctr.y})`}
            fill={shade(FLOOR_WALNUT, 0.05)} stroke="none"
          />
        );
      }))}
      {/* plank seams along the rows + a warm sheen where the light lands */}
      {Array.from({ length: GRID - 1 }, (_, i) => {
        const s = tileToScene(0, i + 1);
        const e = tileToScene(GRID, i + 1);
        return <line key={i} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={FLOOR_WALNUT_DEEP} strokeWidth={SW_HAIR} opacity={0.7} />;
      })}
      {/* staggered butt joints — the boards read hand-laid, not printed */}
      {Array.from({ length: GRID }, (_, i) => {
        const c1 = ((i * 3.7) % (GRID - 1.6)) + 0.8;
        const c2 = ((i * 6.3 + 3.1) % (GRID - 1.6)) + 0.8;
        return [c1, c2].map((c, j) => {
          const s = tileToScene(c, i);
          const e = tileToScene(c, i + 1);
          return (
            <line
              key={`bj-${i}-${j}`}
              x1={s.x} y1={s.y} x2={e.x} y2={e.y}
              stroke={FLOOR_WALNUT_DEEP} strokeWidth={SW_HAIR} opacity={0.4}
            />
          );
        });
      })}
      {/* a warm pool of light spills across the floor where the key light lands */}
      {(() => {
        const c = tileToScene(GRID / 2, GRID / 2);
        return (
          <path
            d={isoDiamond(7.6, 7.6)}
            transform={`translate(${c.x}, ${c.y})`}
            fill="url(#oh-floorpool)" stroke="none"
          />
        );
      })()}

      {/* the floor darkens where it slips under the walls — grounds the box */}
      <path
        d={`M ${top.x} ${top.y} L ${R.x} ${R.y} L ${(R.x - 8.9).toFixed(1)} ${(R.y + 4.5).toFixed(1)} L ${(top.x - 8.9).toFixed(1)} ${(top.y + 4.5).toFixed(1)} Z`}
        fill={FLOOR_WALNUT_DEEP} opacity={0.28} stroke="none"
      />
      <path
        d={`M ${top.x} ${top.y} L ${L.x} ${L.y} L ${(L.x + 8.9).toFixed(1)} ${(L.y + 4.5).toFixed(1)} L ${(top.x + 8.9).toFixed(1)} ${(top.y + 4.5).toFixed(1)} Z`}
        fill={FLOOR_WALNUT_DEEP} opacity={0.34} stroke="none"
      />

      {/* baseboard edges where walls meet floor — deepened for a recessed AO seam */}
      <line x1={top.x} y1={top.y} x2={L.x} y2={L.y} stroke={INK} strokeWidth={SW_HAIR} opacity={0.75} />
      <line x1={top.x} y1={top.y} x2={R.x} y2={R.y} stroke={INK} strokeWidth={SW_HAIR} opacity={0.75} />

      {/* the signature: one gilt reading-light catches the plinth's front lip */}
      <line x1={L.x} y1={L.y} x2={B.x} y2={B.y} stroke="#d9a662" strokeWidth={SW_HAIR} opacity={0.5} />
      <line x1={R.x} y1={R.y} x2={B.x} y2={B.y} stroke="#d9a662" strokeWidth={SW_HAIR} opacity={0.5} />
    </g>
  );
};

/** Static architecture — memoized, prop-less, never reconciles. */
export const HomeShell = React.memo(HomeShellBase);

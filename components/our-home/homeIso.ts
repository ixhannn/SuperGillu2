/**
 * OUR HOME — the isometric stage.
 *
 * The room is a cozy corner box seen in classic 2:1 isometric — two walls
 * meeting at the back, a diamond of floor tiles in front (the Tuber Simulator
 * camera, warmed up). Everything here is pure math + path generators so the
 * shell, the seats, and every piece of furniture share one projection and one
 * light (from the upper right: top faces brightest, left faces darkest).
 */

/* ── the grid ────────────────────────────────────────────────── */

export const TILE_W = 40; // screen px per tile, x-diagonal
export const TILE_H = 20; // screen px per tile, y-diagonal (2:1)
export const GRID = 9; // 9×9 floor tiles
export const WALL_H = 150; // wall height in screen px

/** Top corner of the floor diamond (where the two walls meet). */
export const ISO_ORIGIN = { x: 195, y: 268 } as const;

/** Floor-plane tile → screen point (tile centres live at +0.5, +0.5). */
export const tileToScene = (col: number, row: number): { x: number; y: number } => ({
  x: ISO_ORIGIN.x + (col - row) * (TILE_W / 2),
  y: ISO_ORIGIN.y + (col + row) * (TILE_H / 2),
});

/** Screen point → fractional floor tile (col/row may be out of range). */
export const sceneToTile = (x: number, y: number): { col: number; row: number } => {
  const dx = (x - ISO_ORIGIN.x) / (TILE_W / 2);
  const dy = (y - ISO_ORIGIN.y) / (TILE_H / 2);
  return { col: (dy + dx) / 2, row: (dy - dx) / 2 };
};

export const FLOOR_CORNERS = {
  top: tileToScene(0, 0),
  right: tileToScene(GRID, 0),
  bottom: tileToScene(GRID, GRID),
  left: tileToScene(0, GRID),
} as const;

/* ── light & shading ─────────────────────────────────────────── */

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Darken (f<0) or lift (f>0) a hex colour — the only shading the room uses. */
export const shade = (hex: string, f: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => {
    const out = f < 0 ? v * (1 + f) : v + (255 - v) * f;
    return Math.round(Math.min(255, Math.max(0, out))).toString(16).padStart(2, '0');
  };
  return `#${c(r)}${c(g)}${c(b)}`;
};

/** Light from the upper right: top face = base, right face dim, left face dark. */
export const FACE_TOP = 0.06;
export const FACE_RIGHT = -0.18;
export const FACE_LEFT = -0.34;

/* ── primitives (all centred on the footprint's floor centre) ── */

const pt = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/**
 * The three visible faces of an axis-aligned box of `w`×`d` tiles and `h`
 * screen-px tall, anchored at the CENTRE of its footprint on the floor.
 * Returns closed path strings — fill top with base, right with shade(base,
 * FACE_RIGHT), left with shade(base, FACE_LEFT).
 */
export const isoBoxFaces = (w: number, d: number, h: number): {
  top: string; left: string; right: string; outline: string;
} => {
  // corners of the footprint diamond, centred at (0,0)
  // (w tiles along the col axis → toward the east corner; d along rows → west)
  const north = { x: (d - w) * (TILE_W / 4), y: -(w + d) * (TILE_H / 4) };
  const east = { x: (w + d) * (TILE_W / 4), y: (w - d) * (TILE_H / 4) };
  const south = { x: (w - d) * (TILE_W / 4), y: (w + d) * (TILE_H / 4) };
  const west = { x: -(w + d) * (TILE_W / 4), y: (d - w) * (TILE_H / 4) };
  const top = `M ${pt(north.x, north.y - h)} L ${pt(east.x, east.y - h)} L ${pt(south.x, south.y - h)} L ${pt(west.x, west.y - h)} Z`;
  const right = `M ${pt(east.x, east.y - h)} L ${pt(south.x, south.y - h)} L ${pt(south.x, south.y)} L ${pt(east.x, east.y)} Z`;
  const left = `M ${pt(west.x, west.y - h)} L ${pt(south.x, south.y - h)} L ${pt(south.x, south.y)} L ${pt(west.x, west.y)} Z`;
  const outline = `M ${pt(west.x, west.y)} L ${pt(west.x, west.y - h)} L ${pt(north.x, north.y - h)} L ${pt(east.x, east.y - h)} L ${pt(east.x, east.y)} L ${pt(south.x, south.y)} Z M ${pt(west.x, west.y - h)} L ${pt(south.x, south.y - h)} L ${pt(east.x, east.y - h)} M ${pt(south.x, south.y - h)} L ${pt(south.x, south.y)}`;
  return { top, left, right, outline };
};

/** A flat diamond on the floor plane (rugs, shadows, tile highlights). */
export const isoDiamond = (w: number, d: number, lift = 0): string => {
  const north = { x: (d - w) * (TILE_W / 4), y: -(w + d) * (TILE_H / 4) - lift };
  const east = { x: (w + d) * (TILE_W / 4), y: (w - d) * (TILE_H / 4) - lift };
  const south = { x: (w - d) * (TILE_W / 4), y: (w + d) * (TILE_H / 4) - lift };
  const west = { x: -(w + d) * (TILE_W / 4), y: (d - w) * (TILE_H / 4) - lift };
  return `M ${pt(north.x, north.y)} L ${pt(east.x, east.y)} L ${pt(south.x, south.y)} L ${pt(west.x, west.y)} Z`;
};

/** An ellipse squashed onto the floor plane (soft shadows, pools, round rugs). */
export const isoEllipse = (rx: number, lift = 0): { rx: number; ry: number; dy: number } => ({
  rx,
  ry: rx / 2,
  dy: -lift,
});

/**
 * A cylinder on the floor plane: side + top-ellipse, centred on the footprint.
 * Returns paths for the side and the top disc.
 */
export const isoCylinder = (r: number, h: number): { side: string; topCx: number; topCy: number; rx: number; ry: number } => ({
  side: `M ${pt(-r, 0)} L ${pt(-r, -h)} A ${r} ${r / 2} 0 0 0 ${pt(r, -h)} L ${pt(r, 0)} A ${r} ${r / 2} 0 0 1 ${pt(-r, 0)} Z`,
  topCx: 0,
  topCy: -h,
  rx: r,
  ry: r / 2,
});

/* ── walls (for the shell + wall-hung objects) ───────────────── */

export type WallSide = 'L' | 'R';

/**
 * A point ON a wall: `along` runs 0..GRID from the corner (top of the
 * diamond) outward; `up` is screen px above the floor line.
 * Left wall runs toward FLOOR_CORNERS.left, right wall toward .right.
 */
export const wallToScene = (side: WallSide, along: number, up: number): { x: number; y: number } => {
  const dir = side === 'L' ? -1 : 1;
  return {
    x: ISO_ORIGIN.x + dir * along * (TILE_W / 2),
    y: ISO_ORIGIN.y + along * (TILE_H / 2) - up,
  };
};

/** A rectangle painted flat on a wall (windows, frames, panelling). */
export const wallRect = (side: WallSide, along: number, up: number, wTiles: number, hPx: number): string => {
  const a = wallToScene(side, along, up);
  const b = wallToScene(side, along + wTiles, up);
  const c = wallToScene(side, along + wTiles, up + hPx);
  const d = wallToScene(side, along, up + hPx);
  return `M ${pt(a.x, a.y)} L ${pt(b.x, b.y)} L ${pt(c.x, c.y)} L ${pt(d.x, d.y)} Z`;
};

/**
 * Skews that lay flat artwork onto a wall plane. Draw a wall-hung object in
 * plain screen coords around its hang point (x = width, negative y = up),
 * then wrap it: <g transform={WALL_SKEW_L}>…</g> for the left wall,
 * WALL_SKEW_R for the right. (tan 26.565° = 0.5 — the 2:1 wall slope.)
 */
export const WALL_SKEW_L = 'skewY(-26.565)';
export const WALL_SKEW_R = 'skewY(26.565)';

/** Depth key for painter's-algorithm sorting: farther = smaller. */
export const depthOf = (x: number, y: number): number => y;

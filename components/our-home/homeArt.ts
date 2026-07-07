/**
 * OUR HOME — shared art vocabulary.
 *
 * Every hand-inked SVG in the home draws from THIS palette and nothing else.
 * The look is a warm storybook interior: sepia lines (never pure black),
 * flat fills plus exactly one darker sibling-shade per object, deliberately
 * imperfect shapes. See docs/OUR_HOME_VISION.md §2.
 */

/* ── The room itself (rose-plaster direction) ─────────────────
   Dusty rose-clay plaster walls — the app's own warmth, muted, never
   candy — with cream trim, walnut wainscot and a honeyed oak floor.
   Wine and linen furniture reads tonal-rich against it.
   (Constant names kept for stability; the values moved off eucalyptus.) */
export const WALL_TEAL = '#c39288';
export const WALL_TEAL_R = '#cf9f92'; // lit right wall
export const WALL_TEAL_L = '#b08279'; // shaded left wall
export const WALL_TRIM = '#f6ecd9'; // cream rails & baseboards
export const FLOOR_WALNUT = '#a97e52';
export const FLOOR_WALNUT_DEEP = '#88643f';
export const STAGE_GLOW = '#e8b06a';

/* ── Ink & paper ─────────────────────────────────────────────── */
export const INK = '#5b4437'; // warm sepia outline — the only line colour
export const INK_SOFT = '#8a7160'; // secondary detail strokes (woodgrain, stitching)
export const CREAM_WALL = '#f6efe4';
export const CREAM_WALL_SHADE = '#ece2d1';
export const PAPER = '#fbf4e6'; // notes, plaques, parcels' tags
export const PAPER_SHADE = '#f0e4cd';
export const KRAFT = '#c9a876'; // parcel paper, shoebox
export const KRAFT_SHADE = '#b08f5c';

/* ── Textiles ────────────────────────────────────────────────── */
export const WINE = '#7a3b4a';
export const WINE_DEEP = '#5e2d3a';
export const ROSE = '#c9909a';
export const ROSE_PALE = '#e7c6cb';
export const PLUM_HEATHER = '#6d4a63';
export const PLUM_HEATHER_DEEP = '#553a4e';
export const LINEN = '#efe3d0';
export const LINEN_SHADE = '#e1d1b8';

/* ── Woods & metals ──────────────────────────────────────────── */
export const OAK = '#c89b62';
export const OAK_DEEP = '#a87b48';
export const WALNUT = '#7b5b3e';
export const WALNUT_DEEP = '#5f4530';
export const BRASS = '#b98a4f';
export const BRASS_BRIGHT = '#d9ab68';
export const TERRACOTTA = '#bd7355';
export const TERRACOTTA_DEEP = '#9e5c42';

/* ── Living things ───────────────────────────────────────────── */
export const SAGE = '#8fa383';
export const SAGE_DEEP = '#6f8465';
export const BLOOM_ROSE = '#d8a0a8';

/* ── Light (alpha gradients only — NO blend modes, ever) ─────── */
export const LAMP_GOLD = '#f2c37b';
export const CANDLE_GOLD = '#f0b95e';
export const EMBER = '#d97b4f';
export const EMBER_DEEP = '#a34f2e';
export const WARMTH_HALO = '#e8b06a'; // the touch-warmth colour
export const NIGHT_PLUM = '#2e1f33'; // air-tint at midnight
export const DUSK_AMBER = '#c98a4e';
export const DAWN_GOLD = '#f3d9a4';

/* ── Partner inks (voice, never tally) ───────────────────────── */
export const INK_WINE = WINE; // partner ink A
export const INK_GOLD = '#a97e3c'; // partner ink B (dusty gold, readable on cream)

/* ── Line weights ────────────────────────────────────────────── */
export const SW = 1.8; // primary outline
export const SW_FINE = 1.1; // detail strokes
export const SW_HAIR = 0.7; // grain / stitching

/* ── Seat hairlines (the placement guide language) ───────────── */
export const SEAT_GOLD = '#d9a662';

/**
 * A hand-wobbled horizontal-ish line: subtle per-segment jitter so no stroke
 * in the room reads machine-drawn. Deterministic (seeded) so renders are
 * stable across frames and devices.
 */
export const wobblyLine = (
  x1: number, y1: number, x2: number, y2: number, seed = 1, amp = 0.7,
): string => {
  const segments = 4;
  let d = `M ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    // cheap deterministic pseudo-random in [-1, 1]
    const r = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
    const jitter = ((r - Math.floor(r)) * 2 - 1) * amp;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t + jitter;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
};

/**
 * A deliberately imperfect ellipse path (for cushions, pools, plates).
 * `squish` biases the bottom flatter, like something resting under weight.
 */
export const softEllipse = (
  cx: number, cy: number, rx: number, ry: number, seed = 1, squish = 0.12,
): string => {
  const k = 0.5523; // circle Bézier constant
  const r = Math.sin(seed * 91.7) * 43758.5453;
  const wob = ((r - Math.floor(r)) * 2 - 1) * rx * 0.03;
  const ryBottom = ry * (1 - squish);
  return [
    `M ${(cx - rx).toFixed(1)} ${cy.toFixed(1)}`,
    `C ${(cx - rx).toFixed(1)} ${(cy - ry * k).toFixed(1)} ${(cx - rx * k + wob).toFixed(1)} ${(cy - ry).toFixed(1)} ${cx.toFixed(1)} ${(cy - ry).toFixed(1)}`,
    `C ${(cx + rx * k).toFixed(1)} ${(cy - ry).toFixed(1)} ${(cx + rx).toFixed(1)} ${(cy - ry * k).toFixed(1)} ${(cx + rx).toFixed(1)} ${cy.toFixed(1)}`,
    `C ${(cx + rx).toFixed(1)} ${(cy + ryBottom * k).toFixed(1)} ${(cx + rx * k).toFixed(1)} ${(cy + ryBottom).toFixed(1)} ${cx.toFixed(1)} ${(cy + ryBottom).toFixed(1)}`,
    `C ${(cx - rx * k - wob).toFixed(1)} ${(cy + ryBottom).toFixed(1)} ${(cx - rx).toFixed(1)} ${(cy + ryBottom * k).toFixed(1)} ${(cx - rx).toFixed(1)} ${cy.toFixed(1)}`,
    'Z',
  ].join(' ');
};

/** Stable pseudo-random in [0,1) from a string — for per-object seeds. */
export const seedFrom = (key: string): number => {
  let h = 5381;
  for (let i = 0; i < key.length; i += 1) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  const r = Math.sin(h) * 43758.5453;
  return r - Math.floor(r);
};

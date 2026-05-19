/**
 * roomPropPainters — high-quality per-prop canvas painters.
 *
 * Each painter draws within a 256x256 logical unit canvas (Painter handles
 * the pixel scale). Origin is top-left. Conventional layout:
 *   • Ground line at y≈232 (floor sprites)
 *   • Wall mounts use full canvas
 */

import { Painter, alpha, shade, mix } from './roomTextureLib';
import { PropKind, RoomCatalogItem } from './roomCatalog3D';

const INK = '#2a1c3d';
const SOFT_INK = '#3b2f50';
const WOOD_DARK = '#6b4527';
const WOOD = '#8f5e36';
const WOOD_LIGHT = '#c79068';
const GROUND_Y = 232;

const ground = (p: Painter, cx: number, w: number) => {
  p.contactShadow(cx, GROUND_Y, w * 0.55, w * 0.16, 0.32);
};

/** Draw a soft, blurred warm halo (used for light sources). */
const warmGlow = (p: Painter, cx: number, cy: number, r: number, hue = '#ffd591') => {
  p.halo(cx, cy, r, hue, 0.55);
};

// ─────────────────────────────────────────────────────────────────────────────
// PAINTERS
// ─────────────────────────────────────────────────────────────────────────────

const paintBed = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || shade(base, 25);
  ground(p, 128, 220);
  // Bed frame (wooden base)
  p.rect(34, 168, 188, 36, 10, p.linearGrad(0, 168, 0, 204, [[0, WOOD], [1, WOOD_DARK]]) as unknown as string);
  // Mattress
  p.rect(38, 132, 180, 50, 14, p.linearGrad(0, 132, 0, 182, [[0, '#fefefe'], [1, '#ece1ec']]) as unknown as string);
  // Sheet bottom
  p.rect(38, 168, 180, 16, 8, alpha(base, 0.42));
  // Folded blanket
  p.rect(38, 158, 180, 22, 10, p.linearGrad(0, 158, 0, 180, [[0, base], [1, shade(base, -16)]]) as unknown as string);
  p.rect(38, 158, 180, 4, 2, alpha('#ffffff', 0.4));
  // Headboard
  p.rect(28, 64, 200, 76, 16, p.linearGrad(0, 64, 0, 140, [[0, shade(base, 14)], [1, shade(base, -22)]]) as unknown as string);
  // Headboard tufting (button pattern)
  for (let i = 0; i < 5; i++) {
    const tx = 56 + i * 36;
    p.circle(tx, 100, 2.2, shade(base, -42));
  }
  // Two pillows
  p.rect(54, 92, 80, 44, 16, p.linearGrad(0, 92, 0, 136, [[0, '#ffffff'], [1, '#f5e6ec']]) as unknown as string);
  p.rect(122, 92, 84, 46, 16, p.linearGrad(0, 92, 0, 138, [[0, accent], [1, shade(accent, -16)]]) as unknown as string);
  // Pillow seams
  p.line(60, 116, 128, 116, alpha('#000', 0.08), 1.2);
  // Tossed blanket fold over the foot
  p.rect(46, 176, 164, 18, 10, p.linearGrad(0, 176, 0, 194, [[0, shade(base, -8)], [1, shade(base, -30)]]) as unknown as string);
};

const paintCanopyBed = (p: Painter, item: RoomCatalogItem) => {
  paintBed(p, item);
  // Posts
  p.rect(24, 4, 8, 232, 3, WOOD_DARK);
  p.rect(224, 4, 8, 232, 3, WOOD_DARK);
  // Crossbar
  p.rect(24, 4, 208, 8, 3, WOOD_DARK);
  // Drapes
  const drape = item.color;
  p.rect(28, 12, 56, 110, 6, p.linearGrad(28, 12, 28, 120, [[0, alpha(drape, 0.85)], [1, alpha(drape, 0.55)]]) as unknown as string);
  p.rect(172, 12, 56, 110, 6, p.linearGrad(172, 12, 172, 120, [[0, alpha(drape, 0.85)], [1, alpha(drape, 0.55)]]) as unknown as string);
  // Top valance
  p.rect(28, 12, 200, 22, 4, alpha(drape, 0.8));
};

const paintChair = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || shade(base, 22);
  ground(p, 128, 110);
  // Legs
  p.rect(72, 184, 8, 32, 2, WOOD_DARK);
  p.rect(176, 184, 8, 32, 2, WOOD_DARK);
  // Seat cushion
  p.rect(56, 156, 144, 36, 12, p.linearGrad(0, 156, 0, 192, [[0, accent], [1, shade(accent, -18)]]) as unknown as string);
  p.rect(56, 152, 144, 8, 6, shade(accent, 24));
  // Back rest
  p.rect(64, 64, 128, 96, 14, p.linearGrad(0, 64, 0, 160, [[0, base], [1, shade(base, -22)]]) as unknown as string);
  // Back highlight
  p.rect(74, 74, 16, 76, 6, alpha('#ffffff', 0.18));
  // Tufting
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      p.circle(82 + j * 30, 84 + i * 26, 1.6, alpha('#000', 0.18));
    }
  }
};

const paintReadingChair = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 120);
  // Arms
  p.rect(40, 120, 26, 88, 14, p.linearGrad(0, 120, 0, 208, [[0, shade(base, 18)], [1, shade(base, -18)]]) as unknown as string);
  p.rect(190, 120, 26, 88, 14, p.linearGrad(0, 120, 0, 208, [[0, shade(base, 18)], [1, shade(base, -18)]]) as unknown as string);
  // Seat cushion
  p.rect(60, 150, 136, 50, 16, p.linearGrad(0, 150, 0, 200, [[0, shade(base, 12)], [1, shade(base, -20)]]) as unknown as string);
  // Back rest (rounded high)
  p.rect(60, 36, 136, 122, 24, p.linearGrad(0, 36, 0, 158, [[0, shade(base, 22)], [1, base]]) as unknown as string);
  // Back welt seam
  p.rect(60, 36, 136, 6, 3, alpha('#fff', 0.16));
  // Throw pillow
  p.rect(82, 132, 50, 30, 10, p.linearGrad(0, 132, 0, 162, [[0, item.accent || '#fff'], [1, shade(item.accent || '#fff', -14)]]) as unknown as string);
  // Wooden legs
  p.rect(58, 200, 8, 18, 2, WOOD_DARK);
  p.rect(190, 200, 8, 18, 2, WOOD_DARK);
};

const paintRocker = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 130);
  // Rocker rails
  p.ellipse(128, 218, 90, 14, alpha(shade(base, -32), 0.92));
  p.ellipse(128, 218, 84, 6, shade(base, -10));
  // Seat
  p.rect(74, 150, 108, 30, 6, p.linearGrad(0, 150, 0, 180, [[0, base], [1, shade(base, -16)]]) as unknown as string);
  // Vertical slats back
  for (let i = 0; i < 6; i++) {
    p.rect(78 + i * 18, 70, 6, 86, 2, shade(base, -10));
  }
  // Top rail
  p.rect(70, 60, 116, 14, 6, shade(base, -22));
  // Arms
  p.rect(70, 124, 116, 6, 3, shade(base, -22));
};

const paintBeanbag = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || shade(base, 22);
  ground(p, 128, 140);
  // Sittable squash shape (two ellipses stacked)
  p.ellipse(128, 196, 100, 30, alpha(shade(base, -34), 0.92));
  p.ellipse(128, 168, 96, 52, p.linearGrad(0, 130, 0, 220, [[0, accent], [1, shade(base, -28)]]) as unknown as string);
  // Top dimple highlight
  p.ellipse(118, 138, 38, 12, alpha('#ffffff', 0.34));
  // Bottom seam
  p.line(60, 192, 196, 192, alpha('#000', 0.18), 1);
  // Stitch dots
  for (let i = 0; i < 7; i++) p.circle(74 + i * 16, 192, 0.8, alpha('#000', 0.4));
};

const paintPouf = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 100);
  p.ellipse(128, 200, 80, 16, alpha('#0c0a18', 0.32));
  // Cylinder body
  p.rect(54, 142, 148, 64, 28, p.linearGrad(0, 142, 0, 206, [[0, shade(base, 14)], [1, shade(base, -22)]]) as unknown as string);
  // Top ellipse
  p.ellipse(128, 142, 74, 14, shade(base, 22));
  // Button center
  p.circle(128, 142, 4, shade(base, -32));
  // Vertical stitching
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = 56 + t * 144;
    p.line(x, 144, x, 200, alpha(shade(base, -28), 0.4), 0.8);
  }
};

const paintBookshelf = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 160);
  // Carcass
  p.woodGrain(46, 28, 164, 184, item.color);
  // Outer frame
  p.rectS(46, 28, 164, 184, 4, 'rgba(0,0,0,0)', shade(item.color, -34), 1);
  // Shelves
  for (let i = 0; i < 4; i++) {
    const y = 60 + i * 38;
    p.rect(48, y, 160, 4, 1, shade(item.color, -28));
  }
  // Books — vary heights and tones
  const palette = ['#e85e6d', '#5dbcff', '#a3e25e', '#ffbf63', '#c08bff', '#ff8f9b', '#67d4a8', '#f8d35d'];
  for (let row = 0; row < 4; row++) {
    const baseY = 64 + row * 38;
    let x = 56;
    while (x < 196) {
      const w = 7 + Math.floor(Math.random() * 4);
      const h = 22 + Math.floor(Math.random() * 8);
      const c = palette[(row * 31 + x) % palette.length];
      p.rect(x, baseY + (32 - h), w, h, 1.5, p.linearGrad(0, baseY, 0, baseY + 32, [[0, shade(c, 16)], [1, shade(c, -16)]]) as unknown as string);
      p.rect(x + 1, baseY + (32 - h) + 3, 1, h - 6, 0, alpha('#ffffff', 0.18));
      x += w + 2;
    }
    // Small accent object on bottom shelf
    if (row === 3) {
      p.circle(190, baseY + 20, 8, '#34d399');
      p.rect(170, baseY + 16, 12, 14, 2, '#fb7185');
    }
  }
};

const paintModularShelf = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 200);
  p.woodGrain(24, 60, 208, 152, item.color);
  p.rectS(24, 60, 208, 152, 4, 'rgba(0,0,0,0)', shade(item.color, -34), 1);
  // Cross dividers
  p.rect(24, 130, 208, 5, 1, shade(item.color, -28));
  p.rect(122, 60, 5, 152, 1, shade(item.color, -28));
  // Plants, books, photo
  p.rect(38, 80, 76, 4, 1, shade(item.color, -22));
  for (let i = 0; i < 5; i++) {
    p.rect(40 + i * 14, 88, 8, 38, 1, ['#fca5a5', '#fde68a', '#a7f3d0', '#93c5fd', '#c4b5fd'][i]);
  }
  // Pot
  p.rect(150, 96, 24, 26, 4, '#a16207');
  p.ellipse(162, 96, 22, 8, '#bbf7d0');
  p.ellipse(156, 86, 14, 14, '#86efac');
  p.ellipse(168, 90, 12, 12, '#22c55e');
  // Bottom-left books stack
  p.rect(36, 152, 56, 8, 1, '#fca5a5');
  p.rect(36, 162, 56, 8, 1, '#93c5fd');
  p.rect(36, 172, 56, 8, 1, '#c4b5fd');
  // Bottom-right photo + decor
  p.rect(150, 152, 60, 40, 3, '#ede9fe');
  p.rect(154, 156, 52, 32, 2, '#fbcfe8');
  p.triangle([158, 188], [184, 162], [206, 188], alpha('#ffffff', 0.55));
};

const paintDesk = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 196);
  // Top
  p.rect(20, 116, 216, 22, 6, p.linearGrad(0, 116, 0, 138, [[0, shade(item.color, 24)], [1, shade(item.color, -8)]]) as unknown as string);
  p.woodGrain(20, 121, 216, 12, shade(item.color, 6));
  p.rect(20, 116, 216, 4, 2, alpha('#ffffff', 0.32));
  // Drawer block
  p.rect(38, 138, 80, 64, 6, p.linearGrad(0, 138, 0, 202, [[0, shade(item.color, -8)], [1, shade(item.color, -26)]]) as unknown as string);
  p.rect(46, 150, 64, 4, 2, alpha('#000', 0.18));
  p.rect(46, 168, 64, 4, 2, alpha('#000', 0.18));
  p.rect(46, 186, 64, 4, 2, alpha('#000', 0.18));
  for (let i = 0; i < 3; i++) p.circle(102, 156 + i * 18, 1.6, INK);
  // Legs
  p.rect(212, 138, 8, 76, 2, WOOD_DARK);
  // Monitor
  p.rect(132, 50, 84, 56, 4, '#1c1622');
  p.rect(136, 54, 76, 48, 2, p.linearGrad(136, 54, 136, 102, [[0, '#7dd3fc'], [1, '#0ea5e9']]) as unknown as string);
  p.rect(140, 60, 30, 8, 2, alpha('#fff', 0.4));
  p.rect(140, 72, 50, 6, 2, alpha('#fff', 0.18));
  p.rect(140, 82, 40, 6, 2, alpha('#fff', 0.18));
  p.rect(168, 106, 12, 8, 2, '#1c1622');
  p.rect(156, 114, 36, 4, 2, '#1c1622');
  // Lamp on desk
  p.rect(46, 80, 4, 32, 2, '#3b2f50');
  p.rect(38, 110, 20, 4, 1, '#3b2f50');
  p.ellipse(46, 76, 16, 8, '#fcd34d');
  warmGlow(p, 46, 84, 30, '#ffe6a3');
  // Coffee mug
  p.rect(76, 96, 18, 18, 3, '#fb923c');
  p.rect(94, 100, 6, 10, 2, '#fb923c');
  // Notebook
  p.rect(106, 100, 24, 14, 1, '#fde68a');
};

const paintCouch = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || shade(base, 20);
  ground(p, 128, 200);
  // Skirt + base
  p.rect(20, 152, 216, 60, 14, p.linearGrad(0, 152, 0, 212, [[0, shade(base, -16)], [1, shade(base, -36)]]) as unknown as string);
  // Back cushion
  p.rect(20, 84, 216, 78, 18, p.linearGrad(0, 84, 0, 162, [[0, shade(base, 18)], [1, shade(base, -10)]]) as unknown as string);
  // Arms
  p.rect(16, 110, 36, 78, 14, p.linearGrad(0, 110, 0, 188, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  p.rect(204, 110, 36, 78, 14, p.linearGrad(0, 110, 0, 188, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  // Seat cushions
  p.rect(58, 134, 72, 40, 10, p.linearGrad(0, 134, 0, 174, [[0, shade(base, 12)], [1, shade(base, -18)]]) as unknown as string);
  p.rect(132, 134, 72, 40, 10, p.linearGrad(0, 134, 0, 174, [[0, shade(base, 12)], [1, shade(base, -18)]]) as unknown as string);
  // Throw pillows
  p.rect(34, 110, 36, 28, 8, accent);
  p.rect(72, 96, 32, 30, 8, '#fef3c7');
  p.rect(160, 102, 32, 30, 8, '#dbeafe');
  // Feet
  p.rect(28, 200, 12, 14, 3, WOOD_DARK);
  p.rect(216, 200, 12, 14, 3, WOOD_DARK);
};

const paintLoveseat = (p: Painter, item: RoomCatalogItem) => {
  paintCouch(p, item);
  // Add a little heart pillow
  p.rect(106, 102, 44, 30, 12, '#fb7185');
  p.triangle([122, 116], [128, 110], [134, 116], '#fff');
  p.triangle([122, 116], [128, 132], [134, 116], '#fff');
};

const paintTable = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 140);
  // Table top (round)
  p.ellipse(128, 132, 80, 20, p.linearGrad(48, 122, 48, 152, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  p.ellipse(128, 128, 80, 14, alpha('#ffffff', 0.16));
  // Skirt edge
  p.rect(48, 132, 160, 10, 4, shade(base, -28));
  // Pedestal
  p.rect(118, 144, 20, 60, 6, shade(base, -16));
  // Round base
  p.ellipse(128, 208, 36, 8, shade(base, -22));
  // Vase + flowers on top
  p.rect(118, 96, 20, 32, 5, '#9c7245');
  p.circle(122, 92, 6, '#fde047');
  p.circle(132, 90, 6, '#fb7185');
  p.circle(126, 86, 6, '#a5b4fc');
  p.line(122, 96, 124, 110, '#15803d', 1);
};

const paintKotatsu = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 180);
  // Heated blanket draped underneath
  p.rect(34, 152, 188, 58, 12, p.linearGrad(34, 152, 34, 210, [[0, item.accent || '#fde68a'], [1, shade(item.accent || '#f59e0b', -22)]]) as unknown as string);
  // Top board
  p.rect(28, 124, 200, 32, 6, p.linearGrad(0, 124, 0, 156, [[0, shade(base, 22)], [1, shade(base, -8)]]) as unknown as string);
  p.woodGrain(28, 130, 200, 22, shade(base, 6));
  // Glowing edges
  warmGlow(p, 128, 184, 80, '#fb923c');
  // Tea cup
  p.circle(128, 124, 8, '#f5e6d3');
  p.ellipse(128, 122, 6, 2, '#a87545');
};

const paintConsoleTable = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 200);
  // Top
  p.rect(20, 120, 216, 16, 4, p.linearGrad(0, 120, 0, 136, [[0, shade(base, 26)], [1, base]]) as unknown as string);
  p.woodGrain(20, 124, 216, 8, shade(base, 8));
  // Front rail
  p.rect(20, 136, 216, 8, 2, shade(base, -16));
  // Legs (4)
  p.rect(28, 144, 8, 76, 2, WOOD_DARK);
  p.rect(220, 144, 8, 76, 2, WOOD_DARK);
  // Decor: lamp + framed photo + bowl
  p.rect(56, 88, 6, 32, 2, '#3b2f50');
  p.ellipse(58, 84, 14, 6, '#fcd34d');
  warmGlow(p, 58, 92, 26, '#ffe6a3');
  p.rect(98, 64, 56, 56, 3, '#6e4d3a');
  p.rect(102, 68, 48, 48, 1, '#fff7e8');
  p.triangle([108, 110], [128, 76], [148, 110], alpha('#9ca3af', 0.6));
  p.ellipse(190, 110, 22, 6, '#bfdbfe');
  p.ellipse(190, 108, 18, 6, '#dbeafe');
};

const paintDresser = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 200);
  p.woodGrain(28, 70, 200, 150, base);
  p.rectS(28, 70, 200, 150, 4, 'rgba(0,0,0,0)', shade(base, -32), 1);
  // Two columns x 3 drawers
  for (let r = 0; r < 3; r++) {
    p.rect(34, 78 + r * 46, 92, 40, 3, shade(base, -10));
    p.rect(130, 78 + r * 46, 92, 40, 3, shade(base, -10));
    p.circle(80, 98 + r * 46, 2.4, INK);
    p.circle(176, 98 + r * 46, 2.4, INK);
  }
  // Feet
  p.rect(34, 218, 14, 14, 3, WOOD_DARK);
  p.rect(208, 218, 14, 14, 3, WOOD_DARK);
};

const paintVanity = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 200);
  // Mirror on top
  p.rect(56, 12, 144, 110, 60, p.linearGrad(56, 12, 56, 122, [[0, '#e8f1ff'], [1, '#bcd6f7']]) as unknown as string);
  p.rect(56, 12, 144, 110, 60, alpha(shade(base, -22), 0));
  // Mirror sparkle
  p.line(76, 32, 90, 18, alpha('#fff', 0.7), 1.5);
  p.circle(120, 50, 4, alpha('#fff', 0.6));
  // Mirror frame ring
  p.rect(56, 12, 144, 110, 60, 'rgba(0,0,0,0)');
  // Counter top
  p.rect(20, 122, 216, 18, 4, p.linearGrad(0, 122, 0, 140, [[0, shade(base, 26)], [1, base]]) as unknown as string);
  // Drawer block
  p.rect(40, 140, 60, 70, 4, shade(base, -10));
  p.rect(156, 140, 60, 70, 4, shade(base, -10));
  p.rect(48, 154, 44, 6, 1, alpha('#000', 0.18));
  p.rect(48, 176, 44, 6, 1, alpha('#000', 0.18));
  p.rect(48, 196, 44, 6, 1, alpha('#000', 0.18));
  // Centre cosmetics
  p.rect(108, 142, 40, 14, 3, '#fb7185');
  p.circle(118, 152, 4, '#fff');
  p.circle(138, 152, 4, '#fff');
  // Legs
  p.rect(30, 210, 8, 16, 2, WOOD_DARK);
  p.rect(218, 210, 8, 16, 2, WOOD_DARK);
};

const paintTV = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 210);
  // Media console
  p.rect(20, 156, 216, 56, 6, p.linearGrad(0, 156, 0, 212, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  p.rect(24, 162, 96, 44, 3, shade(base, -10));
  p.rect(132, 162, 96, 44, 3, shade(base, -10));
  p.circle(72, 184, 1.8, INK);
  p.circle(180, 184, 1.8, INK);
  // TV bezel
  p.rect(28, 36, 200, 116, 8, '#1c1622');
  // Screen
  p.rect(36, 44, 184, 100, 4, p.linearGrad(0, 44, 0, 144, [[0, '#0c4a6e'], [0.4, '#7dd3fc'], [1, '#0c4a6e']]) as unknown as string);
  // Sun + ocean (movie)
  p.circle(178, 80, 20, alpha('#fde68a', 0.95));
  p.rect(36, 110, 184, 34, 0, alpha('#0c4a6e', 0.45));
  for (let i = 0; i < 5; i++) p.rect(40, 116 + i * 5, 176, 2, 1, alpha('#fff', 0.18));
  // Stand foot
  p.rect(116, 152, 24, 6, 2, '#1c1622');
  // Soundbar
  p.rect(60, 150, 136, 8, 2, '#1c1622');
  // Reflection sheen
  p.triangle([36, 44], [88, 44], [36, 90], alpha('#fff', 0.18));
};

const paintLamp = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 90);
  // Base disk
  p.ellipse(128, 218, 32, 8, '#3b2f50');
  p.ellipse(128, 214, 28, 6, '#5b4a78');
  // Stem
  p.rect(124, 130, 8, 88, 2, '#5b4a78');
  // Shade — trapezoid
  p.triangle([84, 128], [172, 128], [188, 64], '#f7e8b8');
  p.triangle([84, 128], [188, 64], [68, 64], '#f7e8b8');
  p.rect(68, 60, 120, 8, 3, alpha('#000', 0.18));
  // Inner warm glow
  warmGlow(p, 128, 88, 78, base);
  // Cord
  p.line(132, 130, 132, 220, alpha('#000', 0.4), 0.5);
};

const paintLantern = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 110);
  // Hanging strap
  p.line(128, 12, 128, 36, '#5b4a78', 1.5);
  p.ellipse(128, 36, 12, 4, '#5b4a78');
  // Body — paper lantern
  p.ellipse(128, 130, 70, 90, p.radialGrad(128, 130, 12, 78, [[0, alpha('#fff7d0', 0.95)], [1, alpha(base, 0.9)]]) as unknown as string);
  // Ribs
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const y = 70 + t * 120;
    p.ellipse(128, y, 70 * Math.sin(Math.PI * t * 1.0 + 0.05) + 8, 2, alpha(shade(base, -28), 0.4));
  }
  // Bottom & top caps
  p.rect(116, 218, 24, 6, 2, '#5b4a78');
  p.rect(116, 40, 24, 6, 2, '#5b4a78');
  // Glow
  warmGlow(p, 128, 130, 96, base);
};

const paintCandles = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 100);
  // Tray
  p.ellipse(128, 200, 80, 12, '#3b2f50');
  p.ellipse(128, 196, 76, 10, '#5b4a78');
  // Three candles of varying height
  const cs: Array<[number, number, string]> = [
    [88, 130, '#fef7e6'],
    [128, 100, '#fff'],
    [168, 144, '#fcefd2'],
  ];
  for (const [x, h, col] of cs) {
    p.rect(x - 12, 200 - h, 24, h, 4, col);
    p.rect(x - 12, 200 - h, 24, 4, 4, alpha('#fff', 0.8));
    // Wick
    p.rect(x - 1, 200 - h - 8, 2, 8, 0, '#1c1622');
    // Flame
    p.ellipse(x, 200 - h - 14, 5, 9, '#fb923c');
    p.ellipse(x, 200 - h - 16, 3, 5, '#fef08a');
    warmGlow(p, x, 200 - h - 14, 28, '#ffd591');
  }
};

const paintDisco = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 60);
  // Chain
  p.line(128, 4, 128, 36, '#9ca3af', 1.2);
  // Ball
  const ball = p.radialGrad(120, 100, 4, 70, [[0, '#fff'], [0.4, '#cfe2ff'], [1, '#8da5d6']]);
  p.circle(128, 110, 64, ball as unknown as string);
  // Facets — small squares
  for (let i = 0; i < 60; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 58;
    const x = 128 + Math.cos(ang) * r;
    const y = 110 + Math.sin(ang) * r * 0.92;
    const c = ['#fef9c3', '#fce7f3', '#bae6fd', '#bbf7d0'][i % 4];
    p.rect(x - 1.4, y - 1.4, 2.8, 2.8, 0.4, c);
  }
  // Sparkles
  p.sparkles(60, 40, 130, 130, 12, '#fff');
};

const paintLights = (p: Painter, item: RoomCatalogItem) => {
  // Wall-mounted string lights (sprite is wider than tall typically)
  // Hanging cord with bulbs
  // Cord
  for (let i = 0; i < 220; i++) {
    const t = i / 220;
    const x = 18 + t * 220;
    const y = 60 + Math.sin(t * Math.PI * 2.2) * 20 + 10;
    p.circle(x, y, 0.6, '#3b2f50');
  }
  // Bulbs
  const bulbColors = ['#fde047', '#fb7185', '#a78bfa', '#34d399', '#60a5fa', '#fbbf24'];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const x = 18 + t * 220;
    const y = 60 + Math.sin(t * Math.PI * 2.2) * 20 + 10;
    const c = bulbColors[i % bulbColors.length];
    p.ellipse(x, y + 8, 5, 7, c);
    warmGlow(p, x, y + 8, 22, c);
  }
};

const paintBalloon = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 60);
  // Three balloons
  const balls: Array<[number, number, number, string]> = [
    [80, 80, 36, base],
    [128, 60, 40, item.accent || shade(base, 22)],
    [176, 90, 34, shade(base, -16)],
  ];
  for (const [x, y, r, col] of balls) {
    // Heart shape — two lobes + triangle
    p.circle(x - r * 0.32, y, r * 0.5, col);
    p.circle(x + r * 0.32, y, r * 0.5, col);
    p.triangle([x - r * 0.62, y + 6], [x + r * 0.62, y + 6], [x, y + r * 0.95], col);
    p.circle(x - r * 0.4, y - r * 0.1, r * 0.18, alpha('#fff', 0.5));
    p.line(x, y + r * 0.9, x + (Math.random() - 0.5) * 16, 220, '#3b2f50', 0.6);
  }
};

const paintFrame = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  // Outer frame
  p.rect(38, 26, 180, 198, 8, p.linearGrad(38, 26, 218, 226, [[0, shade('#6e4d3a', 14)], [1, '#5b3a26']]) as unknown as string);
  // Inner mat
  p.rect(50, 38, 156, 174, 4, '#f5efe3');
  // Photo
  p.rect(58, 46, 140, 158, 2, p.linearGrad(58, 46, 58, 204, [[0, shade(base, 22)], [1, shade(base, -14)]]) as unknown as string);
  // Photo silhouettes (two people)
  p.ellipse(108, 110, 22, 22, '#fbcfe8');
  p.ellipse(148, 116, 24, 24, '#fde68a');
  p.triangle([86, 196], [130, 130], [170, 196], alpha('#000', 0.18));
  p.triangle([114, 196], [156, 150], [196, 196], alpha('#000', 0.16));
  // Reflection on glass
  p.triangle([50, 38], [120, 38], [50, 100], alpha('#fff', 0.16));
};

const paintGallery = (p: Painter, item: RoomCatalogItem) => {
  // Multiple frames arranged on wall
  const frames: Array<[number, number, number, number, string]> = [
    [16, 20, 76, 90, '#fbcfe8'],
    [100, 14, 70, 70, '#bae6fd'],
    [180, 26, 60, 82, '#fde68a'],
    [24, 130, 96, 86, '#ddd6fe'],
    [140, 124, 86, 100, '#fda4af'],
  ];
  for (const [x, y, w, h, c] of frames) {
    p.rect(x - 4, y - 4, w + 8, h + 8, 4, '#1c1622');
    p.rect(x, y, w, h, 2, c);
    p.rect(x + 4, y + 4, w - 8, h - 8, 1, alpha('#fff', 0.55));
  }
};

const paintMirror = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  // Arch top, taller than wide
  const grad = p.linearGrad(0, 18, 0, 238, [[0, '#dbeafe'], [0.4, '#e0e7ff'], [1, '#cfe2ff']]);
  p.rect(54, 18, 148, 220, 74, grad as unknown as string);
  // Frame
  p.rect(50, 14, 156, 228, 78, 'rgba(0,0,0,0)');
  for (let r = 0; r < 6; r++) p.rect(50 - r, 14 - r, 156 + r * 2, 228 + r * 2, 78 + r, alpha(shade(base, -2 * r), r === 0 ? 1 : 0));
  p.rectS(50, 14, 156, 228, 78, 'rgba(0,0,0,0)', shade(base, -32), 1.4);
  p.rectS(54, 18, 148, 220, 74, 'rgba(0,0,0,0)', alpha(shade(base, 32), 0.8), 0.8);
  // Reflection highlight
  p.line(82, 60, 102, 30, alpha('#fff', 0.7), 1.8);
  p.circle(118, 86, 6, alpha('#fff', 0.4));
};

const paintNeon = (p: Painter, item: RoomCatalogItem) => {
  // Backboard
  p.rect(18, 22, 220, 168, 14, '#1a1227');
  // Glowing US
  warmGlow(p, 90, 105, 70, item.color);
  warmGlow(p, 168, 105, 70, item.accent || item.color);
  // Letter U
  p.line(70, 70, 70, 130, item.color, 4);
  p.line(110, 70, 110, 130, item.color, 4);
  p.line(70, 130, 110, 130, item.color, 4);
  p.circle(70, 70, 2, '#fff');
  p.circle(110, 70, 2, '#fff');
  // Letter S
  p.line(140, 75, 190, 75, item.accent || item.color, 4);
  p.line(140, 75, 140, 102, item.accent || item.color, 4);
  p.line(140, 102, 190, 102, item.accent || item.color, 4);
  p.line(190, 102, 190, 130, item.accent || item.color, 4);
  p.line(140, 130, 190, 130, item.accent || item.color, 4);
  // Tiny stars
  p.sparkles(40, 30, 180, 150, 8, '#fff');
};

const paintProjector = (p: Painter, item: RoomCatalogItem) => {
  // Wall mount projector body
  p.rect(82, 92, 92, 64, 12, p.linearGrad(82, 92, 82, 156, [[0, shade(item.color, 22)], [1, shade(item.color, -22)]]) as unknown as string);
  // Lens
  p.circle(170, 124, 14, '#0c0a18');
  p.circle(170, 124, 10, '#a5b4fc');
  p.circle(170, 124, 4, '#fff');
  // Projected light cone
  p.triangle([170, 124], [254, 60], [254, 180], alpha('#fff7c4', 0.32));
  // Stars in cone
  p.sparkles(190, 70, 60, 100, 18, '#fffde7');
  // Top vent grilles
  for (let i = 0; i < 5; i++) p.rect(98 + i * 12, 100, 8, 3, 1, alpha('#000', 0.3));
};

const paintCactus = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 130);
  // Pot
  p.rect(96, 168, 64, 50, 6, '#a16207');
  p.rect(96, 168, 64, 8, 3, '#7c2d12');
  // Body
  p.rect(116, 78, 24, 96, 12, p.linearGrad(116, 78, 116, 174, [[0, shade(base, 22)], [1, shade(base, -14)]]) as unknown as string);
  // Arms
  p.rect(94, 102, 22, 14, 6, shade(base, 8));
  p.rect(94, 102, 14, 56, 6, shade(base, 8));
  p.rect(140, 124, 22, 14, 6, shade(base, 8));
  p.rect(148, 124, 14, 50, 6, shade(base, 8));
  // Ribbing
  for (let i = 0; i < 4; i++) p.line(120 + i * 4, 84, 120 + i * 4, 170, alpha('#000', 0.16), 0.6);
  // Flower bud
  p.circle(128, 78, 6, '#fb7185');
  p.circle(128, 76, 3, '#fff');
};

const paintPlant = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 130);
  // Pot
  p.rect(94, 174, 68, 44, 6, '#a87545');
  p.rect(94, 174, 68, 6, 3, shade('#a87545', -18));
  // Leaves (layered ellipses)
  const leafCol = base;
  p.ellipse(128, 134, 60, 40, shade(leafCol, -20));
  p.ellipse(110, 122, 30, 24, leafCol);
  p.ellipse(146, 118, 32, 26, shade(leafCol, 6));
  p.ellipse(128, 102, 28, 24, shade(leafCol, 14));
  p.ellipse(96, 108, 18, 16, shade(leafCol, -10));
  p.ellipse(160, 110, 22, 18, shade(leafCol, -4));
  // Subtle leaf highlights
  p.line(116, 122, 124, 100, alpha('#fff', 0.4), 1.2);
  p.line(146, 118, 150, 96, alpha('#fff', 0.4), 1.2);
};

const paintBonsai = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 120);
  // Shallow pot
  p.rect(80, 188, 96, 28, 4, '#7c2d12');
  p.rect(80, 188, 96, 4, 1, alpha('#000', 0.18));
  p.ellipse(128, 188, 48, 4, '#a16207');
  // Trunk
  p.rect(120, 130, 8, 60, 2, '#7c2d12');
  p.line(124, 188, 100, 200, '#7c2d12', 2);
  p.line(124, 188, 152, 198, '#7c2d12', 2);
  // Foliage clouds
  p.ellipse(100, 116, 24, 18, item.color);
  p.ellipse(140, 100, 30, 22, shade(item.color, 6));
  p.ellipse(122, 92, 22, 18, shade(item.color, 12));
  p.ellipse(160, 120, 22, 16, shade(item.color, -8));
  // Pink blossoms
  for (let i = 0; i < 6; i++) {
    const x = 110 + Math.random() * 50;
    const y = 88 + Math.random() * 28;
    p.circle(x, y, 1.6, '#fb7185');
  }
};

const paintFlower = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 100);
  // Vase
  p.rect(108, 156, 40, 60, 6, p.linearGrad(108, 156, 108, 216, [[0, '#e5e7eb'], [1, '#9ca3af']]) as unknown as string);
  p.ellipse(128, 156, 22, 4, '#cbd5e1');
  p.line(116, 168, 116, 210, alpha('#fff', 0.5), 1);
  // Stems
  p.line(118, 156, 110, 100, '#15803d', 1.4);
  p.line(124, 156, 122, 86, '#15803d', 1.4);
  p.line(132, 156, 138, 102, '#15803d', 1.4);
  p.line(140, 156, 146, 92, '#15803d', 1.4);
  // Flower heads
  const cols = [item.color, item.accent || '#fbcfe8', '#fde68a', '#a78bfa'];
  const heads: Array<[number, number, string]> = [
    [110, 100, cols[0]],
    [122, 86, cols[1]],
    [138, 102, cols[2]],
    [146, 92, cols[3]],
  ];
  for (const [x, y, c] of heads) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 4, c);
    }
    p.circle(x, y, 4, '#fde047');
  }
};

const paintSunflower = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 100);
  // Pot
  p.rect(108, 188, 40, 30, 4, '#7c2d12');
  // Stem
  p.line(128, 188, 128, 110, '#15803d', 2.5);
  // Leaves
  p.ellipse(118, 150, 14, 7, '#15803d', -0.4);
  p.ellipse(140, 130, 16, 8, '#15803d', 0.4);
  // Petals
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.ellipse(128 + Math.cos(a) * 22, 100 + Math.sin(a) * 22, 8, 14, '#fcd34d', a + Math.PI / 2);
  }
  // Centre
  p.circle(128, 100, 16, '#8b5a2b');
  for (let i = 0; i < 14; i++) p.circle(128 + (Math.random() - 0.5) * 22, 100 + (Math.random() - 0.5) * 22, 1.4, '#7c2d12');
};

const paintTerrarium = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 100);
  // Stand
  p.rect(98, 200, 60, 18, 2, '#8b5a2b');
  // Glass dome
  p.ellipse(128, 156, 60, 70, alpha('#bae6fd', 0.3));
  p.ellipse(128, 156, 60, 70, 'rgba(0,0,0,0)');
  // Soil
  p.ellipse(128, 196, 56, 8, '#5d4037');
  // Moss
  p.ellipse(110, 184, 18, 8, '#86efac');
  p.ellipse(148, 188, 16, 6, '#22c55e');
  // Stones
  p.circle(122, 192, 4, '#9ca3af');
  p.circle(140, 190, 3, '#cbd5e1');
  // Glass highlight
  p.line(98, 130, 110, 110, alpha('#fff', 0.6), 1.5);
  p.line(150, 168, 156, 142, alpha('#fff', 0.4), 1);
};

const paintFiddleLeaf = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 130);
  // Pot
  p.rect(102, 176, 52, 42, 4, '#a87545');
  // Branches
  p.line(126, 176, 124, 70, '#7c2d12', 2);
  p.line(124, 110, 90, 80, '#7c2d12', 1.5);
  p.line(126, 120, 158, 90, '#7c2d12', 1.5);
  // Big leaves
  p.ellipse(88, 78, 16, 22, item.color, -0.5);
  p.ellipse(160, 90, 16, 22, shade(item.color, 8), 0.4);
  p.ellipse(122, 50, 18, 26, shade(item.color, 14), 0);
  p.ellipse(102, 130, 14, 20, item.color, -0.7);
  p.ellipse(148, 138, 14, 20, shade(item.color, 8), 0.5);
  p.ellipse(132, 158, 16, 22, item.color, 0.2);
  // Veins
  p.line(122, 38, 122, 60, alpha('#000', 0.18), 0.7);
};

const paintRug = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || '#fde68a';
  // Rug body — large rounded rect
  p.rect(20, 60, 216, 168, 12, p.linearGrad(0, 60, 0, 228, [[0, shade(base, 8)], [1, shade(base, -14)]]) as unknown as string);
  // Border
  p.rectS(28, 68, 200, 152, 10, 'rgba(0,0,0,0)', accent, 1.6);
  // Inner border
  p.rectS(36, 76, 184, 136, 8, 'rgba(0,0,0,0)', alpha(accent, 0.5), 0.6);
  // Centre medallion
  p.ellipse(128, 144, 50, 28, accent);
  p.ellipse(128, 144, 40, 22, base);
  p.ellipse(128, 144, 26, 14, accent);
  // Corner motifs
  const motif = (cx: number, cy: number) => {
    p.circle(cx, cy, 6, accent);
    p.circle(cx, cy, 3, base);
  };
  motif(56, 96);
  motif(200, 96);
  motif(56, 192);
  motif(200, 192);
  // Fringe top & bottom
  for (let i = 0; i < 22; i++) {
    const x = 24 + i * 10;
    p.rect(x, 56, 2, 6, 0, accent);
    p.rect(x, 228, 2, 6, 0, accent);
  }
};

const paintFireplace = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 220);
  // Mantel
  p.rect(14, 60, 228, 20, 4, p.linearGrad(0, 60, 0, 80, [[0, shade(WOOD_LIGHT, 22)], [1, WOOD]]) as unknown as string);
  // Surround
  p.rect(34, 80, 188, 132, 8, p.linearGrad(0, 80, 0, 212, [[0, '#cbb59f'], [1, shade('#a16242', -10)]]) as unknown as string);
  // Brick pattern
  for (let r = 0; r < 6; r++) {
    const offset = r % 2 ? 14 : 0;
    for (let c = 0; c < 9; c++) {
      const x = 38 + offset + c * 22;
      p.rect(x, 84 + r * 22, 18, 18, 2, shade('#9a6840', -4 + (r * c) % 6));
      p.rect(x, 84 + r * 22, 18, 2, 1, alpha('#fff', 0.18));
    }
  }
  // Fire opening
  p.rect(74, 110, 108, 92, 10, '#1a1227');
  // Logs
  p.ellipse(128, 192, 50, 8, '#5b3a26');
  p.rect(86, 184, 84, 8, 4, '#7c4a2a');
  p.rect(98, 174, 60, 8, 4, '#8a5a35');
  // Flames
  for (let i = 0; i < 5; i++) {
    const x = 90 + i * 17;
    p.ellipse(x, 162, 6, 12, '#fb923c');
    p.ellipse(x, 156, 4, 8, '#fef08a');
  }
  warmGlow(p, 128, 170, 90, '#fb923c');
  warmGlow(p, 128, 160, 50, '#fef08a');
};

const paintWindow = (p: Painter, item: RoomCatalogItem) => {
  const accent = item.accent || '#fef08a';
  // Frame
  p.rect(20, 18, 216, 220, 8, '#5b3a26');
  p.rect(28, 26, 200, 204, 4, p.linearGrad(0, 26, 0, 230, [[0, '#0c0f2c'], [0.6, '#1e1b4b'], [1, '#0c0f2c']]) as unknown as string);
  // Stars / sky
  p.sparkles(36, 36, 184, 188, 60, accent);
  // Big star (moon)
  p.circle(180, 70, 14, '#fef9c3');
  p.circle(186, 66, 8, alpha('#1e1b4b', 0.8));
  // Crossbars
  p.rect(20, 124, 216, 8, 2, '#5b3a26');
  p.rect(124, 18, 8, 220, 2, '#5b3a26');
  // Sill
  p.rect(8, 234, 240, 14, 4, '#a87545');
  // Soft inner glow
  warmGlow(p, 128, 128, 110, '#fef9c3');
};

const paintRainyWindow = (p: Painter, item: RoomCatalogItem) => {
  const accent = item.accent || '#bcd6f7';
  p.rect(20, 18, 216, 220, 8, '#5b3a26');
  p.rect(28, 26, 200, 204, 4, p.linearGrad(0, 26, 0, 230, [[0, '#475569'], [1, '#1e293b']]) as unknown as string);
  // Raindrops on glass
  for (let i = 0; i < 90; i++) {
    const x = 34 + Math.random() * 188;
    const y = 30 + Math.random() * 196;
    p.line(x, y, x - 1, y + 4, alpha('#fff', 0.4), 0.6);
  }
  // Glow from outside lamp post
  warmGlow(p, 80, 90, 60, '#fbbf24');
  // Crossbars
  p.rect(20, 124, 216, 8, 2, '#5b3a26');
  p.rect(124, 18, 8, 220, 2, '#5b3a26');
  // Sill with rain pool
  p.rect(8, 234, 240, 14, 4, '#a87545');
  p.rect(28, 232, 200, 4, 2, alpha(accent, 0.6));
};

const paintPortal = (p: Painter, item: RoomCatalogItem) => {
  // Wall portal — arched
  p.rect(48, 24, 160, 220, 80, '#1a1227');
  // Inner swirl
  const g = p.radialGrad(128, 130, 4, 90, [[0, '#fef9c3'], [0.3, item.color], [0.8, '#312e81'], [1, '#0c0a18']]);
  p.ellipse(128, 130, 70, 100, g as unknown as string);
  // Spiral arcs
  for (let i = 0; i < 8; i++) {
    p.ellipse(128, 130, 30 + i * 8, 18 + i * 6, alpha('#fff', 0.06), i * 0.2);
  }
  p.sparkles(60, 40, 136, 180, 20, '#fff');
  // Frame stones
  p.circle(60, 130, 6, '#a78bfa');
  p.circle(196, 130, 6, '#a78bfa');
  p.circle(128, 24, 7, '#fde047');
};

const paintAquarium = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 200);
  // Cabinet stand
  p.rect(20, 168, 216, 60, 6, p.linearGrad(0, 168, 0, 228, [[0, shade(WOOD_LIGHT, 14)], [1, shade(WOOD, -14)]]) as unknown as string);
  p.woodGrain(20, 174, 216, 50, WOOD_LIGHT);
  // Glass tank
  p.rect(28, 64, 200, 100, 6, alpha('#bae6fd', 0.2));
  p.rect(28, 64, 200, 100, 6, 'rgba(0,0,0,0)');
  // Water gradient
  p.rect(34, 70, 188, 88, 4, p.linearGrad(0, 70, 0, 158, [[0, '#7dd3fc'], [1, '#0c4a6e']]) as unknown as string);
  // Sand bed
  p.rect(34, 142, 188, 16, 4, '#fef3c7');
  // Plants
  p.ellipse(60, 138, 5, 22, '#15803d');
  p.ellipse(110, 130, 7, 28, '#16a34a');
  p.ellipse(196, 134, 6, 24, '#22c55e');
  // Fish silhouettes
  const fishCol = ['#fb923c', '#a78bfa', '#fbbf24', '#f472b6'];
  for (let i = 0; i < 4; i++) {
    const x = 60 + i * 38;
    const y = 100 + Math.sin(i * 1.4) * 10;
    p.ellipse(x, y, 10, 5, fishCol[i]);
    p.triangle([x - 10, y], [x - 16, y - 4], [x - 16, y + 4], fishCol[i]);
    p.circle(x + 5, y - 1, 1, '#fff');
  }
  // Bubbles
  for (let i = 0; i < 6; i++) {
    p.circle(60 + i * 26, 80 + Math.random() * 30, 1.6, alpha('#fff', 0.6));
  }
  // Glass shine
  p.line(40, 76, 60, 96, alpha('#fff', 0.4), 1.5);
};

const paintRecord = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 130);
  // Casing — warm wood
  p.rect(36, 132, 184, 84, 6, p.linearGrad(0, 132, 0, 216, [[0, shade(item.accent || WOOD_LIGHT, 10)], [1, shade(WOOD, -8)]]) as unknown as string);
  p.woodGrain(36, 138, 184, 72, item.accent || WOOD_LIGHT);
  // Turntable plate
  p.ellipse(110, 168, 56, 16, '#1c1622');
  p.ellipse(110, 168, 50, 12, '#0c0a18');
  for (let r = 8; r < 50; r += 6) p.ellipse(110, 168, r, r * 0.32, alpha('#fff', 0.06));
  p.circle(110, 168, 6, '#fb923c');
  // Tonearm
  p.line(180, 138, 132, 168, '#9ca3af', 1.4);
  p.circle(180, 138, 4, '#cbd5e1');
  p.rect(178, 134, 8, 8, 2, '#cbd5e1');
  // Speakers grille
  p.rect(170, 178, 40, 28, 3, '#1c1622');
  p.circle(190, 192, 8, '#0c0a18');
};

const paintGramophone = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 130);
  // Box
  p.rect(72, 156, 112, 60, 5, p.linearGrad(0, 156, 0, 216, [[0, shade(item.color, 22)], [1, shade(item.color, -22)]]) as unknown as string);
  p.woodGrain(72, 162, 112, 50, item.color);
  // Turntable
  p.ellipse(128, 158, 32, 6, '#1c1622');
  p.ellipse(128, 156, 28, 5, '#0c0a18');
  // Horn (stylised funnel)
  p.triangle([128, 154], [70, 60], [102, 90], item.accent || '#fbbf24');
  p.ellipse(74, 60, 36, 22, item.accent || '#fbbf24');
  p.ellipse(74, 60, 28, 16, shade(item.accent || '#fbbf24', -16));
  // Stem
  p.rect(124, 110, 8, 50, 2, '#8b5a2b');
};

const paintFridge = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || '#60a5fa';
  ground(p, 128, 200);
  // Body
  p.rect(46, 24, 164, 200, 8, p.linearGrad(46, 24, 46, 224, [[0, '#f8fafc'], [1, '#cbd5e1']]) as unknown as string);
  p.metallic(46, 24, 164, 200, base);
  // Top door
  p.rect(54, 32, 148, 84, 5, p.linearGrad(54, 32, 54, 116, [[0, shade(base, 22)], [1, shade(base, -8)]]) as unknown as string);
  // Bottom door
  p.rect(54, 120, 148, 96, 5, p.linearGrad(54, 120, 54, 216, [[0, shade(base, 12)], [1, shade(base, -12)]]) as unknown as string);
  // Handles
  p.rect(190, 50, 4, 50, 2, '#3b2f50');
  p.rect(190, 138, 4, 60, 2, '#3b2f50');
  // LED display
  p.rect(64, 40, 36, 14, 2, '#0c0a18');
  p.rect(68, 44, 28, 8, 1, '#34d399');
  // Magnet
  p.rect(150, 140, 24, 18, 3, accent);
  p.circle(162, 149, 4, '#fff');
};

const paintBooks = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 100);
  // Stack of 4 books
  const books: Array<[number, number, number, string]> = [
    [60, 188, 140, '#fca5a5'],
    [80, 170, 110, '#fde68a'],
    [70, 152, 130, '#bae6fd'],
    [90, 134, 100, '#c4b5fd'],
  ];
  for (const [x, y, w, c] of books) {
    p.rect(x, y, w, 18, 2, p.linearGrad(x, y, x, y + 18, [[0, shade(c, 22)], [1, shade(c, -16)]]) as unknown as string);
    p.rect(x + 2, y + 3, w - 4, 2, 1, alpha('#fff', 0.4));
    p.rect(x + 6, y + 8, w - 12, 1, 0, alpha('#000', 0.18));
  }
  // Bookmark ribbon
  p.rect(170, 132, 6, 38, 0, '#fb7185');
  p.triangle([170, 170], [173, 176], [176, 170], '#fb7185');
};

const paintMug = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 90);
  // Coaster
  p.ellipse(128, 218, 50, 8, '#7c2d12');
  p.ellipse(128, 216, 46, 6, '#a87545');
  // Mug body
  p.rect(96, 140, 72, 74, 8, p.linearGrad(96, 140, 96, 214, [[0, shade(base, 22)], [1, shade(base, -18)]]) as unknown as string);
  // Glaze drip top
  p.rect(96, 140, 72, 8, 4, alpha('#fff', 0.35));
  // Handle
  p.ellipse(180, 178, 14, 22, 'rgba(0,0,0,0)');
  p.ellipse(180, 178, 14, 22, base);
  p.ellipse(180, 178, 8, 14, '#fff');
  // Heart decal
  p.circle(122, 168, 5, '#fb7185');
  p.circle(132, 168, 5, '#fb7185');
  p.triangle([116, 172], [138, 172], [127, 186], '#fb7185');
  // Steam
  p.ellipse(116, 124, 4, 12, alpha('#fff', 0.4));
  p.ellipse(132, 110, 4, 14, alpha('#fff', 0.4));
};

const paintTeaSet = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 90);
  // Tray
  p.ellipse(128, 218, 80, 10, '#9c7245');
  p.ellipse(128, 214, 76, 8, '#bf906c');
  // Teapot
  p.ellipse(100, 184, 32, 24, p.linearGrad(70, 160, 70, 200, [[0, '#fff'], [1, '#e2e8f0']]) as unknown as string);
  p.rect(96, 154, 8, 12, 2, '#cbd5e1');
  p.circle(100, 152, 6, '#fb7185');
  // Spout
  p.triangle([130, 178], [148, 168], [142, 186], '#fff');
  // Handle
  p.ellipse(70, 184, 8, 14, 'rgba(0,0,0,0)');
  p.ellipse(70, 184, 8, 14, '#fff');
  p.ellipse(70, 184, 4, 9, '#e2e8f0');
  // Two cups
  p.rect(158, 192, 22, 18, 4, '#fff');
  p.rect(178, 198, 6, 8, 2, '#fff');
  p.rect(186, 192, 22, 18, 4, '#fff');
  p.rect(206, 198, 6, 8, 2, '#fff');
  // Tea inside
  p.ellipse(169, 196, 9, 2, '#92400e');
  p.ellipse(197, 196, 9, 2, '#92400e');
  // Floral decals
  for (let i = 0; i < 3; i++) {
    p.circle(90 + i * 10, 188, 1.2, '#fb7185');
  }
};

const paintCoffeeMachine = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 110);
  // Body
  p.rect(76, 80, 104, 138, 8, p.linearGrad(76, 80, 76, 218, [[0, '#1c1622'], [1, '#0c0a18']]) as unknown as string);
  // Top reservoir
  p.rect(86, 86, 84, 26, 4, p.linearGrad(0, 86, 0, 112, [[0, '#cbd5e1'], [1, '#94a3b8']]) as unknown as string);
  // Brew spout
  p.rect(116, 138, 24, 10, 2, '#cbd5e1');
  // Cup
  p.rect(108, 168, 40, 30, 6, '#fff');
  p.rect(146, 174, 6, 14, 2, '#fff');
  p.ellipse(128, 174, 16, 4, '#92400e');
  // Steam
  p.ellipse(118, 154, 3, 8, alpha('#fff', 0.4));
  p.ellipse(132, 148, 3, 8, alpha('#fff', 0.4));
  // Display
  p.rect(96, 116, 64, 16, 2, '#10b981');
  p.rect(102, 122, 6, 4, 1, '#fff');
  p.rect(112, 122, 6, 4, 1, '#fff');
  p.rect(122, 122, 6, 4, 1, '#fff');
};

const paintGuitar = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 90);
  // Body — figure 8
  p.ellipse(140, 168, 50, 38, p.linearGrad(90, 130, 90, 210, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  p.ellipse(116, 122, 36, 28, p.linearGrad(80, 90, 80, 158, [[0, shade(base, 18)], [1, shade(base, -18)]]) as unknown as string);
  // Sound hole
  p.circle(140, 168, 16, '#1c1622');
  p.circle(140, 168, 12, '#3b2f50');
  // Neck
  p.rect(96, 40, 12, 86, 2, '#7c2d12');
  // Frets
  for (let i = 0; i < 8; i++) p.rect(96, 44 + i * 10, 12, 1.5, 0, '#9ca3af');
  // Head
  p.rect(86, 30, 28, 16, 2, '#1c1622');
  for (let i = 0; i < 3; i++) {
    p.circle(92 + i * 8, 36, 1.6, '#fde68a');
  }
  // Strings
  for (let i = 0; i < 6; i++) {
    const x = 100 + i * 1.4;
    p.line(x, 40, x, 196, alpha('#fff', 0.4), 0.4);
  }
};

const paintVinylBox = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 100);
  // Crate
  p.rect(56, 152, 144, 62, 4, p.linearGrad(0, 152, 0, 214, [[0, shade(item.color, 22)], [1, shade(item.color, -22)]]) as unknown as string);
  // Records leaning
  for (let i = 0; i < 6; i++) {
    const x = 70 + i * 18;
    const c = ['#fb923c', '#a78bfa', '#34d399', '#60a5fa', '#fbbf24', '#fb7185'][i];
    p.rect(x, 130, 14, 70, 2, c);
    p.circle(x + 7, 165, 6, '#1c1622');
    p.circle(x + 7, 165, 2, c);
  }
};

const paintPillows = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || shade(base, 22);
  ground(p, 128, 120);
  // Bottom pillow
  p.rect(58, 170, 140, 48, 18, p.linearGrad(0, 170, 0, 218, [[0, shade(accent, 14)], [1, shade(accent, -18)]]) as unknown as string);
  // Middle pillow
  p.rect(78, 132, 110, 50, 20, p.linearGrad(0, 132, 0, 182, [[0, shade(base, 14)], [1, shade(base, -22)]]) as unknown as string);
  // Top pillow
  p.rect(94, 96, 76, 50, 22, p.linearGrad(0, 96, 0, 146, [[0, '#fff'], [1, shade(accent, -10)]]) as unknown as string);
  // Tufts (button)
  p.circle(132, 122, 2.5, alpha('#000', 0.2));
  p.circle(132, 158, 2.5, alpha('#000', 0.2));
  p.circle(132, 194, 2.5, alpha('#000', 0.2));
};

const paintBlanket = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 200);
  // Folded blanket — many ribs
  for (let i = 0; i < 6; i++) {
    p.rect(20, 156 + i * 10, 216, 8, 3, i % 2 === 0 ? base : shade(base, -16));
  }
  // Tassels
  for (let i = 0; i < 8; i++) {
    p.rect(28 + i * 26, 218, 2, 8, 0, shade(base, -22));
  }
  // Stripe accent
  p.rect(20, 156, 216, 4, 2, alpha('#ffffff', 0.5));
};

const paintRobot = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  const accent = item.accent || '#7dd3fc';
  ground(p, 128, 120);
  // Body
  p.rect(70, 92, 116, 110, 18, p.linearGrad(70, 92, 70, 202, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  // Face plate
  p.rect(82, 104, 92, 56, 14, '#1c1622');
  p.circle(108, 132, 8, accent);
  p.circle(148, 132, 8, accent);
  p.circle(108, 132, 3, '#fff');
  p.circle(148, 132, 3, '#fff');
  // Smile
  p.line(108, 150, 148, 150, accent, 1.5);
  // Antenna
  p.rect(124, 60, 8, 36, 2, '#5b4a78');
  p.circle(128, 60, 5, accent);
  warmGlow(p, 128, 60, 16, accent);
  // Chest panel
  p.rect(102, 168, 52, 24, 4, '#1c1622');
  p.rect(110, 174, 8, 4, 1, '#34d399');
  p.rect(122, 174, 8, 4, 1, '#fde047');
  p.rect(134, 174, 8, 4, 1, '#60a5fa');
  // Arms
  p.rect(50, 110, 18, 70, 6, p.linearGrad(0, 110, 0, 180, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  p.rect(188, 110, 18, 70, 6, p.linearGrad(0, 110, 0, 180, [[0, shade(base, 22)], [1, shade(base, -22)]]) as unknown as string);
  // Feet
  p.rect(82, 200, 28, 16, 6, '#1c1622');
  p.rect(146, 200, 28, 16, 6, '#1c1622');
};

const paintCatTree = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 130);
  // Base
  p.ellipse(128, 218, 64, 12, '#8b5a2b');
  p.rect(96, 196, 64, 22, 4, p.linearGrad(0, 196, 0, 218, [[0, '#a87545'], [1, '#7c4a2a']]) as unknown as string);
  // Post
  p.rect(118, 90, 20, 110, 4, p.linearGrad(118, 90, 118, 200, [[0, shade('#fde68a', 12)], [1, '#a87545']]) as unknown as string);
  // Rope wrap
  for (let i = 0; i < 26; i++) p.rect(118, 92 + i * 4, 20, 2, 0.5, '#92400e');
  // Top platform
  p.rect(80, 70, 96, 22, 4, '#a87545');
  p.rect(80, 68, 96, 4, 1, '#fde68a');
  // Side perch
  p.rect(56, 130, 50, 22, 4, '#a87545');
  // Cat plush on top
  p.ellipse(128, 56, 24, 16, '#fde68a');
  p.triangle([116, 50], [120, 38], [124, 50], '#fde68a');
  p.triangle([130, 50], [134, 38], [138, 50], '#fde68a');
  p.circle(122, 56, 1.5, '#1c1622');
  p.circle(132, 56, 1.5, '#1c1622');
};

const paintCrystal = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 80);
  // Base
  p.ellipse(128, 216, 50, 8, '#3b2f50');
  // Crystal shards
  p.triangle([112, 218], [108, 150], [128, 168], item.color);
  p.triangle([128, 218], [128, 130], [148, 162], shade(item.color, 18));
  p.triangle([148, 218], [156, 156], [168, 184], shade(item.color, -8));
  p.triangle([100, 218], [88, 184], [114, 196], shade(item.color, 8));
  // Highlights
  p.line(112, 218, 116, 168, alpha('#fff', 0.6), 0.8);
  p.line(132, 218, 134, 144, alpha('#fff', 0.8), 1.2);
  warmGlow(p, 128, 180, 60, item.color);
};

const paintSnowGlobe = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 80);
  // Base
  p.rect(96, 192, 64, 26, 4, item.accent || '#9c7245');
  p.rect(96, 192, 64, 6, 2, alpha('#fff', 0.4));
  // Globe
  p.circle(128, 152, 48, alpha('#bae6fd', 0.45));
  p.circle(128, 152, 48, 'rgba(0,0,0,0)');
  // Snow scene
  p.ellipse(128, 186, 36, 8, '#fff');
  p.triangle([118, 186], [128, 156], [138, 186], '#15803d');
  p.circle(128, 154, 3, '#fb7185');
  // Snowflakes
  for (let i = 0; i < 12; i++) {
    const x = 88 + Math.random() * 80;
    const y = 116 + Math.random() * 70;
    if ((x - 128) ** 2 + (y - 152) ** 2 < 48 * 48) p.circle(x, y, 1, '#fff');
  }
  // Globe highlight
  p.ellipse(112, 124, 18, 8, alpha('#fff', 0.4));
};

const paintMoodOrb = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 80);
  // Stand
  p.rect(110, 200, 36, 14, 3, '#1c1622');
  p.rect(124, 188, 8, 14, 2, '#3b2f50');
  // Orb with shimmer gradient
  const grad = p.radialGrad(128, 156, 4, 50, [[0, '#fff'], [0.4, item.color], [0.8, item.accent || item.color], [1, alpha('#000', 0.4)]]);
  p.circle(128, 156, 38, grad as unknown as string);
  // Highlight
  p.ellipse(116, 138, 12, 6, alpha('#fff', 0.6));
  warmGlow(p, 128, 156, 60, item.color);
};

const paintWallClock = (p: Painter, item: RoomCatalogItem) => {
  const accent = item.accent || INK;
  // Face
  p.circle(128, 128, 72, '#fdfbf3');
  p.circle(128, 128, 72, 'rgba(0,0,0,0)');
  p.circle(128, 128, 76, 'rgba(0,0,0,0)');
  // Rim
  for (let r = 1; r < 6; r++) p.circle(128, 128, 72 + r, alpha(accent, r === 0 ? 1 : 0));
  // 12 ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x1 = 128 + Math.cos(a) * 62;
    const y1 = 128 + Math.sin(a) * 62;
    const x2 = 128 + Math.cos(a) * 70;
    const y2 = 128 + Math.sin(a) * 70;
    p.line(x1, y1, x2, y2, accent, i % 3 === 0 ? 2.4 : 1.2);
  }
  // Hands
  p.line(128, 128, 128, 80, accent, 2);
  p.line(128, 128, 162, 138, accent, 1.4);
  p.circle(128, 128, 4, '#fb7185');
};

const paintPennant = (p: Painter, item: RoomCatalogItem) => {
  // Wall mount bunting flags
  p.line(8, 18, 248, 70, '#3b2f50', 1);
  const colors = ['#fb7185', '#fbbf24', '#a78bfa', '#34d399', '#60a5fa', '#fde047', '#fb7185', '#a78bfa'];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = 16 + t * 224;
    const y = 18 + t * 52;
    const c = item.accent ? (i % 2 === 0 ? item.color : item.accent) : colors[i];
    p.triangle([x - 14, y], [x + 14, y], [x, y + 38], c);
  }
};

const paintEasel = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 90);
  // Legs (tripod)
  p.line(64, 224, 112, 50, '#7c4a2a', 1.8);
  p.line(196, 224, 144, 50, '#7c4a2a', 1.8);
  p.line(128, 224, 128, 200, '#7c4a2a', 1.8);
  // Crossbar
  p.line(82, 180, 174, 180, '#7c4a2a', 1.4);
  // Canvas
  p.rect(80, 56, 96, 124, 2, '#fef7e8');
  p.rectS(80, 56, 96, 124, 2, 'rgba(0,0,0,0)', '#7c4a2a', 1);
  // Painted artwork — abstract heart sketch
  p.line(96, 100, 160, 100, '#fb7185', 1.4);
  p.triangle([110, 110], [128, 156], [146, 110], '#f472b6');
  p.circle(108, 92, 8, alpha('#fbbf24', 0.5));
  p.circle(148, 130, 12, alpha('#a78bfa', 0.3));
  // Brushes hanging
  p.line(184, 188, 188, 218, '#3b2f50', 0.6);
  p.rect(186, 188, 4, 8, 1, '#fb923c');
};

const paintChandelier = (p: Painter, item: RoomCatalogItem) => {
  // Wall mounted (anchored to ceiling area visually)
  // Cord
  p.line(128, 4, 128, 44, '#3b2f50', 1);
  // Crown
  p.ellipse(128, 50, 28, 8, '#fbbf24');
  // Arms
  p.triangle([80, 90], [128, 56], [176, 90], alpha('#fbbf24', 0.5));
  // Crystal drops
  for (let i = 0; i < 9; i++) {
    const x = 56 + i * 18;
    const y = 110 + Math.abs(i - 4) * 6;
    p.triangle([x - 4, y], [x + 4, y], [x, y + 16], alpha('#fef9c3', 0.85));
    p.line(x, 90, x, y, alpha('#fbbf24', 0.6), 0.5);
  }
  // Candles up top
  for (let i = 0; i < 5; i++) {
    const x = 84 + i * 22;
    p.rect(x - 3, 70, 6, 12, 1, '#fff');
    p.ellipse(x, 66, 3, 5, '#fb923c');
  }
  warmGlow(p, 128, 96, 70, '#fde047');
};

const paintSaltLamp = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 90);
  // Base
  p.rect(98, 192, 60, 22, 3, item.accent || '#7c2d12');
  // Lamp body — irregular crystal
  const grad = p.radialGrad(128, 156, 6, 56, [[0, '#fff7e8'], [0.4, item.color], [1, shade(item.color, -22)]]);
  p.ellipse(128, 160, 44, 38, grad as unknown as string);
  // Inner glow
  warmGlow(p, 128, 156, 80, item.color);
  // Cord
  p.line(128, 198, 128, 220, '#3b2f50', 0.6);
};

const paintPianoUpright = (p: Painter, item: RoomCatalogItem) => {
  const base = item.color;
  ground(p, 128, 200);
  // Body
  p.rect(28, 56, 200, 168, 6, p.linearGrad(0, 56, 0, 224, [[0, '#1c1622'], [0.5, '#0c0a18'], [1, '#1c1622']]) as unknown as string);
  // Top lid
  p.rect(28, 56, 200, 14, 4, '#3b2f50');
  // Music rack
  p.rect(60, 70, 136, 36, 3, '#fdfbf3');
  // Sheet music lines
  for (let i = 0; i < 4; i++) p.rect(72, 80 + i * 5, 112, 1, 0, '#3b2f50');
  // Keyboard
  p.rect(40, 134, 176, 32, 3, '#fdfbf3');
  for (let i = 0; i < 14; i++) p.line(40 + i * 12.6, 134, 40 + i * 12.6, 166, '#3b2f50', 0.6);
  // Black keys (groups of 2+3)
  const blackPattern = [1, 2, 4, 5, 6, 8, 9, 11, 12, 13];
  for (const i of blackPattern) {
    if (i < 14) p.rect(40 + i * 12.6 - 4, 134, 8, 18, 1, '#0c0a18');
  }
  // Pedals
  p.rect(108, 210, 8, 10, 2, '#cbd5e1');
  p.rect(124, 210, 8, 10, 2, '#cbd5e1');
  p.rect(140, 210, 8, 10, 2, '#cbd5e1');
  // Wood gleam on side
  p.rect(28, 168, 200, 6, 2, alpha('#fff', 0.06));
};

const paintSwingChair = (p: Annotator, item: RoomCatalogItem) => {
  // forward declaration / unused; we use _paintSwingChair below
};

const _paintSwingChair = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 120);
  // Top mount
  p.rect(118, 4, 20, 8, 2, '#3b2f50');
  // Chains
  p.line(76, 12, 96, 124, alpha('#9ca3af', 0.7), 1.2);
  p.line(180, 12, 160, 124, alpha('#9ca3af', 0.7), 1.2);
  // Egg chair body
  const grad = p.linearGrad(60, 60, 60, 200, [[0, shade(item.color, 24)], [1, shade(item.color, -22)]]);
  p.ellipse(128, 152, 64, 70, grad as unknown as string);
  // Opening — inner ellipse darker
  p.ellipse(128, 152, 44, 50, p.linearGrad(0, 100, 0, 200, [[0, alpha('#000', 0.5)], [1, alpha('#000', 0.2)]]) as unknown as string);
  // Plush cushion
  p.rect(100, 156, 56, 28, 8, item.accent || '#fff7e8');
};

const paintStarDome = (p: Painter, item: RoomCatalogItem) => {
  ground(p, 128, 80);
  // Base
  p.ellipse(128, 218, 60, 10, '#3b2f50');
  p.rect(98, 200, 60, 18, 4, item.color);
  // Dome
  const grad = p.radialGrad(128, 154, 6, 64, [[0, '#1e1b4b'], [0.6, '#312e81'], [1, '#0c0a18']]);
  p.ellipse(128, 154, 60, 62, grad as unknown as string);
  // Constellation
  p.sparkles(80, 110, 96, 80, 40, '#fef08a');
  // Lines connecting stars
  p.line(112, 130, 124, 142, alpha('#fef08a', 0.5), 0.5);
  p.line(124, 142, 142, 138, alpha('#fef08a', 0.5), 0.5);
  p.line(142, 138, 154, 152, alpha('#fef08a', 0.5), 0.5);
  // Dome highlight
  p.line(96, 124, 110, 110, alpha('#fff', 0.5), 1.2);
};

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

type Annotator = Painter;

export const paintProp = (p: Painter, item: RoomCatalogItem) => {
  p.clear();
  p.save();
  switch (item.kind) {
    case 'bed': paintBed(p, item); break;
    case 'chair': paintChair(p, item); break;
    case 'beanbag': paintBeanbag(p, item); break;
    case 'pouf': paintPouf(p, item); break;
    case 'rocker': paintRocker(p, item); break;
    case 'bookshelf':
      if (item.footprint[0] >= 2) paintModularShelf(p, item);
      else paintBookshelf(p, item);
      break;
    case 'desk': paintDesk(p, item); break;
    case 'couch': paintCouch(p, item); break;
    case 'loveseat': paintLoveseat(p, item); break;
    case 'table': paintTable(p, item); break;
    case 'kotatsu': paintKotatsu(p, item); break;
    case 'console_table': paintConsoleTable(p, item); break;
    case 'dresser': paintDresser(p, item); break;
    case 'vanity': paintVanity(p, item); break;
    case 'tv': paintTV(p, item); break;
    case 'piano': paintPianoUpright(p, item); break;
    case 'swing_chair': _paintSwingChair(p, item); break;
    case 'lamp': paintLamp(p, item); break;
    case 'lantern': paintLantern(p, item); break;
    case 'candles': paintCandles(p, item); break;
    case 'salt_lamp': paintSaltLamp(p, item); break;
    case 'chandelier': paintChandelier(p, item); break;
    case 'disco': paintDisco(p, item); break;
    case 'lights': paintLights(p, item); break;
    case 'balloon': paintBalloon(p, item); break;
    case 'frame': paintFrame(p, item); break;
    case 'gallery': paintGallery(p, item); break;
    case 'mirror': paintMirror(p, item); break;
    case 'neon': paintNeon(p, item); break;
    case 'projector': paintProjector(p, item); break;
    case 'cactus': paintCactus(p, item); break;
    case 'plant':
      if (item.id === 'fiddle_leaf') paintFiddleLeaf(p, item);
      else paintPlant(p, item);
      break;
    case 'bonsai': paintBonsai(p, item); break;
    case 'flower': paintFlower(p, item); break;
    case 'sunflower': paintSunflower(p, item); break;
    case 'terrarium': paintTerrarium(p, item); break;
    case 'window':
      if (item.id === 'rainy_window') paintRainyWindow(p, item);
      else paintWindow(p, item);
      break;
    case 'portal': paintPortal(p, item); break;
    case 'aquarium': paintAquarium(p, item); break;
    case 'fireplace': paintFireplace(p, item); break;
    case 'record': paintRecord(p, item); break;
    case 'gramophone': paintGramophone(p, item); break;
    case 'fridge': paintFridge(p, item); break;
    case 'coffee_machine': paintCoffeeMachine(p, item); break;
    case 'books': paintBooks(p, item); break;
    case 'mug': paintMug(p, item); break;
    case 'tea_set': paintTeaSet(p, item); break;
    case 'guitar': paintGuitar(p, item); break;
    case 'vinyl_box': paintVinylBox(p, item); break;
    case 'pillows': paintPillows(p, item); break;
    case 'blanket': paintBlanket(p, item); break;
    case 'robot': paintRobot(p, item); break;
    case 'cat_tree': paintCatTree(p, item); break;
    case 'crystal': paintCrystal(p, item); break;
    case 'snowglobe': paintSnowGlobe(p, item); break;
    case 'mood_orb': paintMoodOrb(p, item); break;
    case 'wallclock': paintWallClock(p, item); break;
    case 'pennant': paintPennant(p, item); break;
    case 'easel': paintEasel(p, item); break;
    case 'rug': paintRug(p, item); break;
    case 'star_dome': paintStarDome(p, item); break;
    default:
      // Fallback — soft pastel box
      p.contactShadow(128, 232, 80, 14, 0.3);
      p.rect(72, 120, 112, 96, 12, p.linearGrad(0, 120, 0, 216, [[0, shade(item.color, 22)], [1, shade(item.color, -22)]]) as unknown as string);
      break;
  }
  // Special-case: canopy variant for bed
  if (item.kind === 'bed' && item.id === 'canopy_bed') {
    paintCanopyBed(p, item);
  }
  p.restore();
};

/**
 * OUR HOME — where things may rest (bare-box edition).
 *
 * The room is now a completely bare shell: two walls and a 9×9 tile floor.
 * Windows, the front door, the hearth — all of it is furniture the couple
 * hangs and places themselves. So the seat system is simple and honest:
 * the floor grid snaps by tiles, both walls take hung things anywhere on
 * the plaster, and placed furniture offers surface seats to smaller things.
 * Leaving a locked seat still takes 12 units of intent (hysteresis).
 */
import { HomeLane, HomeObject, HomeSku } from './homeTypes';
import {
  GRID, TILE_W, WALL_H, WallSide, sceneToTile, tileToScene, wallToScene,
} from './homeIso';

export const MAGNET_REACH = 24;
export const HYSTERESIS = 12;

/* ── the few fixed points the bare room still owns ───────────── */

export const ARCH = {
  /** Hung things live between these heights on the plaster. */
  wallUpMin: 26,
  wallUpMax: WALL_H - 30,
  railUp: 66,
  /** Parcels arrive on the floor by the front of the room. */
  parcelSpot: tileToScene(7.5, 1.5),
  /** Where Coco waits during Quiet Hours. */
  cocoDoorSpot: tileToScene(7.5, 2.5),
} as const;

/* ── Seat geometry ───────────────────────────────────────────── */

export interface SeatPoint {
  seatId: string;
  x: number;
  y: number;
  lane: HomeLane;
  surfaceUid?: string;
}

export interface SeatField {
  points: SeatPoint[];
  floorOk: boolean;
  wallOk: boolean;
  /** 'col,row' keys of floor tiles already under furniture. */
  occupied: Set<string>;
}

export interface DropResolution {
  x: number;
  y: number;
  lane: HomeLane;
  seatId?: string;
  surfaceUid?: string;
  snapped: boolean;
  /** Footprint origin tile when seated on the floor — feeds the highlight. */
  tile?: { col: number; row: number };
}

const seatOccupied = (
  objects: readonly HomeObject[], seatId: string, ignoreUid?: string,
): boolean => objects.some((o) =>
  !o.removed && !o.stored && o.uid !== ignoreUid && o.seatId === seatId);

/** An object's footprint origin tile (prefers its seatId, falls back to x/y). */
export const tileOriginOf = (o: HomeObject, sku: HomeSku): { col: number; row: number } | null => {
  if (o.lane !== 1 || sku.td === 0) return null;
  const m = o.seatId?.match(/^tile:(-?\d+),(-?\d+)$/);
  if (m) return { col: Number(m[1]), row: Number(m[2]) };
  const c = sceneToTile(o.x, o.y);
  return {
    col: Math.round(c.col - sku.tw / 2),
    row: Math.round(c.row - sku.td / 2),
  };
};

const footprintKeys = (col: number, row: number, tw: number, td: number): string[] => {
  const keys: string[] = [];
  for (let c = col; c < col + tw; c += 1) {
    for (let r = row; r < row + td; r += 1) keys.push(`${c},${r}`);
  }
  return keys;
};

/** Wall spans already taken by hung things (windows, the door, frames…). */
const wallSpansTaken = (
  objects: readonly HomeObject[],
  skuOf: (sku: string) => HomeSku | undefined,
  ignoreUid?: string,
): Record<WallSide, Array<readonly [number, number]>> => {
  const spans: Record<WallSide, Array<readonly [number, number]>> = { L: [], R: [] };
  objects.forEach((o) => {
    if (o.removed || o.stored || o.uid === ignoreUid) return;
    if (o.lane !== 0 && o.lane !== 2) return;
    const sku = skuOf(o.sku);
    if (!sku || sku.td !== 0) return;
    const m = o.seatId?.match(/^wall([LR]):([\d.]+),/);
    if (!m) return;
    const side = m[1] as WallSide;
    const along = Number(m[2]);
    const half = (sku.tw || 1) / 2;
    spans[side].push([along - half, along + half]);
  });
  return spans;
};

/** Everything a given sku may rest on, right now. */
export const gatherSeats = (
  sku: HomeSku,
  objects: readonly HomeObject[],
  skuOf: (sku: string) => HomeSku | undefined,
  ignoreUid?: string,
): SeatField => {
  const points: SeatPoint[] = [];

  if (sku.placeOn.includes('surface')) {
    objects.forEach((host) => {
      if (host.removed || host.stored || host.uid === ignoreUid) return;
      const hostSku = skuOf(host.sku);
      if (!hostSku?.seats) return;
      hostSku.seats.forEach((seat, i) => {
        if (sku.w > seat.maxW) return;
        const seatId = `surface:${host.uid}:${i}`;
        if (seatOccupied(objects, seatId, ignoreUid)) return;
        points.push({
          seatId, surfaceUid: host.uid,
          x: host.x + seat.dx, y: host.y + seat.dy,
          lane: host.lane,
        });
      });
    });
  }

  const occupied = new Set<string>();
  objects.forEach((o) => {
    if (o.removed || o.stored || o.uid === ignoreUid || o.surfaceUid) return;
    const oSku = skuOf(o.sku);
    if (!oSku) return;
    const origin = tileOriginOf(o, oSku);
    if (!origin) return;
    footprintKeys(origin.col, origin.row, oSku.tw, oSku.td).forEach((k) => occupied.add(k));
  });

  return {
    points,
    floorOk: sku.placeOn.includes('floor') && sku.td > 0,
    wallOk: sku.placeOn.includes('wall'),
    occupied,
  };
};

/* ── The magnet ──────────────────────────────────────────────── */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const floorPoint = (col: number, row: number, tw: number, td: number) =>
  tileToScene(col + tw / 2, row + td / 2);

/**
 * Resolve where a carried object would land if released at (px, py).
 * Point seats win inside the magnet; then the wall (for hung things); then
 * the floor grid — always to a FREE footprint, never an error state.
 */
export const resolveDrop = (
  sku: HomeSku,
  px: number,
  py: number,
  field: SeatField,
  neighbors: readonly HomeObject[],
  skuOf?: (sku: string) => HomeSku | undefined,
  ignoreUid?: string,
): DropResolution => {
  let best: DropResolution | null = null;
  let bestDist = MAGNET_REACH;
  field.points.forEach((p) => {
    const dd = Math.hypot(px - p.x, py - p.y);
    if (dd < bestDist) {
      bestDist = dd;
      best = {
        x: p.x, y: p.y, lane: p.lane, seatId: p.seatId,
        surfaceUid: p.surfaceUid, snapped: true,
      };
    }
  });
  if (best) return best;

  // above the floor line at this x → we're on a wall
  const t = sceneToTile(px, py);
  const onFloor = t.col >= -0.5 && t.col <= GRID + 0.5 && t.row >= -0.5 && t.row <= GRID + 0.5
    && t.col + t.row >= 0;

  // wall-only pieces take the wall even when released over the floor
  if (field.wallOk && (!onFloor || !field.floorOk)) {
    const side: WallSide = px < tileToScene(0, 0).x ? 'L' : 'R';
    const alongRaw = side === 'L' ? sceneToTile(px, py).row : sceneToTile(px, py).col;
    const floorY = wallToScene(side, clamp(alongRaw, 0, GRID), 0).y;
    // door-height pieces stand ON the floor; hung things stay on the plaster
    const upMin = sku.h >= 110 ? 0 : ARCH.wallUpMin;
    let up = clamp(floorY - py, upMin, ARCH.wallUpMax - Math.max(0, sku.h - 80));
    if (upMin === 0 && up < 24) up = 0;
    else if (Math.abs(up - ARCH.railUp) < 12) up = ARCH.railUp; // the picture rail
    const wTiles = sku.tw || 1;
    const half = wTiles / 2;
    const taken = skuOf ? wallSpansTaken([...neighbors], skuOf, ignoreUid)[side] : [];
    const spanFree = (a: number) => a - half >= 0.15 && a + half <= GRID - 0.15
      && !taken.some(([b1, b2]) => a - half < b2 && a + half > b1);
    let along: number | null = null;
    for (let step = 0; step <= 44 && along === null; step += 1) {
      for (const dir of step === 0 ? [0] : [-1, 1]) {
        const a = clamp(alongRaw, 0, GRID) + dir * step * 0.2;
        if (spanFree(a)) {
          along = a;
          break;
        }
      }
    }
    if (along !== null) {
      const p = wallToScene(side, along, up);
      return {
        x: p.x, y: p.y, lane: side === 'L' ? 0 : 2,
        seatId: `wall${side}:${along.toFixed(1)},${Math.round(up)}`,
        snapped: true,
      };
    }
  }

  if (field.floorOk) {
    const tw = sku.tw;
    const td = sku.td;
    const col0 = clamp(Math.round(t.col - tw / 2), 0, GRID - tw);
    const row0 = clamp(Math.round(t.row - td / 2), 0, GRID - td);
    const fits = (c: number, r: number) =>
      c >= 0 && r >= 0 && c + tw <= GRID && r + td <= GRID
      && !footprintKeys(c, r, tw, td).some((k) => field.occupied.has(k));
    // spiral out to the nearest free footprint — releases never error
    let found: { col: number; row: number } | null = null;
    outer: for (let radius = 0; radius <= GRID; radius += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        for (let dr = -radius; dr <= radius; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
          if (fits(col0 + dc, row0 + dr)) {
            found = { col: col0 + dc, row: row0 + dr };
            break outer;
          }
        }
      }
    }
    if (found) {
      const p = floorPoint(found.col, found.row, tw, td);
      return {
        x: p.x, y: p.y, lane: 1,
        seatId: `tile:${found.col},${found.row}`,
        snapped: onFloor,
        tile: found,
      };
    }
  }

  // nothing valid in reach: hold position, unseated
  return { x: px, y: py, lane: 1, snapped: false };
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { RoomState } from '../../types';
import {
  Idle,
  PropKind,
  RoomCatalogItem,
  ROOM_GRID_SIZE,
  percentToGrid,
} from './roomCatalog3D';

const CELL_SIZE = 0.88;
const FLOOR_THICKNESS = 0.18;
const WALL_HEIGHT = 2.86;
const WALL_THICKNESS = 0.18;
const HALF_GRID = (ROOM_GRID_SIZE - 1) / 2;
const INNER_SIZE = ROOM_GRID_SIZE * CELL_SIZE;
const OUTLINE = '#3b2f50';
const FLOOR_TOP_Y = FLOOR_THICKNESS / 2;
const LEFT_WALL_DEPTH = INNER_SIZE * 0.62;
const LEFT_WALL_CENTER_Z = -INNER_SIZE * 0.2;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const shade = (hex: string, amount: number) => {
  const raw = hex.replace('#', '');
  const safe = raw.length === 3
    ? raw.split('').map((chunk) => chunk + chunk).join('')
    : raw.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(safe, 16);
  const next = (channel: number) => clamp(channel + amount, 0, 255);
  const r = next((num >> 16) & 255);
  const g = next((num >> 8) & 255);
  const b = next(num & 255);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const hasWebGLSupport = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

const fillPx = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  scale: number,
) => {
  ctx.fillStyle = color;
  ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
};

const createPatternTexture = (variant: string, isFloor: boolean): THREE.CanvasTexture => {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (isFloor) {
    if (variant === 'hardwood') {
      ctx.fillStyle = '#a97854';
      ctx.fillRect(0, 0, size, size);
      for (let x = 0; x < size; x += 12) {
        ctx.fillStyle = x % 24 === 0 ? '#bc8961' : '#966a4b';
        ctx.fillRect(x, 0, 6, size);
      }
      ctx.strokeStyle = '#845d42';
      ctx.lineWidth = 2;
      for (let y = 0; y < size; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y + 4);
        ctx.stroke();
      }
    } else if (variant === 'tiles') {
      ctx.fillStyle = '#8090d7';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#6a79bb';
      ctx.lineWidth = 2;
      for (let x = 0; x <= size; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }
      for (let y = 0; y <= size; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#98a5ee';
      for (let y = 4; y < size; y += 16) {
        for (let x = (y / 4) % 2 === 0 ? 5 : 11; x < size; x += 16) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    } else if (variant === 'cloud') {
      ctx.fillStyle = '#b6d5ff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#f8fbff';
      for (let i = 0; i < 14; i += 1) {
        const x = (i * 23) % size;
        const y = (i * 17) % size;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 9, y + 2, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (variant === 'grass') {
      ctx.fillStyle = '#7abd68';
      ctx.fillRect(0, 0, size, size);
      for (let x = 0; x < size; x += 8) {
        ctx.fillStyle = x % 16 === 0 ? '#8bcf76' : '#6aa95a';
        ctx.fillRect(x, 0, 3, size);
      }
    } else if (variant === 'marble') {
      ctx.fillStyle = '#e5e8f6';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#c9d1e7';
      ctx.lineWidth = 2;
      for (let i = -12; i < size + 12; i += 12) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 18, size);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#6170ba';
      ctx.fillRect(0, 0, size, size);
      for (let x = 0; x < size; x += 10) {
        ctx.fillStyle = x % 20 === 0 ? '#7383d0' : '#5665ad';
        ctx.fillRect(x, 0, 4, size);
      }
      ctx.fillStyle = '#90a0ea';
      for (let y = 8; y < size; y += 12) {
        for (let x = (y / 4) % 2 === 0 ? 7 : 14; x < size; x += 18) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
  } else {
    if (variant === 'wood') {
      ctx.fillStyle = '#b6845e';
      ctx.fillRect(0, 0, size, size);
      for (let x = 0; x < size; x += 12) {
        ctx.fillStyle = x % 24 === 0 ? '#c69267' : '#a17352';
        ctx.fillRect(x, 0, 7, size);
      }
      ctx.strokeStyle = '#8f6547';
      ctx.lineWidth = 2;
      for (let x = 0; x <= size; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#dfd0c4';
      ctx.fillRect(0, 0, size, size);
      if (variant === 'stripes') {
        ctx.fillStyle = '#cbbbad';
        for (let x = 0; x < size; x += 14) {
          ctx.fillRect(x, 0, 4, size);
        }
      }
      if (variant === 'polka') {
        ctx.fillStyle = '#f2e8de';
        for (let y = 8; y < size; y += 18) {
          for (let x = 8; x < size; x += 18) {
            ctx.beginPath();
            ctx.arc(x, y, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (variant === 'hearts') {
        ctx.fillStyle = '#e6b8c7';
        for (let y = 10; y < size; y += 22) {
          for (let x = 10; x < size; x += 22) {
            fillPx(ctx, x / 2, y / 2, 1, 1, '#e6b8c7', 2);
            fillPx(ctx, x / 2 + 1, y / 2, 1, 1, '#e6b8c7', 2);
            fillPx(ctx, x / 2 + 0.5, y / 2 + 1, 1, 1, '#e6b8c7', 2);
          }
        }
      }
      if (variant === 'stars') {
        ctx.fillStyle = '#f7ecda';
        for (let i = 0; i < 20; i += 1) {
          const x = (i * 17) % size;
          const y = (i * 23) % size;
          ctx.fillRect(x, y, 2, 2);
          ctx.fillRect(x - 2, y + 2, 2, 2);
          ctx.fillRect(x + 2, y + 2, 2, 2);
        }
      }

      ctx.strokeStyle = '#c6b5a8';
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i += 1) {
        const x = (i * 21) % size;
        const y = 10 + ((i * 13) % (size - 20));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6, y + 3);
        ctx.lineTo(x + 2, y + 8);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(isFloor ? 4.2 : 2.8, isFloor ? 4.2 : 1.9);
  return texture;
};

const createPropTexture = (kind: PropKind, color: string): THREE.CanvasTexture => {
  const scale = 4;
  const units = 32;
  const canvas = document.createElement('canvas');
  canvas.width = units * scale;
  canvas.height = units * scale;
  const ctx = canvas.getContext('2d')!;
  const base = color;
  const light = shade(color, 36);
  const dark = shade(color, -26);
  const ink = OUTLINE;
  const silver = '#d8dfee';
  const floorWood = '#8a603f';
  const softPink = '#f7d5e5';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = (x: number, y: number, w: number, h: number, fill: string) => fillPx(ctx, x, y, w, h, fill, scale);

  const outlineRect = (x: number, y: number, w: number, h: number, fill: string) => {
    px(x, y, w, h, ink);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };

  const floorShadow = () => {
    px(5, 25, 22, 3, '#573e62');
    px(7, 24, 18, 1, '#71547b');
  };

  floorShadow();

  switch (kind) {
    case 'desk':
      outlineRect(5, 12, 19, 9, base);
      px(7, 14, 15, 5, shade(base, -8));
      px(7, 21, 2, 7, floorWood);
      px(20, 21, 2, 7, floorWood);
      outlineRect(16, 6, 8, 6, '#26324b');
      px(18, 8, 4, 2, '#7bd3ff');
      px(9, 8, 4, 4, '#49b67d');
      px(10, 7, 2, 1, '#78d98e');
      break;
    case 'tv':
      outlineRect(6, 18, 20, 6, '#5d6388');
      outlineRect(7, 7, 18, 10, '#1d2334');
      px(9, 9, 14, 6, color);
      px(13, 24, 6, 3, '#515770');
      break;
    case 'bookshelf':
      outlineRect(8, 5, 14, 22, floorWood);
      px(10, 10, 10, 1, ink);
      px(10, 15, 10, 1, ink);
      px(10, 20, 10, 1, ink);
      px(10, 7, 2, 3, '#ffb84d');
      px(13, 7, 2, 3, '#77a5ff');
      px(16, 7, 2, 3, '#8be38e');
      break;
    case 'fridge':
      outlineRect(9, 5, 13, 22, silver);
      px(10, 6, 11, 9, shade('#d8dfee', 10));
      px(10, 16, 11, 10, shade('#d8dfee', -8));
      px(19, 10, 1, 4, '#7aa7e3');
      px(19, 18, 1, 5, '#7aa7e3');
      break;
    case 'couch':
      outlineRect(4, 16, 23, 8, base);
      outlineRect(5, 10, 8, 8, light);
      outlineRect(18, 10, 8, 8, light);
      px(5, 24, 2, 3, '#6f4c3d');
      px(24, 24, 2, 3, '#6f4c3d');
      break;
    case 'bed':
      outlineRect(4, 13, 24, 10, base);
      outlineRect(5, 8, 8, 6, softPink);
      outlineRect(13, 8, 8, 6, '#f2bfd9');
      px(4, 24, 2, 3, '#6f4c3d');
      px(26, 24, 2, 3, '#6f4c3d');
      break;
    case 'chair':
      outlineRect(10, 11, 12, 7, dark);
      outlineRect(9, 17, 14, 6, base);
      px(11, 23, 2, 5, '#676f88');
      px(19, 23, 2, 5, '#676f88');
      break;
    case 'beanbag':
      outlineRect(7, 16, 18, 9, base);
      px(10, 18, 12, 4, light);
      break;
    case 'table':
      outlineRect(8, 14, 16, 5, light);
      px(15, 19, 2, 7, '#6f4c3d');
      px(12, 25, 8, 2, '#7e5c44');
      break;
    case 'lamp':
      px(15, 7, 2, 16, '#878fa7');
      outlineRect(11, 4, 10, 5, light);
      px(10, 23, 12, 2, '#5e6781');
      break;
    case 'lantern':
      px(15, 4, 2, 4, '#878fa7');
      outlineRect(10, 8, 12, 12, light);
      px(11, 10, 10, 8, base);
      break;
    case 'candles':
      outlineRect(8, 18, 4, 8, '#f9f1db');
      outlineRect(14, 15, 4, 11, '#fff5db');
      outlineRect(20, 19, 4, 7, '#f9f1db');
      px(9, 16, 2, 2, '#ffcb63');
      px(15, 13, 2, 2, '#ffcb63');
      px(21, 17, 2, 2, '#ffcb63');
      break;
    case 'disco':
      px(15, 2, 2, 4, '#8790ac');
      outlineRect(11, 6, 10, 10, silver);
      px(12, 7, 2, 2, '#93b8ff');
      px(16, 9, 2, 2, '#ffd0f5');
      px(18, 12, 2, 2, '#ffe27a');
      break;
    case 'lights':
      px(4, 7, 24, 1, ink);
      [6, 10, 14, 18, 22, 26].forEach((x, idx) => {
        px(x, 8, 1, 2, idx % 2 === 0 ? '#ffe580' : '#f6a8ff');
        px(x, 10, 1, 1, '#8ee1ff');
      });
      break;
    case 'balloon':
      outlineRect(7, 8, 8, 8, light);
      outlineRect(16, 6, 8, 8, '#ffc0d0');
      outlineRect(12, 13, 9, 9, base);
      px(11, 21, 1, 6, ink);
      px(19, 19, 1, 8, ink);
      px(16, 23, 1, 4, ink);
      break;
    case 'plant':
    case 'bonsai':
    case 'flower':
    case 'sunflower':
    case 'cactus':
      outlineRect(11, 20, 10, 6, '#8b623d');
      if (kind === 'cactus') {
        outlineRect(13, 9, 6, 12, color);
        outlineRect(10, 12, 3, 6, color);
        outlineRect(19, 13, 3, 6, color);
      } else if (kind === 'bonsai') {
        px(15, 11, 2, 9, '#7a4c36');
        outlineRect(10, 8, 6, 5, '#8ed55f');
        outlineRect(15, 6, 7, 6, '#7dc84f');
      } else if (kind === 'sunflower') {
        px(15, 10, 2, 10, '#5f8f41');
        outlineRect(11, 5, 10, 7, '#ffcf4d');
        px(14, 7, 4, 3, '#8e582b');
      } else if (kind === 'flower') {
        px(15, 11, 2, 10, '#5f8f41');
        outlineRect(11, 7, 10, 6, '#ff9bcc');
        px(14, 9, 4, 2, '#ffd77c');
      } else {
        outlineRect(10, 9, 12, 11, color);
      }
      break;
    case 'frame':
      outlineRect(8, 6, 16, 18, '#6e4d3a');
      px(10, 8, 12, 14, '#f5efe3');
      px(12, 10, 4, 4, color);
      px(16, 14, 4, 4, shade(color, -18));
      break;
    case 'neon':
      outlineRect(7, 8, 18, 12, '#262241');
      px(10, 11, 4, 2, light);
      px(15, 11, 2, 6, light);
      px(18, 11, 4, 2, light);
      px(18, 15, 4, 2, light);
      break;
    case 'projector':
      outlineRect(11, 16, 10, 8, '#363d56');
      px(14, 18, 3, 3, '#90d7ff');
      px(21, 17, 6, 4, shade(color, 25));
      break;
    case 'window':
      outlineRect(8, 6, 16, 18, '#a86f54');
      px(10, 8, 12, 14, '#bfe3ff');
      px(15, 8, 1, 14, '#f0f5ff');
      px(10, 15, 12, 1, '#f0f5ff');
      break;
    case 'portal':
      outlineRect(10, 4, 12, 22, '#4a3b65');
      px(12, 6, 8, 18, '#8d66ff');
      px(13, 8, 6, 14, '#b7a7ff');
      break;
    case 'aquarium':
      outlineRect(5, 11, 22, 12, '#8f98af');
      px(7, 13, 18, 8, '#79d7ff');
      px(10, 17, 4, 2, '#ffbf52');
      px(18, 16, 4, 2, '#72d07a');
      px(8, 23, 2, 4, '#7f8598');
      px(22, 23, 2, 4, '#7f8598');
      break;
    case 'fireplace':
      outlineRect(5, 12, 22, 13, '#a16242');
      px(10, 16, 12, 6, '#2b2235');
      px(12, 17, 8, 4, '#ff9548');
      break;
    case 'record':
      outlineRect(9, 14, 14, 10, '#434d71');
      px(11, 16, 7, 6, '#1c2032');
      px(17, 17, 4, 2, '#f7b455');
      break;
    case 'books':
      outlineRect(8, 19, 14, 4, '#6aa4ff');
      outlineRect(10, 15, 12, 4, '#ff8c6f');
      outlineRect(12, 11, 10, 4, '#7bd08c');
      break;
    case 'mug':
      outlineRect(12, 15, 8, 9, color);
      px(20, 17, 3, 5, '#f3f6ff');
      break;
    case 'pillows':
      outlineRect(7, 16, 10, 8, base);
      outlineRect(16, 14, 10, 9, '#a798ff');
      break;
    case 'blanket':
      outlineRect(5, 15, 22, 9, color);
      px(7, 17, 18, 3, shade(color, 18));
      break;
    case 'robot':
      outlineRect(11, 9, 10, 12, silver);
      px(13, 12, 2, 2, '#5a6887');
      px(17, 12, 2, 2, '#5a6887');
      px(14, 17, 4, 2, '#6dd0ff');
      px(14, 5, 4, 2, '#5d6a86');
      px(12, 21, 2, 5, '#707892');
      px(18, 21, 2, 5, '#707892');
      break;
    default:
      outlineRect(8, 10, 16, 14, base);
      break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const gridToWorld = (gx: number, gy: number): [number, number, number] => {
  const x = (gx - HALF_GRID) * CELL_SIZE;
  const z = (gy - HALF_GRID) * CELL_SIZE;
  return [x, 0, z];
};

const worldToGrid = (x: number, z: number) => {
  const gx = clamp(Math.round(x / CELL_SIZE + HALF_GRID), 0, ROOM_GRID_SIZE - 1);
  const gy = clamp(Math.round(z / CELL_SIZE + HALF_GRID), 0, ROOM_GRID_SIZE - 1);
  return { gx, gy };
};

const itemIdleOffset = (idle: Idle, t: number): { y: number; r: number } => {
  if (idle === 'none') return { y: 0, r: 0 };
  if (idle === 'spin') return { y: 0.02, r: t * 0.7 };
  if (idle === 'bounce') return { y: Math.sin(t * 3) * 0.04, r: 0 };
  if (idle === 'sway') return { y: 0.02, r: Math.sin(t * 2.2) * 0.07 };
  if (idle === 'twinkle') return { y: Math.sin(t * 2) * 0.01, r: 0 };
  if (idle === 'flicker') return { y: Math.sin(t * 7.5) * 0.01, r: Math.sin(t * 4) * 0.01 };
  return { y: Math.sin(t * 2.5) * 0.02, r: Math.sin(t * 2) * 0.04 };
};

const defaultSpriteSize = (item: RoomCatalogItem): [number, number] => {
  if (item.spriteSize) return item.spriteSize;
  if (item.footprint[0] >= 2 || item.kind === 'bed' || item.kind === 'tv' || item.kind === 'couch') {
    return [1.75, 1.22];
  }
  if (item.kind === 'lamp' || item.kind === 'lantern' || item.kind === 'plant') return [0.95, 1.45];
  if (item.kind === 'frame' || item.kind === 'window' || item.kind === 'portal') return [1, 1.28];
  return [1, 1.06];
};

const itemBaseColor = (item: RoomCatalogItem) => shade(item.color, -22);

const SceneCameraLock: React.FC = () => {
  const { camera } = useThree();

  useFrame(() => {
    camera.position.set(6.02, 5.72, 6.02);
    camera.lookAt(0, 0.96, 0);
  });

  return null;
};

interface PropActorProps {
  item: RoomCatalogItem;
  gx: number;
  gy: number;
  rotationDeg: number;
  selected: boolean;
  dragging: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onSelect?: (id: string) => void;
  id: string;
}

const PropActor: React.FC<PropActorProps> = ({
  item,
  gx,
  gy,
  rotationDeg,
  selected,
  dragging,
  dimmed,
  interactive = true,
  onPointerDown,
  onSelect,
  id,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useMemo(() => createPropTexture(item.kind, item.color), [item.kind, item.color]);
  const [spriteW, spriteH] = defaultSpriteSize(item);
  const isWallMounted = item.mount === 'back-wall';
  const shadowOpacity = dragging ? 0.09 : selected ? 0.12 : 0.17;
  const baseOpacity = dimmed ? 0.5 : 1;

  useEffect(() => () => texture.dispose(), [texture]);

  const baseRotation = THREE.MathUtils.degToRad((item.defaultRotation || 0) + rotationDeg);
  const [floorX, , floorZ] = gridToWorld(gx, gy);
  const wallX = (gx - HALF_GRID) * CELL_SIZE * 0.78;
  const wallY = item.anchorHeight ?? 1.62;
  const wallZ = -INNER_SIZE / 2 + WALL_THICKNESS / 2 + 0.04;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    const idle = itemIdleOffset(item.idle, t + gx * 0.19 + gy * 0.13);
    const s = item.scale || 1;
    const targetScale = dragging ? s * 1.05 : s;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.18);
    if (isWallMounted) {
      groupRef.current.position.set(wallX, wallY + idle.y * 0.4, wallZ);
      groupRef.current.rotation.set(0, idle.r * 0.1, 0);
    } else {
      groupRef.current.position.set(floorX, FLOOR_TOP_Y + idle.y, floorZ);
      groupRef.current.rotation.set(0, baseRotation + idle.r, 0);
    }
  });

  const shadowW = Math.max(0.72, item.footprint[0] * 0.8);
  const shadowH = Math.max(0.62, item.footprint[1] * 0.75);
  const frameColor = shade(item.color, -18);

  return (
    <group
      ref={groupRef}
      onPointerDown={interactive && onPointerDown ? (e) => onPointerDown(e, id) : undefined}
      onClick={interactive && onSelect ? (e) => { e.stopPropagation(); onSelect(id); } : undefined}
    >
      {!isWallMounted && (
        <>
          <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[shadowW, shadowH]} />
            <meshBasicMaterial color="#543e65" transparent opacity={shadowOpacity * baseOpacity} depthWrite={false} />
          </mesh>
          {selected && (
            <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[shadowW + 0.2, shadowH + 0.18]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
            </mesh>
          )}
          {item.visualType !== 'billboard' && (
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[item.footprint[0] * 0.62, 0.08, item.footprint[1] * 0.58]} />
              <meshStandardMaterial color={frameColor} roughness={0.95} metalness={0} transparent opacity={0.9 * baseOpacity} />
            </mesh>
          )}
        </>
      )}

      {isWallMounted && selected && (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[spriteW + 0.12, spriteH + 0.12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      )}

      <mesh
        position={isWallMounted ? [0, 0, 0] : [0, spriteH * 0.5, 0]}
        rotation={isWallMounted ? [0, 0, 0] : [0, Math.PI / 4, 0]}
      >
        <planeGeometry args={[spriteW, spriteH]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.18} opacity={baseOpacity} toneMapped={false} />
      </mesh>
    </group>
  );
};

const RoomSceneFallback: React.FC<{ room: RoomState; catalogById: Record<string, RoomCatalogItem> }> = ({ room, catalogById }) => (
  <div className="absolute inset-0 overflow-hidden room-pixel-ui" style={{ background: 'linear-gradient(180deg,#f6d8b4,#edc092)' }}>
    <div className="absolute left-[16%] right-[16%] top-[12%] h-[28%] border-[3px] border-[#57436f]" style={{ background: '#d8c7bb' }} />
    <div className="absolute left-[8%] top-[18%] w-[22%] h-[38%] origin-top-right -skew-y-[24deg] border-[3px] border-[#57436f]" style={{ background: '#cdbcb0' }} />
    <div className="absolute right-[8%] top-[18%] w-[22%] h-[38%] origin-top-left skew-y-[24deg] border-[3px] border-[#57436f]" style={{ background: '#cdbcb0' }} />
    <div className="absolute left-[12%] right-[12%] top-[42%] bottom-[12%] border-[3px] border-[#52456e]" style={{ background: '#5c6eb7', clipPath: 'polygon(50% 0%,100% 24%,100% 78%,50% 100%,0% 78%,0% 24%)' }} />
    {room.placedItems.map((entry) => {
      const meta = catalogById[entry.itemId];
      if (!meta) return null;
      return (
        <div
          key={entry.uid}
          className="absolute rounded-md border-2 border-[#3b2f50]"
          style={{ left: `${entry.x}%`, top: `${entry.y}%`, width: 38, height: 28, transform: 'translate(-50%,-50%)', background: meta.color }}
        />
      );
    })}
  </div>
);

interface RoomScene3DProps {
  room: RoomState;
  catalogById: Record<string, RoomCatalogItem>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMoveItemGrid: (id: string, gx: number, gy: number) => void;
  onDragCommit: () => void;
}

export const RoomScene3D: React.FC<RoomScene3DProps> = ({
  room,
  catalogById,
  selectedId,
  onSelect,
  onMoveItemGrid,
  onDragCommit,
}) => {
  const [webglReady, setWebglReady] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    setWebglReady(hasWebGLSupport());
  }, []);

  const floorTex = useMemo(() => createPatternTexture(room.floor, true), [room.floor]);
  const wallTex = useMemo(() => createPatternTexture(room.wallpaper, false), [room.wallpaper]);

  useEffect(() => {
    return () => {
      floorTex.dispose();
      wallTex.dispose();
    };
  }, [floorTex, wallTex]);

  const ambientPreset = useMemo(() => {
    if (room.ambient === 'cool') {
      return {
        background: '#f5dcc9',
        ambientColor: '#eef5ff',
        ambientIntensity: 1.15,
        dirColor: '#d6e8ff',
        dirIntensity: 1.05,
        fillColor: '#b3daff',
        fillIntensity: 0.48,
      };
    }
    if (room.ambient === 'rainbow') {
      return {
        background: '#f6d7c4',
        ambientColor: '#fff1fb',
        ambientIntensity: 1.18,
        dirColor: '#ffe0ad',
        dirIntensity: 1.08,
        fillColor: '#b8ffd6',
        fillIntensity: 0.5,
      };
    }
    return {
      background: '#f6d8b8',
      ambientColor: '#fff2df',
      ambientIntensity: 1.12,
      dirColor: '#ffe5bc',
      dirIntensity: 1.04,
      fillColor: '#ffe1b7',
      fillIntensity: 0.46,
    };
  }, [room.ambient]);

  const realEntries = useMemo(() => room.placedItems
    .map((entry) => {
      const meta = catalogById[entry.itemId];
      if (!meta) return null;
      const { gx, gy } = percentToGrid(entry);
      return {
        id: entry.uid,
        meta,
        gx,
        gy,
        rotationDeg: entry.rotation || 0,
        starter: false,
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      meta: RoomCatalogItem;
      gx: number;
      gy: number;
      rotationDeg: number;
      starter: boolean;
    }>, [room.placedItems, catalogById]);

  const allEntries = realEntries;

  const handlePointerPlaneMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!draggingId) return;
    e.stopPropagation();
    const { gx, gy } = worldToGrid(e.point.x, e.point.z);
    onMoveItemGrid(draggingId, gx, gy);
  }, [draggingId, onMoveItemGrid]);

  const stopDrag = useCallback(() => {
    if (!draggingId) return;
    setDraggingId(null);
    onDragCommit();
  }, [draggingId, onDragCommit]);

  const handleItemPointerDown = useCallback((e: ThreeEvent<PointerEvent>, id: string) => {
    e.stopPropagation();
    setDraggingId(id);
    onSelect(id);
  }, [onSelect]);

  if (!webglReady) {
    return <RoomSceneFallback room={room} catalogById={catalogById} />;
  }

  return (
    <Canvas
      orthographic
      dpr={[1, 1.35]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [6.02, 5.72, 6.02], zoom: 74, near: 0.1, far: 120 }}
      onPointerMissed={() => onSelect(null)}
    >
      <SceneCameraLock />
      <color attach="background" args={[ambientPreset.background]} />
      <ambientLight intensity={ambientPreset.ambientIntensity} color={ambientPreset.ambientColor} />
      <directionalLight position={[4.8, 7.2, 3.8]} intensity={ambientPreset.dirIntensity} color={ambientPreset.dirColor} />
      <pointLight position={[-3.8, 3.2, 2.8]} intensity={ambientPreset.fillIntensity} color={ambientPreset.fillColor} />

      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[INNER_SIZE + 0.3, FLOOR_THICKNESS, INNER_SIZE + 0.3]} />
        <meshStandardMaterial color="#45518d" roughness={0.96} metalness={0} />
      </mesh>
      <mesh position={[0, FLOOR_TOP_Y + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[INNER_SIZE, INNER_SIZE]} />
        <meshStandardMaterial map={floorTex} color="#6474c0" roughness={0.96} metalness={0} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT / 2 + FLOOR_TOP_Y, -INNER_SIZE / 2 - WALL_THICKNESS / 2]}>
        <boxGeometry args={[INNER_SIZE + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial map={wallTex} color="#dccfc4" roughness={0.97} metalness={0} />
      </mesh>
      <mesh position={[-INNER_SIZE / 2 - WALL_THICKNESS / 2, WALL_HEIGHT / 2 + FLOOR_TOP_Y, LEFT_WALL_CENTER_Z]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, LEFT_WALL_DEPTH]} />
        <meshStandardMaterial map={wallTex} color="#d3c4b8" roughness={0.97} metalness={0} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT + FLOOR_TOP_Y + 0.05, -INNER_SIZE / 2 - WALL_THICKNESS / 2]}>
        <boxGeometry args={[INNER_SIZE + WALL_THICKNESS * 2.1, 0.1, WALL_THICKNESS + 0.04]} />
        <meshStandardMaterial color="#bca28d" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[-INNER_SIZE / 2 - WALL_THICKNESS / 2, WALL_HEIGHT + FLOOR_TOP_Y + 0.05, LEFT_WALL_CENTER_Z]}>
        <boxGeometry args={[WALL_THICKNESS + 0.04, 0.1, LEFT_WALL_DEPTH]} />
        <meshStandardMaterial color="#bca28d" roughness={0.9} metalness={0} />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_TOP_Y + 0.02, 0]}
        onPointerMove={handlePointerPlaneMove}
        onPointerUp={stopDrag}
        onPointerDown={() => {
          if (!draggingId) onSelect(null);
        }}
      >
        <planeGeometry args={[INNER_SIZE + 0.9, INNER_SIZE + 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {allEntries.map(({ id, meta, gx, gy, rotationDeg, starter }) => (
        <PropActor
          key={id}
          id={id}
          item={meta}
          gx={gx}
          gy={gy}
          rotationDeg={rotationDeg}
          selected={!starter && selectedId === id}
          dragging={draggingId === id}
          dimmed={starter}
          interactive={!starter}
          onPointerDown={handleItemPointerDown}
          onSelect={onSelect}
        />
      ))}

      <ContactShadows
        position={[0, FLOOR_TOP_Y + 0.005, 0]}
        opacity={0.18}
        scale={INNER_SIZE + 0.3}
        blur={2.5}
        far={7.8}
        color="#4a3961"
      />
    </Canvas>
  );
};

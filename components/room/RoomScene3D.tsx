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

const HEART_COLORS = ['#fb7185', '#ec4899', '#f472b6', '#fbcfe8'];

const HeartBurst: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      id: i,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        0.1 + Math.random() * 0.15,
        (Math.random() - 0.5) * 0.1
      ),
      color: HEART_COLORS[i % HEART_COLORS.length],
      scale: 0.1 + Math.random() * 0.15,
      delay: Math.random() * 0.2
    }));
  }, []);

  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const p = particles[i];
      if (state.clock.elapsedTime > p.delay) {
        child.position.add(p.velocity.clone().multiplyScalar(delta * 2));
        child.scale.multiplyScalar(0.96);
        child.rotation.z += delta * 2;
      }
    });
  });

  return (
    <group ref={group} position={position}>
      {particles.map((p) => (
        <mesh key={p.id} position={[0, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={p.color} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
};

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
  const scale = 3;
  const units = 48;
  const canvas = document.createElement('canvas');
  canvas.width = units * scale;
  canvas.height = units * scale;
  const ctx = canvas.getContext('2d')!;
  const base = color;
  const light = shade(color, 36);
  const dark = shade(color, -26);
  const ink = OUTLINE;
  const silver = '#d8dfee';
  const warmWood = '#8a603f';
  const paleWood = '#b68462';
  const softPink = '#f7d5e5';
  const cream = '#f7f0e6';
  const night = '#232742';
  const glass = '#bfe3ff';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = (x: number, y: number, w: number, h: number, fill: string) => fillPx(ctx, x, y, w, h, fill, scale);

  const outlineRect = (x: number, y: number, w: number, h: number, fill: string) => {
    px(x, y, w, h, ink);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };

  const outlineRound = (x: number, y: number, w: number, h: number, fill: string) => {
    px(x + 1, y, w - 2, 1, ink);
    px(x, y + 1, 1, h - 2, ink);
    px(x + w - 1, y + 1, 1, h - 2, ink);
    px(x + 1, y + h - 1, w - 2, 1, ink);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };

  const floorShadow = (x: number, y: number, w: number, h: number) => {
    px(x, y, w, h, '#564164');
    px(x + 2, y - 1, Math.max(1, w - 4), 1, '#786082');
  };

  const leg = (x: number, y: number, h: number) => {
    px(x, y, 2, h, warmWood);
    px(x + 1, y, 1, h, '#63432f');
  };

  floorShadow(8, 38, 28, 4);

  switch (kind) {
    case 'desk':
      floorShadow(6, 39, 30, 4);
      px(8, 22, 24, 3, light);
      px(10, 25, 20, 8, base);
      px(12, 27, 16, 4, shade(base, -10));
      leg(10, 33, 8);
      leg(28, 33, 8);
      outlineRect(22, 12, 14, 9, night);
      px(24, 14, 10, 5, '#85d8ff');
      outlineRect(11, 16, 9, 7, '#4e5a74');
      px(13, 18, 5, 3, '#79dc8d');
      outlineRect(4, 26, 5, 8, '#d57d57');
      px(5, 27, 3, 2, '#f3c19a');
      break;
    case 'tv':
      floorShadow(6, 38, 30, 4);
      outlineRect(8, 29, 26, 7, '#6a6f8f');
      outlineRect(9, 12, 24, 15, night);
      px(12, 15, 18, 9, glass);
      px(13, 16, 16, 2, '#e7fbff');
      px(18, 36, 6, 3, '#535875');
      leg(11, 35, 6);
      leg(31, 35, 6);
      break;
    case 'bookshelf':
      floorShadow(10, 38, 20, 4);
      outlineRect(14, 8, 18, 31, warmWood);
      px(16, 15, 14, 2, '#65412d');
      px(16, 23, 14, 2, '#65412d');
      px(16, 31, 14, 2, '#65412d');
      px(17, 11, 3, 4, '#ffb84d');
      px(21, 10, 3, 5, '#77a5ff');
      px(25, 12, 3, 3, '#8be38e');
      px(18, 18, 4, 4, '#d77c65');
      px(23, 19, 5, 3, '#d3b363');
      px(18, 27, 10, 3, '#c6a4ff');
      break;
    case 'fridge':
      floorShadow(11, 38, 18, 4);
      outlineRect(16, 9, 16, 30, silver);
      px(18, 11, 12, 12, shade(silver, 10));
      px(18, 24, 12, 13, shade(silver, -6));
      px(27, 15, 1, 5, '#7aa7e3');
      px(27, 28, 1, 6, '#7aa7e3');
      px(18, 23, 12, 1, '#bac3d8');
      break;
    case 'couch':
      floorShadow(6, 39, 31, 4);
      outlineRound(8, 23, 30, 10, base);
      outlineRound(9, 15, 12, 10, light);
      outlineRound(22, 15, 13, 10, light);
      px(11, 26, 9, 3, shade(base, -8));
      px(24, 26, 9, 3, shade(base, -8));
      leg(12, 33, 7);
      leg(31, 33, 7);
      break;
    case 'bed':
      floorShadow(5, 39, 34, 4);
      px(8, 21, 28, 4, '#9a6681');
      px(8, 25, 28, 11, base);
      px(11, 27, 22, 6, shade(base, -10));
      outlineRound(10, 13, 11, 8, softPink);
      outlineRound(21, 13, 11, 8, '#f2bfd9');
      px(34, 18, 4, 12, '#7a5662');
      leg(10, 36, 6);
      leg(33, 36, 6);
      break;
    case 'chair':
      floorShadow(11, 39, 18, 4);
      outlineRect(16, 14, 14, 10, dark);
      outlineRect(14, 24, 18, 7, base);
      leg(17, 31, 9);
      leg(27, 31, 9);
      px(18, 17, 10, 4, shade(dark, 14));
      break;
    case 'beanbag':
      floorShadow(10, 39, 22, 4);
      outlineRound(11, 22, 22, 12, base);
      px(15, 24, 14, 5, light);
      break;
    case 'table':
      floorShadow(12, 39, 18, 4);
      px(13, 22, 16, 3, paleWood);
      px(14, 25, 14, 3, light);
      px(20, 28, 2, 10, warmWood);
      px(16, 38, 10, 2, '#7e5c44');
      break;
    case 'lamp':
      floorShadow(14, 39, 12, 3);
      px(23, 11, 2, 24, '#878fa7');
      outlineRound(17, 8, 14, 8, light);
      px(15, 35, 18, 2, '#5e6781');
      break;
    case 'lantern':
      floorShadow(14, 39, 14, 3);
      px(23, 8, 2, 4, '#878fa7');
      outlineRect(17, 12, 14, 16, light);
      px(19, 14, 10, 10, base);
      px(21, 16, 6, 4, '#ffe8a6');
      break;
    case 'candles':
      floorShadow(12, 39, 18, 3);
      outlineRect(14, 24, 5, 10, '#f9f1db');
      outlineRect(21, 20, 5, 14, '#fff5db');
      outlineRect(28, 25, 5, 9, '#f9f1db');
      px(15, 22, 2, 2, '#ffcb63');
      px(22, 18, 2, 2, '#ffcb63');
      px(29, 23, 2, 2, '#ffcb63');
      break;
    case 'disco':
      px(23, 4, 2, 5, '#8790ac');
      outlineRect(17, 9, 14, 14, silver);
      px(18, 10, 3, 3, '#93b8ff');
      px(23, 12, 2, 2, '#ffd0f5');
      px(27, 16, 2, 2, '#ffe27a');
      px(19, 18, 2, 2, '#b2ffd8');
      break;
    case 'lights':
      px(4, 11, 40, 1, ink);
      [8, 14, 20, 26, 32, 38].forEach((x, idx) => {
        px(x, 12, 1, 3, idx % 2 === 0 ? '#ffe580' : '#f6a8ff');
        px(x - 1, 15, 3, 2, idx % 3 === 0 ? '#8ee1ff' : '#ffe7a8');
      });
      break;
    case 'balloon':
      outlineRound(10, 12, 10, 11, light);
      outlineRound(22, 9, 10, 11, '#ffc0d0');
      outlineRound(16, 17, 12, 12, base);
      px(18, 29, 1, 11, ink);
      px(26, 25, 1, 15, ink);
      px(22, 30, 1, 10, ink);
      break;
    case 'plant':
    case 'bonsai':
    case 'flower':
    case 'sunflower':
    case 'cactus':
      floorShadow(14, 39, 18, 4);
      outlineRect(17, 28, 14, 9, '#8b623d');
      if (kind === 'cactus') {
        outlineRect(20, 12, 8, 16, color);
        outlineRect(16, 16, 4, 8, color);
        outlineRect(28, 17, 4, 8, color);
      } else if (kind === 'bonsai') {
        px(23, 16, 3, 13, '#7a4c36');
        outlineRound(16, 12, 10, 8, '#8ed55f');
        outlineRound(23, 9, 11, 10, '#7dc84f');
      } else if (kind === 'sunflower') {
        px(23, 14, 2, 14, '#5f8f41');
        outlineRound(16, 7, 15, 10, '#ffcf4d');
        px(21, 10, 6, 4, '#8e582b');
      } else if (kind === 'flower') {
        px(23, 15, 2, 14, '#5f8f41');
        outlineRound(16, 10, 14, 8, '#ff9bcc');
        px(21, 13, 6, 3, '#ffd77c');
      } else {
        outlineRound(16, 11, 16, 15, color);
      }
      break;
    case 'frame':
      outlineRect(13, 9, 22, 24, '#6e4d3a');
      px(16, 12, 16, 18, '#f5efe3');
      px(18, 14, 6, 6, color);
      px(24, 20, 6, 6, shade(color, -18));
      break;
    case 'neon':
      outlineRect(10, 12, 28, 16, '#262241');
      px(15, 17, 6, 2, light);
      px(22, 17, 2, 8, light);
      px(26, 17, 6, 2, light);
      px(26, 23, 6, 2, light);
      px(13, 15, 20, 1, '#ffffff');
      break;
    case 'projector':
      floorShadow(12, 39, 18, 3);
      outlineRect(16, 25, 12, 9, '#363d56');
      px(20, 28, 4, 3, '#90d7ff');
      px(28, 26, 10, 5, shade(color, 25));
      break;
    case 'window':
      outlineRect(12, 8, 24, 26, '#a86f54');
      px(15, 11, 18, 20, glass);
      px(23, 11, 2, 20, '#f0f5ff');
      px(15, 20, 18, 2, '#f0f5ff');
      px(17, 13, 14, 4, '#ffffff');
      break;
    case 'portal':
      outlineRect(15, 6, 18, 31, '#4a3b65');
      px(18, 9, 12, 25, '#8d66ff');
      px(20, 12, 8, 18, '#b7a7ff');
      break;
    case 'aquarium':
      floorShadow(7, 39, 32, 4);
      outlineRect(8, 18, 28, 14, '#8f98af');
      px(11, 21, 22, 8, '#79d7ff');
      px(15, 25, 5, 2, '#ffbf52');
      px(25, 24, 4, 2, '#72d07a');
      leg(12, 32, 8);
      leg(30, 32, 8);
      break;
    case 'fireplace':
      floorShadow(6, 39, 30, 4);
      outlineRect(8, 18, 28, 17, '#a16242');
      px(15, 23, 14, 8, '#2b2235');
      px(18, 24, 8, 5, '#ff9548');
      px(17, 20, 10, 2, '#c98f5c');
      break;
    case 'record':
      floorShadow(13, 39, 20, 4);
      outlineRect(16, 23, 16, 11, '#434d71');
      px(19, 26, 8, 5, '#1c2032');
      px(27, 27, 4, 2, '#f7b455');
      px(18, 21, 12, 2, '#7d86b2');
      break;
    case 'books':
      floorShadow(13, 39, 18, 3);
      outlineRect(13, 29, 16, 5, '#6aa4ff');
      outlineRect(16, 24, 14, 5, '#ff8c6f');
      outlineRect(19, 19, 12, 5, '#7bd08c');
      break;
    case 'mug':
      floorShadow(16, 39, 12, 3);
      outlineRect(18, 24, 11, 12, color);
      px(29, 27, 4, 6, cream);
      px(20, 26, 7, 2, shade(color, 18));
      break;
    case 'pillows':
      floorShadow(10, 39, 24, 4);
      outlineRound(10, 24, 13, 10, base);
      outlineRound(22, 21, 14, 12, '#a798ff');
      break;
    case 'blanket':
      floorShadow(8, 39, 28, 4);
      outlineRect(8, 23, 28, 11, color);
      px(11, 26, 22, 4, shade(color, 18));
      px(10, 33, 24, 1, '#dbc7ff');
      break;
    case 'robot':
      floorShadow(14, 39, 18, 4);
      outlineRect(18, 14, 14, 16, silver);
      px(21, 18, 3, 3, '#5a6887');
      px(26, 18, 3, 3, '#5a6887');
      px(22, 24, 6, 3, '#6dd0ff');
      px(22, 10, 6, 2, '#5d6a86');
      leg(20, 30, 10);
      leg(28, 30, 10);
      break;
    default:
      floorShadow(12, 39, 24, 4);
      outlineRect(14, 18, 20, 16, base);
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
    // Premium soft scale spring
    const scaleTarget = dragging ? s * 1.1 : selected ? s * 1.05 : s;
    groupRef.current.scale.x = THREE.MathUtils.lerp(groupRef.current.scale.x, scaleTarget, 0.12);
    groupRef.current.scale.y = THREE.MathUtils.lerp(groupRef.current.scale.y, scaleTarget, 0.12);
    groupRef.current.scale.z = THREE.MathUtils.lerp(groupRef.current.scale.z, scaleTarget, 0.12);

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
  const [bursts, setBursts] = useState<{ id: string; pos: [number, number, number] }[]>([]);

  const triggerBurst = useCallback((pos: [number, number, number]) => {
    const id = Math.random().toString(36);
    setBursts(prev => [...prev.slice(-3), { id, pos }]);
    setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), 1200);
  }, []);

  const handleSelectWithEffect = (id: string | null) => {
    onSelect(id);
    if (id) {
       const entry = room.placedItems.find(it => it.uid === id);
       if (entry) {
         const [x, , z] = gridToWorld(percentToGrid(entry).gx, percentToGrid(entry).gy);
         triggerBurst([x, 1, z]);
       }
    }
  };

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
        background: '#eef4fb',
        ambientColor: '#f3f8ff',
        ambientIntensity: 1.24,
        dirColor: '#dcebff',
        dirIntensity: 1.12,
        fillColor: '#b7d8ff',
        fillIntensity: 0.56,
      };
    }
    if (room.ambient === 'rainbow') {
      return {
        background: '#f7edf7',
        ambientColor: '#fff6fd',
        ambientIntensity: 1.24,
        dirColor: '#ffe6bc',
        dirIntensity: 1.12,
        fillColor: '#c5ffe0',
        fillIntensity: 0.56,
      };
    }
    return {
      background: '#f7ede7',
      ambientColor: '#fff6ee',
      ambientIntensity: 1.22,
      dirColor: '#ffe9c7',
      dirIntensity: 1.1,
      fillColor: '#ffe2c4',
      fillIntensity: 0.54,
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
        <meshStandardMaterial color="#6f79a8" roughness={0.96} metalness={0} />
      </mesh>
      <mesh position={[0, FLOOR_TOP_Y + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[INNER_SIZE, INNER_SIZE]} />
        <meshStandardMaterial map={floorTex} color="#7482cc" roughness={0.96} metalness={0} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT / 2 + FLOOR_TOP_Y, -INNER_SIZE / 2 - WALL_THICKNESS / 2]}>
        <boxGeometry args={[INNER_SIZE + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial map={wallTex} color="#e6d9ce" roughness={0.97} metalness={0} />
      </mesh>
      <mesh position={[-INNER_SIZE / 2 - WALL_THICKNESS / 2, WALL_HEIGHT / 2 + FLOOR_TOP_Y, LEFT_WALL_CENTER_Z]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, LEFT_WALL_DEPTH]} />
        <meshStandardMaterial map={wallTex} color="#ddd0c6" roughness={0.97} metalness={0} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT + FLOOR_TOP_Y + 0.05, -INNER_SIZE / 2 - WALL_THICKNESS / 2]}>
        <boxGeometry args={[INNER_SIZE + WALL_THICKNESS * 2.1, 0.1, WALL_THICKNESS + 0.04]} />
        <meshStandardMaterial color="#d2b9a6" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[-INNER_SIZE / 2 - WALL_THICKNESS / 2, WALL_HEIGHT + FLOOR_TOP_Y + 0.05, LEFT_WALL_CENTER_Z]}>
        <boxGeometry args={[WALL_THICKNESS + 0.04, 0.1, LEFT_WALL_DEPTH]} />
        <meshStandardMaterial color="#d2b9a6" roughness={0.9} metalness={0} />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_TOP_Y + 0.02, 0]}
        onPointerMove={handlePointerPlaneMove}
        onPointerUp={stopDrag}
        onPointerDown={() => {
          if (!draggingId) handleSelectWithEffect(null);
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
          onSelect={handleSelectWithEffect}
        />
      ))}

      {bursts.map(b => (
        <HeartBurst key={b.id} position={b.pos} />
      ))}

      <ContactShadows
        position={[0, FLOOR_TOP_Y + 0.005, 0]}
        opacity={0.12}
        scale={INNER_SIZE + 0.3}
        blur={2.5}
        far={7.8}
        color="#6b5878"
      />
    </Canvas>
  );
};

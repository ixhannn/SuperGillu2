import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Coins, Plus, RotateCw, Share2, ShoppingBag, Trash2, Wand2, X } from 'lucide-react';
import { RoomPlacedItem, RoomState, ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';

interface OurRoomProps { setView: (v: ViewState) => void; }

type Category = 'furniture' | 'decor' | 'plants' | 'lighting' | 'cozy' | 'special';
type Rarity = 'common' | 'rare' | 'legendary';
type IconKind =
  | 'bed' | 'chair' | 'beanbag' | 'bookshelf' | 'desk' | 'couch' | 'table' | 'tv'
  | 'lights' | 'balloon' | 'frame' | 'neon' | 'cactus' | 'lamp' | 'disco' | 'projector'
  | 'plant' | 'bonsai' | 'flower' | 'sunflower' | 'lantern' | 'candles' | 'pillows'
  | 'blanket' | 'mug' | 'books' | 'record' | 'fridge' | 'aquarium' | 'fireplace'
  | 'window' | 'portal' | 'robot';

interface CatalogItem {
  id: string;
  name: string;
  kind: IconKind;
  category: Category;
  cost: number;
  rarity: Rarity;
  color: string;
  idle: 'none' | 'sway' | 'twinkle' | 'flicker' | 'spin' | 'bounce' | 'swim';
  width?: number;
  height?: number;
  anchor?: 'floor' | 'wall';
}

interface CoinParticle {
  id: string;
  x: number;
  y: number;
  vy: number;
  vx: number;
  rot: number;
  vr: number;
  life: number;
}

interface DustParticle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const OUTLINE = '#2a2345';
const RARITY_COLOR: Record<Rarity, string> = {
  common: '#58d68d',
  rare: '#5dade2',
  legendary: '#f5b041',
};

const CAT_LABEL: Record<Category, string> = {
  furniture: 'Furniture',
  decor: 'Decor',
  plants: 'Plants',
  lighting: 'Lighting',
  cozy: 'Cozy',
  special: 'Special',
};

const WALLPAPER_ORDER: RoomState['wallpaper'][] = ['plain', 'stripes', 'polka', 'hearts', 'stars', 'wood'];
const FLOOR_ORDER: RoomState['floor'][] = ['hardwood', 'carpet', 'tiles', 'cloud', 'grass', 'marble'];

const ITEM_FRAME_BY_KIND: Record<IconKind, { w: number; h: number; anchor: 'floor' | 'wall' }> = {
  bed: { w: 112, h: 90, anchor: 'floor' },
  chair: { w: 74, h: 92, anchor: 'floor' },
  beanbag: { w: 88, h: 76, anchor: 'floor' },
  bookshelf: { w: 82, h: 118, anchor: 'floor' },
  desk: { w: 120, h: 88, anchor: 'floor' },
  couch: { w: 126, h: 86, anchor: 'floor' },
  table: { w: 88, h: 68, anchor: 'floor' },
  tv: { w: 108, h: 86, anchor: 'floor' },
  lights: { w: 110, h: 66, anchor: 'wall' },
  balloon: { w: 82, h: 98, anchor: 'floor' },
  frame: { w: 82, h: 86, anchor: 'wall' },
  neon: { w: 108, h: 64, anchor: 'wall' },
  cactus: { w: 82, h: 82, anchor: 'floor' },
  lamp: { w: 70, h: 120, anchor: 'floor' },
  disco: { w: 78, h: 80, anchor: 'wall' },
  projector: { w: 90, h: 72, anchor: 'floor' },
  plant: { w: 76, h: 92, anchor: 'floor' },
  bonsai: { w: 84, h: 86, anchor: 'floor' },
  flower: { w: 74, h: 82, anchor: 'floor' },
  sunflower: { w: 74, h: 94, anchor: 'floor' },
  lantern: { w: 66, h: 90, anchor: 'wall' },
  candles: { w: 78, h: 84, anchor: 'floor' },
  pillows: { w: 92, h: 66, anchor: 'floor' },
  blanket: { w: 96, h: 62, anchor: 'floor' },
  mug: { w: 62, h: 72, anchor: 'floor' },
  books: { w: 74, h: 66, anchor: 'floor' },
  record: { w: 92, h: 78, anchor: 'floor' },
  fridge: { w: 74, h: 96, anchor: 'floor' },
  aquarium: { w: 124, h: 90, anchor: 'floor' },
  fireplace: { w: 124, h: 102, anchor: 'wall' },
  window: { w: 90, h: 110, anchor: 'wall' },
  portal: { w: 84, h: 122, anchor: 'wall' },
  robot: { w: 76, h: 92, anchor: 'floor' },
};

const DEFAULT_STATE: RoomState = {
  placedItems: [],
  coins: 500,
  roomName: 'P1 Room',
  wallpaper: 'plain',
  floor: 'carpet',
  ambient: 'warm',
};

const SHOP: CatalogItem[] = [
  { id: 'double_bed', name: 'Heart Double Bed', kind: 'bed', category: 'furniture', cost: 180, rarity: 'rare', color: '#ff6fa8', idle: 'none' },
  { id: 'gaming_chair', name: 'Gaming Chair', kind: 'chair', category: 'furniture', cost: 130, rarity: 'common', color: '#ef4444', idle: 'bounce' },
  { id: 'bean_bag', name: 'Lavender Bean Bag', kind: 'beanbag', category: 'furniture', cost: 95, rarity: 'common', color: '#b38cff', idle: 'bounce' },
  { id: 'bookshelf_overflow', name: 'Overflow Bookshelf', kind: 'bookshelf', category: 'furniture', cost: 140, rarity: 'rare', color: '#f59e0b', idle: 'none' },
  { id: 'l_desk', name: 'L-Shaped Desk', kind: 'desk', category: 'furniture', cost: 145, rarity: 'common', color: '#f97316', idle: 'none' },
  { id: 'fluffy_couch', name: 'Fluffy Couch', kind: 'couch', category: 'furniture', cost: 160, rarity: 'rare', color: '#fb7185', idle: 'none' },
  { id: 'coffee_table_round', name: 'Round Coffee Table', kind: 'table', category: 'furniture', cost: 88, rarity: 'common', color: '#c084fc', idle: 'none' },
  { id: 'tv_stand_screen', name: 'TV Stand + Screen', kind: 'tv', category: 'furniture', cost: 175, rarity: 'rare', color: '#60a5fa', idle: 'twinkle' },

  { id: 'string_lights', name: 'String Lights', kind: 'lights', category: 'decor', cost: 105, rarity: 'rare', color: '#fde047', idle: 'twinkle' },
  { id: 'heart_balloons', name: 'Heart Balloons', kind: 'balloon', category: 'decor', cost: 90, rarity: 'common', color: '#fb7185', idle: 'sway' },
  { id: 'photo_frames', name: 'Couple Photo Frames', kind: 'frame', category: 'decor', cost: 80, rarity: 'common', color: '#93c5fd', idle: 'none' },
  { id: 'polaroid_wall', name: 'Polaroid Wall', kind: 'frame', category: 'decor', cost: 112, rarity: 'rare', color: '#f9a8d4', idle: 'none' },
  { id: 'neon_us', name: 'Neon us ♡', kind: 'neon', category: 'decor', cost: 170, rarity: 'legendary', color: '#a78bfa', idle: 'twinkle' },
  { id: 'cactus_gang', name: 'Cactus Gang', kind: 'cactus', category: 'decor', cost: 70, rarity: 'common', color: '#34d399', idle: 'sway' },
  { id: 'lava_lamp', name: 'Lava Lamp', kind: 'lamp', category: 'decor', cost: 96, rarity: 'rare', color: '#fb923c', idle: 'flicker' },
  { id: 'disco_ball', name: 'Disco Ball', kind: 'disco', category: 'decor', cost: 150, rarity: 'legendary', color: '#60a5fa', idle: 'spin' },
  { id: 'star_projector', name: 'Starry Projector', kind: 'projector', category: 'decor', cost: 148, rarity: 'legendary', color: '#a5b4fc', idle: 'twinkle' },

  { id: 'succulent_set', name: 'Succulent Set', kind: 'plant', category: 'plants', cost: 60, rarity: 'common', color: '#22c55e', idle: 'sway' },
  { id: 'hanging_pothos', name: 'Hanging Pothos', kind: 'plant', category: 'plants', cost: 92, rarity: 'rare', color: '#16a34a', idle: 'sway' },
  { id: 'bonsai_tree', name: 'Bonsai Tree', kind: 'bonsai', category: 'plants', cost: 130, rarity: 'rare', color: '#84cc16', idle: 'sway' },
  { id: 'flower_bouquet', name: 'Flower Bouquet', kind: 'flower', category: 'plants', cost: 72, rarity: 'common', color: '#f472b6', idle: 'sway' },
  { id: 'sunflower_pot', name: 'Sunflower Pot', kind: 'sunflower', category: 'plants', cost: 84, rarity: 'common', color: '#f59e0b', idle: 'sway' },

  { id: 'floor_lamp', name: 'Floor Lamp', kind: 'lamp', category: 'lighting', cost: 115, rarity: 'common', color: '#fbbf24', idle: 'flicker' },
  { id: 'fairy_curtain', name: 'Fairy Light Curtain', kind: 'lights', category: 'lighting', cost: 138, rarity: 'rare', color: '#fef08a', idle: 'twinkle' },
  { id: 'paper_lantern', name: 'Paper Lantern', kind: 'lantern', category: 'lighting', cost: 104, rarity: 'common', color: '#fdba74', idle: 'sway' },
  { id: 'candle_cluster', name: 'Candle Cluster', kind: 'candles', category: 'lighting', cost: 88, rarity: 'common', color: '#fde68a', idle: 'flicker' },

  { id: 'pillows', name: 'Pile of Pillows', kind: 'pillows', category: 'cozy', cost: 80, rarity: 'common', color: '#c4b5fd', idle: 'bounce' },
  { id: 'throw_blanket', name: 'Throw Blanket', kind: 'blanket', category: 'cozy', cost: 72, rarity: 'common', color: '#93c5fd', idle: 'none' },
  { id: 'mug_coaster', name: 'Mug on Coaster', kind: 'mug', category: 'cozy', cost: 54, rarity: 'common', color: '#fb923c', idle: 'none' },
  { id: 'book_stack', name: 'Stack of Books', kind: 'books', category: 'cozy', cost: 68, rarity: 'common', color: '#fca5a5', idle: 'none' },
  { id: 'record_player', name: 'Record Player', kind: 'record', category: 'cozy', cost: 122, rarity: 'rare', color: '#818cf8', idle: 'spin' },
  { id: 'mini_fridge', name: 'Mini Fridge', kind: 'fridge', category: 'cozy', cost: 118, rarity: 'rare', color: '#60a5fa', idle: 'none' },

  { id: 'tiny_aquarium', name: 'Tiny Aquarium', kind: 'aquarium', category: 'special', cost: 190, rarity: 'legendary', color: '#22d3ee', idle: 'swim' },
  { id: 'fireplace', name: 'Fireplace', kind: 'fireplace', category: 'special', cost: 210, rarity: 'legendary', color: '#f97316', idle: 'flicker' },
  { id: 'starry_window', name: 'Starry Sky Window', kind: 'window', category: 'special', cost: 165, rarity: 'legendary', color: '#93c5fd', idle: 'twinkle' },
  { id: 'portal_door', name: 'Portal Door', kind: 'portal', category: 'special', cost: 240, rarity: 'legendary', color: '#a78bfa', idle: 'spin' },
  { id: 'cute_robot', name: 'Cute Robot Buddy', kind: 'robot', category: 'special', cost: 175, rarity: 'legendary', color: '#94a3b8', idle: 'bounce' },
];

const shopById = Object.fromEntries(SHOP.map((s) => [s.id, s])) as Record<string, CatalogItem>;

const ambientOverlay = (ambient: RoomState['ambient']) => {
  if (ambient === 'cool') return 'linear-gradient(180deg, rgba(56,189,248,.18), rgba(99,102,241,.14))';
  if (ambient === 'rainbow') return 'linear-gradient(120deg, rgba(244,114,182,.18), rgba(251,191,36,.14), rgba(34,197,94,.16), rgba(59,130,246,.14))';
  return 'linear-gradient(180deg, rgba(251,146,60,.18), rgba(251,113,133,.12))';
};

/** Orthographic 30/30 isometric corner: no perspective convergence. */
const ROOM_VB = { w: 100, h: 118 };
const ROOM = {
  cornerTop: [50, 9] as const,
  cornerBase: [50, 36] as const,
  leftTop: [16, 28.2] as const,
  rightTop: [84, 28.2] as const,
  leftFloor: [16, 55.6] as const,
  rightFloor: [84, 55.6] as const,
  floorFront: [50, 75.2] as const,
};
const poly = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');
const POLY = {
  leftWall: poly([ROOM.cornerTop, ROOM.leftTop, ROOM.leftFloor, ROOM.cornerBase]),
  rightWall: poly([ROOM.cornerTop, ROOM.cornerBase, ROOM.rightFloor, ROOM.rightTop]),
  floor: poly([ROOM.cornerBase, ROOM.rightFloor, ROOM.floorFront, ROOM.leftFloor]),
};

function RoomCornerScene({ wallpaper, floor }: { wallpaper: RoomState['wallpaper']; floor: RoomState['floor'] }) {
  const wid = `orc-w-${wallpaper}`;
  const fid = `orc-fl-${floor}`;
  const clipFloor = 'orc-clip-floor';

  const wallPatternDef = () => {
    switch (wallpaper) {
      case 'stripes':
        return (
          <pattern id={wid} patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="6" height="6" fill="#8b5a3c" />
            <rect width="3" height="6" fill="#7a4e35" opacity="0.55" />
          </pattern>
        );
      case 'polka':
        return (
          <pattern id={wid} patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="#9a6548" />
            <circle cx="4" cy="4" r="1.1" fill="rgba(255,255,255,0.2)" />
          </pattern>
        );
      case 'hearts':
        return (
          <pattern id={wid} patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#a06a52" />
            <path d="M5 8.2C5 8.2 2.5 6.2 2.5 4.2C2.5 3 3.4 2.2 4.5 2.5C5 2.7 5 3 5 3.2C5 3 5.2 2.6 5.8 2.5C7 2.2 7.8 3.2 7.8 4.2C7.8 6.2 5 8.2 5 8.2Z" fill="rgba(255,180,200,0.35)" />
          </pattern>
        );
      case 'stars':
        return (
          <pattern id={wid} patternUnits="userSpaceOnUse" width="12" height="12">
            <rect width="12" height="12" fill="#8f5c45" />
            <polygon points="6,1 7,4.5 10.5,4.5 7.8,6.8 9,10 6,8 3,10 4.2,6.8 1.5,4.5 5,4.5" fill="rgba(255,255,255,0.18)" />
          </pattern>
        );
      case 'wood':
        return (
          <pattern id={wid} patternUnits="userSpaceOnUse" width="5" height="120">
            <rect width="5" height="120" fill="#6d4a32" />
            <line x1="5" y1="0" x2="5" y2="120" stroke="#4a3020" strokeWidth="0.35" />
          </pattern>
        );
      default:
        return (
          <linearGradient id={wid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a06f52" />
            <stop offset="100%" stopColor="#7a4e38" />
          </linearGradient>
        );
    }
  };

  const floorPatternDef = () => {
    switch (floor) {
      case 'hardwood':
        return (
          <pattern id={fid} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(12)">
            <rect width="8" height="8" fill="#5c4030" />
            <rect width="4" height="8" fill="#6d4a36" opacity="0.7" />
          </pattern>
        );
      case 'tiles':
        return (
          <pattern id={fid} patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#4a5a8a" />
            <path d="M0 0H10V10H0Z" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          </pattern>
        );
      case 'cloud':
        return (
          <radialGradient id={fid} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#e8e4ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7b6fa8" />
          </radialGradient>
        );
      case 'grass':
        return (
          <pattern id={fid} patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="6" height="6" fill="#4a9f4a" />
            <line x1="2" y1="6" x2="2" y2="2" stroke="#2d6b2d" strokeWidth="0.8" />
            <line x1="4.5" y1="6" x2="4.5" y2="1.5" stroke="#2d6b2d" strokeWidth="0.8" />
          </pattern>
        );
      case 'marble':
        return (
          <pattern id={fid} patternUnits="userSpaceOnUse" width="14" height="14">
            <rect width="14" height="14" fill="#dcd8ee" />
            <path d="M0 7Q7 3 14 7Q7 11 0 7" fill="none" stroke="rgba(120,110,160,0.2)" strokeWidth="0.4" />
          </pattern>
        );
      default:
        return (
          <linearGradient id={fid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2e4578" />
            <stop offset="100%" stopColor="#1e2f55" />
          </linearGradient>
        );
    }
  };

  const wallFill = `url(#${wid})`;
  const floorFill = `url(#${fid})`;
  const strokeCol = '#1a1228';

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${ROOM_VB.w} ${ROOM_VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        {wallpaper === 'plain' ? (
          <linearGradient id={wid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a77456" />
            <stop offset="100%" stopColor="#7d523c" />
          </linearGradient>
        ) : (
          wallPatternDef()
        )}
        {floorPatternDef()}
        <linearGradient id="orc-left-shade" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="orc-right-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id="orc-floor-depth" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#000" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
        <clipPath id={clipFloor}>
          <polygon points={POLY.floor} />
        </clipPath>
      </defs>

      {/* Floor plane */}
      <polygon points={POLY.floor} fill={floorFill} stroke={strokeCol} strokeWidth="0.5" strokeLinejoin="miter" />
      <polygon points={POLY.floor} fill="url(#orc-floor-depth)" stroke="none" />

      {/* Uniform orthographic isometric tile grid */}
      <g clipPath={`url(#${clipFloor})`} opacity="0.35">
        {Array.from({ length: ISO_GRID_DIV + 1 }, (_, i) => {
          const t = i / ISO_GRID_DIV;
          const p1 = isoToScreen(t, 0);
          const p2 = isoToScreen(t, 1);
          return <line key={`u-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.16)" strokeWidth="0.14" />;
        })}
        {Array.from({ length: ISO_GRID_DIV + 1 }, (_, i) => {
          const t = i / ISO_GRID_DIV;
          const p1 = isoToScreen(0, t);
          const p2 = isoToScreen(1, t);
          return <line key={`v-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.14)" strokeWidth="0.12" />;
        })}
      </g>

      {/* Two-wall corner box */}
      <polygon points={POLY.leftWall} fill={wallFill} stroke={strokeCol} strokeWidth="0.45" strokeLinejoin="miter" />
      <polygon points={POLY.leftWall} fill="url(#orc-left-shade)" stroke="none" />
      <polygon points={POLY.rightWall} fill={wallFill} stroke={strokeCol} strokeWidth="0.45" strokeLinejoin="miter" />
      <polygon points={POLY.rightWall} fill="url(#orc-right-shade)" stroke="none" />
      <line x1={ROOM.cornerTop[0]} y1={ROOM.cornerTop[1]} x2={ROOM.cornerBase[0]} y2={ROOM.cornerBase[1]} stroke="#271528" strokeWidth="1.1" />

      {/* Window (left wall) */}
      <polygon points={poly([[23, 23], [30, 27], [30, 38], [23, 34]])} fill="#b8e8ff" stroke={strokeCol} strokeWidth="0.35" opacity="0.92" />
      <line x1={26.5} y1={25} x2={26.5} y2={36.6} stroke={strokeCol} strokeWidth="0.25" opacity="0.5" />
      <line x1={23.5} y1={30.6} x2={29.6} y2={34.1} stroke={strokeCol} strokeWidth="0.25" opacity="0.5" />

      {/* Shelf hint (right wall) */}
      <polygon points={poly([[69, 25], [82, 30], [82, 31.5], [69, 26.5]])} fill="#4a3020" stroke={strokeCol} strokeWidth="0.2" />
      <polygon points={poly([[72, 39], [82, 42.8], [82, 44.1], [72, 40.3]])} fill="#4a3020" stroke={strokeCol} strokeWidth="0.2" />

      {/* Cozy static details snapped to same isometric angle system */}
      <g opacity="0.98">
        <polygon points={poly([[44.2, 46.2], [54, 51.9], [50.2, 54.1], [40.5, 48.4]])} fill="#9b5f41" stroke={strokeCol} strokeWidth="0.24" />
        <polygon points={poly([[24.2, 61], [34, 66.7], [31.2, 68.3], [21.4, 62.7]])} fill="#8fa7d9" stroke={strokeCol} strokeWidth="0.24" />
        <polygon points={poly([[66.3, 56.6], [74.8, 61.5], [72, 63.1], [63.5, 58.2]])} fill="#6d4a32" stroke={strokeCol} strokeWidth="0.24" />
        <circle cx={52} cy={56.5} r={1.2} fill="#4caf50" />
        <circle cx={54} cy={56.1} r={1} fill="#7bcf6a" />
        <rect x={60.2} y={66.2} width={1.4} height={0.95} fill="#ffd166" />
        <rect x={62.1} y={67.1} width={1.2} height={0.85} fill="#ef476f" />
      </g>
    </svg>
  );
}

const pixelShadow = {
  boxShadow: '0 6px 0 #302655, 0 10px 18px rgba(22,17,43,.28)',
  border: `3px solid ${OUTLINE}`,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ISO_GRID_DIV = 8;
const FLOOR_TOP = { x: ROOM.cornerBase[0], y: ROOM.cornerBase[1] };
const ISO_U = { x: ROOM.rightFloor[0] - FLOOR_TOP.x, y: ROOM.rightFloor[1] - FLOOR_TOP.y };
const ISO_V = { x: ROOM.leftFloor[0] - FLOOR_TOP.x, y: ROOM.leftFloor[1] - FLOOR_TOP.y };

const screenToIso = (x: number, y: number) => {
  const dx = x - FLOOR_TOP.x;
  const dy = y - FLOOR_TOP.y;
  const a = (dy / ISO_U.y + dx / ISO_U.x) / 2;
  const b = (dy / ISO_U.y - dx / ISO_U.x) / 2;
  return { a, b };
};

const isoToScreen = (a: number, b: number) => ({
  x: FLOOR_TOP.x + a * ISO_U.x + b * ISO_V.x,
  y: FLOOR_TOP.y + a * ISO_U.y + b * ISO_V.y,
});

const snapFloorPosition = (x: number, y: number) => {
  const { a, b } = screenToIso(x, y);
  const sa = clamp(Math.round(a * ISO_GRID_DIV) / ISO_GRID_DIV, 0, 1);
  const sb = clamp(Math.round(b * ISO_GRID_DIV) / ISO_GRID_DIV, 0, 1);
  return isoToScreen(sa, sb);
};

const iconSvg = (kind: IconKind, color: string, t: number) => {
  const glow = Math.sin(t / 220 + 1) * 0.5 + 0.5;
  const tw = Math.sin(t / 180) * 1.5;
  const basic = (
    <svg viewBox="0 0 64 64" className="w-full h-full">
      <rect x="8" y="18" width="48" height="34" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3" />
      <rect x="13" y="24" width="38" height="9" rx="3" fill="#fff" opacity="0.28" />
    </svg>
  );

  switch (kind) {
    case 'bed': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="8" y="30" width="48" height="20" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="12" y="22" width="16" height="12" fill="#ffe4f1" stroke={OUTLINE} strokeWidth="3"/><rect x="30" y="22" width="22" height="12" fill="#ffd2e8" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'chair': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="18" y="15" width="30" height="18" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="14" y="33" width="34" height="14" fill="#0f172a" stroke={OUTLINE} strokeWidth="3"/><rect x="16" y="47" width="6" height="10" fill="#334155" /><rect x="40" y="47" width="6" height="10" fill="#334155" /></svg>;
    case 'beanbag': return <svg viewBox="0 0 64 64" className="w-full h-full"><ellipse cx="32" cy="40" rx="22" ry="16" fill={color} stroke={OUTLINE} strokeWidth="3"/><ellipse cx="28" cy="34" rx="9" ry="4" fill="#fff" opacity=".2"/></svg>;
    case 'bookshelf': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="14" y="10" width="36" height="44" fill={color} stroke={OUTLINE} strokeWidth="3"/><line x1="14" y1="26" x2="50" y2="26" stroke={OUTLINE} strokeWidth="3"/><line x1="14" y1="40" x2="50" y2="40" stroke={OUTLINE} strokeWidth="3"/><rect x="18" y="13" width="5" height="10" fill="#60a5fa"/><rect x="25" y="13" width="6" height="10" fill="#f97316"/><rect x="33" y="13" width="8" height="10" fill="#34d399"/></svg>;
    case 'desk': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="26" width="44" height="20" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="12" y="46" width="8" height="10" fill="#7c2d12"/><rect x="44" y="46" width="8" height="10" fill="#7c2d12"/></svg>;
    case 'couch': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="30" width="44" height="16" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="12" y="22" width="18" height="10" fill="#fecdd3" stroke={OUTLINE} strokeWidth="3"/><rect x="34" y="22" width="18" height="10" fill="#fecdd3" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'table': return <svg viewBox="0 0 64 64" className="w-full h-full"><ellipse cx="32" cy="28" rx="18" ry="10" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="29" y="29" width="6" height="18" fill="#7c2d12"/><rect x="22" y="47" width="20" height="5" fill="#854d0e"/></svg>;
    case 'tv': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="11" y="14" width="42" height="26" fill="#111827" stroke={OUTLINE} strokeWidth="3"/><rect x="16" y="19" width="32" height="16" fill={color}/><rect x="24" y="40" width="16" height="8" fill="#6b7280" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'lights': return <svg viewBox="0 0 64 64" className="w-full h-full"><path d="M8 14 Q32 4 56 14" stroke={OUTLINE} strokeWidth="3" fill="none"/>{[14,24,34,44,54].map((x)=><circle key={x} cx={x} cy={19 + (x%2?3:0)} r={3.5} fill={`hsl(${(x*8+tw*4)%360} 90% 65%)`} opacity={0.5 + glow*0.5}/>)}</svg>;
    case 'balloon': return <svg viewBox="0 0 64 64" className="w-full h-full"><circle cx="24" cy="24" r="10" fill={color} stroke={OUTLINE} strokeWidth="3"/><circle cx="38" cy="20" r="9" fill="#fda4af" stroke={OUTLINE} strokeWidth="3"/><circle cx="34" cy="33" r="10" fill="#f472b6" stroke={OUTLINE} strokeWidth="3"/><path d="M24 34 L24 54 M38 29 L38 54 M34 43 L34 54" stroke={OUTLINE} strokeWidth="2"/></svg>;
    case 'frame': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="12" y="10" width="40" height="44" fill="#fef3c7" stroke={OUTLINE} strokeWidth="4"/><rect x="18" y="16" width="28" height="30" fill={color}/><circle cx="28" cy="30" r="4" fill="#fca5a5"/><circle cx="36" cy="30" r="4" fill="#93c5fd"/></svg>;
    case 'neon': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="8" y="18" width="48" height="28" rx="8" fill="#1e1b4b" stroke={OUTLINE} strokeWidth="3"/><text x="32" y="36" fontSize="15" textAnchor="middle" fill={color} style={{fontWeight:900}}>us♡</text></svg>;
    case 'cactus': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="20" y="42" width="24" height="12" fill="#a16207" stroke={OUTLINE} strokeWidth="3"/><rect x="26" y="16" width="12" height="26" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="18" y="24" width="8" height="12" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="38" y="24" width="8" height="12" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'lamp': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="29" y="22" width="6" height="24" fill="#9ca3af"/><rect x="19" y="14" width="26" height="10" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="24" y="46" width="16" height="6" fill="#6b7280" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'disco': return <svg viewBox="0 0 64 64" className="w-full h-full"><line x1="32" y1="8" x2="32" y2="16" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="28" r="14" fill={color} stroke={OUTLINE} strokeWidth="3"/>{[0,1,2,3].map((i)=><rect key={i} x={22+i*6} y={22+i} width="4" height="4" fill="#e2e8f0" />)}</svg>;
    case 'projector': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="28" width="26" height="16" fill="#111827" stroke={OUTLINE} strokeWidth="3"/><circle cx="24" cy="36" r="4" fill="#38bdf8"/><path d="M36 32 L56 24 L56 48 L36 40 Z" fill={color} opacity=".35"/></svg>;
    case 'plant': return <svg viewBox="0 0 64 64" className="w-full h-full">{basic}<path d="M20 40 C26 30 30 30 32 24 C34 30 38 30 44 40" stroke="#14532d" strokeWidth="3" fill="none"/></svg>;
    case 'bonsai': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="19" y="44" width="26" height="10" fill="#92400e" stroke={OUTLINE} strokeWidth="3"/><path d="M32 42 C28 34 25 28 24 20 M32 42 C36 34 40 28 42 20" stroke="#7c2d12" strokeWidth="3"/><circle cx="23" cy="19" r="6" fill={color}/><circle cx="33" cy="15" r="8" fill={color}/><circle cx="42" cy="19" r="6" fill={color}/></svg>;
    case 'flower': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="24" y="42" width="16" height="12" fill="#a16207" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="26" r="7" fill={color}/><circle cx="25" cy="30" r="5" fill="#fbcfe8"/><circle cx="39" cy="30" r="5" fill="#fbcfe8"/></svg>;
    case 'sunflower': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="22" y="43" width="20" height="11" fill="#92400e" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="24" r="10" fill="#facc15" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="24" r="4" fill="#78350f"/></svg>;
    case 'lantern': return <svg viewBox="0 0 64 64" className="w-full h-full"><line x1="32" y1="8" x2="32" y2="14" stroke={OUTLINE} strokeWidth="3"/><ellipse cx="32" cy="30" rx="14" ry="18" fill={color} stroke={OUTLINE} strokeWidth="3"/><line x1="24" y1="30" x2="40" y2="30" stroke="#fff" opacity=".6"/></svg>;
    case 'candles': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="16" y="30" width="10" height="20" fill="#fff8dc" stroke={OUTLINE} strokeWidth="3"/><rect x="28" y="26" width="10" height="24" fill="#fff8dc" stroke={OUTLINE} strokeWidth="3"/><rect x="40" y="32" width="10" height="18" fill="#fff8dc" stroke={OUTLINE} strokeWidth="3"/><circle cx="21" cy="26" r="3" fill="#f59e0b"/><circle cx="33" cy="22" r="3" fill="#f59e0b"/><circle cx="45" cy="28" r="3" fill="#f59e0b"/></svg>;
    case 'pillows': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="30" width="24" height="16" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="30" y="28" width="24" height="18" rx="6" fill="#a78bfa" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'blanket': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="20" width="44" height="30" fill={color} stroke={OUTLINE} strokeWidth="3"/><line x1="10" y1="30" x2="54" y2="30" stroke="#fff" opacity=".5"/></svg>;
    case 'mug': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="18" y="24" width="24" height="22" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="42" y="28" width="8" height="12" rx="4" fill="#f1f5f9" stroke={OUTLINE} strokeWidth="3"/><path d="M26 18 C24 14 28 12 26 8 M34 18 C32 14 36 12 34 8" stroke="#fff" strokeWidth="2"/></svg>;
    case 'books': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="14" y="36" width="36" height="12" fill="#f97316" stroke={OUTLINE} strokeWidth="3"/><rect x="18" y="26" width="32" height="10" fill="#60a5fa" stroke={OUTLINE} strokeWidth="3"/><rect x="22" y="18" width="26" height="8" fill="#34d399" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'record': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="11" y="18" width="42" height="34" fill="#312e81" stroke={OUTLINE} strokeWidth="3"/><circle cx="28" cy="35" r="10" fill="#111827"/><circle cx="28" cy="35" r="2" fill="#fde68a"/><rect x="38" y="28" width="10" height="3" fill="#fbbf24"/></svg>;
    case 'fridge': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="20" y="10" width="24" height="44" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/><line x1="20" y1="30" x2="44" y2="30" stroke={OUTLINE} strokeWidth="3"/><rect x="40" y="18" width="2" height="6" fill={OUTLINE}/><rect x="40" y="37" width="2" height="8" fill={OUTLINE}/></svg>;
    case 'aquarium': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="18" width="44" height="30" fill="#38bdf8" stroke={OUTLINE} strokeWidth="3"/><path d={`M20 ${34 + Math.sin(t / 220) * 2} q6 -6 12 0 q-6 6 -12 0`} fill="#facc15"/><circle cx="40" cy="28" r="2" fill="#fff"/><rect x="18" y="46" width="28" height="6" fill="#475569"/></svg>;
    case 'fireplace': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="12" y="18" width="40" height="34" fill="#b45309" stroke={OUTLINE} strokeWidth="3"/><rect x="20" y="28" width="24" height="18" fill="#1f2937"/><path d={`M32 ${41 + Math.sin(t / 120) * 2} l-5 -8 l5 -10 l5 10 z`} fill="#f97316"/></svg>;
    case 'window': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="14" y="10" width="36" height="44" fill="#93c5fd" stroke={OUTLINE} strokeWidth="4"/><line x1="32" y1="10" x2="32" y2="54" stroke={OUTLINE} strokeWidth="3"/><line x1="14" y1="32" x2="50" y2="32" stroke={OUTLINE} strokeWidth="3"/>{[20,40,28].map((x,i)=><circle key={x} cx={x} cy={18+i*8} r="1.7" fill="#fff" opacity=".9"/>)}</svg>;
    case 'portal': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="16" y="10" width="32" height="44" rx="12" fill="#312e81" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="32" r={10 + Math.sin(t / 180) * 2} fill="#a78bfa" opacity=".8"/></svg>;
    case 'robot': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="18" y="20" width="28" height="24" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3"/><circle cx="28" cy="31" r="3" fill="#0f172a"/><circle cx="36" cy="31" r="3" fill="#0f172a"/><rect x="24" y="44" width="16" height="8" fill="#94a3b8" stroke={OUTLINE} strokeWidth="3"/><line x1="32" y1="20" x2="32" y2="14" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="12" r="2" fill="#f43f5e"/></svg>;
    default: return basic;
  }
};

const playTone = (ctx: AudioContext, freq: number, duration = 0.08, type: OscillatorType = 'square', gain = 0.08) => {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
};

export const OurRoom: React.FC<OurRoomProps> = ({ setView }) => {
  const profile = StorageService.getCoupleProfile();
  const roomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const longPressRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragSaveRef = useRef<number>(0);

  const [room, setRoom] = useState<RoomState>(() => ({ ...DEFAULT_STATE, ...StorageService.getRoomState() }));
  const [coinDisplay, setCoinDisplay] = useState(room.coins);
  const [showShop, setShowShop] = useState(false);
  const [category, setCategory] = useState<Category>('furniture');
  const [coinsFx, setCoinsFx] = useState<CoinParticle[]>([]);
  const [dustFx, setDustFx] = useState<DustParticle[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [placingRipple, setPlacingRipple] = useState<{ id: string; x: number; y: number }[]>([]);
  const [avatarWaveUntil, setAvatarWaveUntil] = useState(0);
  const [purchaseFly, setPurchaseFly] = useState<{ id: string; emoji: string; fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const [toast, setToast] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ itemId: string; x: number; y: number } | null>(null);

  const saveRoom = useCallback((next: RoomState) => {
    setRoom(next);
    StorageService.saveRoomState(next);
  }, []);

  useEffect(() => {
    const onStorage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.table === 'our_room_state' || detail?.table === 'init') {
        setRoom({ ...DEFAULT_STATE, ...StorageService.getRoomState() });
      }
    };
    storageEventTarget.addEventListener('storage-update', onStorage);
    return () => storageEventTarget.removeEventListener('storage-update', onStorage);
  }, []);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      setCoinDisplay((prev) => {
        const d = room.coins - prev;
        if (Math.abs(d) < 1) return room.coins;
        return prev + d * 0.22;
      });
      raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [room.coins]);

  useEffect(() => {
    const animate = () => {
      setNowTick(performance.now());
      setCoinsFx((list) => list.map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.09, rot: p.rot + p.vr, life: p.life - 1 })).filter((p) => p.life > 0));
      setDustFx((list) => list.map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 1 })).filter((p) => p.life > 0));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (!placingRipple.length) return;
    const id = window.setTimeout(() => setPlacingRipple([]), 520);
    return () => window.clearTimeout(id);
  }, [placingRipple]);

  const getAudio = () => {
    if (!audioRef.current) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return null;
      audioRef.current = new Ctx();
    }
    return audioRef.current;
  };

  const playEarn = () => {
    const ctx = getAudio();
    if (!ctx) return;
    playTone(ctx, 660, 0.06, 'triangle', 0.07);
    setTimeout(() => playTone(ctx, 880, 0.08, 'triangle', 0.08), 45);
  };

  const playBuy = () => {
    const ctx = getAudio();
    if (!ctx) return;
    playTone(ctx, 540, 0.06, 'square', 0.08);
    setTimeout(() => playTone(ctx, 820, 0.09, 'square', 0.09), 55);
    setTimeout(() => playTone(ctx, 1080, 0.1, 'triangle', 0.08), 95);
  };

  const playPlace = () => {
    const ctx = getAudio();
    if (!ctx) return;
    playTone(ctx, 420, 0.08, 'sine', 0.08);
  };

  const pushToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 1200);
  };

  const earnCoins = () => {
    const next = { ...room, coins: room.coins + 50 };
    saveRoom(next);
    playEarn();
    setCoinsFx((old) => [
      ...old,
      ...Array.from({ length: 18 }).map((_, i) => ({
        id: `coin-${Date.now()}-${i}`,
        x: 80 + Math.random() * 40,
        y: 6 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 1.8,
        vy: -1.5 - Math.random() * 2.2,
        rot: Math.random() * 180,
        vr: (Math.random() - 0.5) * 20,
        life: 64 + Math.random() * 18,
      })),
    ]);
  };

  const placeNewItem = (item: CatalogItem) => {
    if (room.coins < item.cost) {
      pushToast('Not enough coins');
      return;
    }
    playBuy();
    setAvatarWaveUntil(Date.now() + 2400);
    const frame = ITEM_FRAME_BY_KIND[item.kind];
    const snapped = snapFloorPosition(
      50 + (Math.random() - 0.5) * 22,
      56 + (Math.random() - 0.5) * 18,
    );
    const newItem: RoomPlacedItem = {
      uid: crypto.randomUUID(),
      itemId: item.id,
      x: frame.anchor === 'wall' ? 50 + (Math.random() - 0.5) * 26 : snapped.x,
      y: frame.anchor === 'wall' ? 23 + (Math.random() - 0.5) * 24 : snapped.y,
      z: Date.now(),
      scale: 1,
      rotation: 0,
      placedBy: profile.myName,
    };
    saveRoom({ ...room, coins: room.coins - item.cost, placedItems: [...room.placedItems, newItem] });
    setPlacingRipple([{ id: newItem.uid, x: newItem.x, y: newItem.y }]);
    playPlace();
    const icon = SHOP.find((s) => s.id === item.id);
    setPurchaseFly({
      id: `${Date.now()}`,
      emoji: icon ? icon.name[0] : '+',
      fromX: 50,
      fromY: 85,
      toX: newItem.x,
      toY: newItem.y,
    });
    setTimeout(() => setPurchaseFly(null), 520);
  };

  const deleteItem = (id: string) => {
    const target = room.placedItems.find((p) => p.uid === id);
    if (!target) return;
    const item = shopById[target.itemId];
    const refund = Math.max(8, Math.round((item?.cost || 40) * 0.45));
    saveRoom({ ...room, coins: room.coins + refund, placedItems: room.placedItems.filter((p) => p.uid !== id) });
    setDustFx((d) => [
      ...d,
      ...Array.from({ length: 12 }).map((_, i) => ({
        id: `dust-${Date.now()}-${i}`,
        x: target.x,
        y: target.y,
        vx: (Math.random() - 0.5) * 1.4,
        vy: (Math.random() - 0.5) * 1.2,
        life: 30 + Math.random() * 12,
      })),
    ]);
    pushToast(`+${refund} coins`);
    setContextMenu(null);
    setSelectedItem(null);
  };

  const duplicateItem = (id: string) => {
    const target = room.placedItems.find((p) => p.uid === id);
    if (!target) return;
    const targetMeta = shopById[target.itemId];
    const duplicateCost = Math.max(8, Math.round((targetMeta?.cost || 40) * 0.35));
    if (room.coins < duplicateCost) {
      pushToast(`Need ${duplicateCost} coins`);
      return;
    }
    const snapped = snapFloorPosition(target.x + 4, target.y + 3);
    const clone: RoomPlacedItem = {
      ...target,
      uid: crypto.randomUUID(),
      x: snapped.x,
      y: snapped.y,
      z: Date.now(),
      rotation: 0,
    };
    saveRoom({ ...room, coins: room.coins - duplicateCost, placedItems: [...room.placedItems, clone] });
    setContextMenu(null);
    pushToast(`Duplicated -${duplicateCost}`);
  };

  const rotateItem = (_id: string) => {
    pushToast('Rotation locked in isometric mode');
    setContextMenu(null);
  };

  const beginDrag = (e: React.PointerEvent, item: RoomPlacedItem) => {
    e.stopPropagation();
    const rect = roomRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    dragRef.current = { id: item.uid, dx: x - item.x, dy: y - item.y };
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragging(item.uid);
    setSelectedItem(item.uid);
    setContextMenu(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      const rect = roomRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuX = clamp(x, 18, 82);
      const menuY = clamp(y, 22, 84);
      setContextMenu({ itemId: item.uid, x: menuX, y: menuY });
      setDragging(null);
      dragRef.current = null;
    }, 650);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !roomRef.current) return;
    const rect = roomRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 100;
    const ny = ((e.clientY - rect.top) / rect.height) * 100;
    const targetItem = room.placedItems.find((it) => it.uid === dragRef.current!.id);
    const targetMeta = targetItem ? shopById[targetItem.itemId] : undefined;
    const targetFrame = targetMeta ? ITEM_FRAME_BY_KIND[targetMeta.kind] : { anchor: 'floor' as const };
    const baseX = clamp(nx - dragRef.current.dx, targetFrame.anchor === 'wall' ? 20 : 18, targetFrame.anchor === 'wall' ? 80 : 82);
    const baseY = clamp(ny - dragRef.current.dy, targetFrame.anchor === 'wall' ? 16 : 42, targetFrame.anchor === 'wall' ? 56 : 90);
    const snapped = targetFrame.anchor === 'wall' ? { x: baseX, y: baseY } : snapFloorPosition(baseX, baseY);
    const x = snapped.x;
    const y = snapped.y;
    setRoom((prev) => ({
      ...prev,
      placedItems: prev.placedItems.map((it) => it.uid === dragRef.current!.id ? { ...it, x, y, z: Date.now() } : it),
    }));
    if (longPressRef.current && dragStartRef.current) {
      const moved = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
      if (moved > 8) {
        window.clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
    }
    const now = Date.now();
    if (now - dragSaveRef.current > 260) {
      dragSaveRef.current = now;
      StorageService.saveRoomState({
        ...room,
        placedItems: room.placedItems.map((it) => it.uid === dragRef.current!.id ? { ...it, x, y, z: Date.now() } : it),
      });
    }
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    setRoom((prev) => {
      const next = { ...prev, placedItems: [...prev.placedItems] };
      StorageService.saveRoomState(next);
      return next;
    });
    setDragging(null);
    dragRef.current = null;
    dragStartRef.current = null;
    dragSaveRef.current = 0;
  };

  const shareRoom = async () => {
    try {
      const payload = `🏠${btoa(unescape(encodeURIComponent(JSON.stringify(room))))}`;
      await navigator.clipboard.writeText(payload);
      pushToast('Room code copied');
    } catch {
      pushToast('Copy failed');
    }
  };

  const onNameSave = (value: string) => {
    const trimmed = value.trim().slice(0, 32) || 'P1 Room';
    saveRoom({ ...room, roomName: trimmed });
    setEditingName(false);
  };

  const sortedItems = useMemo(
    () => [...room.placedItems].sort((a, b) => (a.y + (a.z || 0) * 0.00001) - (b.y + (b.z || 0) * 0.00001)),
    [room.placedItems],
  );

  const visibleItems = useMemo(() => SHOP.filter((s) => s.category === category), [category]);

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg,#ffd9ad 0%,#ffd1a0 100%)',
        fontFamily: '"Nunito", "Baloo 2", "Nunito Sans", system-ui, sans-serif',
      }}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => {
        setContextMenu(null);
        if (!dragRef.current) setSelectedItem(null);
      }}
    >
      <style>{`
        .room-pixel-ui{border:3px solid ${OUTLINE};border-radius:4px;box-shadow:0 4px 0 #2c2455,0 10px 16px rgba(22,16,44,.24)}
        .room-scroll::-webkit-scrollbar{width:10px}
        .room-scroll::-webkit-scrollbar-track{background:#4f3d88;border-radius:999px}
        .room-scroll::-webkit-scrollbar-thumb{background:#fbbf24;border:2px solid #4f3d88;border-radius:999px}
      `}</style>

      <div
        className="absolute inset-0 opacity-32"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      <div className="relative z-10 p-3 pb-28">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setView('us')} className="room-pixel-ui h-11 w-11 bg-[#4d69d7] text-white grid place-items-center active:translate-y-[1px]">
            <ArrowLeft size={18} />
          </button>

          <div className="room-pixel-ui flex-1 bg-[#1f3d88] text-white h-11 px-3 flex items-center justify-between">
            {!editingName ? (
              <button onClick={() => setEditingName(true)} className="font-black tracking-wide text-sm">
                {room.roomName}
              </button>
            ) : (
              <input
                autoFocus
                defaultValue={room.roomName}
                onBlur={(e) => onNameSave(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onNameSave((e.target as HTMLInputElement).value); }}
                className="bg-white/15 rounded px-2 py-1 text-sm font-bold w-40 outline-none"
              />
            )}
            <span className="text-xs font-black opacity-85">{profile.myName} + {profile.partnerName}</span>
          </div>

          <div className="room-pixel-ui bg-[#234c9f] text-white h-11 px-3 flex items-center gap-2">
            <Coins size={14} className={Math.abs(room.coins - coinDisplay) > 1 ? 'animate-bounce' : ''} />
            <span className="font-black tabular-nums">{Math.round(coinDisplay)}</span>
          </div>

          <button onClick={earnCoins} className="room-pixel-ui h-11 w-11 bg-[#27b66f] text-white grid place-items-center active:translate-y-[1px]">
            <Plus size={20} />
          </button>
        </div>

        <div ref={roomRef} className="relative max-w-xl mx-auto h-[520px] select-none room-pixel-ui overflow-hidden bg-[#1f1424]" onContextMenu={(e) => e.preventDefault()}>
          {/* Single SVG: walls + floor share vertices — aligned perspective */}
          <RoomCornerScene wallpaper={room.wallpaper} floor={room.floor} />

          {sortedItems.map((item, idx) => {
            const meta = shopById[item.itemId] || {
              id: item.itemId,
              name: 'Synced Item',
              kind: 'table' as const,
              category: 'special' as const,
              cost: 0,
              rarity: 'common' as const,
              color: '#94a3b8',
              idle: 'none' as const,
            };
            const frame = ITEM_FRAME_BY_KIND[meta.kind];
            const idleAmp = meta.idle === 'none' ? 0 : meta.idle === 'swim' ? 2.8 : 1.4;
            const idleY = Math.sin(nowTick / 540 + idx) * idleAmp;
            const idleR = meta.idle === 'spin' ? Math.sin(nowTick / 300 + idx) * 4 : 0;
            const isDrag = dragging === item.uid;
            const isSelected = selectedItem === item.uid;
            const shadowY = 8 + ((item.y - 40) / 55) * 2;
            return (
              <div
                key={item.uid}
                className="absolute"
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                    width: meta.width || frame.w,
                    height: meta.height || frame.h,
                  transform: `translate(-50%,-50%) translateY(${idleY}px) rotate(${idleR}deg) scale(${isDrag ? 1.18 : item.scale || 1})`,
                  zIndex: 100 + Math.round(item.y * 10),
                  filter: isDrag
                    ? 'drop-shadow(0 0 14px rgba(255,255,255,.95))'
                    : `drop-shadow(0 ${shadowY}px 0 rgba(22,16,42,.33)) drop-shadow(0 ${shadowY + 6}px 12px rgba(0,0,0,.2))`,
                  transition: isDrag ? 'none' : 'transform .14s ease',
                }}
                onPointerDown={(e) => beginDrag(e, item)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = roomRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setContextMenu({ itemId: item.uid, x: clamp(x, 15, 85), y: clamp(y, 20, 86) });
                    setSelectedItem(item.uid);
                  }}
              >
                {iconSvg(meta.kind, meta.color, nowTick)}
                  {isSelected && (
                    <div className="absolute inset-0 border-2 border-[#fef08a] rounded-[8px] pointer-events-none" />
                  )}
              </div>
            );
          })}

          {placingRipple.map((r) => (
            <div key={r.id} className="absolute rounded-full border-4 border-white/80" style={{ left: `${r.x}%`, top: `${r.y}%`, width: 16, height: 16, transform: 'translate(-50%,-50%)', animation: 'ping .55s ease-out forwards' }} />
          ))}

          {dustFx.map((p) => (
            <div key={p.id} className="absolute rounded-full bg-white" style={{ left: `${p.x}%`, top: `${p.y}%`, width: 6, height: 6, opacity: p.life / 40, transform: `translate(-50%,-50%) scale(${0.6 + p.life / 40})` }} />
          ))}

          <div className="absolute left-3 bottom-3 text-[10px] font-black text-white/90 bg-black/40 px-2 py-1 rounded">Tulika ♡</div>

          <div className="absolute right-3 bottom-3 flex items-end gap-2">
            <motion.div animate={{ y: Date.now() < avatarWaveUntil ? [0, -4, 0, -2, 0] : 0 }} transition={{ duration: .8, repeat: Date.now() < avatarWaveUntil ? 2 : 0 }}>
              <svg viewBox="0 0 62 52" className="w-16 h-12">
                <circle cx="19" cy="16" r="9" fill="#fbbf24" stroke={OUTLINE} strokeWidth="3" />
                <circle cx="41" cy="16" r="9" fill="#93c5fd" stroke={OUTLINE} strokeWidth="3" />
                <rect x="10" y="25" width="18" height="20" rx="5" fill="#f472b6" stroke={OUTLINE} strokeWidth="3" />
                <rect x="34" y="25" width="18" height="20" rx="5" fill="#60a5fa" stroke={OUTLINE} strokeWidth="3" />
              </svg>
            </motion.div>
          </div>

          <div className="absolute inset-0 pointer-events-none" style={{ background: ambientOverlay(room.ambient), mixBlendMode: 'screen' }} />
          {contextMenu && (
            <div
              className="absolute z-[120] room-pixel-ui bg-[#1a1f49] p-1.5 grid gap-1 min-w-[126px]"
              style={{ left: `${contextMenu.x}%`, top: `${contextMenu.y}%`, transform: 'translate(-50%,-100%)' }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => duplicateItem(contextMenu.itemId)} className="h-8 px-2 text-left text-white text-xs font-black room-pixel-ui !border-[2px] !rounded-[4px] bg-[#3656b8]">Duplicate</button>
              <button onClick={() => rotateItem(contextMenu.itemId)} className="h-8 px-2 text-left text-white text-xs font-black room-pixel-ui !border-[2px] !rounded-[4px] bg-[#7c3aed] flex items-center gap-1"><RotateCw size={12} /> Rotate +15</button>
              <button onClick={() => deleteItem(contextMenu.itemId)} className="h-8 px-2 text-left text-white text-xs font-black room-pixel-ui !border-[2px] !rounded-[4px] bg-[#d94678] flex items-center gap-1"><Trash2 size={12} /> Remove</button>
            </div>
          )}
        </div>

        <div className="max-w-xl mx-auto mt-3 flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowShop(true)} className="room-pixel-ui px-4 h-11 bg-[#ea5ba6] text-white font-black flex items-center gap-2"><ShoppingBag size={16} /> Shop</button>
          <button onClick={shareRoom} className="room-pixel-ui px-3 h-11 bg-[#5d7ee8] text-white font-black flex items-center gap-2"><Share2 size={14} /> Share</button>
          <button
            onClick={() => saveRoom({ ...room, wallpaper: WALLPAPER_ORDER[(WALLPAPER_ORDER.indexOf(room.wallpaper) + 1) % WALLPAPER_ORDER.length] })}
            className="room-pixel-ui px-3 h-11 bg-[#9b6de8] text-white font-black text-xs"
          >
            Wallpaper
          </button>
          <button
            onClick={() => saveRoom({ ...room, floor: FLOOR_ORDER[(FLOOR_ORDER.indexOf(room.floor) + 1) % FLOOR_ORDER.length] })}
            className="room-pixel-ui px-3 h-11 bg-[#6cbf56] text-white font-black text-xs"
          >
            Floor
          </button>
          <button onClick={() => saveRoom({ ...room, ambient: room.ambient === 'warm' ? 'cool' : room.ambient === 'cool' ? 'rainbow' : 'warm' })} className="room-pixel-ui px-3 h-11 bg-[#f59e0b] text-white font-black text-xs"><Wand2 size={14} /></button>
        </div>
      </div>

      <AnimatePresence>
        {coinsFx.map((c) => (
          <motion.div key={c.id} className="absolute z-40 text-xl" style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `translate(-50%,-50%) rotateY(${c.rot}deg)`, opacity: c.life / 70 }}>🪙</motion.div>
        ))}
      </AnimatePresence>

      {purchaseFly && (
        <motion.div
          className="absolute z-50 w-9 h-9 room-pixel-ui bg-[#fff5c2] text-[#1f2937] grid place-items-center font-black"
          initial={{ left: `${purchaseFly.fromX}%`, top: `${purchaseFly.fromY}%`, scale: 1 }}
          animate={{ left: `${purchaseFly.toX}%`, top: `${purchaseFly.toY}%`, scale: 0.8 }}
          transition={{ duration: .5, ease: [.2, .8, .2, 1] }}
        >
          {purchaseFly.emoji}
        </motion.div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[90] room-pixel-ui bg-[#201942] text-white px-4 py-2 text-sm font-black">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShop && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowShop(false)} className="fixed inset-0 bg-black/45 z-40" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 230, damping: 28 }}
              className="fixed z-50 left-0 right-0 bottom-0 rounded-t-2xl p-3"
              style={{ background: 'linear-gradient(180deg,#1b2f78,#203f96)', maxHeight: '66vh' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-white font-black tracking-wide">ROOM SHOP</div>
                <div className="flex items-center gap-2">
                  <div className="room-pixel-ui px-2 h-8 bg-[#1a2f65] text-white text-xs font-black flex items-center gap-1"><Coins size={12} /> {room.coins}</div>
                  <button onClick={() => setShowShop(false)} className="room-pixel-ui h-8 w-8 bg-[#de4b7b] text-white grid place-items-center"><X size={14} /></button>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-1 mb-2">
                {(Object.keys(CAT_LABEL) as Category[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className="room-pixel-ui h-9 text-[10px] font-black text-white uppercase"
                    style={{ background: category === cat ? '#f59e0b' : '#3858b6' }}
                  >
                    {CAT_LABEL[cat]}
                  </button>
                ))}
              </div>

              <div className="room-scroll overflow-y-auto pr-1" style={{ maxHeight: '48vh' }}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-4">
                  {visibleItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => placeNewItem(item)}
                      className="room-pixel-ui p-2 text-left text-white transition-transform hover:scale-[1.02]"
                      style={{ background: room.coins >= item.cost ? '#2d4da9' : '#344579', opacity: room.coins >= item.cost ? 1 : 0.7 }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-14 h-14">{iconSvg(item.kind, item.color, nowTick)}</div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: RARITY_COLOR[item.rarity], color: '#1a1832', fontWeight: 900 }}>
                          {item.rarity.toUpperCase()}
                        </span>
                      </div>
                      <div className="font-black text-xs leading-tight mt-1">{item.name}</div>
                      <div className="text-[11px] font-black mt-1 flex items-center gap-1"><Coins size={11} /> {item.cost}</div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

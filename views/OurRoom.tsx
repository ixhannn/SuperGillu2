import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Coins, Plus, Share2, ShoppingBag, Trash2, Wand2, X } from 'lucide-react';
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
  { id: 'neon_us', name: 'Neon Us', kind: 'neon', category: 'decor', cost: 170, rarity: 'legendary', color: '#a78bfa', idle: 'twinkle' },
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
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const wallPattern = (kind: RoomState['wallpaper']) => {
  switch (kind) {
    case 'stripes': return 'repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0 12px, rgba(0,0,0,.04) 12px 24px)';
    case 'polka': return 'radial-gradient(circle at 14px 14px, rgba(255,255,255,.12) 0 3px, transparent 4px)';
    case 'hearts': return 'radial-gradient(circle at 20px 18px, rgba(255,255,255,.1) 0 3px, transparent 4px), radial-gradient(circle at 29px 18px, rgba(255,255,255,.1) 0 3px, transparent 4px)';
    case 'stars': return 'radial-gradient(circle at 20px 20px, rgba(255,255,255,.16) 0 2px, transparent 3px), radial-gradient(circle at 60px 46px, rgba(255,255,255,.12) 0 2px, transparent 3px)';
    case 'wood': return 'repeating-linear-gradient(90deg, rgba(91,64,44,.35) 0 10px, rgba(115,82,58,.28) 10px 20px)';
    default: return 'none';
  }
};

const floorPattern = (kind: RoomState['floor']) => {
  switch (kind) {
    case 'hardwood': return 'repeating-linear-gradient(90deg,#6b4e3b 0 10px,#7b5a44 10px 20px)';
    case 'tiles': return 'linear-gradient(45deg,#4b5c8d 25%,transparent 25%),linear-gradient(-45deg,#4b5c8d 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#4b5c8d 75%),linear-gradient(-45deg,transparent 75%,#4b5c8d 75%) #5d6ea1';
    case 'cloud': return 'radial-gradient(circle at 20px 20px,#fff 0 10px,#c7b5ff 11px 18px)';
    case 'grass': return 'repeating-linear-gradient(90deg,#6bbf63 0 8px,#59ab52 8px 16px)';
    case 'marble': return 'repeating-linear-gradient(120deg,#d8d8e8 0 14px,#ededf7 14px 30px,#c6c3df 30px 36px)';
    default: return 'repeating-linear-gradient(90deg,#374d7c 0 14px,#304369 14px 28px)';
  }
};

const ambientOverlay = (ambient: RoomState['ambient']) => {
  if (ambient === 'cool') return 'linear-gradient(180deg, rgba(56,189,248,.18), rgba(99,102,241,.14))';
  if (ambient === 'rainbow') return 'linear-gradient(120deg, rgba(244,114,182,.18), rgba(251,191,36,.14), rgba(34,197,94,.16), rgba(59,130,246,.14))';
  return 'linear-gradient(180deg, rgba(251,146,60,.18), rgba(251,113,133,.12))';
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
    case 'lights': return <svg viewBox="0 0 64 64" className="w-full h-full"><path d="M8 14 Q32 4 56 14" stroke={OUTLINE} strokeWidth="3" fill="none"/>{[14,24,34,44,54].map((x)=><circle key={x} cx={x} cy={19 + (x%2?3:0)} r={3.5} fill={`hsl(${(x * 8 + tw * 4) % 360} 90% 65%)`} opacity={0.5 + glow * 0.5}/>)}</svg>;
    case 'balloon': return <svg viewBox="0 0 64 64" className="w-full h-full"><circle cx="24" cy="24" r="10" fill={color} stroke={OUTLINE} strokeWidth="3"/><circle cx="38" cy="20" r="9" fill="#fda4af" stroke={OUTLINE} strokeWidth="3"/><circle cx="34" cy="33" r="10" fill="#f472b6" stroke={OUTLINE} strokeWidth="3"/><path d="M24 34 L24 54 M38 29 L38 54 M34 43 L34 54" stroke={OUTLINE} strokeWidth="2"/></svg>;
    case 'frame': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="12" y="10" width="40" height="44" fill="#fef3c7" stroke={OUTLINE} strokeWidth="4"/><rect x="18" y="16" width="28" height="30" fill={color}/><circle cx="28" cy="30" r="4" fill="#fca5a5"/><circle cx="36" cy="30" r="4" fill="#93c5fd"/></svg>;
    case 'neon': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="8" y="18" width="48" height="28" rx="8" fill="#1e1b4b" stroke={OUTLINE} strokeWidth="3"/><text x="32" y="36" fontSize="15" textAnchor="middle" fill={color} style={{ fontWeight: 900 }}>us</text></svg>;
    case 'cactus': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="20" y="42" width="24" height="12" fill="#a16207" stroke={OUTLINE} strokeWidth="3"/><rect x="26" y="16" width="12" height="26" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="18" y="24" width="8" height="12" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="38" y="24" width="8" height="12" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'lamp': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="29" y="22" width="6" height="24" fill="#9ca3af"/><rect x="19" y="14" width="26" height="10" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="24" y="46" width="16" height="6" fill="#6b7280" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'disco': return <svg viewBox="0 0 64 64" className="w-full h-full"><line x1="32" y1="8" x2="32" y2="16" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="28" r="14" fill={color} stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'projector': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="28" width="26" height="16" fill="#111827" stroke={OUTLINE} strokeWidth="3"/><circle cx="24" cy="36" r="4" fill="#38bdf8"/><path d="M36 32 L56 24 L56 48 L36 40 Z" fill={color} opacity=".35"/></svg>;
    case 'plant': return <svg viewBox="0 0 64 64" className="w-full h-full">{basic}<path d="M20 40 C26 30 30 30 32 24 C34 30 38 30 44 40" stroke="#14532d" strokeWidth="3" fill="none"/></svg>;
    case 'bonsai': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="19" y="44" width="26" height="10" fill="#92400e" stroke={OUTLINE} strokeWidth="3"/><path d="M32 42 C28 34 25 28 24 20 M32 42 C36 34 40 28 42 20" stroke="#7c2d12" strokeWidth="3"/><circle cx="23" cy="19" r="6" fill={color}/><circle cx="33" cy="15" r="8" fill={color}/><circle cx="42" cy="19" r="6" fill={color}/></svg>;
    case 'flower': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="24" y="42" width="16" height="12" fill="#a16207" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="26" r="7" fill={color}/></svg>;
    case 'sunflower': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="22" y="43" width="20" height="11" fill="#92400e" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="24" r="10" fill="#facc15" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="24" r="4" fill="#78350f"/></svg>;
    case 'lantern': return <svg viewBox="0 0 64 64" className="w-full h-full"><line x1="32" y1="8" x2="32" y2="14" stroke={OUTLINE} strokeWidth="3"/><ellipse cx="32" cy="30" rx="14" ry="18" fill={color} stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'candles': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="16" y="30" width="10" height="20" fill="#fff8dc" stroke={OUTLINE} strokeWidth="3"/><rect x="28" y="26" width="10" height="24" fill="#fff8dc" stroke={OUTLINE} strokeWidth="3"/><rect x="40" y="32" width="10" height="18" fill="#fff8dc" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'pillows': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="30" width="24" height="16" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="30" y="28" width="24" height="18" rx="6" fill="#a78bfa" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'blanket': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="20" width="44" height="30" fill={color} stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'mug': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="18" y="24" width="24" height="22" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/><rect x="42" y="28" width="8" height="12" rx="4" fill="#f1f5f9" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'books': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="14" y="36" width="36" height="12" fill="#f97316" stroke={OUTLINE} strokeWidth="3"/><rect x="18" y="26" width="32" height="10" fill="#60a5fa" stroke={OUTLINE} strokeWidth="3"/><rect x="22" y="18" width="26" height="8" fill="#34d399" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'record': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="11" y="18" width="42" height="34" fill="#312e81" stroke={OUTLINE} strokeWidth="3"/><circle cx="28" cy="35" r="10" fill="#111827"/></svg>;
    case 'fridge': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="20" y="10" width="24" height="44" rx="4" fill={color} stroke={OUTLINE} strokeWidth="3"/><line x1="20" y1="30" x2="44" y2="30" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'aquarium': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="10" y="18" width="44" height="30" fill="#38bdf8" stroke={OUTLINE} strokeWidth="3"/><rect x="18" y="46" width="28" height="6" fill="#475569"/></svg>;
    case 'fireplace': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="12" y="18" width="40" height="34" fill="#b45309" stroke={OUTLINE} strokeWidth="3"/><rect x="20" y="28" width="24" height="18" fill="#1f2937"/></svg>;
    case 'window': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="14" y="10" width="36" height="44" fill="#93c5fd" stroke={OUTLINE} strokeWidth="4"/><line x1="32" y1="10" x2="32" y2="54" stroke={OUTLINE} strokeWidth="3"/><line x1="14" y1="32" x2="50" y2="32" stroke={OUTLINE} strokeWidth="3"/></svg>;
    case 'portal': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="16" y="10" width="32" height="44" rx="12" fill="#312e81" stroke={OUTLINE} strokeWidth="3"/><circle cx="32" cy="32" r={10 + Math.sin(t / 180) * 2} fill="#a78bfa" opacity=".8"/></svg>;
    case 'robot': return <svg viewBox="0 0 64 64" className="w-full h-full"><rect x="18" y="20" width="28" height="24" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3"/><circle cx="28" cy="31" r="3" fill="#0f172a"/><circle cx="36" cy="31" r="3" fill="#0f172a"/></svg>;
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
    const newItem: RoomPlacedItem = {
      uid: crypto.randomUUID(),
      itemId: item.id,
      x: 48 + (Math.random() - 0.5) * 24,
      y: 58 + (Math.random() - 0.5) * 18,
      z: Date.now(),
      scale: 1,
      rotation: (Math.random() - 0.5) * 3,
      placedBy: profile.myName,
    };
    saveRoom({ ...room, coins: room.coins - item.cost, placedItems: [...room.placedItems, newItem] });
    setPlacingRipple([{ id: newItem.uid, x: newItem.x, y: newItem.y }]);
    playPlace();
    setPurchaseFly({ id: `${Date.now()}`, emoji: item.name[0] || '+', fromX: 50, fromY: 85, toX: newItem.x, toY: newItem.y });
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
  };

  const beginDrag = (e: React.PointerEvent, item: RoomPlacedItem) => {
    e.stopPropagation();
    const rect = roomRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    dragRef.current = { id: item.uid, dx: x - item.x, dy: y - item.y };
    setDragging(item.uid);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      deleteItem(item.uid);
      setDragging(null);
      dragRef.current = null;
    }, 650);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !roomRef.current) return;
    const rect = roomRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 100;
    const ny = ((e.clientY - rect.top) / rect.height) * 100;
    const x = clamp(nx - dragRef.current.dx, 16, 84);
    const y = clamp(ny - dragRef.current.dy, 44, 90);
    setRoom((prev) => ({
      ...prev,
      placedItems: prev.placedItems.map((it) => it.uid === dragRef.current!.id ? { ...it, x, y, z: Date.now() } : it),
    }));
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
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
  };

  const shareRoom = async () => {
    try {
      const payload = `ROOM:${btoa(unescape(encodeURIComponent(JSON.stringify(room))))}`;
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
      style={{ background: 'linear-gradient(180deg,#ffd9ad 0%,#ffd1a0 100%)', fontFamily: '"Nunito", "Baloo 2", "Nunito Sans", system-ui, sans-serif' }}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <style>{`
        .room-pixel-ui{border:3px solid ${OUTLINE};border-radius:4px;box-shadow:0 4px 0 #2c2455,0 10px 16px rgba(22,16,44,.24)}
        .room-scroll::-webkit-scrollbar{width:10px}
        .room-scroll::-webkit-scrollbar-track{background:#4f3d88;border-radius:999px}
        .room-scroll::-webkit-scrollbar-thumb{background:#fbbf24;border:2px solid #4f3d88;border-radius:999px}
      `}</style>

      <div className="absolute inset-0 opacity-32" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px)', backgroundSize: '72px 72px' }} />

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

        <div ref={roomRef} className="relative max-w-xl mx-auto h-[540px] select-none" onContextMenu={(e) => e.preventDefault()}>
          <svg viewBox="0 0 700 520" className="absolute inset-0 w-full h-full overflow-visible">
            <defs>
              <linearGradient id="backWallGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c0b6ae" />
                <stop offset="100%" stopColor="#a89f97" />
              </linearGradient>
              <linearGradient id="leftWallGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#b9aea7" />
                <stop offset="100%" stopColor="#978e87" />
              </linearGradient>
              <linearGradient id="rightWallGrad" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b5aba4" />
                <stop offset="100%" stopColor="#938a84" />
              </linearGradient>
              <linearGradient id="floorShade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,.16)" />
                <stop offset="100%" stopColor="rgba(10,14,28,.16)" />
              </linearGradient>
              <clipPath id="floorClip">
                <polygon points="200,235 500,235 620,285 350,405 80,285" />
              </clipPath>
            </defs>

            <polygon points="200,68 500,68 514,56 214,56" fill="#8a7c98" stroke={OUTLINE} strokeWidth="4" />
            <polygon points="200,68 500,68 500,235 200,235" fill="url(#backWallGrad)" stroke={OUTLINE} strokeWidth="4" />
            <polygon points="200,68 200,235 80,285 80,24" fill="url(#leftWallGrad)" stroke={OUTLINE} strokeWidth="4" />
            <polygon points="500,68 500,235 620,285 620,24" fill="url(#rightWallGrad)" stroke={OUTLINE} strokeWidth="4" />
            <polygon points="200,68 80,24 94,12 214,56" fill="#b9a59b" stroke={OUTLINE} strokeWidth="4" />
            <polygon points="500,68 620,24 606,12 486,56" fill="#b9a59b" stroke={OUTLINE} strokeWidth="4" />
            <polygon points="200,235 500,235 620,285 350,405 80,285" fill="#445184" stroke={OUTLINE} strokeWidth="4" />
            <polygon points="200,235 500,235 620,285 350,405 80,285" fill="url(#floorShade)" opacity="0.4" />

            <foreignObject x="200" y="68" width="300" height="167">
              <div style={{ width: '100%', height: '100%', background: room.wallpaper === 'plain' ? 'none' : wallPattern(room.wallpaper), opacity: 0.3 }} />
            </foreignObject>
            <foreignObject x="80" y="24" width="120" height="261" style={{ transform: 'skewY(27deg)', transformOrigin: '100% 0' }}>
              <div style={{ width: '100%', height: '100%', background: room.wallpaper === 'plain' ? 'none' : wallPattern(room.wallpaper), opacity: 0.22 }} />
            </foreignObject>
            <foreignObject x="500" y="24" width="120" height="261" style={{ transform: 'skewY(-27deg)', transformOrigin: '0 0' }}>
              <div style={{ width: '100%', height: '100%', background: room.wallpaper === 'plain' ? 'none' : wallPattern(room.wallpaper), opacity: 0.18 }} />
            </foreignObject>

            <g clipPath="url(#floorClip)">
              <foreignObject x="60" y="220" width="580" height="200">
                <div style={{ width: '100%', height: '100%', background: floorPattern(room.floor) }} />
              </foreignObject>
              <g opacity="0.3">
                {Array.from({ length: 13 }).map((_, i) => (
                  <line key={`v-${i}`} x1={200 + i * 28} y1="235" x2={80 + i * 42} y2="405" stroke="rgba(10,14,28,.45)" strokeWidth="2" />
                ))}
                {Array.from({ length: 8 }).map((_, i) => (
                  <line key={`h-${i}`} x1={200 - i * 16} y1={235 + i * 22} x2={500 + i * 16} y2={235 + i * 22} stroke="rgba(255,255,255,.12)" strokeWidth="2" />
                ))}
              </g>
            </g>

            <line x1="200" y1="235" x2="80" y2="285" stroke="#2e2f56" strokeWidth="6" opacity="0.55" />
            <line x1="500" y1="235" x2="620" y2="285" stroke="#2e2f56" strokeWidth="6" opacity="0.55" />
            <line x1="200" y1="235" x2="500" y2="235" stroke="#2e2f56" strokeWidth="6" opacity="0.6" />

            <polygon points="270,132 315,150 315,205 270,186" fill="#d8e8f7" stroke="#ffffff" strokeWidth="3" opacity="0.95" />
            <polygon points="276,139 309,152 309,198 276,184" fill="#c8daf0" opacity="0.7" />
            <polygon points="160,215 196,230 196,244 160,229" fill="#bcb2aa" stroke="#8c827b" strokeWidth="2" />
            <polygon points="548,150 566,143 566,151 548,158" fill="#b5aaa2" stroke="#90867f" strokeWidth="1.5" />
            <polygon points="518,206 534,200 534,206 518,212" fill="#b5aaa2" stroke="#90867f" strokeWidth="1.5" />

            <polygon points="348,262 455,302 350,346 244,302" fill="#b73b5b" opacity="0.95" />
            <polygon points="348,272 432,302 350,336 268,302" fill="#d44a6e" opacity="0.9" />
            <ellipse cx="350" cy="326" rx="118" ry="28" fill="rgba(0,0,0,.12)" />
          </svg>

          {sortedItems.map((item, idx) => {
            const meta = shopById[item.itemId];
            if (!meta) return null;
            const idleAmp = meta.idle === 'none' ? 0 : meta.idle === 'swim' ? 2.8 : 1.4;
            const idleY = Math.sin(nowTick / 540 + idx) * idleAmp;
            const idleR = meta.idle === 'spin' ? Math.sin(nowTick / 300 + idx) * 4 : 0;
            const isDrag = dragging === item.uid;
            return (
              <div
                key={item.uid}
                className="absolute"
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  width: 74,
                  height: 74,
                  transform: `translate(-50%,-50%) translateY(${idleY}px) rotate(${(item.rotation || 0) + idleR}deg) scale(${isDrag ? 1.18 : item.scale || 1})`,
                  zIndex: 100 + Math.round(item.y * 10),
                  filter: isDrag ? 'drop-shadow(0 0 14px rgba(255,255,255,.95))' : 'drop-shadow(0 8px 0 rgba(32,22,66,.45)) drop-shadow(0 16px 22px rgba(0,0,0,.22))',
                  transition: isDrag ? 'none' : 'transform .14s ease',
                }}
                onPointerDown={(e) => beginDrag(e, item)}
                onContextMenu={(e) => { e.preventDefault(); deleteItem(item.uid); }}
              >
                {iconSvg(meta.kind, meta.color, nowTick)}
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
        </div>

        <div className="max-w-xl mx-auto mt-3 flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowShop(true)} className="room-pixel-ui px-4 h-11 bg-[#ea5ba6] text-white font-black flex items-center gap-2"><ShoppingBag size={16} /> Shop</button>
          <button onClick={shareRoom} className="room-pixel-ui px-3 h-11 bg-[#5d7ee8] text-white font-black flex items-center gap-2"><Share2 size={14} /> Share</button>
          <button onClick={() => saveRoom({ ...room, wallpaper: room.wallpaper === 'wood' ? 'plain' : (['plain', 'stripes', 'polka', 'hearts', 'stars', 'wood'][(['plain', 'stripes', 'polka', 'hearts', 'stars', 'wood'].indexOf(room.wallpaper) + 1) % 6] as RoomState['wallpaper']) })} className="room-pixel-ui px-3 h-11 bg-[#9b6de8] text-white font-black text-xs">Wallpaper</button>
          <button onClick={() => saveRoom({ ...room, floor: room.floor === 'marble' ? 'hardwood' : (['hardwood', 'carpet', 'tiles', 'cloud', 'grass', 'marble'][(['hardwood', 'carpet', 'tiles', 'cloud', 'grass', 'marble'].indexOf(room.floor) + 1) % 6] as RoomState['floor']) })} className="room-pixel-ui px-3 h-11 bg-[#6cbf56] text-white font-black text-xs">Floor</button>
          <button onClick={() => saveRoom({ ...room, ambient: room.ambient === 'warm' ? 'cool' : room.ambient === 'cool' ? 'rainbow' : 'warm' })} className="room-pixel-ui px-3 h-11 bg-[#f59e0b] text-white font-black text-xs"><Wand2 size={14} /></button>
        </div>
      </div>

      <AnimatePresence>
        {coinsFx.map((c) => (
          <motion.div key={c.id} className="absolute z-40 text-xl" style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `translate(-50%,-50%) rotateY(${c.rot}deg)`, opacity: c.life / 70 }}>🪙</motion.div>
        ))}
      </AnimatePresence>

      {purchaseFly && (
        <motion.div className="absolute z-50 w-9 h-9 room-pixel-ui bg-[#fff5c2] text-[#1f2937] grid place-items-center font-black" initial={{ left: `${purchaseFly.fromX}%`, top: `${purchaseFly.fromY}%`, scale: 1 }} animate={{ left: `${purchaseFly.toX}%`, top: `${purchaseFly.toY}%`, scale: 0.8 }} transition={{ duration: .5, ease: [.2, .8, .2, 1] }}>
          {purchaseFly.emoji}
        </motion.div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="fixed top-20 left-1/2 -translate-x-1/2 z-[90] room-pixel-ui bg-[#201942] text-white px-4 py-2 text-sm font-black">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShop && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowShop(false)} className="fixed inset-0 bg-black/45 z-40" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 230, damping: 28 }} className="fixed z-50 left-0 right-0 bottom-0 rounded-t-2xl p-3" style={{ background: 'linear-gradient(180deg,#1b2f78,#203f96)', maxHeight: '66vh' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-white font-black tracking-wide">ROOM SHOP</div>
                <div className="flex items-center gap-2">
                  <div className="room-pixel-ui px-2 h-8 bg-[#1a2f65] text-white text-xs font-black flex items-center gap-1"><Coins size={12} /> {room.coins}</div>
                  <button onClick={() => setShowShop(false)} className="room-pixel-ui h-8 w-8 bg-[#de4b7b] text-white grid place-items-center"><X size={14} /></button>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-1 mb-2">
                {(Object.keys(CAT_LABEL) as Category[]).map((cat) => (
                  <button key={cat} onClick={() => setCategory(cat)} className="room-pixel-ui h-9 text-[10px] font-black text-white uppercase" style={{ background: category === cat ? '#f59e0b' : '#3858b6' }}>
                    {CAT_LABEL[cat]}
                  </button>
                ))}
              </div>

              <div className="room-scroll overflow-y-auto pr-1" style={{ maxHeight: '48vh' }}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-4">
                  {visibleItems.map((item) => (
                    <button key={item.id} onClick={() => placeNewItem(item)} className="room-pixel-ui p-2 text-left text-white transition-transform hover:scale-[1.02]" style={{ background: room.coins >= item.cost ? '#2d4da9' : '#344579', opacity: room.coins >= item.cost ? 1 : 0.7 }}>
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

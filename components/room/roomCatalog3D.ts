import { RoomPlacedItem } from '../../types';

export type Category = 'furniture' | 'decor' | 'plants' | 'lighting' | 'cozy' | 'special';
export type Rarity = 'common' | 'rare' | 'legendary';
export type Idle = 'none' | 'sway' | 'twinkle' | 'flicker' | 'spin' | 'bounce' | 'swim';
export type VisualBlueprint = 'billboard' | 'angled-plane' | 'simple-mesh';
export type PropMount = 'floor' | 'back-wall';

export type PropKind =
  | 'bed' | 'chair' | 'beanbag' | 'bookshelf' | 'desk' | 'couch' | 'table' | 'tv'
  | 'lights' | 'balloon' | 'frame' | 'neon' | 'cactus' | 'lamp' | 'disco' | 'projector'
  | 'plant' | 'bonsai' | 'flower' | 'sunflower' | 'lantern' | 'candles' | 'pillows'
  | 'blanket' | 'mug' | 'books' | 'record' | 'fridge' | 'aquarium' | 'fireplace'
  | 'window' | 'portal' | 'robot';

export interface RoomCatalogItem {
  id: string;
  name: string;
  kind: PropKind;
  category: Category;
  cost: number;
  loveCost?: number;
  starCost?: number;
  rarity: Rarity;
  color: string;
  idle: Idle;
  footprint: [number, number];
  height: number;
  scale?: number;
  visualType?: VisualBlueprint;
  mount?: PropMount;
  spriteSize?: [number, number];
  anchorHeight?: number;
  defaultRotation?: number;
  playerLevelReq?: number;
  roomLevelReq?: number;
  bondLevelReq?: number;
  effectText?: string;
  gameplayTags?: string[];
}

export const ROOM_GRID_SIZE = 8;

export const ROOM_SHOP: RoomCatalogItem[] = [
  { id: 'double_bed', name: 'Heart Double Bed', kind: 'bed', category: 'furniture', cost: 180, rarity: 'rare', color: '#ff6fa8', idle: 'none', footprint: [2, 2], height: 0.82, scale: 1.05, visualType: 'angled-plane', spriteSize: [1.9, 1.45], roomLevelReq: 2, effectText: 'Raises offline cap and cozy gains.', gameplayTags: ['cozy', 'rest', 'functional'] },
  { id: 'gaming_chair', name: 'Gaming Chair', kind: 'chair', category: 'furniture', cost: 130, rarity: 'common', color: '#ef4444', idle: 'bounce', footprint: [1, 1], height: 0.95, visualType: 'angled-plane', spriteSize: [0.95, 1.3], effectText: 'Boosts desk and creator actions nearby.', gameplayTags: ['creator', 'support'] },
  { id: 'bean_bag', name: 'Lavender Bean Bag', kind: 'beanbag', category: 'furniture', cost: 95, rarity: 'common', color: '#b38cff', idle: 'bounce', footprint: [1, 1], height: 0.62, visualType: 'billboard', spriteSize: [1, 0.8] },
  { id: 'bookshelf_overflow', name: 'Overflow Bookshelf', kind: 'bookshelf', category: 'furniture', cost: 140, rarity: 'rare', color: '#f59e0b', idle: 'none', footprint: [1, 1], height: 1.25, visualType: 'angled-plane', spriteSize: [1.05, 1.7] },
  { id: 'l_desk', name: 'L-Shaped Desk', kind: 'desk', category: 'furniture', cost: 145, rarity: 'common', color: '#f97316', idle: 'none', footprint: [2, 1], height: 0.8, visualType: 'angled-plane', spriteSize: [1.9, 1.3], effectText: 'Unlocks stronger create actions and content income.', gameplayTags: ['creator', 'functional', 'core'] },
  { id: 'fluffy_couch', name: 'Fluffy Couch', kind: 'couch', category: 'furniture', cost: 160, rarity: 'rare', color: '#fb7185', idle: 'none', footprint: [2, 1], height: 0.72, visualType: 'angled-plane', spriteSize: [1.7, 1.12] },
  { id: 'coffee_table_round', name: 'Round Coffee Table', kind: 'table', category: 'furniture', cost: 88, rarity: 'common', color: '#c084fc', idle: 'none', footprint: [1, 1], height: 0.56, visualType: 'billboard', spriteSize: [0.9, 0.82] },
  { id: 'tv_stand_screen', name: 'TV Stand + Screen', kind: 'tv', category: 'furniture', cost: 175, rarity: 'rare', color: '#60a5fa', idle: 'twinkle', footprint: [2, 1], height: 0.86, visualType: 'angled-plane', spriteSize: [1.75, 1.2], playerLevelReq: 2, effectText: 'Adds passive viewers and creator synergy.', gameplayTags: ['creator', 'functional', 'tech'] },

  { id: 'string_lights', name: 'String Lights', kind: 'lights', category: 'decor', cost: 105, rarity: 'rare', color: '#fde047', idle: 'twinkle', footprint: [2, 1], height: 0.95, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.2, 0.92], anchorHeight: 2.06 },
  { id: 'heart_balloons', name: 'Heart Balloons', kind: 'balloon', category: 'decor', cost: 90, rarity: 'common', color: '#fb7185', idle: 'sway', footprint: [1, 1], height: 1.22 },
  { id: 'photo_frames', name: 'Couple Photo Frames', kind: 'frame', category: 'decor', cost: 80, loveCost: 12, rarity: 'common', color: '#93c5fd', idle: 'none', footprint: [1, 1], height: 0.88, mount: 'back-wall', visualType: 'billboard', spriteSize: [0.92, 1.08], anchorHeight: 1.52, effectText: 'Boosts memory rewards and couple progress.', gameplayTags: ['memory', 'couple', 'decor'] },
  { id: 'polaroid_wall', name: 'Polaroid Wall', kind: 'frame', category: 'decor', cost: 112, rarity: 'rare', color: '#f9a8d4', idle: 'none', footprint: [1, 1], height: 1.02, mount: 'back-wall', visualType: 'billboard', spriteSize: [1, 1.18], anchorHeight: 1.62 },
  { id: 'neon_us', name: 'Neon Us', kind: 'neon', category: 'decor', cost: 170, loveCost: 60, rarity: 'legendary', color: '#a78bfa', idle: 'twinkle', footprint: [1, 1], height: 0.86, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.02, 0.86], anchorHeight: 1.78, bondLevelReq: 2, effectText: 'Big couple synergy aura for nearby items.', gameplayTags: ['couple', 'memory', 'support'] },
  { id: 'cactus_gang', name: 'Cactus Gang', kind: 'cactus', category: 'decor', cost: 70, rarity: 'common', color: '#34d399', idle: 'sway', footprint: [1, 1], height: 0.84 },
  { id: 'lava_lamp', name: 'Lava Lamp', kind: 'lamp', category: 'decor', cost: 96, rarity: 'rare', color: '#fb923c', idle: 'flicker', footprint: [1, 1], height: 1.1 },
  { id: 'disco_ball', name: 'Disco Ball', kind: 'disco', category: 'decor', cost: 150, rarity: 'legendary', color: '#60a5fa', idle: 'spin', footprint: [1, 1], height: 1.02 },
  { id: 'star_projector', name: 'Starry Projector', kind: 'projector', category: 'decor', cost: 148, rarity: 'legendary', color: '#a5b4fc', idle: 'twinkle', footprint: [1, 1], height: 0.6, mount: 'back-wall', visualType: 'billboard', spriteSize: [0.96, 0.88], anchorHeight: 1.2 },

  { id: 'succulent_set', name: 'Succulent Set', kind: 'plant', category: 'plants', cost: 60, rarity: 'common', color: '#22c55e', idle: 'sway', footprint: [1, 1], height: 0.7 },
  { id: 'hanging_pothos', name: 'Hanging Pothos', kind: 'plant', category: 'plants', cost: 92, rarity: 'rare', color: '#16a34a', idle: 'sway', footprint: [1, 1], height: 1.08 },
  { id: 'bonsai_tree', name: 'Bonsai Tree', kind: 'bonsai', category: 'plants', cost: 130, rarity: 'rare', color: '#84cc16', idle: 'sway', footprint: [1, 1], height: 0.95, playerLevelReq: 2, effectText: 'Gives a balanced cozy + idle support bonus.', gameplayTags: ['cozy', 'idle', 'support'] },
  { id: 'flower_bouquet', name: 'Flower Bouquet', kind: 'flower', category: 'plants', cost: 72, rarity: 'common', color: '#f472b6', idle: 'sway', footprint: [1, 1], height: 0.78 },
  { id: 'sunflower_pot', name: 'Sunflower Pot', kind: 'sunflower', category: 'plants', cost: 84, rarity: 'common', color: '#f59e0b', idle: 'sway', footprint: [1, 1], height: 0.88 },

  { id: 'floor_lamp', name: 'Floor Lamp', kind: 'lamp', category: 'lighting', cost: 115, rarity: 'common', color: '#fbbf24', idle: 'flicker', footprint: [1, 1], height: 1.25, effectText: 'Buffs nearby creator and cozy items.', gameplayTags: ['support', 'light'] },
  { id: 'fairy_curtain', name: 'Fairy Light Curtain', kind: 'lights', category: 'lighting', cost: 138, rarity: 'rare', color: '#fef08a', idle: 'twinkle', footprint: [2, 1], height: 1.25, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.1, 1.34], anchorHeight: 1.92 },
  { id: 'paper_lantern', name: 'Paper Lantern', kind: 'lantern', category: 'lighting', cost: 104, rarity: 'common', color: '#fdba74', idle: 'sway', footprint: [1, 1], height: 0.95 },
  { id: 'candle_cluster', name: 'Candle Cluster', kind: 'candles', category: 'lighting', cost: 88, rarity: 'common', color: '#fde68a', idle: 'flicker', footprint: [1, 1], height: 0.5 },

  { id: 'pillows', name: 'Pile of Pillows', kind: 'pillows', category: 'cozy', cost: 80, rarity: 'common', color: '#c4b5fd', idle: 'bounce', footprint: [1, 1], height: 0.55 },
  { id: 'throw_blanket', name: 'Throw Blanket', kind: 'blanket', category: 'cozy', cost: 72, rarity: 'common', color: '#93c5fd', idle: 'none', footprint: [1, 1], height: 0.24 },
  { id: 'mug_coaster', name: 'Mug on Coaster', kind: 'mug', category: 'cozy', cost: 54, rarity: 'common', color: '#fb923c', idle: 'none', footprint: [1, 1], height: 0.36 },
  { id: 'book_stack', name: 'Stack of Books', kind: 'books', category: 'cozy', cost: 68, rarity: 'common', color: '#fca5a5', idle: 'none', footprint: [1, 1], height: 0.44 },
  { id: 'record_player', name: 'Record Player', kind: 'record', category: 'cozy', cost: 122, rarity: 'rare', color: '#818cf8', idle: 'spin', footprint: [1, 1], height: 0.52, roomLevelReq: 2, effectText: 'Adds memory vibes and passive room score.', gameplayTags: ['memory', 'cozy', 'functional'] },
  { id: 'mini_fridge', name: 'Mini Fridge', kind: 'fridge', category: 'cozy', cost: 118, rarity: 'rare', color: '#60a5fa', idle: 'none', footprint: [1, 1], height: 0.95 },

  { id: 'tiny_aquarium', name: 'Tiny Aquarium', kind: 'aquarium', category: 'special', cost: 190, starCost: 2, rarity: 'legendary', color: '#22d3ee', idle: 'swim', footprint: [2, 1], height: 0.78, playerLevelReq: 4, effectText: 'Generates passive coins and mood bonuses.', gameplayTags: ['idle', 'special', 'cozy'] },
  { id: 'fireplace', name: 'Fireplace', kind: 'fireplace', category: 'special', cost: 210, loveCost: 90, rarity: 'legendary', color: '#f97316', idle: 'flicker', footprint: [2, 1], height: 0.82, roomLevelReq: 4, effectText: 'Huge cozy engine and offline efficiency boost.', gameplayTags: ['cozy', 'idle', 'special'] },
  { id: 'starry_window', name: 'Starry Sky Window', kind: 'window', category: 'special', cost: 165, loveCost: 45, rarity: 'legendary', color: '#93c5fd', idle: 'twinkle', footprint: [1, 1], height: 1.02, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.02, 1.18], anchorHeight: 1.62, bondLevelReq: 2, effectText: 'Boosts memory actions and couple streak gains.', gameplayTags: ['memory', 'couple', 'special'] },
  { id: 'portal_door', name: 'Portal Door', kind: 'portal', category: 'special', cost: 240, starCost: 4, rarity: 'legendary', color: '#a78bfa', idle: 'spin', footprint: [1, 1], height: 1.18, mount: 'back-wall', visualType: 'billboard', spriteSize: [1, 1.66], anchorHeight: 1.22, playerLevelReq: 6, bondLevelReq: 3, effectText: 'Top-tier synergy piece for late game optimization.', gameplayTags: ['special', 'support', 'creator', 'couple'] },
  { id: 'cute_robot', name: 'Cute Robot Buddy', kind: 'robot', category: 'special', cost: 175, starCost: 3, rarity: 'legendary', color: '#94a3b8', idle: 'bounce', footprint: [1, 1], height: 0.88, playerLevelReq: 5, effectText: 'Adds companion rewards and rare drops.', gameplayTags: ['special', 'couple', 'idle'] },
];

export const ROOM_SHOP_BY_ID = Object.fromEntries(ROOM_SHOP.map((item) => [item.id, item])) as Record<string, RoomCatalogItem>;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const percentToGrid = (item: Pick<RoomPlacedItem, 'x' | 'y'>) => ({
  gx: clamp(Math.round((item.x / 100) * (ROOM_GRID_SIZE - 1)), 0, ROOM_GRID_SIZE - 1),
  gy: clamp(Math.round((item.y / 100) * (ROOM_GRID_SIZE - 1)), 0, ROOM_GRID_SIZE - 1),
});

export const gridToPercent = (gx: number, gy: number) => ({
  x: clamp((gx / (ROOM_GRID_SIZE - 1)) * 100, 0, 100),
  y: clamp((gy / (ROOM_GRID_SIZE - 1)) * 100, 0, 100),
});

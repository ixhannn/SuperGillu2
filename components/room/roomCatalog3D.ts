import { RoomPlacedItem } from '../../types';

export type Category = 'furniture' | 'decor' | 'plants' | 'lighting' | 'cozy' | 'special' | 'seasonal';
export type Rarity = 'common' | 'rare' | 'legendary';
export type Idle = 'none' | 'sway' | 'twinkle' | 'flicker' | 'spin' | 'bounce' | 'swim';
export type VisualBlueprint = 'billboard' | 'angled-plane' | 'simple-mesh';
export type PropMount = 'floor' | 'back-wall';

export type PropKind =
  // furniture (legacy)
  | 'bed' | 'chair' | 'beanbag' | 'bookshelf' | 'desk' | 'couch' | 'table' | 'tv'
  // furniture (new)
  | 'loveseat' | 'dresser' | 'vanity' | 'console_table' | 'kotatsu' | 'piano'
  | 'swing_chair' | 'pouf' | 'rocker'
  // decor (legacy)
  | 'lights' | 'balloon' | 'frame' | 'neon' | 'cactus' | 'lamp' | 'disco' | 'projector'
  // decor (new)
  | 'mirror' | 'rug' | 'gallery' | 'easel' | 'crystal' | 'snowglobe' | 'mood_orb'
  | 'wallclock' | 'pennant'
  // plants
  | 'plant' | 'bonsai' | 'flower' | 'sunflower' | 'terrarium'
  // lighting (more)
  | 'lantern' | 'candles' | 'chandelier' | 'salt_lamp'
  // cozy (legacy + new)
  | 'pillows' | 'blanket' | 'mug' | 'books' | 'record' | 'fridge'
  | 'tea_set' | 'gramophone' | 'guitar' | 'vinyl_box' | 'coffee_machine'
  // special
  | 'aquarium' | 'fireplace' | 'window' | 'portal' | 'robot' | 'cat_tree' | 'star_dome';

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
  /** Secondary accent — optional, used by richer painters when provided. */
  accent?: string;
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
  // ── FURNITURE ────────────────────────────────────────────────────────────
  { id: 'double_bed', name: 'Cloudline Bed', kind: 'bed', category: 'furniture', cost: 180, rarity: 'rare', color: '#ff8fbf', accent: '#f7d3e2', idle: 'none', footprint: [2, 2], height: 0.82, scale: 1.05, visualType: 'angled-plane', spriteSize: [2.05, 1.6], roomLevelReq: 2, effectText: 'A soft focal piece for your room.', gameplayTags: ['cozy', 'rest', 'functional'] },
  { id: 'canopy_bed', name: 'Canopy Bed', kind: 'bed', category: 'furniture', cost: 240, loveCost: 18, rarity: 'rare', color: '#c8a2ff', accent: '#f3e4ff', idle: 'sway', footprint: [2, 2], height: 1.62, scale: 1.05, visualType: 'angled-plane', spriteSize: [2.15, 2.05], roomLevelReq: 3, effectText: 'Romantic four-poster with drapes.', gameplayTags: ['cozy', 'romantic', 'rare'] },
  { id: 'gaming_chair', name: 'Sunset Chair', kind: 'chair', category: 'furniture', cost: 130, rarity: 'common', color: '#ef4444', accent: '#fdd5d5', idle: 'bounce', footprint: [1, 1], height: 0.95, visualType: 'angled-plane', spriteSize: [1.05, 1.4], effectText: 'Pairs beautifully with desks and reading corners.', gameplayTags: ['creator', 'support'] },
  { id: 'reading_armchair', name: 'Reading Armchair', kind: 'chair', category: 'furniture', cost: 165, rarity: 'rare', color: '#7d6ad8', accent: '#d9d2f5', idle: 'none', footprint: [1, 1], height: 0.98, visualType: 'angled-plane', spriteSize: [1.15, 1.45], effectText: 'Plush armchair with rolled arms.', gameplayTags: ['cozy', 'reader'] },
  { id: 'rocking_chair', name: 'Rocking Chair', kind: 'rocker', category: 'furniture', cost: 155, rarity: 'rare', color: '#a87545', accent: '#f0d0a0', idle: 'sway', footprint: [1, 1], height: 1.05, visualType: 'angled-plane', spriteSize: [1.1, 1.5], effectText: 'Gently rocks back and forth.', gameplayTags: ['cozy', 'rest'] },
  { id: 'bean_bag', name: 'Lavender Bean Bag', kind: 'beanbag', category: 'furniture', cost: 95, rarity: 'common', color: '#b38cff', accent: '#e2d5ff', idle: 'bounce', footprint: [1, 1], height: 0.62, visualType: 'billboard', spriteSize: [1.1, 0.95] },
  { id: 'pouf_round', name: 'Velvet Pouf', kind: 'pouf', category: 'furniture', cost: 78, rarity: 'common', color: '#f59e0b', accent: '#fde2a8', idle: 'none', footprint: [1, 1], height: 0.5, visualType: 'billboard', spriteSize: [0.95, 0.78] },
  { id: 'bookshelf_overflow', name: 'Story Shelf', kind: 'bookshelf', category: 'furniture', cost: 140, rarity: 'rare', color: '#a36844', accent: '#e8c79b', idle: 'none', footprint: [1, 1], height: 1.45, visualType: 'angled-plane', spriteSize: [1.1, 1.95] },
  { id: 'modular_shelf', name: 'Modular Wall Shelf', kind: 'bookshelf', category: 'furniture', cost: 168, rarity: 'rare', color: '#8a623f', accent: '#e6c39a', idle: 'none', footprint: [2, 1], height: 1.35, visualType: 'angled-plane', spriteSize: [1.95, 1.8] },
  { id: 'l_desk', name: 'Writing Desk', kind: 'desk', category: 'furniture', cost: 145, rarity: 'common', color: '#b07045', accent: '#ecd0a8', idle: 'none', footprint: [2, 1], height: 0.86, visualType: 'angled-plane', spriteSize: [2.05, 1.55], effectText: 'A grounded anchor for your shared corner.', gameplayTags: ['creator', 'functional', 'core'] },
  { id: 'fluffy_couch', name: 'Snuggle Sofa', kind: 'couch', category: 'furniture', cost: 160, rarity: 'rare', color: '#fb7185', accent: '#fed4dc', idle: 'none', footprint: [2, 1], height: 0.76, visualType: 'angled-plane', spriteSize: [1.95, 1.25] },
  { id: 'love_seat', name: 'Lover Seat', kind: 'loveseat', category: 'furniture', cost: 175, loveCost: 22, rarity: 'rare', color: '#e35d8c', accent: '#fadce6', idle: 'none', footprint: [2, 1], height: 0.78, visualType: 'angled-plane', spriteSize: [1.95, 1.3] },
  { id: 'coffee_table_round', name: 'Round Coffee Table', kind: 'table', category: 'furniture', cost: 88, rarity: 'common', color: '#c084fc', accent: '#e3d3ff', idle: 'none', footprint: [1, 1], height: 0.56, visualType: 'billboard', spriteSize: [1, 0.9] },
  { id: 'kotatsu_table', name: 'Kotatsu', kind: 'kotatsu', category: 'furniture', cost: 158, rarity: 'rare', color: '#7c4a2a', accent: '#f0c69b', idle: 'twinkle', footprint: [2, 1], height: 0.62, visualType: 'angled-plane', spriteSize: [1.85, 1.2], effectText: 'A warm low table with a heated blanket.' },
  { id: 'console_table', name: 'Console Table', kind: 'console_table', category: 'furniture', cost: 122, rarity: 'common', color: '#8a623f', accent: '#e8c79b', idle: 'none', footprint: [2, 1], height: 0.86, visualType: 'angled-plane', spriteSize: [1.9, 1.35] },
  { id: 'dresser_oak', name: 'Oak Dresser', kind: 'dresser', category: 'furniture', cost: 145, rarity: 'rare', color: '#9a6840', accent: '#ecc99a', idle: 'none', footprint: [2, 1], height: 1, visualType: 'angled-plane', spriteSize: [1.9, 1.5] },
  { id: 'vanity_set', name: 'Vanity & Mirror', kind: 'vanity', category: 'furniture', cost: 165, loveCost: 20, rarity: 'rare', color: '#c7a070', accent: '#f5e2c4', idle: 'none', footprint: [2, 1], height: 1.6, visualType: 'angled-plane', spriteSize: [1.95, 1.95] },
  { id: 'tv_stand_screen', name: 'Movie Night Console', kind: 'tv', category: 'furniture', cost: 175, rarity: 'rare', color: '#60a5fa', accent: '#cfe6ff', idle: 'twinkle', footprint: [2, 1], height: 0.92, visualType: 'angled-plane', spriteSize: [1.95, 1.4], playerLevelReq: 2, effectText: 'Perfect for long cozy evenings.', gameplayTags: ['creator', 'functional', 'tech'] },
  { id: 'upright_piano', name: 'Mini Upright Piano', kind: 'piano', category: 'furniture', cost: 280, loveCost: 30, starCost: 1, rarity: 'legendary', color: '#1c1622', accent: '#f7eccf', idle: 'none', footprint: [2, 1], height: 1.35, visualType: 'angled-plane', spriteSize: [1.95, 1.8], roomLevelReq: 4, effectText: 'A small wooden upright with ivory keys.' },
  { id: 'swing_chair_hanging', name: 'Hanging Swing Chair', kind: 'swing_chair', category: 'furniture', cost: 195, loveCost: 18, rarity: 'rare', color: '#f6c89a', accent: '#fce8d3', idle: 'sway', footprint: [1, 1], height: 1.7, visualType: 'angled-plane', spriteSize: [1.25, 2.1] },

  // ── DECOR ────────────────────────────────────────────────────────────────
  { id: 'string_lights', name: 'String Lights', kind: 'lights', category: 'decor', cost: 105, rarity: 'rare', color: '#fde047', accent: '#fff7d0', idle: 'twinkle', footprint: [2, 1], height: 0.95, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.3, 1.0], anchorHeight: 2.06 },
  { id: 'heart_balloons', name: 'Heart Balloons', kind: 'balloon', category: 'decor', cost: 90, rarity: 'common', color: '#fb7185', accent: '#fadcdb', idle: 'sway', footprint: [1, 1], height: 1.32 },
  { id: 'photo_frames', name: 'Memory Frames', kind: 'frame', category: 'decor', cost: 80, loveCost: 12, rarity: 'common', color: '#93c5fd', accent: '#fbe8b6', idle: 'none', footprint: [1, 1], height: 0.95, mount: 'back-wall', visualType: 'billboard', spriteSize: [1, 1.2], anchorHeight: 1.55, effectText: 'A place for your favorite moments.', gameplayTags: ['memory', 'couple', 'decor'] },
  { id: 'gallery_wall', name: 'Gallery Wall', kind: 'gallery', category: 'decor', cost: 158, loveCost: 18, rarity: 'rare', color: '#a78bfa', accent: '#f7d8e6', idle: 'none', footprint: [2, 1], height: 1.25, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.15, 1.55], anchorHeight: 1.7 },
  { id: 'polaroid_wall', name: 'Polaroid Wall', kind: 'frame', category: 'decor', cost: 112, rarity: 'rare', color: '#f9a8d4', accent: '#fff2f7', idle: 'none', footprint: [1, 1], height: 1.05, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.05, 1.25], anchorHeight: 1.62 },
  { id: 'neon_us', name: 'Our Neon Sign', kind: 'neon', category: 'decor', cost: 170, loveCost: 60, rarity: 'legendary', color: '#fb6fc6', accent: '#a78bfa', idle: 'twinkle', footprint: [1, 1], height: 0.86, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.1, 0.92], anchorHeight: 1.78, bondLevelReq: 2, effectText: 'A little glow that feels uniquely yours.', gameplayTags: ['couple', 'memory', 'support'] },
  { id: 'mirror_arch', name: 'Arch Mirror', kind: 'mirror', category: 'decor', cost: 158, rarity: 'rare', color: '#cdb88a', accent: '#e8f1ff', idle: 'none', footprint: [1, 1], height: 1.6, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.1, 2], anchorHeight: 1.45 },
  { id: 'floor_mirror', name: 'Standing Mirror', kind: 'mirror', category: 'decor', cost: 138, rarity: 'rare', color: '#c5ad84', accent: '#e3edf7', idle: 'none', footprint: [1, 1], height: 1.85, visualType: 'angled-plane', spriteSize: [0.9, 2.05] },
  { id: 'wall_clock', name: 'Wall Clock', kind: 'wallclock', category: 'decor', cost: 88, rarity: 'common', color: '#f5e8d2', accent: '#3b2f50', idle: 'none', footprint: [1, 1], height: 0.9, mount: 'back-wall', visualType: 'billboard', spriteSize: [0.95, 0.95], anchorHeight: 1.7 },
  { id: 'pennant_string', name: 'Pennant String', kind: 'pennant', category: 'decor', cost: 80, rarity: 'common', color: '#fbbf24', accent: '#fb7185', idle: 'sway', footprint: [2, 1], height: 0.7, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.2, 0.78], anchorHeight: 2.1 },
  { id: 'art_easel', name: 'Art Easel', kind: 'easel', category: 'decor', cost: 132, rarity: 'rare', color: '#a87545', accent: '#fef3c7', idle: 'none', footprint: [1, 1], height: 1.5, visualType: 'angled-plane', spriteSize: [1.15, 1.8] },
  { id: 'cactus_gang', name: 'Cactus Gang', kind: 'cactus', category: 'decor', cost: 70, rarity: 'common', color: '#34d399', accent: '#a8e8c4', idle: 'sway', footprint: [1, 1], height: 0.88 },
  { id: 'lava_lamp', name: 'Lava Lamp', kind: 'lamp', category: 'decor', cost: 96, rarity: 'rare', color: '#fb923c', accent: '#fff0d0', idle: 'flicker', footprint: [1, 1], height: 1.18 },
  { id: 'disco_ball', name: 'Disco Ball', kind: 'disco', category: 'decor', cost: 150, rarity: 'legendary', color: '#cfe2ff', accent: '#fef9c3', idle: 'spin', footprint: [1, 1], height: 1.05 },
  { id: 'star_projector', name: 'Starry Projector', kind: 'projector', category: 'decor', cost: 148, rarity: 'legendary', color: '#a5b4fc', accent: '#fdf4ff', idle: 'twinkle', footprint: [1, 1], height: 0.7, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.05, 0.95], anchorHeight: 1.2 },
  { id: 'crystal_cluster', name: 'Crystal Cluster', kind: 'crystal', category: 'decor', cost: 120, loveCost: 8, rarity: 'rare', color: '#a5b4fc', accent: '#f0e7ff', idle: 'twinkle', footprint: [1, 1], height: 0.55 },
  { id: 'snow_globe', name: 'Snow Globe', kind: 'snowglobe', category: 'decor', cost: 95, rarity: 'rare', color: '#dbeafe', accent: '#9c7245', idle: 'twinkle', footprint: [1, 1], height: 0.6 },
  { id: 'mood_orb', name: 'Mood Orb', kind: 'mood_orb', category: 'decor', cost: 102, loveCost: 10, rarity: 'rare', color: '#f0abfc', accent: '#a78bfa', idle: 'flicker', footprint: [1, 1], height: 0.62 },

  // ── PLANTS ───────────────────────────────────────────────────────────────
  { id: 'succulent_set', name: 'Succulent Set', kind: 'plant', category: 'plants', cost: 60, rarity: 'common', color: '#22c55e', accent: '#a7f3d0', idle: 'sway', footprint: [1, 1], height: 0.72 },
  { id: 'hanging_pothos', name: 'Hanging Pothos', kind: 'plant', category: 'plants', cost: 92, rarity: 'rare', color: '#16a34a', accent: '#bbf7d0', idle: 'sway', footprint: [1, 1], height: 1.18 },
  { id: 'bonsai_tree', name: 'Bonsai Tree', kind: 'bonsai', category: 'plants', cost: 130, rarity: 'rare', color: '#84cc16', accent: '#bef264', idle: 'sway', footprint: [1, 1], height: 1.05, playerLevelReq: 2, effectText: 'Gives a balanced cozy + idle support bonus.', gameplayTags: ['cozy', 'idle', 'support'] },
  { id: 'flower_bouquet', name: 'Flower Bouquet', kind: 'flower', category: 'plants', cost: 72, rarity: 'common', color: '#f472b6', accent: '#fbcfe8', idle: 'sway', footprint: [1, 1], height: 0.85 },
  { id: 'sunflower_pot', name: 'Sunflower Pot', kind: 'sunflower', category: 'plants', cost: 84, rarity: 'common', color: '#f59e0b', accent: '#fde68a', idle: 'sway', footprint: [1, 1], height: 0.95 },
  { id: 'moss_terrarium', name: 'Moss Terrarium', kind: 'terrarium', category: 'plants', cost: 118, rarity: 'rare', color: '#86efac', accent: '#bae6fd', idle: 'twinkle', footprint: [1, 1], height: 0.78 },
  { id: 'fiddle_leaf', name: 'Fiddle Leaf Fig', kind: 'plant', category: 'plants', cost: 145, rarity: 'rare', color: '#15803d', accent: '#bbf7d0', idle: 'sway', footprint: [1, 1], height: 1.55 },

  // ── LIGHTING ─────────────────────────────────────────────────────────────
  { id: 'floor_lamp', name: 'Floor Lamp', kind: 'lamp', category: 'lighting', cost: 115, rarity: 'common', color: '#fbbf24', accent: '#fef3c7', idle: 'flicker', footprint: [1, 1], height: 1.45, effectText: 'Buffs nearby creator and cozy items.', gameplayTags: ['support', 'light'] },
  { id: 'fairy_curtain', name: 'Fairy Light Curtain', kind: 'lights', category: 'lighting', cost: 138, rarity: 'rare', color: '#fef08a', accent: '#fff7d0', idle: 'twinkle', footprint: [2, 1], height: 1.55, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.2, 1.6], anchorHeight: 1.92 },
  { id: 'paper_lantern', name: 'Paper Lantern', kind: 'lantern', category: 'lighting', cost: 104, rarity: 'common', color: '#fdba74', accent: '#fff4d6', idle: 'sway', footprint: [1, 1], height: 1.05 },
  { id: 'candle_cluster', name: 'Candle Cluster', kind: 'candles', category: 'lighting', cost: 88, rarity: 'common', color: '#fde68a', accent: '#fff7d0', idle: 'flicker', footprint: [1, 1], height: 0.58 },
  { id: 'salt_lamp', name: 'Himalayan Salt Lamp', kind: 'salt_lamp', category: 'lighting', cost: 92, rarity: 'common', color: '#fb923c', accent: '#7c2d12', idle: 'flicker', footprint: [1, 1], height: 0.78 },
  { id: 'crystal_chandelier', name: 'Crystal Chandelier', kind: 'chandelier', category: 'lighting', cost: 220, loveCost: 25, starCost: 1, rarity: 'legendary', color: '#fbe7a8', accent: '#fef9c3', idle: 'twinkle', footprint: [1, 1], height: 1.1, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.5, 1.6], anchorHeight: 2.1 },

  // ── COZY ─────────────────────────────────────────────────────────────────
  { id: 'pillows', name: 'Pile of Pillows', kind: 'pillows', category: 'cozy', cost: 80, rarity: 'common', color: '#c4b5fd', accent: '#fde2e8', idle: 'bounce', footprint: [1, 1], height: 0.6 },
  { id: 'throw_blanket', name: 'Throw Blanket', kind: 'blanket', category: 'cozy', cost: 72, rarity: 'common', color: '#93c5fd', accent: '#dbeafe', idle: 'none', footprint: [1, 1], height: 0.28 },
  { id: 'mug_coaster', name: 'Mug on Coaster', kind: 'mug', category: 'cozy', cost: 54, rarity: 'common', color: '#fb923c', accent: '#fff0d0', idle: 'none', footprint: [1, 1], height: 0.42 },
  { id: 'book_stack', name: 'Stack of Books', kind: 'books', category: 'cozy', cost: 68, rarity: 'common', color: '#fca5a5', accent: '#fef3c7', idle: 'none', footprint: [1, 1], height: 0.5 },
  { id: 'record_player', name: 'Record Player', kind: 'record', category: 'cozy', cost: 122, rarity: 'rare', color: '#818cf8', accent: '#f0c69b', idle: 'spin', footprint: [1, 1], height: 0.6, roomLevelReq: 2, effectText: 'Brings a little soundtrack into the space.', gameplayTags: ['memory', 'cozy', 'functional'] },
  { id: 'gramophone', name: 'Gramophone', kind: 'gramophone', category: 'cozy', cost: 158, loveCost: 12, rarity: 'rare', color: '#a87545', accent: '#fbbf24', idle: 'spin', footprint: [1, 1], height: 1.05 },
  { id: 'vinyl_box', name: 'Vinyl Collection', kind: 'vinyl_box', category: 'cozy', cost: 92, rarity: 'common', color: '#7c4a2a', accent: '#fbbf24', idle: 'none', footprint: [1, 1], height: 0.55 },
  { id: 'mini_fridge', name: 'Mini Fridge', kind: 'fridge', category: 'cozy', cost: 118, rarity: 'rare', color: '#cbd5e1', accent: '#60a5fa', idle: 'none', footprint: [1, 1], height: 1 },
  { id: 'coffee_machine', name: 'Espresso Machine', kind: 'coffee_machine', category: 'cozy', cost: 145, rarity: 'rare', color: '#1c1622', accent: '#cbd5e1', idle: 'twinkle', footprint: [1, 1], height: 0.85 },
  { id: 'tea_set', name: 'Tea Set', kind: 'tea_set', category: 'cozy', cost: 88, rarity: 'common', color: '#fef3c7', accent: '#f9a8d4', idle: 'none', footprint: [1, 1], height: 0.5 },
  { id: 'guitar_lean', name: 'Acoustic Guitar', kind: 'guitar', category: 'cozy', cost: 142, rarity: 'rare', color: '#c08552', accent: '#f5deb3', idle: 'none', footprint: [1, 1], height: 1.45 },
  { id: 'pet_nook', name: 'Pet Nook', kind: 'pillows', category: 'cozy', cost: 110, rarity: 'rare', color: '#f59e0b', accent: '#fde68a', idle: 'bounce', footprint: [1, 1], height: 0.56, visualType: 'billboard', spriteSize: [1.05, 0.88], effectText: 'A soft corner for your little companion.', gameplayTags: ['pet', 'cozy'] },
  { id: 'area_rug', name: 'Area Rug', kind: 'rug', category: 'cozy', cost: 88, rarity: 'common', color: '#fb7185', accent: '#fde68a', idle: 'none', footprint: [2, 2], height: 0.04, visualType: 'angled-plane', spriteSize: [2.4, 2.4] },
  { id: 'persian_rug', name: 'Persian Rug', kind: 'rug', category: 'cozy', cost: 165, loveCost: 14, rarity: 'rare', color: '#b91c1c', accent: '#fcd34d', idle: 'none', footprint: [2, 2], height: 0.04, visualType: 'angled-plane', spriteSize: [2.5, 2.5] },

  // ── SPECIAL ──────────────────────────────────────────────────────────────
  { id: 'tiny_aquarium', name: 'Tiny Aquarium', kind: 'aquarium', category: 'special', cost: 190, starCost: 2, rarity: 'legendary', color: '#22d3ee', accent: '#bae6fd', idle: 'swim', footprint: [2, 1], height: 0.85, playerLevelReq: 4, effectText: 'Generates passive coins and mood bonuses.', gameplayTags: ['idle', 'special', 'cozy'] },
  { id: 'fireplace', name: 'Fireplace', kind: 'fireplace', category: 'special', cost: 210, loveCost: 90, rarity: 'legendary', color: '#a16242', accent: '#fb923c', idle: 'flicker', footprint: [2, 1], height: 1.05, roomLevelReq: 4, effectText: 'Huge cozy engine and offline efficiency boost.', gameplayTags: ['cozy', 'idle', 'special'] },
  { id: 'starry_window', name: 'Starry Sky Window', kind: 'window', category: 'special', cost: 165, loveCost: 45, rarity: 'legendary', color: '#1e1b4b', accent: '#fef08a', idle: 'twinkle', footprint: [1, 1], height: 1.12, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.15, 1.4], anchorHeight: 1.6, bondLevelReq: 2, effectText: 'Boosts memory actions and couple streak gains.', gameplayTags: ['memory', 'couple', 'special'] },
  { id: 'portal_door', name: 'Portal Door', kind: 'portal', category: 'special', cost: 240, starCost: 4, rarity: 'legendary', color: '#a78bfa', accent: '#fef9c3', idle: 'spin', footprint: [1, 1], height: 1.35, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.1, 1.85], anchorHeight: 1.22, playerLevelReq: 6, bondLevelReq: 3, effectText: 'Top-tier synergy piece for late game optimization.', gameplayTags: ['special', 'support', 'creator', 'couple'] },
  { id: 'cute_robot', name: 'Cute Robot Buddy', kind: 'robot', category: 'special', cost: 175, starCost: 3, rarity: 'legendary', color: '#94a3b8', accent: '#7dd3fc', idle: 'bounce', footprint: [1, 1], height: 0.92, playerLevelReq: 5, effectText: 'Adds companion rewards and rare drops.', gameplayTags: ['special', 'couple', 'idle'] },
  { id: 'cat_tree', name: 'Cat Tree', kind: 'cat_tree', category: 'special', cost: 165, rarity: 'rare', color: '#a16207', accent: '#fde68a', idle: 'sway', footprint: [1, 1], height: 1.5, effectText: 'A perch for a sleepy partner.' },
  { id: 'star_dome', name: 'Celestial Dome', kind: 'star_dome', category: 'special', cost: 235, loveCost: 50, starCost: 2, rarity: 'legendary', color: '#1e1b4b', accent: '#fef08a', idle: 'twinkle', footprint: [1, 1], height: 0.9 },
  { id: 'memory_shelf', name: 'Memory Shelf', kind: 'bookshelf', category: 'special', cost: 145, rarity: 'rare', color: '#c084fc', accent: '#fbcfe8', idle: 'none', footprint: [1, 1], height: 1.2, visualType: 'angled-plane', spriteSize: [1.1, 1.7], effectText: 'A shelf for photos, tiny keepsakes, and shared stories.', gameplayTags: ['memory', 'cozy'] },

  // ── SEASONAL ─────────────────────────────────────────────────────────────
  { id: 'rainy_window', name: 'Rainy Window', kind: 'window', category: 'seasonal', cost: 135, rarity: 'rare', color: '#475569', accent: '#8cb4ff', idle: 'twinkle', footprint: [1, 1], height: 1.12, mount: 'back-wall', visualType: 'billboard', spriteSize: [1.15, 1.4], anchorHeight: 1.62, effectText: 'A soft rainy-day mood for the room.', gameplayTags: ['seasonal', 'memory'] },
  { id: 'winter_wreath', name: 'Winter Wreath', kind: 'frame', category: 'seasonal', cost: 120, rarity: 'rare', color: '#15803d', accent: '#dc2626', idle: 'twinkle', footprint: [1, 1], height: 0.95, mount: 'back-wall', visualType: 'billboard', spriteSize: [1, 1.05], anchorHeight: 1.62, effectText: 'A festive little welcome for winter evenings.', gameplayTags: ['seasonal', 'decor'] },
  { id: 'valentine_ribbon', name: 'Valentine Ribbon', kind: 'lights', category: 'seasonal', cost: 118, rarity: 'rare', color: '#fb7185', accent: '#fff0f3', idle: 'twinkle', footprint: [2, 1], height: 1, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.18, 1.0], anchorHeight: 2.02, effectText: 'A romantic seasonal accent.', gameplayTags: ['seasonal', 'romantic'] },
  { id: 'birthday_bunting', name: 'Birthday Bunting', kind: 'pennant', category: 'seasonal', cost: 118, rarity: 'rare', color: '#fbbf24', accent: '#fb7185', idle: 'twinkle', footprint: [2, 1], height: 1, mount: 'back-wall', visualType: 'billboard', spriteSize: [2.18, 0.98], anchorHeight: 2.02, effectText: 'A joyful banner for birthdays and surprises.', gameplayTags: ['seasonal', 'fun'] },
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

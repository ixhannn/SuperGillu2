/**
 * Couple Room: emotional, non-gamified room logic.
 *
 * Focus: decoration, notes, gifts, and milestone-based unlocks.
 */

import { CoupleProfile, CoupleRoomState, RoomGift, RoomNote, RoomPlacedItem } from '../../types';
import { ROOM_SHOP, percentToGrid, gridToPercent, RoomCatalogItem } from './roomCatalog3D';

export const DEFAULT_COUPLE_ROOM: CoupleRoomState = {
  placedItems: [],
  roomName: 'Our Room',
  wallpaper: 'plain',
  floor: 'carpet',
  ambient: 'warm',
  notes: [],
  gifts: [],
  milestoneItems: [],
  seasonalUnlocks: [],
  createdAt: new Date().toISOString(),
};

export const MAX_PLACED_ITEMS = 36;

export const normalizeCoupleRoom = (raw?: Partial<CoupleRoomState>): CoupleRoomState => ({
  ...DEFAULT_COUPLE_ROOM,
  ...(raw || {}),
  placedItems: Array.isArray(raw?.placedItems) ? raw!.placedItems : [],
  notes: Array.isArray(raw?.notes) ? raw!.notes : [],
  gifts: Array.isArray(raw?.gifts) ? raw!.gifts : [],
  milestoneItems: Array.isArray(raw?.milestoneItems) ? raw!.milestoneItems : [],
  seasonalUnlocks: Array.isArray(raw?.seasonalUnlocks) ? raw!.seasonalUnlocks : [],
});

export const migrateFromOldRoom = (oldRoom: any): CoupleRoomState =>
  normalizeCoupleRoom({
    placedItems: Array.isArray(oldRoom?.placedItems) ? oldRoom.placedItems : [],
    roomName: oldRoom?.roomName || 'Our Room',
    wallpaper: oldRoom?.wallpaper || 'plain',
    floor: oldRoom?.floor || 'carpet',
    ambient: oldRoom?.ambient || 'warm',
    notes: [],
    gifts: [],
    milestoneItems: [],
    createdAt: oldRoom?.lastActiveAt || new Date().toISOString(),
  });

const preferredSlots: Array<[number, number]> = [
  [2, 4], [3, 4], [4, 4], [5, 4],
  [2, 3], [3, 3], [4, 3], [5, 3],
  [1, 4], [6, 4], [1, 3], [6, 3],
  [2, 5], [3, 5], [4, 5], [5, 5],
  [2, 2], [3, 2], [4, 2], [5, 2],
  [1, 5], [6, 5], [1, 2], [6, 2],
  [2, 1], [3, 1], [4, 1], [5, 1],
  [1, 1], [6, 1], [0, 4], [7, 4], [0, 3], [7, 3],
];

export const getNextFreeSlot = (room: CoupleRoomState): [number, number] => {
  const occupied = new Set(
    room.placedItems.map((entry) => {
      const { gx, gy } = percentToGrid(entry);
      return `${gx}:${gy}`;
    }),
  );
  const match = preferredSlots.find(([gx, gy]) => !occupied.has(`${gx}:${gy}`));
  return match || [2, 4];
};

export const canPlaceItem = (room: CoupleRoomState): boolean => room.placedItems.length < MAX_PLACED_ITEMS;

export const placeItem = (
  room: CoupleRoomState,
  item: RoomCatalogItem,
  placedBy: string,
): CoupleRoomState | { error: string } => {
  if (!canPlaceItem(room)) {
    return { error: `Room is full (max ${MAX_PLACED_ITEMS} items)` };
  }

  const [gx, gy] = getNextFreeSlot(room);
  const pos = gridToPercent(gx, gy);
  const newItem: RoomPlacedItem = {
    uid: crypto.randomUUID(),
    itemId: item.id,
    x: pos.x,
    y: pos.y,
    z: Date.now(),
    scale: 1,
    rotation: 0,
    placedBy,
  };

  return {
    ...room,
    placedItems: [...room.placedItems, newItem],
  };
};

export const removeItem = (room: CoupleRoomState, uid: string): CoupleRoomState => ({
  ...room,
  placedItems: room.placedItems.filter((item) => item.uid !== uid),
});

export const rotateItem = (room: CoupleRoomState, uid: string): CoupleRoomState => ({
  ...room,
  placedItems: room.placedItems.map((item) =>
    item.uid === uid
      ? { ...item, rotation: ((item.rotation || 0) + 90) % 360, z: Date.now() }
      : item,
  ),
});

export const moveItem = (
  room: CoupleRoomState,
  uid: string,
  gx: number,
  gy: number,
): CoupleRoomState => ({
  ...room,
  placedItems: room.placedItems.map((item) =>
    item.uid === uid ? { ...item, ...gridToPercent(gx, gy), z: Date.now() } : item,
  ),
});

const NOTE_COLORS = [
  '#fdf2f8', '#fef3c7', '#dbeafe', '#dcfce7', '#ede9fe',
  '#fff1f2', '#f0fdf4', '#faf5ff', '#fffbeb', '#f0f9ff',
];

export const addNote = (room: CoupleRoomState, text: string, author: string): CoupleRoomState => {
  const note: RoomNote = {
    id: crypto.randomUUID(),
    text: text.trim().slice(0, 200),
    author,
    createdAt: new Date().toISOString(),
    color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
  };
  return { ...room, notes: [note, ...room.notes].slice(0, 20) };
};

export const removeNote = (room: CoupleRoomState, noteId: string): CoupleRoomState => ({
  ...room,
  notes: room.notes.filter((note) => note.id !== noteId),
});

const GIFT_EMOJIS = ['🎁', '💝', '🌹', '💌', '🧸', '🍫', '🌸', '✨', '🎀', '💎'];

export { GIFT_EMOJIS };

export const addGift = (
  room: CoupleRoomState,
  from: string,
  emoji: string,
  message: string,
): CoupleRoomState => {
  const gift: RoomGift = {
    id: crypto.randomUUID(),
    from,
    emoji,
    message: message.trim().slice(0, 200),
    createdAt: new Date().toISOString(),
    opened: false,
  };
  return { ...room, gifts: [gift, ...room.gifts].slice(0, 30) };
};

export const openGift = (room: CoupleRoomState, giftId: string): CoupleRoomState => ({
  ...room,
  gifts: room.gifts.map((gift) => (gift.id === giftId ? { ...gift, opened: true } : gift)),
});

export const removeGift = (room: CoupleRoomState, giftId: string): CoupleRoomState => ({
  ...room,
  gifts: room.gifts.filter((gift) => gift.id !== giftId),
});

export interface MilestoneUnlockRule {
  milestoneType: 'streak' | 'date-set' | 'item-count' | 'days-together' | 'questions-shared' | 'nightlights-shared';
  threshold: number;
  itemId: string;
  title: string;
  description: string;
}

export const MILESTONE_UNLOCK_RULES: MilestoneUnlockRule[] = [
  { milestoneType: 'date-set', threshold: 1, itemId: 'photo_frames', title: 'First milestone', description: 'A frame for your first memory together.' },
  { milestoneType: 'streak', threshold: 7, itemId: 'candle_cluster', title: '7-day streak', description: 'A warm glow for showing up every day.' },
  { milestoneType: 'days-together', threshold: 30, itemId: 'flower_bouquet', title: '30 days together', description: 'A bouquet for your first month together.' },
  { milestoneType: 'questions-shared', threshold: 3, itemId: 'memory_shelf', title: '3 shared questions', description: 'A shelf for the little things you learn about each other.' },
  { milestoneType: 'item-count', threshold: 5, itemId: 'record_player', title: 'Room decorator', description: 'Your room is starting to feel lived in.' },
  { milestoneType: 'nightlights-shared', threshold: 1, itemId: 'rainy_window', title: 'First nightlight', description: 'A rainy-day window for soft evenings together.' },
  { milestoneType: 'streak', threshold: 30, itemId: 'neon_us', title: '30-day streak', description: 'A bright little sign for staying close.' },
  { milestoneType: 'days-together', threshold: 100, itemId: 'bonsai_tree', title: '100 days together', description: 'A bonsai that grows with your bond.' },
  { milestoneType: 'item-count', threshold: 10, itemId: 'starry_window', title: 'Dream home', description: 'A window to the dreams you are building together.' },
  { milestoneType: 'days-together', threshold: 365, itemId: 'fireplace', title: 'One year together', description: 'A warm hearth for your first year.' },
];

export const checkMilestoneUnlocks = (room: CoupleRoomState, profile: CoupleProfile): string[] => {
  const alreadyUnlocked = new Set(room.milestoneItems.map((milestone) => milestone.itemId));
  const newUnlocks: string[] = [];

  for (const rule of MILESTONE_UNLOCK_RULES) {
    if (alreadyUnlocked.has(rule.itemId)) continue;

    let met = false;
    switch (rule.milestoneType) {
      case 'streak':
        met = (profile.streakData?.count || 0) >= rule.threshold;
        break;
      case 'date-set':
        met = !!profile.anniversaryDate;
        break;
      case 'days-together':
        if (profile.anniversaryDate) {
          const days = Math.floor((Date.now() - new Date(profile.anniversaryDate).getTime()) / 86_400_000);
          met = days >= rule.threshold;
        }
        break;
      case 'item-count':
        met = room.placedItems.length >= rule.threshold;
        break;
      case 'questions-shared':
        met = (profile.questions?.length || 0) >= rule.threshold;
        break;
      case 'nightlights-shared':
        met = ((profile.nightlights?.length || 0) + (profile.presenceTraces?.length || 0)) >= rule.threshold;
        break;
    }

    if (met) newUnlocks.push(rule.itemId);
  }

  return newUnlocks;
};

export type RoomCategory = 'romantic' | 'cozy' | 'aesthetic' | 'fun' | 'memories' | 'seasonal';

export const CATEGORY_LABELS: Record<RoomCategory, string> = {
  romantic: 'Romantic',
  cozy: 'Cozy',
  aesthetic: 'Aesthetic',
  fun: 'Fun',
  memories: 'Memories',
  seasonal: 'Seasonal',
};

export const CATEGORY_EMOJIS: Record<RoomCategory, string> = {
  romantic: 'Heart',
  cozy: 'Cozy',
  aesthetic: 'Style',
  fun: 'Joy',
  memories: 'Memory',
  seasonal: 'Season',
};

const CATEGORY_MAP: Record<string, RoomCategory> = {
  furniture: 'cozy',
  decor: 'aesthetic',
  plants: 'aesthetic',
  lighting: 'romantic',
  cozy: 'cozy',
  special: 'memories',
  seasonal: 'seasonal',
};

export const getItemCategory = (item: RoomCatalogItem): RoomCategory => {
  if (['birthday_bunting', 'rainy_window', 'winter_wreath', 'valentine_ribbon'].includes(item.id)) return 'seasonal';
  if (['memory_shelf', 'photo_frames', 'polaroid_wall', 'neon_us', 'starry_window'].includes(item.id)) return 'memories';
  if (['heart_balloons', 'flower_bouquet', 'candle_cluster', 'double_bed'].includes(item.id)) return 'romantic';
  if (['disco_ball', 'cute_robot', 'cactus_gang', 'lava_lamp'].includes(item.id)) return 'fun';
  return CATEGORY_MAP[item.category] || 'cozy';
};

export const isItemMilestoneLocked = (item: RoomCatalogItem, room: CoupleRoomState): boolean => {
  const rule = MILESTONE_UNLOCK_RULES.find((candidate) => candidate.itemId === item.id);
  if (!rule) return false;
  return !room.milestoneItems.some((milestone) => milestone.itemId === item.id);
};

export const getMilestoneForItem = (itemId: string): MilestoneUnlockRule | undefined =>
  MILESTONE_UNLOCK_RULES.find((rule) => rule.itemId === itemId);

export const getShopItems = (
  room: CoupleRoomState,
  category: RoomCategory,
): Array<{
  item: RoomCatalogItem;
  locked: boolean;
  lockReason?: string;
}> =>
  ROOM_SHOP
    .filter((item) => getItemCategory(item) === category)
    .map((item) => {
      const rule = MILESTONE_UNLOCK_RULES.find((candidate) => candidate.itemId === item.id);
      const locked = rule ? !room.milestoneItems.some((milestone) => milestone.itemId === item.id) : false;
      return {
        item,
        locked,
        lockReason: locked && rule ? rule.title : undefined,
      };
    });

export const WALLPAPER_OPTIONS = [
  { value: 'plain', label: 'Warm plaster', swatch: 'linear-gradient(135deg,#e9ddd2,#ddd0c2)' },
  { value: 'stripes', label: 'Soft stripe', swatch: 'repeating-linear-gradient(90deg,#ebddd0 0 10px,#d8c7b7 10px 16px)' },
  { value: 'polka', label: 'Dot bloom', swatch: 'radial-gradient(circle at 30% 30%,#f8ecdf 0 10%,transparent 11%), #e6d8cb' },
  { value: 'hearts', label: 'Rose blush', swatch: 'linear-gradient(135deg,#e4d1cd,#efc2d0)' },
  { value: 'stars', label: 'Starlight', swatch: 'linear-gradient(135deg,#ece0d2,#f7ecdf)' },
  { value: 'wood', label: 'Wood panel', swatch: 'repeating-linear-gradient(90deg,#c99569 0 12px,#b37e57 12px 20px)' },
];

export const FLOOR_OPTIONS = [
  { value: 'hardwood', label: 'Honey wood', swatch: 'repeating-linear-gradient(90deg,#bc8961 0 12px,#9b6c4b 12px 20px)' },
  { value: 'carpet', label: 'Midnight rug', swatch: 'linear-gradient(135deg,#6c79c8,#4e5ca1)' },
  { value: 'tiles', label: 'Blue tile', swatch: 'linear-gradient(135deg,#9aa8ed,#7180c7)' },
  { value: 'cloud', label: 'Cloud blue', swatch: 'linear-gradient(135deg,#d8e8ff,#bed9ff)' },
  { value: 'grass', label: 'Garden', swatch: 'linear-gradient(135deg,#91d57a,#6fb45d)' },
  { value: 'marble', label: 'Pearl stone', swatch: 'linear-gradient(135deg,#f4f6fc,#dde4f0)' },
];

export const AMBIENT_OPTIONS = [
  { value: 'warm', label: 'Warm', color: '#f59e0b' },
  { value: 'cool', label: 'Cool', color: '#60a5fa' },
  { value: 'rainbow', label: 'Dream', color: '#f472b6' },
];

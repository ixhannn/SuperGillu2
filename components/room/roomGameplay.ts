import { CoupleProfile, RoomDailyState, RoomPlacedItem, RoomRunStats, RoomState, RoomUpgradeLevels } from '../../types';
import { ROOM_SHOP, ROOM_SHOP_BY_ID, RoomCatalogItem, percentToGrid } from './roomCatalog3D';

export type RoomActionId = 'create' | 'cozy' | 'memory' | 'couple';
export type RoomUpgradeKey = keyof RoomUpgradeLevels;

export interface RewardBundle {
  coins: number;
  love: number;
  stars: number;
  xp: number;
  roomXp: number;
  bondXp: number;
}

export interface RoomActionCard {
  id: RoomActionId;
  label: string;
  description: string;
  accent: string;
  unlocked: boolean;
  rewards: RewardBundle;
}

export interface CurrencyCost {
  coins: number;
  love: number;
  stars: number;
}

export interface RoomUpgradeCard {
  key: RoomUpgradeKey;
  label: string;
  description: string;
  level: number;
  maxLevel: number;
  cost: CurrencyCost;
  affordable: boolean;
}

export interface RoomTaskCard {
  id: string;
  tier: 'short' | 'mid' | 'long';
  title: string;
  description: string;
  progress: number;
  goal: number;
  rewards: RewardBundle;
  claimed: boolean;
}

export interface RoomCollectionCard {
  id: string;
  title: string;
  progress: number;
  goal: number;
  description: string;
  rewards: RewardBundle;
  claimed: boolean;
}

export interface RoomMetrics {
  creatorPower: number;
  cozyPower: number;
  memoryPower: number;
  couplePower: number;
  passiveCoinsPerHour: number;
  passiveLovePerHour: number;
  roomScore: number;
  synergyMultiplier: number;
  creatorMultiplier: number;
  cozyMultiplier: number;
  memoryMultiplier: number;
  coupleMultiplier: number;
  idleCapHours: number;
  idleEfficiency: number;
  uniqueItems: number;
  categoryCount: number;
  placedValue: number;
  collectionProgress: number;
}

interface ItemGameplayStats {
  tags: string[];
  creator: number;
  cozy: number;
  memory: number;
  couple: number;
  hourlyCoins: number;
  hourlyLove: number;
  roomScore: number;
  idleCap: number;
  idleEfficiency: number;
  boostTargets: string[];
  boostPct: number;
}

const DEFAULT_UPGRADES: RoomUpgradeLevels = {
  creatorRig: 0,
  cozyNook: 0,
  idleEngine: 0,
  storage: 0,
  bonding: 0,
};

const DEFAULT_DAILY: RoomDailyState = {
  streak: 0,
  bestStreak: 0,
  claimedTaskIds: [],
  claimedCollectionIds: [],
  actionsToday: 0,
  coinsToday: 0,
  coupleActionsToday: 0,
  giftsToday: 0,
  visitsToday: 0,
};

const DEFAULT_STATS: RoomRunStats = {
  actionsCompleted: 0,
  contentCreated: 0,
  cozyActions: 0,
  memoryActions: 0,
  coupleActions: 0,
  visitsCompleted: 0,
  giftsSent: 0,
  tasksCompleted: 0,
  itemsPurchased: 0,
  coinsEarned: 0,
  loveEarned: 0,
  starsEarned: 0,
};

export const DEFAULT_ROOM_STATE: RoomState = {
  placedItems: [],
  coins: 500,
  love: 30,
  stars: 3,
  xp: 0,
  roomXp: 0,
  bondXp: 0,
  roomName: 'P1 Room',
  wallpaper: 'plain',
  floor: 'carpet',
  ambient: 'warm',
  lastActiveAt: new Date().toISOString(),
  lastIdleClaimAt: new Date().toISOString(),
  purchaseCounts: {},
  upgrades: DEFAULT_UPGRADES,
  daily: DEFAULT_DAILY,
  stats: DEFAULT_STATS,
  unlockedThemes: ['plain', 'carpet', 'warm'],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toDayKey = (value: Date | string = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
};

const sameDay = (a?: string, b?: string) => Boolean(a && b && toDayKey(a) === toDayKey(b));

export const getXpForNextLevel = (level: number) => Math.round(40 + level * 18 + Math.pow(level, 1.4) * 6);

export const getLevelFromXp = (xp: number) => {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  let needed = getXpForNextLevel(level);
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = getXpForNextLevel(level);
  }
  return { level, progress: remaining, next: needed };
};

export const getRoomLevelFromXp = (roomXp: number) => {
  let level = 1;
  let remaining = Math.max(0, Math.floor(roomXp));
  let needed = Math.round(60 + level * 24 + Math.pow(level, 1.3) * 12);
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = Math.round(60 + level * 24 + Math.pow(level, 1.3) * 12);
  }
  return { level, progress: remaining, next: needed };
};

export const getBondLevelFromXp = (bondXp: number) => {
  let level = 1;
  let remaining = Math.max(0, Math.floor(bondXp));
  let needed = Math.round(55 + level * 18 + Math.pow(level, 1.28) * 10);
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = Math.round(55 + level * 18 + Math.pow(level, 1.28) * 10);
  }
  return { level, progress: remaining, next: needed };
};

const mergeUpgrades = (value?: Partial<RoomUpgradeLevels>): RoomUpgradeLevels => ({ ...DEFAULT_UPGRADES, ...(value || {}) });
const mergeDaily = (value?: Partial<RoomDailyState>): RoomDailyState => ({ ...DEFAULT_DAILY, ...(value || {}) });
const mergeStats = (value?: Partial<RoomRunStats>): RoomRunStats => ({ ...DEFAULT_STATS, ...(value || {}) });

export const normalizeRoomState = (raw?: Partial<RoomState>): RoomState => {
  const next: RoomState = {
    ...DEFAULT_ROOM_STATE,
    ...(raw || {}),
    placedItems: Array.isArray(raw?.placedItems)
      ? raw!.placedItems.map((item) => ({
        ...item,
        purchasePrice: Number.isFinite(item.purchasePrice) ? item.purchasePrice : undefined,
      }))
      : [],
    purchaseCounts: { ...(raw?.purchaseCounts || {}) },
    upgrades: mergeUpgrades(raw?.upgrades),
    daily: mergeDaily(raw?.daily),
    stats: mergeStats(raw?.stats),
    unlockedThemes: Array.isArray(raw?.unlockedThemes) ? raw!.unlockedThemes : [...DEFAULT_ROOM_STATE.unlockedThemes!],
  };

  const today = toDayKey();
  if (next.daily?.taskSeedDate && next.daily.taskSeedDate !== today) {
    next.daily = {
      ...next.daily,
      taskSeedDate: today,
      claimedTaskIds: [],
      actionsToday: 0,
      coinsToday: 0,
      coupleActionsToday: 0,
      giftsToday: 0,
      visitsToday: 0,
    };
  }
  if (!next.daily?.taskSeedDate) next.daily = { ...next.daily, taskSeedDate: today };
  if (!next.lastIdleClaimAt) next.lastIdleClaimAt = new Date().toISOString();
  if (!next.lastActiveAt) next.lastActiveAt = new Date().toISOString();
  return next;
};

const getOwnedCount = (room: RoomState, itemId: string) => room.placedItems.filter((entry) => entry.itemId === itemId).length;

const distance = (a: RoomPlacedItem, b: RoomPlacedItem) => {
  const ap = percentToGrid(a);
  const bp = percentToGrid(b);
  return Math.max(Math.abs(ap.gx - bp.gx), Math.abs(ap.gy - bp.gy));
};

const getItemGameplay = (item: RoomCatalogItem): ItemGameplayStats => {
  const base: ItemGameplayStats = {
    tags: [...(item.gameplayTags || []), item.category],
    creator: 0,
    cozy: 0,
    memory: 0,
    couple: 0,
    hourlyCoins: 0,
    hourlyLove: 0,
    roomScore: Math.max(6, Math.round(item.cost / 22)),
    idleCap: 0,
    idleEfficiency: 0,
    boostTargets: [],
    boostPct: 0,
  };

  switch (item.kind) {
    case 'desk':
      return { ...base, tags: [...base.tags, 'creator', 'core'], creator: 12, hourlyCoins: 10, roomScore: 16 };
    case 'chair':
      return { ...base, tags: [...base.tags, 'creator', 'support'], creator: 3, boostTargets: ['creator', 'desk'], boostPct: 0.15, roomScore: 10 };
    case 'tv':
      return { ...base, tags: [...base.tags, 'creator', 'tech'], creator: 9, hourlyCoins: 8, boostTargets: ['creator', 'cozy'], boostPct: 0.08, roomScore: 16 };
    case 'bookshelf':
      return { ...base, tags: [...base.tags, 'creator', 'memory'], creator: 5, memory: 4, hourlyCoins: 4, roomScore: 13 };
    case 'bed':
      return { ...base, tags: [...base.tags, 'cozy', 'rest'], cozy: 12, idleCap: 1.7, idleEfficiency: 0.04, roomScore: 18 };
    case 'couch':
    case 'beanbag':
      return { ...base, tags: [...base.tags, 'cozy'], cozy: item.kind === 'couch' ? 9 : 6, memory: 2, roomScore: 12 };
    case 'table':
      return { ...base, tags: [...base.tags, 'cozy'], cozy: 4, roomScore: 8 };
    case 'frame':
    case 'window':
    case 'neon':
      return { ...base, tags: [...base.tags, 'memory', 'couple'], memory: 9, couple: 6, hourlyLove: 4, roomScore: 14 };
    case 'lights':
    case 'lamp':
    case 'lantern':
    case 'candles':
    case 'disco':
      return { ...base, tags: [...base.tags, 'light', 'support'], cozy: 3, memory: 3, boostTargets: ['creator', 'cozy', 'memory'], boostPct: item.kind === 'disco' ? 0.12 : 0.08, roomScore: 10 };
    case 'plant':
    case 'bonsai':
    case 'flower':
    case 'sunflower':
    case 'cactus':
      return { ...base, tags: [...base.tags, 'cozy', 'nature'], cozy: 4, memory: 2, roomScore: 9, idleEfficiency: 0.02 };
    case 'blanket':
    case 'pillows':
      return { ...base, tags: [...base.tags, 'cozy'], cozy: 5, roomScore: 8 };
    case 'mug':
    case 'books':
      return { ...base, tags: [...base.tags, 'creator', 'cozy'], creator: 2, cozy: 3, roomScore: 7 };
    case 'record':
      return { ...base, tags: [...base.tags, 'memory', 'cozy'], memory: 6, cozy: 4, hourlyCoins: 3, roomScore: 11 };
    case 'fridge':
      return { ...base, tags: [...base.tags, 'idle', 'utility'], cozy: 2, hourlyCoins: 5, idleCap: 0.8, idleEfficiency: 0.03, roomScore: 11 };
    case 'projector':
      return { ...base, tags: [...base.tags, 'creator', 'memory'], creator: 5, memory: 5, boostTargets: ['creator'], boostPct: 0.1, roomScore: 12 };
    case 'aquarium':
      return { ...base, tags: [...base.tags, 'cozy', 'idle'], cozy: 6, hourlyCoins: 8, hourlyLove: 2, roomScore: 16, idleEfficiency: 0.04 };
    case 'fireplace':
      return { ...base, tags: [...base.tags, 'cozy', 'idle'], cozy: 10, hourlyCoins: 6, idleCap: 1.1, idleEfficiency: 0.05, roomScore: 18 };
    case 'portal':
      return { ...base, tags: [...base.tags, 'creator', 'couple', 'support'], creator: 8, couple: 8, boostTargets: ['creator', 'memory', 'couple'], boostPct: 0.15, roomScore: 20 };
    case 'robot':
      return { ...base, tags: [...base.tags, 'couple', 'companion'], couple: 10, hourlyCoins: 4, hourlyLove: 4, roomScore: 16 };
    case 'balloon':
      return { ...base, tags: [...base.tags, 'couple'], couple: 5, memory: 3, roomScore: 9 };
    default:
      return base;
  }
};

export const getThemeUnlocks = (room: RoomState) => {
  const roomLevel = getRoomLevelFromXp(room.roomXp || 0).level;
  const bondLevel = getBondLevelFromXp(room.bondXp || 0).level;
  const unlockedWallpapers = ['plain', 'stripes', 'polka'];
  if (roomLevel >= 2) unlockedWallpapers.push('hearts');
  if (roomLevel >= 3) unlockedWallpapers.push('wood');
  if (bondLevel >= 3) unlockedWallpapers.push('stars');

  const unlockedFloors = ['carpet', 'hardwood', 'tiles'];
  if (roomLevel >= 2) unlockedFloors.push('cloud');
  if (roomLevel >= 3) unlockedFloors.push('grass');
  if (roomLevel >= 4) unlockedFloors.push('marble');

  const unlockedAmbient = ['warm', 'cool'];
  if (bondLevel >= 3) unlockedAmbient.push('rainbow');
  return { unlockedWallpapers, unlockedFloors, unlockedAmbient };
};

export const getRoomMetrics = (room: RoomState, profile?: CoupleProfile): RoomMetrics => {
  const safe = normalizeRoomState(room);
  const upgrades = mergeUpgrades(safe.upgrades);
  const playerLevel = getLevelFromXp(safe.xp || 0).level;
  const roomLevel = getRoomLevelFromXp(safe.roomXp || 0).level;
  const bondLevel = getBondLevelFromXp(safe.bondXp || 0).level;
  const uniqueItems = new Set(safe.placedItems.map((entry) => entry.itemId)).size;
  const categoryCount = new Set(safe.placedItems.map((entry) => ROOM_SHOP_BY_ID[entry.itemId]?.category).filter(Boolean)).size;

  let creatorPower = 0;
  let cozyPower = 0;
  let memoryPower = 0;
  let couplePower = 0;
  let passiveCoinsPerHour = 6;
  let passiveLovePerHour = 0;
  let roomScore = 20;
  let idleCapHours = 4;
  let idleEfficiency = 0.52;
  let synergyHits = 0;
  let placedValue = 0;

  safe.placedItems.forEach((entry) => {
    const item = ROOM_SHOP_BY_ID[entry.itemId];
    if (!item) return;
    const stats = getItemGameplay(item);
    creatorPower += stats.creator;
    cozyPower += stats.cozy;
    memoryPower += stats.memory;
    couplePower += stats.couple;
    passiveCoinsPerHour += stats.hourlyCoins;
    passiveLovePerHour += stats.hourlyLove;
    roomScore += stats.roomScore;
    idleCapHours += stats.idleCap;
    idleEfficiency += stats.idleEfficiency;
    placedValue += entry.purchasePrice || item.cost;
  });

  safe.placedItems.forEach((source) => {
    const sourceItem = ROOM_SHOP_BY_ID[source.itemId];
    if (!sourceItem) return;
    const sourceStats = getItemGameplay(sourceItem);
    if (!sourceStats.boostTargets.length || sourceStats.boostPct <= 0) return;
    const boosted = safe.placedItems.some((target) => {
      if (target.uid === source.uid || distance(source, target) > 2) return false;
      const targetItem = ROOM_SHOP_BY_ID[target.itemId];
      if (!targetItem) return false;
      const targetStats = getItemGameplay(targetItem);
      return targetStats.tags.some((tag) => sourceStats.boostTargets.includes(tag));
    });
    if (boosted) synergyHits += sourceStats.boostPct;
  });

  const visitBonus = sameDay(safe.daily?.lastVisitDate, toDayKey()) ? 0.06 : 0;
  const streakBonus = Math.min((safe.daily?.streak || 0) * 0.01, 0.08);
  const coupleProfileBonus = profile?.streakData?.count ? Math.min(profile.streakData.count * 0.005, 0.06) : 0;
  const collectionProgress = uniqueItems / ROOM_SHOP.length;
  const synergyMultiplier = 1 + synergyHits + categoryCount * 0.025 + collectionProgress * 0.18;
  const creatorMultiplier = 1 + upgrades.creatorRig * 0.1 + synergyHits * 0.65 + playerLevel * 0.02 + visitBonus;
  const cozyMultiplier = 1 + upgrades.cozyNook * 0.08 + synergyHits * 0.35 + roomLevel * 0.015;
  const memoryMultiplier = 1 + upgrades.cozyNook * 0.04 + upgrades.bonding * 0.05 + synergyHits * 0.4 + coupleProfileBonus;
  const coupleMultiplier = 1 + upgrades.bonding * 0.11 + bondLevel * 0.03 + streakBonus + visitBonus + coupleProfileBonus;

  passiveCoinsPerHour = Math.round(passiveCoinsPerHour * (1 + upgrades.idleEngine * 0.14 + synergyHits * 0.35 + roomLevel * 0.02));
  passiveLovePerHour = Math.round(passiveLovePerHour * (1 + upgrades.bonding * 0.12 + bondLevel * 0.03 + synergyHits * 0.2));
  idleCapHours = clamp(idleCapHours + upgrades.storage * 2, 4, 18);
  idleEfficiency = clamp(idleEfficiency + upgrades.idleEngine * 0.06 + upgrades.storage * 0.03, 0.52, 0.92);
  roomScore = Math.round(roomScore + uniqueItems * 3 + categoryCount * 6 + placedValue / 80 + synergyHits * 40);

  return {
    creatorPower,
    cozyPower,
    memoryPower,
    couplePower,
    passiveCoinsPerHour,
    passiveLovePerHour,
    roomScore,
    synergyMultiplier,
    creatorMultiplier,
    cozyMultiplier,
    memoryMultiplier,
    coupleMultiplier,
    idleCapHours,
    idleEfficiency,
    uniqueItems,
    categoryCount,
    placedValue,
    collectionProgress,
  };
};

export const getDynamicItemCost = (room: RoomState, item: RoomCatalogItem): CurrencyCost => {
  const safe = normalizeRoomState(room);
  const purchaseCounts = safe.purchaseCounts || {};
  const categoryCount = purchaseCounts[`cat:${item.category}`] || 0;
  const sameItemCount = purchaseCounts[item.id] || getOwnedCount(safe, item.id);
  const multiplier = 1 + categoryCount * 0.12 + sameItemCount * 0.18;
  return {
    coins: Math.round(item.cost * multiplier),
    love: Math.round((item.loveCost || 0) * (1 + sameItemCount * 0.08)),
    stars: item.starCost || 0,
  };
};

export const canAffordCost = (room: RoomState, cost: CurrencyCost) => (
  room.coins >= cost.coins && (room.love || 0) >= cost.love && (room.stars || 0) >= cost.stars
);

export const isItemUnlocked = (room: RoomState, item: RoomCatalogItem) => {
  const playerLevel = getLevelFromXp(room.xp || 0).level;
  const roomLevel = getRoomLevelFromXp(room.roomXp || 0).level;
  const bondLevel = getBondLevelFromXp(room.bondXp || 0).level;
  return playerLevel >= (item.playerLevelReq || 1)
    && roomLevel >= (item.roomLevelReq || 1)
    && bondLevel >= (item.bondLevelReq || 1);
};

export const spendCost = (room: RoomState, cost: CurrencyCost): RoomState => ({
  ...room,
  coins: room.coins - cost.coins,
  love: (room.love || 0) - cost.love,
  stars: (room.stars || 0) - cost.stars,
});

const getActionReward = (room: RoomState, actionId: RoomActionId, profile?: CoupleProfile): RewardBundle => {
  const metrics = getRoomMetrics(room, profile);
  const playerLevel = getLevelFromXp(room.xp || 0).level;
  const roomLevel = getRoomLevelFromXp(room.roomXp || 0).level;
  const base: Record<RoomActionId, RewardBundle> = {
    create: { coins: 18, love: 1, stars: 0, xp: 10, roomXp: 6, bondXp: 1 },
    cozy: { coins: 11, love: 4, stars: 0, xp: 9, roomXp: 5, bondXp: 2 },
    memory: { coins: 9, love: 8, stars: 0, xp: 10, roomXp: 5, bondXp: 4 },
    couple: { coins: 8, love: 12, stars: 0, xp: 12, roomXp: 6, bondXp: 8 },
  };

  const reward = { ...base[actionId] };
  if (actionId === 'create') {
    reward.coins = Math.round((reward.coins + metrics.creatorPower * 1.7 + roomLevel * 1.4) * metrics.creatorMultiplier);
    reward.xp = Math.round(reward.xp + metrics.creatorPower * 0.5 + playerLevel * 0.4);
  } else if (actionId === 'cozy') {
    reward.coins = Math.round((reward.coins + metrics.cozyPower * 1.25) * metrics.cozyMultiplier);
    reward.love = Math.round((reward.love + metrics.cozyPower * 0.45) * Math.max(1, metrics.coupleMultiplier * 0.75));
    reward.xp = Math.round(reward.xp + metrics.cozyPower * 0.55);
  } else if (actionId === 'memory') {
    reward.coins = Math.round((reward.coins + metrics.memoryPower * 0.9) * Math.max(1, metrics.memoryMultiplier * 0.9));
    reward.love = Math.round((reward.love + metrics.memoryPower * 0.65 + metrics.couplePower * 0.3) * metrics.memoryMultiplier);
    reward.xp = Math.round(reward.xp + metrics.memoryPower * 0.6);
    reward.bondXp += Math.round(metrics.memoryPower * 0.5);
  } else {
    reward.coins = Math.round((reward.coins + metrics.couplePower * 0.8) * metrics.coupleMultiplier);
    reward.love = Math.round((reward.love + metrics.couplePower * 0.9 + metrics.memoryPower * 0.2) * metrics.coupleMultiplier);
    reward.xp = Math.round(reward.xp + metrics.couplePower * 0.7);
    reward.bondXp += Math.round(4 + metrics.couplePower * 0.9);
  }
  return reward;
};

export const getActionCards = (room: RoomState, profile?: CoupleProfile): RoomActionCard[] => {
  const metrics = getRoomMetrics(room, profile);
  return [
    {
      id: 'create',
      label: 'Create',
      description: 'Make something cute and turn creator power into coins + XP.',
      accent: '#f97316',
      unlocked: true,
      rewards: getActionReward(room, 'create', profile),
    },
    {
      id: 'cozy',
      label: 'Cozy Time',
      description: 'Use comfort items to build love, recovery, and steady income.',
      accent: '#8b5cf6',
      unlocked: metrics.cozyPower > 0,
      rewards: getActionReward(room, 'cozy', profile),
    },
    {
      id: 'memory',
      label: 'Memory',
      description: 'Turn decor and wall pieces into love and bond progress.',
      accent: '#ec4899',
      unlocked: metrics.memoryPower > 0,
      rewards: getActionReward(room, 'memory', profile),
    },
    {
      id: 'couple',
      label: 'Together',
      description: 'Cash in couple synergy for relationship XP and rare rewards.',
      accent: '#14b8a6',
      unlocked: true,
      rewards: getActionReward(room, 'couple', profile),
    },
  ];
};

export const applyAction = (room: RoomState, actionId: RoomActionId, profile?: CoupleProfile) => {
  const safe = normalizeRoomState(room);
  const reward = getActionReward(safe, actionId, profile);
  const daily = mergeDaily(safe.daily);
  const stats = mergeStats(safe.stats);
  daily.actionsToday = (daily.actionsToday || 0) + 1;
  daily.coinsToday = (daily.coinsToday || 0) + reward.coins;
  if (actionId === 'couple') daily.coupleActionsToday = (daily.coupleActionsToday || 0) + 1;

  stats.actionsCompleted += 1;
  stats.coinsEarned += reward.coins;
  stats.loveEarned += reward.love;
  stats.starsEarned += reward.stars;
  if (actionId === 'create') stats.contentCreated += 1;
  if (actionId === 'cozy') stats.cozyActions += 1;
  if (actionId === 'memory') stats.memoryActions += 1;
  if (actionId === 'couple') stats.coupleActions += 1;

  return {
    next: normalizeRoomState({
      ...safe,
      coins: safe.coins + reward.coins,
      love: (safe.love || 0) + reward.love,
      stars: (safe.stars || 0) + reward.stars,
      xp: (safe.xp || 0) + reward.xp,
      roomXp: (safe.roomXp || 0) + reward.roomXp,
      bondXp: (safe.bondXp || 0) + reward.bondXp,
      daily,
      stats,
      lastActiveAt: new Date().toISOString(),
      lastIdleClaimAt: safe.lastIdleClaimAt || new Date().toISOString(),
    }),
    reward,
  };
};

export const getOfflineRewards = (room: RoomState, profile?: CoupleProfile) => {
  const safe = normalizeRoomState(room);
  const metrics = getRoomMetrics(safe, profile);
  const from = new Date(safe.lastIdleClaimAt || safe.lastActiveAt || new Date().toISOString());
  const now = new Date();
  const elapsedHours = clamp((now.getTime() - from.getTime()) / 3_600_000, 0, metrics.idleCapHours);
  const coins = Math.max(0, Math.floor(metrics.passiveCoinsPerHour * elapsedHours * metrics.idleEfficiency));
  const love = Math.max(0, Math.floor(metrics.passiveLovePerHour * elapsedHours * metrics.idleEfficiency));
  const xp = Math.floor((coins * 0.14) + (love * 0.75));
  return {
    hours: elapsedHours,
    rewards: { coins, love, stars: 0, xp, roomXp: Math.floor(elapsedHours * 3), bondXp: Math.floor(love * 0.3) },
    claimable: elapsedHours >= 0.2 && (coins > 0 || love > 0),
  };
};

export const claimOfflineRewards = (room: RoomState, profile?: CoupleProfile) => {
  const safe = normalizeRoomState(room);
  const offline = getOfflineRewards(safe, profile);
  const stats = mergeStats(safe.stats);
  stats.coinsEarned += offline.rewards.coins;
  stats.loveEarned += offline.rewards.love;
  return {
    next: normalizeRoomState({
      ...safe,
      coins: safe.coins + offline.rewards.coins,
      love: (safe.love || 0) + offline.rewards.love,
      xp: (safe.xp || 0) + offline.rewards.xp,
      roomXp: (safe.roomXp || 0) + offline.rewards.roomXp,
      bondXp: (safe.bondXp || 0) + offline.rewards.bondXp,
      lastIdleClaimAt: new Date().toISOString(),
      stats,
    }),
    reward: offline.rewards,
  };
};

export const getDailyReward = (room: RoomState) => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  const today = toDayKey();
  const alreadyClaimed = sameDay(daily.lastClaimDate, today);
  const yesterday = toDayKey(new Date(Date.now() - 86_400_000));
  const nextStreak = daily.lastClaimDate === yesterday ? daily.streak + 1 : alreadyClaimed ? daily.streak : 1;
  const stars = nextStreak % 3 === 0 ? 1 : 0;
  return {
    eligible: !alreadyClaimed,
    streak: nextStreak,
    reward: {
      coins: 90 + nextStreak * 25,
      love: 8 + Math.floor(nextStreak / 2) * 3,
      stars,
      xp: 14 + nextStreak * 3,
      roomXp: 8 + nextStreak * 2,
      bondXp: 6 + nextStreak * 2,
    },
  };
};

export const claimDailyReward = (room: RoomState) => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  const next = getDailyReward(safe);
  const stats = mergeStats(safe.stats);
  const today = toDayKey();
  daily.lastClaimDate = today;
  daily.streak = next.streak;
  daily.bestStreak = Math.max(daily.bestStreak || 0, next.streak);
  stats.coinsEarned += next.reward.coins;
  stats.loveEarned += next.reward.love;
  stats.starsEarned += next.reward.stars;
  return {
    next: normalizeRoomState({
      ...safe,
      coins: safe.coins + next.reward.coins,
      love: (safe.love || 0) + next.reward.love,
      stars: (safe.stars || 0) + next.reward.stars,
      xp: (safe.xp || 0) + next.reward.xp,
      roomXp: (safe.roomXp || 0) + next.reward.roomXp,
      bondXp: (safe.bondXp || 0) + next.reward.bondXp,
      daily,
      stats,
    }),
    reward: next.reward,
  };
};

export const getUpgradeCards = (room: RoomState): RoomUpgradeCard[] => {
  const safe = normalizeRoomState(room);
  const upgrades = mergeUpgrades(safe.upgrades);
  const definitions: Array<{ key: RoomUpgradeKey; label: string; description: string; maxLevel: number; base: CurrencyCost }> = [
    { key: 'creatorRig', label: 'Creator Rig', description: 'Boost active create income and efficiency.', maxLevel: 12, base: { coins: 120, love: 0, stars: 0 } },
    { key: 'cozyNook', label: 'Cozy Nook', description: 'Makes cozy and memory loops stronger.', maxLevel: 10, base: { coins: 135, love: 12, stars: 0 } },
    { key: 'idleEngine', label: 'Idle Engine', description: 'Raises passive hourly generation.', maxLevel: 10, base: { coins: 160, love: 8, stars: 0 } },
    { key: 'storage', label: 'Storage Hub', description: 'Increases offline cap and return value.', maxLevel: 7, base: { coins: 190, love: 14, stars: 0 } },
    { key: 'bonding', label: 'Bond Loop', description: 'Improves couple rewards and shared bonuses.', maxLevel: 8, base: { coins: 140, love: 20, stars: 0 } },
  ];

  return definitions.map((definition) => {
    const level = upgrades[definition.key];
    const cost: CurrencyCost = {
      coins: Math.round(definition.base.coins * Math.pow(1.32, level)),
      love: Math.round(definition.base.love * Math.pow(1.24, level)),
      stars: definition.key === 'storage' && level >= 2 ? 1 + Math.floor((level - 2) / 2) : definition.key === 'bonding' && level >= 3 ? 1 : 0,
    };
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      level,
      maxLevel: definition.maxLevel,
      cost,
      affordable: level < definition.maxLevel && canAffordCost(safe, cost),
    };
  });
};

export const buyUpgrade = (room: RoomState, key: RoomUpgradeKey) => {
  const safe = normalizeRoomState(room);
  const upgrades = mergeUpgrades(safe.upgrades);
  const card = getUpgradeCards(safe).find((entry) => entry.key === key);
  if (!card || card.level >= card.maxLevel || !canAffordCost(safe, card.cost)) return null;
  upgrades[key] += 1;
  const spent = spendCost(safe, card.cost);
  return normalizeRoomState({
    ...spent,
    upgrades,
    xp: (spent.xp || 0) + 10,
    roomXp: (spent.roomXp || 0) + 18,
    bondXp: (spent.bondXp || 0) + (key === 'bonding' ? 14 : 0),
  });
};

export const getTaskCards = (room: RoomState, profile?: CoupleProfile): RoomTaskCard[] => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  const metrics = getRoomMetrics(safe, profile);
  const roomLevel = getRoomLevelFromXp(safe.roomXp || 0).level;
  const shortId = `short-${daily.taskSeedDate}`;
  const midId = `mid-${daily.taskSeedDate}`;
  const longId = `long-${roomLevel}`;

  return [
    {
      id: shortId,
      tier: 'short',
      title: 'Quick Session',
      description: 'Complete a fast burst of actions for immediate rewards.',
      progress: daily.actionsToday || 0,
      goal: 5 + Math.floor(getLevelFromXp(safe.xp || 0).level / 2),
      rewards: { coins: 90, love: 8, stars: 0, xp: 18, roomXp: 12, bondXp: 4 },
      claimed: daily.claimedTaskIds.includes(shortId),
    },
    {
      id: midId,
      tier: 'mid',
      title: 'Shared Momentum',
      description: 'Earn currency and perform couple actions in the same day.',
      progress: Math.min(999, Math.floor((daily.coinsToday || 0) / 40) + (daily.coupleActionsToday || 0) * 2),
      goal: 8 + roomLevel,
      rewards: { coins: 180, love: 16, stars: 1, xp: 26, roomXp: 16, bondXp: 10 },
      claimed: daily.claimedTaskIds.includes(midId),
    },
    {
      id: longId,
      tier: 'long',
      title: 'Room Milestone',
      description: 'Grow your room score and unique collection over time.',
      progress: Math.min(999, Math.floor(metrics.roomScore / 18) + metrics.uniqueItems),
      goal: 20 + roomLevel * 4,
      rewards: { coins: 260, love: 24, stars: 1, xp: 40, roomXp: 30, bondXp: 16 },
      claimed: daily.claimedTaskIds.includes(longId),
    },
  ];
};

export const claimTaskReward = (room: RoomState, taskId: string, profile?: CoupleProfile) => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  if (daily.claimedTaskIds.includes(taskId)) return null;
  const task = getTaskCards(safe, profile).find((entry) => entry.id === taskId);
  if (!task || task.progress < task.goal) return null;
  daily.claimedTaskIds = [...daily.claimedTaskIds, taskId];
  const stats = mergeStats(safe.stats);
  stats.tasksCompleted += 1;
  stats.coinsEarned += task.rewards.coins;
  stats.loveEarned += task.rewards.love;
  stats.starsEarned += task.rewards.stars;
  return {
    next: normalizeRoomState({
      ...safe,
      coins: safe.coins + task.rewards.coins,
      love: (safe.love || 0) + task.rewards.love,
      stars: (safe.stars || 0) + task.rewards.stars,
      xp: (safe.xp || 0) + task.rewards.xp,
      roomXp: (safe.roomXp || 0) + task.rewards.roomXp,
      bondXp: (safe.bondXp || 0) + task.rewards.bondXp,
      daily,
      stats,
    }),
    reward: task.rewards,
  };
};

export const getCollectionCards = (room: RoomState): RoomCollectionCard[] => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  const uniqueItems = new Set(safe.placedItems.map((entry) => entry.itemId)).size;
  const categoryIds = Array.from(new Set(safe.placedItems.map((entry) => ROOM_SHOP_BY_ID[entry.itemId]?.category).filter(Boolean)));
  return [
    {
      id: 'collection-unique-6',
      title: 'Collector I',
      progress: uniqueItems,
      goal: 6,
      description: 'Own six unique room items.',
      rewards: { coins: 120, love: 12, stars: 1, xp: 24, roomXp: 18, bondXp: 6 },
      claimed: daily.claimedCollectionIds.includes('collection-unique-6'),
    },
    {
      id: 'collection-unique-12',
      title: 'Collector II',
      progress: uniqueItems,
      goal: 12,
      description: 'Build a deeper room collection.',
      rewards: { coins: 220, love: 20, stars: 2, xp: 40, roomXp: 28, bondXp: 10 },
      claimed: daily.claimedCollectionIds.includes('collection-unique-12'),
    },
    {
      id: 'collection-categories',
      title: 'Whole Room',
      progress: categoryIds.length,
      goal: 5,
      description: 'Place items from five different categories.',
      rewards: { coins: 180, love: 18, stars: 1, xp: 30, roomXp: 22, bondXp: 8 },
      claimed: daily.claimedCollectionIds.includes('collection-categories'),
    },
  ];
};

export const claimCollectionReward = (room: RoomState, collectionId: string) => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  if (daily.claimedCollectionIds.includes(collectionId)) return null;
  const card = getCollectionCards(safe).find((entry) => entry.id === collectionId);
  if (!card || card.progress < card.goal) return null;
  daily.claimedCollectionIds = [...daily.claimedCollectionIds, collectionId];
  return {
    next: normalizeRoomState({
      ...safe,
      coins: safe.coins + card.rewards.coins,
      love: (safe.love || 0) + card.rewards.love,
      stars: (safe.stars || 0) + card.rewards.stars,
      xp: (safe.xp || 0) + card.rewards.xp,
      roomXp: (safe.roomXp || 0) + card.rewards.roomXp,
      bondXp: (safe.bondXp || 0) + card.rewards.bondXp,
      daily,
    }),
    reward: card.rewards,
  };
};

export const performCoupleVisit = (room: RoomState, profile?: CoupleProfile) => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  const today = toDayKey();
  if (sameDay(daily.lastVisitDate, today)) return null;
  const roomLevel = getRoomLevelFromXp(safe.roomXp || 0).level;
  const partnerStreak = profile?.streakData?.count || 0;
  const reward: RewardBundle = {
    coins: 70 + roomLevel * 14,
    love: 14 + Math.floor(partnerStreak * 0.5),
    stars: roomLevel >= 4 ? 1 : 0,
    xp: 18,
    roomXp: 12,
    bondXp: 16,
  };
  daily.lastVisitDate = today;
  daily.visitsToday = (daily.visitsToday || 0) + 1;
  const stats = mergeStats(safe.stats);
  stats.visitsCompleted += 1;
  return {
    next: normalizeRoomState({
      ...safe,
      coins: safe.coins + reward.coins,
      love: (safe.love || 0) + reward.love,
      stars: (safe.stars || 0) + reward.stars,
      xp: (safe.xp || 0) + reward.xp,
      roomXp: (safe.roomXp || 0) + reward.roomXp,
      bondXp: (safe.bondXp || 0) + reward.bondXp,
      daily,
      stats,
    }),
    reward,
  };
};

export const performGift = (room: RoomState) => {
  const safe = normalizeRoomState(room);
  const daily = mergeDaily(safe.daily);
  const today = toDayKey();
  if (sameDay(daily.lastGiftDate, today)) return null;
  const cost: CurrencyCost = { coins: 90, love: 0, stars: 0 };
  if (!canAffordCost(safe, cost)) return { error: 'Need 90 coins to send a gift.' };
  const reward: RewardBundle = {
    coins: 0,
    love: 20,
    stars: 0,
    xp: 14,
    roomXp: 8,
    bondXp: 18,
  };
  daily.lastGiftDate = today;
  daily.giftsToday = (daily.giftsToday || 0) + 1;
  const stats = mergeStats(safe.stats);
  stats.giftsSent += 1;
  return {
    next: normalizeRoomState({
      ...spendCost(safe, cost),
      love: (safe.love || 0) + reward.love,
      xp: (safe.xp || 0) + reward.xp,
      roomXp: (safe.roomXp || 0) + reward.roomXp,
      bondXp: (safe.bondXp || 0) + reward.bondXp,
      daily,
      stats,
    }),
    reward,
  };
};

export const getShopSummary = (room: RoomState) => {
  const safe = normalizeRoomState(room);
  const playerLevel = getLevelFromXp(safe.xp || 0).level;
  const roomLevel = getRoomLevelFromXp(safe.roomXp || 0).level;
  const bondLevel = getBondLevelFromXp(safe.bondXp || 0).level;
  return ROOM_SHOP.map((item) => {
    const cost = getDynamicItemCost(safe, item);
    return {
      item,
      cost,
      unlocked: playerLevel >= (item.playerLevelReq || 1)
        && roomLevel >= (item.roomLevelReq || 1)
        && bondLevel >= (item.bondLevelReq || 1),
      affordable: canAffordCost(safe, cost),
    };
  });
};

export const applyPurchase = (room: RoomState, item: RoomCatalogItem, newItem: RoomPlacedItem) => {
  const safe = normalizeRoomState(room);
  const cost = getDynamicItemCost(safe, item);
  if (!isItemUnlocked(safe, item)) return { error: 'Item is still locked.' };
  if (!canAffordCost(safe, cost)) return { error: 'Not enough resources.' };
  const purchaseCounts = { ...(safe.purchaseCounts || {}) };
  purchaseCounts[item.id] = (purchaseCounts[item.id] || 0) + 1;
  purchaseCounts[`cat:${item.category}`] = (purchaseCounts[`cat:${item.category}`] || 0) + 1;
  const stats = mergeStats(safe.stats);
  stats.itemsPurchased += 1;
  const spent = spendCost(safe, cost);
  return {
    next: normalizeRoomState({
      ...spent,
      placedItems: [...safe.placedItems, { ...newItem, purchasePrice: cost.coins }],
      xp: (safe.xp || 0) + 8,
      roomXp: (safe.roomXp || 0) + Math.round(item.cost * 0.35),
      bondXp: (safe.bondXp || 0) + Math.round((item.loveCost || 0) * 0.25),
      purchaseCounts,
      stats,
      lastActiveAt: new Date().toISOString(),
    }),
    cost,
  };
};

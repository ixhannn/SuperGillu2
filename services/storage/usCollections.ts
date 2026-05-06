import type { CoupleProfile, UsBucketItem, UsMilestone, UsWishlistItem } from '../../types';

type StorageSource = 'user' | 'sync';
type StorageAction = 'save' | 'delete';

type StorageUpdateDetail = {
  source: StorageSource;
  action: StorageAction;
  table: string;
  id: string;
  item?: unknown;
};

type UsCollectionsCache = {
  usBucketItems: UsBucketItem[];
  usWishlistItems: UsWishlistItem[];
  usMilestones: UsMilestone[];
};

type UsCollectionsCacheKeys = {
  US_BUCKET_ITEMS: string;
  US_WISHLIST_ITEMS: string;
  US_MILESTONES: string;
};

type UsCollectionsContext = {
  cache: UsCollectionsCache;
  cacheKeys: UsCollectionsCacheKeys;
  getCoupleProfile: () => CoupleProfile;
  sanitizeUserContent: <T>(value: T) => T;
  addPendingDelete: (table: string, id: string) => void;
  notifyUpdate: (detail: StorageUpdateDetail) => void;
  persistData: (storageKey: string, value: unknown) => Promise<void>;
};

const parseJsonList = <T,>(raw: string | null): T[] => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistWithLegacyMirror = (
  storageKey: string,
  legacyKey: string,
  value: unknown,
  persistData: (storageKey: string, value: unknown) => Promise<void>,
) => {
  const serialized = JSON.stringify(value);
  localStorage.setItem(storageKey, serialized);
  localStorage.setItem(legacyKey, serialized);
  void persistData(storageKey, value);
};

export const createUsCollectionsStorageDomain = (ctx: UsCollectionsContext) => ({
  getUsBucketItems: (): UsBucketItem[] => {
    if (ctx.cache.usBucketItems.length > 0) return ctx.cache.usBucketItems;
    ctx.cache.usBucketItems = parseJsonList<UsBucketItem>(
      localStorage.getItem(ctx.cacheKeys.US_BUCKET_ITEMS) || localStorage.getItem('lior_bucket'),
    );
    return ctx.cache.usBucketItems;
  },

  saveUsBucketItem: (item: UsBucketItem, source: StorageSource = 'user') => {
    const sanitized = ctx.sanitizeUserContent(item);
    const list = [...(ctx.cache.usBucketItems.length > 0 ? ctx.cache.usBucketItems : parseJsonList<UsBucketItem>(
      localStorage.getItem(ctx.cacheKeys.US_BUCKET_ITEMS) || localStorage.getItem('lior_bucket'),
    ))];
    const idx = list.findIndex((it) => it.id === sanitized.id);
    if (idx >= 0) list[idx] = sanitized;
    else list.unshift(sanitized);
    ctx.cache.usBucketItems = list;
    persistWithLegacyMirror(ctx.cacheKeys.US_BUCKET_ITEMS, 'lior_bucket', list, ctx.persistData);
    ctx.notifyUpdate({ source, action: 'save', table: 'us_bucket_items', id: sanitized.id, item: sanitized });
  },

  deleteUsBucketItem: (id: string, source: StorageSource = 'user') => {
    if (source === 'user') ctx.addPendingDelete('us_bucket_items', id);
    ctx.cache.usBucketItems = (ctx.cache.usBucketItems.length > 0 ? ctx.cache.usBucketItems : parseJsonList<UsBucketItem>(
      localStorage.getItem(ctx.cacheKeys.US_BUCKET_ITEMS) || localStorage.getItem('lior_bucket'),
    )).filter((it) => it.id !== id);
    persistWithLegacyMirror(ctx.cacheKeys.US_BUCKET_ITEMS, 'lior_bucket', ctx.cache.usBucketItems, ctx.persistData);
    ctx.notifyUpdate({ source, action: 'delete', table: 'us_bucket_items', id });
  },

  getUsWishlistItems: (): UsWishlistItem[] => {
    if (ctx.cache.usWishlistItems.length > 0) return ctx.cache.usWishlistItems;
    const parsed = parseJsonList<Record<string, unknown>>(
      localStorage.getItem(ctx.cacheKeys.US_WISHLIST_ITEMS) || localStorage.getItem('lior_wishlist'),
    );
    const profile = ctx.getCoupleProfile();
    ctx.cache.usWishlistItems = parsed.map((item) => {
      if (typeof item.ownerName === 'string' && item.ownerName.trim()) {
        return item as unknown as UsWishlistItem;
      }
      if (item.owner === 'partner') {
        return { ...item, ownerName: profile.partnerName } as UsWishlistItem;
      }
      return { ...item, ownerName: profile.myName } as UsWishlistItem;
    });
    return ctx.cache.usWishlistItems;
  },

  saveUsWishlistItem: (item: UsWishlistItem, source: StorageSource = 'user') => {
    const sanitized = ctx.sanitizeUserContent(item);
    const list = [...(ctx.cache.usWishlistItems.length > 0 ? ctx.cache.usWishlistItems : (() => {
      const parsed = parseJsonList<Record<string, unknown>>(
        localStorage.getItem(ctx.cacheKeys.US_WISHLIST_ITEMS) || localStorage.getItem('lior_wishlist'),
      );
      const profile = ctx.getCoupleProfile();
      return parsed.map((entry) => {
        if (typeof entry.ownerName === 'string' && entry.ownerName.trim()) {
          return entry as unknown as UsWishlistItem;
        }
        if (entry.owner === 'partner') {
          return { ...entry, ownerName: profile.partnerName } as UsWishlistItem;
        }
        return { ...entry, ownerName: profile.myName } as UsWishlistItem;
      });
    })())];
    const idx = list.findIndex((it) => it.id === sanitized.id);
    if (idx >= 0) list[idx] = sanitized;
    else list.unshift(sanitized);
    ctx.cache.usWishlistItems = list;
    persistWithLegacyMirror(ctx.cacheKeys.US_WISHLIST_ITEMS, 'lior_wishlist', list, ctx.persistData);
    ctx.notifyUpdate({ source, action: 'save', table: 'us_wishlist_items', id: sanitized.id, item: sanitized });
  },

  deleteUsWishlistItem: (id: string, source: StorageSource = 'user') => {
    if (source === 'user') ctx.addPendingDelete('us_wishlist_items', id);
    ctx.cache.usWishlistItems = (ctx.cache.usWishlistItems.length > 0 ? ctx.cache.usWishlistItems : (() => {
      const parsed = parseJsonList<Record<string, unknown>>(
        localStorage.getItem(ctx.cacheKeys.US_WISHLIST_ITEMS) || localStorage.getItem('lior_wishlist'),
      );
      const profile = ctx.getCoupleProfile();
      return parsed.map((entry) => {
        if (typeof entry.ownerName === 'string' && entry.ownerName.trim()) {
          return entry as unknown as UsWishlistItem;
        }
        if (entry.owner === 'partner') {
          return { ...entry, ownerName: profile.partnerName } as UsWishlistItem;
        }
        return { ...entry, ownerName: profile.myName } as UsWishlistItem;
      });
    })())
      .filter((it) => it.id !== id);
    persistWithLegacyMirror(ctx.cacheKeys.US_WISHLIST_ITEMS, 'lior_wishlist', ctx.cache.usWishlistItems, ctx.persistData);
    ctx.notifyUpdate({ source, action: 'delete', table: 'us_wishlist_items', id });
  },

  getUsMilestones: (): UsMilestone[] => {
    if (ctx.cache.usMilestones.length > 0) return ctx.cache.usMilestones;
    ctx.cache.usMilestones = parseJsonList<UsMilestone>(
      localStorage.getItem(ctx.cacheKeys.US_MILESTONES) || localStorage.getItem('lior_milestones'),
    );
    return ctx.cache.usMilestones;
  },

  saveUsMilestone: (item: UsMilestone, source: StorageSource = 'user') => {
    const sanitized = ctx.sanitizeUserContent(item);
    const list = [...(ctx.cache.usMilestones.length > 0 ? ctx.cache.usMilestones : parseJsonList<UsMilestone>(
      localStorage.getItem(ctx.cacheKeys.US_MILESTONES) || localStorage.getItem('lior_milestones'),
    ))];
    const idx = list.findIndex((it) => it.id === sanitized.id);
    if (idx >= 0) list[idx] = sanitized;
    else list.push(sanitized);
    ctx.cache.usMilestones = list;
    persistWithLegacyMirror(ctx.cacheKeys.US_MILESTONES, 'lior_milestones', list, ctx.persistData);
    ctx.notifyUpdate({ source, action: 'save', table: 'us_milestones', id: sanitized.id, item: sanitized });
  },

  deleteUsMilestone: (id: string, source: StorageSource = 'user') => {
    if (source === 'user') ctx.addPendingDelete('us_milestones', id);
    ctx.cache.usMilestones = (ctx.cache.usMilestones.length > 0 ? ctx.cache.usMilestones : parseJsonList<UsMilestone>(
      localStorage.getItem(ctx.cacheKeys.US_MILESTONES) || localStorage.getItem('lior_milestones'),
    )).filter((it) => it.id !== id);
    persistWithLegacyMirror(ctx.cacheKeys.US_MILESTONES, 'lior_milestones', ctx.cache.usMilestones, ctx.persistData);
    ctx.notifyUpdate({ source, action: 'delete', table: 'us_milestones', id });
  },
});

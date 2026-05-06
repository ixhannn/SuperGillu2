import type { PrivateSpaceItem, Surprise, TimeCapsule, VoiceNote } from '../../types';
import { estimateDataUriBytes, getMimeTypeFromDataUri } from '../../shared/mediaPolicy.js';
import { MediaStorageService } from '../mediaStorage';

type StorageSource = 'user' | 'sync';
type StorageAction = 'save' | 'delete';
type ManagedFeature = 'voice-notes' | 'private-space';

type StorageUpdateDetail = {
  source: StorageSource;
  action: StorageAction;
  table: string;
  id: string;
  item?: unknown;
};

type VoiceNoteAudioSaveResult = {
  storagePath: string | null;
  byteSize: number;
  mimeType: string;
};

type PersonalCollectionsCache = {
  timeCapsules: TimeCapsule[];
  surprises: Surprise[];
  voiceNotes: VoiceNote[];
  privateSpaceItems: PrivateSpaceItem[];
};

type PersonalCollectionsCacheKeys = {
  TIME_CAPSULES: string;
  SURPRISES: string;
  VOICE_NOTES: string;
  PRIVATE_SPACE_ITEMS: string;
};

type SaveInternal = (
  listKey: keyof PersonalCollectionsCache,
  storageKey: string,
  item: any,
  prefix?: string,
  table?: string,
  source?: StorageSource,
) => Promise<void>;

type PersonalCollectionsContext = {
  cache: PersonalCollectionsCache;
  cacheKeys: PersonalCollectionsCacheKeys;
  addPendingDelete: (table: string, id: string) => void;
  notifyUpdate: (detail: StorageUpdateDetail) => void;
  saveInternal: SaveInternal;
  persistData: (storageKey: string, value: unknown) => Promise<void>;
  readMedia: (id: string) => Promise<string | undefined>;
  writeMedia: (id: string, value: string) => Promise<void>;
  deleteMediaBlob: (id: string) => Promise<void>;
  deleteMemoryCache: (id: string) => void;
  sanitizeUserContent: <T>(value: T) => T;
  resolveOwnerUserId: (item: any, source: StorageSource, existingItem?: any) => Promise<string | undefined>;
  stripInternalRowMeta: <T extends Record<string, any>>(item: T) => T;
  isInlineMediaPayload: (value?: string | null) => boolean;
  extractInlineMediaMeta: (value?: string | null) => { bytes: number; mimeType: string } | null;
  assertManagedStorageBudget: (feature: ManagedFeature, incomingBytes: number, replacedBytes?: number) => void;
  nowIso: () => string;
};

const parseJsonList = <T,>(raw: string | null): T[] => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const createPersonalCollectionsStorageDomain = (ctx: PersonalCollectionsContext) => ({
  getTimeCapsules: (): TimeCapsule[] => {
    if (ctx.cache.timeCapsules.length > 0) return ctx.cache.timeCapsules;
    ctx.cache.timeCapsules = parseJsonList<TimeCapsule>(localStorage.getItem(ctx.cacheKeys.TIME_CAPSULES));
    return ctx.cache.timeCapsules;
  },

  saveTimeCapsule: (item: TimeCapsule) => ctx.saveInternal('timeCapsules', ctx.cacheKeys.TIME_CAPSULES, item, 'cap', 'time_capsules'),

  deleteTimeCapsule: async (id: string) => {
    ctx.addPendingDelete('time_capsules', id);
    const item = ctx.cache.timeCapsules.find((entry) => entry.id === id);
    if (item?.imageId) await ctx.deleteMediaBlob(item.imageId);
    if (item?.storagePath) void MediaStorageService.deleteMedia(item.storagePath);
    ctx.cache.timeCapsules = ctx.cache.timeCapsules.filter((entry) => entry.id !== id);
    await ctx.persistData(ctx.cacheKeys.TIME_CAPSULES, ctx.cache.timeCapsules);
    ctx.notifyUpdate({ source: 'user', action: 'delete', table: 'time_capsules', id });
  },

  unlockTimeCapsule: async (id: string) => {
    if (!ctx.cache.timeCapsules.some((entry) => entry.id === id)) return;
    ctx.cache.timeCapsules = ctx.cache.timeCapsules.map((entry) =>
      entry.id === id ? { ...entry, isUnlocked: true } : entry,
    );
    await ctx.persistData(ctx.cacheKeys.TIME_CAPSULES, ctx.cache.timeCapsules);
    ctx.notifyUpdate({ source: 'user', action: 'save', table: 'time_capsules', id });
  },

  getSurprises: (): Surprise[] => {
    if (ctx.cache.surprises.length > 0) return ctx.cache.surprises;
    ctx.cache.surprises = parseJsonList<Surprise>(localStorage.getItem(ctx.cacheKeys.SURPRISES));
    return ctx.cache.surprises;
  },

  saveSurprise: (item: Surprise) => ctx.saveInternal('surprises', ctx.cacheKeys.SURPRISES, item, 'surp', 'surprises'),

  deleteSurprise: async (id: string) => {
    ctx.addPendingDelete('surprises', id);
    const item = ctx.cache.surprises.find((entry) => entry.id === id);
    if (item?.imageId) await ctx.deleteMediaBlob(item.imageId);
    if (item?.storagePath) void MediaStorageService.deleteMedia(item.storagePath);
    ctx.cache.surprises = ctx.cache.surprises.filter((entry) => entry.id !== id);
    await ctx.persistData(ctx.cacheKeys.SURPRISES, ctx.cache.surprises);
    ctx.notifyUpdate({ source: 'user', action: 'delete', table: 'surprises', id });
  },

  markSurpriseDelivered: async (id: string) => {
    ctx.cache.surprises = ctx.cache.surprises.map((entry) =>
      entry.id === id ? { ...entry, delivered: true, deliveredAt: ctx.nowIso() } : entry,
    );
    await ctx.persistData(ctx.cacheKeys.SURPRISES, ctx.cache.surprises);
    ctx.notifyUpdate({ source: 'user', action: 'save', table: 'surprises', id });
  },

  getVoiceNotes: (): VoiceNote[] => {
    if (ctx.cache.voiceNotes.length > 0) return ctx.cache.voiceNotes;
    ctx.cache.voiceNotes = parseJsonList<VoiceNote>(localStorage.getItem(ctx.cacheKeys.VOICE_NOTES));
    return ctx.cache.voiceNotes;
  },

  saveVoiceNote: (item: VoiceNote) => ctx.saveInternal('voiceNotes', ctx.cacheKeys.VOICE_NOTES, item, 'vn', 'voice_notes'),

  deleteVoiceNote: async (id: string) => {
    ctx.addPendingDelete('voice_notes', id);
    const item = ctx.cache.voiceNotes.find((entry) => entry.id === id);
    if (item?.audioId) await ctx.deleteMediaBlob(item.audioId);
    if (item?.audioStoragePath) void MediaStorageService.deleteMedia(item.audioStoragePath);
    ctx.cache.voiceNotes = ctx.cache.voiceNotes.filter((entry) => entry.id !== id);
    await ctx.persistData(ctx.cacheKeys.VOICE_NOTES, ctx.cache.voiceNotes);
    ctx.notifyUpdate({ source: 'user', action: 'delete', table: 'voice_notes', id });
  },

  async saveVoiceNoteAudio(
    id: string,
    audioDataUri: string,
    options?: { ownerUserId?: string; createdAt?: string },
  ): Promise<VoiceNoteAudioSaveResult> {
    const audioId = `vn_${id}`;
    const byteSize = estimateDataUriBytes(audioDataUri);
    const mimeType = getMimeTypeFromDataUri(audioDataUri);
    const existingNote = ctx.cache.voiceNotes.find((entry) => entry.id === id);
    ctx.assertManagedStorageBudget('voice-notes', byteSize, Number(existingNote?.audioBytes || 0));
    await ctx.writeMedia(audioId, audioDataUri);
    const path = await MediaStorageService.buildCustomPath(id, 'voice-notes', 'audio', {
      ownerUserId: options?.ownerUserId,
      timestamp: options?.createdAt,
    });
    const uploaded = await MediaStorageService.uploadMedia(audioDataUri, path, {
      sourceTable: 'voice_notes',
      logicalRowId: id,
      itemId: id,
      ownerUserId: options?.ownerUserId ?? null,
      metadata: { mediaField: 'audio' },
    });
    const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
    return {
      storagePath: uploaded && verified === true ? uploaded : null,
      byteSize,
      mimeType,
    };
  },

  async getVoiceNoteAudio(note: VoiceNote): Promise<string | null> {
    if (note.audioId) {
      const cached = await ctx.readMedia(note.audioId);
      if (cached) return cached;
    }
    if (note.audioStoragePath) {
      return await MediaStorageService.getAccessibleUrl(note.audioStoragePath)
        || await MediaStorageService.downloadMedia(note.audioStoragePath)
        || note.audioStoragePath;
    }
    return null;
  },

  getPrivateSpaceItems: (): PrivateSpaceItem[] => {
    if (ctx.cache.privateSpaceItems.length > 0) return ctx.cache.privateSpaceItems;
    ctx.cache.privateSpaceItems = parseJsonList<PrivateSpaceItem>(localStorage.getItem(ctx.cacheKeys.PRIVATE_SPACE_ITEMS));
    return ctx.cache.privateSpaceItems;
  },

  async savePrivateSpaceItem(item: PrivateSpaceItem, source: StorageSource = 'user') {
    if (item.kind !== 'audio') {
      return ctx.saveInternal('privateSpaceItems', ctx.cacheKeys.PRIVATE_SPACE_ITEMS, item, 'priv', 'private_space_items', source);
    }

    const sanitizedItem = ctx.sanitizeUserContent(item);
    const list = [...ctx.cache.privateSpaceItems];
    const idx = list.findIndex((entry) => entry.id === sanitizedItem.id);
    const existingItem = idx >= 0 ? list[idx] : undefined;
    const ownerUserId = await ctx.resolveOwnerUserId(sanitizedItem, source, existingItem);
    const rawAudio = ctx.isInlineMediaPayload(sanitizedItem.audio) ? sanitizedItem.audio : undefined;
    const audioMeta = ctx.extractInlineMediaMeta(rawAudio);
    const replacedBytes = audioMeta ? Number(existingItem?.audioBytes || 0) : 0;

    if (source === 'user' && audioMeta) {
      ctx.assertManagedStorageBudget('private-space', audioMeta.bytes, replacedBytes);
    }

    const toSaveMetadata = ctx.stripInternalRowMeta({
      ...sanitizedItem,
      ownerUserId,
      updatedAt: ctx.nowIso(),
    });

    if (rawAudio) {
      const audioId = sanitizedItem.audioId || existingItem?.audioId || `priv_aud_${sanitizedItem.id}`;
      await ctx.writeMedia(audioId, rawAudio);
      toSaveMetadata.audioId = audioId;
      toSaveMetadata.audioBytes = audioMeta?.bytes;
      toSaveMetadata.audioMimeType = audioMeta?.mimeType;

      const path = await MediaStorageService.buildCustomPath(sanitizedItem.id, 'private-space', 'audio', {
        ownerUserId,
        timestamp: sanitizedItem.createdAt,
      });
      const uploaded = await MediaStorageService.uploadMedia(rawAudio, path, {
        sourceTable: 'private_space_items',
        logicalRowId: sanitizedItem.id,
        itemId: sanitizedItem.id,
        ownerUserId,
        metadata: { mediaField: 'audio' },
      });
      const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
      if (uploaded && verified === true) {
        toSaveMetadata.audioStoragePath = uploaded;
        if (existingItem?.audioStoragePath && existingItem.audioStoragePath !== uploaded) {
          void MediaStorageService.deleteMedia(existingItem.audioStoragePath);
        }
      }
    } else if (existingItem?.audioId && !toSaveMetadata.audioId) {
      toSaveMetadata.audioId = existingItem.audioId;
      toSaveMetadata.audioBytes = existingItem.audioBytes;
      toSaveMetadata.audioMimeType = existingItem.audioMimeType;
      toSaveMetadata.audioStoragePath = existingItem.audioStoragePath;
    }

    delete toSaveMetadata.audio;

    if (idx >= 0) list[idx] = toSaveMetadata;
    else list.unshift(toSaveMetadata);

    ctx.cache.privateSpaceItems = list;
    localStorage.setItem(ctx.cacheKeys.PRIVATE_SPACE_ITEMS, JSON.stringify(list));
    await ctx.persistData(ctx.cacheKeys.PRIVATE_SPACE_ITEMS, list);
    ctx.notifyUpdate({
      source,
      action: 'save',
      table: 'private_space_items',
      id: sanitizedItem.id,
      item: { ...toSaveMetadata, audio: rawAudio },
    });
  },

  deletePrivateSpaceItem: async (id: string) => {
    ctx.addPendingDelete('private_space_items', id);
    const item = ctx.cache.privateSpaceItems.find((entry) => entry.id === id);
    if (item?.imageId) {
      await ctx.deleteMediaBlob(item.imageId);
      ctx.deleteMemoryCache(item.imageId);
    }
    if (item?.videoId) await ctx.deleteMediaBlob(item.videoId);
    if (item?.audioId) await ctx.deleteMediaBlob(item.audioId);
    if (item?.storagePath) void MediaStorageService.deleteMedia(item.storagePath);
    if (item?.videoStoragePath) void MediaStorageService.deleteMedia(item.videoStoragePath);
    if (item?.audioStoragePath) void MediaStorageService.deleteMedia(item.audioStoragePath);
    ctx.cache.privateSpaceItems = ctx.cache.privateSpaceItems.filter((entry) => entry.id !== id);
    localStorage.setItem(ctx.cacheKeys.PRIVATE_SPACE_ITEMS, JSON.stringify(ctx.cache.privateSpaceItems));
    await ctx.persistData(ctx.cacheKeys.PRIVATE_SPACE_ITEMS, ctx.cache.privateSpaceItems);
    ctx.notifyUpdate({ source: 'user', action: 'delete', table: 'private_space_items', id });
  },

  async getPrivateSpaceAudio(item: PrivateSpaceItem): Promise<string | null> {
    if (item.audioId) {
      const cached = await ctx.readMedia(item.audioId);
      if (cached) return cached;
    }
    if (item.audioStoragePath) {
      return await MediaStorageService.getAccessibleUrl(item.audioStoragePath)
        || await MediaStorageService.downloadMedia(item.audioStoragePath)
        || item.audioStoragePath;
    }
    return null;
  },
});

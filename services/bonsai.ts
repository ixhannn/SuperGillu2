/**
 * Bonsai event store — append-only, clobber-safe.
 *
 * Every watering / note-open is one immutable row keyed by a DETERMINISTIC id
 * (`${couple}_${day}_${user}_w`), so retries and offline replays are idempotent
 * and partners can never overwrite each other (the daily_drops lesson).
 * The visible tree is derived from these events by utils/bonsai/growth.ts.
 *
 * Deliberately self-contained: own fetch, own realtime channel, own local
 * cache + pending retry queue — no coupling to the storage.ts sync pipeline.
 */

import { SupabaseService } from './supabase';
import { StorageService } from './storage';
import { dayKey } from '../utils/bonsai/growth';
import { hashString } from '../utils/bonsai/rng';
import type { BonsaiEvent, BonsaiEventType } from '../utils/bonsai/types';

const CACHE_KEY = 'lior_bonsai_events_v1';
const TABLE = 'bonsai_events';
export const BONSAI_NOTE_MAX = 240;

interface BonsaiRow {
  id: string;
  couple_id: string;
  user_id: string;
  event_type: BonsaiEventType;
  day: string;
  payload: { note?: string; target?: string; species?: string } | null;
  created_at: string;
}

interface CacheShape {
  coupleKey: string;
  events: BonsaiEvent[];
  pendingIds: string[];
}

type Listener = (events: BonsaiEvent[]) => void;

const rowToEvent = (row: BonsaiRow): BonsaiEvent => ({
  id: row.id,
  coupleId: row.couple_id,
  authorId: row.user_id,
  type: row.event_type === 'note_open' ? 'note_open' : row.event_type === 'plant' ? 'plant' : 'water',
  day: row.day,
  note: row.payload?.note ?? null,
  targetEventId: row.payload?.target ?? null,
  species: row.payload?.species ?? null,
  createdAt: row.created_at,
});

const readCache = (): CacheShape => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CacheShape) : null;
    if (parsed && Array.isArray(parsed.events) && typeof parsed.coupleKey === 'string') {
      return { ...parsed, pendingIds: Array.isArray(parsed.pendingIds) ? parsed.pendingIds : [] };
    }
  } catch {
    /* corrupted cache — start fresh */
  }
  return { coupleKey: '', events: [], pendingIds: [] };
};

const writeCache = (cache: CacheShape): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full — the cloud copy is authoritative */
  }
};

const sortEvents = (events: BonsaiEvent[]): BonsaiEvent[] =>
  [...events].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt < b.createdAt ? -1 : 1));

const mergeById = (base: BonsaiEvent[], incoming: BonsaiEvent[]): BonsaiEvent[] => {
  const map = new Map<string, BonsaiEvent>();
  for (const ev of base) map.set(ev.id, ev);
  for (const ev of incoming) map.set(ev.id, ev);
  return sortEvents([...map.values()]);
};

class BonsaiServiceClass {
  private listeners = new Set<Listener>();
  private channel: { unsubscribe: () => void } | null = null;
  private channelCouple = '';
  private refreshing = false;
  private pushQueue: Promise<unknown> = Promise.resolve();

  /** Stable key for the active tenant: coupleId when paired, else 'solo'. */
  coupleKey(): string {
    const profile = StorageService.getCoupleProfile();
    const id = typeof profile.coupleId === 'string' ? profile.coupleId.trim() : '';
    return id || 'solo';
  }

  isPaired(): boolean {
    return this.coupleKey() !== 'solo';
  }

  selfId(): string {
    return StorageService.getMyUserId() || 'me';
  }

  partnerName(): string {
    const profile = StorageService.getCoupleProfile();
    return (profile.partnerName || '').trim() || 'Your partner';
  }

  myName(): string {
    const profile = StorageService.getCoupleProfile();
    return (profile.myName || '').trim() || 'You';
  }

  /** Deterministic seed both partners share — the tree's DNA. */
  seed(): number {
    return hashString(`bonsai:${this.coupleKey()}`);
  }

  today(): string {
    return dayKey(new Date());
  }

  /** Synchronous warm read for first paint (rendering-stability rule). */
  getCachedEvents(): BonsaiEvent[] {
    const cache = readCache();
    return cache.coupleKey === this.coupleKey() ? cache.events : [];
  }

  private commit(events: BonsaiEvent[], pendingIds: string[]): void {
    writeCache({ coupleKey: this.coupleKey(), events, pendingIds });
    for (const l of this.listeners) l(events);
  }

  private pendingIds(): string[] {
    const cache = readCache();
    return cache.coupleKey === this.coupleKey() ? cache.pendingIds : [];
  }

  /** Pull the full event log, replay any pending offline writes, cache. */
  async refresh(): Promise<BonsaiEvent[]> {
    if (this.refreshing) return this.getCachedEvents();
    this.refreshing = true;
    try {
      await this.flushPending();
      const client = SupabaseService.client;
      const couple = this.coupleKey();
      if (!client || !SupabaseService.isConfigured() || couple === 'solo') {
        return this.getCachedEvents();
      }
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('couple_id', couple)
        .order('created_at', { ascending: true })
        .limit(4000);
      if (error || !data) return this.getCachedEvents();
      const pending = this.pendingIds();
      const local = this.getCachedEvents().filter((ev) => pending.includes(ev.id));
      const merged = mergeById(data.map((row) => rowToEvent(row as BonsaiRow)), local);
      const cloudIds = new Set((data as BonsaiRow[]).map((r) => r.id));
      this.commit(merged, pending.filter((id) => !cloudIds.has(id)));
      return merged;
    } finally {
      this.refreshing = false;
    }
  }

  private async flushPending(): Promise<void> {
    const pending = this.pendingIds();
    if (pending.length === 0) return;
    const events = this.getCachedEvents();
    const remaining: string[] = [];
    for (const id of pending) {
      const ev = events.find((e) => e.id === id);
      if (!ev) continue;
      const ok = await this.enqueuePush(ev);
      if (!ok) remaining.push(id);
    }
    this.commit(events, remaining);
  }

  /**
   * Serialize pushes and always send the FRESHEST cached copy of the event.
   * Without this, a slow in-flight watering push could land after a quickly
   * sealed note and overwrite its payload server-side.
   */
  private enqueuePush(ev: BonsaiEvent): Promise<boolean> {
    const run = this.pushQueue.then(() => {
      const latest = this.getCachedEvents().find((e) => e.id === ev.id) ?? ev;
      return this.push(latest);
    });
    this.pushQueue = run.catch(() => undefined);
    return run;
  }

  private async push(ev: BonsaiEvent): Promise<boolean> {
    const client = SupabaseService.client;
    if (!client || !SupabaseService.isConfigured() || !this.isPaired()) return false;
    const userId = await SupabaseService.getCurrentUserId();
    if (!userId) return false;
    const row = {
      id: ev.id,
      couple_id: ev.coupleId,
      user_id: userId,
      event_type: ev.type,
      day: ev.day,
      payload: {
        note: ev.note || undefined,
        target: ev.targetEventId || undefined,
        species: ev.species || undefined,
      },
    };
    // Conflict-update (not ignore) so a note tucked in after watering still
    // syncs through the same retry path. Only the author ever writes this
    // row (deterministic per-user id + RLS), so last-write-wins is safe.
    // Plant events are the exception: their id is shared BETWEEN partners
    // (`_plant_N`), so first-wins + ignore keeps the race idempotent.
    const { error } = await client
      .from(TABLE)
      .upsert(row, { onConflict: 'id', ignoreDuplicates: ev.type === 'plant' });
    return !error;
  }

  private async record(
    type: BonsaiEventType,
    id: string,
    day: string,
    note?: string,
    target?: string,
    species?: string,
  ): Promise<BonsaiEvent> {
    const event: BonsaiEvent = {
      id,
      coupleId: this.coupleKey(),
      authorId: this.selfId(),
      type,
      day,
      note: note ?? null,
      targetEventId: target ?? null,
      species: species ?? null,
      createdAt: new Date().toISOString(),
    };
    // Optimistic: paint first, sync after (perceived-speed rule).
    this.commit(
      mergeById(this.getCachedEvents(), [event]),
      [...new Set([...this.pendingIds(), event.id])],
    );
    const ok = await this.enqueuePush(event);
    if (ok) {
      // Re-merge against the CURRENT cache — a realtime insert may have
      // landed while the push was in flight.
      this.commit(
        mergeById(this.getCachedEvents(), [event]),
        this.pendingIds().filter((p) => p !== event.id),
      );
    }
    return event;
  }

  /**
   * Deterministic once-per-day water id. Trees after the first carry a
   * `_tN` namespace so replanting on the same day never collides with the
   * finished tree's final watering. Index 0 keeps the legacy shape.
   */
  private waterId(day: string, treeIndex: number): string {
    return treeIndex > 0
      ? `${this.coupleKey()}_${day}_${this.selfId()}_t${treeIndex}_w`
      : `${this.coupleKey()}_${day}_${this.selfId()}_w`;
  }

  /** Water the tree today. Idempotent — one water per partner per day. */
  async water(note?: string, treeIndex = 0): Promise<BonsaiEvent> {
    const day = this.today();
    const cleaned = (note ?? '').trim().slice(0, BONSAI_NOTE_MAX);
    const id = this.waterId(day, treeIndex);
    // Already watered today — never overwrite (a re-push with an empty note
    // would wipe a note that was tucked in earlier).
    const existing = this.getCachedEvents().find((e) => e.id === id);
    if (existing) return existing;
    return this.record('water', id, day, cleaned || undefined);
  }

  /** Attach/replace today's sealed note on my existing water event. */
  async setTodayNote(note: string, treeIndex = 0): Promise<BonsaiEvent | null> {
    const day = this.today();
    const id = this.waterId(day, treeIndex);
    const existing = this.getCachedEvents().find((e) => e.id === id);
    if (!existing) return null;
    const cleaned = note.trim().slice(0, BONSAI_NOTE_MAX);
    if (!cleaned) return existing;
    const updated: BonsaiEvent = { ...existing, note: cleaned };
    this.commit(
      mergeById(this.getCachedEvents(), [updated]),
      [...new Set([...this.pendingIds(), updated.id])],
    );
    const ok = await this.enqueuePush(updated);
    if (ok) {
      this.commit(
        mergeById(this.getCachedEvents(), [updated]),
        this.pendingIds().filter((p) => p !== updated.id),
      );
    }
    return updated;
  }

  /**
   * Complete the current tree and plant the next one. `index` is the new
   * tree's ordinal; the shared deterministic id makes partner races safe
   * (first plant wins, the other replay is a no-op).
   */
  async plantTree(species: string, index: number): Promise<BonsaiEvent> {
    const id = `${this.coupleKey()}_plant_${index}`;
    const existing = this.getCachedEvents().find((e) => e.id === id);
    if (existing) return existing;
    return this.record('plant', id, this.today(), undefined, undefined, species);
  }

  /** Mark a partner note as opened (drives their "it was read" moment). */
  async markNoteOpened(targetEventId: string): Promise<void> {
    const day = this.today();
    // Raw target id keeps this collision-proof; must stay `${couple}_`-prefixed
    // for the server-side id CHECK constraint.
    const id = `${this.coupleKey()}_o_${this.selfId()}_${targetEventId}`;
    await this.record('note_open', id, day, undefined, targetEventId);
  }

  /** Listen for event-log changes (local writes + partner realtime inserts). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureRealtime();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.teardownRealtime();
    };
  }

  private ensureRealtime(): void {
    const client = SupabaseService.client;
    const couple = this.coupleKey();
    if (!client || !SupabaseService.isConfigured() || couple === 'solo') return;
    if (this.channel && this.channelCouple === couple) return;
    this.teardownRealtime();
    try {
      this.channel = client
        .channel(`bonsai_${couple}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: TABLE, filter: `couple_id=eq.${couple}` },
          (payload: { new?: unknown }) => {
            const row = payload.new as BonsaiRow | undefined;
            if (!row || !row.id) return;
            const merged = mergeById(this.getCachedEvents(), [rowToEvent(row)]);
            this.commit(merged, this.pendingIds());
          },
        )
        .subscribe();
      this.channelCouple = couple;
    } catch {
      this.channel = null;
      this.channelCouple = '';
    }
  }

  private teardownRealtime(): void {
    try {
      this.channel?.unsubscribe();
    } catch {
      /* channel already closed */
    }
    this.channel = null;
    this.channelCouple = '';
  }
}

export const BonsaiService = new BonsaiServiceClass();

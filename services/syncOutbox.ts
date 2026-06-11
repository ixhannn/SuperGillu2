/**
 * Durable offline write queue ("outbox").
 *
 * When a local change cannot be pushed to the cloud immediately — the device is
 * offline, the realtime socket has silently died, or the request failed — the
 * change is recorded here and replayed on the next (re)connect.
 *
 * Why this is necessary: `reconcileCloud()` only PULLS existing cloud rows for a
 * non-empty table; it never re-pushes local-only rows. So a save made while
 * disconnected to a table that already has cloud data was previously dropped on
 * the floor (handleLocalChange returned early when `!isConnected`). The outbox
 * closes that gap without rewriting the happy-path online push.
 *
 * Entries are deduped by (table, id): the latest write for a logical row wins,
 * so a save-then-delete collapses to a single delete and repeated edits coalesce
 * to the final state. Media base64 is stripped before queueing (re-hydrated from
 * local storage at flush time) so the queue never bloats localStorage.
 */

const OUTBOX_KEY = 'lior_sync_outbox';
const MAX_ENTRIES = 500;

export type OutboxAction = 'save' | 'delete';

export interface OutboxEntry {
  table: string;
  /** Logical row id; singletons use a stable per-table key. */
  id: string;
  action: OutboxAction;
  /** Present for saves only; large media payloads stripped. */
  item?: any;
  ts: number;
}

const readList = (): OutboxEntry[] => {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
};

const writeList = (list: OutboxEntry[]): void => {
  try {
    // Keep the newest MAX_ENTRIES if somehow overgrown.
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    // localStorage full / unavailable — nothing we can safely do here.
  }
};

export const getOutbox = (): OutboxEntry[] => readList();

export const outboxSize = (): number => readList().length;

/** Add (or supersede) a pending change for a logical row. */
export const enqueueOutbox = (entry: Omit<OutboxEntry, 'ts'>): void => {
  const next = readList().filter(
    (e) => !(e.table === entry.table && e.id === entry.id),
  );
  next.push({ ...entry, ts: Date.now() });
  writeList(next);
};

export const removeOutboxEntry = (table: string, id: string): void => {
  writeList(readList().filter((e) => !(e.table === table && e.id === id)));
};

export const clearOutbox = (): void => {
  try {
    localStorage.removeItem(OUTBOX_KEY);
  } catch {
    // ignore
  }
};

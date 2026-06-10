/**
 * Remote error sink — ships client errors/rejections to the cloud so the team
 * can actually see production failures (previously they only lived in each
 * user's localStorage, invisible to anyone).
 *
 * Design constraints:
 *  - Best-effort and fully fire-and-forget: a sink failure must never surface to
 *    the user or throw back into DiagnosticsService.
 *  - Throttled + capped per session so an error storm cannot flood the network
 *    or the database.
 *  - Deduped by message within a short window (the same crash often fires
 *    repeatedly on re-render).
 *  - No-op when Supabase isn't configured or the table hasn't been migrated yet
 *    (the insert simply fails silently), so it is safe to ship ahead of the
 *    migration.
 *
 * This is a leaf module: it may import SupabaseService (nothing imports it back),
 * which keeps diagnostics.ts free of any network dependency.
 */

import type { DiagnosticEvent } from './diagnostics';
import { SupabaseService } from './supabase';

const TABLE = 'client_error_logs';
const MAX_PER_SESSION = 50;        // hard cap on rows shipped per app session
const DEDUPE_WINDOW_MS = 30_000;   // collapse identical messages within 30s
const MAX_MESSAGE_LEN = 2_000;

let sentThisSession = 0;
const lastSeenByMessage = new Map<string, number>();

const shouldSend = (event: DiagnosticEvent, now: number): boolean => {
  if (sentThisSession >= MAX_PER_SESSION) return false;
  const key = `${event.source}:${event.message}`;
  const last = lastSeenByMessage.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  lastSeenByMessage.set(key, now);
  return true;
};

const ship = async (event: DiagnosticEvent): Promise<void> => {
  if (!SupabaseService.init() || !SupabaseService.client) return;
  const userId = SupabaseService.getCachedUserId();
  if (!userId) return; // only log for signed-in users (RLS requires it)

  let coupleId: string | null = null;
  try { coupleId = await SupabaseService.getCurrentCoupleId(); } catch { /* optional */ }

  await SupabaseService.client.from(TABLE).insert({
    user_id: userId,
    couple_id: coupleId,
    kind: event.kind,
    source: String(event.source || '').slice(0, 200),
    message: String(event.message || '').slice(0, MAX_MESSAGE_LEN),
    meta: event.meta ?? null,
    app_version: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
    occurred_at: event.timestamp,
  });
};

/** The sink callback registered into DiagnosticsService. Never throws. */
export const remoteErrorSink = (event: DiagnosticEvent): void => {
  let now: number;
  try { now = Date.now(); } catch { return; }
  if (!shouldSend(event, now)) return;
  sentThisSession++;
  // Fire-and-forget; swallow every failure (offline, missing table, RLS, etc.).
  void ship(event).catch(() => { /* best-effort */ });
};

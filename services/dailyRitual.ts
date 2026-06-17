/**
 * Daily Ritual — the single home for the two-person daily question logic.
 *
 * `getRitualStreak` stays a pure transform over the couple's existing
 * `questions[]`. The Phase-3 additions (`getDailyPrompt`, `submitAnswer`,
 * `getTodayPair`) layer a per-user `daily_answers` cloud table on top with a
 * SERVER-ENFORCED sealed reveal, while ALWAYS falling back to the legacy
 * `couple_profile.questions` path so the app never breaks before the migration
 * is applied (this worktree has no .env at all).
 *
 * Services are imported lazily inside the async functions to avoid a circular
 * import: `storage.ts` is a large module hub and `dailyRitual.ts` is consumed by
 * UI that `storage` indirectly reaches. The top-level import stays types-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { QuestionEntry } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar-day key (YYYY-MM-DD) for an ISO timestamp, matching storage's UTC convention. */
const dayKeyOf = (iso: string): string => new Date(iso).toISOString().split('T')[0];

/** Today's calendar-day key, matching `getTodayQuestion`'s convention. */
const todayKey = (): string => new Date().toISOString().split('T')[0];

/** Shifts a YYYY-MM-DD key by `n` days (negative = earlier). */
const shiftDay = (key: string, n: number): string =>
  new Date(new Date(`${key}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().split('T')[0];

/**
 * Honest "X days in a row" streak from revealed questions.
 *
 * Counts consecutive calendar days of revealed answers ending today (or
 * yesterday, if today isn't revealed yet so an unanswered morning doesn't
 * read as a broken streak). ONE freeze (a single skipped day) is allowed per
 * rolling 7-day window, so a lone miss doesn't reset the count.
 *
 * Pure over the entry dates — no new persistence.
 */
export const getRitualStreak = (questions: readonly QuestionEntry[] | undefined): number => {
  if (!questions || questions.length === 0) return 0;

  // Set of calendar days that are genuinely revealed (both partners answered).
  const revealedDays = new Set<string>();
  for (const q of questions) {
    if (q.revealedAt) revealedDays.add(dayKeyOf(q.revealedAt));
  }
  if (revealedDays.size === 0) return 0;

  const today = todayKey();
  const yesterday = shiftDay(today, -1);

  // Anchor: today if revealed, else yesterday (grace for an unanswered today).
  let cursor: string;
  if (revealedDays.has(today)) cursor = today;
  else if (revealedDays.has(yesterday)) cursor = yesterday;
  else return 0;

  // Walk backwards day by day. Each consecutive revealed day extends the
  // streak. A single missed day is forgiven as a "freeze" so long as no other
  // freeze has been spent in the trailing 7-day window; a second miss inside
  // that window ends the run.
  let streak = 0;
  const freezeDays: string[] = [];

  while (true) {
    if (revealedDays.has(cursor)) {
      streak += 1;
      cursor = shiftDay(cursor, -1);
      continue;
    }

    // Missed day — only forgivable if no other freeze was already spent within
    // the trailing 7-day window. We walk backwards, so prior freezes are always
    // MORE RECENT (later) than `cursor`; forgive only when the nearest prior
    // freeze sits beyond `cursor`+6 days (i.e. freezes must be >= 7 days apart).
    const windowEnd = shiftDay(cursor, 6); // window = [cursor .. cursor+6], inclusive
    const freezeInWindow = freezeDays.some(d => d >= cursor && d <= windowEnd);
    if (freezeInWindow) break;

    freezeDays.push(cursor);
    cursor = shiftDay(cursor, -1);
  }

  return streak;
};

// ── Phase 3: per-user daily_answers with sealed reveal ──────────────────────
//
// All three functions are best-effort cloud wrappers over the legacy local
// `couple_profile.questions` path. They never throw: if Supabase is not
// configured (the worktree case), or the migration isn't applied yet (table
// absent / RLS-denied / offline), every cloud call is swallowed and the caller
// transparently sees the existing P0-P2 experience.

const DAILY_ANSWERS_TABLE = 'daily_answers';

/** Per-user/day/couple answer text cap — mirrors the SQL `char_length <= 600`. */
const ANSWER_MAX = 600;

/** Caller-supplied identity for the active couple (the component passes profile). */
export interface DailyRitualContext {
  myName: string;
  partnerName: string;
}

export interface DailyPrompt {
  date: string;       // YYYY-MM-DD (UTC day key, matching getTodayQuestion)
  promptId: string;   // stable hash of the question string
  question: string;
}

export interface DailyPair {
  date: string;
  promptId: string;
  question: string;
  myAnswer: string | null;
  partnerAnswer: string | null;   // null while the reveal is still sealed
  revealed: boolean;
  source: 'cloud' | 'local';
}

/**
 * Stable, deterministic id for a question string (djb2 → base36).
 *
 * The same pooled question maps to the same `promptId` on both devices without
 * touching `types.ts`. `promptId` is informational only — the join key is
 * (couple_id, prompt_date) — so it is fine if it changes when the pool text is
 * edited.
 */
const promptHash = (question: string): string => {
  let h = 5381;
  for (let i = 0; i < question.length; i++) {
    h = ((h << 5) + h + question.charCodeAt(i)) >>> 0; // h * 33 + c, keep uint32
  }
  return h.toString(36);
};

/**
 * Thin wrapper over `StorageService.getTodayQuestion` that preserves the
 * existing deterministic 75-question pool + 90-day pruning, then derives a
 * stable `promptId`. No DB needed — the question is computed client-side.
 */
export const getDailyPrompt = async (ctx: DailyRitualContext): Promise<DailyPrompt> => {
  const { StorageService } = await import('./storage');
  const entry = StorageService.getTodayQuestion(ctx.myName, ctx.partnerName);
  return { date: entry.date, promptId: promptHash(entry.question), question: entry.question };
};

interface CloudIdentity {
  client: SupabaseClient;
  userId: string;
  coupleId: string;
}

/**
 * Resolves (client, userId, coupleId) when Supabase is configured AND the
 * couple is known. Returns null in the worktree / signed-out / unpaired cases,
 * which steers every caller onto the local-only path. Never throws.
 */
async function getCloudIdentity(): Promise<CloudIdentity | null> {
  try {
    const { SupabaseService } = await import('./supabase');
    if (!SupabaseService.isConfigured() || !SupabaseService.client) return null;
    const [userId, coupleId] = await Promise.all([
      SupabaseService.getCurrentUserId(),
      SupabaseService.getCurrentCoupleId(),
    ]);
    if (!userId || !coupleId) return null;
    return { client: SupabaseService.client, userId, coupleId };
  } catch {
    return null;
  }
}

/**
 * Submit the caller's answer for today.
 *
 * Always writes the legacy `couple_profile` path FIRST so offline / no-table
 * behaviour is unchanged and the streak/UI keep working. Then best-effort
 * inserts the caller's row into `daily_answers` (idempotent on the deterministic
 * PK). On ANY cloud error — table absent, RLS, offline — it swallows and reports
 * `usedCloud: false`; the local write already succeeded, so `ok` stays true.
 *
 * Never throws.
 */
export async function submitAnswer(
  text: string,
  ctx: DailyRitualContext,
): Promise<{ ok: boolean; usedCloud: boolean }> {
  const trimmed = text.trim().slice(0, ANSWER_MAX);

  // 1) Local-first: keeps streak math + fallback intact regardless of cloud.
  const { StorageService } = await import('./storage');
  StorageService.submitQuestionAnswer(trimmed);

  // 2) Best-effort cloud insert (purely additive).
  const identity = await getCloudIdentity();
  if (!identity) return { ok: true, usedCloud: false };

  try {
    const prompt = await getDailyPrompt(ctx);
    const id = `${identity.coupleId}:${prompt.date}:${identity.userId}`;
    const { error } = await identity.client
      .from(DAILY_ANSWERS_TABLE)
      .upsert(
        {
          id,
          user_id: identity.userId,
          couple_id: identity.coupleId,
          prompt_date: prompt.date,
          prompt_id: prompt.promptId,
          text: trimmed,
        },
        { onConflict: 'id' },
      );
    if (error) return { ok: true, usedCloud: false };
    return { ok: true, usedCloud: true };
  } catch {
    return { ok: true, usedCloud: false };
  }
}

/**
 * Read today's question + both answers under the sealed-reveal RLS.
 *
 * Computes the prompt deterministically (no DB), reads the LOCAL baseline first
 * (the fallback), then attempts the cloud read. Under the RLS policy the result
 * contains my row always and the partner row ONLY once I've submitted mine, so
 * `partnerAnswer` stays null (and `revealed` false) until the seal opens. Any
 * cloud error falls through to the local baseline.
 *
 * Never throws.
 */
export async function getTodayPair(ctx: DailyRitualContext): Promise<DailyPair> {
  const prompt = await getDailyPrompt(ctx);

  // Local baseline (source of truth when cloud is unavailable).
  const { StorageService } = await import('./storage');
  const local = StorageService.getTodayQuestion(ctx.myName, ctx.partnerName);
  const localMine = local.answers[ctx.myName] ?? null;
  const localPartner = local.answers[ctx.partnerName] ?? null;
  const localRevealed = Boolean(local.revealedAt);
  const baseline: DailyPair = {
    date: prompt.date,
    promptId: prompt.promptId,
    question: prompt.question,
    myAnswer: localMine,
    partnerAnswer: localPartner,
    revealed: localRevealed,
    source: 'local',
  };

  // Best-effort cloud read; the sealed-reveal RLS does the gating for us.
  const identity = await getCloudIdentity();
  if (!identity) return baseline;

  try {
    const { data, error } = await identity.client
      .from(DAILY_ANSWERS_TABLE)
      .select('user_id, text, created_at')
      .eq('couple_id', identity.coupleId)
      .eq('prompt_date', prompt.date);

    if (error || !data) return baseline;

    let myAnswer: string | null = null;
    let partnerAnswer: string | null = null;
    for (const row of data as Array<{ user_id: string; text: string | null }>) {
      if (row.user_id === identity.userId) myAnswer = row.text ?? null;
      else partnerAnswer = row.text ?? null;
    }

    // Reveal only when BOTH rows are present (partner row is RLS-gated to appear
    // exactly once mine exists — so the seal holds server-side, not just in UI).
    const revealed = myAnswer !== null && partnerAnswer !== null;
    return {
      date: prompt.date,
      promptId: prompt.promptId,
      question: prompt.question,
      myAnswer,
      partnerAnswer: revealed ? partnerAnswer : null,
      revealed,
      source: 'cloud',
    };
  } catch {
    return baseline;
  }
}

/**
 * useDailyDrop — the single source of truth the Home card and the DailyDrop view
 * both consume. Resolves today's drop, derives the per-viewer UI state (splitting
 * "both answered" into a one-time reveal vs. the settled revealed view), keeps a
 * live countdown, and wires submit/nudge to storage + partner push.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyDrop, DropResponse } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { NotificationsService } from '../services/notifications';
import {
  deriveDropState,
  getDropCountdown,
  isDropComplete,
  type DropState,
  type DropCountdown,
} from '../utils/dropEngine';
import type { DropMemory } from '../components/daily-drop/dropContract';

export type DropUiState =
  | 'your_turn'
  | 'waiting'
  | 'reveal_ready'
  | 'revealed'
  | 'expired_partial'
  | 'expired_missed'
  | 'expired_both_missed';

export interface UseDailyDrop {
  ready: boolean;
  drop: DailyDrop | null;
  profile: { myName: string; partnerName: string };
  myKey: string;
  dataState: DropState;
  uiState: DropUiState;
  myResponse?: DropResponse;
  partnerResponse?: DropResponse; // only exposed once revealed
  countdown: DropCountdown;
  submitting: boolean;
  submit: (value: string, guess?: string) => void;
  nudge: () => void;
  markSeen: () => void;
  resolveMemory: (id: string) => DropMemory | null;
}

const seenKey = (id: string) => `lior_drop_seen_${id}`;

const hasSeenReveal = (id: string): boolean => {
  try { return localStorage.getItem(seenKey(id)) === '1'; } catch { return false; }
};

const markRevealSeen = (id: string) => {
  try { localStorage.setItem(seenKey(id), '1'); } catch { /* ignore */ }
};

export function useDailyDrop(): UseDailyDrop {
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const profile = useMemo(() => StorageService.getCoupleProfile(), [tick]);
  const myKey = useMemo(() => StorageService.resolveMyDropKey(profile), [profile]);

  // Resolve / generate today's drop. getTodayDrop is idempotent after creation.
  const drop = useMemo<DailyDrop | null>(() => {
    try { return StorageService.getTodayDrop(profile); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, profile]);

  // Re-render on storage changes that can affect the drop, and at day rollover.
  useEffect(() => {
    const onStorage = (e: Event) => {
      const detail = (e as CustomEvent).detail as { table?: string } | undefined;
      const t = detail?.table;
      if (!t || t === 'daily_drops' || t === 'couple_profile' || t === 'memories' || t === 'init') {
        refresh();
      }
    };
    storageEventTarget.addEventListener('storage-update', onStorage as EventListener);
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      storageEventTarget.removeEventListener('storage-update', onStorage as EventListener);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const dataState = useMemo<DropState>(
    () => (drop ? deriveDropState(drop, myKey, now) : 'your_turn'),
    [drop, myKey, now],
  );

  const myResponse = drop?.responses?.[myKey];
  const partnerResponse = useMemo<DropResponse | undefined>(() => {
    if (!drop) return undefined;
    const entry = Object.entries(drop.responses || {}).find(([k]) => k !== myKey);
    return entry?.[1];
  }, [drop, myKey]);

  const revealed = !!drop && isDropComplete(drop);

  const uiState = useMemo<DropUiState>(() => {
    if (!drop) return 'your_turn';
    if (dataState === 'both_in') {
      return hasSeenReveal(drop.id) ? 'revealed' : 'reveal_ready';
    }
    return dataState as DropUiState;
  }, [drop, dataState, tick]);

  const countdown = useMemo(
    () => (drop ? getDropCountdown(drop.expiresAt, now) : getDropCountdown(new Date().toISOString(), now)),
    [drop, now],
  );

  const submit = useCallback((value: string, guess?: string) => {
    if (!drop) return;
    const partnerAlreadyIn = Object.keys(drop.responses || {}).some((k) => k !== myKey);
    setSubmitting(true);
    try {
      StorageService.submitDropResponse(value, guess);
      // Tell the partner: either "they dropped something" or "it just unsealed".
      const subtype: 'dropped' | 'unsealed' = partnerAlreadyIn ? 'unsealed' : 'dropped';
      void NotificationsService.triggerDropPush(subtype, profile.myName);
    } catch (err) {
      console.warn('[DailyDrop] submit failed', err);
    } finally {
      setSubmitting(false);
      refresh();
    }
  }, [drop, myKey, profile.myName, refresh]);

  const nudge = useCallback(() => {
    void NotificationsService.triggerDropPush('nudge', profile.myName);
  }, [profile.myName]);

  const markSeen = useCallback(() => {
    if (drop) markRevealSeen(drop.id);
    refresh();
  }, [drop, refresh]);

  const resolveMemory = useCallback((id: string): DropMemory | null => {
    try {
      const mems = (StorageService.getMemories?.() ?? []) as Array<Record<string, unknown>>;
      const m = mems.find((x) => x.id === id);
      if (!m) return null;
      return {
        id: String(m.id),
        title: typeof m.title === 'string' ? m.title : '',
        text: typeof m.text === 'string' ? m.text : undefined,
        imageId: typeof m.imageId === 'string' ? m.imageId : undefined,
        image: typeof m.image === 'string' ? m.image : undefined,
        date: typeof m.date === 'string' ? m.date : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }, []);

  return {
    ready: !!drop,
    drop,
    profile: { myName: profile.myName, partnerName: profile.partnerName },
    myKey,
    dataState,
    uiState,
    myResponse,
    partnerResponse: revealed ? partnerResponse : undefined,
    countdown,
    submitting,
    submit,
    nudge,
    markSeen,
    resolveMemory,
  };
}

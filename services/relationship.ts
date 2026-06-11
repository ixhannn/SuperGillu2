/**
 * RelationshipService — the single, app-wide source of truth for "am I linked?"
 *
 * Why this exists: before this, every view independently read
 * `profile.partnerName` and fell back to a phantom "Partner", so an unlinked
 * user saw a fake partner everywhere and `isConnected` (cloud reachability) was
 * conflated with being paired. This service centralises the real answer.
 *
 * Authority model (matches the relationship-integrity migration):
 *   - SERVER is authoritative: `get_my_relationship()` returns member_count +
 *     partner identity. `isLinked` is true only when a real partner exists.
 *   - LOCAL is the instant fallback: a profile that already carries both a
 *     coupleId AND a partnerUserId is a confirmed link, so the UI can render the
 *     linked state immediately (and offline) without waiting on the network.
 *
 * Consumers subscribe (or use the `useRelationship` hook). The service refreshes
 * on demand and recomputes cheaply whenever local storage changes.
 */

import { SupabaseService } from './supabase';
import { StorageService, storageEventTarget } from './storage';

export type RelationshipSource = 'unknown' | 'local' | 'server';

export interface RelationshipState {
  /** True only when a real partner is linked (never for a solo/phantom partner). */
  isLinked: boolean;
  partnerName: string | null;
  partnerUserId: string | null;
  coupleId: string | null;
  memberCount: number;
  onboardingDone: boolean;
  /** True until the first resolution completes. */
  loading: boolean;
  source: RelationshipSource;
}

const INITIAL: RelationshipState = {
  isLinked: false,
  partnerName: null,
  partnerUserId: null,
  coupleId: null,
  memberCount: 1,
  onboardingDone: false,
  loading: true,
  source: 'unknown',
};

let state: RelationshipState = { ...INITIAL };
let started = false;
let refreshInFlight: Promise<void> | null = null;

const listeners = new Set<(s: RelationshipState) => void>();

const clean = (value: string | null | undefined): string => (typeof value === 'string' ? value.trim() : '');

const emit = (): void => {
  for (const listener of listeners) listener(state);
};

const setState = (patch: Partial<RelationshipState>): void => {
  state = { ...state, ...patch };
  emit();
};

/** Cheap, synchronous derivation from the locally-stored profile. */
const deriveFromLocal = (): Partial<RelationshipState> => {
  const profile = StorageService.getCoupleProfile();
  const coupleId = clean(profile.coupleId);
  const partnerUserId = clean(profile.partnerUserId);
  // A confirmed link requires BOTH identifiers — a bare partnerName is not a link.
  const linked = Boolean(coupleId && partnerUserId);
  return {
    isLinked: linked,
    coupleId: coupleId || null,
    partnerUserId: linked ? partnerUserId : null,
    partnerName: linked ? (clean(profile.partnerName) || null) : null,
    memberCount: linked ? 2 : 1,
  };
};

const syncFromLocal = (): void => {
  setState({ ...deriveFromLocal(), loading: false, source: state.source === 'server' ? 'server' : 'local' });
};

const ensureStarted = (): void => {
  if (started) return;
  started = true;
  if (typeof storageEventTarget !== 'undefined') {
    storageEventTarget.addEventListener('storage-update', syncFromLocal);
  }
  syncFromLocal();
};

export const RelationshipService = {
  /** Current cached state (synchronous). */
  get(): RelationshipState {
    ensureStarted();
    return state;
  },

  /** Subscribe to changes. Fires immediately with the current state. */
  subscribe(listener: (s: RelationshipState) => void): () => void {
    ensureStarted();
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  },

  /**
   * Authoritative refresh from the server, with the local-derived state shown
   * instantly first. De-duped so concurrent callers share one network round-trip.
   */
  refresh(): Promise<void> {
    ensureStarted();
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      // Instant local paint.
      setState({ ...deriveFromLocal(), loading: false });
      try {
        const rel = await SupabaseService.getMyRelationship();
        if (rel) {
          const linked = rel.memberCount >= 2 && Boolean(rel.partnerUserId);
          setState({
            isLinked: linked,
            coupleId: rel.coupleId,
            partnerUserId: linked ? rel.partnerUserId : null,
            partnerName: linked ? rel.partnerName : null,
            memberCount: rel.memberCount,
            onboardingDone: rel.onboardingDone,
            loading: false,
            source: 'server',
          });
        } else {
          setState({ loading: false });
        }
      } catch {
        // Server unavailable (offline / pre-migration) — keep local-derived state.
        setState({ loading: false });
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  },

  /** Test/teardown helper. */
  _reset(): void {
    state = { ...INITIAL };
    started = false;
    refreshInFlight = null;
    listeners.clear();
  },
};

// PIN protection for Private Space. The PIN is stored as a salted
// SHA-256 hash (never plaintext). This guards against casual snooping
// on a shared/unlocked phone — the data itself lives in local storage,
// so it is an access gate, not encryption at rest.
//
// DURABILITY — the PIN hash is kept in THREE places, weakest→strongest:
//   1. localStorage (PIN_STORAGE_KEY)  — synchronous fast cache so hasPin()/
//      isSessionUnlocked()/verifyPin() stay sync (used in useState initializers).
//   2. IndexedDB mirror (rawStore)     — survives the native Android WebView
//      evicting web-storage BETWEEN LAUNCHES (the "resets every launch" bug;
//      IndexedDB is the app's real vault and is not evicted with localStorage).
//   3. couple_profile.privateSpacePin  — rides the couple profile's Supabase
//      `data` blob, so it survives a full app REINSTALL (restored on next login)
//      and is shared across the couple's devices. Private Space is a couple-
//      shared shelf, so one synced hash is correct — both partners' PIN.
// hydrate() reconciles all three on boot: newest createdAt wins, then every
// store is brought up to that winner (restore after eviction, adopt after a
// reinstall's cloud pull, back-fill for pre-existing local-only PINs).

import { readRaw, writeRaw, deleteRaw } from './storage/rawStore';
import { STORES } from './storage/dbConfig';
import { StorageService } from './storage';

const PIN_STORAGE_KEY = 'lior_private_space_pin_v1';
const ATTEMPT_STORAGE_KEY = 'lior_private_space_pin_attempts_v1';
const SESSION_UNLOCK_KEY = 'lior_private_space_unlocked_v1';

export const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
// Each repeated lockout multiplies the cooldown by this factor, capped at
// LOCKOUT_MAX_TIER. 30s, 2m, 8m, 32m, ~2h, ~8.5h — slow brute force becomes
// infeasible while a correct PIN fully clears the escalation.
const LOCKOUT_BACKOFF = 4;
const LOCKOUT_MAX_TIER = 5;
// How long the vault stays open after a successful unlock.
const SESSION_UNLOCK_TTL_MS = 5 * 60_000;

interface StoredPin {
  salt: string;
  hash: string;
  createdAt: string;
}

interface AttemptState {
  count: number;
  lockUntil: number;
  // Number of times the lockout has been triggered. Scales the cooldown so
  // repeated failures back off exponentially. Cleared on a correct PIN.
  lockoutCount?: number;
}

export interface VerifyResult {
  ok: boolean;
  remainingAttempts?: number;
  lockedForMs?: number;
}

const readJson = <T>(storage: Storage, key: string): T | null => {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (storage: Storage, key: string, value: unknown) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be unavailable (private mode) — the lock degrades gracefully
  }
};

const removeKey = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

// FNV-1a fallback for environments without crypto.subtle. Weak, but the
// alternative is no lock at all; subtle exists in every secure context.
const fallbackHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16)}`;
};

const hashPin = async (pin: string, salt: string): Promise<string> => {
  const input = `${salt}:${pin}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return toHex(new Uint8Array(digest));
    } catch {
      return fallbackHash(input);
    }
  }
  return fallbackHash(input);
};

const randomSalt = (): string => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

const getAttempts = (): AttemptState =>
  readJson<AttemptState>(localStorage, ATTEMPT_STORAGE_KEY) ?? { count: 0, lockUntil: 0 };

const setAttempts = (state: AttemptState) => writeJson(localStorage, ATTEMPT_STORAGE_KEY, state);

// ── PIN copies: local cache + durable mirror + synced couple profile ────────
// A StoredPin holds only a random salt + a one-way hash, so mirroring it into
// IndexedDB and the couple profile is no weaker than the localStorage copy it
// shadows.

const isStoredPin = (value: unknown): value is StoredPin =>
  typeof value === 'object' && value !== null &&
  typeof (value as StoredPin).salt === 'string' &&
  typeof (value as StoredPin).hash === 'string';

const pinsEqual = (a: StoredPin | null | undefined, b: StoredPin | null | undefined): boolean =>
  !!a && !!b && a.salt === b.salt && a.hash === b.hash;

// Newest createdAt wins — lets a PIN changed on one device (or restored from the
// cloud after reinstall) supersede a stale local copy. createdAt is ISO, so
// lexical comparison is chronological.
const newestPin = (...pins: Array<StoredPin | null>): StoredPin | null => {
  let best: StoredPin | null = null;
  for (const p of pins) {
    if (!isStoredPin(p)) continue;
    if (!best || (p.createdAt || '') > (best.createdAt || '')) best = p;
  }
  return best;
};

const persistDurablePin = async (stored: StoredPin): Promise<void> => {
  try {
    await writeRaw(STORES.DATA, PIN_STORAGE_KEY, stored);
  } catch {
    // Best-effort: the localStorage cache still gates this session; hydrate()
    // will retry the mirror on the next boot from the surviving cache.
  }
};

// ── Cloud copy: couple_profile.privateSpacePin (synced verbatim by Supabase) ──
const readProfilePin = (): StoredPin | null => {
  try {
    const pin = StorageService.getCoupleProfile().privateSpacePin;
    return isStoredPin(pin) ? pin : null;
  } catch {
    return null;
  }
};

// Writing through saveCoupleProfile persists to localStorage + the IndexedDB
// profile backup AND enqueues the couple_profile cloud push — one call covers
// every layer. No-op when the profile already holds this exact hash, so hydrate
// reconciliation can't churn the sync outbox.
const writeProfilePin = (stored: StoredPin): void => {
  try {
    const profile = StorageService.getCoupleProfile();
    if (pinsEqual(profile.privateSpacePin, stored)) return;
    StorageService.saveCoupleProfile({ ...profile, privateSpacePin: stored });
  } catch {
    // Best-effort cloud mirror — the local + IndexedDB copies still gate access.
  }
};

const clearProfilePin = (): void => {
  try {
    const profile = StorageService.getCoupleProfile();
    if (!profile.privateSpacePin) return;
    const next: typeof profile = { ...profile };
    delete next.privateSpacePin;
    StorageService.saveCoupleProfile(next);
  } catch {
    // Best-effort.
  }
};

// Single-flight guard so concurrent callers share one reconciliation pass.
// Deliberately NOT a permanent memo: the cloud copy can arrive AFTER boot (a
// reinstall pulls couple_profile mid-session), and a transient IndexedDB read
// failure must be retryable — so every call re-reconciles, sharing only an
// in-flight pass. The Private Space mount effect + a couple_profile storage
// listener drive the re-runs.
let hydrateInFlight: Promise<void> | null = null;

const runHydrate = async (): Promise<void> => {
  // Gather all three copies.
  const cached = readJson<StoredPin>(localStorage, PIN_STORAGE_KEY);
  let durable: StoredPin | null = null;
  let durableReadOk = false;
  try {
    const raw = await readRaw<StoredPin>(STORES.DATA, PIN_STORAGE_KEY);
    durableReadOk = true;
    if (isStoredPin(raw)) durable = raw;
  } catch {
    // IndexedDB busy/unavailable — skip the durable copy for this pass.
  }
  const profilePin = readProfilePin();

  // Newest wins across cache / durable mirror / synced profile.
  const winner = newestPin(isStoredPin(cached) ? cached : null, durable, profilePin);
  // No PIN anywhere — nothing to reconcile. A clear is always explicit
  // (clearPin), so absence must never be "healed" back into existence here.
  if (!winner) return;

  // Bring every store up to the winner: restores the cache after an eviction,
  // adopts the cloud copy after a reinstall, and back-fills the durable +
  // profile copies for a pre-existing local-only PIN.
  if (!pinsEqual(cached, winner)) writeJson(localStorage, PIN_STORAGE_KEY, winner);
  if (durableReadOk && !pinsEqual(durable, winner)) await persistDurablePin(winner);
  writeProfilePin(winner);
};

export const PrivacyLock = {
  isPinValidFormat(pin: string): boolean {
    return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
  },

  hasPin(): boolean {
    return readJson<StoredPin>(localStorage, PIN_STORAGE_KEY) !== null;
  },

  async setPin(pin: string): Promise<void> {
    if (!this.isPinValidFormat(pin)) {
      throw new Error(`PIN must be exactly ${PIN_LENGTH} digits.`);
    }
    const salt = randomSalt();
    const hash = await hashPin(pin, salt);
    const stored: StoredPin = { salt, hash, createdAt: new Date().toISOString() };
    // 1. Synchronous fast-path cache…
    writeJson(localStorage, PIN_STORAGE_KEY, stored);
    // 2. …the durable IndexedDB mirror so a WebView eviction can't wipe it…
    await persistDurablePin(stored);
    // 3. …and the couple profile, which syncs to the cloud so the PIN survives
    //    a full reinstall (restored on next login) and reaches the partner.
    writeProfilePin(stored);
    setAttempts({ count: 0, lockUntil: 0 });
    this.markUnlocked();
  },

  /** Milliseconds remaining in the failed-attempt cooldown, 0 when usable. */
  getLockoutRemainingMs(): number {
    const attempts = getAttempts();
    return Math.max(0, attempts.lockUntil - Date.now());
  },

  async verifyPin(pin: string): Promise<VerifyResult> {
    const lockedForMs = this.getLockoutRemainingMs();
    if (lockedForMs > 0) {
      return { ok: false, lockedForMs };
    }

    const stored = readJson<StoredPin>(localStorage, PIN_STORAGE_KEY);
    if (!stored) {
      return { ok: false, remainingAttempts: MAX_ATTEMPTS };
    }

    const hash = await hashPin(pin, stored.salt);
    if (hash === stored.hash) {
      // A correct PIN fully clears the escalation, including the backoff tier.
      setAttempts({ count: 0, lockUntil: 0, lockoutCount: 0 });
      this.markUnlocked();
      return { ok: true };
    }

    // Re-read attempt state AFTER the async hash so an interleaved verify
    // call's increment is not lost (the read-modify-write must not straddle
    // the await, or two failures would be recorded as one).
    const previous = getAttempts();
    // A finished cooldown starts a fresh attempt window (but keeps the
    // escalating backoff tier so repeated lockouts compound).
    const baseCount = previous.lockUntil > 0 && previous.lockUntil <= Date.now() ? 0 : previous.count;
    const count = baseCount + 1;
    if (count >= MAX_ATTEMPTS) {
      const prevLockouts = previous.lockoutCount ?? 0;
      const tier = Math.min(prevLockouts, LOCKOUT_MAX_TIER);
      const lockMs = LOCKOUT_MS * Math.pow(LOCKOUT_BACKOFF, tier);
      const lockUntil = Date.now() + lockMs;
      setAttempts({ count: 0, lockUntil, lockoutCount: prevLockouts + 1 });
      return { ok: false, remainingAttempts: 0, lockedForMs: lockMs };
    }
    setAttempts({ count, lockUntil: 0, lockoutCount: previous.lockoutCount ?? 0 });
    return { ok: false, remainingAttempts: MAX_ATTEMPTS - count };
  },

  /**
   * Removes the PIN so a new one can be set. Sealed items are untouched.
   * Clears ALL three copies — localStorage, the IndexedDB mirror AND the synced
   * couple profile — or hydrate() would resurrect the old PIN from whichever
   * copy survived. (The reset flow immediately calls setPin with a new PIN,
   * whose newer createdAt then wins everywhere.)
   */
  clearPin(): void {
    removeKey(localStorage, PIN_STORAGE_KEY);
    removeKey(localStorage, ATTEMPT_STORAGE_KEY);
    void deleteRaw(STORES.DATA, PIN_STORAGE_KEY).catch(() => {
      // Best-effort — a failed delete just leaves a stale durable copy that
      // hydrate() re-mirrors; the localStorage removal above already unlocks
      // the reset flow for this session.
    });
    clearProfilePin();
    this.relock();
  },

  /**
   * Reconcile the three PIN copies — localStorage cache, IndexedDB mirror and
   * the synced couple profile — bringing every store up to the newest one.
   * Idempotent and safe to call repeatedly; concurrent callers share one
   * in-flight pass. Call when Private Space mounts AND whenever the couple
   * profile updates (a reinstall pulls the cloud copy mid-session), so hasPin()
   * reflects the durable/synced truth even if the WebView evicted localStorage
   * or the PIN only just arrived from the cloud.
   */
  hydrate(): Promise<void> {
    if (!hydrateInFlight) {
      hydrateInFlight = runHydrate().finally(() => {
        // Release the in-flight slot so the next caller re-reconciles (e.g. once
        // the couple profile has synced down after a reinstall).
        hydrateInFlight = null;
      });
    }
    return hydrateInFlight;
  },

  isSessionUnlocked(): boolean {
    if (!this.hasPin()) return false;
    const state = readJson<{ at: number }>(sessionStorage, SESSION_UNLOCK_KEY);
    if (!state) return false;
    return Date.now() - state.at < SESSION_UNLOCK_TTL_MS;
  },

  markUnlocked(): void {
    writeJson(sessionStorage, SESSION_UNLOCK_KEY, { at: Date.now() });
  },

  relock(): void {
    removeKey(sessionStorage, SESSION_UNLOCK_KEY);
  },
};

// PIN protection for Private Space — a couple-SHARED shelf that each partner
// unlocks with their OWN PIN. The PIN is stored only as a salted, one-way hash
// (never plaintext); this is an access gate against casual snooping, not
// encryption at rest.
//
// PER-USER MODEL: we keep one hash PER USER in couple_profile.privateSpacePins,
// keyed by Supabase user id. On this device you set/verify only YOUR entry — no
// secret is ever passed between partners; your partner sets and uses theirs, and
// either PIN opens the same shelf. Storing the PINs on the couple profile means
// each one inherits the app's full durability pipeline with no migration:
//   • localStorage cache of SHARED_PROFILE — synchronous reads (hasPin()/
//     verifyPin()/isSessionUnlocked() stay sync for useState initializers);
//   • IndexedDB profile backup (restoreLocalBackup on boot) — survives the
//     native Android WebView evicting web-storage BETWEEN LAUNCHES;
//   • the couple_profile Supabase `data` blob — survives a full app REINSTALL
//     (restored on next login).
// hydrate() migrates any legacy single PIN (an older localStorage-only hash or
// the interim couple-shared field) into the per-user map and re-keys a solo
// 'local' entry onto the real id once sign-in provides it. The failed-attempt
// lockout and the unlock session stay device-local (not synced).

import { readRaw, deleteRaw } from './storage/rawStore';
import { STORES } from './storage/dbConfig';
import { StorageService } from './storage';
import { SupabaseService } from './supabase';

// Pre-per-user device-local single-hash key (localStorage + IndexedDB). Retained
// only as a migration source; hydrate() folds it into the per-user map.
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

// ── Per-user PIN storage on the couple profile ──────────────────────────────
// Each partner owns one entry in couple_profile.privateSpacePins, keyed by their
// Supabase user id. A StoredPin is only a salt + one-way hash, so syncing it to
// the partner's device is no weaker than a local copy.

const LEGACY_LOCAL_PIN_KEY = PIN_STORAGE_KEY; // pre-per-user device-local hash
const LOCAL_OWNER = 'local';                   // fallback id for a solo/pre-sign-in user

const isStoredPin = (value: unknown): value is StoredPin =>
  typeof value === 'object' && value !== null &&
  typeof (value as StoredPin).salt === 'string' &&
  typeof (value as StoredPin).hash === 'string';

const safeProfile = () => {
  try { return StorageService.getCoupleProfile(); } catch { return null; }
};

// Which partner is on this device. Prefer the in-memory cached user id (it
// survives a localStorage eviction mid-session); fall back to the persisted id,
// then a device-local constant for a solo / not-yet-signed-in user. hydrate()
// re-keys a 'local' entry onto the real id once sign-in provides one.
const ownerId = (): string => {
  try {
    const cached = SupabaseService.getCachedUserId();
    if (cached) return cached;
  } catch { /* supabase not ready */ }
  let persisted: string | null = null;
  try { persisted = localStorage.getItem('lior_my_user_id'); } catch { /* unavailable */ }
  return persisted || LOCAL_OWNER;
};

const readPins = (profile = safeProfile()): Record<string, StoredPin> => {
  const pins = profile?.privateSpacePins;
  return pins && typeof pins === 'object' ? (pins as Record<string, StoredPin>) : {};
};

const readLegacyLocalPin = (): StoredPin | null => {
  const p = readJson<StoredPin>(localStorage, LEGACY_LOCAL_PIN_KEY);
  return isStoredPin(p) ? p : null;
};

// This device's active PIN, from SYNCHRONOUS sources only (so hasPin/verifyPin
// stay sync). Falls back to a legacy single hash until hydrate() folds it in.
const mySyncPin = (): StoredPin | null => {
  const profile = safeProfile();
  const mine = readPins(profile)[ownerId()];
  if (isStoredPin(mine)) return mine;
  // Legacy fallbacks — used only until hydrate() migrates them into the map.
  if (isStoredPin(profile?.privateSpacePin)) return profile!.privateSpacePin!;
  return readLegacyLocalPin();
};

// Persist (stored) or remove (null) MY entry via saveCoupleProfile, which covers
// localStorage + the IndexedDB profile backup AND the couple_profile cloud push.
const writeMyProfilePin = (stored: StoredPin | null): void => {
  const profile = safeProfile();
  if (!profile) return;
  const pins = { ...readPins(profile) };
  if (stored) pins[ownerId()] = stored;
  else delete pins[ownerId()];
  try {
    StorageService.saveCoupleProfile({ ...profile, privateSpacePins: pins });
  } catch {
    // Best-effort — a failed profile write just leaves the prior state.
  }
};

// The device-local legacy key is per-device; safe to drop once claimed.
const clearDeviceLegacy = (): void => {
  removeKey(localStorage, LEGACY_LOCAL_PIN_KEY);
  void deleteRaw(STORES.DATA, LEGACY_LOCAL_PIN_KEY).catch(() => {});
};

// Single-flight guard so concurrent callers share one migration pass. NOT a
// permanent memo: the profile can sync down AFTER boot (a reinstall pulls it
// mid-session), so every call re-runs, sharing only an in-flight pass. The
// Private Space mount effect + a couple_profile storage listener drive re-runs.
let hydrateInFlight: Promise<void> | null = null;

// Fold any legacy single PIN into the per-user map and re-key a solo 'local'
// entry onto the real user id. Idempotent; only writes the profile on a change.
const runHydrate = async (): Promise<void> => {
  const profile = safeProfile();
  if (!profile) return;
  const id = ownerId();
  const pins = { ...readPins(profile) };
  let changed = false;

  // Source a legacy single hash: interim couple-shared field → device-local
  // localStorage → device-local IndexedDB (the original reinstall mirror).
  let legacy: StoredPin | null = isStoredPin(profile.privateSpacePin) ? profile.privateSpacePin! : null;
  if (!legacy) legacy = readLegacyLocalPin();
  if (!legacy) {
    try {
      const idb = await readRaw<StoredPin>(STORES.DATA, LEGACY_LOCAL_PIN_KEY);
      if (isStoredPin(idb)) legacy = idb;
    } catch { /* IndexedDB busy — retried next call */ }
  }

  if (legacy && !isStoredPin(pins[id])) { pins[id] = legacy; changed = true; }
  // Claim for the partner too, so dropping the shared legacy field below can't
  // lock an un-migrated partner out; each can change their own copy later.
  const partnerId = profile.partnerUserId;
  if (legacy && partnerId && partnerId !== id && !isStoredPin(pins[partnerId])) {
    pins[partnerId] = legacy; changed = true;
  }
  // Re-key a solo 'local' entry (set before sign-in) onto the real id.
  if (id !== LOCAL_OWNER && isStoredPin(pins[LOCAL_OWNER]) && !isStoredPin(pins[id])) {
    pins[id] = pins[LOCAL_OWNER];
    delete pins[LOCAL_OWNER];
    changed = true;
  }

  const next = { ...profile, privateSpacePins: pins };
  let profileChanged = changed;
  if (isStoredPin(profile.privateSpacePin)) { delete next.privateSpacePin; profileChanged = true; }
  if (profileChanged) {
    try { StorageService.saveCoupleProfile(next); } catch { /* best-effort */ }
  }
  if (legacy) clearDeviceLegacy();
};

export const PrivacyLock = {
  isPinValidFormat(pin: string): boolean {
    return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
  },

  /** Whether THIS device's user has set their own PIN. */
  hasPin(): boolean {
    return mySyncPin() !== null;
  },

  async setPin(pin: string): Promise<void> {
    if (!this.isPinValidFormat(pin)) {
      throw new Error(`PIN must be exactly ${PIN_LENGTH} digits.`);
    }
    const salt = randomSalt();
    const hash = await hashPin(pin, salt);
    const stored: StoredPin = { salt, hash, createdAt: new Date().toISOString() };
    // Persist MY entry on the couple profile — one write covers the localStorage
    // cache, the IndexedDB backup (survives eviction) and the cloud push
    // (survives reinstall, reaches the partner's device as their read-only copy).
    writeMyProfilePin(stored);
    // Drop any pre-per-user device-local hash so it can't shadow the new PIN.
    clearDeviceLegacy();
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

    const stored = mySyncPin();
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
   * Removes only THIS user's PIN so they can set a new one — the partner's PIN
   * is untouched, and the sealed items stay. Also drops the interim shared
   * legacy field (so it can't resurrect this user as "has PIN" via the fallback)
   * and any device-local legacy hash.
   */
  clearPin(): void {
    const profile = safeProfile();
    if (profile) {
      const pins = { ...readPins(profile) };
      delete pins[ownerId()];
      const next = { ...profile, privateSpacePins: pins };
      if (isStoredPin(profile.privateSpacePin)) delete next.privateSpacePin;
      try { StorageService.saveCoupleProfile(next); } catch { /* best-effort */ }
    }
    removeKey(localStorage, ATTEMPT_STORAGE_KEY);
    clearDeviceLegacy();
    this.relock();
  },

  /**
   * Migrate any legacy single PIN into the per-user map and re-key a solo
   * 'local' entry onto the real user id. Idempotent and safe to call repeatedly;
   * concurrent callers share one in-flight pass. Call when Private Space mounts
   * AND whenever the couple profile updates (a reinstall pulls the profile down
   * mid-session), so hasPin() reflects the synced truth even if the WebView
   * evicted localStorage or the PIN only just arrived from the cloud.
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

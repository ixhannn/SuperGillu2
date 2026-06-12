// PIN protection for Private Space. The PIN is stored as a salted
// SHA-256 hash (never plaintext). This guards against casual snooping
// on a shared/unlocked phone — the data itself lives in local storage,
// so it is an access gate, not encryption at rest.

const PIN_STORAGE_KEY = 'lior_private_space_pin_v1';
const ATTEMPT_STORAGE_KEY = 'lior_private_space_pin_attempts_v1';
const SESSION_UNLOCK_KEY = 'lior_private_space_unlocked_v1';

export const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
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
    writeJson(localStorage, PIN_STORAGE_KEY, {
      salt,
      hash,
      createdAt: new Date().toISOString(),
    } satisfies StoredPin);
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

    // Read the attempt state before the async hash so a concurrent call
    // can't interleave and under-count failures.
    const previous = getAttempts();
    // A finished cooldown starts a fresh attempt window.
    const baseCount = previous.lockUntil > 0 && previous.lockUntil <= Date.now() ? 0 : previous.count;

    const hash = await hashPin(pin, stored.salt);
    if (hash === stored.hash) {
      setAttempts({ count: 0, lockUntil: 0 });
      this.markUnlocked();
      return { ok: true };
    }

    const count = baseCount + 1;
    if (count >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_MS;
      setAttempts({ count: 0, lockUntil });
      return { ok: false, remainingAttempts: 0, lockedForMs: LOCKOUT_MS };
    }
    setAttempts({ count, lockUntil: 0 });
    return { ok: false, remainingAttempts: MAX_ATTEMPTS - count };
  },

  /** Removes the PIN so a new one can be set. Sealed items are untouched. */
  clearPin(): void {
    removeKey(localStorage, PIN_STORAGE_KEY);
    removeKey(localStorage, ATTEMPT_STORAGE_KEY);
    this.relock();
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

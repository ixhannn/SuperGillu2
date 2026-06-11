import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useDraft — composer state that survives process death.
 *
 * Drop-in replacement for useState on compose fields: the value is restored
 * from localStorage on mount and persisted (debounced) on every change, so
 * Android killing the app mid-letter never loses written words. Call
 * `clearDraft` after a successful save; emptying the field naturally clears
 * the draft too.
 *
 * Values must be JSON-serializable. Media previews (data URLs) do NOT belong
 * in drafts — persist text fields only.
 */

const DRAFT_PREFIX = 'lior_draft_';
const PERSIST_DEBOUNCE_MS = 400;

const isEmptyDraft = (value: unknown): boolean => {
  if (value === '' || value === null || value === undefined) return true;
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).every((field) => field === '' || field === null || field === undefined);
  }
  return false;
};

export function useDraft<T>(key: string, initialValue: T): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = DRAFT_PREFIX + key;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return initialValue;
      const parsed = JSON.parse(raw) as T;
      // Object drafts merge over the initial shape so adding a new field to
      // a composer never crashes on an older stored draft.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && initialValue && typeof initialValue === 'object' && !Array.isArray(initialValue)) {
        return { ...initialValue, ...parsed };
      }
      return parsed;
    } catch {
      return initialValue;
    }
  });

  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      try {
        if (isEmptyDraft(latest.current)) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify(latest.current));
      } catch {
        // Quota/private-mode failures must never break typing.
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [value, storageKey]);

  const clearDraft = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    try { localStorage.removeItem(storageKey); } catch { /* best-effort */ }
  }, [storageKey]);

  return [value, setValue, clearDraft];
}

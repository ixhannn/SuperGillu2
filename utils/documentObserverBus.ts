/**
 * documentObserverBus — single MutationObserver on document.documentElement
 * that fans out attribute mutations to subscribers.
 *
 * Each subscriber declares the attributes it cares about. When any tracked
 * attribute mutates we run only matching subscribers. The previous design
 * had AmbientVisuals, LiveBackground3D, FloatingHeartsScene (×2) and
 * ConstellationCanvas each install their own observer — every theme write
 * (which mutates `style` on <html>) ran every callback. Consolidating into
 * one observer + per-subscriber filtering eliminates the redundant work
 * during theme transitions and view changes.
 */

export type DocAttrListener = () => void;

type Subscription = {
  attrs: Set<string>;
  fn: DocAttrListener;
};

const subs = new Set<Subscription>();
let observer: MutationObserver | null = null;
let bootstrapped = false;

const ensureObserver = (): void => {
  if (typeof document === 'undefined') return;
  if (observer) return;
  observer = new MutationObserver((records) => {
    // Collect the set of mutated attribute names in this batch.
    const mutated = new Set<string>();
    for (let i = 0; i < records.length; i++) {
      const a = records[i].attributeName;
      if (a) mutated.add(a);
    }
    if (mutated.size === 0) return;

    // Snapshot before iterating in case a callback subscribes/unsubscribes.
    const snapshot = Array.from(subs);
    for (let i = 0; i < snapshot.length; i++) {
      const s = snapshot[i];
      // Wildcard — fire on anything.
      if (s.attrs.size === 0) { s.fn(); continue; }
      let match = false;
      for (const a of s.attrs) {
        if (mutated.has(a)) { match = true; break; }
      }
      if (match) s.fn();
    }
  });
  observer.observe(document.documentElement, { attributes: true });
};

const stopObserverIfIdle = (): void => {
  if (!observer) return;
  if (subs.size > 0) return;
  observer.disconnect();
  observer = null;
};

/**
 * Subscribe to attribute mutations on <html>. Pass an empty array for "any
 * attribute" (e.g. when you don't know which one will change).
 *
 * Returns an unsubscribe fn.
 */
export const observeDocumentAttributes = (
  attrs: readonly string[],
  fn: DocAttrListener,
): (() => void) => {
  if (typeof document === 'undefined') return () => {};
  ensureObserver();
  const sub: Subscription = { attrs: new Set(attrs), fn };
  subs.add(sub);
  return () => {
    subs.delete(sub);
    stopObserverIfIdle();
  };
};

/** Visibility change fan-out — same idea, one listener for all consumers. */
const visListeners = new Set<DocAttrListener>();
let visBootstrapped = false;

const handleVisibilityChange = () => {
  for (const fn of visListeners) fn();
};

export const observeDocumentVisibility = (fn: DocAttrListener): (() => void) => {
  if (typeof document === 'undefined') return () => {};
  if (!visBootstrapped) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visBootstrapped = true;
  }
  visListeners.add(fn);
  return () => {
    visListeners.delete(fn);
    if (visListeners.size === 0 && visBootstrapped) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      visBootstrapped = false;
    }
  };
};

/**
 * Bootstrap helper to verify the module exports are picked up in HMR; safe
 * to call multiple times. Not strictly needed but documents the intent.
 */
export const bootstrapDocumentObserverBus = (): void => {
  if (bootstrapped) return;
  bootstrapped = true;
};

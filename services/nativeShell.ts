import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { syncEventTarget, SyncService } from './sync';
import { storageEventTarget, getPendingDeletes } from './storage';
import { getPendingUploads } from './storage/pendingOperations';

type ListenerHandle = { remove: () => Promise<void> | void };

export type NativeShellState = {
  isNative: boolean;
  platform: string;
  isOnline: boolean;
  connectionType: string;
  appActive: boolean;
  keyboardOpen: boolean;
  keyboardHeight: number;
  pendingUploads: number;
  pendingDeletes: number;
  syncStatus: string;
  ready: boolean;
};

type BackEvent = { canGoBack: boolean };
type BackHandler = (event: BackEvent) => boolean | void;

const readOnlineState = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

const readPendingUploads = () => {
  try { return getPendingUploads().length; } catch { return 0; }
};

const readPendingDeletes = () => {
  try { return getPendingDeletes().length; } catch { return 0; }
};

let state: NativeShellState = {
  isNative: Capacitor.isNativePlatform(),
  platform: Capacitor.getPlatform(),
  isOnline: readOnlineState(),
  connectionType: readOnlineState() ? 'unknown' : 'none',
  appActive: typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  keyboardOpen: false,
  keyboardHeight: 0,
  pendingUploads: readPendingUploads(),
  pendingDeletes: readPendingDeletes(),
  syncStatus: SyncService.status,
  ready: false,
};

let started = false;
let startEpoch = 0;
let cleanupFns: Array<() => void> = [];
let currentBackHandler: BackHandler | null = null;
const listeners = new Set<(next: NativeShellState) => void>();
const resumeListeners = new Set<() => void>();

const applyDocumentState = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.nativePlatform = state.platform;
  root.dataset.nativeShell = state.isNative ? 'native' : 'web';
  root.dataset.online = state.isOnline ? 'true' : 'false';
  root.dataset.connectionType = state.connectionType;
  root.dataset.appActive = state.appActive ? 'true' : 'false';
  root.dataset.nativeReady = state.ready ? 'true' : 'false';
  if (state.keyboardOpen) root.dataset.keyboardOpen = 'true';
  else delete root.dataset.keyboardOpen;
  root.style.setProperty('--lior-keyboard-height', `${state.keyboardHeight}px`);
  if (typeof window !== 'undefined') {
    const visualViewport = window.visualViewport;
    root.style.setProperty('--lior-visual-viewport-height', `${Math.round(visualViewport?.height ?? window.innerHeight)}px`);
    root.style.setProperty('--lior-visual-viewport-offset-top', `${Math.round(visualViewport?.offsetTop ?? 0)}px`);
  }
};

// Shallow-equality skip — without this, every refreshPendingCounts() (fires
// on every sync tick + every storage write) created a new state object and
// woke every React subscriber. BottomNav.tsx in particular re-rendered on
// every sync event because of that, dragging the bottom nav animation.
const shallowEqual = (a: NativeShellState, b: NativeShellState): boolean => {
  return a.isNative === b.isNative
    && a.platform === b.platform
    && a.isOnline === b.isOnline
    && a.connectionType === b.connectionType
    && a.appActive === b.appActive
    && a.keyboardOpen === b.keyboardOpen
    && a.keyboardHeight === b.keyboardHeight
    && a.pendingUploads === b.pendingUploads
    && a.pendingDeletes === b.pendingDeletes
    && a.syncStatus === b.syncStatus
    && a.ready === b.ready;
};

const emit = (patch: Partial<NativeShellState> = {}) => {
  const next = { ...state, ...patch };
  const changed = !shallowEqual(state, next);
  state = next;
  applyDocumentState();
  if (!changed) return;
  const snapshot = { ...state };
  listeners.forEach((listener) => listener(snapshot));
};

const refreshPendingCounts = () => {
  emit({
    pendingUploads: readPendingUploads(),
    pendingDeletes: readPendingDeletes(),
    syncStatus: SyncService.status,
  });
};

const addCleanupHandle = async (handleOrPromise: ListenerHandle | Promise<ListenerHandle>) => {
  const epoch = startEpoch;
  try {
    const handle = await handleOrPromise;
    if (epoch !== startEpoch) { void handle.remove(); return; }
    cleanupFns.push(() => { void handle.remove(); });
  } catch {}
};

async function configureStatusBar() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});

    const syncStyle = () => {
      const theme = typeof document === 'undefined' ? 'rose' : document.documentElement.dataset.theme;
      const style = theme === 'starry-night' ? Style.Dark : Style.Light;
      void StatusBar.setStyle({ style }).catch(() => {});
    };
    syncStyle();

    if (typeof document !== 'undefined') {
      const observer = new MutationObserver(syncStyle);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      cleanupFns.push(() => observer.disconnect());
    }
  } catch {}
}

async function configureKeyboard() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    // Overlay model: keep the WebView frame stable and let the app add
    // keyboard-aware scroll padding. On Android, resize mode is controlled by
    // windowSoftInputMode; native resize can expose the system window surface
    // as a large grey panel behind our fixed app shell.
    await Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
    // We reveal the focused field by scrolling the app shell, not by letting
    // Capacitor or the browser push the entire WebView.
    await Keyboard.setScroll({ isDisabled: true }).catch(() => {});

    let revealAnimationFrame = 0;
    let revealTimer = 0;
    let revealSettledTimer = 0;
    let focusPendingTimer = 0;

    const revealFocusedInput = () => {
      if (typeof document === 'undefined') return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || (!/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && !active.isContentEditable)) return;

      const scroller = active.closest<HTMLElement>('.lenis-wrapper') ?? document.querySelector<HTMLElement>('.lenis-wrapper');
      if (!scroller) return;

      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
      }

      const rect = active.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const visualBottom = visualViewport
        ? visualViewport.offsetTop + visualViewport.height
        : window.innerHeight;
      const reportedKeyboardTop = state.keyboardHeight > 0
        ? window.innerHeight - state.keyboardHeight
        : window.innerHeight;
      const keyboardTop = state.keyboardOpen
        ? Math.min(visualBottom, reportedKeyboardTop)
        : visualBottom;
      const topGuard = Math.max(104, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lior-keyboard-top-guard')) || 0);
      const bottomGuard = 18;

      let delta = 0;
      const bottomLimit = keyboardTop - bottomGuard;
      if (rect.bottom > bottomLimit) {
        delta = rect.bottom - bottomLimit;
      }

      const topAfterBottomCorrection = rect.top - delta;
      if (topAfterBottomCorrection < topGuard) {
        delta -= topGuard - topAfterBottomCorrection;
      }

      if (Math.abs(delta) > 1) {
        scroller.scrollBy({ top: delta, left: 0, behavior: 'auto' });
      }
    };

    const cancelFocusedInputReveal = () => {
      if (revealAnimationFrame) {
        window.cancelAnimationFrame(revealAnimationFrame);
        revealAnimationFrame = 0;
      }
      if (revealTimer) {
        window.clearTimeout(revealTimer);
        revealTimer = 0;
      }
      if (revealSettledTimer) {
        window.clearTimeout(revealSettledTimer);
        revealSettledTimer = 0;
      }
      if (focusPendingTimer) {
        window.clearTimeout(focusPendingTimer);
        focusPendingTimer = 0;
      }
    };

    const scheduleFocusedInputReveal = () => {
      cancelFocusedInputReveal();
      revealAnimationFrame = window.requestAnimationFrame(() => {
        revealAnimationFrame = window.requestAnimationFrame(() => {
          revealAnimationFrame = 0;
          revealFocusedInput();
        });
      });
      revealTimer = window.setTimeout(() => {
        revealTimer = 0;
        revealFocusedInput();
      }, 140);
      revealSettledTimer = window.setTimeout(() => {
        revealSettledTimer = 0;
        revealFocusedInput();
      }, 320);
    };

    const onVisualViewportChange = () => {
      applyDocumentState();
      if (state.keyboardOpen) scheduleFocusedInputReveal();
    };

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', onVisualViewportChange);
    visualViewport?.addEventListener('scroll', onVisualViewportChange);
    cleanupFns.push(() => {
      cancelFocusedInputReveal();
      visualViewport?.removeEventListener('resize', onVisualViewportChange);
      visualViewport?.removeEventListener('scroll', onVisualViewportChange);
    });

    const closeKeyboard = () => {
      cancelFocusedInputReveal();
      emit({ keyboardOpen: false, keyboardHeight: 0 });
      window.requestAnimationFrame(() => {
        if (window.scrollX !== 0 || window.scrollY !== 0) {
          window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
        }
      });
    };

    await addCleanupHandle(Keyboard.addListener('keyboardWillShow', (info: { keyboardHeight?: number }) => {
      emit({ keyboardOpen: true, keyboardHeight: Math.max(0, Number(info.keyboardHeight) || 0) });
      scheduleFocusedInputReveal();
    }));
    await addCleanupHandle(Keyboard.addListener('keyboardDidShow', (info: { keyboardHeight?: number }) => {
      emit({ keyboardOpen: true, keyboardHeight: Math.max(0, Number(info.keyboardHeight) || 0) });
      scheduleFocusedInputReveal();
    }));
    await addCleanupHandle(Keyboard.addListener('keyboardWillHide', () => {
      closeKeyboard();
    }));
    await addCleanupHandle(Keyboard.addListener('keyboardDidHide', () => {
      closeKeyboard();
    }));

    const onFocusIn = () => {
      if (state.keyboardOpen) {
        scheduleFocusedInputReveal();
        return;
      }
      cancelFocusedInputReveal();
      focusPendingTimer = window.setTimeout(() => {
        focusPendingTimer = 0;
        if (state.keyboardOpen) scheduleFocusedInputReveal();
      }, 120);
    };
    document.addEventListener('focusin', onFocusIn);
    cleanupFns.push(() => document.removeEventListener('focusin', onFocusIn));
  } catch {}
}

async function configureNetwork() {
  const updateFromBrowser = () => {
    const online = readOnlineState();
    emit({ isOnline: online, connectionType: online ? 'unknown' : 'none' });
  };
  window.addEventListener('online', updateFromBrowser);
  window.addEventListener('offline', updateFromBrowser);
  cleanupFns.push(() => {
    window.removeEventListener('online', updateFromBrowser);
    window.removeEventListener('offline', updateFromBrowser);
  });

  try {
    const mod = (await import('@capacitor/network')) as {
      Network?: {
        getStatus: () => Promise<{ connected: boolean; connectionType?: string }>;
        addListener: (eventName: 'networkStatusChange', cb: (status: { connected: boolean; connectionType?: string }) => void) => Promise<ListenerHandle> | ListenerHandle;
      };
    };
    if (!mod.Network) return;
    const status = await mod.Network.getStatus();
    emit({ isOnline: status.connected, connectionType: status.connectionType ?? (status.connected ? 'unknown' : 'none') });
    await addCleanupHandle(mod.Network.addListener('networkStatusChange', (next) => {
      emit({ isOnline: next.connected, connectionType: next.connectionType ?? (next.connected ? 'unknown' : 'none') });
      if (next.connected) refreshPendingCounts();
    }));
  } catch {}
}

const waitForStablePaint = () => new Promise<void>((resolve) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    resolve();
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => resolve());
  });
});

export const NativeShellService = {
  start(options: { onHardwareBack?: BackHandler } = {}) {
    currentBackHandler = options.onHardwareBack ?? null;
    if (started) {
      emit();
      return;
    }
    started = true;
    applyDocumentState();

    if (Capacitor.isNativePlatform()) {
      void addCleanupHandle(CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        const handled = currentBackHandler?.({ canGoBack });
        if (!handled) {
          void CapacitorApp.minimizeApp();
        }
      }));

      void addCleanupHandle(CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        const wasActive = state.appActive;
        emit({ appActive: isActive });
        if (!wasActive && isActive) {
          refreshPendingCounts();
          resumeListeners.forEach((listener) => listener());
        }
      }));
    }

    const onVisibility = () => {
      const active = document.visibilityState !== 'hidden';
      const wasActive = state.appActive;
      emit({ appActive: active });
      if (!wasActive && active) {
        refreshPendingCounts();
        resumeListeners.forEach((listener) => listener());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const onStorageOrSync = () => refreshPendingCounts();
    storageEventTarget.addEventListener('storage-update', onStorageOrSync);
    syncEventTarget.addEventListener('sync-update', onStorageOrSync);
    cleanupFns.push(() => {
      storageEventTarget.removeEventListener('storage-update', onStorageOrSync);
      syncEventTarget.removeEventListener('sync-update', onStorageOrSync);
    });

    void configureStatusBar();
    void configureKeyboard();
    void configureNetwork();
    refreshPendingCounts();
  },

  stop() {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
    currentBackHandler = null;
    started = false;
    startEpoch += 1;
  },

  getState(): NativeShellState {
    return { ...state };
  },

  subscribe(listener: (next: NativeShellState) => void): () => void {
    listeners.add(listener);
    listener({ ...state });
    return () => listeners.delete(listener);
  },

  onResume(listener: () => void): () => void {
    resumeListeners.add(listener);
    return () => resumeListeners.delete(listener);
  },

  async markReady() {
    if (state.ready) return;
    await waitForStablePaint();
    emit({ ready: true });
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide({ fadeOutDuration: 200 });
    } catch {}
  },

  minimizeApp() {
    if (!Capacitor.isNativePlatform()) return;
    void CapacitorApp.minimizeApp();
  },
};

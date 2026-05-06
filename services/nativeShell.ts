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
  appActive: boolean;
  keyboardOpen: boolean;
  keyboardHeight: number;
  pendingUploads: number;
  pendingDeletes: number;
  syncStatus: string;
};

type BackEvent = { canGoBack: boolean };
type BackHandler = (event: BackEvent) => boolean | void;

const NETWORK_NS = '@capacitor/network';

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
  appActive: typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  keyboardOpen: false,
  keyboardHeight: 0,
  pendingUploads: readPendingUploads(),
  pendingDeletes: readPendingDeletes(),
  syncStatus: SyncService.status,
};

let started = false;
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
  root.dataset.appActive = state.appActive ? 'true' : 'false';
  if (state.keyboardOpen) root.dataset.keyboardOpen = 'true';
  else delete root.dataset.keyboardOpen;
  root.style.setProperty('--lior-keyboard-height', `${state.keyboardHeight}px`);
};

const emit = (patch: Partial<NativeShellState> = {}) => {
  state = { ...state, ...patch };
  applyDocumentState();
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
  try {
    const handle = await handleOrPromise;
    cleanupFns.push(() => { void handle.remove(); });
  } catch {}
};

async function configureStatusBar() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  } catch {}
}

async function configureKeyboard() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {});
    await Keyboard.setScroll({ isDisabled: false }).catch(() => {});

    await addCleanupHandle(Keyboard.addListener('keyboardWillShow', (info: { keyboardHeight?: number }) => {
      emit({ keyboardOpen: true, keyboardHeight: Math.max(0, Number(info.keyboardHeight) || 0) });
    }));
    await addCleanupHandle(Keyboard.addListener('keyboardDidShow', (info: { keyboardHeight?: number }) => {
      emit({ keyboardOpen: true, keyboardHeight: Math.max(0, Number(info.keyboardHeight) || 0) });
    }));
    await addCleanupHandle(Keyboard.addListener('keyboardWillHide', () => {
      emit({ keyboardOpen: false, keyboardHeight: 0 });
    }));
    await addCleanupHandle(Keyboard.addListener('keyboardDidHide', () => {
      emit({ keyboardOpen: false, keyboardHeight: 0 });
    }));
  } catch {}
}

async function configureNetwork() {
  const updateFromBrowser = () => emit({ isOnline: readOnlineState() });
  window.addEventListener('online', updateFromBrowser);
  window.addEventListener('offline', updateFromBrowser);
  cleanupFns.push(() => {
    window.removeEventListener('online', updateFromBrowser);
    window.removeEventListener('offline', updateFromBrowser);
  });

  try {
    const mod = (await import(/* @vite-ignore */ NETWORK_NS)) as {
      Network?: {
        getStatus: () => Promise<{ connected: boolean }>;
        addListener: (eventName: 'networkStatusChange', cb: (status: { connected: boolean }) => void) => Promise<ListenerHandle> | ListenerHandle;
      };
    };
    if (!mod.Network) return;
    const status = await mod.Network.getStatus();
    emit({ isOnline: status.connected });
    await addCleanupHandle(mod.Network.addListener('networkStatusChange', (next) => {
      emit({ isOnline: next.connected });
      if (next.connected) refreshPendingCounts();
    }));
  } catch {}
}

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

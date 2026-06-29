type DiagnosticKind = 'error' | 'rejection' | 'navigation' | 'info';

export type DiagnosticEvent = {
  id: string;
  kind: DiagnosticKind;
  source: string;
  message: string;
  timestamp: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
};

export type DiagnosticsSnapshot = {
  totalEvents: number;
  errorCount: number;
  rejectionCount: number;
  navigationCount: number;
  slowNavigationCount: number;
  averageNavigationMs: number | null;
  recent: DiagnosticEvent[];
};

const DIAGNOSTICS_KEY = 'lior_diagnostics_v1';
const MAX_EVENTS = 80;
const SLOW_NAVIGATION_MS = 650;

let isStarted = false;

// Optional remote sink. Kept as a plug-in callback so this low-level module
// never imports the Supabase client (which would create an import cycle and
// couple diagnostics to the network layer). errorSink.ts registers the real
// implementation at startup; until then errors are still captured locally.
type RemoteSink = (event: DiagnosticEvent) => void;
let remoteSink: RemoteSink | null = null;

const getStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const readEvents = (): DiagnosticEvent[] => {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(DIAGNOSTICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DiagnosticEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeEvents = (events: DiagnosticEvent[]) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(DIAGNOSTICS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch {
    // Storage full (QuotaExceededError) or write-blocked — diagnostics are best-effort.
  }
};

const nextId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
};

const normalizeErrorMessage = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Unknown diagnostic event';
};

const appendEvent = (event: Omit<DiagnosticEvent, 'id' | 'timestamp'>) => {
  const next: DiagnosticEvent = {
    id: nextId(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  writeEvents([next, ...readEvents()]);
  // Forward genuine faults to the remote sink (best-effort, never throws).
  if (remoteSink && (next.kind === 'error' || next.kind === 'rejection')) {
    try {
      remoteSink(next);
    } catch {
      // A failing sink must never break the app or the local diagnostic log.
    }
  }
};

const onWindowError = (event: ErrorEvent) => {
  appendEvent({
    kind: 'error',
    source: 'window',
    message: normalizeErrorMessage(event.error || event.message),
    meta: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  });
};

const onUnhandledRejection = (event: PromiseRejectionEvent) => {
  appendEvent({
    kind: 'rejection',
    source: 'promise',
    message: normalizeErrorMessage(event.reason),
  });
};

export const DiagnosticsService = {
  start() {
    if (isStarted || typeof window === 'undefined') return;
    isStarted = true;
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  },

  /** Register a remote error sink. Safe to call once at startup. */
  setRemoteSink(sink: RemoteSink | null) {
    remoteSink = sink;
  },

  recordInfo(source: string, message: string, meta?: Record<string, unknown>) {
    appendEvent({ kind: 'info', source, message, meta });
  },

  recordError(source: string, error: unknown, meta?: Record<string, unknown>) {
    appendEvent({
      kind: 'error',
      source,
      message: normalizeErrorMessage(error),
      meta,
    });
  },

  recordNavigation(view: string, direction: string, durationMs: number) {
    appendEvent({
      kind: 'navigation',
      source: 'navigation',
      message: `${direction} -> ${view}`,
      durationMs,
      meta: {
        view,
        direction,
        slow: durationMs >= SLOW_NAVIGATION_MS,
      },
    });
  },

  clear() {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(DIAGNOSTICS_KEY);
  },

  getEvents() {
    return readEvents();
  },

  getSnapshot(): DiagnosticsSnapshot {
    const events = readEvents();
    const navigationEvents = events.filter((event) => event.kind === 'navigation');
    const totalNavigationMs = navigationEvents.reduce(
      (sum, event) => sum + Number(event.durationMs || 0),
      0,
    );

    return {
      totalEvents: events.length,
      errorCount: events.filter((event) => event.kind === 'error').length,
      rejectionCount: events.filter((event) => event.kind === 'rejection').length,
      navigationCount: navigationEvents.length,
      slowNavigationCount: navigationEvents.filter(
        (event) => Number(event.durationMs || 0) >= SLOW_NAVIGATION_MS,
      ).length,
      averageNavigationMs: navigationEvents.length > 0
        ? Math.round(totalNavigationMs / navigationEvents.length)
        : null,
      recent: events.slice(0, 10),
    };
  },
};


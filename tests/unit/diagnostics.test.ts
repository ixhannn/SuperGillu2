import { DiagnosticsService } from '../../services/diagnostics';

const createStorageMock = () => {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } satisfies Storage;
};

describe('DiagnosticsService', () => {
  beforeEach(() => {
    const localStorage = createStorageMock();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorage,
    });
    DiagnosticsService.clear();
  });

  it('records errors and route timings into a local snapshot', () => {
    DiagnosticsService.recordError('storage', new Error('Disk full'));
    DiagnosticsService.recordNavigation('private-space', 'push', 812);
    DiagnosticsService.recordInfo('app', 'Boot complete');

    const snapshot = DiagnosticsService.getSnapshot();

    expect(snapshot.totalEvents).toBe(3);
    expect(snapshot.errorCount).toBe(1);
    expect(snapshot.navigationCount).toBe(1);
    expect(snapshot.slowNavigationCount).toBe(1);
    expect(snapshot.averageNavigationMs).toBe(812);
    expect(snapshot.recent[0]?.source).toBe('app');
  });
});


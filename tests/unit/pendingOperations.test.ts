import {
  addPendingDelete,
  addPendingUpload,
  getPendingDeletes,
  getPendingUploads,
  isDeletedLocally,
  removePendingDelete,
  removePendingUpload,
} from '../../services/storage/pendingOperations';

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

describe('pendingOperations', () => {
  beforeEach(() => {
    const storage = createStorageMock();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
  });

  it('deduplicates pending deletes and removes them cleanly', () => {
    addPendingDelete('memories', 'm_1');
    addPendingDelete('memories', 'm_1');

    expect(getPendingDeletes()).toEqual([{ table: 'memories', id: 'm_1' }]);
    expect(isDeletedLocally('memories', 'm_1')).toBe(true);

    removePendingDelete('memories', 'm_1');

    expect(getPendingDeletes()).toEqual([]);
    expect(isDeletedLocally('memories', 'm_1')).toBe(false);
  });

  it('tracks pending uploads without duplicating queue entries', () => {
    addPendingUpload({
      listKey: 'memories',
      storageKey: 'lior_memories',
      prefix: 'mem',
      itemId: 'mem_123',
      hasImage: true,
      hasVideo: false,
    });
    addPendingUpload({
      listKey: 'memories',
      storageKey: 'lior_memories',
      prefix: 'mem',
      itemId: 'mem_123',
      hasImage: true,
      hasVideo: false,
    });

    expect(getPendingUploads()).toHaveLength(1);

    removePendingUpload('memories', 'mem_123');

    expect(getPendingUploads()).toEqual([]);
  });
});


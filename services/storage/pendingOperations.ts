const PENDING_UPLOADS_KEY = 'lior_pending_uploads';
const PENDING_DELETES_KEY = 'lior_pending_deletes';

export type PendingUpload = {
  listKey: string;
  storageKey: string;
  prefix: string;
  itemId: string;
  hasImage: boolean;
  hasVideo: boolean;
};

export type PendingDelete = {
  table: string;
  id: string;
};

const readJsonList = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeJsonList = (key: string, list: unknown[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // localStorage full / unavailable — pending-op tracking is best-effort, never abort the caller.
  }
};

export const getPendingUploads = (): PendingUpload[] =>
  readJsonList<PendingUpload>(PENDING_UPLOADS_KEY);

export const addPendingUpload = (entry: PendingUpload) => {
  const list = getPendingUploads();
  const exists = list.find(
    (item) => item.listKey === entry.listKey && item.itemId === entry.itemId,
  );
  if (!exists) writeJsonList(PENDING_UPLOADS_KEY, [...list, entry]);
};

export const removePendingUpload = (listKey: string, itemId: string) => {
  writeJsonList(
    PENDING_UPLOADS_KEY,
    getPendingUploads().filter(
      (item) => !(item.listKey === listKey && item.itemId === itemId),
    ),
  );
};

export const getPendingDeletes = (): PendingDelete[] =>
  readJsonList<PendingDelete>(PENDING_DELETES_KEY);

const savePendingDeletes = (list: PendingDelete[]) => {
  writeJsonList(PENDING_DELETES_KEY, list);
};

export const addPendingDelete = (table: string, id: string) => {
  const list = getPendingDeletes();
  if (!list.find((entry) => entry.table === table && entry.id === id)) {
    savePendingDeletes([...list, { table, id }]);
  }
};

export const removePendingDelete = (table: string, id: string) => {
  savePendingDeletes(
    getPendingDeletes().filter(
      (entry) => !(entry.table === table && entry.id === id),
    ),
  );
};

export const isDeletedLocally = (table: string, id: string): boolean =>
  getPendingDeletes().some((entry) => entry.table === table && entry.id === id);


/**
 * Build a fast lookup of remotely-deleted logical ids keyed by table.
 *
 * @param {Array<{table_name?: string, logical_id?: string, table?: string, id?: string}>} entries
 */
export function createDeletionLookup(entries = []) {
  /** @type {Record<string, Set<string>>} */
  const lookup = {};

  for (const entry of entries) {
    const table = typeof entry?.table_name === 'string' ? entry.table_name : entry?.table;
    const logicalId = typeof entry?.logical_id === 'string' ? entry.logical_id : entry?.id;

    if (!table || !logicalId) continue;
    if (!lookup[table]) lookup[table] = new Set();
    lookup[table].add(logicalId);
  }

  return lookup;
}

/**
 * @param {Record<string, Set<string>>} lookup
 * @param {string} table
 * @param {string | undefined | null} id
 */
export function hasRecordedDeletion(lookup, table, id) {
  return !!(table && id && lookup?.[table]?.has(id));
}

/**
 * Exclude anything deleted locally or remotely from cloud re-upload.
 *
 * @template T extends { id?: string | null }
 * @param {T[]} localItems
 * @param {string} table
 * @param {Record<string, Set<string>>} lookup
 * @param {(table: string, id: string) => boolean} isLocallyDeleted
 */
export function filterUploadableItems(localItems, table, lookup, isLocallyDeleted) {
  return localItems.filter((item) => {
    const id = item?.id;
    if (!id) return false;
    if (isLocallyDeleted(table, id)) return false;
    return !hasRecordedDeletion(lookup, table, id);
  });
}

/**
 * Find local ids that must be purged because the cloud has an authoritative
 * deletion tombstone for them.
 *
 * @template T extends { id?: string | null }
 * @param {T[]} localItems
 * @param {string} table
 * @param {Record<string, Set<string>>} lookup
 */
export function getRemoteDeletedIdsToPurge(localItems, table, lookup) {
  return localItems
    .map((item) => item?.id)
    .filter((id) => typeof id === 'string' && hasRecordedDeletion(lookup, table, id));
}

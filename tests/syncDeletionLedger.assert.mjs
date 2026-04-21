import assert from 'node:assert/strict';

import {
  createDeletionLookup,
  filterUploadableItems,
  getRemoteDeletedIdsToPurge,
} from '../services/syncDeletionLedger.js';

const lookup = createDeletionLookup([
  { table_name: 'memories', logical_id: 'mem-1' },
  { table: 'notes', id: 'note-1' },
  { table: 'memories', id: 'mem-2' },
]);

assert.equal(lookup.memories?.has('mem-1'), true);
assert.equal(lookup.memories?.has('mem-2'), true);
assert.equal(lookup.notes?.has('note-1'), true);

const localMemories = [
  { id: 'mem-1', text: 'deleted remotely' },
  { id: 'mem-2', text: 'deleted remotely' },
  { id: 'mem-3', text: 'still active' },
  { id: 'mem-4', text: 'deleted locally only' },
];

const uploadable = filterUploadableItems(
  localMemories,
  'memories',
  lookup,
  (table, id) => table === 'memories' && id === 'mem-4',
);

assert.deepEqual(uploadable.map((item) => item.id), ['mem-3']);
assert.deepEqual(getRemoteDeletedIdsToPurge(localMemories, 'memories', lookup), ['mem-1', 'mem-2']);

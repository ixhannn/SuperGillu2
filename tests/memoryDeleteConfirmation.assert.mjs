import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const timelineSource = readFileSync(new URL('../views/MemoryTimeline.tsx', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const confirmModalSource = readFileSync(new URL('../components/ConfirmModal.tsx', import.meta.url), 'utf8');

assert.ok(
  timelineSource.includes("import { ConfirmModal } from '../components/ConfirmModal';"),
  'Expected MemoryTimeline to import ConfirmModal for destructive delete actions',
);

assert.ok(
  timelineSource.includes('Delete memory?'),
  'Expected MemoryTimeline to show a delete confirmation title',
);

assert.ok(
  timelineSource.includes('This removes it from your devices and cloud vault for good.'),
  'Expected MemoryTimeline to warn that delete removes the memory from local and cloud storage',
);

assert.ok(
  timelineSource.includes('setPendingDeleteId(id);') && timelineSource.includes('await StorageService.deleteMemory(id);'),
  'Expected trash taps to stage deletion and confirmation to execute the storage delete',
);

assert.ok(
  timelineSource.includes('onPointerDownCapture={openDeleteConfirm}')
    && timelineSource.includes('onMouseDownCapture={openDeleteConfirm}')
    && timelineSource.includes('onTouchStartCapture={openDeleteConfirm}')
    && timelineSource.includes('onClickCapture={openDeleteConfirm}')
    && timelineSource.includes('onPointerDownCapture={openMemoryDeleteConfirm}')
    && timelineSource.includes('onMouseDownCapture={openMemoryDeleteConfirm}')
    && timelineSource.includes('onTouchStartCapture={openMemoryDeleteConfirm}')
    && timelineSource.includes('onClickCapture={openMemoryDeleteConfirm}'),
  'Expected delete buttons to open confirmation from capture-phase pointer, mouse, touch, and click events',
);

assert.ok(
  timelineSource.includes('data-memory-delete="true"')
    && timelineSource.includes('w-14 h-14')
    && timelineSource.includes('w-12 h-12'),
  'Expected memory delete hit targets to be large enough for reliable touch input',
);

assert.ok(
  timelineSource.includes('deleteRequestScheduledRef.current') && timelineSource.includes('}, 500);'),
  'Expected delete confirmation opening to be deduplicated across overlapping press events',
);

assert.ok(
  confirmModalSource.includes('openedAtRef') && confirmModalSource.includes('Date.now() - openedAtRef.current < 500'),
  'Expected confirmation modal backdrop to ignore the stray click that can follow the opening tap',
);

assert.ok(
  storageSource.includes("getMemories: () => DATA_CACHE.memories.filter(m => !isDeletedLocally('memories', m.id))"),
  'Expected memory reads to hide locally tombstoned memories so sync/cache reloads cannot reshuffle deleted items back in',
);

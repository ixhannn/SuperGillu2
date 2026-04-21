import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const timelineSource = readFileSync(new URL('../views/MemoryTimeline.tsx', import.meta.url), 'utf8');

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

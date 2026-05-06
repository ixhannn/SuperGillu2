import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8');

assert.ok(
  homeSource.includes('const getMemoryDateKey = (memory: Partial<Memory>): string | null => {'),
  'Expected Home to parse memory date keys through a guarded helper',
);

assert.ok(
  homeSource.includes('mems.map(getMemoryDateKey).filter(isMemoryDateKey)'),
  'Expected Home streak calculation to ignore legacy memories without valid dates',
);

assert.ok(
  !homeSource.includes('mems.map(m => m.date.split'),
  'Home streak calculation should not call split directly on memory.date',
);

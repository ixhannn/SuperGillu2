import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dailyVideoView = readFileSync(new URL('../views/DailyVideoView.tsx', import.meta.url), 'utf8');
const videoMomentsService = readFileSync(new URL('../services/videoMoments.ts', import.meta.url), 'utf8');

assert.ok(
  videoMomentsService.includes('async ensureFilmsUpToDate('),
  'Expected VideoMomentsService to expose ensureFilmsUpToDate()',
);

assert.ok(
  videoMomentsService.includes("await import('./videoCompiler')"),
  'Expected film generation to load the compiler when a cycle needs a film',
);

assert.ok(
  dailyVideoView.includes('VideoMomentsService.ensureFilmsUpToDate('),
  'Expected DailyVideoView to trigger film generation during refresh',
);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memoryTimeline = readFileSync(new URL('../views/MemoryTimeline.tsx', import.meta.url), 'utf8');
const dailyMoments = readFileSync(new URL('../views/DailyMoments.tsx', import.meta.url), 'utf8');

assert.ok(
  memoryTimeline.includes('const videoStoragePath = selectVideoStoragePath(memory.videoStoragePath, memory.storagePath, memory.videoMimeType || memory.imageMimeType);') &&
    memoryTimeline.includes('const isVideo = !!(memory.video || memory.videoId || videoStoragePath);'),
  'Expected Journey memories to classify R2-only videoStoragePath rows as videos',
);

assert.ok(
  memoryTimeline.includes('!videoStoragePath'),
  'Expected audio-only detection to exclude memories that have only videoStoragePath',
);

assert.ok(
  dailyMoments.includes('const videoStoragePath = selectVideoStoragePath(photo.videoStoragePath, photo.storagePath, photo.videoMimeType || photo.imageMimeType);') &&
    dailyMoments.includes('const isVideo = !!(photo.video || photo.videoId || videoStoragePath);'),
  'Expected Daily Moments to classify R2-only videoStoragePath rows as videos',
);

assert.ok(
  dailyMoments.includes('shouldResolveVideoPreview ? videoStoragePath : undefined'),
  'Expected Daily Moments thumbnails to fall back to videoStoragePath when no image thumbnail is available',
);

assert.ok(
  memoryTimeline.includes('selectImageStoragePath(memory.storagePath, memory.imageMimeType)') &&
    dailyMoments.includes('selectImageStoragePath(photo.storagePath, photo.imageMimeType)'),
  'Expected R2 video keys accidentally stored in storagePath to be excluded from image resolution',
);

// The Keepsakes R2-media assertion was removed when the KeepsakeBox feature
// was deleted (views/KeepsakeBox.tsx no longer exists).

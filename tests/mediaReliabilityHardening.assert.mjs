import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const syncSource = readFileSync(new URL('../services/sync.ts', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../cloudflare/worker.js', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../admin/adminApi.ts', import.meta.url), 'utf8');

assert.ok(
  syncSource.includes('await StorageService.recoverImagesFromCloud();'),
  'Expected cloud reconcile to rebuild missing local media cache automatically',
);

assert.ok(
  workerSource.includes("const ADMIN_REPAIR_ROUTE = '/__admin/actions/repair';"),
  'Expected the worker to expose an admin repair route',
);

assert.ok(
  !workerSource.includes('X-Upload-Key') && !workerSource.includes('UPLOAD_KEY'),
  'Worker must not allow the legacy shared upload-key fallback; managed uploads must use Supabase session auth',
);

assert.ok(
  !workerSource.includes('usingUploadKeyFallback') && !workerSource.includes('upload_legacy'),
  'Worker must not retain stale upload-key fallback branches after removing the shared key path',
);

assert.ok(
  workerSource.includes('await deleteMediaAssetByKey(env, key);'),
  'Expected delete paths and cleanup tasks to remove authoritative media index rows',
);

assert.ok(
  workerSource.includes("event_type: 'repair.legacy_ref_rewritten'"),
  'Expected legacy repair events to be recorded by the worker',
);

assert.ok(
  adminSource.includes("'/__admin/actions/repair'"),
  'Expected the admin dashboard API to support the repair action',
);

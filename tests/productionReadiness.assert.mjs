import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const packageJson = JSON.parse(read('package.json'));
const [major, minor, patch] = packageJson.version.split('.').map((part) => Number.parseInt(part, 10));
const expectedVersionCode = major * 10000 + minor * 100 + patch;
const androidBuild = read('android/app/build.gradle');

const migrationFiles = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'));
const migrationVersions = migrationFiles.map((name) => name.split('_')[0]);
const duplicateMigrationVersions = migrationVersions.filter((version, index) => migrationVersions.indexOf(version) !== index);

assert.deepEqual(
  duplicateMigrationVersions,
  [],
  'Supabase migration filenames should use unique version prefixes so db push can reconcile history.',
);

assert.match(
  androidBuild,
  new RegExp(`versionName "${packageJson.version.replace(/\./g, '\\.')}"`),
  'Android versionName should match package.json version.',
);

assert.match(
  androidBuild,
  new RegExp(`versionCode ${expectedVersionCode}\\b`),
  'Android versionCode should be derived from package.json semver.',
);

const mediaStorageSource = read('services/mediaStorage.ts');
const storageSource = read('services/storage.ts');
const workerSource = read('cloudflare/worker.js');
const envExample = read('.env.example');
const roomSceneSource = read('components/room/RoomScene3D.tsx');
const heartsSceneSource = read('components/FloatingHeartsScene.tsx');
const threeConsoleSource = read('utils/threeConsole.ts');

for (const [label, source] of [
  ['services/mediaStorage.ts', mediaStorageSource],
  ['cloudflare/worker.js', workerSource],
  ['.env.example', envExample],
]) {
  assert.doesNotMatch(
    source,
    /VITE_R2_UPLOAD_KEY|X-Upload-Key|UPLOAD_KEY/,
    `${label} should not reference the legacy client upload-key path.`,
  );
}

assert.ok(
  !exists('admin-dashboard/tailwind.config.js') || read('admin-dashboard/tailwind.config.js').includes('content'),
  'Admin dashboard Tailwind config should declare content paths if present.',
);

assert.ok(
  exists('admin-dashboard/tailwind.config.cjs') || exists('admin-dashboard/tailwind.config.js'),
  'Admin dashboard should have its own Tailwind config so builds do not use an empty default config.',
);

const adminTailwindConfig = exists('admin-dashboard/tailwind.config.cjs')
  ? read('admin-dashboard/tailwind.config.cjs')
  : read('admin-dashboard/tailwind.config.js');

assert.match(
  adminTailwindConfig,
  /content:\s*\[[\s\S]*(index\.html|admin)[\s\S]*\]/,
  'Admin dashboard Tailwind config should scan the admin shell and shared admin source.',
);

const e2eHarnessSource = read('services/e2eHarness.ts');

assert.match(
  e2eHarnessSource,
  /setE2EDefaultJson\('lior_identity'/,
  'E2E bootstrap should set identity defaults through a helper that preserves explicitly seeded test state.',
);

assert.doesNotMatch(
  e2eHarnessSource,
  /localStorage\.setItem\('lior_identity'/,
  'E2E bootstrap should not overwrite a profile that a browser test already seeded.',
);

assert.doesNotMatch(
  workerSource,
  /usingUploadKeyFallback|upload_legacy/,
  'Cloudflare worker should not retain stale legacy upload-key control flow.',
);

assert.match(
  mediaStorageSource,
  /isE2EAppMode\(\)[\s\S]*return null/,
  'Managed media uploads should skip remote writes quietly in browser e2e mode.',
);

assert.match(
  storageSource,
  /addPendingUpload\(\{[\s\S]*hasImage: needsImage,[\s\S]*hasVideo: needsVideo/,
  'Background media uploads that still need remote storage should be queued for a future sync retry.',
);

assert.match(
  threeConsoleSource,
  /THREE\.Clock: This module has been deprecated/,
  'React Three Fiber Clock deprecation noise should be filtered until the upstream package removes it.',
);

for (const [label, source] of [
  ['RoomScene3D.tsx', roomSceneSource],
  ['FloatingHeartsScene.tsx', heartsSceneSource],
]) {
  assert.match(
    source,
    /installThreeWarningFilter\(\);/,
    `${label} should install the Three warning filter before mounting React Three Fiber canvases.`,
  );
}

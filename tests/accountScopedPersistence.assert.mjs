import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const onboardingSource = readFileSync(new URL('../components/Onboarding.tsx', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../views/Profile.tsx', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../views/Sync.tsx', import.meta.url), 'utf8');

assert.match(
  storageSource,
  /localStorage\.setItem\(key, serializeLocalBackupValue\(backup\)\);/,
  'Expected IndexedDB restore to preserve raw string backups instead of JSON-stringifying them again',
);

assert.match(
  storageSource,
  /const getAccountScopedLocalStorageValue = \(baseKey: string\): string \| null => \{/,
  'Expected account-scoped localStorage helpers for per-account onboarding and feature discovery state',
);

assert.match(
  storageSource,
  /hasCompletedOnboarding:\s*\(\): boolean => \{[\s\S]*if \(SupabaseService\.getCachedUserId\(\)\) \{[\s\S]*return false;[\s\S]*\}/,
  'Expected authenticated onboarding checks to avoid inheriting another account\'s derived profile state on shared devices',
);

assert.match(
  storageSource,
  /getSeenReleaseVersion:\s*\(\): string \| null => getAccountScopedLocalStorageValue\(CACHE_KEYS\.SEEN_RELEASE_VERSION\)/,
  'Expected the What’s New seen flag to be stored per account',
);

assert.match(
  storageSource,
  /return JSON\.parse\(getAccountScopedLocalStorageValue\(CACHE_KEYS\.COACHMARKS_SEEN\) \|\| '\[\]'\);/,
  'Expected coachmark completion state to be stored per account',
);

assert.match(
  appSource,
  /const hasCompletedOnboarding = \(\) => StorageService\.hasCompletedOnboarding\(\);/,
  'Expected the app bootstrap to rely on StorageService for onboarding persistence logic',
);

assert.match(
  onboardingSource,
  /StorageService\.markOnboardingComplete\(\);/,
  'Expected onboarding completion to use the shared account-aware storage helper',
);

assert.doesNotMatch(
  profileSource,
  /lior_manual_override/,
  'Expected profile identity switching and sign-out to stop depending on the legacy manual override flag',
);

assert.match(
  syncSource,
  /storageEventTarget\.addEventListener\('storage-update', refreshLinkedPartner\);/,
  'Expected the pairing hub to refresh linked account state when stored couple profile data changes',
);

assert.match(
  syncSource,
  /syncEventTarget\.addEventListener\('sync-update', refreshLinkedPartner\);/,
  'Expected the pairing hub to refresh linked account state after sync bootstrap completes',
);

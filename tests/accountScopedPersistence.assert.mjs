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
  /activateAccount:\s*\(userId: string \| null\) => \{[\s\S]*restoreAccountScopedProfile\(normalizedUserId\)[\s\S]*clearBaseProfileForAccountSwitch\(\);/,
  'Expected login to activate the current account profile before onboarding decisions are made',
);

assert.match(
  storageSource,
  /persistScopedLocalStorageJson\(CACHE_KEYS\.IDENTITY, identityProfile\);[\s\S]*persistScopedLocalStorageJson\(CACHE_KEYS\.SHARED_PROFILE, sharedProfile\);/,
  'Expected saved couple profiles, including partner links, to be persisted under the active account scope',
);

assert.match(
  storageSource,
  /LINK_LOCK: 'lior_link_lock'/,
  'Expected linked partners to have a dedicated local lock separate from normal profile fields',
);

assert.match(
  storageSource,
  /const applyLockedPairLink = <T extends Partial<CoupleProfile>>\(profile: T, current\?: Partial<CoupleProfile>\): T => \{[\s\S]*Ignoring attempted partner relink[\s\S]*coupleId: activeLock\.coupleId,[\s\S]*partnerUserId: activeLock\.partnerUserId,/,
  'Expected existing coupleId and partnerUserId to be reapplied when stale profile data tries to clear or replace them',
);

assert.match(
  storageSource,
  /persistLockedPairLink\(sanitizedProfile\);/,
  'Expected complete pair links to be locked whenever the couple profile is saved',
);

assert.doesNotMatch(
  storageSource,
  /if \(SupabaseService\.getCachedUserId\(\)\) \{[\s\S]*return false;[\s\S]*\}/,
  'Authenticated accounts with a restored complete profile must not be forced through onboarding again',
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
  appSource,
  /SupabaseService\.setCachedUserId\(session\?\.user\?\.id \|\| null\);\s*StorageService\.activateAccount\(session\?\.user\?\.id \|\| null\);/,
  'Expected app bootstrap to restore the signed-in account profile before initializing sync or checking onboarding',
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

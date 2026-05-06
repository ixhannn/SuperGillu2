import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const supabaseSource = readFileSync(new URL('../services/supabase.ts', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../views/Profile.tsx', import.meta.url), 'utf8');
const syncViewSource = readFileSync(new URL('../views/Sync.tsx', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/migrations/20260422164500_pairing_membership_stability.sql', import.meta.url), 'utf8');

assert.match(
  supabaseSource,
  /setCachedUserId:\s*\(userId: string \| null\) => \{[\s\S]*if \(cachedUserId !== normalizedUserId\) \{[\s\S]*cachedCoupleId = null;/,
  'Expected changing auth users to clear the cached couple id so a previous account cannot leak its pair.',
);

assert.match(
  supabaseSource,
  /select\('couple_id, created_at'\)[\s\S]*\.order\('created_at', \{ ascending: false \}\)[\s\S]*membershipError[\s\S]*return null;[\s\S]*const coupleIds = Array\.from\(new Set/,
  'Expected couple lookup to read all memberships and avoid falling back to a new solo couple on lookup errors.',
);

assert.match(
  supabaseSource,
  /\.in\('couple_id', coupleIds\)[\s\S]*linkedCoupleIds[\s\S]*const linkedCoupleId = coupleIds\.find/,
  'Expected account bootstrap to prefer a membership that has both partners over a stale solo membership.',
);

assert.match(
  storageSource,
  /const buildAccountScopedStorageKey = \(baseKey: string, userId: string \| null = getActiveAccountScopeUserId\(\)\)/,
  'Expected account-scoped flags to keep using the active account while auth is transitioning.',
);

assert.match(
  storageSource,
  /const backupAccountScopedFlagsForAccount = \(userId: string \| null\) => \{[\s\S]*ACCOUNT_LOCAL_KEYS\.ONBOARDING_COMPLETE[\s\S]*CACHE_KEYS\.LINK_LOCK/,
  'Expected onboarding completion and pair locks to be backed up under the active account.',
);

assert.match(
  storageSource,
  /prepareForSignOut:\s*\(\) => \{[\s\S]*backupCurrentProfileForAccount\(activeUserId\);[\s\S]*\}/,
  'Expected sign-out to explicitly snapshot the account before the page reloads.',
);

assert.match(
  storageSource,
  /const hasPairLink = Boolean\(cleanString\(profile\.coupleId\) && cleanString\(profile\.partnerUserId\)\);[\s\S]*const derivedCompletion = hasProfileIdentity \|\| hasPairLink;/,
  'Expected a restored profile or pair link to prevent repeat onboarding if the raw onboarding flag was lost.',
);

assert.match(
  profileSource,
  /StorageService\.prepareForSignOut\(\);[\s\S]*SupabaseService\.setCachedUserId\(null\);[\s\S]*StorageService\.activateAccount\(null\);/,
  'Expected Profile sign-out to persist and deactivate the active account before reload.',
);

assert.match(
  syncViewSource,
  /StorageService\.prepareForSignOut\(\);[\s\S]*SupabaseService\.setCachedUserId\(null\);[\s\S]*StorageService\.activateAccount\(null\);/,
  'Expected Sync sign-out to persist and deactivate the active account before reload.',
);

assert.match(
  migrationSource,
  /delete from public\.couple_memberships stale[\s\S]*stale_peer[\s\S]*create or replace function public\.ensure_user_couple\(\)[\s\S]*peer\.user_id <> current_uid/,
  'Expected migration cleanup and ensure_user_couple to prefer the real paired couple over stale solo couples.',
);

assert.match(
  migrationSource,
  /raise exception 'already_linked';[\s\S]*delete from public\.couple_memberships stale[\s\S]*stale\.user_id = current_uid[\s\S]*insert into public\.couple_memberships\(couple_id, user_id, role\)/,
  'Expected claiming an invite to remove stale solo memberships without relinking an already paired account.',
);

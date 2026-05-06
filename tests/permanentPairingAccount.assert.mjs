import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const supabaseSource = readFileSync(new URL('../services/supabase.ts', import.meta.url), 'utf8');
const syncServiceSource = readFileSync(new URL('../services/sync.ts', import.meta.url), 'utf8');
const pairingSource = readFileSync(new URL('../services/pairing.ts', import.meta.url), 'utf8');
const syncViewSource = readFileSync(new URL('../views/Sync.tsx', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/migrations/20260423170000_permanent_pairing_profiles.sql', import.meta.url), 'utf8');

assert.match(
  storageSource,
  /const restoreAccountScopedFlagsForAccount = \(userId: string \| null\) => \{[\s\S]*ACCOUNT_LOCAL_KEYS\.ONBOARDING_COMPLETE[\s\S]*CACHE_KEYS\.LINK_LOCK[\s\S]*localStorage\.setItem\(key, scopedValue\);[\s\S]*localStorage\.removeItem\(key\);/,
  'Expected account activation to restore account-scoped onboarding and pair-lock flags to the active runtime keys.',
);

assert.match(
  storageSource,
  /activateAccount:\s*\(userId: string \| null\) => \{[\s\S]*localStorage\.setItem\(ACCOUNT_LOCAL_KEYS\.ACTIVE_USER_ID, normalizedUserId\);[\s\S]*restoreAccountScopedFlagsForAccount\(normalizedUserId\);[\s\S]*restoreAccountScopedProfile\(normalizedUserId\)/,
  'Expected account activation to switch the active account scope before restoring profile data or checking onboarding.',
);

assert.match(
  storageSource,
  /const clearBaseProfileForAccountSwitch = \(\) => \{[\s\S]*localStorage\.removeItem\(CACHE_KEYS\.LINK_LOCK\);[\s\S]*localStorage\.removeItem\(ACCOUNT_LOCAL_KEYS\.ONBOARDING_COMPLETE\);/,
  'Expected account switching and sign-out to clear transient base pair/onboarding flags so another account cannot inherit them.',
);

assert.match(
  supabaseSource,
  /upsertUserProfile:\s*async \(displayName: string \| null \| undefined\): Promise<boolean> => \{[\s\S]*from\('user_profiles'\)[\s\S]*onConflict: 'user_id'/,
  'Expected the signed-in user display name to be persisted as durable account metadata for future paired sessions.',
);

assert.match(
  supabaseSource,
  /getLinkedPartner:\s*async \(coupleId: string\): Promise<\{ partnerUserId: string \| null; partnerName: string \| null \} \| null> => \{[\s\S]*from\('user_profiles'\)[\s\S]*display_name[\s\S]*partnerName/,
  'Expected linked partner lookup to hydrate the stable partner display name from account metadata.',
);

assert.match(
  syncServiceSource,
  /await SupabaseService\.upsertUserProfile\(localProfileBeforeCoupleLookup\.myName\);[\s\S]*partnerName: linked\?\.partnerName \|\| profile\.partnerName,/,
  'Expected sync bootstrap to persist the local account name and restore partnerName from the permanent linked account.',
);

assert.match(
  pairingSource,
  /async createInvite\(options\?: \{ forceRotate\?: boolean \}\): Promise<PairInvite \| null> \{[\s\S]*await SupabaseService\.upsertUserProfile\(profile\.myName\);/,
  'Expected invite creation to persist the inviter account display name before sharing a pairing code.',
);

assert.match(
  pairingSource,
  /async claimInvite\(raw: string\): Promise<ClaimResult> \{[\s\S]*await SupabaseService\.upsertUserProfile\(profile\.myName\);[\s\S]*claim_pair_invite/,
  'Expected invite claiming to persist the claimer account display name before joining the couple.',
);

assert.match(
  syncViewSource,
  /linkedPartner[\s\S]*Permanent link saved[\s\S]*This connection is tied to your accounts/,
  'Expected the Sync view to explain that a successful couple link is permanent instead of asking users to relink.',
);

assert.match(
  migrationSource,
  /create table if not exists public\.user_profiles[\s\S]*display_name text[\s\S]*alter table public\.user_profiles enable row level security/,
  'Expected a durable user_profiles table for account-level names that survive relogin and invite expiry.',
);

assert.match(
  migrationSource,
  /create policy "user_profiles_select_pair"[\s\S]*couple_memberships me[\s\S]*peer\.user_id = user_profiles\.user_id/,
  'Expected partners in the same couple to be able to read each other profile metadata.',
);

assert.match(
  migrationSource,
  /create or replace function public\.claim_lior_legacy_rows\(\)[\s\S]*has_user_id_column[\s\S]*using current_uid, current_uid::text;/,
  'Expected legacy row claiming to assign uuid user_id values without failing on older table shapes.',
);

assert.match(
  migrationSource,
  /create or replace function public\.backfill_user_rows_to_couple\(target_couple_id uuid\)[\s\S]*has_couple_id_column[\s\S]*using target_couple_id, current_uid;/,
  'Expected couple backfill to skip incompatible tables instead of aborting shared-data setup.',
);

assert.match(
  migrationSource,
  /create or replace function public\.claim_pair_invite\(invite_code text\)[\s\S]*upsert_user_profile[\s\S]*coalesce\(partner_profile\.display_name, inv\.user_name, ''\)::text/,
  'Expected claiming an invite to preserve the inviter name as durable metadata and return it with the permanent link.',
);

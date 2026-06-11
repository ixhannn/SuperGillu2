import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pairingSource = readFileSync(new URL('../services/pairing.ts', import.meta.url), 'utf8');
const supabaseSource = readFileSync(new URL('../services/supabase.ts', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../services/sync.ts', import.meta.url), 'utf8');
const syncViewSource = readFileSync(new URL('../views/Sync.tsx', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/migrations/20260509090000_pairing_v2_rpc.sql', import.meta.url), 'utf8');

assert.match(
  migrationSource,
  /create or replace function public\.create_pair_invite_v2\([\s\S]*returns table\(code text, expires_at timestamptz, couple_id uuid\)/,
  'Expected server-owned invite creation RPC.',
);

assert.match(
  migrationSource,
  /create or replace function public\.claim_pair_invite_v2\([\s\S]*for update[\s\S]*claimed_by is null[\s\S]*insert into public\.couple_memberships/,
  'Expected atomic server-owned invite claiming with row locking.',
);

assert.match(
  migrationSource,
  /create or replace function public\.get_pairing_status_v2\(\)[\s\S]*partner_user_id[\s\S]*member_count/,
  'Expected server-owned pairing status RPC.',
);

assert.match(
  migrationSource,
  /perform public\.backfill_user_rows_to_couple_for_user\(target_couple, inv\.user_id\);[\s\S]*perform public\.backfill_user_rows_to_couple_for_user\(target_couple, current_uid\);/,
  'Expected both inviter and claimer rows to be backfilled into the shared couple.',
);

assert.match(
  supabaseSource,
  /createPairInviteV2:\s*async[\s\S]*rpc\('create_pair_invite_v2'/,
  'Expected SupabaseService wrapper for create_pair_invite_v2.',
);

assert.match(
  supabaseSource,
  /claimPairInviteV2:\s*async[\s\S]*rpc\('claim_pair_invite_v2'/,
  'Expected SupabaseService wrapper for claim_pair_invite_v2.',
);

assert.match(
  supabaseSource,
  /getPairingStatusV2:\s*async[\s\S]*rpc\('get_pairing_status_v2'/,
  'Expected SupabaseService wrapper for get_pairing_status_v2.',
);

assert.match(
  pairingSource,
  /type PairingStatus =[\s\S]*isLinked: boolean[\s\S]*memberCount: number/,
  'Expected PairingService to expose a typed status contract.',
);

assert.match(
  pairingSource,
  /async createInvite[\s\S]*SupabaseService\.createPairInviteV2/,
  'Expected PairingService.createInvite to use RPC-owned invite creation.',
);

assert.doesNotMatch(
  pairingSource,
  /\.from\('pair_invites'\)\.(insert|delete|update)/,
  'PairingService must not directly mutate pair_invites.',
);

assert.match(
  syncSource,
  /const pairingStatus = await PairingService\.getStatus\(\);[\s\S]*StorageService\.forceNewPairing/,
  'Expected sync bootstrap to restore the local pair from authoritative pairing status.',
);

assert.match(
  syncViewSource,
  /const refreshPairingStatus = useCallback[\s\S]*PairingService\.getStatus/,
  'Expected Sync view to refresh from PairingService instead of ad-hoc Supabase queries.',
);

/**
 * PairingService — QR-based account linking.
 *
 * Flow:
 *   1. User A calls createInvite() → 8-char code stored in `pair_invites`.
 *   2. User A displays the code as a QR (encoded as "TULIKA:<code>").
 *   3. User B scans the QR → calls claimInvite(code).
 *   4. On success both sides save each other's userId + name to CoupleProfile.
 */

import { SupabaseService } from './supabase';
import { StorageService } from './storage';

export interface PairInvite {
  code: string;
  expiresAt: Date;
}

export type ClaimError = 'invalid' | 'expired' | 'used' | 'self' | 'network';

export type ClaimResult =
  | { ok: true;  partnerUserId: string; partnerName: string }
  | { ok: false; error: ClaimError };

/** QR payload prefix — lets the scanner ignore unrelated QR codes. */
export const QR_PREFIX = 'TULIKA:';

export const PairingService = {
  /**
   * Create a new 15-minute invite code in Supabase.
   * Deletes any previous unclaimed invite from this user first (only one active at a time).
   */
  async createInvite(): Promise<PairInvite | null> {
    const sb = SupabaseService.client;
    if (!sb) return null;

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return null;

    const profile = StorageService.getCoupleProfile();
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Remove previous unclaimed invites from this user so there's never ambiguity
    await sb.from('pair_invites').delete()
      .eq('user_id', user.id)
      .is('claimed_by', null);

    const { error } = await sb.from('pair_invites').insert({
      code,
      user_id:    user.id,
      user_name:  profile.myName ?? 'Someone',
      expires_at: expiresAt.toISOString(),
    });

    if (error) return null;
    return { code, expiresAt };
  },

  /**
   * Claim a partner's invite. Uses an optimistic atomic update so two simultaneous
   * claims cannot both succeed — only one row update goes through (claimed_by IS NULL filter).
   */
  async claimInvite(raw: string): Promise<ClaimResult> {
    const sb = SupabaseService.client;
    if (!sb) return { ok: false, error: 'network' };

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return { ok: false, error: 'network' };

    const code = raw.trim().toUpperCase().slice(0, 8);

    // Read the invite — any authenticated user can read (per RLS policy)
    const { data, error: fetchErr } = await sb
      .from('pair_invites')
      .select('code, user_id, user_name, expires_at, claimed_by')
      .eq('code', code)
      .maybeSingle();

    if (fetchErr || !data)              return { ok: false, error: 'invalid'  };
    if (data.claimed_by !== null)       return { ok: false, error: 'used'     };
    if (data.user_id === user.id)       return { ok: false, error: 'self'     };
    if (new Date(data.expires_at) < new Date()) return { ok: false, error: 'expired' };

    // Atomic claim: WHERE claimed_by IS NULL guarantees no double-claim
    const { data: claimed, error: claimErr } = await sb
      .from('pair_invites')
      .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
      .eq('code', code)
      .is('claimed_by', null)
      .select('code');

    if (claimErr || !claimed || claimed.length === 0) return { ok: false, error: 'used' };

    return { ok: true, partnerUserId: data.user_id, partnerName: data.user_name };
  },
};

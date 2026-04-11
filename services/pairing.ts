/**
 * PairingService — QR-based account linking.
 *
 * Flow:
 *   1. User A calls createInvite() → 8-char code stored in `pair_invites`.
 *   2. User A displays the code as a QR (encoded as "LIOR:<code>").
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
  | { ok: true; partnerUserId: string; partnerName: string; coupleId: string }
  | { ok: false; error: ClaimError };

/** QR payload prefix — lets the scanner ignore unrelated QR codes. */
export const QR_PREFIX = 'LIOR:';

export const PairingService = {
  async getActiveInvite(): Promise<PairInvite | null> {
    const sb = SupabaseService.client;
    if (!sb) return null;

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return null;

    const { data, error } = await sb
      .from('pair_invites')
      .select('code, expires_at')
      .eq('user_id', user.id)
      .is('claimed_by', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    const row = data[0];
    return { code: row.code, expiresAt: new Date(row.expires_at) };
  },

  /**
   * Create a new 15-minute invite code in Supabase.
   * Deletes any previous unclaimed invite from this user first (only one active at a time).
   */
  async createInvite(options?: { forceRotate?: boolean }): Promise<PairInvite | null> {
    const sb = SupabaseService.client;
    if (!sb) return null;

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return null;

    if (!options?.forceRotate) {
      const activeInvite = await PairingService.getActiveInvite();
      if (activeInvite) return activeInvite;
    }

    const profile = StorageService.getCoupleProfile();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(8);
      globalThis.crypto.getRandomValues(bytes);
      code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    } else {
      code = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    }
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

    const code = raw.replace(/^LIOR:/i, '').replace(/\s+/g, '').trim().toUpperCase().slice(0, 8);
    if (code.length !== 8) return { ok: false, error: 'invalid' };

    const { data, error } = await sb.rpc('claim_pair_invite', { invite_code: code });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('invalid')) return { ok: false, error: 'invalid' };
      if (msg.includes('expired')) return { ok: false, error: 'expired' };
      if (msg.includes('used')) return { ok: false, error: 'used' };
      if (msg.includes('self')) return { ok: false, error: 'self' };
      return { ok: false, error: 'network' };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.partner_user_id || !row?.couple_id) return { ok: false, error: 'network' };
    return {
      ok: true,
      partnerUserId: row.partner_user_id,
      partnerName: row.partner_name || '',
      coupleId: row.couple_id,
    };
  },
};

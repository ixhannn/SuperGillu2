/**
 * PairingService - QR and code based account linking.
 *
 * The client never mutates pair_invites directly. Supabase RPCs own invite
 * creation, atomic claiming, couple membership repair, and link status.
 */

import { SupabaseService } from './supabase';
import { StorageService } from './storage';

export interface PairInvite {
  code: string;
  expiresAt: Date;
  coupleId: string;
}

export type ClaimError = 'invalid' | 'expired' | 'used' | 'self' | 'already_linked' | 'network';

export type ClaimResult =
  | { ok: true; partnerUserId: string; partnerName: string; coupleId: string }
  | { ok: false; error: ClaimError; coupleId?: string; partnerUserId?: string | null; partnerName?: string | null };

export type PairingStatus = {
  isLinked: boolean;
  coupleId: string | null;
  partnerUserId: string | null;
  partnerName: string | null;
  memberCount: number;
};

export type PairingE2EMock = {
  getStatus?: () => Promise<PairingStatus>;
  createInvite?: (input: { forceRotate?: boolean }) => Promise<PairInvite | null>;
  claimInvite?: (code: string) => Promise<ClaimResult>;
};

/** QR payload prefix - lets the scanner ignore unrelated QR codes. */
export const QR_PREFIX = 'LIOR:';

const toInvite = (row: { code: string; expires_at: string; couple_id: string } | null): PairInvite | null => {
  if (!row?.code || !row?.expires_at || !row?.couple_id) return null;
  return {
    code: row.code,
    expiresAt: new Date(row.expires_at),
    coupleId: row.couple_id,
  };
};

const normalizeCode = (raw: string) => (
  raw.replace(/^LIOR:/i, '').replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase().slice(0, 8)
);

const getE2EMock = (): PairingE2EMock | null => (
  typeof window !== 'undefined' && window.__liorPairingMock ? window.__liorPairingMock : null
);

const normalizeClaimError = (value: string | null | undefined): ClaimError => {
  if (value === 'invalid' || value === 'expired' || value === 'used' || value === 'self' || value === 'already_linked') {
    return value;
  }
  return 'network';
};

export const PairingService = {
  async getStatus(): Promise<PairingStatus | null> {
    const mock = getE2EMock();
    if (mock?.getStatus) return mock.getStatus();

    const row = await SupabaseService.getPairingStatusV2();
    if (!row?.couple_id) return null;
    return {
      isLinked: Boolean(row.is_linked && row.partner_user_id),
      coupleId: row.couple_id,
      partnerUserId: row.partner_user_id,
      partnerName: row.partner_name?.trim() || null,
      memberCount: Number(row.member_count ?? 0),
    };
  },

  async createInvite(options?: { forceRotate?: boolean }): Promise<PairInvite | null> {
    const mock = getE2EMock();
    if (mock?.createInvite) return mock.createInvite({ forceRotate: options?.forceRotate });

    const profile = StorageService.getCoupleProfile();
    await SupabaseService.upsertUserProfile(profile.myName);
    const row = await SupabaseService.createPairInviteV2({
      forceRotate: options?.forceRotate,
      displayName: profile.myName,
    });
    return toInvite(row);
  },

  async claimInvite(raw: string): Promise<ClaimResult> {
    const code = normalizeCode(raw);
    if (code.length !== 8) return { ok: false, error: 'invalid' };

    const mock = getE2EMock();
    if (mock?.claimInvite) return mock.claimInvite(code);

    const profile = StorageService.getCoupleProfile();
    await SupabaseService.upsertUserProfile(profile.myName);
    const row = await SupabaseService.claimPairInviteV2({
      code,
      displayName: profile.myName,
    });

    if (!row) return { ok: false, error: 'network' };
    if (!row.ok) {
      return {
        ok: false,
        error: normalizeClaimError(row.error),
        coupleId: row.couple_id,
        partnerUserId: row.partner_user_id,
        partnerName: row.partner_name,
      };
    }

    if (!row.couple_id || !row.partner_user_id) return { ok: false, error: 'network' };
    return {
      ok: true,
      coupleId: row.couple_id,
      partnerUserId: row.partner_user_id,
      partnerName: row.partner_name?.trim() || '',
    };
  },
};

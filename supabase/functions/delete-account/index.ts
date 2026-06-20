/**
 * delete-account
 *
 * In-app account deletion for Apple App Store Review Guideline 5.1.1(v)
 * ("apps that support account creation must let users delete their account")
 * and GDPR Article 17 (right to erasure).
 *
 * DEFAULT behaviour (founder-approved):
 *   Delete the caller's auth user + their personal/per-user data + their couple
 *   membership. Then:
 *     • SOLO  — if the caller is the SOLE remaining active member of the couple
 *       (or has no couple), ALSO purge the couple's shared data + R2 media + the
 *       couples row.
 *     • PAIRED — if a partner remains active, RETAIN the shared couple data (the
 *       partner's copy) and just remove the caller.
 *
 * ── EXACT DELETION ORDER ──────────────────────────────────────────────────────
 *   0. Verify the caller's JWT with an anon client (getUser). The user can ONLY
 *      delete THEMSELVES — the user id comes from the verified JWT, never from
 *      the request body. (Mirrors send-partner-nudge / sign-media.)
 *   1. Service-role read of couple_memberships to resolve the caller's couple_id
 *      and whether any OTHER active member remains
 *      (coalesce(status,'active')='active', excluding the caller).
 *   2. RPC public.delete_my_account() — invoked with the CALLER-authenticated
 *      client so auth.uid() resolves to the caller (the RPC is SECURITY DEFINER,
 *      so it still bypasses RLS for the cross-row deletes). This does ALL the
 *      no-FK explicit deletes:
 *        (A) per-user app-data rows (caller-authored only — partner keeps theirs)
 *            + the caller's media_assets index rows + per-user auth-cascade
 *            tables are left to step 4.
 *        (B) SOLO only: couple-scoped sweep across the 21 app-data tables +
 *            media_assets, the caller's membership, then the couples row (which
 *            cascades relationship_facts / sync_deletions / pair_invites.couple_id).
 *        PAIRED: only the caller's membership is removed.
 *      Runs FIRST, while membership-gated RLS is still intact.
 *   3. SOLO only: purge the couple's R2 objects via the Cloudflare Worker's
 *      token-protected bulk-purge route (the worker's per-object DELETE requires
 *      the caller's own JWT + membership, both gone after step 4 — so we erase
 *      media BEFORE deleting the auth user). PAIRED: never purge media.
 *   4. auth.admin.deleteUser(callerId) LAST. This fires every auth.users FK
 *      cascade (couple_memberships, user_profiles, daily_answers,
 *      relationship_signals, device_push_tokens, client_error_logs,
 *      pair_invites.user_id; SET NULL on pair_invites.claimed_by +
 *      sync_deletions.user_id) and revokes the session.
 *
 * Doing deleteUser FIRST would drop the membership and the membership-gated RLS
 * / worker auth could no longer authorize cleanup, orphaning app-data + R2.
 *
 * Idempotent + fail-safe: the RPC tolerates already-gone rows, so a retry after
 * a partial failure (e.g. RPC ok but deleteUser failed) is safe.
 *
 * Required Supabase Edge Function secrets:
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY — provided
 *     automatically by the Edge runtime.
 *   R2_WORKER_URL          — base URL of the Cloudflare media worker (no trailing
 *                            slash), used only for the SOLO R2 media purge. If
 *                            unset, media purge is skipped (logged) and account
 *                            deletion still proceeds; the scheduled orphan sweep
 *                            is the backstop.
 *   CLEANUP_INTERNAL_TOKEN — shared secret sent as X-Cleanup-Token to the
 *                            worker's bulk-purge route (same secret the worker
 *                            already uses for /__internal/cleanup).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface DeleteAccountResult {
  ok: boolean;
  couple_id: string | null;
  sole_member: boolean;
  other_active_members: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── 0. Auth: verify the caller JWT with an anon client (self-delete only) ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

  // The caller-authenticated client: carries the Bearer token so auth.uid()
  // inside the RPC resolves to the caller. NEVER trust a body-supplied id.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const callerId = user.id;
  const admin = createClient(supabaseUrl, serviceKey);

  // ── 1. Resolve couple_id + whether any OTHER active member remains ─────────
  // Service-role read so it is reliable regardless of RLS. The RPC re-derives
  // this itself (defensive idempotency); we read it here to decide whether the
  // edge function must purge R2 media (SOLO only).
  let coupleId: string | null = null;
  let otherActiveMembers = 0;

  {
    const { data: myMemberships, error: membershipError } = await admin
      .from('couple_memberships')
      .select('couple_id, status, created_at')
      .eq('user_id', callerId);

    if (membershipError) return json({ error: 'membership_lookup_failed' }, 500);

    // Prefer an ACTIVE, LINKED couple; fall back to most recent active.
    const active = (myMemberships ?? []).filter(
      (m: { status: string | null }) => (m.status ?? 'active') === 'active',
    );

    if (active.length > 0) {
      // Determine, per candidate couple, whether a peer remains; pick linked-first.
      let chosen = active[0] as { couple_id: string; created_at: string };
      for (const m of active as Array<{ couple_id: string; created_at: string }>) {
        if (new Date(m.created_at).getTime() > new Date(chosen.created_at).getTime()) {
          chosen = m;
        }
      }
      coupleId = chosen.couple_id;

      const { count, error: peerError } = await admin
        .from('couple_memberships')
        .select('user_id', { count: 'exact', head: true })
        .eq('couple_id', coupleId)
        .neq('user_id', callerId)
        .or('status.is.null,status.eq.active');

      if (peerError) return json({ error: 'peer_lookup_failed' }, 500);
      otherActiveMembers = count ?? 0;
    }
  }

  const isSoleMember = coupleId === null || otherActiveMembers === 0;

  // ── 2. RPC: no-FK explicit deletes + paired/solo branch (RUNS FIRST) ───────
  // Invoked with the caller-authenticated client so auth.uid() === callerId.
  // The RPC is SECURITY DEFINER, so it still bypasses RLS for the deletes.
  const { data: rpcData, error: rpcError } = await callerClient.rpc('delete_my_account');
  if (rpcError) {
    return json({ error: 'data_deletion_failed', detail: rpcError.message }, 500);
  }
  const rpcResult = (rpcData ?? null) as DeleteAccountResult | null;

  // The RPC re-derives sole/paired itself and is the AUTHORITATIVE source for
  // what was deleted. Trust it for the media-purge decision (the edge-function
  // pre-read above is a fallback). It also gives the canonical couple_id (e.g.
  // if the caller had no active membership the pre-read missed).
  const soleForMedia = rpcResult ? rpcResult.sole_member : isSoleMember;
  const coupleForMedia = rpcResult?.couple_id ?? coupleId;

  // ── 3. SOLO only: purge the couple's R2 media via the worker ───────────────
  // Done BEFORE deleting the auth user, because the worker's per-object DELETE
  // needs the caller's JWT + membership, both gone after step 4. PAIRED: skip —
  // the partner still owns the media.
  let mediaPurge: { attempted: boolean; ok: boolean; reason?: string } = {
    attempted: false,
    ok: false,
  };

  if (soleForMedia && coupleForMedia) {
    const workerUrl = Deno.env.get('R2_WORKER_URL')?.replace(/\/$/, '');
    const cleanupToken = Deno.env.get('CLEANUP_INTERNAL_TOKEN');

    if (!workerUrl || !cleanupToken) {
      // Non-fatal: account deletion proceeds; the scheduled orphan sweep is the
      // backstop. Flag it so the failure is visible in logs.
      mediaPurge = {
        attempted: false,
        ok: false,
        reason: 'worker_not_configured',
      };
    } else {
      mediaPurge = { attempted: true, ok: false };
      try {
        const res = await fetch(`${workerUrl}/__internal/purge-couple`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Cleanup-Token': cleanupToken,
          },
          body: JSON.stringify({ coupleId: coupleForMedia }),
        });
        mediaPurge.ok = res.ok;
        if (!res.ok) {
          mediaPurge.reason = `worker_error_${res.status}`;
        }
      } catch {
        mediaPurge.reason = 'worker_exception';
        mediaPurge.ok = false;
      }
      // NOTE: a failed media purge is intentionally NON-fatal — the DB rows are
      // already gone and re-running the function is safe. We still delete the
      // auth user so the user is not left half-deleted (which would fail the
      // Apple requirement). The orphaned R2 objects are swept later.
    }
  }

  // ── 4. Delete the auth user LAST (fires auth.users cascades + revokes session)
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(callerId);
  if (deleteUserError) {
    // The DB deletes already ran (idempotent on retry). Surface the failure so
    // the client does NOT clear local state for a still-existing auth account.
    return json(
      { error: 'auth_user_deletion_failed', detail: deleteUserError.message },
      500,
    );
  }

  return json({
    ok: true,
    soleMember: isSoleMember,
    coupleId,
    otherActiveMembers,
    dataDeletion: rpcResult,
    mediaPurge,
  });
});

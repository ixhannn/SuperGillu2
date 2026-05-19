/**
 * send-partner-nudge
 *
 * Called by the client after a partner records a pulse check.
 * Checks whether the other partner has recorded today — if not, sends
 * them a push notification via FCM (native Android/iOS) or VAPID (web PWA).
 *
 * Required Supabase Edge Function secrets:
 *   FCM_SERVER_KEY   — Firebase Cloud Messaging server key (Android/iOS)
 *   VAPID_PRIVATE_KEY — VAPID private key (web PWA)
 *   VAPID_CONTACT     — Contact URL/email for VAPID (e.g. mailto:you@example.com)
 *
 * The Supabase service role key is automatically available as SUPABASE_SERVICE_ROLE_KEY.
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

const TODAY = () => new Date().toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── Auth: extract user from JWT ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Verify caller JWT with anon client
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // Service-role client for privileged reads
  const admin = createClient(supabaseUrl, serviceKey);

  // ── Find the couple + partner ────────────────────────────────────────────
  const { data: members, error: membersError } = await admin
    .from('couple_memberships')
    .select('user_id, couple_id')
    .eq('couple_id',
      // Sub-select: get the caller's couple_id first
      (await admin
        .from('couple_memberships')
        .select('couple_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      ).data?.couple_id ?? ''
    );

  if (membersError || !members?.length) return json({ ok: false, reason: 'no_couple' });

  const coupleId = members[0].couple_id as string;
  const partnerRow = members.find((m: { user_id: string }) => m.user_id !== user.id);
  if (!partnerRow) return json({ ok: false, reason: 'no_partner' });
  const partnerId = partnerRow.user_id as string;

  // ── Check if partner has already recorded today ──────────────────────────
  const today = TODAY();
  const { data: partnerSignal } = await admin
    .from('relationship_signals')
    .select('id')
    .eq('user_id', partnerId)
    .eq('couple_id', coupleId)
    .eq('signal_type', 'pulse_check')
    .gte('created_at', `${today}T00:00:00Z`)
    .limit(1)
    .maybeSingle();

  if (partnerSignal) return json({ ok: true, reason: 'partner_already_recorded' });

  // ── Fetch partner's push tokens ──────────────────────────────────────────
  const { data: tokens } = await admin
    .from('device_push_tokens')
    .select('token, platform')
    .eq('user_id', partnerId)
    .eq('couple_id', coupleId);

  if (!tokens?.length) return json({ ok: false, reason: 'no_push_token' });

  // ── Build notification payload ───────────────────────────────────────────
  const title = '\u{1F495} Your partner is thinking of you';
  const body  = "They just checked in \u2014 take a moment to share how you're feeling too.";

  const results: string[] = [];

  for (const { token, platform } of tokens) {
    if (platform === 'fcm') {
      results.push(await sendFcm(token, title, body));
    } else if (platform === 'web') {
      results.push(await sendVapid(token, title, body));
    }
  }

  return json({ ok: true, results });
});

// ── FCM (Firebase Cloud Messaging) legacy HTTP API ───────────────────────────
async function sendFcm(token: string, title: string, body: string): Promise<string> {
  const serverKey = Deno.env.get('FCM_SERVER_KEY');
  if (!serverKey) return 'fcm_no_key';

  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body, sound: 'default' },
        android: { priority: 'high', notification: { channel_id: 'lior_partner_nudge' } },
        apns: { payload: { aps: { alert: { title, body }, sound: 'default', badge: 1 } } },
      }),
    });
    return res.ok ? 'fcm_sent' : `fcm_error_${res.status}`;
  } catch {
    return 'fcm_exception';
  }
}

// ── VAPID web push ────────────────────────────────────────────────────────────
async function sendVapid(subscriptionJson: string, title: string, body: string): Promise<string> {
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const contact    = Deno.env.get('VAPID_CONTACT') ?? 'mailto:lior@example.com';
  if (!privateKey) return 'vapid_no_key';

  try {
    const subscription = JSON.parse(subscriptionJson);
    const endpoint: string = subscription.endpoint ?? '';
    if (!endpoint) return 'vapid_no_endpoint';

    // Deno's native crypto: build a minimal JWT for VAPID
    const audience   = new URL(endpoint).origin;
    const expiry     = Math.floor(Date.now() / 1000) + 12 * 3600;
    const payload    = JSON.stringify({ title, body, icon: '/icons/icon-192.png' });

    const vapidJwt = await buildVapidJwt(audience, expiry, contact, privateKey);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${vapidJwt}`,
        'Content-Type':  'application/octet-stream',
        'TTL':           '86400',
        'Urgency':       'normal',
      },
      body: new TextEncoder().encode(payload),
    });
    return res.ok ? 'vapid_sent' : `vapid_error_${res.status}`;
  } catch {
    return 'vapid_exception';
  }
}

// Minimal VAPID JWT builder using Web Crypto (available in Deno).
async function buildVapidJwt(
  audience: string,
  expiry: number,
  contact: string,
  privateKeyB64: string,
): Promise<string> {
  const header  = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims  = b64url(JSON.stringify({ aud: audience, exp: expiry, sub: contact }));
  const message = `${header}.${claims}`;

  const keyBytes = base64ToUint8Array(privateKeyB64);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, new TextEncoder().encode(message));
  return `${message}.${b64urlBuffer(sig)}`;
}

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlBuffer(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

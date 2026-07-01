/**
 * send-partner-nudge
 *
 * Called by the client after a partner records a pulse check.
 * Checks whether the other partner has recorded today — if not, sends
 * them a push notification via FCM (native Android/iOS) or VAPID (web PWA).
 *
 * Required Supabase Edge Function secrets:
 *   FCM_SERVICE_ACCOUNT — Firebase service-account JSON (FCM HTTP v1). Set with:
 *                         supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
 *   VAPID_PUBLIC_KEY    — VAPID public key, base64url (same value as the client's
 *                         VITE_VAPID_PUBLIC_KEY). Required by RFC 8292 for web push.
 *   VAPID_PRIVATE_KEY   — VAPID private key, base64url (web PWA)
 *   VAPID_CONTACT       — Contact URL/email for VAPID (e.g. mailto:you@example.com)
 *
 * The Supabase service role key is automatically available as SUPABASE_SERVICE_ROLE_KEY.
 *
 * Note: the legacy FCM HTTP API (server key + /fcm/send) was decommissioned by
 * Google in June 2024, so this uses the FCM HTTP v1 API (OAuth2 + service
 * account). See docs/PUSH_NOTIFICATIONS_SETUP.md.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWebPush } from '../_shared/webPush.ts';

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

  // ── Notification type ────────────────────────────────────────────────────
  // 'pulse_check' (default) — nudge the partner if they haven't checked in.
  // 'heartbeat'             — partner tapped the heartbeat button.
  // 'daily_answer'          — partner answered today's question (always sends).
  // 'daily_drop'            — Daily Drop nudge (subtype: dropped/nudge/unsealed).
  const reqBody = await req.json().catch(() => ({})) as { type?: string; senderName?: string; subtype?: string };
  const type = reqBody.type === 'heartbeat' ? 'heartbeat'
    : reqBody.type === 'daily_answer' ? 'daily_answer'
    : reqBody.type === 'daily_drop' ? 'daily_drop'
    : reqBody.type === 'bonsai' ? 'bonsai'
    : 'pulse_check';
  const subtype = (reqBody.subtype || '').toString();
  const senderName = (reqBody.senderName || '').toString().trim().slice(0, 40);

  // Service-role client for privileged reads
  const admin = createClient(supabaseUrl, serviceKey);

  // ── Find the couple + partner ────────────────────────────────────────────
  const { data: members, error: membersError } = await admin
    .from('couple_memberships')
    .select('user_id, couple_id')
    .eq('couple_id',
      // Sub-select: get the caller's couple_id first. Constrain to an ACTIVE
      // membership (NULL-safe) so a departed couple isn't resolved as current.
      (await admin
        .from('couple_memberships')
        .select('couple_id')
        .eq('user_id', user.id)
        .or('status.is.null,status.eq.active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      ).data?.couple_id ?? ''
    )
    // Exclude departed/suspended members so the nudge targets the live partner
    // only (mirrors delete-account's peer lookup). NULL status = legacy active.
    .or('status.is.null,status.eq.active');

  if (membersError || !members?.length) return json({ ok: false, reason: 'no_couple' });

  const coupleId = members[0].couple_id as string;
  const partnerRow = members.find((m: { user_id: string }) => m.user_id !== user.id);
  if (!partnerRow) return json({ ok: false, reason: 'no_partner' });
  const partnerId = partnerRow.user_id as string;

  // ── Pulse-check only: skip if partner already recorded today ──────────────
  if (type === 'pulse_check') {
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
  }

  // ── Fetch partner's push tokens ──────────────────────────────────────────
  const { data: tokens } = await admin
    .from('device_push_tokens')
    .select('token, platform')
    .eq('user_id', partnerId)
    .eq('couple_id', coupleId);

  if (!tokens?.length) return json({ ok: false, reason: 'no_push_token' });

  // ── Build notification payload ───────────────────────────────────────────
  const who = senderName || 'Your partner';
  let title: string;
  let body: string;
  let view: string;
  if (type === 'heartbeat') {
    // Short & playful.
    title = `\u{1F497} Heartbeat from ${who}`;
    body  = '\u{1F49E} Tap to send one back';
    view  = 'home'; // heartbeat button lives on Home
  } else if (type === 'daily_answer') {
    // Partner answered today's question — always sends (no pulse-check guard).
    title = senderName
      ? `${senderName} answered today's question`
      : "Your partner answered today's question";
    body  = 'Tap to see what you both said';
    view  = 'home';
  } else if (type === 'daily_drop') {
    // Today's Daily Drop \u2014 the reciprocal daily ritual.
    if (subtype === 'unsealed') {
      title = `\u{2728} ${who} answered`;
      body  = 'Your drop just unsealed \u2014 see what you both said.';
    } else if (subtype === 'nudge') {
      title = `\u{1F440} ${who} is waiting on you`;
      body  = 'Your drop is sealed until you answer too.';
    } else {
      title = `\u{1F48C} ${who} dropped something for you`;
      body  = "Open today's drop to answer back \u2014 it disappears at midnight.";
    }
    view = 'daily-drop';
  } else if (type === 'bonsai') {
    // The shared voxel sakura — the daily two-person watering ritual.
    if (subtype === 'bloomed') {
      title = `\u{1F338} A blossom opened`;
      body  = `You and ${who} both showed up today. Go see it.`;
    } else if (subtype === 'note_read') {
      title = `\u{1F338} ${who} opened your note`;
      body  = 'The one you tucked into a blossom.';
    } else {
      title = `\u{1F4A7} ${who} watered your bonsai`;
      body  = "It's waiting on you — water it together and a blossom opens.";
    }
    view = 'bonsai-bloom';
  } else {
    title = '\u{1F495} Your partner is thinking of you';
    body  = "They just checked in \u2014 take a moment to share how you're feeling too.";
    view  = 'partner-intelligence'; // pulse-check sheet lives here
  }

  // VAPID config for the web/PWA path (read once, reused per device token).
  const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidContact    = Deno.env.get('VAPID_CONTACT') ?? 'mailto:lior@example.com';

  const results: string[] = [];

  for (const { token, platform } of tokens) {
    if (platform === 'fcm') {
      results.push(await sendFcm(token, title, body, view));
    } else if (platform === 'web') {
      if (!vapidPublicKey || !vapidPrivateKey) {
        results.push('vapid_no_key');
        continue;
      }
      results.push(await sendWebPush(
        token,
        { title, body, icon: '/icons/icon-192.png' },
        { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidContact },
      ));
    }
  }

  return json({ ok: true, results });
});

// ── FCM (Firebase Cloud Messaging) HTTP v1 API ──────────────────────────────
interface ServiceAccount { client_email: string; private_key: string; project_id: string }

// Access tokens live ~1h; cache within the (warm) isolate to avoid re-minting
// for every device token in the send loop.
let cachedAccessToken: { token: string; exp: number } | null = null;

async function getFcmAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.exp > now + 60) return cachedAccessToken.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = await signRS256(unsigned, sa.private_key);
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedAccessToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

async function sendFcm(token: string, title: string, body: string, view?: string): Promise<string> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return 'fcm_no_service_account';

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw) as ServiceAccount;
  } catch {
    return 'fcm_bad_service_account';
  }
  if (!sa.project_id || !sa.client_email || !sa.private_key) return 'fcm_incomplete_service_account';

  const accessToken = await getFcmAccessToken(sa);
  if (!accessToken) return 'fcm_no_access_token';

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            // `view` routes the tap to the relevant screen in the app
            // (NotificationsService.bindTapRouting reads data.view).
            data: view ? { view } : undefined,
            android: {
              priority: 'high',
              notification: { channel_id: 'lior-reminders', sound: 'default' },
            },
            apns: { payload: { aps: { alert: { title, body }, sound: 'default', badge: 1 } } },
          },
        }),
      },
    );
    return res.ok ? 'fcm_sent' : `fcm_error_${res.status}`;
  } catch {
    return 'fcm_exception';
  }
}

// RS256 sign using the service account's PKCS8 PEM private key.
async function signRS256(message: string, pemPrivateKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pemPrivateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message));
  return b64urlBuffer(sig);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── VAPID web push ──────────────────────────────────────────────────────────
// Encryption (RFC 8291, aes128gcm) + VAPID signing (RFC 8292) live in
// ../_shared/webPush.ts so they can be unit-tested independently of Deno.

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlBuffer(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

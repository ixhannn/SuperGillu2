/**
 * sign-media
 *
 * Mints short-lived signed-URL credentials so the app can render PRIVATE R2
 * media via plain <img src> / <video src> tags (which cannot send an
 * Authorization header). The signature rides in the URL query string and is
 * verified by the Cloudflare Worker on every GET/HEAD before the object is
 * served — closing the unauthenticated private-media read hole.
 *
 * Flow:
 *   1. Verify the caller's Supabase JWT (anon client, same as send-partner-nudge).
 *   2. Accept JSON { keys: string[] } (batch).
 *   3. For each key: parse it (shared/mediaPolicy.parseManagedMediaKey) to get
 *      the coupleId, then confirm — via a service-role couple_memberships read —
 *      that the caller belongs to that couple. Fail closed otherwise.
 *   4. For allowed keys, mint exp = now + TTL and
 *      sig = hex HMAC-SHA256 over `${key}\n${exp}` with MEDIA_URL_SIGNING_SECRET.
 *   5. Return { urls: { [key]: { exp, sig } } } for allowed keys only.
 *      Keys the caller's couple does not own are omitted (and listed in
 *      `denied`) — never signed.
 *
 * SIGNING CONTRACT (must match the Cloudflare Worker verifier exactly):
 *   secret    = env MEDIA_URL_SIGNING_SECRET (server-only; never shipped to client)
 *   message   = `${key}` + '\n' + `${exp}`   (key = R2 object key, NO leading slash)
 *   signature = lowercase hex HMAC-SHA256(message, secret)
 *   exp       = INTEGER unix seconds, SERVER-minted = floor(Date.now()/1000) + 900
 *   query     = `exp=<int>&sig=<hex>` appended to the media URL
 *
 * Required Supabase Edge Function secrets:
 *   MEDIA_URL_SIGNING_SECRET — HMAC secret shared with the Cloudflare Worker.
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided
 *   automatically by the Edge runtime.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseManagedMediaKey } from '../../../shared/mediaPolicy.js';

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

// TTL for a signed URL, in seconds. exp is always server-minted from the
// server clock — the client clock is never trusted.
const SIGNED_URL_TTL_SECONDS = 900;

// Defensive cap so a malicious caller can't ask us to sign an unbounded batch.
const MAX_KEYS_PER_REQUEST = 64;

interface SignedCredential {
  exp: number;
  sig: string;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// sig = lowercase hex HMAC-SHA256 over the exact UTF-8 string `${key}\n${exp}`.
async function signKey(cryptoKey: CryptoKey, key: string, exp: number): Promise<string> {
  const message = new TextEncoder().encode(`${key}\n${exp}`);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return bufferToHex(signature);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Auth: verify caller JWT with an anon client ──────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const signingSecret = Deno.env.get('MEDIA_URL_SIGNING_SECRET');

  // Fail closed (never unsigned) if the signing secret isn't configured.
  if (!signingSecret) return json({ error: 'signing_unavailable' }, 503);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Input ────────────────────────────────────────────────────────────────
  const reqBody = await req.json().catch(() => ({})) as { keys?: unknown };
  const rawKeys = Array.isArray(reqBody.keys) ? reqBody.keys : null;
  if (!rawKeys) return json({ error: 'keys must be an array' }, 400);

  // De-dupe, drop non-strings, and bound the batch size.
  const keys = Array.from(
    new Set(rawKeys.filter((k): k is string => typeof k === 'string' && k.length > 0)),
  ).slice(0, MAX_KEYS_PER_REQUEST);

  if (keys.length === 0) return json({ urls: {}, denied: [] });

  // ── Resolve which couples the caller actually belongs to (service role) ────
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: memberships, error: membershipError } = await admin
    .from('couple_memberships')
    .select('couple_id')
    .eq('user_id', user.id);

  if (membershipError) return json({ error: 'membership_lookup_failed' }, 500);

  const memberCoupleIds = new Set(
    (memberships ?? []).map((row: { couple_id: string }) => row.couple_id),
  );

  // ── Sign only the keys whose couple the caller owns (fail-closed) ──────────
  const cryptoKey = await importSigningKey(signingSecret);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SIGNED_URL_TTL_SECONDS;

  const urls: Record<string, SignedCredential> = {};
  const denied: string[] = [];

  for (const key of keys) {
    const parsed = parseManagedMediaKey(key);
    if (!parsed?.coupleId || !memberCoupleIds.has(parsed.coupleId)) {
      denied.push(key);
      continue;
    }
    const sig = await signKey(cryptoKey, parsed.key, exp);
    // Sign the normalized key (no leading slash) returned by the parser so the
    // signed message matches exactly what the Worker re-derives from the path.
    urls[parsed.key] = { exp, sig };
  }

  return json({ urls, denied });
});

/**
 * auth-proxy — Server-side rate-limited auth endpoint.
 *
 * All login / sign-up / password-reset requests go through here.
 * Rate limits are enforced on the server using the auth_rate_limits table,
 * so they cannot be bypassed by clearing localStorage or using incognito.
 *
 * Limits: 5 attempts per 10 minutes, tracked by BOTH IP and email.
 * Dual-key tracking prevents:
 *   - Distributed brute-force (many IPs → same account) → blocked by email key
 *   - One IP cycling through accounts                   → blocked by IP key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RATE_LIMIT_MAX        = 5;
const RATE_LIMIT_WINDOW_MS  = 10 * 60 * 1000; // 10 minutes

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Admin client — service role bypasses RLS so we can write to auth_rate_limits
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { type?: string; email?: string; password?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid request body' }, 400); }

  const { type, email, password } = body;
  if (!type || !email) return json({ error: 'Missing required fields' }, 400);
  if (!['login', 'signup', 'reset'].includes(type))
    return json({ error: 'Unknown operation type' }, 400);

  // ── Get client IP ───────────────────────────────────────────────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';

  const identifiers = [`ip:${ip}`, `email:${email.toLowerCase()}`];
  const now         = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS).toISOString();

  // ── Check rate limit for each identifier ────────────────────────────────────
  for (const identifier of identifiers) {
    const { count, error: countErr } = await supabase
      .from('auth_rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .gte('attempted_at', windowStart);

    if (countErr) {
      // Fail open on DB error — don't lock out legitimate users due to infra issues
      console.error('Rate limit check error:', countErr.message);
      continue;
    }

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      const { data: oldest } = await supabase
        .from('auth_rate_limits')
        .select('attempted_at')
        .eq('identifier', identifier)
        .gte('attempted_at', windowStart)
        .order('attempted_at', { ascending: true })
        .limit(1)
        .single();

      const retryAfterMs = oldest
        ? new Date(oldest.attempted_at).getTime() + RATE_LIMIT_WINDOW_MS - now.getTime()
        : RATE_LIMIT_WINDOW_MS;

      const retryAfterSecs = Math.ceil(retryAfterMs / 1000);
      return json(
        { error: 'Too many attempts. Please try again later.', retry_after_seconds: retryAfterSecs },
        429,
        { 'Retry-After': String(retryAfterSecs) },
      );
    }
  }

  // ── Record this attempt ─────────────────────────────────────────────────────
  await supabase.from('auth_rate_limits').insert(
    identifiers.map(identifier => ({ identifier, attempted_at: now.toISOString() })),
  );

  // Async housekeeping — delete records older than 2× the window (non-blocking)
  const cutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS * 2).toISOString();
  supabase.from('auth_rate_limits').delete().lt('attempted_at', cutoff);

  // ── Perform auth operation ──────────────────────────────────────────────────
  const origin = req.headers.get('origin') ?? '';

  if (type === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: password ?? '' });
    if (error) return json({ error: error.message }, 400);
    return json({ data });
  }

  if (type === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: password ?? '',
      options: { emailRedirectTo: origin },
    });
    if (error) return json({ error: error.message }, 400);
    return json({ data });
  }

  // type === 'reset'
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ data: {} });
});

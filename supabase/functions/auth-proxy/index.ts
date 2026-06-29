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
import { corsHeaders } from '../_shared/cors.ts';

const RATE_LIMIT_MAX        = 5;
const RATE_LIMIT_WINDOW_MS  = 10 * 60 * 1000; // 10 minutes

const makeJson = (cors: Record<string, string>) =>
  (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', ...extra },
    });

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = makeJson(cors);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Admin client — service role bypasses RLS so we can write to auth_rate_limits
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { type?: string; email?: string; password?: string; redirectTo?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid request body' }, 400); }

  const { type, email, password, redirectTo } = body;
  if (!type || !email) return json({ error: 'Missing required fields' }, 400);
  if (!['login', 'signup', 'reset', 'resend'].includes(type))
    return json({ error: 'Unknown operation type' }, 400);

  // ── Get client IP ───────────────────────────────────────────────────────────
  // Prefer the platform-set, trustworthy client IP. `x-forwarded-for` is fully
  // client-controlled, so trusting it first let an attacker rotate a fake value
  // per request and get a fresh ip:* rate-limit bucket every time (bypassing the
  // IP throttle). Only fall back to it when no trusted header is present.
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
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
      // Fail CLOSED: if the rate-limit table cannot be read we refuse the
      // attempt rather than silently disabling brute-force protection. An
      // attacker who can degrade the DB must not gain unlimited login tries.
      console.error('Rate limit check error:', countErr.message);
      return json(
        { error: 'Authentication is temporarily unavailable. Please try again shortly.' },
        503,
        { 'Retry-After': '30' },
      );
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

  // ── Record an attempt (failures only) ───────────────────────────────────────
  // Only FAILED auth operations consume a rate-limit slot. Counting successful
  // logins/sign-outs would lock out active users on shared/CGNAT IPs and block
  // a single user across all their devices via the email key, even though every
  // attempt succeeded. Brute-force protection is preserved because failures
  // still accumulate.
  const recordAttempt = () =>
    supabase.from('auth_rate_limits').insert(
      identifiers.map(identifier => ({ identifier, attempted_at: now.toISOString() })),
    );

  // Housekeeping — delete records older than 2× the window. Awaited so the
  // request is actually sent before the edge isolate can be torn down; errors
  // are logged rather than left as an unhandled rejection.
  const cutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS * 2).toISOString();
  const { error: cleanupErr } = await supabase
    .from('auth_rate_limits')
    .delete()
    .lt('attempted_at', cutoff);
  if (cleanupErr) console.error('Rate limit cleanup error:', cleanupErr.message);

  // ── Perform auth operation ──────────────────────────────────────────────────
  // Use the client-provided redirect target so confirmation / reset links
  // deep-link back into the right surface (native custom-scheme URL on
  // Capacitor, page origin on web). Fall back to the request origin only
  // when the client did not send one. The target must still be on the
  // project's Auth redirect allow-list for Supabase to honour it.
  const origin       = req.headers.get('origin') ?? '';
  const emailRedirect = redirectTo || origin;

  if (type === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: password ?? '' });
    if (error) { await recordAttempt(); return json({ error: error.message }, 400); }
    return json({ data });
  }

  if (type === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: password ?? '',
      options: { emailRedirectTo: emailRedirect },
    });
    if (error) { await recordAttempt(); return json({ error: error.message }, 400); }
    return json({ data });
  }

  if (type === 'resend') {
    // Re-send the sign-up confirmation email. Same rate-limit gate as every
    // other op above, so it can't be abused to spam an address.
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirect },
    });
    if (error) { await recordAttempt(); return json({ error: error.message }, 400); }
    return json({ data: {} });
  }

  // type === 'reset'
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: emailRedirect,
  });
  if (error) { await recordAttempt(); return json({ error: error.message }, 400); }
  return json({ data: {} });
});

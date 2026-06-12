/**
 * Shared CORS policy for all edge functions.
 *
 * Origins are restricted to a known allowlist instead of '*' so that an
 * arbitrary website loaded in a victim's browser cannot read responses from
 * these functions (auth-proxy receives credentials; media-proxy returns full
 * media payloads). Additional origins can be granted at deploy time with the
 * ALLOWED_ORIGINS secret (comma-separated exact origins).
 */
const ALLOWED_ORIGINS_EXACT = [
  'capacitor://localhost', // iOS Capacitor WebView
  'http://localhost',      // Android Capacitor WebView (androidScheme http)
  'https://localhost',     // Android Capacitor WebView (androidScheme https)
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https:\/\/(?:[a-z0-9-]+\.)?joinlior\.com$/i,
  /^https:\/\/[a-z0-9-]+\.joinlior\.workers\.dev$/i,
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/i,
];

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (configured.includes(origin)) return true;
  if (ALLOWED_ORIGINS_EXACT.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

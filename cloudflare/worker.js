/**
 * Lior Media Worker — Cloudflare R2 proxy
 *
 * Routes:
 *   GET    /:path*  — serve file from R2 (public, no auth needed — paths are UUIDs)
 *   PUT    /:path*  — upload file to R2 (requires X-Upload-Key header)
 *   DELETE /:path*  — delete file from R2 (requires X-Upload-Key header)
 *
 * Environment bindings:
 *   LIOR_BUCKET  — R2 bucket binding (wrangler.toml)
 *   UPLOAD_KEY   — secret (wrangler secret put UPLOAD_KEY)
 */

const MAX_UPLOAD_BYTES = 52_428_800; // 50 MiB hard cap (videos)

// Per-MIME-type caps — images are compressed client-side so 10 MiB is generous
const TYPE_LIMITS = {
  'image/': 10_485_760,   // 10 MiB
  'audio/': 15_728_640,   // 15 MiB
  'video/': 52_428_800,   // 50 MiB
};

function maxBytesForType(contentType) {
  const base = contentType.split(';')[0].trim().toLowerCase();
  for (const [prefix, limit] of Object.entries(TYPE_LIMITS)) {
    if (base.startsWith(prefix)) return limit;
  }
  return MAX_UPLOAD_BYTES;
}

// Allowed origins: dev server + Capacitor Android/iOS WebView
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);

// Only accept real media types — blocks HTML/SVG script injection
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/octet-stream'];

function isMimeAllowed(contentType) {
  if (!contentType) return false;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_MIME_PREFIXES.some(p => base.startsWith(p));
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : null;
  return {
    'Access-Control-Allow-Origin': allowed ?? 'null',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function sanitizeKey(raw) {
  // Remove leading slash, reject path traversal and null bytes
  const key = raw.replace(/^\/+/, '').replace(/\0/g, '');
  if (key.includes('..') || key.length === 0 || key.length > 1024) return null;
  return key;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const key = sanitizeKey(decodeURIComponent(url.pathname));
    if (!key) {
      return new Response('Invalid path', { status: 400, headers: cors });
    }

    // ── GET: stream from R2, no auth (paths are non-guessable UUIDs) ──────────
    if (request.method === 'GET') {
      const obj = await env.LIOR_BUCKET.get(key);
      if (!obj) {
        return new Response('Not Found', { status: 404, headers: cors });
      }
      return new Response(obj.body, {
        headers: {
          ...cors,
          'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // ── Auth check for all mutating operations ────────────────────────────────
    const uploadKey = request.headers.get('X-Upload-Key');
    if (!uploadKey || uploadKey !== env.UPLOAD_KEY) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    // ── PUT: upload to R2 ─────────────────────────────────────────────────────
    if (request.method === 'PUT') {
      const contentType = request.headers.get('Content-Type') || '';
      if (!isMimeAllowed(contentType)) {
        return new Response('Unsupported media type', { status: 415, headers: cors });
      }

      const sizeLimit = maxBytesForType(contentType);
      const contentLength = Number(request.headers.get('Content-Length') ?? '0');
      if (contentLength > sizeLimit) {
        return new Response(`Payload too large (max ${sizeLimit / 1_048_576} MiB for this type)`, { status: 413, headers: cors });
      }

      // Stream body and enforce size limit during read (guards against missing Content-Length)
      const reader = request.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > sizeLimit) {
          return new Response(`Payload too large (max ${sizeLimit / 1_048_576} MiB for this type)`, { status: 413, headers: cors });
        }
        chunks.push(value);
      }

      const combined = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }

      await env.LIOR_BUCKET.put(key, combined, {
        httpMetadata: { contentType: contentType.split(';')[0].trim() },
      });

      return new Response(JSON.stringify({ path: key }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── DELETE: remove from R2 ────────────────────────────────────────────────
    if (request.method === 'DELETE') {
      await env.LIOR_BUCKET.delete(key);
      return new Response('OK', { status: 200, headers: cors });
    }

    return new Response('Method Not Allowed', { status: 405, headers: cors });
  },
};

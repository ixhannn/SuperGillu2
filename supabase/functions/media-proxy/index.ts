import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LEGACY_SUPABASE_BUCKETS = ['lior-media', 'tulika-media'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function readBearerToken(value: string | null) {
  if (!value) return '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function stripLeadingSlash(value: string) {
  return value.replace(/^\/+/, '');
}

function parseSupabaseStorageRef(storagePath: string): { bucket: string; key: string; absoluteUrl?: string; isPublic: boolean } | null {
  const parsed = tryParseUrl(storagePath);
  if (!parsed) return null;

  const marker = '/storage/v1/object/';
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex < 0) return null;

  const rest = parsed.pathname.slice(markerIndex + marker.length);
  const segments = rest.split('/').filter(Boolean);
  if (segments.length < 3) return null;

  if (segments[0] === 'render' && segments[1] === 'image' && segments.length >= 5) {
    return {
      bucket: segments[3],
      key: decodeURIComponent(segments.slice(4).join('/')),
      absoluteUrl: parsed.toString(),
      isPublic: true,
    };
  }

  return {
    bucket: segments[1],
    key: decodeURIComponent(segments.slice(2).join('/')),
    absoluteUrl: parsed.toString(),
    isPublic: segments[0] === 'public',
  };
}

function isAllowedBucket(bucket: string) {
  return LEGACY_SUPABASE_BUCKETS.includes(bucket);
}

async function blobToDataUri(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  const contentType = blob.type || 'application/octet-stream';
  return `data:${contentType};base64,${btoa(chunks.join(''))}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Media proxy is not configured' }, 500);
  }

  const accessToken = readBearerToken(req.headers.get('Authorization'));
  if (!accessToken) return json({ error: 'Authentication required' }, 401);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await service.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return json({ error: 'Invalid session' }, 401);
  }

  let body: { storagePath?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const storagePath = String(body.storagePath || '').trim();
  if (!storagePath || storagePath.startsWith('data:')) {
    return json({ error: 'storagePath is required' }, 400);
  }

  const parsedRef = parseSupabaseStorageRef(storagePath);
  const targets = parsedRef
    ? [{ bucket: parsedRef.bucket, key: parsedRef.key }]
    : LEGACY_SUPABASE_BUCKETS.map((bucket) => ({ bucket, key: stripLeadingSlash(storagePath) }));

  for (const target of targets) {
    if (!isAllowedBucket(target.bucket) || !target.key) continue;

    const { data, error } = await service.storage.from(target.bucket).download(target.key);
    if (error || !data) continue;

    return json({
      dataUri: await blobToDataUri(data),
      bucket: target.bucket,
      key: target.key,
    });
  }

  return json({ error: 'Media not found' }, 404);
});

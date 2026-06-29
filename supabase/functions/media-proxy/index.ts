import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { parseManagedMediaKey } from '../../../shared/mediaPolicy.js';

const LEGACY_SUPABASE_BUCKETS = ['lior-media', 'tulika-media'];

// Hard cap on the object size we will buffer + base64-encode into a single JSON
// response. base64 inflates bytes ~33%, and the whole encoded string is held in
// the isolate at once, so an unbounded download can OOM the edge function. This
// bounds peak memory to a safe multiple of the cap; oversized objects are
// refused with 413 instead of crashing the function for everyone.
const MAX_PROXY_BYTES = 24 * 1024 * 1024;

// Legacy feature tables (top-level `couple_id` column + `data` jsonb holding the
// storage path) used to bind a legacy media ref to its owning couple. Mirrors
// the union in public.storage_audit_legacy_refs. Each entry lists the jsonb
// fields under `data` that may hold a storage path for that feature.
const LEGACY_REF_TABLES: ReadonlyArray<{ table: string; fields: readonly string[] }> = [
  { table: 'memories', fields: ['storagePath', 'videoStoragePath'] },
  { table: 'daily_photos', fields: ['storagePath', 'videoStoragePath'] },
  { table: 'keepsakes', fields: ['storagePath', 'videoStoragePath'] },
  { table: 'time_capsules', fields: ['storagePath'] },
  { table: 'surprises', fields: ['storagePath'] },
  { table: 'voice_notes', fields: ['audioStoragePath'] },
  { table: 'together_music', fields: ['music_url'] },
];

const makeJson = (cors: Record<string, string>) =>
  (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

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

// Untyped-schema client: edge functions talk to PostgREST without generated DB
// types, and `ReturnType<typeof createClient>` resolves to a `never`-schema
// variant that doesn't match an actual createClient() call (supabase-js v2
// generic quirk) — so query rows collapse to `never`. `<any, any, any>` keeps it
// a SupabaseClient while letting row shapes through.
type ServiceClient = SupabaseClient<any, any, any>;

/**
 * Resolve the set of couple IDs the authenticated user belongs to, using a
 * service-role read of couple_memberships (mirrors sign-media + the Worker's
 * isUserInCouple). Returns an empty set when the user belongs to no couple.
 */
async function resolveMemberCoupleIds(service: ServiceClient, userId: string): Promise<Set<string>> {
  const { data, error } = await service
    .from('couple_memberships')
    .select('couple_id')
    .eq('user_id', userId);
  if (error || !data) return new Set();
  return new Set(data.map((row: { couple_id: string }) => row.couple_id));
}

/**
 * Resolve the couple that OWNS the requested media ref, failing closed (null)
 * when it cannot be bound to a couple. Resolution order:
 *   1. Managed v2 key  -> coupleId encoded in the key (parseManagedMediaKey).
 *   2. media_assets authority -> row whose r2_key matches any candidate ref.
 *   3. Legacy feature tables  -> row whose data->>'<field>' matches a candidate
 *      ref (mirrors public.storage_audit_legacy_refs).
 * `candidates` are the distinct path forms a caller may have supplied for the
 * same object (the raw storagePath plus each parsed bucket/key).
 */
async function resolveOwningCoupleId(
  service: ServiceClient,
  candidates: readonly string[],
): Promise<string | null> {
  const refs = Array.from(new Set(candidates.filter((value) => value && value.length > 0)));
  if (refs.length === 0) return null;

  // 1. Managed v2 keys carry their owning couple in the key itself.
  for (const ref of refs) {
    const parsed = parseManagedMediaKey(ref);
    if (parsed?.coupleId) return parsed.coupleId;
  }

  // 2. media_assets is the authority for tracked objects (keyed by r2_key).
  const { data: assetRows } = await service
    .from('media_assets')
    .select('couple_id')
    .in('r2_key', refs)
    .limit(1);
  if (assetRows?.length && assetRows[0].couple_id) return assetRows[0].couple_id as string;

  // 3. Legacy refs live in the feature tables' data jsonb, with a top-level
  //    couple_id column. Probe each table/field for a matching storage path.
  for (const { table, fields } of LEGACY_REF_TABLES) {
    for (const field of fields) {
      const { data: rows } = await service
        .from(table)
        .select('couple_id')
        .in(`data->>${field}`, refs)
        .limit(1);
      if (rows?.length && rows[0].couple_id) return rows[0].couple_id as string;
    }
  }

  // Cannot bind the ref to any couple -> fail closed.
  return null;
}

Deno.serve(async (req) => {
  const cors = { ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const json = makeJson(cors);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
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

  // ── Couple-ownership gate (close media-proxy IDOR) ────────────────────────
  // Before downloading anything, bind the requested ref to its OWNING couple
  // and confirm the caller is a member of it. The caller may legitimately store
  // the ref in several equivalent forms, so probe every candidate path the
  // feature tables / media_assets could hold. Fail CLOSED: if the ref cannot be
  // bound to a couple the caller belongs to, refuse without touching storage.
  const refCandidates = [
    storagePath,
    stripLeadingSlash(storagePath),
    parsedRef?.key ?? '',
    parsedRef?.absoluteUrl ?? '',
    ...targets.map((target) => target.key),
  ];

  const owningCoupleId = await resolveOwningCoupleId(service, refCandidates);
  if (!owningCoupleId) {
    return json({ error: 'Forbidden' }, 403);
  }

  const memberCoupleIds = await resolveMemberCoupleIds(service, userData.user.id);
  if (!memberCoupleIds.has(owningCoupleId)) {
    return json({ error: 'Forbidden' }, 403);
  }

  for (const target of targets) {
    if (!isAllowedBucket(target.bucket) || !target.key) continue;

    const { data, error } = await service.storage.from(target.bucket).download(target.key);
    if (error || !data) continue;

    // Refuse to buffer + base64-encode objects larger than the cap: doing so
    // would hold the inflated payload entirely in the isolate and can OOM it.
    if (data.size > MAX_PROXY_BYTES) {
      return json({ error: 'Media too large to proxy' }, 413);
    }

    return json({
      dataUri: await blobToDataUri(data),
      bucket: target.bucket,
      key: target.key,
    });
  }

  return json({ error: 'Media not found' }, 404);
});

import { MEDIA_RETENTION_MS, getMediaRetentionMs, isFeatureEphemeral } from '../shared/mediaRetention.js';
import {
  getMaxUploadBytesForManagedAsset,
  isManagedUploadKey,
  isMimeAllowedForManagedAsset,
  normalizeMimeType,
  parseManagedMediaKey,
} from '../shared/mediaPolicy.js';

/**
 * Lior Media Worker - Cloudflare R2 proxy + cleanup scheduler
 *
 * Routes:
 *   HEAD   /:path*              - probe whether an object exists in R2
 *   GET    /:path*              - serve file from R2 (public)
 *   PUT    /:path*              - upload file to R2 (requires Supabase user session)
 *   DELETE /:path*              - delete file from R2 (requires Supabase user session)
 *   POST   /__internal/cleanup  - run cleanup immediately (requires X-Cleanup-Token)
 *   GET    /__admin/overview    - admin storage dashboard snapshot (requires admin token)
 *   GET    /__admin/media       - admin media browser data (requires admin token)
 *   GET    /__admin/users       - admin user inventory data (requires admin token)
 *   POST   /__admin/actions/audit   - run storage audit immediately (requires admin token)
 *   POST   /__admin/actions/repair  - repair legacy refs into canonical R2 keys (requires admin token)
 *   POST   /__admin/actions/cleanup - run cleanup immediately (requires admin token)
 *
 * Environment bindings:
 *   LIOR_BUCKET                 - R2 bucket binding
 *   CLEANUP_INTERNAL_TOKEN      - secret for manual cleanup trigger
 *   ADMIN_DASHBOARD_TOKEN       - secret for admin dashboard/API access
 *   SUPABASE_URL                - secret/base URL for the Supabase project
 *   SUPABASE_SERVICE_ROLE_KEY   - secret for cleanup-task RPC + task updates
 */

const CLEANUP_ROUTE = '/__internal/cleanup';
const ADMIN_ROUTE_PREFIX = '/__admin';
const ADMIN_OVERVIEW_ROUTE = '/__admin/overview';
const ADMIN_MEDIA_ROUTE = '/__admin/media';
const ADMIN_USERS_ROUTE = '/__admin/users';
const ADMIN_AUDIT_ROUTE = '/__admin/actions/audit';
const ADMIN_CLEANUP_ROUTE = '/__admin/actions/cleanup';
const ADMIN_REPAIR_ROUTE = '/__admin/actions/repair';
const ADMIN_RESOLVE_ALERT_ROUTE = '/__admin/actions/resolve-alert';
const ADMIN_RETRY_CLEANUP_TASK_ROUTE = '/__admin/actions/retry-cleanup-task';
const ADMIN_VERIFY_MEDIA_ROUTE = '/__admin/actions/verify-media';
const CLEANUP_FEATURE = 'daily-moments';
const CLEANUP_FEATURE_RETENTION_MS = getMediaRetentionMs(CLEANUP_FEATURE);
const CLEANUP_BATCH_SIZE = 100;
const ORPHAN_DAILY_OBJECT_CLEANUP_BATCH_SIZE = 15;
const REPAIR_BATCH_SIZE = 100;
const MAX_CLEANUP_ATTEMPTS = 8;
const COMPLETED_TASK_RETENTION_DAYS = 30;
const LEGACY_SUPABASE_BUCKETS = ['lior-media', 'tulika-media'];

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/octet-stream'];
const EMAIL_LIKE_SEGMENT = /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/i;
const ADMIN_DATA_TABLES = [
  'media_assets',
  'storage_alerts',
  'storage_events',
  'storage_metrics_daily',
  'media_cleanup_tasks',
  'memories',
  'daily_photos',
  'private_space_items',
  'keepsakes',
  'time_capsules',
  'surprises',
  'voice_notes',
  'together_music',
];
const ADMIN_APP_DATA_TABLES = [
  'memories',
  'daily_photos',
  'private_space_items',
  'keepsakes',
  'time_capsules',
  'surprises',
  'voice_notes',
  'together_music',
  'notes',
  'dates',
  'envelopes',
  'comments',
  'mood_entries',
  'couple_profile',
  'pet_stats',
  'user_status',
  'our_room_state',
  'us_bucket_items',
  'us_wishlist_items',
  'us_milestones',
  'sync_deletions',
];

function isMimeAllowed(contentType) {
  if (!contentType) return false;
  const base = normalizeMimeType(contentType);
  return ALLOWED_MIME_PREFIXES.some((prefix) => base.startsWith(prefix));
}

// Browser origins allowed to call this worker cross-origin. Extend with the
// ALLOWED_ORIGINS env var (comma-separated exact origins) for new deployments.
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

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const configured = String(env?.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (configured.includes(origin)) return true;
  if (ALLOWED_ORIGINS_EXACT.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function corsHeaders(origin, env) {
  const allowed = isOriginAllowed(origin, env) ? origin : null;

  return {
    'Access-Control-Allow-Origin': allowed ?? 'null',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Cleanup-Token, X-Admin-Token, Range',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, ETag',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function objectHeaders(obj, cors) {
  const headers = new Headers(cors);
  if (typeof obj.writeHttpMetadata === 'function') {
    obj.writeHttpMetadata(headers);
  }

  headers.set('Content-Type', obj.httpMetadata?.contentType || headers.get('Content-Type') || 'application/octet-stream');
  headers.set('Content-Disposition', 'inline');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  if (typeof obj.size === 'number') headers.set('Content-Length', String(obj.size));
  if (obj.httpEtag) headers.set('ETag', obj.httpEtag);
  return headers;
}

function sanitizeKey(raw) {
  const key = raw.replace(/^\/+/, '').replace(/\0/g, '');
  if (key.includes('..') || key.length === 0 || key.length > 1024) return null;
  return key;
}

function stripLeadingSlash(value) {
  return value.replace(/^\/+/, '');
}

function encodePathSegments(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function sanitizePathSegment(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'unknown';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function normalizeManagedSegment(value, fallback = 'unknown') {
  const normalized = sanitizePathSegment(value ?? '');
  return normalized || fallback;
}

function getUtcBucket(timestamp) {
  const parsed = timestamp ? new Date(timestamp) : new Date();
  const effective = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    year: String(effective.getUTCFullYear()),
    month: String(effective.getUTCMonth() + 1).padStart(2, '0'),
  };
}

function buildManagedMediaKey({ coupleId, ownerUserId, feature, itemId, assetRole, timestamp }) {
  const { year, month } = getUtcBucket(timestamp);
  const normalizedCoupleId = normalizeManagedSegment(coupleId, 'guest');
  const normalizedItemId = normalizeManagedSegment(itemId, 'item');
  const normalizedFeature = normalizeManagedSegment(feature);
  const normalizedAssetRole = normalizeManagedSegment(assetRole);
  const normalizedOwner = ownerUserId ? normalizeManagedSegment(ownerUserId) : null;
  const ownerNamespace = normalizedOwner ? `users/${normalizedOwner}` : 'legacy';

  return `v2/couples/${normalizedCoupleId}/${ownerNamespace}/${normalizedFeature}/${year}/${month}/${normalizedItemId}/${normalizedAssetRole}`;
}

function parseSupabaseStorageRef(storagePath) {
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

  const namespace = segments[0];
  return {
    bucket: segments[1],
    key: decodeURIComponent(segments.slice(2).join('/')),
    absoluteUrl: parsed.toString(),
    isPublic: namespace === 'public',
  };
}

function getAssetRoleForFieldName(fieldName) {
  switch (fieldName) {
    case 'storagePath':
      return 'image';
    case 'videoStoragePath':
      return 'video';
    case 'audioStoragePath':
      return 'audio';
    case 'music_url':
      return 'track';
    default:
      return null;
  }
}

function resolveRepairTimestamp(feature, rowData) {
  if (!rowData || typeof rowData !== 'object') return null;
  if (feature === 'memories' || feature === 'keepsakes') {
    return rowData.date || rowData.createdAt || null;
  }
  if (feature === 'together-music') {
    return rowData.meta?.date || rowData.createdAt || null;
  }
  return rowData.createdAt || rowData.date || rowData.meta?.date || null;
}

function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isManagedWriteKey(key) {
  return isManagedUploadKey(key)
    && !key.split('/').filter(Boolean).some((segment) => EMAIL_LIKE_SEGMENT.test(segment));
}

function getManagedFeatureFromKey(key) {
  return parseManagedMediaKey(key)?.feature ?? null;
}

function isCleanupEligibleKey(key) {
  return isManagedWriteKey(key)
    && getManagedFeatureFromKey(key) === CLEANUP_FEATURE
    && isFeatureEphemeral(CLEANUP_FEATURE);
}

function extractManagedKey(storagePath) {
  if (!storagePath || typeof storagePath !== 'string' || storagePath.startsWith('data:')) return null;
  if (storagePath.startsWith('v2/couples/')) return stripLeadingSlash(storagePath);

  const parsed = tryParseUrl(storagePath);
  if (!parsed) return stripLeadingSlash(storagePath);

  const marker = '/storage/v1/object/';
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex >= 0) {
    const rest = parsed.pathname.slice(markerIndex + marker.length);
    const segments = rest.split('/').filter(Boolean);
    if (segments[0] === 'render' && segments[1] === 'image' && segments.length >= 5) {
      return stripLeadingSlash(decodeURIComponent(segments.slice(4).join('/')));
    }
    if (segments.length >= 3 && LEGACY_SUPABASE_BUCKETS.includes(segments[1])) {
      return stripLeadingSlash(decodeURIComponent(segments.slice(2).join('/')));
    }
  }

  return stripLeadingSlash(decodeURIComponent(parsed.pathname));
}

function cleanupAuthHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function hasSupabaseAdmin(env) {
  return !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(payload, status, cors) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function readBearerToken(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

function getAdminTokenFromRequest(request) {
  return request.headers.get('X-Admin-Token')
    || readBearerToken(request.headers.get('Authorization'))
    || '';
}

function requireAdminToken(request, env) {
  const token = getAdminTokenFromRequest(request);
  return !!token && !!env.ADMIN_DASHBOARD_TOKEN && token === env.ADMIN_DASHBOARD_TOKEN;
}

async function getAuthenticatedUser(request, env) {
  const accessToken = readBearerToken(request.headers.get('Authorization'));
  if (!accessToken || !env.SUPABASE_URL) return null;

  // Token verification must use the worker's own key — never one supplied by
  // the caller, which would let a client influence server-side auth checks.
  const projectApiKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!projectApiKey) return null;

  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: projectApiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.id ? payload : null;
}

async function isUserInCouple(env, userId, coupleId) {
  if (!hasSupabaseAdmin(env) || !userId || !coupleId) return false;

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/couple_memberships?user_id=eq.${encodeURIComponent(userId)}&couple_id=eq.${encodeURIComponent(coupleId)}&select=couple_id&limit=1`,
    { headers: cleanupAuthHeaders(env) },
  );

  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(digest);
}

async function supabaseRequest(env, path, init = {}) {
  if (!hasSupabaseAdmin(env)) {
    throw new Error('Cleanup secrets are missing');
  }

  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1${path}`, {
    ...init,
    headers: {
      ...cleanupAuthHeaders(env),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function fetchMediaAssetByKey(env, key) {
  if (!hasSupabaseAdmin(env)) return null;
  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/media_assets?r2_key=eq.${encodeURIComponent(key)}&select=*`,
    { headers: cleanupAuthHeaders(env) },
  );
  if (response.status === 400 || response.status === 404) return undefined;
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function patchMediaAssetByKey(env, key, payload) {
  if (!hasSupabaseAdmin(env)) return;
  await supabaseRequest(
    env,
    `/media_assets?r2_key=eq.${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    },
  );
}

async function deleteMediaAssetByKey(env, key) {
  if (!hasSupabaseAdmin(env)) return;
  await supabaseRequest(
    env,
    `/media_assets?r2_key=eq.${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    },
  );
}

async function upsertMediaAsset(env, payload) {
  if (!hasSupabaseAdmin(env)) return;
  await supabaseRequest(
    env,
    '/media_assets?on_conflict=couple_id,source_table,logical_row_id,asset_role',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    },
  );
}

async function insertStorageEvent(env, payload) {
  if (!hasSupabaseAdmin(env)) return;
  await supabaseRequest(env, '/storage_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
}

async function insertAdminActionEvent(env, eventType, metadata = {}, severity = 'info') {
  await insertStorageEvent(env, {
    couple_id: metadata.coupleId ?? metadata.couple_id ?? null,
    feature: metadata.feature ?? null,
    severity,
    event_type: `admin.${eventType}`,
    r2_key: metadata.r2Key ?? metadata.r2_key ?? null,
    source_table: metadata.sourceTable ?? metadata.source_table ?? null,
    logical_row_id: metadata.logicalRowId ?? metadata.logical_row_id ?? metadata.id ?? null,
    metadata,
  }).catch(() => {});
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function upsertStorageAlert(env, payload) {
  if (!hasSupabaseAdmin(env)) return;
  await supabaseRequest(env, '/rpc/upsert_storage_alert', {
    method: 'POST',
    body: JSON.stringify({
      p_couple_id: payload.couple_id ?? null,
      p_feature: payload.feature ?? null,
      p_alert_type: payload.alert_type,
      p_severity: payload.severity ?? 'error',
      p_fingerprint: payload.fingerprint,
      p_title: payload.title,
      p_details: payload.details ?? {},
    }),
  });
}

async function listMediaAssets(env) {
  if (!hasSupabaseAdmin(env)) return [];
  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/media_assets?select=*&limit=5000&order=updated_at.desc`,
    { headers: cleanupAuthHeaders(env) },
  );
  if (response.status === 400 || response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Failed to list media assets (${response.status})`);
  }
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function upsertStorageMetric(env, payload) {
  if (!hasSupabaseAdmin(env)) return;
  await supabaseRequest(env, '/storage_metrics_daily', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });
}

async function runRpc(env, name, body = {}) {
  return supabaseRequest(env, `/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function fetchPagedRestRows(env, buildPath, { pageSize = 1000, maxPages = 20 } = {}) {
  const rows = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const offset = pageIndex * pageSize;
    const response = await supabaseRequest(env, buildPath(offset, pageSize), { method: 'GET' });
    const pageRows = Array.isArray(response) ? response : [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }
  return rows;
}

function sortFeatureUsage(a, b) {
  return Number(b.total_bytes || 0) - Number(a.total_bytes || 0)
    || String(a.feature || '').localeCompare(String(b.feature || ''));
}

function buildEmptyAdminOverview() {
  return {
    total_couples: 0,
    total_assets: 0,
    ready_assets: 0,
    pending_assets: 0,
    missing_assets: 0,
    orphaned_assets: 0,
    total_bytes: 0,
    open_alerts: 0,
    cleanup_backlog: 0,
    usage: [],
  };
}

function inferAdminRowTitle(table, data) {
  if (!data || typeof data !== 'object') return table;
  const fields = ['title', 'caption', 'name', 'text', 'message', 'note', 'content', 'prompt', 'label'];
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
  }
  if (data.date) return `${table} · ${String(data.date).slice(0, 32)}`;
  if (data.createdAt) return `${table} · ${String(data.createdAt).slice(0, 32)}`;
  if (data.id) return `${table} · ${String(data.id).slice(0, 48)}`;
  return table;
}

function listAdminMediaRefs(data) {
  if (!data || typeof data !== 'object') return [];
  const fields = [
    'storagePath',
    'videoStoragePath',
    'audioStoragePath',
    'image',
    'video',
    'audio',
    'music_url',
    'thumbnail',
    'thumbnailStoragePath',
  ];

  return fields
    .filter((field) => typeof data[field] === 'string' && data[field].trim())
    .map((field) => {
      const value = String(data[field]);
      return {
        field,
        kind: value.startsWith('v2/couples/') ? 'r2-key' : value.startsWith('data:') ? 'inline-base64' : tryParseUrl(value) ? 'url' : 'path',
      };
    });
}

function summarizeAdminRow(table, row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  const mediaRefs = listAdminMediaRefs(data);
  return {
    table,
    row_id: row?.id ?? null,
    logical_id: data?.id ?? (typeof row?.id === 'string' && row.id.includes(':') ? row.id.split(':').pop() : row?.id ?? null),
    user_id: row?.user_id ?? null,
    couple_id: row?.couple_id ?? null,
    title: inferAdminRowTitle(table, data),
    created_at: row?.created_at ?? data?.createdAt ?? null,
    updated_at: row?.updated_at ?? data?.updatedAt ?? null,
    expires_at: data?.expiresAt ?? null,
    media_ref_count: mediaRefs.length,
    media_refs: mediaRefs,
    data_keys: Object.keys(data).slice(0, 24),
  };
}

const ADMIN_MEDIA_SECTIONS = Object.freeze({
  memories: Object.freeze({ section: 'journey', sectionLabel: 'Our Journey', sourceTable: 'memories' }),
  'daily-moments': Object.freeze({ section: 'moments', sectionLabel: 'Moments', sourceTable: 'daily_photos' }),
  'private-space': Object.freeze({ section: 'secret-space', sectionLabel: 'Secret Space', sourceTable: 'private_space_items' }),
});

const ADMIN_MEDIA_TABLES = Object.freeze([
  Object.freeze({ table: 'memories', feature: 'memories', section: 'journey', sectionLabel: 'Our Journey' }),
  Object.freeze({ table: 'daily_photos', feature: 'daily-moments', section: 'moments', sectionLabel: 'Moments' }),
  Object.freeze({ table: 'private_space_items', feature: 'private-space', section: 'secret-space', sectionLabel: 'Secret Space' }),
]);

const ADMIN_MEDIA_FIELD_ROLES = Object.freeze({
  storagePath: 'image',
  image: 'image',
  thumbnail: 'image',
  thumbnailStoragePath: 'image',
  videoStoragePath: 'video',
  video: 'video',
  audioStoragePath: 'audio',
  audio: 'audio',
  music_url: 'track',
});

function getAdminRowData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : (row && typeof row === 'object' ? row : {});
}

function getAdminLogicalId(row, data) {
  if (data?.id) return String(data.id);
  if (typeof row?.id === 'string' && row.id.includes(':')) return row.id.split(':').pop();
  return row?.id ? String(row.id) : null;
}

function getAdminSectionForMedia(feature, sourceTable) {
  if (ADMIN_MEDIA_SECTIONS[feature]) return ADMIN_MEDIA_SECTIONS[feature];
  const tableMatch = ADMIN_MEDIA_TABLES.find((entry) => entry.table === sourceTable);
  if (!tableMatch) return null;
  return {
    section: tableMatch.section,
    sectionLabel: tableMatch.sectionLabel,
    sourceTable: tableMatch.table,
  };
}

function inferAdminMediaKind(assetRole, mimeType) {
  const normalizedMime = normalizeMimeType(mimeType || '');
  if (normalizedMime.startsWith('image/')) return 'image';
  if (normalizedMime.startsWith('video/')) return 'video';
  if (normalizedMime.startsWith('audio/')) return 'audio';
  if (assetRole === 'video') return 'video';
  if (assetRole === 'audio' || assetRole === 'track') return 'audio';
  return 'image';
}

function inferAdminMediaMime(assetRole, data, field) {
  const mimeField = field === 'video' || field === 'videoStoragePath'
    ? 'videoMimeType'
    : field === 'audio' || field === 'audioStoragePath' || field === 'music_url'
      ? 'audioMimeType'
      : 'imageMimeType';
  return data?.[mimeField] || (assetRole === 'video' ? 'video/mp4' : assetRole === 'audio' || assetRole === 'track' ? 'audio/mpeg' : 'image/jpeg');
}

function resolveAdminMediaRef(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  if (value.startsWith('data:')) {
    return { kind: 'inline-base64', inlineOnly: true, r2Key: null, legacyUrl: null, legacyPath: null };
  }

  const parsed = tryParseUrl(value);
  const extracted = extractManagedKey(value);
  if (extracted && isManagedUploadKey(extracted)) {
    return { kind: 'r2-key', inlineOnly: false, r2Key: extracted, legacyUrl: null, legacyPath: null };
  }

  if (parsed) {
    return { kind: 'legacy-url', inlineOnly: false, r2Key: null, legacyUrl: parsed.toString(), legacyPath: null };
  }

  return { kind: 'legacy-path', inlineOnly: false, r2Key: null, legacyUrl: null, legacyPath: value };
}

function buildAdminMediaItemFromAsset(asset, knownR2Keys = null) {
  const sectionInfo = getAdminSectionForMedia(asset?.feature, asset?.source_table);
  if (!sectionInfo) return null;

  const assetRole = asset?.asset_role || parseManagedMediaKey(asset?.r2_key)?.assetRole || 'image';
  const mimeType = normalizeMimeType(asset?.mime_type || '');
  const r2Key = asset?.r2_key || null;
  const hasR2Object = !!r2Key && (!knownR2Keys || knownR2Keys.has(r2Key));
  return {
    id: `asset:${asset?.id || asset?.r2_key}`,
    section: sectionInfo.section,
    sectionLabel: sectionInfo.sectionLabel,
    feature: asset?.feature || null,
    sourceTable: asset?.source_table || sectionInfo.sourceTable,
    rowId: asset?.logical_row_id || null,
    logicalId: asset?.item_id || asset?.logical_row_id || null,
    title: `${sectionInfo.sectionLabel} media`,
    caption: '',
    coupleId: asset?.couple_id || null,
    ownerUserId: asset?.owner_user_id || null,
    ownerFolder: asset?.owner_user_id || 'legacy-or-unknown',
    assetRole,
    mediaKind: inferAdminMediaKind(assetRole, mimeType),
    r2Key: hasR2Object ? r2Key : null,
    legacyUrl: null,
    legacyPath: hasR2Object ? null : r2Key,
    inlineOnly: false,
    refField: null,
    byteSize: Number(asset?.byte_size || 0),
    mimeType,
    checksumSha256: asset?.checksum_sha256 || null,
    status: hasR2Object ? asset?.status || 'ready' : 'missing-object',
    uploadedAt: null,
    createdAt: null,
    updatedAt: asset?.updated_at || null,
    expiresAt: null,
    origin: 'media_assets',
  };
}

function buildAdminMediaItemFromR2Object(object) {
  const parsed = parseManagedMediaKey(object?.key);
  if (!parsed) return null;
  const sectionInfo = getAdminSectionForMedia(parsed.feature, null);
  if (!sectionInfo) return null;

  return {
    id: `r2:${object.key}`,
    section: sectionInfo.section,
    sectionLabel: sectionInfo.sectionLabel,
    feature: parsed.feature,
    sourceTable: sectionInfo.sourceTable,
    rowId: null,
    logicalId: parsed.itemId,
    title: `${sectionInfo.sectionLabel} media`,
    caption: '',
    coupleId: parsed.coupleId || null,
    ownerUserId: parsed.ownerUserId || null,
    ownerFolder: parsed.ownerUserId || 'legacy-or-unknown',
    assetRole: parsed.assetRole,
    mediaKind: inferAdminMediaKind(parsed.assetRole, null),
    r2Key: object.key,
    legacyUrl: null,
    legacyPath: null,
    inlineOnly: false,
    refField: null,
    byteSize: Number(object.size || 0),
    mimeType: null,
    checksumSha256: null,
    status: object.managed ? 'r2-managed' : 'r2-unmanaged',
    uploadedAt: object.uploaded || null,
    createdAt: null,
    updatedAt: object.uploaded || null,
    expiresAt: null,
    origin: 'r2',
  };
}

function buildAdminMediaItemsFromRow(tableConfig, row, knownR2Keys = null) {
  const data = getAdminRowData(row);
  const logicalId = getAdminLogicalId(row, data);
  const title = inferAdminRowTitle(tableConfig.table, data);
  const caption = data?.caption || data?.text || data?.note || data?.title || '';
  const createdAt = row?.created_at || data?.createdAt || data?.date || null;
  const updatedAt = row?.updated_at || data?.updatedAt || createdAt;
  const ownerUserId = data?.ownerUserId || row?.user_id || data?.senderId || data?.addedBy || null;
  const coupleId = row?.couple_id || data?.coupleId || data?.couple_id || null;

  return Object.entries(ADMIN_MEDIA_FIELD_ROLES).flatMap(([field, assetRole]) => {
    const ref = resolveAdminMediaRef(data?.[field]);
    if (!ref) return [];
    const parsed = ref.r2Key ? parseManagedMediaKey(ref.r2Key) : null;
    const hasR2Object = !!ref.r2Key && (!knownR2Keys || knownR2Keys.has(ref.r2Key));
    const mimeType = inferAdminMediaMime(assetRole, data, field);

    return [{
      id: `row:${tableConfig.table}:${logicalId || row?.id || 'unknown'}:${field}`,
      section: tableConfig.section,
      sectionLabel: tableConfig.sectionLabel,
      feature: parsed?.feature || tableConfig.feature,
      sourceTable: tableConfig.table,
      rowId: row?.id || null,
      logicalId: logicalId || parsed?.itemId || null,
      title,
      caption: String(caption || '').slice(0, 180),
      coupleId: parsed?.coupleId || coupleId,
      ownerUserId: parsed?.ownerUserId || ownerUserId,
      ownerFolder: parsed?.ownerUserId || ownerUserId || 'legacy-or-unknown',
      assetRole: parsed?.assetRole || assetRole,
      mediaKind: inferAdminMediaKind(parsed?.assetRole || assetRole, mimeType),
      r2Key: hasR2Object ? ref.r2Key : null,
      legacyUrl: ref.legacyUrl,
      legacyPath: hasR2Object ? ref.legacyPath : ref.legacyPath || ref.r2Key,
      inlineOnly: ref.inlineOnly,
      refField: field,
      byteSize: Number(
        assetRole === 'video' ? data?.videoBytes
          : assetRole === 'audio' || assetRole === 'track' ? data?.audioBytes
            : data?.imageBytes || 0,
      ),
      mimeType,
      checksumSha256: null,
      status: ref.r2Key && !hasR2Object ? 'missing-object' : ref.kind,
      uploadedAt: null,
      createdAt,
      updatedAt,
      expiresAt: data?.expiresAt || null,
      origin: 'supabase-row',
    }];
  });
}

function mergeAdminMediaItem(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== null && value !== undefined && value !== '')),
    title: existing.title && existing.title !== `${existing.sectionLabel} media` ? existing.title : incoming.title,
    caption: existing.caption || incoming.caption || '',
    byteSize: Number(existing.byteSize || 0) || Number(incoming.byteSize || 0),
    mimeType: existing.mimeType || incoming.mimeType || null,
    checksumSha256: existing.checksumSha256 || incoming.checksumSha256 || null,
    status: existing.status === 'ready' ? existing.status : incoming.status || existing.status,
    origin: Array.from(new Set(String(existing.origin || '').split('+').concat(String(incoming.origin || '').split('+')).filter(Boolean))).join('+'),
  };
}

function addAdminMediaItem(mediaMap, item) {
  if (!item) return;
  const key = item.r2Key
    ? `${item.section}:r2:${item.r2Key}`
    : `${item.section}:row:${item.sourceTable}:${item.logicalId || item.rowId}:${item.assetRole}:${item.refField || item.status}`;
  mediaMap.set(key, mergeAdminMediaItem(mediaMap.get(key), item));
}

async function fetchAdminMediaRows(env, tableConfig, maxRows) {
  if (!hasSupabaseAdmin(env)) return { table: tableConfig.table, ok: false, error: 'Supabase admin access is missing.', rows: [] };

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${tableConfig.table}?select=*&limit=${parsePositiveInteger(maxRows, 100)}&order=id.desc`,
    { method: 'GET', headers: cleanupAuthHeaders(env) },
  );

  if (!response.ok) {
    return { table: tableConfig.table, ok: false, error: `HTTP ${response.status}`, rows: [] };
  }

  const rows = await response.json().catch(() => []);
  return { table: tableConfig.table, ok: true, error: null, rows: Array.isArray(rows) ? rows : [] };
}

async function fetchAdminMediaGallery(env, maxRows = 300) {
  const limit = Math.min(parsePositiveInteger(maxRows, 300), 750);
  const mediaMap = new Map();

  const [assets, r2, tableResults] = await Promise.all([
    hasSupabaseAdmin(env)
      ? fetchPagedRestRows(
          env,
          (offset, pageLimit) => `/media_assets?select=id,couple_id,owner_user_id,feature,asset_role,status,item_id,source_table,logical_row_id,r2_key,byte_size,mime_type,checksum_sha256,updated_at&order=updated_at.desc&limit=${pageLimit}&offset=${offset}`,
          { pageSize: Math.min(limit, 1000), maxPages: 2 },
        ).catch(() => [])
      : [],
    summarizeR2Bucket(env, limit),
    Promise.all(ADMIN_MEDIA_TABLES.map((tableConfig) => fetchAdminMediaRows(env, tableConfig, limit))),
  ]);
  const knownR2Keys = new Set((r2.objects || []).map((object) => object.key));

  for (const asset of assets.slice(0, limit)) {
    addAdminMediaItem(mediaMap, buildAdminMediaItemFromAsset(asset, knownR2Keys));
  }

  for (const object of r2.objects || []) {
    addAdminMediaItem(mediaMap, buildAdminMediaItemFromR2Object(object));
  }

  for (const result of tableResults) {
    const tableConfig = ADMIN_MEDIA_TABLES.find((entry) => entry.table === result.table);
    if (!tableConfig) continue;
    for (const row of result.rows || []) {
      for (const item of buildAdminMediaItemsFromRow(tableConfig, row, knownR2Keys)) {
        addAdminMediaItem(mediaMap, item);
      }
    }
  }

  const items = Array.from(mediaMap.values())
    .sort((a, b) => String(b.updatedAt || b.uploadedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.uploadedAt || a.createdAt || '')))
    .slice(0, limit);

  const totals = items.reduce((acc, item) => {
    acc.total += 1;
    acc.totalBytes += Number(item.byteSize || 0);
    if (item.r2Key) acc.withR2Preview += 1;
    if (item.inlineOnly) acc.inlineOnly += 1;
    if (item.legacyUrl || item.legacyPath) acc.legacyRefs += 1;
    if (item.section === 'journey') acc.journey += 1;
    if (item.section === 'moments') acc.moments += 1;
    if (item.section === 'secret-space') acc.secretSpace += 1;
    return acc;
  }, {
    total: 0,
    journey: 0,
    moments: 0,
    secretSpace: 0,
    withR2Preview: 0,
    inlineOnly: 0,
    legacyRefs: 0,
    totalBytes: 0,
  });

  return {
    generatedAt: new Date().toISOString(),
    limit,
    totals,
    sources: {
      mediaAssets: assets.length,
      r2Objects: r2.summary.object_count,
      tables: tableResults.map(({ table, ok, error, rows }) => ({ table, ok, error, rowCount: rows.length })),
    },
    items,
  };
}

function createAdminUserSummary(userId) {
  return {
    id: userId,
    email: null,
    phone: null,
    createdAt: null,
    lastSignInAt: null,
    lastActivityAt: null,
    coupleIds: [],
    roleByCouple: {},
    rowCount: 0,
    mediaRefCount: 0,
    mediaCount: 0,
    mediaBytes: 0,
    missingMediaCount: 0,
    inlineRefCount: 0,
    legacyRefCount: 0,
    tableCounts: {},
    mediaByFeature: {},
  };
}

function touchAdminUser(users, userId) {
  const normalized = String(userId || '').trim();
  if (!normalized) return null;
  if (!users.has(normalized)) users.set(normalized, createAdminUserSummary(normalized));
  return users.get(normalized);
}

function updateAdminUserActivity(user, timestamp) {
  if (!user || !timestamp) return;
  const iso = (() => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  })();
  if (iso && (!user.lastActivityAt || iso > user.lastActivityAt)) user.lastActivityAt = iso;
}

async function fetchSupabaseAuthUsers(env, maxRows = 1000) {
  if (!hasSupabaseAdmin(env)) return { ok: false, error: 'Supabase admin access is missing.', users: [] };

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users?per_page=${Math.min(parsePositiveInteger(maxRows, 1000), 1000)}&page=1`,
    { method: 'GET', headers: cleanupAuthHeaders(env) },
  );

  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}`, users: [] };
  }

  const payload = await response.json().catch(() => ({}));
  const users = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
  return { ok: true, error: null, users };
}

async function fetchAdminUserTableRows(env, table, maxRows) {
  if (!hasSupabaseAdmin(env)) return { table, ok: false, error: 'Supabase admin access is missing.', rows: [] };

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=*&limit=${parsePositiveInteger(maxRows, 500)}`,
    { method: 'GET', headers: cleanupAuthHeaders(env) },
  );

  if (!response.ok) {
    return { table, ok: false, error: `HTTP ${response.status}`, rows: [] };
  }

  const rows = await response.json().catch(() => []);
  return { table, ok: true, error: null, rows: Array.isArray(rows) ? rows : [] };
}

async function fetchAdminUsers(env, maxRows = 500) {
  const limit = Math.min(parsePositiveInteger(maxRows, 500), 1000);
  const users = new Map();

  const [authUsers, memberships, mediaAssets, tableResults] = await Promise.all([
    fetchSupabaseAuthUsers(env, limit).catch((error) => ({ ok: false, error: String(error), users: [] })),
    hasSupabaseAdmin(env)
      ? fetchPagedRestRows(
          env,
          (offset, pageLimit) => `/couple_memberships?select=couple_id,user_id,role,created_at&limit=${pageLimit}&offset=${offset}`,
          { pageSize: Math.min(limit, 1000), maxPages: 2 },
        ).catch(() => [])
      : [],
    hasSupabaseAdmin(env)
      ? fetchPagedRestRows(
          env,
          (offset, pageLimit) => `/media_assets?select=owner_user_id,couple_id,feature,status,byte_size,updated_at&limit=${pageLimit}&offset=${offset}`,
          { pageSize: Math.min(limit, 1000), maxPages: 4 },
        ).catch(() => [])
      : [],
    Promise.all(ADMIN_APP_DATA_TABLES.map((table) => fetchAdminUserTableRows(env, table, limit).catch((error) => ({
      table,
      ok: false,
      error: String(error instanceof Error ? error.message : error),
      rows: [],
    })))),
  ]);

  for (const authUser of authUsers.users || []) {
    const user = touchAdminUser(users, authUser?.id);
    if (!user) continue;
    user.email = authUser.email || null;
    user.phone = authUser.phone || null;
    user.createdAt = authUser.created_at || null;
    user.lastSignInAt = authUser.last_sign_in_at || null;
    updateAdminUserActivity(user, authUser.last_sign_in_at || authUser.updated_at || authUser.created_at);
  }

  for (const membership of memberships || []) {
    const user = touchAdminUser(users, membership?.user_id);
    if (!user) continue;
    if (membership.couple_id && !user.coupleIds.includes(membership.couple_id)) user.coupleIds.push(membership.couple_id);
    if (membership.couple_id) user.roleByCouple[membership.couple_id] = membership.role || 'member';
    updateAdminUserActivity(user, membership.created_at);
  }

  for (const asset of mediaAssets || []) {
    const user = touchAdminUser(users, asset?.owner_user_id);
    if (!user) continue;
    const feature = asset.feature || 'unknown';
    const bytes = Number(asset.byte_size || 0);
    user.mediaCount += 1;
    user.mediaBytes += bytes;
    if (asset.status === 'missing' || asset.status === 'missing-object') user.missingMediaCount += 1;
    if (asset.couple_id && !user.coupleIds.includes(asset.couple_id)) user.coupleIds.push(asset.couple_id);
    if (!user.mediaByFeature[feature]) user.mediaByFeature[feature] = { feature, count: 0, bytes: 0 };
    user.mediaByFeature[feature].count += 1;
    user.mediaByFeature[feature].bytes += bytes;
    updateAdminUserActivity(user, asset.updated_at);
  }

  for (const result of tableResults) {
    for (const row of result.rows || []) {
      const data = getAdminRowData(row);
      const userId = row?.user_id || data?.ownerUserId || data?.senderId || data?.addedBy || null;
      const user = touchAdminUser(users, userId);
      if (!user) continue;

      const mediaRefs = listAdminMediaRefs(data);
      user.rowCount += 1;
      user.mediaRefCount += mediaRefs.length;
      user.tableCounts[result.table] = (user.tableCounts[result.table] || 0) + 1;
      if (row?.couple_id && !user.coupleIds.includes(row.couple_id)) user.coupleIds.push(row.couple_id);
      user.inlineRefCount += mediaRefs.filter((ref) => ref.kind === 'inline-base64').length;
      user.legacyRefCount += mediaRefs.filter((ref) => ref.kind === 'url' || ref.kind === 'path').length;
      updateAdminUserActivity(user, row?.updated_at || row?.created_at || data?.updatedAt || data?.createdAt || data?.date);
    }
  }

  const items = Array.from(users.values()).map((user) => ({
    ...user,
    coupleIds: user.coupleIds.sort(),
    mediaByFeature: Object.values(user.mediaByFeature).sort((a, b) => b.bytes - a.bytes || b.count - a.count),
    tableCounts: Object.fromEntries(Object.entries(user.tableCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  })).sort((a, b) =>
    String(b.lastActivityAt || b.lastSignInAt || b.createdAt || '').localeCompare(String(a.lastActivityAt || a.lastSignInAt || a.createdAt || ''))
      || Number(b.mediaBytes || 0) - Number(a.mediaBytes || 0)
      || String(a.email || a.id).localeCompare(String(b.email || b.id)));

  const totals = items.reduce((acc, user) => {
    acc.totalUsers += 1;
    acc.totalRows += Number(user.rowCount || 0);
    acc.totalMedia += Number(user.mediaCount || 0);
    acc.totalMediaBytes += Number(user.mediaBytes || 0);
    acc.totalInlineRefs += Number(user.inlineRefCount || 0);
    acc.totalLegacyRefs += Number(user.legacyRefCount || 0);
    acc.totalMissingMedia += Number(user.missingMediaCount || 0);
    return acc;
  }, {
    totalUsers: 0,
    totalRows: 0,
    totalMedia: 0,
    totalMediaBytes: 0,
    totalInlineRefs: 0,
    totalLegacyRefs: 0,
    totalMissingMedia: 0,
  });

  return {
    generatedAt: new Date().toISOString(),
    limit,
    totals,
    sources: {
      authUsers: { ok: authUsers.ok, error: authUsers.error || null, count: authUsers.users?.length || 0 },
      memberships: memberships.length,
      mediaAssets: mediaAssets.length,
      tables: tableResults.map(({ table, ok, error, rows }) => ({ table, ok, error, rowCount: rows.length })),
    },
    users: items.slice(0, limit),
  };
}

async function resolveAdminAlert(env, alertId) {
  const id = String(alertId || '').trim();
  if (!id) throw new Error('Alert id is required');

  await supabaseRequest(env, `/storage_alerts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'resolved' }),
  });

  await insertAdminActionEvent(env, 'alert_resolved', { id, sourceTable: 'storage_alerts' });
  return { id, status: 'resolved' };
}

async function retryAdminCleanupTask(env, taskId) {
  const id = String(taskId || '').trim();
  if (!id) throw new Error('Cleanup task id is required');

  await supabaseRequest(env, `/media_cleanup_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'pending',
      run_after: new Date().toISOString(),
      completed_at: null,
      last_error: null,
    }),
  });

  await insertAdminActionEvent(env, 'cleanup_task_retried', { id, sourceTable: 'media_cleanup_tasks' });
  return { id, status: 'pending' };
}

async function verifyAdminMedia(env, r2Key) {
  const key = sanitizeKey(String(r2Key || ''));
  if (!key || !isManagedWriteKey(key)) throw new Error('A valid managed R2 key is required');

  const parsed = parseManagedMediaKey(key);
  const [head, assetRows] = await Promise.all([
    env.LIOR_BUCKET ? env.LIOR_BUCKET.head(key) : null,
    hasSupabaseAdmin(env)
      ? supabaseRequest(
          env,
          `/media_assets?r2_key=eq.${encodeURIComponent(key)}&select=id,status,byte_size,mime_type,checksum_sha256,updated_at,couple_id,owner_user_id,feature,asset_role,item_id&limit=1`,
          { method: 'GET' },
        ).catch(() => [])
      : [],
  ]);

  const asset = Array.isArray(assetRows) ? assetRows[0] || null : null;
  const result = {
    r2Key: key,
    exists: !!head,
    r2Size: head?.size ?? null,
    r2Etag: head?.etag || head?.httpEtag || null,
    r2Uploaded: head?.uploaded ? new Date(head.uploaded).toISOString() : null,
    asset,
    parsed,
    sizeMatches: !!head && !!asset ? Number(asset.byte_size || 0) === Number(head.size || 0) : null,
    indexStatus: asset?.status || null,
  };

  await insertAdminActionEvent(env, 'media_verified', {
    r2Key: key,
    coupleId: parsed?.coupleId || asset?.couple_id || null,
    feature: parsed?.feature || asset?.feature || null,
    exists: result.exists,
    sizeMatches: result.sizeMatches,
  }, result.exists ? 'info' : 'warning');

  return result;
}

async function fetchRestTableCount(env, table) {
  if (!hasSupabaseAdmin(env)) return null;

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=*&limit=1`,
    {
      method: 'GET',
      headers: {
        ...cleanupAuthHeaders(env),
        Prefer: 'count=exact',
      },
    },
  );

  if (!response.ok) {
    return { table, count: null, ok: false, error: `HTTP ${response.status}` };
  }

  const contentRange = response.headers.get('Content-Range') || '';
  const total = Number(contentRange.split('/').pop());
  return {
    table,
    count: Number.isFinite(total) ? total : null,
    ok: true,
    error: null,
  };
}

async function fetchAdminDataHealth(env, r2Summary, overview) {
  const configIssues = [];
  if (!env.LIOR_BUCKET) configIssues.push('LIOR_BUCKET binding is missing.');
  if (!env.SUPABASE_URL) configIssues.push('SUPABASE_URL secret is missing.');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) configIssues.push('SUPABASE_SERVICE_ROLE_KEY secret is missing in Cloudflare Worker.');
  if (!env.CLEANUP_INTERNAL_TOKEN) configIssues.push('CLEANUP_INTERNAL_TOKEN secret is missing.');

  const tableCounts = hasSupabaseAdmin(env)
    ? await Promise.all(ADMIN_DATA_TABLES.map((table) => fetchRestTableCount(env, table).catch((error) => ({
        table,
        count: null,
        ok: false,
        error: String(error instanceof Error ? error.message : error),
      }))))
    : [];

  const indexedObjectCount = Number(overview?.total_assets || 0);
  const r2ObjectCount = Number(r2Summary?.object_count || 0);

  return {
    configIssues,
    tableCounts,
    dataCoverage: {
      r2ObjectCount,
      indexedObjectCount,
      unindexedR2Objects: Math.max(0, r2ObjectCount - indexedObjectCount),
      mediaIndexCoveragePct: r2ObjectCount > 0 ? Math.round((indexedObjectCount / r2ObjectCount) * 1000) / 10 : null,
    },
  };
}

async function fetchAdminAppTableInventory(env, table, maxRows = 5) {
  if (!hasSupabaseAdmin(env)) {
    return { table, count: null, ok: false, error: 'Supabase admin access is missing.', recent: [] };
  }

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=*&limit=${parsePositiveInteger(maxRows, 5)}`,
    {
      method: 'GET',
      headers: {
        ...cleanupAuthHeaders(env),
        Prefer: 'count=exact',
      },
    },
  );

  const contentRange = response.headers.get('Content-Range') || '';
  const total = Number(contentRange.split('/').pop());
  const count = Number.isFinite(total) ? total : null;

  if (!response.ok) {
    return { table, count, ok: false, error: `HTTP ${response.status}`, recent: [] };
  }

  const rows = await response.json().catch(() => []);
  return {
    table,
    count,
    ok: true,
    error: null,
    recent: Array.isArray(rows) ? rows.map((row) => summarizeAdminRow(table, row)) : [],
  };
}

async function fetchAdminAppDataInventory(env, maxRows = 5) {
  const tables = await Promise.all(
    ADMIN_APP_DATA_TABLES.map((table) => fetchAdminAppTableInventory(env, table, maxRows).catch((error) => ({
      table,
      count: null,
      ok: false,
      error: String(error instanceof Error ? error.message : error),
      recent: [],
    }))),
  );

  const totals = tables.reduce((acc, table) => {
    if (table.ok) acc.available_tables += 1;
    else acc.unavailable_tables += 1;
    acc.total_rows += Number(table.count || 0);
    acc.recent_rows += table.recent.length;
    acc.media_refs += table.recent.reduce((sum, row) => sum + Number(row.media_ref_count || 0), 0);
    return acc;
  }, {
    available_tables: 0,
    unavailable_tables: 0,
    total_rows: 0,
    recent_rows: 0,
    media_refs: 0,
  });

  return { totals, tables };
}

async function fetchAdminCleanupTasks(env, maxRows = 25) {
  if (!hasSupabaseAdmin(env)) return [];

  const response = await supabaseRequest(
    env,
    `/media_cleanup_tasks?select=id,source_table,logical_item_id,couple_id,feature,status,attempts,last_error,run_after,created_at,completed_at&order=created_at.desc&limit=${parsePositiveInteger(maxRows, 25)}`,
    { method: 'GET' },
  );
  return Array.isArray(response) ? response : [];
}

async function summarizeR2Bucket(env, maxObjects = 40) {
  if (!env.LIOR_BUCKET) {
    return {
      summary: { object_count: 0, total_bytes: 0, managed_count: 0, unmanaged_count: 0, latest_uploaded_at: null, usage: [] },
      objects: [],
    };
  }

  const objects = [];
  const usageMap = new Map();
  let cursor = undefined;
  let objectCount = 0;
  let managedCount = 0;
  let unmanagedCount = 0;
  let totalBytes = 0;
  let latestUploadedAt = null;

  do {
    const page = await env.LIOR_BUCKET.list({ cursor });
    for (const object of page.objects || []) {
      objectCount += 1;
      const byteSize = Number(object.size || 0);
      totalBytes += byteSize;
      const parsed = parseManagedMediaKey(object.key);
      const feature = parsed?.feature || 'unmanaged';
      if (parsed) managedCount += 1;
      else unmanagedCount += 1;

      if (!usageMap.has(feature)) {
        usageMap.set(feature, {
          feature,
          object_count: 0,
          total_bytes: 0,
          couple_count: new Set(),
        });
      }
      const usage = usageMap.get(feature);
      usage.object_count += 1;
      usage.total_bytes += byteSize;
      if (parsed?.coupleId) usage.couple_count.add(parsed.coupleId);

      const uploadedAt = object.uploaded ? new Date(object.uploaded).toISOString() : null;
      if (uploadedAt && (!latestUploadedAt || uploadedAt > latestUploadedAt)) {
        latestUploadedAt = uploadedAt;
      }

      objects.push({
        key: object.key,
        size: byteSize,
        uploaded: uploadedAt,
        etag: object.etag || object.httpEtag || null,
        feature,
        couple_id: parsed?.coupleId || null,
        owner_user_id: parsed?.ownerUserId || null,
        asset_role: parsed?.assetRole || null,
        item_id: parsed?.itemId || null,
        managed: !!parsed,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  objects.sort((a, b) => String(b.uploaded || '').localeCompare(String(a.uploaded || '')));

  return {
    summary: {
      object_count: objectCount,
      total_bytes: totalBytes,
      managed_count: managedCount,
      unmanaged_count: unmanagedCount,
      latest_uploaded_at: latestUploadedAt,
      usage: Array.from(usageMap.values()).map((entry) => ({
        feature: entry.feature,
        object_count: entry.object_count,
        total_bytes: entry.total_bytes,
        couple_count: entry.couple_count.size,
      })).sort(sortFeatureUsage),
    },
    objects: objects.slice(0, parsePositiveInteger(maxObjects, 40)),
  };
}

async function buildAdminOverviewFallback(env) {
  const [mediaAssets, openAlerts, cleanupTasks] = await Promise.all([
    fetchPagedRestRows(
      env,
      (offset, limit) => `/media_assets?select=couple_id,feature,status,byte_size&order=updated_at.desc&limit=${limit}&offset=${offset}`,
      { pageSize: 1000, maxPages: 25 },
    ),
    fetchPagedRestRows(
      env,
      (offset, limit) => `/storage_alerts?select=id&status=eq.open&order=last_seen_at.desc&limit=${limit}&offset=${offset}`,
      { pageSize: 1000, maxPages: 10 },
    ),
    fetchPagedRestRows(
      env,
      (offset, limit) => `/media_cleanup_tasks?select=id&status=in.(pending,processing)&order=created_at.asc&limit=${limit}&offset=${offset}`,
      { pageSize: 1000, maxPages: 10 },
    ),
  ]);

  const usageMap = new Map();
  const coupleIds = new Set();
  let totalBytes = 0;
  let readyAssets = 0;
  let pendingAssets = 0;
  let missingAssets = 0;
  let orphanedAssets = 0;

  for (const asset of mediaAssets) {
    if (asset.couple_id) coupleIds.add(asset.couple_id);
    const feature = asset.feature || 'unknown';
    if (!usageMap.has(feature)) {
      usageMap.set(feature, {
        feature,
        object_count: 0,
        total_bytes: 0,
        missing_count: 0,
        couple_count: new Set(),
      });
    }

    const usage = usageMap.get(feature);
    usage.object_count += 1;
    if (asset.couple_id) usage.couple_count.add(asset.couple_id);

    const byteSize = Number(asset.byte_size || 0);
    if (['pending', 'ready', 'missing'].includes(asset.status)) {
      usage.total_bytes += byteSize;
      totalBytes += byteSize;
    }
    if (asset.status === 'missing') {
      usage.missing_count += 1;
      missingAssets += 1;
    } else if (asset.status === 'ready') {
      readyAssets += 1;
    } else if (asset.status === 'pending') {
      pendingAssets += 1;
    } else if (asset.status === 'orphaned') {
      orphanedAssets += 1;
    }
  }

  const usage = Array.from(usageMap.values())
    .map((entry) => ({
      feature: entry.feature,
      object_count: entry.object_count,
      total_bytes: entry.total_bytes,
      missing_count: entry.missing_count,
      couple_count: entry.couple_count.size,
    }))
    .sort(sortFeatureUsage);

  return {
    total_couples: coupleIds.size,
    total_assets: mediaAssets.length,
    ready_assets: readyAssets,
    pending_assets: pendingAssets,
    missing_assets: missingAssets,
    orphaned_assets: orphanedAssets,
    total_bytes: totalBytes,
    open_alerts: openAlerts.length,
    cleanup_backlog: cleanupTasks.length,
    usage,
  };
}

async function fetchAdminOverview(env) {
  try {
    return await runRpc(env, 'admin_storage_overview', {});
  } catch {
    return buildAdminOverviewFallback(env);
  }
}

async function fetchAdminCoupleUsage(env, maxRows = 25) {
  try {
    const response = await runRpc(env, 'admin_storage_couple_usage', { max_rows: maxRows });
    return Array.isArray(response) ? response : [];
  } catch {
    const [mediaAssets, openAlerts, cleanupTasks] = await Promise.all([
      fetchPagedRestRows(
        env,
        (offset, limit) => `/media_assets?select=couple_id,status,byte_size,updated_at&order=updated_at.desc&limit=${limit}&offset=${offset}`,
        { pageSize: 1000, maxPages: 25 },
      ),
      fetchPagedRestRows(
        env,
        (offset, limit) => `/storage_alerts?select=couple_id&status=eq.open&order=last_seen_at.desc&limit=${limit}&offset=${offset}`,
        { pageSize: 1000, maxPages: 10 },
      ),
      fetchPagedRestRows(
        env,
        (offset, limit) => `/media_cleanup_tasks?select=couple_id&status=in.(pending,processing)&order=created_at.asc&limit=${limit}&offset=${offset}`,
        { pageSize: 1000, maxPages: 10 },
      ),
    ]);

    const couples = new Map();

    for (const asset of mediaAssets) {
      if (!asset.couple_id) continue;
      if (!couples.has(asset.couple_id)) {
        couples.set(asset.couple_id, {
          couple_id: asset.couple_id,
          object_count: 0,
          total_bytes: 0,
          missing_count: 0,
          open_alerts: 0,
          cleanup_backlog: 0,
          last_asset_update_at: null,
        });
      }
      const entry = couples.get(asset.couple_id);
      entry.object_count += 1;
      if (['pending', 'ready', 'missing'].includes(asset.status)) {
        entry.total_bytes += Number(asset.byte_size || 0);
      }
      if (asset.status === 'missing') entry.missing_count += 1;
      if (!entry.last_asset_update_at || new Date(asset.updated_at).getTime() > new Date(entry.last_asset_update_at).getTime()) {
        entry.last_asset_update_at = asset.updated_at;
      }
    }

    for (const alert of openAlerts) {
      if (!alert.couple_id || !couples.has(alert.couple_id)) continue;
      couples.get(alert.couple_id).open_alerts += 1;
    }

    for (const task of cleanupTasks) {
      if (!task.couple_id || !couples.has(task.couple_id)) continue;
      couples.get(task.couple_id).cleanup_backlog += 1;
    }

    return Array.from(couples.values())
      .sort((a, b) => b.total_bytes - a.total_bytes || b.object_count - a.object_count)
      .slice(0, parsePositiveInteger(maxRows, 25));
  }
}

async function fetchAdminMetrics(env, daysBack = 14) {
  try {
    const response = await runRpc(env, 'admin_storage_metrics', { days_back: daysBack });
    return Array.isArray(response) ? response : [];
  } catch {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - parsePositiveInteger(daysBack, 14));
    const cutoffIso = cutoffDate.toISOString().slice(0, 10);
    const metricRows = await fetchPagedRestRows(
      env,
      (offset, limit) => `/storage_metrics_daily?select=metric_date,feature,object_count,total_bytes,missing_object_count,orphan_object_count,legacy_ref_count,expired_row_count,alert_count&metric_date=gte.${cutoffIso}&order=metric_date.desc&limit=${limit}&offset=${offset}`,
      { pageSize: 1000, maxPages: 10 },
    );

    const grouped = new Map();
    for (const row of metricRows) {
      const key = `${row.metric_date}:${row.feature}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          metric_date: row.metric_date,
          feature: row.feature,
          object_count: 0,
          total_bytes: 0,
          missing_object_count: 0,
          orphan_object_count: 0,
          legacy_ref_count: 0,
          expired_row_count: 0,
          alert_count: 0,
        });
      }
      const entry = grouped.get(key);
      entry.object_count += Number(row.object_count || 0);
      entry.total_bytes += Number(row.total_bytes || 0);
      entry.missing_object_count += Number(row.missing_object_count || 0);
      entry.orphan_object_count += Number(row.orphan_object_count || 0);
      entry.legacy_ref_count += Number(row.legacy_ref_count || 0);
      entry.expired_row_count += Number(row.expired_row_count || 0);
      entry.alert_count += Number(row.alert_count || 0);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      String(b.metric_date).localeCompare(String(a.metric_date))
        || Number(b.total_bytes || 0) - Number(a.total_bytes || 0)
        || String(a.feature || '').localeCompare(String(b.feature || '')));
  }
}

async function fetchAdminRecentAssets(env, maxRows = 25) {
  const response = await supabaseRequest(
    env,
    `/media_assets?select=id,couple_id,owner_user_id,feature,asset_role,status,item_id,source_table,logical_row_id,r2_key,byte_size,mime_type,checksum_sha256,updated_at&order=updated_at.desc&limit=${parsePositiveInteger(maxRows, 25)}`,
    { method: 'GET' },
  );
  return Array.isArray(response) ? response : [];
}

async function fetchAdminOpenAlerts(env, maxRows = 20) {
  const response = await supabaseRequest(
    env,
    `/storage_alerts?select=id,couple_id,feature,alert_type,severity,title,details,status,occurrence_count,last_seen_at&status=eq.open&order=last_seen_at.desc&limit=${parsePositiveInteger(maxRows, 20)}`,
    { method: 'GET' },
  );
  return Array.isArray(response) ? response : [];
}

async function fetchAdminRecentEvents(env, maxRows = 20) {
  const response = await supabaseRequest(
    env,
    `/storage_events?select=id,couple_id,feature,severity,event_type,r2_key,source_table,logical_row_id,metadata,created_at&order=created_at.desc&limit=${parsePositiveInteger(maxRows, 20)}`,
    { method: 'GET' },
  );
  return Array.isArray(response) ? response : [];
}

async function buildAdminOverview(env, options = {}) {
  const assetsLimit = parsePositiveInteger(options.assetsLimit, 25);
  const alertsLimit = parsePositiveInteger(options.alertsLimit, 20);
  const eventsLimit = parsePositiveInteger(options.eventsLimit, 20);
  const couplesLimit = parsePositiveInteger(options.couplesLimit, 25);
  const daysBack = parsePositiveInteger(options.daysBack, 14);
  const r2ObjectsLimit = parsePositiveInteger(options.r2ObjectsLimit, 40);
  const appRowsLimit = parsePositiveInteger(options.appRowsLimit, 5);

  const r2 = await summarizeR2Bucket(env, r2ObjectsLimit);

  const [overview, couples, assets, alerts, events, metrics, cleanupTasks, appData] = hasSupabaseAdmin(env)
    ? await Promise.all([
        fetchAdminOverview(env),
        fetchAdminCoupleUsage(env, couplesLimit),
        fetchAdminRecentAssets(env, assetsLimit),
        fetchAdminOpenAlerts(env, alertsLimit),
        fetchAdminRecentEvents(env, eventsLimit),
        fetchAdminMetrics(env, daysBack),
        fetchAdminCleanupTasks(env, 25),
        fetchAdminAppDataInventory(env, appRowsLimit),
      ])
    : [
        {
          ...buildEmptyAdminOverview(),
          total_assets: r2.summary.object_count,
          ready_assets: r2.summary.managed_count,
          orphaned_assets: r2.summary.unmanaged_count,
          total_bytes: r2.summary.total_bytes,
          usage: r2.summary.usage.map((entry) => ({
            feature: entry.feature,
            object_count: entry.object_count,
            total_bytes: entry.total_bytes,
            missing_count: 0,
            couple_count: entry.couple_count,
          })),
        },
        [],
        [],
        [],
        [],
        [],
        [],
        { totals: { available_tables: 0, unavailable_tables: ADMIN_APP_DATA_TABLES.length, total_rows: 0, recent_rows: 0, media_refs: 0 }, tables: [] },
      ];

  const health = await fetchAdminDataHealth(env, r2.summary, overview);

  return {
    generatedAt: new Date().toISOString(),
    worker: {
      bucketConfigured: !!env.LIOR_BUCKET,
      supabaseConfigured: hasSupabaseAdmin(env),
      cleanupTokenConfigured: !!env.CLEANUP_INTERNAL_TOKEN,
      adminTokenConfigured: !!env.ADMIN_DASHBOARD_TOKEN,
    },
    overview,
    couples,
    assets,
    alerts,
    events,
    metrics,
    cleanupTasks,
    r2,
    health,
    appData,
  };
}

async function enqueueExpiredDailyPhotos(env) {
  const response = await supabaseRequest(
    env,
    '/rpc/enqueue_expired_daily_photo_cleanup',
    {
      method: 'POST',
      body: JSON.stringify({ batch_size: CLEANUP_BATCH_SIZE }),
    },
  );

  const first = Array.isArray(response) ? response[0] : response;
  return {
    queued: Number(first?.queued_count || 0),
    deletedRows: Number(first?.deleted_count || 0),
  };
}

async function claimCleanupTasks(env) {
  const response = await supabaseRequest(
    env,
    '/rpc/claim_media_cleanup_tasks',
    {
      method: 'POST',
      body: JSON.stringify({ target_feature: CLEANUP_FEATURE, batch_size: CLEANUP_BATCH_SIZE }),
    },
  );

  return Array.isArray(response) ? response : [];
}

async function patchCleanupTask(env, taskId, payload) {
  await supabaseRequest(
    env,
    `/media_cleanup_tasks?id=eq.${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    },
  );
}

async function pruneCompletedCleanupTasks(env) {
  const cutoff = new Date(Date.now() - COMPLETED_TASK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/media_cleanup_tasks?status=eq.completed&completed_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: 'DELETE',
      headers: {
        ...cleanupAuthHeaders(env),
        Prefer: 'return=representation',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cleanup task prune failed (${response.status}): ${body}`);
  }

  const deleted = await response.json().catch(() => []);
  return Array.isArray(deleted) ? deleted.length : 0;
}

function getBackoffMs(attempts) {
  const multiplier = Math.max(0, attempts - 1);
  return Math.min(60 * 60 * 1000, 5 * 60 * 1000 * (2 ** multiplier));
}

async function deleteAndVerify(env, key) {
  await env.LIOR_BUCKET.delete(key);
  const probe = await env.LIOR_BUCKET.head(key);
  return !probe;
}

async function fetchLegacyMediaPayload(env, storagePath) {
  if (!storagePath || typeof storagePath !== 'string' || storagePath.startsWith('data:')) {
    return null;
  }

  const parsedRef = parseSupabaseStorageRef(storagePath);
  const candidates = [];
  if (parsedRef?.absoluteUrl) {
    candidates.push({
      url: parsedRef.absoluteUrl,
      headers: parsedRef.isPublic ? {} : cleanupAuthHeaders(env),
    });
  }

  if (parsedRef?.bucket && parsedRef?.key) {
    candidates.push({
      url: `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/authenticated/${encodePathSegments(parsedRef.bucket)}/${encodePathSegments(parsedRef.key)}`,
      headers: cleanupAuthHeaders(env),
    });
    candidates.push({
      url: `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${encodePathSegments(parsedRef.bucket)}/${encodePathSegments(parsedRef.key)}`,
      headers: {},
    });
  } else {
    const absoluteUrl = tryParseUrl(storagePath);
    if (absoluteUrl) {
      candidates.push({ url: absoluteUrl.toString(), headers: {} });
    } else {
      const key = stripLeadingSlash(storagePath);
      for (const bucket of LEGACY_SUPABASE_BUCKETS) {
        candidates.push({
          url: `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/authenticated/${encodePathSegments(bucket)}/${encodePathSegments(key)}`,
          headers: cleanupAuthHeaders(env),
        });
        candidates.push({
          url: `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${encodePathSegments(bucket)}/${encodePathSegments(key)}`,
          headers: {},
        });
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { method: 'GET', headers: candidate.headers });
      if (!response.ok) continue;
      return {
        buffer: await response.arrayBuffer(),
        contentType: normalizeMimeType(response.headers.get('Content-Type') || 'application/octet-stream'),
      };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function deleteLegacyMediaSource(env, storagePath) {
  if (!storagePath || typeof storagePath !== 'string' || storagePath.startsWith('data:')) return false;

  const parsedRef = parseSupabaseStorageRef(storagePath);
  const targets = [];
  if (parsedRef?.bucket && parsedRef?.key) {
    targets.push({ bucket: parsedRef.bucket, key: parsedRef.key });
  } else if (!tryParseUrl(storagePath)) {
    const key = stripLeadingSlash(storagePath);
    for (const bucket of LEGACY_SUPABASE_BUCKETS) {
      targets.push({ bucket, key });
    }
  }

  if (targets.length === 0) return false;

  let deleted = false;
  for (const target of targets) {
    try {
      const response = await fetch(
        `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${encodePathSegments(target.bucket)}/${encodePathSegments(target.key)}`,
        {
          method: 'DELETE',
          headers: cleanupAuthHeaders(env),
        },
      );
      if (response.ok || response.status === 404) {
        deleted = true;
      }
    } catch {
      // Best-effort legacy cleanup only.
    }
  }

  return deleted;
}

async function patchSourceRowData(env, sourceTable, rowId, data) {
  await supabaseRequest(
    env,
    `/${sourceTable}?id=eq.${encodeURIComponent(rowId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data }),
    },
  );
}

async function processCleanupTask(env, task) {
  const rawPaths = Array.isArray(task.storage_paths) ? task.storage_paths : [];
  const invalidPaths = [];
  const keys = [];

  for (const rawPath of rawPaths) {
    const key = extractManagedKey(rawPath);
    if (!key || !isCleanupEligibleKey(key)) {
      invalidPaths.push(rawPath);
      continue;
    }
    if (!keys.includes(key)) keys.push(key);
  }

  try {
    for (const key of keys) {
      const deleted = await deleteAndVerify(env, key);
      if (!deleted) {
        throw new Error(`Failed to verify deletion for ${key}`);
      }
      await deleteMediaAssetByKey(env, key);
    }

    await patchCleanupTask(env, task.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      last_error: invalidPaths.length > 0 ? `Skipped ${invalidPaths.length} invalid path(s)` : null,
    });

    return {
      deleted: keys.length,
      skipped: invalidPaths.length,
      failed: false,
    };
  } catch (error) {
    const attempts = Number(task.attempts || 0);
    const nextStatus = attempts >= MAX_CLEANUP_ATTEMPTS ? 'failed' : 'pending';
    const nextRunAfter = new Date(Date.now() + getBackoffMs(attempts)).toISOString();
    const message = String(error instanceof Error ? error.message : error);

    await patchCleanupTask(env, task.id, {
      status: nextStatus,
      run_after: nextRunAfter,
      last_error: message,
      completed_at: null,
    });
    await insertStorageEvent(env, {
      couple_id: task.couple_id ?? null,
      feature: task.feature ?? null,
      severity: 'error',
      event_type: 'cleanup.task_failed',
      source_table: task.source_table ?? null,
      logical_row_id: task.logical_item_id ?? task.source_row_id ?? null,
      metadata: { taskId: task.id, message, attempts },
    }).catch(() => {});
    await upsertStorageAlert(env, {
      couple_id: task.couple_id ?? null,
      feature: task.feature ?? null,
      alert_type: 'cleanup.task_failed',
      severity: 'error',
      fingerprint: `cleanup.task_failed:${task.id}`,
      title: 'Cleanup task failed',
      details: { taskId: task.id, message, attempts },
    }).catch(() => {});

    return {
      deleted: 0,
      skipped: invalidPaths.length,
      failed: true,
    };
  }
}

async function fetchActiveDailyMomentKeys(env) {
  if (!hasSupabaseAdmin(env)) return new Set();
  const rows = await fetchPagedRestRows(
    env,
    (offset, limit) => `/daily_photos?select=data&limit=${limit}&offset=${offset}`,
    { pageSize: 1000, maxPages: 10 },
  ).catch(() => []);

  const keys = new Set();
  for (const row of rows) {
    const data = row?.data && typeof row.data === 'object' ? row.data : {};
    for (const field of ['storagePath', 'videoStoragePath', 'image', 'video']) {
      const key = extractManagedKey(data[field]);
      if (key && isCleanupEligibleKey(key)) keys.add(key);
    }
  }
  return keys;
}

async function deleteExpiredOrphanDailyMomentObjects(env) {
  if (!env.LIOR_BUCKET || !Number.isFinite(CLEANUP_FEATURE_RETENTION_MS)) {
    return { scanned: 0, deleted: 0, skippedActive: 0, skippedFresh: 0, failed: 0 };
  }

  const activeKeys = await fetchActiveDailyMomentKeys(env);
  const cutoffMs = Date.now() - CLEANUP_FEATURE_RETENTION_MS;
  let cursor = undefined;
  let scanned = 0;
  let deleted = 0;
  let skippedActive = 0;
  let skippedFresh = 0;
  let failed = 0;

  do {
    const page = await env.LIOR_BUCKET.list({ prefix: 'v2/couples/', cursor });
    for (const object of page.objects || []) {
      const parsed = parseManagedMediaKey(object.key);
      if (parsed?.feature !== CLEANUP_FEATURE) continue;
      scanned += 1;
      if (activeKeys.has(object.key)) {
        skippedActive += 1;
        continue;
      }
      const uploadedMs = object.uploaded ? new Date(object.uploaded).getTime() : 0;
      if (uploadedMs && uploadedMs > cutoffMs) {
        skippedFresh += 1;
        continue;
      }
      try {
        const verified = await deleteAndVerify(env, object.key);
        if (!verified) failed += 1;
        else deleted += 1;
      } catch {
        failed += 1;
      }
      if (deleted + failed >= ORPHAN_DAILY_OBJECT_CLEANUP_BATCH_SIZE) {
        return { scanned, deleted, skippedActive, skippedFresh, failed };
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { scanned, deleted, skippedActive, skippedFresh, failed };
}

async function listAllManagedKeys(env) {
  const keys = [];
  let cursor = undefined;
  do {
    const page = await env.LIOR_BUCKET.list({ prefix: 'v2/couples/', cursor });
    for (const object of page.objects || []) {
      keys.push(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function runAudit(env) {
  if (!hasSupabaseAdmin(env)) {
    return { missingAssets: 0, orphanedObjects: 0, legacyRefs: 0, expiredRows: 0, repeatedMissingReads: 0 };
  }

  const assets = await listMediaAssets(env);
  const assetKeys = new Set(assets.map((asset) => asset.r2_key).filter(Boolean));
  const metricsByGroup = new Map();
  let missingAssets = 0;

  for (const asset of assets) {
    const metricKey = `${asset.couple_id || 'unknown'}:${asset.feature || 'unknown'}`;
    if (!metricsByGroup.has(metricKey)) {
      metricsByGroup.set(metricKey, {
        couple_id: asset.couple_id ?? null,
        feature: asset.feature ?? 'unknown',
        object_count: 0,
        total_bytes: 0,
        missing_object_count: 0,
        orphan_object_count: 0,
        legacy_ref_count: 0,
        expired_row_count: 0,
        alert_count: 0,
      });
    }
    const group = metricsByGroup.get(metricKey);
    group.object_count += 1;
    group.total_bytes += Number(asset.byte_size || 0);

    const head = await env.LIOR_BUCKET.head(asset.r2_key);
    if (!head) {
      missingAssets += 1;
      group.missing_object_count += 1;
      await patchMediaAssetByKey(env, asset.r2_key, {
        status: 'missing',
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      await insertStorageEvent(env, {
        couple_id: asset.couple_id ?? null,
        feature: asset.feature ?? null,
        severity: 'error',
        event_type: 'audit.missing_object',
        r2_key: asset.r2_key,
        source_table: asset.source_table,
        logical_row_id: asset.logical_row_id,
        metadata: { assetId: asset.id },
      }).catch(() => {});
      await upsertStorageAlert(env, {
        couple_id: asset.couple_id ?? null,
        feature: asset.feature ?? null,
        alert_type: 'missing_object',
        severity: 'error',
        fingerprint: `missing_object:${asset.r2_key}`,
        title: 'Referenced media object is missing from R2',
        details: { r2Key: asset.r2_key, sourceTable: asset.source_table, logicalRowId: asset.logical_row_id },
      }).catch(() => {});
    } else if (asset.status !== 'ready') {
      await patchMediaAssetByKey(env, asset.r2_key, {
        status: 'ready',
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  const bucketKeys = await listAllManagedKeys(env);
  let orphanedObjects = 0;
  const orphanGroups = new Map();
  for (const key of bucketKeys) {
    if (assetKeys.has(key)) continue;
    orphanedObjects += 1;
    const parsed = parseManagedMediaKey(key);
    const groupKey = `${parsed?.coupleId || 'unknown'}:${parsed?.feature || 'unknown'}`;
    if (!metricsByGroup.has(groupKey)) {
      metricsByGroup.set(groupKey, {
        couple_id: parsed?.coupleId ?? null,
        feature: parsed?.feature ?? 'unknown',
        object_count: 0,
        total_bytes: 0,
        missing_object_count: 0,
        orphan_object_count: 0,
        legacy_ref_count: 0,
        expired_row_count: 0,
        alert_count: 0,
      });
    }
    metricsByGroup.get(groupKey).orphan_object_count += 1;
    if (!orphanGroups.has(groupKey)) {
      orphanGroups.set(groupKey, {
        couple_id: parsed?.coupleId ?? null,
        feature: parsed?.feature ?? null,
        count: 0,
        sample_keys: [],
      });
    }
    const orphanGroup = orphanGroups.get(groupKey);
    orphanGroup.count += 1;
    if (orphanGroup.sample_keys.length < 8) orphanGroup.sample_keys.push(key);
  }

  for (const [groupKey, group] of orphanGroups.entries()) {
    await upsertStorageAlert(env, {
      couple_id: group.couple_id,
      feature: group.feature,
      alert_type: 'orphaned_object',
      severity: 'warning',
      fingerprint: `orphaned_object_group:${groupKey}`,
      title: 'R2 objects have no media_assets rows',
      details: { count: group.count, sampleKeys: group.sample_keys },
    }).catch(() => {});
  }

  const legacyRefs = await runRpc(env, 'storage_audit_legacy_refs', { max_rows: 200 }).catch(() => []);
  const legacyGroups = new Map();
  for (const ref of legacyRefs || []) {
    const groupKey = `${ref.couple_id || 'unknown'}:${ref.feature || 'unknown'}`;
    if (!metricsByGroup.has(groupKey)) {
      metricsByGroup.set(groupKey, {
        couple_id: ref.couple_id ?? null,
        feature: ref.feature ?? 'unknown',
        object_count: 0,
        total_bytes: 0,
        missing_object_count: 0,
        orphan_object_count: 0,
        legacy_ref_count: 0,
        expired_row_count: 0,
        alert_count: 0,
      });
    }
    metricsByGroup.get(groupKey).legacy_ref_count += 1;
    const alertKey = `${ref.couple_id || 'unknown'}:${ref.feature || 'unknown'}:${ref.source_table}`;
    if (!legacyGroups.has(alertKey)) {
      legacyGroups.set(alertKey, {
        couple_id: ref.couple_id ?? null,
        feature: ref.feature ?? null,
        source_table: ref.source_table,
        count: 0,
        sample_refs: [],
      });
    }
    const legacyGroup = legacyGroups.get(alertKey);
    legacyGroup.count += 1;
    if (legacyGroup.sample_refs.length < 8) {
      legacyGroup.sample_refs.push({
        logicalRowId: ref.logical_row_id,
        fieldName: ref.field_name,
        storagePath: ref.storage_path,
      });
    }
  }

  for (const [alertKey, group] of legacyGroups.entries()) {
    await upsertStorageAlert(env, {
      couple_id: group.couple_id,
      feature: group.feature,
      alert_type: 'legacy_storage_ref',
      severity: 'warning',
      fingerprint: `legacy_ref_group:${alertKey}`,
      title: 'Legacy storage paths still present',
      details: { sourceTable: group.source_table, count: group.count, sampleRefs: group.sample_refs },
    }).catch(() => {});
  }

  const expiredRows = await runRpc(env, 'storage_audit_expired_daily_photos', { max_rows: 200 }).catch(() => []);
  const expiredGroups = new Map();
  for (const row of expiredRows || []) {
    const groupKey = `${row.couple_id || 'unknown'}:${CLEANUP_FEATURE}`;
    if (!metricsByGroup.has(groupKey)) {
      metricsByGroup.set(groupKey, {
        couple_id: row.couple_id ?? null,
        feature: CLEANUP_FEATURE,
        object_count: 0,
        total_bytes: 0,
        missing_object_count: 0,
        orphan_object_count: 0,
        legacy_ref_count: 0,
        expired_row_count: 0,
        alert_count: 0,
      });
    }
    metricsByGroup.get(groupKey).expired_row_count += 1;
    if (!expiredGroups.has(groupKey)) {
      expiredGroups.set(groupKey, {
        couple_id: row.couple_id ?? null,
        count: 0,
        sample_rows: [],
      });
    }
    const expiredGroup = expiredGroups.get(groupKey);
    expiredGroup.count += 1;
    if (expiredGroup.sample_rows.length < 8) {
      expiredGroup.sample_rows.push({ rowId: row.row_id, logicalRowId: row.logical_row_id, expiresAt: row.expires_at });
    }
  }

  for (const [groupKey, group] of expiredGroups.entries()) {
    await upsertStorageAlert(env, {
      couple_id: group.couple_id,
      feature: CLEANUP_FEATURE,
      alert_type: 'expired_daily_row',
      severity: 'error',
      fingerprint: `expired_daily_row_group:${groupKey}`,
      title: 'Expired daily moment rows still exist',
      details: { count: group.count, sampleRows: group.sample_rows },
    }).catch(() => {});
  }

  const repeatedMissingReads = await runRpc(env, 'storage_audit_repeated_missing_reads', { max_rows: 200 }).catch(() => []);
  for (const event of repeatedMissingReads || []) {
    await upsertStorageAlert(env, {
      couple_id: event.couple_id ?? null,
      feature: event.feature ?? null,
      alert_type: 'repeated_missing_reads',
      severity: 'warning',
      fingerprint: `repeated_missing_reads:${event.r2_key}`,
      title: 'Repeated missing media reads detected',
      details: { r2Key: event.r2_key, occurrences: event.occurrences, lastSeenAt: event.last_seen_at },
    }).catch(() => {});
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const group of metricsByGroup.values()) {
    const openAlertCount = group.couple_id
      ? await fetch(
        `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/storage_alerts?couple_id=eq.${encodeURIComponent(group.couple_id)}&feature=eq.${encodeURIComponent(group.feature)}&status=eq.open&select=id`,
        { headers: cleanupAuthHeaders(env) },
      ).then((res) => res.ok ? res.json() : []).then((rows) => Array.isArray(rows) ? rows.length : 0).catch(() => 0)
      : 0;

    await upsertStorageMetric(env, {
      metric_date: today,
      couple_id: group.couple_id,
      feature: group.feature,
      object_count: group.object_count,
      total_bytes: group.total_bytes,
      missing_object_count: group.missing_object_count,
      orphan_object_count: group.orphan_object_count,
      legacy_ref_count: group.legacy_ref_count,
      expired_row_count: group.expired_row_count,
      alert_count: openAlertCount,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
  }

  return {
    missingAssets,
    orphanedObjects,
    legacyRefs: Array.isArray(legacyRefs) ? legacyRefs.length : 0,
    expiredRows: Array.isArray(expiredRows) ? expiredRows.length : 0,
    repeatedMissingReads: Array.isArray(repeatedMissingReads) ? repeatedMissingReads.length : 0,
  };
}

async function runRepair(env, source = 'manual') {
  if (!env.LIOR_BUCKET) {
    return { ok: false, source, error: 'LIOR_BUCKET binding missing' };
  }
  if (!hasSupabaseAdmin(env)) {
    return { ok: false, source, error: 'Supabase admin secrets are missing' };
  }

  const repairRefs = await runRpc(env, 'storage_repair_legacy_refs', { max_rows: REPAIR_BATCH_SIZE }).catch(() => []);
  let repaired = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const ref of repairRefs || []) {
    const assetRole = getAssetRoleForFieldName(ref.field_name);
    if (!assetRole || !ref.storage_path || !ref.logical_row_id || !ref.feature || !ref.source_table || !ref.row_id) {
      skipped += 1;
      continue;
    }

    try {
      const payload = await fetchLegacyMediaPayload(env, ref.storage_path);
      if (!payload?.buffer || payload.buffer.byteLength === 0) {
        throw new Error('Legacy media source could not be fetched');
      }

      if (!isMimeAllowedForManagedAsset(ref.feature, assetRole, payload.contentType)) {
        throw new Error(`Legacy payload MIME ${payload.contentType} does not match ${ref.feature}/${assetRole}`);
      }

      const targetKey = buildManagedMediaKey({
        coupleId: ref.couple_id,
        ownerUserId: ref.owner_user_id ?? null,
        feature: ref.feature,
        itemId: ref.logical_row_id,
        assetRole,
        timestamp: ref.item_timestamp || resolveRepairTimestamp(ref.feature, ref.row_data),
      });

      await env.LIOR_BUCKET.put(targetKey, payload.buffer, {
        httpMetadata: { contentType: payload.contentType },
      });

      const verification = await env.LIOR_BUCKET.head(targetKey);
      if (!verification) {
        throw new Error(`Uploaded repair object could not be verified for ${targetKey}`);
      }

      const checksumSha256 = await sha256Hex(payload.buffer);
      await upsertMediaAsset(env, {
        couple_id: ref.couple_id,
        owner_user_id: ref.owner_user_id ?? null,
        source_table: ref.source_table,
        logical_row_id: ref.logical_row_id,
        item_id: ref.logical_row_id,
        feature: ref.feature,
        asset_role: assetRole,
        r2_key: targetKey,
        byte_size: payload.buffer.byteLength,
        mime_type: payload.contentType,
        checksum_sha256: checksumSha256,
        status: 'ready',
        expires_at: ref.expires_at ?? null,
        metadata: { repairedFrom: ref.storage_path, repairedBy: source },
        upload_started_at: new Date().toISOString(),
        ready_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const nextData = { ...(ref.row_data || {}) };
      nextData[ref.field_name] = targetKey;
      if (ref.field_name === 'storagePath' && nextData.image === ref.storage_path) nextData.image = targetKey;
      if (ref.field_name === 'videoStoragePath' && nextData.video === ref.storage_path) nextData.video = targetKey;
      if (ref.field_name === 'music_url' && nextData.music_url === ref.storage_path) nextData.music_url = targetKey;
      if (ref.owner_user_id && !nextData.ownerUserId) nextData.ownerUserId = ref.owner_user_id;

      await patchSourceRowData(env, ref.source_table, ref.row_id, nextData);
      await deleteLegacyMediaSource(env, ref.storage_path);

      await insertStorageEvent(env, {
        couple_id: ref.couple_id ?? null,
        feature: ref.feature ?? null,
        severity: 'info',
        event_type: 'repair.legacy_ref_rewritten',
        r2_key: targetKey,
        source_table: ref.source_table,
        logical_row_id: ref.logical_row_id,
        metadata: { fieldName: ref.field_name, previousPath: ref.storage_path, repairedBy: source },
      }).catch(() => {});

      repaired += 1;
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      failed += 1;
      failures.push({ logicalRowId: ref.logical_row_id, fieldName: ref.field_name, message });
      await insertStorageEvent(env, {
        couple_id: ref.couple_id ?? null,
        feature: ref.feature ?? null,
        severity: 'error',
        event_type: 'repair.legacy_ref_failed',
        r2_key: null,
        source_table: ref.source_table,
        logical_row_id: ref.logical_row_id,
        metadata: { fieldName: ref.field_name, storagePath: ref.storage_path, message, repairedBy: source },
      }).catch(() => {});
      await upsertStorageAlert(env, {
        couple_id: ref.couple_id ?? null,
        feature: ref.feature ?? null,
        alert_type: 'repair.legacy_ref_failed',
        severity: 'error',
        fingerprint: `repair.legacy_ref_failed:${ref.source_table}:${ref.row_id}:${ref.field_name}`,
        title: 'Legacy media repair failed',
        details: { fieldName: ref.field_name, storagePath: ref.storage_path, message },
      }).catch(() => {});
    }
  }

  const audit = await runAudit(env).catch(() => ({
    missingAssets: 0,
    orphanedObjects: 0,
    legacyRefs: 0,
    expiredRows: 0,
    repeatedMissingReads: 0,
  }));

  return {
    ok: true,
    source,
    attempted: Array.isArray(repairRefs) ? repairRefs.length : 0,
    repaired,
    skipped,
    failed,
    failures: failures.slice(0, 20),
    audit,
  };
}

async function runCleanup(env, source = 'manual') {
  if (!env.LIOR_BUCKET) {
    return { ok: false, source, error: 'LIOR_BUCKET binding missing' };
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, source, error: 'Cleanup secrets are not configured' };
  }
  if (!Number.isFinite(CLEANUP_FEATURE_RETENTION_MS) || !isFeatureEphemeral(CLEANUP_FEATURE)) {
    return { ok: false, source, error: `Feature ${CLEANUP_FEATURE} is not configured as ephemeral` };
  }

  const enqueueStats = await enqueueExpiredDailyPhotos(env);
  const claimedTasks = await claimCleanupTasks(env);

  let deletedObjects = 0;
  let skippedPaths = 0;
  let failedTasks = 0;

  for (const task of claimedTasks) {
    if (task.feature !== CLEANUP_FEATURE) {
      skippedPaths += Array.isArray(task.storage_paths) ? task.storage_paths.length : 0;
      await patchCleanupTask(env, task.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        last_error: `Skipped non-ephemeral feature ${task.feature}`,
      });
      continue;
    }

    const outcome = await processCleanupTask(env, task);
    deletedObjects += outcome.deleted;
    skippedPaths += outcome.skipped;
    if (outcome.failed) failedTasks += 1;
  }

  const prunedTasks = await pruneCompletedCleanupTasks(env).catch((error) => {
    console.warn('[cleanup] prune failed', error);
    return 0;
  });
  const orphanDailyObjects = await deleteExpiredOrphanDailyMomentObjects(env).catch((error) => {
    console.warn('[cleanup] orphan daily object cleanup failed', error);
    return { scanned: 0, deleted: 0, skippedActive: 0, skippedFresh: 0, failed: 1 };
  });

  return {
    ok: true,
    source,
    retentionMs: MEDIA_RETENTION_MS[CLEANUP_FEATURE],
    queuedTasks: enqueueStats.queued,
    deletedRows: enqueueStats.deletedRows,
    claimedTasks: claimedTasks.length,
    deletedObjects,
    skippedPaths,
    failedTasks,
    prunedTasks,
    orphanDailyObjects,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'POST' && url.pathname === CLEANUP_ROUTE) {
      const cleanupToken = request.headers.get('X-Cleanup-Token');
      if (!cleanupToken || cleanupToken !== env.CLEANUP_INTERNAL_TOKEN) {
        return new Response('Unauthorized', { status: 401, headers: cors });
      }

      try {
        const result = await runCleanup(env, 'manual');
        return jsonResponse(result, result.ok ? 200 : 500, cors);
      } catch (error) {
        return jsonResponse({ ok: false, error: String(error) }, 500, cors);
      }
    }

    if (url.pathname.startsWith(ADMIN_ROUTE_PREFIX)) {
      if (!env.ADMIN_DASHBOARD_TOKEN) {
        return jsonResponse({ ok: false, error: 'ADMIN_DASHBOARD_TOKEN is not configured' }, 500, cors);
      }
      if (!requireAdminToken(request, env)) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, cors);
      }

      if (request.method === 'GET' && url.pathname === ADMIN_OVERVIEW_ROUTE) {
        try {
          const payload = await buildAdminOverview(env, {
            assetsLimit: url.searchParams.get('assets'),
            alertsLimit: url.searchParams.get('alerts'),
            eventsLimit: url.searchParams.get('events'),
            couplesLimit: url.searchParams.get('couples'),
            daysBack: url.searchParams.get('days'),
            r2ObjectsLimit: url.searchParams.get('r2Objects'),
            appRowsLimit: url.searchParams.get('appRows'),
          });
          return jsonResponse({ ok: true, ...payload }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'GET' && url.pathname === ADMIN_MEDIA_ROUTE) {
        try {
          const media = await fetchAdminMediaGallery(env, url.searchParams.get('limit'));
          return jsonResponse({ ok: true, ...media }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'GET' && url.pathname === ADMIN_USERS_ROUTE) {
        try {
          const users = await fetchAdminUsers(env, url.searchParams.get('limit'));
          return jsonResponse({ ok: true, ...users }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (!hasSupabaseAdmin(env)) {
        return jsonResponse({ ok: false, error: 'Supabase admin secrets are missing' }, 500, cors);
      }

      if (request.method === 'POST' && url.pathname === ADMIN_AUDIT_ROUTE) {
        try {
          const audit = await runAudit(env);
          await insertAdminActionEvent(env, 'audit_ran', { result: audit });
          return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), audit }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_CLEANUP_ROUTE) {
        try {
          const cleanup = await runCleanup(env, 'admin');
          await insertAdminActionEvent(env, 'cleanup_ran', { result: cleanup }, cleanup.ok ? 'info' : 'error');
          return jsonResponse({ ok: cleanup.ok, generatedAt: new Date().toISOString(), cleanup }, cleanup.ok ? 200 : 500, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_REPAIR_ROUTE) {
        try {
          const repair = await runRepair(env, 'admin');
          await insertAdminActionEvent(env, 'repair_ran', { result: repair }, repair.ok ? 'info' : 'error');
          return jsonResponse({ ok: repair.ok, generatedAt: new Date().toISOString(), repair }, repair.ok ? 200 : 500, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_RESOLVE_ALERT_ROUTE) {
        try {
          const body = await readJsonBody(request);
          const result = await resolveAdminAlert(env, body.id);
          return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), result }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_RETRY_CLEANUP_TASK_ROUTE) {
        try {
          const body = await readJsonBody(request);
          const result = await retryAdminCleanupTask(env, body.id);
          return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), result }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_VERIFY_MEDIA_ROUTE) {
        try {
          const body = await readJsonBody(request);
          const result = await verifyAdminMedia(env, body.r2Key);
          return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), result }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      return jsonResponse({ ok: false, error: 'Not Found' }, 404, cors);
    }

    const key = sanitizeKey(decodeURIComponent(url.pathname));
    if (!key) {
      return new Response('Invalid path', { status: 400, headers: cors });
    }

    if (request.method === 'HEAD') {
      const obj = await env.LIOR_BUCKET.head(key);
      if (!obj) {
        return new Response('Not Found', { status: 404, headers: cors });
      }
      return new Response(null, { status: 200, headers: objectHeaders(obj, cors) });
    }

    if (request.method === 'GET') {
      const obj = await env.LIOR_BUCKET.get(key, { range: request.headers });
      if (!obj) {
        return new Response('Not Found', { status: 404, headers: cors });
      }

      const headers = objectHeaders(obj, cors);
      const hasRange = request.headers.has('Range') && obj.range;
      if (hasRange) {
        const end = obj.range.offset + obj.range.length - 1;
        headers.set('Content-Length', String(obj.range.length));
        headers.set('Content-Range', `bytes ${obj.range.offset}-${end}/${obj.size}`);
      }

      return new Response(obj.body, {
        status: hasRange ? 206 : 200,
        headers,
      });
    }

    if (!isManagedWriteKey(key)) {
      return new Response('Managed uploads must target a valid v2 key', { status: 400, headers: cors });
    }

    const parsedKey = parseManagedMediaKey(key);
    if (!parsedKey?.coupleId) {
      return new Response('Managed uploads must target a valid v2 key', { status: 400, headers: cors });
    }

    const canUseFullAuthFlow = hasSupabaseAdmin(env);
    let asset = null;

    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    if (canUseFullAuthFlow) {
      const memberOfCouple = await isUserInCouple(env, user.id, parsedKey.coupleId);
      if (!memberOfCouple) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }

      asset = await fetchMediaAssetByKey(env, key);
      if (asset?.couple_id && asset.couple_id !== parsedKey.coupleId) {
        return new Response('media_assets couple mismatch', { status: 409, headers: cors });
      }
    } else if (parsedKey.ownerUserId && parsedKey.ownerUserId !== user.id) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }

    if (request.method === 'PUT') {
      if (asset?.owner_user_id && asset.owner_user_id !== user.id) {
        return new Response('Upload reservation belongs to another user', { status: 403, headers: cors });
      }
      if (!asset?.id) {
        return new Response('Upload was not reserved in media_assets', { status: 409, headers: cors });
      }

      const contentType = request.headers.get('Content-Type') || '';
      if (!isMimeAllowed(contentType)) {
        return new Response('Unsupported media type', { status: 415, headers: cors });
      }

      const normalizedContentType = normalizeMimeType(contentType);
      if (!isMimeAllowedForManagedAsset(parsedKey.feature, parsedKey.assetRole, normalizedContentType)) {
        return new Response(`Content-Type ${normalizedContentType} does not match ${parsedKey.feature}/${parsedKey.assetRole}`, { status: 415, headers: cors });
      }

      const sizeLimit = getMaxUploadBytesForManagedAsset(parsedKey.feature, parsedKey.assetRole);
      if (!sizeLimit) {
        return new Response('Unsupported managed media target', { status: 400, headers: cors });
      }
      const contentLength = Number(request.headers.get('Content-Length') ?? '0');
      if (contentLength > sizeLimit) {
        return new Response(`Payload too large (max ${sizeLimit / 1_048_576} MiB for this type)`, { status: 413, headers: cors });
      }

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
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const checksumSha256 = await sha256Hex(combined.buffer);

      if (Number(asset.byte_size || 0) !== total) {
        return new Response('media_assets byte size mismatch', { status: 409, headers: cors });
      }
      if (normalizeMimeType(asset.mime_type) !== normalizedContentType) {
        return new Response('media_assets MIME mismatch', { status: 409, headers: cors });
      }
      if (String(asset.checksum_sha256 || '') !== checksumSha256) {
        return new Response('media_assets checksum mismatch', { status: 409, headers: cors });
      }

      await env.LIOR_BUCKET.put(key, combined, {
        httpMetadata: { contentType: normalizedContentType },
      });
      if (canUseFullAuthFlow) {
        try {
          await patchMediaAssetByKey(env, key, {
            status: 'ready',
            byte_size: total,
            mime_type: normalizedContentType,
            checksum_sha256: checksumSha256,
            ready_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (error) {
          await env.LIOR_BUCKET.delete(key).catch(() => {});
          await upsertStorageAlert(env, {
            couple_id: parsedKey.coupleId ?? null,
            feature: parsedKey.feature ?? null,
            alert_type: 'upload_finalize_failed',
            severity: 'critical',
            fingerprint: `upload_finalize_failed:${key}`,
            title: 'Media upload finalized in R2 but failed to update index',
            details: { r2Key: key, message: String(error instanceof Error ? error.message : error) },
          }).catch(() => {});
          return new Response('Failed to finalize media index', { status: 500, headers: cors });
        }
      }
      if (canUseFullAuthFlow) {
        await insertStorageEvent(env, {
          couple_id: parsedKey.coupleId ?? null,
          feature: parsedKey.feature,
          severity: 'info',
          event_type: 'media.upload_verified',
          r2_key: key,
          source_table: null,
          logical_row_id: parsedKey.itemId,
          metadata: { byteSize: total, mimeType: normalizedContentType, assetRole: parsedKey.assetRole },
        }).catch(() => {});
      }

      return new Response(JSON.stringify({
        path: key,
        bytes: total,
        contentType: normalizedContentType,
        feature: parsedKey.feature,
        assetRole: parsedKey.assetRole,
        checksumSha256,
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'DELETE') {
      await env.LIOR_BUCKET.delete(key);
      if (canUseFullAuthFlow) {
        try {
          await deleteMediaAssetByKey(env, key);
        } catch (error) {
          await upsertStorageAlert(env, {
            couple_id: parsedKey.coupleId ?? null,
            feature: parsedKey.feature ?? null,
            alert_type: 'delete_index_failed',
            severity: 'error',
            fingerprint: `delete_index_failed:${key}`,
            title: 'Media object deleted but authoritative index cleanup failed',
            details: { r2Key: key, message: String(error instanceof Error ? error.message : error) },
          }).catch(() => {});
          return new Response('Deleted object but failed to remove media index row', { status: 500, headers: cors });
        }
        await insertStorageEvent(env, {
          couple_id: parsedKey.coupleId ?? null,
          feature: parsedKey.feature,
          severity: 'info',
          event_type: 'media.deleted',
          r2_key: key,
          source_table: asset?.source_table ?? null,
          logical_row_id: asset?.logical_row_id ?? parsedKey.itemId,
          metadata: { assetRole: parsedKey.assetRole, deletedByUserId: user.id },
        }).catch(() => {});
      }
      return new Response('OK', { status: 200, headers: cors });
    }

    return new Response('Method Not Allowed', { status: 405, headers: cors });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCleanup(env, 'scheduled').then((result) => {
      if (!result.ok) {
        console.warn('[cleanup] scheduled run failed', result);
      } else {
        console.info('[cleanup] scheduled run summary', result);
      }
    }).catch((error) => {
      console.error('[cleanup] scheduled run exception', error);
    }));
  },
};

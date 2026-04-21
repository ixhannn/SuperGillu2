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
const ADMIN_AUDIT_ROUTE = '/__admin/actions/audit';
const ADMIN_CLEANUP_ROUTE = '/__admin/actions/cleanup';
const ADMIN_REPAIR_ROUTE = '/__admin/actions/repair';
const CLEANUP_FEATURE = 'daily-moments';
const CLEANUP_FEATURE_RETENTION_MS = getMediaRetentionMs(CLEANUP_FEATURE);
const CLEANUP_BATCH_SIZE = 100;
const REPAIR_BATCH_SIZE = 100;
const MAX_CLEANUP_ATTEMPTS = 8;
const COMPLETED_TASK_RETENTION_DAYS = 30;
const LEGACY_SUPABASE_BUCKETS = ['lior-media', 'tulika-media'];

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/octet-stream'];
const EMAIL_LIKE_SEGMENT = /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/i;

function isMimeAllowed(contentType) {
  if (!contentType) return false;
  const base = normalizeMimeType(contentType);
  return ALLOWED_MIME_PREFIXES.some((prefix) => base.startsWith(prefix));
}

function corsHeaders(origin) {
  const allowed = !origin
    ? '*'
    : /^(https?:\/\/|capacitor:\/\/)/i.test(origin)
      ? origin
      : null;

  return {
    'Access-Control-Allow-Origin': allowed ?? 'null',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Cleanup-Token, X-Admin-Token, X-Upload-Key, Range',
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

function hasUploadKeyFallback(request, env) {
  const token = request.headers.get('X-Upload-Key') || '';
  return !!token && !!env.UPLOAD_KEY && token === env.UPLOAD_KEY;
}

async function getAuthenticatedUser(request, env) {
  const accessToken = readBearerToken(request.headers.get('Authorization'));
  if (!accessToken || !env.SUPABASE_URL) return null;

  const projectApiKey = request.headers.get('apikey') || env.SUPABASE_SERVICE_ROLE_KEY || '';
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

  const [overview, couples, assets, alerts, events, metrics] = await Promise.all([
    fetchAdminOverview(env),
    fetchAdminCoupleUsage(env, couplesLimit),
    fetchAdminRecentAssets(env, assetsLimit),
    fetchAdminOpenAlerts(env, alertsLimit),
    fetchAdminRecentEvents(env, eventsLimit),
    fetchAdminMetrics(env, daysBack),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    worker: {
      bucketConfigured: !!env.LIOR_BUCKET,
      supabaseConfigured: hasSupabaseAdmin(env),
    },
    overview,
    couples,
    assets,
    alerts,
    events,
    metrics,
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
    await upsertStorageAlert(env, {
      couple_id: parsed?.coupleId ?? null,
      feature: parsed?.feature ?? null,
      alert_type: 'orphaned_object',
      severity: 'warning',
      fingerprint: `orphaned_object:${key}`,
      title: 'R2 object has no media_assets row',
      details: { r2Key: key },
    }).catch(() => {});
  }

  const legacyRefs = await runRpc(env, 'storage_audit_legacy_refs', { max_rows: 200 }).catch(() => []);
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
    await upsertStorageAlert(env, {
      couple_id: ref.couple_id ?? null,
      feature: ref.feature ?? null,
      alert_type: 'legacy_storage_ref',
      severity: 'warning',
      fingerprint: `legacy_ref:${ref.source_table}:${ref.logical_row_id}:${ref.field_name}`,
      title: 'Legacy storage path still present',
      details: { sourceTable: ref.source_table, logicalRowId: ref.logical_row_id, fieldName: ref.field_name, storagePath: ref.storage_path },
    }).catch(() => {});
  }

  const expiredRows = await runRpc(env, 'storage_audit_expired_daily_photos', { max_rows: 200 }).catch(() => []);
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
    await upsertStorageAlert(env, {
      couple_id: row.couple_id ?? null,
      feature: CLEANUP_FEATURE,
      alert_type: 'expired_daily_row',
      severity: 'error',
      fingerprint: `expired_daily_row:${row.row_id}`,
      title: 'Expired daily moment row still exists',
      details: { rowId: row.row_id, logicalRowId: row.logical_row_id, expiresAt: row.expires_at },
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
  const auditStats = await runAudit(env).catch((error) => {
    console.warn('[audit] run failed', error);
    return {
      missingAssets: 0,
      orphanedObjects: 0,
      legacyRefs: 0,
      expiredRows: 0,
      repeatedMissingReads: 0,
    };
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
    audit: auditStats,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin);
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
      if (!hasSupabaseAdmin(env)) {
        return jsonResponse({ ok: false, error: 'Supabase admin secrets are missing' }, 500, cors);
      }

      if (request.method === 'GET' && url.pathname === ADMIN_OVERVIEW_ROUTE) {
        try {
          const payload = await buildAdminOverview(env, {
            assetsLimit: url.searchParams.get('assets'),
            alertsLimit: url.searchParams.get('alerts'),
            eventsLimit: url.searchParams.get('events'),
            couplesLimit: url.searchParams.get('couples'),
            daysBack: url.searchParams.get('days'),
          });
          return jsonResponse({ ok: true, ...payload }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_AUDIT_ROUTE) {
        try {
          const audit = await runAudit(env);
          const payload = await buildAdminOverview(env);
          return jsonResponse({ ok: true, audit, ...payload }, 200, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_CLEANUP_ROUTE) {
        try {
          const cleanup = await runCleanup(env, 'admin');
          const payload = await buildAdminOverview(env);
          return jsonResponse({ ok: cleanup.ok, cleanup, ...payload }, cleanup.ok ? 200 : 500, cors);
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error) }, 500, cors);
        }
      }

      if (request.method === 'POST' && url.pathname === ADMIN_REPAIR_ROUTE) {
        try {
          const repair = await runRepair(env, 'admin');
          const payload = await buildAdminOverview(env);
          return jsonResponse({ ok: repair.ok, repair, ...payload }, repair.ok ? 200 : 500, cors);
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

    const usingUploadKeyFallback = hasUploadKeyFallback(request, env);
    const canUseFullAuthFlow = hasSupabaseAdmin(env);
    let user = null;
    let asset = null;

    if (usingUploadKeyFallback) {
      user = { id: 'upload-key' };
    } else {
      user = await getAuthenticatedUser(request, env);
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
    }

    if (request.method === 'PUT') {
      if (!usingUploadKeyFallback && asset?.owner_user_id && asset.owner_user_id !== user.id) {
        return new Response('Upload reservation belongs to another user', { status: 403, headers: cors });
      }
      if (!usingUploadKeyFallback && !asset?.id) {
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

      if (!usingUploadKeyFallback && Number(asset.byte_size || 0) !== total) {
        return new Response('media_assets byte size mismatch', { status: 409, headers: cors });
      }
      if (!usingUploadKeyFallback && normalizeMimeType(asset.mime_type) !== normalizedContentType) {
        return new Response('media_assets MIME mismatch', { status: 409, headers: cors });
      }
      if (!usingUploadKeyFallback && String(asset.checksum_sha256 || '') !== checksumSha256) {
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
          event_type: usingUploadKeyFallback ? 'media.upload_legacy_verified' : 'media.upload_verified',
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
          event_type: usingUploadKeyFallback ? 'media.deleted_legacy' : 'media.deleted',
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

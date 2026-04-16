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
 *   PUT    /:path*              - upload file to R2 (requires X-Upload-Key)
 *   DELETE /:path*              - delete file from R2 (requires X-Upload-Key)
 *   POST   /__internal/cleanup  - run cleanup immediately (requires X-Cleanup-Token)
 *
 * Environment bindings:
 *   LIOR_BUCKET                 - R2 bucket binding
 *   UPLOAD_KEY                  - secret for mutating media operations
 *   CLEANUP_INTERNAL_TOKEN      - secret for manual cleanup trigger
 *   SUPABASE_URL                - secret/base URL for the Supabase project
 *   SUPABASE_SERVICE_ROLE_KEY   - secret for cleanup-task RPC + task updates
 */

const CLEANUP_ROUTE = '/__internal/cleanup';
const CLEANUP_FEATURE = 'daily-moments';
const CLEANUP_FEATURE_RETENTION_MS = getMediaRetentionMs(CLEANUP_FEATURE);
const CLEANUP_BATCH_SIZE = 100;
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key, X-Cleanup-Token, Range',
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

async function supabaseRequest(env, path, init = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
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

    await patchCleanupTask(env, task.id, {
      status: nextStatus,
      run_after: nextRunAfter,
      last_error: String(error instanceof Error ? error.message : error),
      completed_at: null,
    });

    return {
      deleted: 0,
      skipped: invalidPaths.length,
      failed: true,
    };
  }
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
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: String(error) }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
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

    const uploadKey = request.headers.get('X-Upload-Key');
    if (!uploadKey || uploadKey !== env.UPLOAD_KEY) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    if (request.method === 'PUT') {
      if (!isManagedWriteKey(key)) {
        return new Response('Managed uploads must target a valid v2 key', { status: 400, headers: cors });
      }

      const contentType = request.headers.get('Content-Type') || '';
      if (!isMimeAllowed(contentType)) {
        return new Response('Unsupported media type', { status: 415, headers: cors });
      }

      const parsedKey = parseManagedMediaKey(key);
      if (!parsedKey) {
        return new Response('Managed uploads must target a valid v2 key', { status: 400, headers: cors });
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

      await env.LIOR_BUCKET.put(key, combined, {
        httpMetadata: { contentType: normalizedContentType },
      });

      return new Response(JSON.stringify({
        path: key,
        bytes: total,
        contentType: normalizedContentType,
        feature: parsedKey.feature,
        assetRole: parsedKey.assetRole,
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'DELETE') {
      await env.LIOR_BUCKET.delete(key);
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

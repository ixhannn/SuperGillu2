import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mediaStorage = readFileSync(new URL('../services/mediaStorage.ts', import.meta.url), 'utf8');
const mediaProxy = readFileSync(new URL('../supabase/functions/media-proxy/index.ts', import.meta.url), 'utf8');

assert.ok(
  mediaStorage.includes('/functions/v1/media-proxy'),
  'Expected media storage reads to fall back to the authenticated media proxy',
);

assert.ok(
  mediaStorage.includes('const viaProxy = await downloadViaMediaProxy(storagePath);'),
  'Expected legacy Supabase refs to try service-role proxy recovery after client download fails',
);

assert.ok(
  mediaProxy.includes("const LEGACY_SUPABASE_BUCKETS = ['lior-media', 'tulika-media'];"),
  'Expected media proxy to be restricted to known legacy media buckets',
);

assert.ok(
  mediaProxy.includes('service.auth.getUser(accessToken)'),
  'Expected media proxy to require a valid Supabase user session',
);

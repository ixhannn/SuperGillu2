import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mediaStorageSource = readFileSync(new URL('../services/mediaStorage.ts', import.meta.url), 'utf8');

assert.ok(
  mediaStorageSource.includes('isPublic?: boolean;'),
  'Expected parsed Supabase storage refs to track whether the URL is public',
);

assert.ok(
  mediaStorageSource.includes('if (parsedRef?.absoluteUrl && parsedRef.isPublic) return parsedRef.absoluteUrl;'),
  'Expected only public Supabase URLs to be returned directly to browser media elements',
);

assert.ok(
  mediaStorageSource.includes('if (parsedRef?.absoluteUrl && !parsedRef.isPublic) return null;'),
  'Expected private Supabase storage refs to require signed URLs/client download instead of raw absolute URLs',
);

assert.ok(
  mediaStorageSource.includes('if (parsedSupabaseRef && !parsedSupabaseRef.isPublic) return null;'),
  'Expected getAccessibleUrl() to avoid returning raw private Supabase URLs before proxy recovery can run',
);

assert.ok(
  mediaStorageSource.includes('if (parsedRef.absoluteUrl && parsedRef.isPublic) return downloadUrlAsDataUri(parsedRef.absoluteUrl);'),
  'Expected private Supabase download fallback to avoid unauthenticated absolute URL fetches',
);

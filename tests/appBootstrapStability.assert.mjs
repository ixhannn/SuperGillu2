import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const supabaseSource = readFileSync(new URL('../services/supabase.ts', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../services/sync.ts', import.meta.url), 'utf8');

assert.match(
  supabaseSource,
  /getSession:\s*async\s*\(\): Promise<Session \| null>/,
  'Expected SupabaseService to expose a shared session lookup helper for app bootstrap',
);

assert.match(
  supabaseSource,
  /from\('couple_memberships'\)[\s\S]*\.select\('couple_id, created_at'\)[\s\S]*\.eq\('user_id', userId\)[\s\S]*linkedCoupleIds[\s\S]*rpc\('ensure_user_couple'\)/,
  'Expected Supabase couple lookup to prefer an existing paired membership before falling back to ensure_user_couple',
);

assert.match(
  appSource,
  /const session = await SupabaseService\.getSession\(\);/,
  'Expected the app bootstrap to reuse the shared Supabase session lookup instead of calling auth.getSession directly',
);

assert.match(
  appSource,
  /if \(session\) \{[\s\S]*await initializeSync\(\);[\s\S]*\} else \{[\s\S]*SyncService\.reset\(\);[\s\S]*\}/,
  'Expected the app to initialize realtime sync only when a real auth session exists',
);

assert.match(
  syncSource,
  /public reset\(\)\s*\{\s*this\.cleanupRealtimeState\(\);\s*this\.isConnected = false;\s*this\.status = 'Offline';/s,
  'Expected SyncService to expose a reset path so startup and sign-out can cleanly tear down realtime state',
);

assert.match(
  syncSource,
  /if \(localProfileBeforeCoupleLookup\.coupleId && localProfileBeforeCoupleLookup\.partnerUserId\) \{[\s\S]*SupabaseService\.setCachedCoupleId\(localProfileBeforeCoupleLookup\.coupleId\);[\s\S]*\} else \{[\s\S]*SupabaseService\.setCachedCoupleId\(null\);[\s\S]*\}[\s\S]*let coupleId = await SupabaseService\.getCurrentCoupleId\(\);/,
  'Expected sync bootstrap to preserve only a complete linked couple id before asking Supabase for a couple id',
);

assert.match(
  syncSource,
  /private async bootstrapProfileFromCloud\(\)[\s\S]*await this\.bootstrapProfileFromCloud\(\);/,
  'Expected SyncService.init to hydrate couple profile data before App decides whether onboarding is needed',
);

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

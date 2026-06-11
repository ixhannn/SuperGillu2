import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const supabaseSource = readFileSync(new URL('../services/supabase.ts', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../services/sync.ts', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/migrations/20260508000000_tenant_privacy_lockdown.sql', import.meta.url), 'utf8');

assert.match(
  storageSource,
  /const backupCurrentContentForAccount = \(userId: string \| null\) => \{[\s\S]*CONTENT_COLLECTION_STORES[\s\S]*writeRaw\(STORES\.DATA, buildAccountScopedStorageKey\(storageKey, userId\), value\)/,
  'Expected content collections to be backed up under the active account before account switches.',
);

assert.match(
  storageSource,
  /const collectionSnapshots = CONTENT_COLLECTION_STORES\.map[\s\S]*DATA_CACHE\[cacheKey\][\s\S]*const singletonSnapshots = CONTENT_SINGLETON_KEYS\.map[\s\S]*for \(const \{ storageKey, value, raw \} of collectionSnapshots\)/,
  'Expected account content backups to snapshot in-memory collections before async clearing can run.',
);

assert.match(
  storageSource,
  /const clearBaseContentForAccountSwitch = \(\) => \{[\s\S]*DATA_CACHE as Record<string, unknown\[\]>\)\[cacheKey\] = \[\][\s\S]*writeRaw\(STORES\.DATA, storageKey, \[\]\)/,
  'Expected base content caches to be cleared immediately on sign-out or account switch.',
);

assert.match(
  storageSource,
  /const restoreAccountScopedContent = \(userId: string\) => \{[\s\S]*readRaw\(STORES\.DATA, buildAccountScopedStorageKey\(storageKey, userId\)\)[\s\S]*notifyUpdate\(\{ source: 'sync', action: 'save', table: 'account-scope', id: userId \}\)/,
  'Expected account activation to restore only that account’s cached content.',
);

assert.match(
  storageSource,
  /prepareForSignOut:\s*\(\) => \{[\s\S]*backupCurrentContentForAccount\(activeUserId\);/,
  'Expected sign-out to snapshot both profile and content for the active account.',
);

assert.match(
  supabaseSource,
  /from\(table\)\.select\('\*'\)\.eq\('couple_id', coupleId\)/,
  'Expected generic cloud reads to filter by the active couple_id.',
);

assert.match(
  supabaseSource,
  /from\(DELETION_LEDGER_TABLE\)[\s\S]*\.eq\('couple_id', coupleId\)/,
  'Expected deletion ledger reads to filter by the active couple_id.',
);

assert.match(
  syncSource,
  /const coupleId = profile\.coupleId;[\s\S]*channel\(`lior_room:\$\{coupleId\}`\)/,
  'Expected together presence and broadcasts to use a couple-scoped realtime room.',
);

assert.match(
  syncSource,
  /postgres_changes'[\s\S]*filter: `couple_id=eq\.\$\{coupleId\}`[\s\S]*table/,
  'Expected realtime table subscriptions to filter by active couple_id.',
);

assert.match(
  migrationSource,
  /create policy %I on public\.%I for select to authenticated using \([\s\S]*couple_id is not null[\s\S]*where m\.couple_id = %I\.couple_id and m\.user_id = auth\.uid\(\)[\s\S]*\)/,
  'Expected database select policies to require couple membership, not user_id-only visibility.',
);

assert.doesNotMatch(
  migrationSource,
  /user_id = auth\.uid\(\)\s+or/,
  'Tenant lockdown migration must not preserve user_id-only reads for shared couple content.',
);

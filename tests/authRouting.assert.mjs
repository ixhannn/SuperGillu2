import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Normalize CRLF→LF so the literal "\n" markers below match regardless of the
// platform's checkout line endings (Windows checks out App.tsx with CRLF).
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const authRenderBlock = appSource.slice(
  appSource.indexOf('// Cloud Authentication Check'),
  appSource.indexOf('// First-time Onboarding Check'),
);

assert.match(
  authRenderBlock,
  /if \(!e2eMode && !isAuthenticated\) \{/,
  'Unauthenticated production users should always see Auth before onboarding.',
);

assert.doesNotMatch(
  authRenderBlock,
  /SupabaseService\.isConfigured\(\)/,
  'Auth rendering must not depend on Supabase config; Auth owns the missing-config warning.',
);

const supabaseUnavailableBranch = appSource.slice(
  appSource.indexOf('} else {\n          hasOnboardedAfterBootstrap = false;'),
  appSource.indexOf('      } catch (err) {'),
);

assert.match(
  supabaseUnavailableBranch,
  /setIsAuthenticated\(false\);\s*setShowOnboarding\(false\);/m,
  'Unconfigured Supabase bootstrap must keep users unauthenticated and outside onboarding.',
);

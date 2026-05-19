import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authSource = readFileSync(new URL('../views/Auth.tsx', import.meta.url), 'utf8');
const viewportHeightMatches = authSource.match(/min-h-\[100dvh\]/g) ?? [];

assert.equal(
  viewportHeightMatches.length,
  1,
  'Expected Auth to use a single viewport-height container so the form is not pushed off the first screen on mobile.',
);

assert.ok(
  !authSource.includes('className="relative mt-auto'),
  'Expected Auth to anchor the form card with layout rows instead of mt-auto so the screen is immediately usable.',
);

assert.ok(
  authSource.includes('data-testid="auth-phone-mockup"'),
  'Expected Auth to expose the phone mockup for viewport regression coverage.',
);

assert.ok(
  authSource.includes("clamp(148px, min(40vw, 24dvh), 190px)"),
  'Expected Auth phone mockup to scale from viewport width with a short-screen height guard.',
);

assert.ok(
  !authSource.includes("clamp(130px, 14vh, 196px)"),
  'Expected Auth phone mockup to avoid height-only sizing that makes the iPhone look tiny.',
);

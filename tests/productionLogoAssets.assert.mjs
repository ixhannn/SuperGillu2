import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const indexHtml = read('index.html');
assert.match(indexHtml, /href="\/favicon-48\.png"/, 'favicon should use the production 48px PNG asset');
assert.match(indexHtml, /href="\/apple-touch-icon\.png"/, 'iOS touch icon should use the production PNG asset');
assert.doesNotMatch(indexHtml, /\/icon\.svg/, 'index shell should not point install surfaces at the old SVG icon');

assert.match(read('views/Auth.tsx'), /\/icon-128\.png/, 'auth screen should carry the production brand mark');
assert.match(read('components/Onboarding.tsx'), /\/icon-128\.png/, 'onboarding should carry the production brand mark');
assert.match(read('views/Profile.tsx'), /\/icon-128\.png/, 'profile/settings should carry the production brand mark');

for (const manifestPath of ['manifest.json', 'public/manifest.json']) {
  const manifest = JSON.parse(read(manifestPath));
  const iconSources = manifest.icons.map((icon) => icon.src);
  assert.deepEqual(iconSources, ['/icon-192.png', '/icon-512.png'], `${manifestPath} should expose production PNG app icons`);
}

for (const assetPath of [
  'public/favicon-48.png',
  'public/icon-128.png',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/icon-1024.png',
  'public/apple-touch-icon.png',
  'public/notification-icon.png',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'android/playstore-icon.png',
]) {
  assert.ok(exists(assetPath), `${assetPath} should exist`);
}

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  assert.ok(exists(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`), `${density} launcher icon should exist`);
  assert.ok(exists(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`), `${density} round launcher icon should exist`);
  assert.ok(exists(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`), `${density} adaptive foreground should exist`);
}

for (const splashPath of [
  'android/app/src/main/res/drawable/splash.png',
  'android/app/src/main/res/drawable-port-mdpi/splash.png',
  'android/app/src/main/res/drawable-port-hdpi/splash.png',
  'android/app/src/main/res/drawable-port-xhdpi/splash.png',
  'android/app/src/main/res/drawable-port-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-port-xxxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-mdpi/splash.png',
  'android/app/src/main/res/drawable-land-hdpi/splash.png',
  'android/app/src/main/res/drawable-land-xhdpi/splash.png',
  'android/app/src/main/res/drawable-land-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-xxxhdpi/splash.png',
]) {
  assert.ok(exists(splashPath), `${splashPath} should use the production startup artwork`);
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifestSource = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const mainActivitySource = readFileSync(new URL('../android/app/src/main/java/com/lior/app/MainActivity.java', import.meta.url), 'utf8');
const capacitorSource = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
const nativeShellSource = readFileSync(new URL('../services/nativeShell.ts', import.meta.url), 'utf8');
const rootFixesSource = readFileSync(new URL('../styles/root-fixes.css', import.meta.url), 'utf8');

assert.match(
  manifestSource,
  /android:windowSoftInputMode="adjustNothing"/,
  'Android must not resize the native WebView when the keyboard opens; resize exposes a grey system panel.',
);

assert.match(
  mainActivitySource,
  /SOFT_INPUT_ADJUST_NOTHING/,
  'MainActivity should enforce adjustNothing at runtime so launch/theme changes cannot restore adjustResize.',
);

assert.match(
  capacitorSource,
  /Keyboard:[\s\S]*resize:\s*'none'/,
  'Capacitor keyboard config should keep the WebView frame stable.',
);

assert.match(
  capacitorSource,
  /Keyboard:[\s\S]*resizeOnFullScreen:\s*false/,
  'Android fullscreen keyboard workaround must stay disabled; it fights adjustNothing and makes the app shell jump above the IME.',
);

assert.match(
  nativeShellSource,
  /KeyboardResize\.None[\s\S]*closest<HTMLElement>\('\.lenis-wrapper'\)[\s\S]*scrollBy\(\{ top: delta/,
  'NativeShellService should use overlay keyboard mode and reveal focused inputs by scrolling the app scroll root, not the window.',
);

assert.doesNotMatch(
  nativeShellSource,
  /scrollIntoView\(/,
  'NativeShellService must not use scrollIntoView for keyboard reveal; it can shove fields under fixed headers in the Capacitor shell.',
);

assert.match(
  nativeShellSource,
  /window\.scrollTo\(\{ left: 0, top: 0, behavior: 'auto' \}\)/,
  'NativeShellService should reset accidental document scroll while the fixed app shell handles input reveal.',
);

assert.match(
  rootFixesSource,
  /html\[data-keyboard-open="true"\] \.lenis-content[\s\S]*padding-bottom:\s*calc\(var\(--lior-keyboard-height/,
  'The scroll content needs keyboard-height padding when the IME overlays the app.',
);

assert.match(
  rootFixesSource,
  /html\[data-keyboard-open="true"\],[\s\S]*html\[data-keyboard-open="true"\] body[\s\S]*overflow:\s*hidden !important/,
  'Keyboard-open state should lock document/body scrolling so focus reveal cannot move the fixed app shell.',
);

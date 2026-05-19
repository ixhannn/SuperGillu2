import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nativeMediaSource = readFileSync(new URL('../services/nativeMedia.ts', import.meta.url), 'utf8');
const addMemorySource = readFileSync(new URL('../views/AddMemory.tsx', import.meta.url), 'utf8');
const manifestSource = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const notificationIconSource = readFileSync(new URL('../android/app/src/main/res/drawable/ic_notification.xml', import.meta.url), 'utf8');

assert.match(
  nativeMediaSource,
  /Capacitor\.isNativePlatform\(\)/,
  'Expected native media helper to stay disabled in browser preview.',
);

assert.match(
  nativeMediaSource,
  /import\('@capacitor\/camera'\)[\s\S]*Camera\.getPhoto[\s\S]*CameraResultType\.DataUrl[\s\S]*CameraSource\.Prompt/,
  'Expected native photo picking to use Capacitor Camera/Gallery with a data URL result.',
);

assert.match(
  nativeMediaSource,
  /cancel\|dismiss\|user denied/i,
  'Expected native media helper to treat user cancellation as a non-error.',
);

assert.match(
  addMemorySource,
  /NativeMediaService\.isNativeAvailable\(\)[\s\S]*NativeMediaService\.pickPhoto\(\)[\s\S]*fileInputRef\.current\?\.click\(\)/,
  'Expected Add Memory photo action to try native picker first, then fall back to browser file input.',
);

assert.match(
  manifestSource,
  /android\.permission\.CAMERA[\s\S]*android\.permission\.READ_MEDIA_IMAGES/,
  'Expected Android manifest to include camera and modern gallery permissions.',
);

assert.match(
  manifestSource,
  /android\.permission\.RECORD_AUDIO[\s\S]*android\.permission\.MODIFY_AUDIO_SETTINGS/,
  'Expected Android manifest to declare WebView audio capture permissions used by getUserMedia.',
);

assert.match(
  notificationIconSource,
  /<vector[\s\S]*android:pathData=/,
  'Expected Android local notifications to have a valid small icon resource.',
);

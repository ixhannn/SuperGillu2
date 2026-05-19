import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const nativeShellSource = readFileSync(new URL('../services/nativeShell.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const offlineNoticeSource = readFileSync(new URL('../components/OfflineNotice.tsx', import.meta.url), 'utf8');
const bottomNavSource = readFileSync(new URL('../components/BottomNav.tsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8');
const syncViewSource = readFileSync(new URL('../views/Sync.tsx', import.meta.url), 'utf8');

assert.match(
  nativeShellSource,
  /CapacitorApp\.addListener\('backButton'[\s\S]*currentBackHandler/,
  'Expected native hardware back handling to live in NativeShellService.',
);

assert.match(
  nativeShellSource,
  /Keyboard\.addListener\('keyboardWillShow'[\s\S]*keyboardOpen: true[\s\S]*keyboardHeight/,
  'Expected native keyboard open state and height to be tracked.',
);

assert.match(
  nativeShellSource,
  /connectionType: readOnlineState\(\) \? 'unknown' : 'none'[\s\S]*root\.dataset\.connectionType = state\.connectionType/,
  'Expected native shell to expose connection type for native offline/online UI.',
);

assert.match(
  nativeShellSource,
  /import\(\/\* @vite-ignore \*\/ NETWORK_NS\)[\s\S]*networkStatusChange/,
  'Expected optional Capacitor Network support with browser fallback.',
);

assert.match(
  nativeShellSource,
  /MutationObserver\(syncStyle\)[\s\S]*attributeFilter: \['data-theme'\]/,
  'Expected native status bar style to follow app theme changes.',
);

assert.match(
  nativeShellSource,
  /const waitForStablePaint = \(\) => new Promise[\s\S]*requestAnimationFrame[\s\S]*requestAnimationFrame[\s\S]*SplashScreen\.hide/,
  'Expected native splash hide to wait for a stable first paint.',
);

assert.match(
  nativeShellSource,
  /pendingUploads: readPendingUploads\(\)[\s\S]*pendingDeletes: readPendingDeletes\(\)[\s\S]*ready: false/,
  'Expected offline queue counts to be part of shell state.',
);

assert.match(
  appSource,
  /NativeShellService\.start\(\{[\s\S]*onHardwareBack:[\s\S]*lior:hardware-back[\s\S]*runNavigation\(destination, 'pop'\)[\s\S]*NativeShellService\.minimizeApp\(\)/,
  'Expected App to route hardware back through modal dismissal, app navigation, then minimize.',
);

assert.match(
  appSource,
  /NativeShellService\.onResume\([\s\S]*SyncService\.refreshFromCloud\(\)/,
  'Expected app resume to refresh cloud state when online.',
);

assert.match(
  appSource,
  /NotificationsService\.applySchedule\(\)/,
  'Expected notification schedules to be applied without prompting on Home.',
);

assert.match(
  offlineNoticeSource,
  /if \(shell\.isOnline\) return null;[\s\S]*shell\.pendingUploads > 0[\s\S]*media uploads are/,
  'Expected offline notice to avoid permanent online pending-delete banners and only mention real queued media while offline.',
);

assert.match(
  bottomNavSource,
  /keyboardOpen \? 'translate3d\(0, calc\(100% \+ 24px\), 0\)'/,
  'Expected bottom nav to hide when the native keyboard is open.',
);

assert.match(
  bottomNavSource,
  /Haptics\.press\(\)[\s\S]*Haptics\.softTap\(\)/,
  'Expected bottom navigation to provide native-feeling haptic feedback.',
);

assert.doesNotMatch(
  homeSource,
  /Notification\.requestPermission\(\)/,
  'Home should not trigger the system notification permission prompt on load.',
);

assert.match(
  syncViewSource,
  /NotificationsService\.getPermissionStatus\(\)[\s\S]*NotificationsService\.requestPermission\(\)/,
  'Expected Sync notifications UI to use the shared notifications service for both current state and permission requests.',
);

assert.doesNotMatch(
  syncViewSource,
  /Notification\.requestPermission\(\)/,
  'Sync should not call the browser Notification API directly because native devices must go through Capacitor permissions.',
);

for (const dependency of [
  '@capacitor/network',
  '@capacitor/local-notifications',
  '@capacitor/push-notifications',
  '@capacitor/camera',
]) {
  assert.match(
    packageSource,
    new RegExp(`"${dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
    `Expected ${dependency} to be declared because native services import it.`,
  );
}

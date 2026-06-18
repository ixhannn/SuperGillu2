# Push Notifications Setup (partner alerts when the app is closed)

Local notifications (daily reminders, weekly recap, "your film is ready", and the
in-app *Enable notifications* test) work **without** any of this — they are
on-device and need no server.

## ⚠️ Root cause fixed (2026-06-17): plugins were never bundled

For a long stretch **no** notifications worked on device — not even the local
*Enable notifications* test. The cause was **not** Firebase/config: the Capacitor
notification plugins were dynamic-imported with `/* @vite-ignore */` and a bare
module specifier (`@capacitor/local-notifications`, `@capacitor/push-notifications`).
`@vite-ignore` tells Vite **not to bundle** the module, so in the production build
the bare specifier was left as-is and **failed to resolve inside the Android
WebView at runtime**. The import threw, the error was swallowed by a `try/catch`,
and the code silently fell back to the (dead-in-WebView) Web Notifications path.

The fix: import the plugins with a static string specifier (like every other
working Capacitor plugin — camera, keyboard, status-bar…) so Vite bundles them.
A regression guard now lives in `tests/nativeShellIntegrity.assert.mjs`.

**This fix only takes effect in a freshly built APK** — see *Step 3* below.

## Current state of the prerequisites

- ✅ **`google-services.json` is present** (`android/app/google-services.json`,
  project `lior-bf6e6`) → the app can obtain an FCM token.
- ✅ **`send-partner-nudge` is on the modern FCM HTTP v1 API** (OAuth2 +
  service account), **not** the legacy `/fcm/send` endpoint Google
  decommissioned in June 2024.

What still remains for **push** (partner alerts while the app is closed) to work
end-to-end is operational only: set the `FCM_SERVICE_ACCOUNT` secret (Step 2) and
deploy the function (Step 3). Local notifications need none of this.

---

## Step 1 — Create a Firebase project (only you can do this)

1. Go to <https://console.firebase.google.com> → **Add project** (name e.g. "Lior").
2. In the project, **Add app → Android**.
   - **Package name:** `com.lior.app`  (must match exactly)
   - App nickname: anything.
3. Download **`google-services.json`**.
4. Place it at: `android/app/google-services.json`
   (the build is already wired to auto-detect it and apply the
   `com.google.gms.google-services` plugin — see `android/app/build.gradle`).

That alone makes the **client** able to register and receive a token.

## Step 2 — Server credentials (FCM HTTP v1)

The legacy server key is gone, so the Edge Function needs a **service account**:

1. Firebase Console → **Project settings → Service accounts → Generate new
   private key** → downloads a JSON file.
2. Add it as a Supabase secret for the Edge Function, e.g.:
   ```bash
   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
   ```
3. The function already exchanges that service account for an OAuth2 access token
   and POSTs to the v1 endpoint
   `https://fcm.googleapis.com/v1/projects/<PROJECT_ID>/messages:send`
   (the `project_id` is read from the service-account JSON automatically).

> ✅ `supabase/functions/send-partner-nudge/index.ts` has been **migrated to FCM
> HTTP v1** — it signs a JWT with the service-account key, gets an OAuth2 token,
> and sends via the v1 API. You only need to (a) set the `FCM_SERVICE_ACCOUNT`
> secret and (b) deploy the function. It can't be end-to-end tested until your
> Firebase project exists, but the code is in place.

## Step 3 — Rebuild & deploy

```bash
# App (after dropping in google-services.json)
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # or assembleRelease for production

# Edge Function (after the v1 rewrite)
supabase functions deploy send-partner-nudge
```

## How to verify

1. Install the new APK, open the app, and accept the notification permission.
2. The app calls `NotificationsService.registerPushToken()` on launch → a row
   should appear in the `device_push_tokens` table (`platform = 'fcm'`).
3. Trigger a partner nudge from the other account → the closed app should receive
   a push.

---

### What's already done in the app (no action needed)
- `@capacitor/push-notifications` installed; `registerPushToken()` requests
  permission, registers, captures the FCM token, and upserts it to
  `device_push_tokens` (migration `20260424000001_device_push_tokens.sql`).
- `POST_NOTIFICATIONS` permission + `ic_notification` icon in the manifest.
- `android/app/build.gradle` conditionally applies the google-services plugin
  when `google-services.json` is present.

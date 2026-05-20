# Push Notifications Setup (partner alerts when the app is closed)

Local notifications (daily reminders, weekly recap, "your film is ready", and the
in-app *Enable notifications* test) work **without** any of this — they were
hardened in the app + Android manifest and ship in the current APK.

**Push / remote notifications** (getting alerted when your partner sends a
heartbeat / nudge / aura while your app is closed) need Firebase. They are
currently non-functional for two reasons:

1. **No `google-services.json`** → the app can't obtain an FCM token, so there's
   nothing to deliver to. (The Android build even logs *"Push Notifications won't
   work."*)
2. **The Supabase `send-partner-nudge` function uses the FCM *legacy* HTTP API**
   (`fcm.googleapis.com/fcm/send` + `FCM_SERVER_KEY`), which **Google
   decommissioned in June 2024**. It must be migrated to **FCM HTTP v1**.

Both must be done for push to work end-to-end.

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
3. The function must exchange that service account for an OAuth2 access token and
   POST to:
   `https://fcm.googleapis.com/v1/projects/<PROJECT_ID>/messages:send`

> ⚠️ `supabase/functions/send-partner-nudge/index.ts` currently calls the dead
> legacy endpoint. It needs a ~30-line rewrite to FCM v1. I can do this rewrite —
> it just can't be *tested* without your Firebase project, so it's a follow-up
> once Step 1 is done.

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

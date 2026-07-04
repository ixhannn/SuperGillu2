# Lior — Launch Readiness Checklist

_Audited 2026-07-03 (backend/security, notifications, store/release, repo state). Status markers:_
`[x]` done in this branch · `[ ]` still to do · `[ext]` needs your dashboard/keys (I can't do it)

The app code is release-healthy: types pass, build is green, icons/splash/deep-links/account-deletion done, no debug backdoors in prod. What remains is release engineering, external config, a monetization decision, and rescuing uncommitted work.

---

## 0. Rescue uncommitted work (do FIRST — not a launch item, a don't-lose-your-work item)
- [x] `20260630000000_fix_membership_select_recursion.sql` — RLS-recursion / blank-app fix. **Rescued + committed `574dd64`** on `claude/gracious-goldwasser-5059aa`, together with its companion `storage.ts` transient-session-wipe guard (both halves of the same blank-app failure). ⚠️ Still LOCAL — `git push` this branch to back it up off-disk, then apply the migration to Supabase.
- [ ] Commit + push the Bonsai branch `claude/admiring-liskov-a21ecc` (4 commits + 2 migrations + `send-partner-nudge` change) — local only, no origin backup.
- [ ] Sweep the other ~21 dirty worktrees (OUR HOME, Daybreak theme reveal, Premium Worlds, RevenueCat wiring) and commit/push the keepers.

## 1. Blocks Play submission
- [ext] Create an upload keystore, add `signingConfigs.release` wired to a git-ignored `key.properties`, enrol in Play App Signing. Today a release build is **unsigned** → Play rejects it.
- [ext] Build the release from a checkout that has the real `.env.local` (5 VITE_ vars). A build without it ships a **dead app** (boots to "configure Supabase"). Then `npx cap sync android`.
- [x] **Privacy + deletion URLs live & verified.** Deployed to Cloudflare (`muddy-leaf-67f4.joinlior.workers.dev`): `/privacy.html`, `/account-deletion.html`, `/`. Content is code-accurate (audited: Gemini AI, FCM, Cloudflare R2, Google Sign-In all disclosed; EXIF/video-metadata honest; no-ads/no-analytics/no-location kept). In-app `views/PrivacyPolicy.tsx` rewritten to match (tsc green). Contact `support.lior@gmail.com`. **Remaining: paste both URLs into Play Console listing + Data Safety form at submission (Data Safety must declare 3rd-party sharing: Google/Gemini + FCM).**

## 2. Must fix before real users
- [x] **Unsigned-media hole closed** — `cloudflare/worker.js` `ALLOW_UNSIGNED_MEDIA = false`. ⚠️ Deploy ordering: ship an app build that mints signed URLs (already implemented in `services/mediaStorage.ts`), THEN `cd cloudflare && wrangler deploy`, THEN Cloudflare → Caching → Purge Everything. See `deploy-security.sh`.
- [x] **Push token cleanup on logout** — `NotificationsService.clearPushTokenForThisDevice()` now runs (awaited, while JWT valid) before `auth.signOut()` in `views/Profile.tsx` and `views/Sync.tsx`. Removes only this device's row. Stops a logged-out/ex-partner device from receiving pushes.
- [x] **Pair-claim brute-force throttle** — migration `20260703000000_pair_claim_rate_limit.sql`: caps 10 claim attempts / 10 min / user, fails closed with `rate_limited` (client message wired in `views/Sync.tsx` + `services/pairing.ts`). _Apply this migration to Supabase._
- [x] **Push secrets set + verified** (project `zogdcuapmnbltdvqsrga`). VAPID pair verified end-to-end (server `VAPID_PUBLIC_KEY` digest == SHA-256 of client `VITE_VAPID_PUBLIC_KEY`). `FCM_SERVICE_ACCOUNT` replaced with a verified-correct key (`type:service_account`, project `lior-bf6e6`, `firebase-adminsdk-fbsvc@lior-bf6e6`).
- [ ] **🔑 ROTATE the FCM service-account key before real users** — private key `ae6be41205…` was pasted through chat, so treat it as exposed. Firebase → Project settings → Service accounts → Keys → delete `ae6be41205…`, generate a fresh one, update the Supabase secret. 60 seconds, invalidates the old key.
- [ ] End-to-end push test between two real accounts: pulse → partner gets FCM push (Invocations log shows `fcm_sent`) → tap opens correct screen → logout → token gone → reinstall → fresh token.

## 3. Should do at launch
- [x] **`allowBackup=false`** in `AndroidManifest.xml` — auth tokens in WebView localStorage no longer restore onto another device via Android backup.
- [ ] **Decide monetization.** Today "Unlock Lior Gold" is a free client-side toggle (`isPremium` in local profile) — bypassable, no server entitlement. RevenueCat wiring exists only on an unmerged branch.
  - _Recommended:_ launch free ("founding couples — Gold free during early access"), but build the **server-side entitlement check now** (RevenueCat webhook → Supabase table checked by RLS) so you can enable billing later without stranding users.
  - _If launching paid:_ merge RevenueCat branch, install plugin, configure Play Console products + RevenueCat dashboard, replace the fake unlock, add server verification.
- [ ] **Add crash reporting** (currently NONE — blind to prod crashes). Sentry recipe below.
- [ ] **Strip EXIF** from photo uploads (currently retains GPS/location). Re-encode via canvas before upload, or note in privacy policy that location metadata isn't retained.

## 4. "Won't cross your mind but bites later"
- [ ] Smoke-test the **minified release AAB on a real Android 13+ device** — R8 can strip reflectively-accessed classes (`LiorHapticsPlugin`, `PartnerWidgetProvider`, `ShareTargetPlugin`).
- [ ] After the media-worker flip, confirm the **home-screen widget** still loads the partner photo (it fetches via `CapacitorHttp` — must use signed URLs now).
- [ ] Tighten CORS in `supabase/functions/_shared/cors.ts` — currently allows *any* `*.joinlior.com` subdomain (subdomain-takeover risk). Whitelist exact subdomains.
- [ ] `versionCode`/`versionName` are hand-maintained in `build.gradle` + `package.json` — bump both every release or Play rejects a duplicate versionCode.
- [ ] Verify CI is actually green (known pre-existing `productionReadiness` test failure on main).
- [ ] Add push triggers for messages + bonsai/pet watering (currently realtime-only — offline partner never notified). Post-launch polish.
- [ ] Plan FCM service-account key rotation (~90 days).
- [ ] **Apply pending migrations to Supabase + redeploy `send-partner-nudge`.** Ordered idempotent bundle prepared at `scratchpad/APPLY_PENDING_MIGRATIONS.sql` (5 migrations: partner_lifecycle → client_error_logs_ensure → recursion_fix → bonsai_events → bonsai_plant_events). Apply via **Supabase Dashboard → SQL Editor** (NOT `supabase db push` — prod history already has `20260611000000`, so a push would skip `partner_lifecycle` and error on the duplicate version). Then deploy the updated function (adds a `bonsai` push type) from `scratchpad/send-partner-nudge_index.ts` via `supabase functions deploy send-partner-nudge` or the dashboard Edge Functions editor. _Can't be done from the agent session — no CLI/link/privileged creds; anon key can't run DDL._

---

## Sentry setup recipe (crash reporting)
_Deferred as a recipe rather than committed blind — it adds a sizable dependency (bundle-budget risk) and needs your DSN. Apply when ready:_

```bash
npm install @sentry/capacitor @sentry/react
```
Add `VITE_SENTRY_DSN=...` to `.env.local` (from sentry.io project settings). Create `services/observability.ts`:
```ts
import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';

export function initObservability(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // no-op when unset (dev / not configured)
  Sentry.init({ dsn, tracesSampleRate: 0.1, release: `lior@${import.meta.env.VITE_APP_VERSION ?? 'dev'}` }, SentryReact.init);
}
```
Call `initObservability()` once at the top of `index.tsx` (before render). Then re-run `npm run build` and `node scripts/check-bundle-budget.mjs` — if the budget fails, lazy-init Sentry after first paint instead of at boot.

---

## Suggested order
1. Rescue uncommitted work (§0) — commit + push, esp. the RLS migration.
2. Apply pending migrations to Supabase (incl. the new pair-claim throttle) + redeploy `send-partner-nudge`.
3. Set push secrets → run the end-to-end push test.
4. Add Sentry.
5. Keystore + signing; host privacy/deletion pages.
6. Decide monetization.
7. Build signed minified AAB from a checkout with `.env.local`; smoke-test on device.
8. Fill Play data-safety form; submit.

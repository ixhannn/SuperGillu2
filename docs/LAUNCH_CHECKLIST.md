# Lior — Launch Readiness Checklist

_Re-audited 2026-07-05 against HEAD `d3edcd3` (post "consolidate launch fixes" merge) by an 8-dimension multi-agent sweep, with every blocker/high finding adversarially re-verified against the current code. This supersedes the 2026-07-03 audit — several items it listed as "todo" are now done._

**Status markers:** `[x]` done in code · `[ ]` still to do · `[ext]` needs your dashboard/keys (can't be done from the repo) · `[decision]` a product/business call.

**Bottom line:** The app code is in good shape. Most prior P0s are closed (media signing, IDOR, CORS, onboarding pairing, RLS recursion fix, logout hygiene). `npm test` (56 suites) and `tsc` are green. What's left is mostly **release-engineering + external ops + one product decision (monetization) + an analytics gap** — not app-code defects.

---

## 0. TRUE blockers — app breaks for real users OR Play rejects the submission

- [ ] `[ext]` **Apply pending migrations to prod** via the Supabase SQL Editor, in ascending filename order (do NOT use `supabase db push` — prod history was hand-repaired and has short unpadded ids; a push can skip/duplicate). If `20260630000000_fix_membership_select_recursion.sql` isn't live → **blank app** (42P17 recursion). If `20260702000000_bonsai_events.sql` / `..000001_bonsai_plant_events.sql` aren't live → the Bonsai view errors. Also apply `20260703000000_pair_claim_rate_limit.sql` and `20260611000000_client_error_logs.sql`. All are additive + idempotent (safe to run). Spot-check afterward that `bonsai_events`, `pair_claim_attempts`, `client_error_logs`, `daily_answers`, `daily_drops` tables and `public.delete_my_account` exist.
- [ ] `[ext]` **Create an upload keystore + enrol in Play App Signing.** Signing is correctly wired to a git-ignored `key.properties` with a safe absent-keystore fallback (`android/app/build.gradle`), but with no keystore the release AAB is **unsigned → rejected**. `keytool -genkeypair -v -keystore lior-upload.jks -alias lior -keyalg RSA -keysize 2048 -validity 10000`, create `android/key.properties`, and **back the keystore + passwords up offline** (losing it blocks all future updates).
- [ ] `[ext]` **Build the web bundle with a real `.env.local`** (5 `VITE_` vars, see `.env.example`) BEFORE `npm run build` → `npx cap sync android`. A build without it ships a dead "configure Supabase" app.
- [x] **ProGuard keep rules added** (`android/app/proguard-rules.pro`). R8/minify is on for release; the file was previously empty, risking silent renaming of the reflectively-invoked Capacitor `@PluginMethod`s → haptics / partner widget / share-to-Lior would break only in the release AAB (invisible with no crash reporting). Capacitor + `com.lior.app.**` + `@PluginMethod` keeps are now in place. **You must still smoke-test a signed release AAB on a real device** (haptics, widget, share) to confirm.
- [ ] `[ext]` **Public privacy + account-deletion URLs live & reachable without login.** Play requires a public deletion URL in addition to the in-app path (the in-app deletion is fully implemented and real). Confirm the Cloudflare pages open in an incognito browser with no login, then paste both into Play Console → App content → Data safety → Data deletion.
- [ ] `[ext]` **Complete the Play Data Safety form + IARC content rating** (see §4 for the exact declarations).

## 1. High — fix before real users (mostly external ops)

- [ ] `[ext]` **Rotate the FCM service-account key** (it transited chat during setup → treat as compromised; it can mint push to all users). Firebase → Service accounts → Keys → delete the old one, generate a new one, update the `FCM_SERVICE_ACCOUNT` Supabase secret. ~60 seconds.
- [ ] `[ext]` **Redeploy `send-partner-nudge`.** It gained a `bonsai` push type after the last prod deploy; until redeployed, watering the shared tree never notifies an offline partner (the daily loop the app is built around). `supabase functions deploy send-partner-nudge`.
- [x] **`npm test` is green** — the 2 failing suites are fixed: `BonsaiBloom.tsx` now uses the shared `daysTogetherFrom()` date-only helper (was a local duplicate), and `privateSpaceSurfaceContinuity.assert.mjs` was repointed at the refactored `views/viewSurfaces.ts`. All 56 suites pass; `tsc` clean.
- [ ] `[decision]` **Analytics / observability** — you are launching blind (§3). Decide the stack and instrument it.
- [ ] `[decision]` **Monetization** — "Lior Gold" is a free, bypassable client toggle with no server entitlement (§2). Decide free-vs-paid and whether to land the server-entitlement scaffold now.
- [ ] `[ext]` **End-to-end test on two real devices**: pair (QR + code + deep link) → daily ritual reveal → partner push → logout → token gone → reinstall → fresh token.

## 2. Monetization (decision)

- [x] Premium features (Our Story film, Date Studio, Depths, Duets, Love Missions, Heirlooms, unlimited voice/letters/memories) are **fully implemented client features**, gated on a single `isPremium` boolean on the local/synced `CoupleProfile`.
- [x] The upsell modal already reads **"Gold is free during early access"** — the UX is internally consistent with a **free launch** today (no store config needed).
- [ ] `[decision]` **"Unlock Lior Gold" is a free, forgeable local toggle** (`components/PremiumModal.tsx` `handleUpgrade` just writes `isPremium: true`; gate is `services/premiumFeatures.ts:94`). No RevenueCat / Play Billing SDK is wired anywhere (the old "RC wiring may exist" note is false). This is only a blocker if you launch **paid**.
- [ ] **Recommended:** launch **free** ("founding couples — Gold free"), and land a **server-side entitlement scaffold now** — a `couple_entitlements(couple_id pk, tier, active, source, granted_at, expires_at)` table with RLS so a couple can READ but never WRITE its row (writes only via a trusted edge function / future RevenueCat webhook). Derive `isPremium` from it (local flag as optimistic cache only). This is the one piece that's painful to retrofit and strands founding couples if skipped. Also relabel the CTA to something honest ("Activate Gold — free for founding couples").

## 3. Analytics & Observability — WIRED (env-gated; off until you add keys)

Built this session. All three destinations are a complete no-op until their env keys are set, so the app ships safely as-is; flip them on when ready.

- [x] **First-party `app_events`** — `services/analytics.ts` `Analytics.track()` writes to a Supabase `app_events` table (migration `20260706000000_app_events.sql`, insert-only RLS, same model as `client_error_logs`). Six events instrumented: `onboarding_complete` (Onboarding finalize), `pair_invite_sent` + `pair_joined` (centralized in `services/pairing.ts`), `ritual_completed` (`DailyQuestion`), `app_open` (App boot + resume), `premium_tap` (`PremiumModal`).
- [x] **PostHog** (product analytics) — loaded via the official env-gated loader in `services/analytics.ts` with autocapture / auto-pageviews / session-replay all OFF, anonymous (so it also captures the pre-sign-in funnel the first-party sink can't).
- [x] **Behavioral / engagement tracking** — every screen change emits `screen_view` + `$pageview` (synthetic `/app/<view>` URL) and, on leaving, `screen_leave` + `$pageleave` with **dwell time**; app backgrounding emits `app_background` with the screen the user left on + session length. This powers PostHog's "most-used screens," "time spent per screen," "where they drop off," and **User Paths** insights. Verified live (background/foreground events fire with correct payloads).
- [x] **Sentry** (crash reporting) — `services/observability.ts` loads the Sentry Loader Script when configured; `ErrorBoundary` forwards React render crashes via `captureException()`. JS-layer only for now.
- [x] CSP in `index.html` allows the PostHog + Sentry hosts (inert unless keys are set); `.env.example` documents the vars.
- [x] The first-party error sink (`client_error_logs`) still runs alongside — your private diagnostics.
- [ ] `[ext]` **To turn it on:** create a PostHog project + a Sentry project, put `VITE_POSTHOG_KEY` (+ `VITE_POSTHOG_HOST`) and `VITE_SENTRY_DSN` in `.env.local`, and apply the `app_events` migration to prod.
- [ ] `[decision]` **Reword the privacy policy before enabling PostHog/Sentry.** `views/PrivacyPolicy.tsx:116` says _"no analytics ... no third-party crash-reporting"_ — adding either contradicts it. Update that line + the hosted page, and declare PostHog/Sentry in the Play Data Safety form. (The first-party `app_events` ledger alone does NOT add a third-party tracker, so it can ship without a policy change.)
- [ ] Verify on device with real keys (headless preview can't exercise the CDN loaders / native network).
- [ ] _Later:_ for native Android crash capture, swap the Sentry Loader for bundled `@sentry/capacitor` + `@sentry/react` (public API stays the same) and you can tighten `script-src` back to `'self'` by reverse-proxying PostHog.

## 4. Play Console — external form-filling (specify, then submit)

- [ ] `[ext]` **Data Safety form.** Collected: email (+ Google id token), name/partner name/dates/prefs, photos/videos/voice notes/text notes/letters/moods/answers, device push token, diagnostics (error msg + app version + UA, linked to account), login IP/email. **Shared with 3rd parties:** Google/Gemini AI (partner first names, relationship-age, happiness, recent memory+note text — `supabase/functions/pet-dialogue/index.ts`), Google FCM (push token + partner first name), Google Sign-In. Encrypted in transit = yes. Deletion available = yes. Declare AD_ID **present but not used for tracking** (it enters transitively via FCM — answering "absent" when the merged manifest contains it triggers a flag). Do NOT declare location/contacts/ads.
- [ ] `[ext]` **Content rating (IARC)** — private user-generated media + romantic content → likely Teen/Mature 17+. Set **Target audience to adults 18+** (matches `PrivacyPolicy.tsx:161`); do NOT opt into Designed for Families.
- [ ] `[ext]` **Permission justifications** — CAMERA + READ_MEDIA_* = attach photos/videos to memories; RECORD_AUDIO = voice notes; POST_NOTIFICATIONS = partner alerts. No Permissions Declaration Form needed (deliberately no exact-alarm / location / background-location / QUERY_ALL_PACKAGES). Confirm `RECORD_AUDIO` is actually used, or drop it.
- [ ] `[ext]` **Store-listing assets** — 512×512 icon, 1024×500 feature graphic, 2–8 phone screenshots, short (≤80) + full (≤4000) descriptions. List app as **Free, no IAP** for this launch.

## 5. Medium — fast-follows (fine to ship without; fix soon after)

- [ ] **Singleton clobber, remaining 5 collections.** `couple_profile` merge is hardened for streak/bonsai/questions/duets (`services/storage.ts:2217-2288`), but `missionState`, `datePlans`, `depthsState`, `heirloomState`, `missedAuras` are still last-writer-wins on the singleton row (documented KNOWN LIMITATION at `storage.ts:2260-2272`). A cross-partner race can drop one partner's edit. Needs per-item tombstones/CRDT like the daily-ritual/bonsai paths got.
- [ ] **Local-fallback ritual reveal keys by display name, not user_id** (`services/storage.ts:2885-2886`, `services/dailyRitual.ts:164-177`). Only bites if the `daily_answers` sealed-reveal migration isn't applied in prod (covered by §0). Longer-term, key the local map by user_id.
- [ ] **Video uploads retain embedded GPS/EXIF** (stills are stripped via `utils/media.ts` re-encode). Strip video metadata server-side or keep the honest disclosure in the policy (`PrivacyPolicy.tsx:133-134`).
- [ ] **CORS residual wildcard** — `supabase/functions/_shared/cors.ts:19` still matches any `*.joinlior.com` subdomain (and the worker reflects any origin). Acceptable while you control the domain; tighten to exact hosts before broad web exposure.
- [ ] **versionCode automation** — `versionCode 20100` / `versionName "2.1.0"` are consistent and match `package.json`, but hand-maintained. Bump `versionCode` on every AAB (Play rejects duplicates); optionally derive it from `package.json`.
- [ ] Optional: make `tests/run-assertions.mjs` aggregate failures (currently fail-fast — the first red suite hides the rest).

## 6. Verified DONE (don't chase these — prior notes are stale)

- [x] Media signing **enforced** (`ALLOW_UNSIGNED_MEDIA=false`; unsigned GET → 403; client mints signed URLs). Unauth-media/IDOR P0 **closed**; `media-proxy`/`sign-media` enforce couple ownership, fail closed. _(Confirm the same `MEDIA_URL_SIGNING_SECRET` is set on both the edge function and the worker in prod, then smoke-test one image load.)_
- [x] CORS is an allowlist that fails closed (the "wildcard subdomain" checklist item was stale — see §5 for the residual).
- [x] Pairing is reachable from onboarding (final CTA → Sync hub); deep-link invites auto-claim. Prior "pairing missing from onboarding" is fixed.
- [x] Daily ritual is a real reveal-gated two-person mechanic (same seeded question both sides, RLS-gated reveal, streak counts only mutual days — no solo inflation). Solo/unpaired first-use degrades gracefully (no blank screens).
- [x] Logout drops this device's push token while JWT valid, then signs out + wipes session; account deletion purges local + R2 + auth user. `allowBackup=false`, `webContentsDebuggingEnabled=false`.
- [x] No private keys / service-role JWTs committed (`google-services.json` holds only public client config — safe to commit).
- [x] `compileSdk`/`targetSdk = 36` (exceeds Play floor), `minSdk 24`; icons/adaptive-icons/splash present; manifest permissions clean (no location/exact-alarm; POST_NOTIFICATIONS present).
- [x] Backend RLS posture sound — every app table has RLS; the 2 RLS-disabled tables are internal ledgers with grants revoked. No destructive migrations (migration-time DELETEs only prune orphans).
- [x] Privacy policy content is accurate to real data flows; Terms + Privacy reachable pre-login. `productionReadiness` test now passes.

---

## Suggested order
1. Apply pending migrations to prod (§0) — especially the recursion fix + bonsai tables. Redeploy `send-partner-nudge`. Rotate the FCM key.
2. Decide monetization (free + entitlement scaffold recommended) and analytics stack; build the first-party `app_events` + wire the tracker(s).
3. Keystore + Play App Signing. Confirm the public privacy/deletion URLs are live.
4. Create real `.env.local` → `npm run build` → `npx cap sync android` → build the **signed** release AAB.
5. Smoke-test the release AAB on a real Android 13+ device: pairing, daily ritual + push, **haptics, partner widget, share-to-Lior** (the R8-sensitive paths), image load.
6. Fill Data Safety + content rating + store listing; submit.

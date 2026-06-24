# Native Google Sign-In — setup checklist

The app signs in with Google using the **OS-level account picker** (Android
Credential Manager via `@capgo/capacitor-social-login`), not a browser redirect.
The account chooser appears *inside* the app; the returned Google ID token is
exchanged for a Supabase session with `supabase.auth.signInWithIdToken()`.

The **code** is done. What remains is **configuration** in Google Cloud,
Supabase, and the build env. Native Google sign-in fails if any of these are
missing — work through them in order.

> ✅ **If you already created the Web + Android OAuth clients in Google project
> `220998279719` and set the Supabase fields + `VITE_GOOGLE_WEB_CLIENT_ID`, you
> are done** — this doc is the reference / for a fresh machine.

## ⚠️ Two different Google projects — don't mix them up

This app touches **two** Google projects, and the OAuth clients for sign-in must
go in the **first** one:

| Project | Number | Used for |
|---|---|---|
| **Sign-in (OAuth)** | **`220998279719`** | The **Web + Android OAuth clients** used by the native picker and Supabase. This is where the live web client `220998279719-4sbngq8….apps.googleusercontent.com` lives. |
| **Firebase / Push** | `lior-bf6e6` / `372560896422` | `android/app/google-services.json`, for **FCM push only**. **Not used by Google sign-in.** |

> 🔑 Credential Manager only hands your app a token if an **Android OAuth client
> in the SAME project as the Web client** (`220998279719`) matches your package +
> signing SHA-1. Putting the Android client in the Firebase project (`372560896422`)
> will NOT work — it causes "developer error / error 10 / no credentials".

> Build prereq: run **`npm install && npx cap sync android`** before building so
> the plugin is registered in the cap-sync Gradle files
> (`android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`).
> Android package: **`com.lior.app`**.

---

## 1. Google Cloud Console — create OAuth clients (project `220998279719`)

Open https://console.cloud.google.com/apis/credentials and **select project
`220998279719`** (the one that already contains the "Lior Supabase OAuth" web
client). Configure the **OAuth consent screen** (External; add your test users
while in "Testing") if you haven't. You need **two** OAuth 2.0 Client IDs:

### a) Web application client → this is `VITE_GOOGLE_WEB_CLIENT_ID`
You likely already have this — the existing **"Lior Supabase OAuth"**
(`220998279719-4sbngq8….apps.googleusercontent.com`). Reuse it; don't make a new one.
- Type: **Web application**
- Authorized redirect URIs include your Supabase callback
  `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback` (for the web/email flows).
- This Client ID is what the native picker sends as `serverClientId` AND what
  Supabase validates the token against, so the two must match.

### b) Android client → authorizes THIS app to receive Google credentials
- Type: **Android**
- Package name: `com.lior.app`
- SHA-1 certificate fingerprint: add your debug SHA-1 (and release, if you have
  one — see step 2). You don't reference this client's ID anywhere; it just has
  to exist in project `220998279719`.

---

## 2. Get your SHA-1 fingerprints

Easiest (prints the debug SHA-1):
```powershell
cd android
.\gradlew signingReport
```
Use the `SHA1:` under `Variant: debug`. Or via keytool (Windows path):
```powershell
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```
**Release** (only if you ship a signed release build):
```powershell
keytool -list -v -keystore "C:\path\to\release.keystore" -alias <your-alias>
```
Copy each `SHA1:` into the Android OAuth client (step 1b). If you use **Google
Play App Signing**, also add the **App signing key** SHA-1 from Play Console →
Setup → App signing, or sign-in breaks for Play installs.

---

## 3. `google-services.json` — nothing to do for sign-in

`android/app/google-services.json` belongs to the **Firebase project
(`372560896422`)** and is used for **FCM push only**. Credential Manager never
reads it, and its `oauth_client` array staying empty is expected — it does **not**
need OAuth clients and you do **not** need to re-download it for Google sign-in.
(Leave it as-is; it's already correct for push.)

---

## 4. Supabase Dashboard — Google provider

**Authentication → Providers → Google** (enable it):
- **Client ID (for OAuth)**: the **Web** client ID from step 1a.
- **Client Secret**: the Web client secret from step 1a.
- **Authorized Client IDs** (validates native ID tokens): include the **Web**
  client ID `220998279719-4sbngq8….apps.googleusercontent.com`. (The native token's
  audience is the Web client ID, so that's the one that must be listed.)
- **Skip nonce check**: leave **OFF**. The app sends a hashed nonce to Google and
  the matching raw nonce to Supabase. (Only enable as a last resort if you hit a
  `nonce` mismatch.)

**Authentication → URL Configuration:**
- **Redirect URLs** — add `com.lior.app://auth/callback` (and `com.lior.app://**`).
  Required for native **email confirmation / password reset** deep links and the
  browser fallback. Without it those flows bounce to the Site URL — which is why
  the old flow landed on `localhost`.
- **Site URL** — set to your real web URL, not `http://localhost:3000`.

---

## 5. App build env

Add the **Web** client ID to your environment (`.env.local`, plus CI/build
secrets). See `.env.example`:
```
VITE_GOOGLE_WEB_CLIENT_ID=220998279719-4sbngq8….apps.googleusercontent.com
```
If unset, the app falls back to the browser-redirect flow on native, so set it
before building the release APK.

---

## 6. Build & install

```powershell
npm install                 # pulls @capgo/capacitor-social-login into node_modules
npx cap sync android        # registers the native plugin into the Gradle project
# then build the APK (Android Studio, or: cd android; .\gradlew assembleDebug)
```

**Install the APK signed with the SAME keystore whose SHA-1 you registered** in
step 1b — a debug-signed build won't authenticate against a release-only SHA-1
(and vice-versa). The device must have at least one Google account added.

---

## Quick failure guide

| Symptom | Most likely cause |
|---|---|
| Picker opens, then "developer error" / error 10 / "no credentials" — **even though you're signed into Google** | The Android OAuth client (package + SHA-1) is missing, in the **wrong project** (must be `220998279719`, not the Firebase one), or you installed a build signed with an unregistered keystore |
| "Couldn't use Google sign-in… make sure you're signed in" | Either no Google account on the device, **or** the SHA-1/package isn't registered (same cause as above) |
| Picker works, but app not signed in; Supabase error | Web client ID not in Supabase **Authorized Client IDs**, or provider disabled (step 4) |
| `nonce` mismatch error from Supabase | Last-resort: enable **Skip nonce check** (step 4) |
| "Sign-in timed out" | Network stalled during the token exchange — retry on a better connection |
| Falls back to browser and lands on `localhost` | `VITE_GOOGLE_WEB_CLIENT_ID` unset (using fallback) **and** Redirect URLs missing the custom scheme (step 5/4) |
| Email confirm / password reset link doesn't open the app | `com.lior.app://auth/callback` missing from Redirect URLs (step 4) |

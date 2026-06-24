# Native Google Sign-In — setup checklist

The app now signs in with Google using the **OS-level account picker** (Android
Credential Manager via `@capgo/capacitor-social-login`), not a browser redirect.
The account chooser appears *inside* the app; the returned Google ID token is
exchanged for a Supabase session with `supabase.auth.signInWithIdToken()`.

The **code** is done. What remains is **configuration** that must be created in
Google Cloud, Supabase, and the build env. Native Google sign-in fails silently
if any of these are missing — work through them in order.

> ⚠️ **You MUST run `npm install && npx cap sync android` before building.** The
> plugin is declared in `package.json` but is not yet registered in the
> cap-sync-generated Gradle files (`android/capacitor.settings.gradle`,
> `android/app/capacitor.build.gradle`). Until you run `cap sync`, the native
> plugin won't be compiled into the APK and the picker will fail at runtime.

> Firebase/Google Cloud project: **lior-bf6e6** (project number `372560896422`),
> Android package **`com.lior.app`**.

---

## 1. Google Cloud Console — create OAuth clients

Open https://console.cloud.google.com/apis/credentials for project **lior-bf6e6**.
First configure the **OAuth consent screen** (External, add your test users while
in "Testing") if you haven't. Then create **two** OAuth 2.0 Client IDs:

### a) Web application client  → this is `VITE_GOOGLE_WEB_CLIENT_ID`
- Type: **Web application**
- Authorized redirect URIs: add your Supabase callback
  `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback`
  (used by the web/email flows; harmless to include for native).
- Copy the **Client ID** (`372560896422-….apps.googleusercontent.com`) and the
  **Client secret**. The Client ID is what the native picker AND Supabase use.

### b) Android client  → authorizes THIS app to receive Google credentials
- Type: **Android**
- Package name: `com.lior.app`
- SHA-1 certificate fingerprint: add **both** your debug and release SHA-1
  (see step 2). You can add multiple Android clients or multiple SHA-1s.

> Why both: Credential Manager hands a token to your app only if an Android
> OAuth client in the **same project** matches the app's package + signing
> certificate. A missing/mismatched SHA-1 is the #1 cause of "developer error /
> error 10 / no credentials available".

---

## 2. Get your SHA-1 fingerprints

**Debug** (the keystore Android Studio uses for debug builds):
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```
On Windows the path is `%USERPROFILE%\.android\debug.keystore`.

**Release** (the keystore you sign the published APK/AAB with):
```bash
keytool -list -v -keystore /path/to/your/release.keystore -alias <your-alias>
```
Or, from the final signed APK you actually install:
```bash
keytool -printcert -jarfile android/app/release/app-release.apk
```
Copy the `SHA1:` value(s) into the Android OAuth client (step 1b).

> If you use Google Play **App Signing**, also add the **App signing key** SHA-1
> from Play Console → Setup → App signing, or sign-in breaks for Play installs.

---

## 3. Re-download `google-services.json`

After adding the Android client + SHA-1, in **Firebase Console → Project
settings → your Android app**, download the fresh `google-services.json` and
replace `android/app/google-services.json` (the current one has an empty
`oauth_client` array). FCM/push already use this file; keep it current.

---

## 4. Supabase Dashboard — Google provider

**Authentication → Providers → Google** (enable it):
- **Client ID (for OAuth)**: the **Web** client ID from step 1a.
- **Client Secret**: the Web client secret from step 1a.
- **Authorized Client IDs** (the list used to validate native ID tokens): put the
  **Web client ID first**. If you also want to accept the raw Android client id,
  append it comma-separated (web first):
  `372560896422-WEB….apps.googleusercontent.com,372560896422-ANDROID….apps.googleusercontent.com`
- **Skip nonce check**: leave **OFF**. Our code sends a proper hashed nonce to
  Google and the matching raw nonce to Supabase. (Only turn this ON as a last
  resort if you hit `nonce` mismatch errors.)

**Authentication → URL Configuration:**
- **Redirect URLs** — add `com.lior.app://auth/callback` and `com.lior.app://**`.
  (Required for native **email confirmation / password reset** deep links and the
  browser fallback path. Without it Supabase bounces those flows to the Site URL —
  which is why the old flow landed on `localhost`.)
- **Site URL** — set to your real web URL, not `http://localhost:3000`.

---

## 5. App build env

Add the Web client ID to your environment (e.g. `.env.local`, and your CI/build
secrets). See `.env.example`:
```
VITE_GOOGLE_WEB_CLIENT_ID=372560896422-xxxxxxxxxxxx.apps.googleusercontent.com
```
If this is unset, the app automatically falls back to the old browser-redirect
flow on native, so set it before building the release APK.

---

## 6. Build & install

```bash
npm install                 # pulls @capgo/capacitor-social-login into node_modules
npx cap sync android        # wires the native plugin + updated capacitor.config
# then build the APK as usual (Android Studio or your gradle pipeline)
```

**Install the APK signed with the SAME keystore whose SHA-1 you registered** in
step 1b — a debug-signed build won't authenticate against a release-only SHA-1
(and vice-versa). The device must have at least one Google account added.

---

## Quick failure guide

| Symptom | Most likely cause |
|---|---|
| Picker opens, then "developer error" / error 10 / "no credentials" | SHA-1 / package not registered as an **Android** OAuth client in the same project (step 1b/2), or wrong keystore installed |
| Picker works, but app not signed in; Supabase error | Web client ID not in Supabase **Authorized Client IDs**, or provider disabled (step 4) |
| `nonce` mismatch error from Supabase | Last-resort: enable **Skip nonce check** (step 4) |
| Falls back to browser and lands on `localhost` | `VITE_GOOGLE_WEB_CLIENT_ID` unset (using fallback) **and** Redirect URLs missing the custom scheme (step 5/4) |
| Email confirm / password reset link doesn't open the app | `com.lior.app://auth/callback` missing from Redirect URLs (step 4) |

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run the app locally

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. If you want cloud sync, provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` or use a previously saved in-app Supabase configuration.
3. If you want server-side pet dialogue, set `GEMINI_API_KEY` as a Supabase Edge Function secret for `supabase/functions/pet-dialogue`.
4. If you use the Cloudflare media worker, deploy `cloudflare/worker.js` and set the worker secrets from `cloudflare/wrangler.toml`. Client media writes now authenticate with the active Supabase session; there is no client-side upload secret.
5. Run the app:
   `npm run dev`

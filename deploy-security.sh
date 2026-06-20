#!/usr/bin/env bash
# ============================================================================
# One-shot deploy for the security batch: edge functions + Cloudflare worker.
# (The 2 DB migrations are applied separately — just paste them in the Supabase
#  SQL editor, or run `supabase db push`. This script does NOT touch the DB.)
#
# ONE-TIME SETUP (only the first time, in Git Bash):
#   npm install -g supabase        # Supabase CLI
#   supabase login                 # opens a browser to log in
#   supabase link --project-ref <YOUR_PROJECT_REF>   # ref is in your Supabase URL / dashboard
#   npm install -g wrangler        # Cloudflare CLI
#   wrangler login                 # opens a browser to log in
#
# THEN, each deploy — set these three values and run the script:
#   export MEDIA_URL_SIGNING_SECRET="$(openssl rand -hex 32)"   # generate once; reused everywhere
#   export R2_WORKER_URL="https://<your-worker-domain>"          # your worker's public URL
#   export CLEANUP_INTERNAL_TOKEN="<your existing worker cleanup token>"
#   bash deploy-security.sh
#
#   ^ Save MEDIA_URL_SIGNING_SECRET somewhere safe — the worker and Supabase MUST
#     use the exact same value, which this script guarantees by setting both.
# ============================================================================
set -euo pipefail

: "${MEDIA_URL_SIGNING_SECRET:?Set MEDIA_URL_SIGNING_SECRET first, e.g.  export MEDIA_URL_SIGNING_SECRET=\$(openssl rand -hex 32)}"
: "${R2_WORKER_URL:?Set R2_WORKER_URL to your worker's public URL}"
: "${CLEANUP_INTERNAL_TOKEN:?Set CLEANUP_INTERNAL_TOKEN to your worker's existing cleanup token}"

echo "==> [1/3] Supabase secrets"
supabase secrets set \
  MEDIA_URL_SIGNING_SECRET="$MEDIA_URL_SIGNING_SECRET" \
  R2_WORKER_URL="$R2_WORKER_URL" \
  CLEANUP_INTERNAL_TOKEN="$CLEANUP_INTERNAL_TOKEN"

echo "==> [2/3] Supabase edge functions"
supabase functions deploy sign-media
supabase functions deploy media-proxy
supabase functions deploy delete-account
supabase functions deploy pet-dialogue

echo "==> [3/3] Cloudflare worker"
(
  cd cloudflare
  printf '%s' "$MEDIA_URL_SIGNING_SECRET" | wrangler secret put MEDIA_URL_SIGNING_SECRET
  wrangler deploy
)

cat <<'NEXT'

✅ Functions + worker deployed (worker is in DUAL-ACCEPT, so nothing breaks).

Still to do by hand:
  • DB migrations (if not done): paste the two SQL blocks in the Supabase SQL editor,
    or run:  supabase db push
  • Supabase Dashboard -> Authentication -> Rate Limits: tighten
  • AFTER your app build ships and users update, close the media read-hole:
      1. edit cloudflare/worker.js -> set  ALLOW_UNSIGNED_MEDIA = false
      2. (cd cloudflare && wrangler deploy)
      3. Cloudflare dashboard -> Caching -> Purge Everything
NEXT

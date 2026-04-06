-- Auth rate limiting table.
-- Rows are written by the auth-proxy Edge Function using the service role key,
-- so RLS cannot be used to bypass the limit from the client.
-- Records are auto-purged by the Edge Function after 2× the rate-limit window.

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier   text        NOT NULL,   -- 'ip:<addr>' or 'email:<email>'
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast window queries
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup
  ON auth_rate_limits (identifier, attempted_at);

-- No RLS — only the service role (Edge Function) writes here.
-- Client anon key has no access.
ALTER TABLE auth_rate_limits DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON auth_rate_limits FROM anon, authenticated;

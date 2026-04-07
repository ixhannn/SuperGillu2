-- QR-based account pairing
-- A user generates a short-lived invite code; their partner scans and claims it.
-- Once claimed, both sides store each other's user_id for real data linking.

CREATE TABLE IF NOT EXISTS pair_invites (
  code        TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL,
  user_name   TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  claimed_by  UUID,
  claimed_at  TIMESTAMPTZ
);

ALTER TABLE pair_invites ENABLE ROW LEVEL SECURITY;

-- Only the owner can insert their own row
DROP POLICY IF EXISTS "pair_invites_insert" ON pair_invites;
CREATE POLICY "pair_invites_insert"
  ON pair_invites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Read only own or claimed invites
DROP POLICY IF EXISTS "pair_invites_select" ON pair_invites;
CREATE POLICY "pair_invites_select"
  ON pair_invites FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = claimed_by);

-- Any authenticated user can claim an unclaimed, unexpired row
DROP POLICY IF EXISTS "pair_invites_update" ON pair_invites;
CREATE POLICY "pair_invites_update"
  ON pair_invites FOR UPDATE TO authenticated
  USING (claimed_by IS NULL AND expires_at > NOW())
  WITH CHECK (claimed_by = auth.uid() AND expires_at > NOW());

-- Owner can delete their own rows (e.g. refresh generates a new one)
DROP POLICY IF EXISTS "pair_invites_delete" ON pair_invites;
CREATE POLICY "pair_invites_delete"
  ON pair_invites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-cleanup: remove expired rows older than 24h (run via pg_cron or manually)
-- SELECT cron.schedule('cleanup-pair-invites', '0 * * * *',
--   $$DELETE FROM pair_invites WHERE expires_at < NOW() - INTERVAL '1 day'$$
-- );

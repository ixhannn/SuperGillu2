-- Device push tokens: persists FCM (Android/iOS) and VAPID (web PWA) push
-- tokens so the send-partner-nudge Edge Function can reach either partner's
-- device after they record a signal.

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id          TEXT        NOT NULL,   -- '{user_id}:{device_id}' composite key
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id   UUID        NOT NULL,
  token       TEXT        NOT NULL,
  platform    TEXT        NOT NULL DEFAULT 'fcm',  -- 'fcm' | 'web'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

-- Both partners can read each other's tokens (Edge Function uses service role
-- but the client can also look up partner's token for optimistic local check).
CREATE POLICY "couple members read tokens"
  ON device_push_tokens FOR SELECT
  USING (
    couple_id IN (
      SELECT couple_id FROM couple_memberships WHERE user_id = auth.uid()
    )
  );

-- Users can only write their own tokens.
CREATE POLICY "users write own tokens"
  ON device_push_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own tokens"
  ON device_push_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users delete own tokens"
  ON device_push_tokens FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_push_tokens_couple  ON device_push_tokens(couple_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user    ON device_push_tokens(user_id);

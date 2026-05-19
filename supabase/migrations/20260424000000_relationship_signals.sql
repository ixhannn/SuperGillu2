-- Relationship signals: cross-device sync for partner intelligence.
-- Stores pulse checks, micro-gratitudes, and weekly reflections from both
-- partners so the RelationshipModel can compute accurate reciprocity and
-- closeness regardless of which device recorded the signal.

CREATE TABLE IF NOT EXISTS relationship_signals (
  id            TEXT        NOT NULL,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id     UUID        NOT NULL,
  signal_type   TEXT        NOT NULL,   -- 'pulse_check' | 'micro_gratitude' | 'weekly_reflection'
  data          JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

ALTER TABLE relationship_signals ENABLE ROW LEVEL SECURITY;

-- Both partners in a couple can read each other's signals.
CREATE POLICY "couple members read signals"
  ON relationship_signals FOR SELECT
  USING (
    couple_id IN (
      SELECT couple_id FROM couple_memberships WHERE user_id = auth.uid()
    )
  );

-- Each user can only write their own signals.
CREATE POLICY "users write own signals"
  ON relationship_signals FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own signals"
  ON relationship_signals FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users delete own signals"
  ON relationship_signals FOR DELETE
  USING (user_id = auth.uid());

-- Indexes for partner data queries
CREATE INDEX IF NOT EXISTS idx_rel_signals_couple   ON relationship_signals(couple_id);
CREATE INDEX IF NOT EXISTS idx_rel_signals_user     ON relationship_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_rel_signals_type     ON relationship_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_rel_signals_created  ON relationship_signals(created_at DESC);
-- Composite index for the partner-signals fetch (couple + not-me + recent)
CREATE INDEX IF NOT EXISTS idx_rel_signals_partner  ON relationship_signals(couple_id, user_id, created_at DESC);

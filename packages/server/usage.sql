CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'day')),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 1),
  PRIMARY KEY (user_id, window_type, window_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_provider_subject_idx ON account (providerId, accountId);

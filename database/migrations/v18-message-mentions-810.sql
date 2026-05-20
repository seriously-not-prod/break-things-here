-- v18: Task #810 — @mentions parser + notification fanout
--
-- Acceptance criteria:
--   1) message_mentions table stores each @mention with source context
--   2) Indexes support efficient per-user and per-source queries
--   3) Idempotent (IF NOT EXISTS guards throughout)

CREATE TABLE IF NOT EXISTS message_mentions (
  id                   SERIAL PRIMARY KEY,
  -- 'chat_message' | 'task_comment'
  source_type          TEXT    NOT NULL,
  source_id            INTEGER NOT NULL,
  mentioned_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentioned_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- original token as it appeared in the text, e.g. @alice or @"Alice Smith"
  raw_token            TEXT    NOT NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_mentions_mentioned_user
  ON message_mentions(mentioned_user_id);

CREATE INDEX IF NOT EXISTS idx_message_mentions_source
  ON message_mentions(source_type, source_id);

-- Lyrics pasted by trusted users. The author sees their own version straight away; once an admin approves it,
-- it replaces the shared lyrics for everyone.

CREATE TABLE lyrics_submissions (
  id         TEXT PRIMARY KEY,
  song_id    TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (song_id, user_id)
);
CREATE INDEX idx_lyrics_sub_status ON lyrics_submissions(status, created_at);

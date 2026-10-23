-- YouTube search: a one-day cache (saves API quota) and a log used for per-user and global limits.

CREATE TABLE yt_cache (
  q          TEXT PRIMARY KEY,
  results    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE yt_searches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  q          TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_yt_searches_day ON yt_searches(created_at);
CREATE INDEX idx_yt_searches_user ON yt_searches(user_id, created_at);

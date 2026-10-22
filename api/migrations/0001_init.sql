-- Soundly D1 schema (SQLite). Timestamps are UTC strings from datetime('now').

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  avatar_url          TEXT,
  role                TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('listener', 'member', 'trusted', 'admin')),
  can_request_direct  INTEGER NOT NULL DEFAULT 0,
  daily_request_limit INTEGER NOT NULL DEFAULT 3,
  pro_until           TEXT,
  contribution_note   TEXT,
  disabled            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at        TEXT
);

CREATE TABLE invites (
  code        TEXT PRIMARY KEY,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('listener', 'member', 'trusted', 'admin')),
  created_by  TEXT REFERENCES users(id),
  used_by     TEXT REFERENCES users(id),
  expires_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  used_at     TEXT
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE artists (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE songs (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  artist_id    TEXT REFERENCES artists(id),
  album        TEXT,
  duration_sec INTEGER,
  r2_key       TEXT NOT NULL UNIQUE,
  thumb_key    TEXT,
  youtube_id   TEXT UNIQUE,
  size_bytes   INTEGER,
  bitrate_kbps INTEGER,
  added_by     TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_songs_title ON songs(title);
CREATE INDEX idx_songs_artist ON songs(artist_id);

CREATE TABLE playlists (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  hue         INTEGER NOT NULL DEFAULT 150,
  is_public   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE playlist_songs (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id     TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id    TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, song_id)
);

CREATE TABLE plays (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id          TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  seconds_listened INTEGER NOT NULL DEFAULT 0,
  played_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_plays_user ON plays(user_id, played_at);
CREATE INDEX idx_plays_song ON plays(song_id);

CREATE TABLE download_jobs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  youtube_id    TEXT NOT NULL,
  youtube_url   TEXT,
  title         TEXT NOT NULL,
  channel       TEXT,
  duration_sec  INTEGER,
  category      TEXT,
  flags         TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL CHECK (status IN ('pending_approval', 'queued', 'downloading', 'uploading', 'done', 'failed', 'rejected')),
  error         TEXT,
  reject_reason TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  song_id       TEXT REFERENCES songs(id),
  approved_by   TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at    TEXT
);
CREATE INDEX idx_jobs_status ON download_jobs(status, created_at);
CREATE INDEX idx_jobs_user ON download_jobs(user_id, created_at);
-- One live job per YouTube video, so two people requesting the same song share it.
CREATE UNIQUE INDEX idx_jobs_active_video ON download_jobs(youtube_id)
  WHERE status IN ('pending_approval', 'queued', 'downloading', 'uploading');

CREATE TABLE agent_heartbeats (
  agent_id       TEXT PRIMARY KEY,
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  on_home_wifi   INTEGER NOT NULL DEFAULT 0,
  version        TEXT,
  current_job_id TEXT
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

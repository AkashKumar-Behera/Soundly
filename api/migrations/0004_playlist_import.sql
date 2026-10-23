-- YouTube playlist import: songs that are still being downloaded join the playlist when they arrive.

CREATE TABLE import_items (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  youtube_id  TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlist_id, youtube_id)
);
CREATE INDEX idx_import_items_video ON import_items(youtube_id);

-- One row per import, used for the daily import limit and for the admin's activity view.
CREATE TABLE playlist_imports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_id TEXT,
  list_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  songs       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_playlist_imports_user ON playlist_imports(user_id, created_at);

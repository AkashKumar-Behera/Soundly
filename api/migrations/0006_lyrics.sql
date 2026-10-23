-- Lyrics fetched once per song from LRCLIB (free, open lyrics database) and cached here.
-- `found = 0` rows are kept for a week so a song without lyrics is not looked up again on every play.

CREATE TABLE lyrics (
  song_id    TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  found      INTEGER NOT NULL DEFAULT 0,
  instrumental INTEGER NOT NULL DEFAULT 0,
  synced     TEXT,   -- LRC text ("[01:23.45] line")
  plain      TEXT,
  source     TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

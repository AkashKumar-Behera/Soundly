-- The laptop agent asks "which songs still need a genre?" regularly; answer it from an index, not a scan of every song.
CREATE INDEX IF NOT EXISTS idx_songs_unchecked ON songs(created_at) WHERE genre_checked_at IS NULL;

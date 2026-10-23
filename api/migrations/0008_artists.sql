-- Artist photos (looked up once from YouTube Music) and artist requests from members awaiting admin approval.

ALTER TABLE artists ADD COLUMN browse_id TEXT;
ALTER TABLE artists ADD COLUMN image_url TEXT;
ALTER TABLE artists ADD COLUMN image_checked_at TEXT;

CREATE TABLE artist_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  browse_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  image_url  TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_artist_requests_pending ON artist_requests(user_id, browse_id) WHERE status = 'pending';

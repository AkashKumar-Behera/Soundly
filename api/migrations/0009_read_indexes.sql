-- Indexes for the queries that read the most rows (found with `wrangler d1 insights`).
CREATE INDEX IF NOT EXISTS idx_jobs_created ON download_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON download_jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_songs_added_by ON songs(added_by);

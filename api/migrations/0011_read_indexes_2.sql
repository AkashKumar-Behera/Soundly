-- Two more read-heavy paths found with EXPLAIN QUERY PLAN:
--  * the song list scanned and sorted every song on each app open (now walks this index for the newest 100);
--  * "is this video already queued?" scanned every finished job (now a lookup by video id).
CREATE INDEX IF NOT EXISTS idx_songs_created ON songs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_youtube ON download_jobs(youtube_id);

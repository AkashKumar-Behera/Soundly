-- Live progress of a download job, reported by the laptop agent while it works.

ALTER TABLE download_jobs ADD COLUMN stage TEXT;          -- starting | downloading | converting | uploading | saving
ALTER TABLE download_jobs ADD COLUMN progress REAL;       -- 0..1 over the whole job
ALTER TABLE download_jobs ADD COLUMN eta_sec INTEGER;     -- estimate for the current stage
ALTER TABLE download_jobs ADD COLUMN speed_bps INTEGER;
ALTER TABLE download_jobs ADD COLUMN progress_at TEXT;

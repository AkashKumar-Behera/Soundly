-- A download job can now replace the audio of a song that is already in the library (MP3 -> AAC upgrade).
ALTER TABLE download_jobs ADD COLUMN replace_song_id TEXT;

-- Every song gets a genre (looked up by the laptop agent). Admins can rename, merge or hide genres as categories.
ALTER TABLE songs ADD COLUMN genre TEXT;
ALTER TABLE songs ADD COLUMN genre_checked_at TEXT;
CREATE INDEX idx_songs_genre ON songs(genre);

CREATE TABLE categories (
  genre  TEXT PRIMARY KEY,         -- the genre as found (e.g. "Hip-Hop/Rap")
  label  TEXT,                     -- the category shown in the app; two genres with the same label are merged
  hue    INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0
);

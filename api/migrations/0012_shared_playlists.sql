-- Playlists are shared with everyone by default (the creator's name is shown to admins only). Make existing ones public too.
UPDATE playlists SET is_public = 1 WHERE is_public = 0;

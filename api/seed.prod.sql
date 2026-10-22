-- Production seed: settings and the owner account only. No demo users, songs or playlists.
INSERT OR IGNORE INTO users (id, email, name, role, can_request_direct, daily_request_limit)
VALUES ('u_admin', 'akashkumar48874@gmail.com', 'Akash', 'admin', 1, 50);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('max_users', '30'),
  ('max_playlist_import', '50'),
  ('max_duration_sec', '1200'),
  ('agent_online_window_sec', '90');

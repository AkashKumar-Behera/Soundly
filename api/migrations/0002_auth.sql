-- Phase 3: Google sign-in, server-side sessions and OAuth state.

ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;

-- `id` is the SHA-256 of the cookie token, so a database leak does not expose live sessions.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- One row per in-flight Google sign-in (10 minute lifetime), carrying the PKCE verifier and invite code.
CREATE TABLE oauth_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  invite        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

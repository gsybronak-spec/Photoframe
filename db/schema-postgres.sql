-- ============================================================================
-- ZenFrame — PostgreSQL schema (production: Vercel + Neon/managed Postgres)
--
-- This mirrors the SQLite migrations in src/server/db.ts 1:1 so the logical
-- model (users, profiles, creations, saved_frames, activity, analytics,
-- subscriptions, frame overrides, settings, email deliveries) is identical in
-- both engines.
--
-- Identity model:
--   * Firebase Authentication owns sign-up/sign-in/verification/reset.
--   * users.firebase_uid maps the verified Firebase identity → app record.
--   * users.password_hash stays '' (Firebase mode) — no passwords in Postgres.
--   * The old token/session password flows remain for password-mode dev only.
--
-- How to apply:
--   psql "$DATABASE_URL" -f db/schema-postgres.sql
--   (idempotent: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  password_hash     TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL DEFAULT 'user',
  status            TEXT NOT NULL DEFAULT 'active',
  disabled_at       TEXT,
  email_verified_at TEXT,
  firebase_uid      TEXT UNIQUE,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio         TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT,
  studio      TEXT,
  updated_at  TEXT NOT NULL
);

-- Sessions hold the opaque app-session cookie hashes (issued after a verified
-- Firebase ID-token exchange). Kept so "active sessions" + logout-all work.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  user_agent   TEXT,
  ip_hash      TEXT,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at DESC);

-- Password-mode token flows (verify_email / password_reset). Firebase mode
-- handles both in Firebase Auth; this table stays for local development.
CREATE TABLE IF NOT EXISTS verification_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('verify_email','password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_user_kind
  ON verification_tokens(user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS creations (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frame_id            TEXT NOT NULL,
  caption             TEXT,
  storage_path        TEXT NOT NULL,
  mime_type           TEXT NOT NULL DEFAULT 'image/png',
  bytes               INTEGER NOT NULL,
  thumb_path          TEXT,
  thumb_bytes         INTEGER NOT NULL DEFAULT 0,
  visibility          TEXT NOT NULL DEFAULT 'private',
  share_slug          TEXT UNIQUE,
  share_show_caption  INTEGER NOT NULL DEFAULT 1,
  published_at        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creations_user ON creations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creations_public ON creations(visibility, published_at DESC);

CREATE TABLE IF NOT EXISTS saved_frames (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frame_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, frame_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  actor_id   TEXT,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(type, created_at DESC);

-- Admin-editable frame metadata overrides (artwork lives in src/lib/frames.ts).
CREATE TABLE IF NOT EXISTS frame_overrides (
  frame_id      TEXT PRIMARY KEY,
  description   TEXT,
  category      TEXT,
  tags          TEXT,
  featured      INTEGER,
  active        INTEGER,
  settings_json TEXT,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Subscription state only; no payment-provider columns until billing is wired.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id            TEXT NOT NULL DEFAULT 'free',
  status             TEXT NOT NULL DEFAULT 'active',
  current_period_end TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,
  props      TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  template   TEXT NOT NULL,
  to_domain  TEXT NOT NULL,
  provider   TEXT NOT NULL,
  status     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_deliveries ON email_deliveries(created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

-- ------------------------------------------------------------------
-- Campaign studio (admin campaign composer + anonymous user wizard)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  district      TEXT,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','active','paused','archived')),
  artwork_key   TEXT,
  artwork_mime  TEXT,
  artwork_bytes INTEGER NOT NULL DEFAULT 0,
  canvas_width  INTEGER NOT NULL DEFAULT 1080,
  canvas_height INTEGER NOT NULL DEFAULT 1350,
  art_x         REAL NOT NULL DEFAULT 0,
  art_y         REAL NOT NULL DEFAULT 0,
  art_w         REAL NOT NULL DEFAULT 100,
  art_h         REAL NOT NULL DEFAULT 100,
  art_rotation  REAL NOT NULL DEFAULT 0,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  activated_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_photo_configs (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL DEFAULT 0,
  shape       TEXT NOT NULL DEFAULT 'square' CHECK (shape IN ('circle','square')),
  x           REAL NOT NULL DEFAULT 30,
  y           REAL NOT NULL DEFAULT 35,
  width       REAL NOT NULL DEFAULT 40,
  height      REAL NOT NULL DEFAULT 30,
  rotation    REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_name_configs (
  campaign_id    TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  enabled        INTEGER NOT NULL DEFAULT 0,
  x              REAL NOT NULL DEFAULT 20,
  y              REAL NOT NULL DEFAULT 78,
  width          REAL NOT NULL DEFAULT 60,
  height         REAL NOT NULL DEFAULT 12,
  rotation       REAL NOT NULL DEFAULT 0,
  font_family    TEXT NOT NULL DEFAULT 'Plus Jakarta Sans',
  font_size      REAL NOT NULL DEFAULT 26,
  line_height    REAL NOT NULL DEFAULT 1.2,
  font_color     TEXT NOT NULL DEFAULT '#fff8f0',
  font_weight    TEXT NOT NULL DEFAULT 'bold' CHECK (font_weight IN ('normal','bold')),
  alignment      TEXT NOT NULL DEFAULT 'center' CHECK (alignment IN ('left','center','right')),
  letter_spacing REAL NOT NULL DEFAULT 1,
  text_scale     REAL NOT NULL DEFAULT 1,
  text_opacity   REAL NOT NULL DEFAULT 1,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_events (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL
              CHECK (event_type IN ('generate','download','whatsapp','facebook','instagram','link')),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_events
  ON campaign_events(campaign_id, event_type, created_at DESC);

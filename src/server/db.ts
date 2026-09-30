/**
 * Database layer — driver boundary.
 *
 * Two engines, one interface:
 *
 *   sqlite    node:sqlite, synchronous under the hood, wrapped async so call
 *             sites are engine-agnostic. LOCAL DEVELOPMENT ONLY.
 *   postgres  pg + a small pooled client (serverless-safe). PRODUCTION.
 *
 * Selection is deterministic (see resolveDriver):
 *   DATABASE_DRIVER=sqlite|postgres  → explicit choice (sqlite refused in production)
 *   else DATABASE_URL present        → postgres
 *   else NODE_ENV=production         → HARD ERROR (never silently fall back)
 *   else                             → sqlite (local dev)
 *
 * All identifiers are application-generated and every query is plain SQL that
 * works on both engines (no lastInsertRowid, no SQLite datetime functions,
 * ON CONFLICT … DO UPDATE everywhere). Timestamps are ISO-8601 TEXT.
 *
 * SQLite migrations stay versioned in `schema_migrations` exactly as before.
 * PostgreSQL uses the idempotent baseline schema (embedded below, mirrored in
 * db/schema-postgres.sql for psql) plus the same version tracking.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

declare global {
  var __zenframeDb: DatabaseSync | undefined;
  var __zenframeMigrationsRun: number | undefined;
  var __zenframePgPool: import("pg").Pool | undefined;
  var __zenframePgReady: Promise<void> | undefined;
}

export const DATA_DIR = process.env.ZENFRAME_DATA_DIR
  ? path.resolve(process.env.ZENFRAME_DATA_DIR)
  : path.resolve(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
export const DB_FILE = path.join(DATA_DIR, "zenframe.db");

export const nowIso = () => new Date().toISOString();

/** ISO timestamp N days ago — used for growth/activity windows. */
export const cutoffIso = (days: number) =>
  new Date(Date.now() - days * 86400e3).toISOString();

/* ------------------------------------------------------------------ */
/* Driver interface                                                    */
/* ------------------------------------------------------------------ */

export type DbValue = string | number | null;

export interface DbRow {
  [column: string]: unknown;
}

export interface DbRunResult {
  changes: number;
}

export interface DbStatement {
  get(...params: DbValue[]): Promise<unknown>;
  all(...params: DbValue[]): Promise<unknown[]>;
  run(...params: DbValue[]): Promise<DbRunResult>;
}

export interface Db {
  prepare(sql: string): DbStatement;
  /** Multi-statement DDL / maintenance (driver-native). */
  exec(sql: string): Promise<void>;
  /**
   * Real transaction. `fn` receives a Db bound to the transaction connection;
   * on SQLite this is BEGIN…COMMIT, on Postgres it is the pooled client.
   * Nested transactions throw — compose at one level.
   */
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export type DatabaseDriverName = "sqlite" | "postgres";

/* ------------------------------------------------------------------ */
/* Driver selection — deterministic, fail-loud                         */
/* ------------------------------------------------------------------ */

export function resolveDriver(): DatabaseDriverName {
  // During `next build` the process runs with NODE_ENV=production while pages
  // are prerendered for static export. That is a build-time evaluation, not a
  // production request: defer the production requirements to actual boot.
  const building = process.env.NEXT_PHASE === "phase-production-build";
  const prod = process.env.NODE_ENV === "production" && !building;

  const explicit = (process.env.DATABASE_DRIVER ?? "").trim().toLowerCase();
  if (explicit) {
    if (explicit !== "sqlite" && explicit !== "postgres") {
      throw new Error(
        `[zenframe] Invalid DATABASE_DRIVER "${explicit}" — use "sqlite" or "postgres".`
      );
    }
    if (explicit === "sqlite" && prod) {
      // Test-only escape hatch: the automated suite runs a production server
      // against a throwaway SQLite database. It must be set EXPLICITLY, so it
      // can never happen by accident or by misconfiguration.
      if (process.env.ZENFRAME_ALLOW_TEST_SQLITE === "1") {
        console.warn(
          "[zenframe] TEST OVERRIDE ACTIVE — SQLite driver allowed in " +
            "production mode. This must ONLY come from the test harness."
        );
        return "sqlite";
      }
      throw new Error(
        "[zenframe] DATABASE_DRIVER=sqlite is not allowed in production. " +
          "Set DATABASE_URL (Neon/Postgres) — SQLite is development-only."
      );
    }
    return explicit;
  }
  if (process.env.DATABASE_URL) return "postgres";
  if (prod) {
    throw new Error(
      "[zenframe] Production requires a PostgreSQL database: set DATABASE_URL " +
        "(Neon/managed Postgres). SQLite is not available in production."
    );
  }
  return "sqlite";
}

/* ------------------------------------------------------------------ */
/* PostgreSQL driver                                                   */
/* ------------------------------------------------------------------ */

/** Postgres baseline schema — must stay in sync with db/schema-postgres.sql
 *  (verified by scripts/test-postgres.mjs when the file is present). */
export const POSTGRES_BASELINE_SCHEMA = String.raw`
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
`;

/**
 * `?` → `$1, $2, …` outside single-quoted literals. The codebase never uses `?`
 * inside SQL string literals (verified in the dialect audit), but the guard
 * keeps a future pattern like `WHERE note LIKE '%?%'` safe.
 */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let inQuote = false;
  let n = 0;
  for (const ch of sql) {
    if (ch === "'") inQuote = !inQuote;
    if (ch === "?" && !inQuote) out += `$${++n}`;
    else out += ch;
  }
  return out;
}

const PG_POOL_MAX = Number(process.env.PG_POOL_MAX ?? 5);

async function createPgPool(): Promise<import("pg").Pool> {
  const { Pool } = await import("pg");
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[zenframe] DATABASE_DRIVER=postgres but DATABASE_URL is not set."
    );
  }
  // Neon/managed Postgres require TLS; local postgres does not.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("[zenframe] DATABASE_URL is not a valid connection string.");
  }
  const isLocal =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1";
  const wantsSsl =
    parsed.searchParams.get("sslmode") === "require" ||
    parsed.searchParams.get("sslmode") === "verify-full" ||
    (!isLocal && parsed.searchParams.get("sslmode") !== "disable");

  return new Pool({
    connectionString: url,
    max: Number.isFinite(PG_POOL_MAX) && PG_POOL_MAX > 0 ? PG_POOL_MAX : 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * int8/numeric arrive as strings from pg; the app expects numbers. Builds a
 * row object keyed by column name (pg rowMode "array" returns positional values).
 */
function coerceRow(fields: { name: string; dataTypeId: number }[], row: unknown[]): DbRow {
  const out: DbRow = {};
  for (let i = 0; i < row.length; i += 1) {
    const v = row[i];
    const t = fields[i]?.dataTypeId;
    let value: unknown = v;
    if (typeof v === "string" && (t === 20 || t === 1700 || t === 700 || t === 701)) {
      const n = Number(v);
      if (Number.isSafeInteger(n) || Number.isFinite(n)) value = n;
    } else if (typeof v === "bigint") {
      const n = Number(v);
      value = Number.isSafeInteger(n) ? n : v.toString();
    }
    out[fields[i]?.name ?? String(i)] = value;
  }
  return out;
}

function makePgDb(execQuery: (sql: string, params: DbValue[]) => Promise<unknown>): Db {
  const prepare = (sql: string): DbStatement => ({
    async get(...params) {
      return execQuery(sql, params).then((r) => (r as { rows: unknown[] }).rows[0]);
    },
    async all(...params) {
      return execQuery(sql, params).then((r) => (r as { rows: unknown[] }).rows);
    },
    async run(...params) {
      const r = (await execQuery(sql, params)) as { rowCount: number | null };
      return { changes: r.rowCount ?? 0 };
    },
  });
  return {
    prepare,
    exec: (sql) => execQuery(sql, []).then(() => undefined),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async tx(_fn) {
      throw new Error(
        "[zenframe] tx() is not available on the root pg Db — use the pooled transaction instance."
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/* SQLite migrations (unchanged — development engine)                  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Campaign studio tables (shared by SQLite migration 9 and Postgres)  */
/* ------------------------------------------------------------------ */

/**
 * Campaigns are admin-composed photo-frame events: an uploaded artwork base
 * layer, an optional Photo Area mask and an optional Name Area typography
 * overlay. Users composite their photo locally in the browser — user photos
 * are NEVER uploaded or stored. Anonymous generate/share events are the only
 * user-side signal recorded.
 */
export const CAMPAIGN_TABLES_SQL = String.raw`
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
  artwork_data  TEXT,
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
`;

/** Campaign tables as their own idempotent unit, so an existing Postgres
 *  database created from the pre-campaign baseline can be upgraded in place. */
export const POSTGRES_CAMPAIGNS_SCHEMA = CAMPAIGN_TABLES_SQL;

/** Columns of a table, used to make ADD COLUMN migrations idempotent. */
function columns(db: DatabaseSync, table: string): string[] {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

function hasTable(db: DatabaseSync, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return Boolean(row);
}

/** Adds a column only when it is missing (safe to re-run / safe on legacy DBs). */
function addColumn(db: DatabaseSync, table: string, column: string, ddl: string) {
  if (!hasTable(db, table)) return;
  if (columns(db, table).includes(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "core_accounts_creations",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id                TEXT PRIMARY KEY,
          email             TEXT NOT NULL UNIQUE,
          name              TEXT NOT NULL,
          password_hash     TEXT NOT NULL,
          role              TEXT NOT NULL DEFAULT 'user',
          email_verified_at TEXT,
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

        CREATE TABLE IF NOT EXISTS sessions (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

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
          id            TEXT PRIMARY KEY,
          user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          frame_id      TEXT NOT NULL,
          caption       TEXT,
          storage_path  TEXT NOT NULL,
          mime_type     TEXT NOT NULL DEFAULT 'image/png',
          bytes         INTEGER NOT NULL,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_creations_user
          ON creations(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS saved_frames (
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          frame_id    TEXT NOT NULL,
          created_at  TEXT NOT NULL,
          PRIMARY KEY (user_id, frame_id)
        );

        CREATE TABLE IF NOT EXISTS activity (
          id         TEXT PRIMARY KEY,
          user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
          type       TEXT NOT NULL,
          message    TEXT NOT NULL,
          meta       TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_user
          ON activity(user_id, created_at DESC);
      `);
    },
  },
  {
    version: 2,
    name: "accounts_status_and_audit_indexes",
    up(db) {
      // Account lifecycle (suspension is an admin power, never a hard delete).
      addColumn(db, "users", "status", "TEXT NOT NULL DEFAULT 'active'");
      addColumn(db, "users", "disabled_at", "TEXT");

      // Session metadata for the "active sessions" panel. Raw IPs are never
      // stored — only a salted hash, so a DB leak does not reveal locations.
      addColumn(db, "sessions", "user_agent", "TEXT");
      addColumn(db, "sessions", "ip_hash", "TEXT");
      addColumn(db, "sessions", "last_seen_at", "TEXT");

      // Admin audit trail needs system-wide (user_id NULL) activity queries.
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(type, created_at DESC);`
      );
    },
  },
  {
    version: 3,
    name: "image_variants_and_public_sharing",
    up(db) {
      // Optimized derivative kept alongside the full composite.
      addColumn(db, "creations", "thumb_path", "TEXT");
      addColumn(db, "creations", "thumb_bytes", "INTEGER NOT NULL DEFAULT 0");

      // Public sharing — off by default, revocable, non-guessable slug.
      addColumn(db, "creations", "visibility", "TEXT NOT NULL DEFAULT 'private'");
      addColumn(db, "creations", "share_slug", "TEXT");
      addColumn(db, "creations", "share_show_caption", "INTEGER NOT NULL DEFAULT 1");
      addColumn(db, "creations", "published_at", "TEXT");
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_creations_share_slug
           ON creations(share_slug) WHERE share_slug IS NOT NULL;`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_creations_public
           ON creations(visibility, published_at DESC);`
      );
    },
  },
  {
    version: 4,
    name: "frame_overrides_and_site_settings",
    up(db) {
      // Artwork stays in code (src/lib/frames.ts). Everything an admin edits —
      // description, category, tags, featured/active — is an override row, so
      // adding a frame never requires touching the database.
      db.exec(`
        CREATE TABLE IF NOT EXISTS frame_overrides (
          frame_id    TEXT PRIMARY KEY,
          description TEXT,
          category    TEXT,
          tags        TEXT,
          featured    INTEGER,
          active      INTEGER,
          updated_at  TEXT NOT NULL,
          updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
        );
      `);
    },
  },
  {
    version: 5,
    name: "plans_analytics_email_log",
    up(db) {
      // Subscription state only — no payment provider columns until billing is
      // actually wired up. Absence of a row means the free plan.
      db.exec(`
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
        CREATE INDEX IF NOT EXISTS idx_analytics_event
          ON analytics_events(event, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analytics_user
          ON analytics_events(user_id, created_at DESC);

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
        CREATE INDEX IF NOT EXISTS idx_email_deliveries
          ON email_deliveries(created_at DESC);
      `);
    },
  },
  {
    version: 6,
    name: "creation_deletion_audit",
    up(db) {
      // Lets admin/activity views keep history even after a creation row is gone.
      addColumn(db, "activity", "actor_id", "TEXT");
    },
  },
  {
    version: 7,
    name: "normalize_storage_keys",
    up(db) {
      // Storage keys are object keys and must be platform-independent. Databases
      // written on Windows recorded `path.join` separators ("user\\id.png"),
      // which the storage driver rejects as unsafe — so those rows could never be
      // served again, and a database was not portable between platforms.
      // Forward slashes only, everywhere, forever.
      if (!hasTable(db, "creations")) return;
      const cols = columns(db, "creations");
      // Built from a char code so the backslash can never be mangled by
      // source-level escaping — SQLite treats '\\' as two characters.
      const BACKSLASH = String.fromCharCode(92);
      for (const col of ["storage_path", "thumb_path"]) {
        if (!cols.includes(col)) continue;
        // Unconditional and therefore idempotent: rows already using forward
        // slashes are simply unchanged by REPLACE.
        db.prepare(`UPDATE creations SET ${col} = REPLACE(${col}, ?, '/')`).run(
          BACKSLASH
        );
      }
    },
  },
  {
    version: 8,
    name: "users_firebase_uid",
    up(db) {
      // Firebase Authentication owns identity in Firebase mode. The application
      // record keeps its own id; firebase_uid maps the verified Firebase
      // identity to it. NULLs are allowed (password-mode accounts).
      addColumn(db, "users", "firebase_uid", "TEXT");
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid
           ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;`
      );
    },
  },
  {
    version: 9,
    name: "campaign_studio",
    up(db) {
      // Admin campaign studio + anonymous user wizard (artwork base layer,
      // photo mask, name overlay, anonymous generate/share events).
      db.exec(CAMPAIGN_TABLES_SQL);
    },
  },
  {
    version: 10,
    name: "frame_settings_and_decimal_typography",
    up(db) {
      addColumn(db, "frame_overrides", "settings_json", "TEXT");
      addColumn(db, "campaign_name_configs", "line_height", "REAL NOT NULL DEFAULT 1.2");
      addColumn(db, "campaign_name_configs", "text_scale", "REAL NOT NULL DEFAULT 1");
      addColumn(db, "campaign_name_configs", "text_opacity", "REAL NOT NULL DEFAULT 1");
    },
  },
  {
    version: 11,
    name: "campaign_artwork_data_fallback",
    up(db) {
      addColumn(db, "campaigns", "artwork_data", "TEXT");
    },
  },
];

/** Tables that must exist once migrations have run. */
const REQUIRED_TABLES = [
  "users",
  "profiles",
  "sessions",
  "verification_tokens",
  "creations",
  "saved_frames",
  "activity",
  "frame_overrides",
  "settings",
  "subscriptions",
  "analytics_events",
  "email_deliveries",
  "campaigns",
  "campaign_photo_configs",
  "campaign_name_configs",
  "campaign_events",
  "schema_migrations",
];

export function assertSchemaIntegrity(db: DatabaseSync): void {
  const missing: string[] = [];
  for (const table of REQUIRED_TABLES) if (!hasTable(db, table)) missing.push(table);

  const requiredColumns: Record<string, string[]> = {
    users: [
      "id",
      "email",
      "name",
      "password_hash",
      "role",
      "email_verified_at",
      "status",
      "firebase_uid",
    ],
    sessions: ["id", "user_id", "token_hash", "expires_at", "created_at"],
    creations: [
      "id",
      "user_id",
      "frame_id",
      "caption",
      "storage_path",
      "mime_type",
      "bytes",
      "visibility",
      "share_slug",
      "share_show_caption",
      "created_at",
      "updated_at",
    ],
    campaigns: [
      "id",
      "name",
      "slug",
      "status",
      "artwork_key",
      "canvas_width",
      "canvas_height",
      "art_x",
      "art_y",
      "art_w",
      "art_h",
      "art_rotation",
      "created_at",
      "updated_at",
    ],
  };
  for (const [table, cols] of Object.entries(requiredColumns)) {
    if (!hasTable(db, table)) continue;
    const present = columns(db, table);
    for (const c of cols) if (!present.includes(c)) missing.push(`${table}.${c}`);
  }

  if (missing.length) {
    throw new Error(
      `[zenframe] Database schema is incomplete (missing: ${missing.join(", ")}). ` +
        `The database at ${DB_FILE} was not migrated correctly. Restore from a ` +
        `backup (npm run db:backup creates one) or move the file aside to let ` +
        `ZenFrame create a fresh database.`
    );
  }
}

/** Applies every pending migration inside a transaction. Idempotent. */
export function runMigrations(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (
      db.prepare("SELECT version FROM schema_migrations").all() as {
        version: number;
      }[]
    ).map((r) => r.version)
  );

  let ran = 0;
  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(migration.version, migration.name, nowIso());
      db.exec("COMMIT");
      ran += 1;
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(
        `[zenframe] Migration ${migration.version} (${migration.name}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  assertSchemaIntegrity(db);
  return ran;
}

/* ------------------------------------------------------------------ */
/* SQLite driver (development)                                         */
/* ------------------------------------------------------------------ */

function openSqlite(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL;"); // readers don't block the writer
  db.exec("PRAGMA synchronous = NORMAL;"); // safe with WAL, much faster
  db.exec("PRAGMA foreign_keys = ON;"); // ON DELETE CASCADE actually cascades
  db.exec("PRAGMA busy_timeout = 5000;"); // retry instead of SQLITE_BUSY
  db.exec("PRAGMA wal_autocheckpoint = 512;");

  if (!globalThis.__zenframeMigrationsRun) {
    globalThis.__zenframeMigrationsRun = runMigrations(db);
  } else {
    runMigrations(db); // cheap no-op; keeps hot-reload honest
  }
  return db;
}

function sqliteDb(): Db {
  const get = (): DatabaseSync => {
    if (!globalThis.__zenframeDb) globalThis.__zenframeDb = openSqlite();
    return globalThis.__zenframeDb;
  };
  const inTx = () => Boolean(globalThis.__zenframeSqliteTxDepth);
  return {
    prepare(sql) {
      const stmt = () => get().prepare(sql);
      return {
        async get(...params) {
          return stmt().get(...params) as DbRow | undefined;
        },
        async all(...params) {
          return stmt().all(...params) as DbRow[];
        },
        async run(...params) {
          const res = stmt().run(...params);
          return { changes: Number(res.changes ?? 0) };
        },
      };
    },
    async exec(sql) {
      get().exec(sql);
    },
    async tx(fn) {
      if (inTx()) {
        throw new Error("[zenframe] Nested transactions are not supported.");
      }
      globalThis.__zenframeSqliteTxDepth = 1;
      get().exec("BEGIN");
      try {
        const result = await fn(this);
        get().exec("COMMIT");
        return result;
      } catch (err) {
        try {
          get().exec("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        throw err;
      } finally {
        globalThis.__zenframeSqliteTxDepth = undefined;
      }
    },
  };
}

declare global {
  var __zenframeSqliteTxDepth: number | undefined;
}

/* ------------------------------------------------------------------ */
/* PostgreSQL boot + connection                                        */
/* ------------------------------------------------------------------ */

/** Applies the idempotent baseline schema on first boot (fresh database). */
async function ensurePgSchema(pool: import("pg").Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const exists = await client.query<{ present: unknown }>(
      "SELECT to_regclass('public.users') AS present"
    );
    if (exists.rows[0]?.present) {
      // Database predates the campaign studio? Upgrade in place (idempotent).
      const camp = await client.query<{ present: unknown }>(
        "SELECT to_regclass('public.campaigns') AS present"
      );
      if (!camp.rows[0]?.present) {
        await client.query(POSTGRES_CAMPAIGNS_SCHEMA);
      }
      // Always apply additive column migrations idempotently on existing DBs.
      await client.query(`
        ALTER TABLE frame_overrides ADD COLUMN IF NOT EXISTS settings_json TEXT;
        ALTER TABLE campaign_name_configs ADD COLUMN IF NOT EXISTS line_height REAL NOT NULL DEFAULT 1.2;
        ALTER TABLE campaign_name_configs ADD COLUMN IF NOT EXISTS text_scale REAL NOT NULL DEFAULT 1;
        ALTER TABLE campaign_name_configs ADD COLUMN IF NOT EXISTS text_opacity REAL NOT NULL DEFAULT 1;
        ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS artwork_data TEXT;
      `);
      return;
    }
    await client.query(POSTGRES_BASELINE_SCHEMA);
    await client.query(POSTGRES_CAMPAIGNS_SCHEMA);
    await client.query(
      `INSERT INTO schema_migrations (version, name, applied_at)
       SELECT 1, 'postgres_baseline', $1
       WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 1)`,
      [nowIso()]
    );
  } finally {
    client.release();
  }
}

async function pgDb(): Promise<Db> {
  if (!globalThis.__zenframePgPool) {
    globalThis.__zenframePgPool = await createPgPool();
  }
  const pool = globalThis.__zenframePgPool;

  if (!globalThis.__zenframePgReady) {
    globalThis.__zenframePgReady = ensurePgSchema(pool);
  }
  await globalThis.__zenframePgReady;

  /** Runs one statement on a pooled client, coercing numeric strings. */
  const execQuery = async (sql: string, params: DbValue[]) => {
    const client = await pool.connect();
    try {
      const text = toPgPlaceholders(sql);
      const res = await client.query({
        text,
        values: params,
        rowMode: "array",
      });
      const rows = res.rows.map((r) =>
        coerceRow(
          res.fields.map((f) => ({ name: f.name, dataTypeId: f.dataTypeID })),
          r as unknown[]
        )
      );
      return { rows, rowCount: res.rowCount };
    } finally {
      client.release();
    }
  };

  const db = makePgDb(execQuery);
  // The pooled instance can run multi-statement batches in one query too
  // (simple query protocol), so exec maps through the same path.
  return {
    ...db,
    async tx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txExec = async (sql: string, params: DbValue[]) => {
          const text = toPgPlaceholders(sql);
          const res = await client.query({ text, values: params, rowMode: "array" });
          const rows = res.rows.map((r) =>
            coerceRow(
              res.fields.map((f) => ({ name: f.name, dataTypeId: f.dataTypeID })),
              r as unknown[]
            )
          );
          return { rows, rowCount: res.rowCount };
        };
        const txDb = makePgDb(txExec);
        const result = await fn(txDb);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* connection already broken */
        }
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public entrypoint                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resolves the configured driver and returns its connection handle.
 * Returns a Promise because PostgreSQL is inherently async; SQLite results
 * are wrapped so call sites stay engine-agnostic.
 */
export async function getDb(): Promise<Db> {
  const driver = resolveDriver();
  if (driver === "postgres") return pgDb();
  return sqliteDb();
}

/**
 * Synchronous handle for development-only tooling (scripts, local checks).
 * Throws under the postgres driver — production code must use `await getDb()`.
 */
export function getSqliteForTools(): DatabaseSync {
  if (resolveDriver() !== "sqlite") {
    throw new Error(
      "[zenframe] getSqliteForTools() is only available with DATABASE_DRIVER=sqlite."
    );
  }
  if (!globalThis.__zenframeDb) globalThis.__zenframeDb = openSqlite();
  return globalThis.__zenframeDb;
}

/* ------------------------------------------------------------------ */
/* Backup (SQLite development engine)                                  */
/* ------------------------------------------------------------------ */

/**
 * Consistent hot backup via SQLite's own `VACUUM INTO` (safe while the app is
 * writing, unlike a raw file copy of a live WAL database). Postgres backups
 * belong to the provider (Neon PITR / pg_dump) — see README.
 */
export function backupDatabase(destDir = BACKUP_DIR): string {
  fs.mkdirSync(destDir, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, "-");
  const dest = path.join(destDir, `zenframe-${stamp}.db`);
  const db = getSqliteForTools();
  db.prepare("VACUUM INTO ?").run(dest);
  return dest;
}

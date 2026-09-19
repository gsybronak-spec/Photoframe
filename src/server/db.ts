/**
 * SQLite database layer (node:sqlite, zero dependencies).
 *
 * Production notes
 * ----------------
 * - One synchronous connection per process, WAL journal so readers never block
 *   the writer, `busy_timeout` so concurrent writers retry instead of throwing,
 *   and foreign keys enforced at the engine level.
 * - Schema changes are versioned (`schema_migrations`). Migrations are
 *   deterministic, forward-only, idempotent and never destructive: a migration
 *   only ever CREATEs or ADDs. There are no DROP statements anywhere.
 * - `assertSchemaIntegrity()` runs after migration and throws a loud, actionable
 *   error if a required table/column is missing, so a broken deploy can never
 *   silently serve traffic against a partial schema.
 *
 * Deployment guidance: SQLite is safe when the filesystem under
 * ZENFRAME_DATA_DIR is persistent (a VM, container with a volume, Fly.io volume,
 * Railway volume, Docker volume…). On a serverless/ephemeral filesystem
 * (Vercel/Lambda), it is NOT safe — deploy with the PostgreSQL schema
 * (db/schema-postgres.sql) and the documented adapter path instead. The
 * repository layer is plain SQL, so queries port forward with minimal changes.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

declare global {
  var __zenframeDb: DatabaseSync | undefined;
  var __zenframeMigrationsRun: number | undefined;
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
/* Schema migrations                                                   */
/* ------------------------------------------------------------------ */

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
/* Connection                                                          */
/* ------------------------------------------------------------------ */

function openDb(): DatabaseSync {
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

export function getDb(): DatabaseSync {
  if (!globalThis.__zenframeDb) globalThis.__zenframeDb = openDb();
  return globalThis.__zenframeDb;
}

/* ------------------------------------------------------------------ */
/* Backup                                                              */
/* ------------------------------------------------------------------ */

/**
 * Consistent hot backup via SQLite's own `VACUUM INTO` (safe while the app is
 * writing, unlike a raw file copy of a live WAL database).
 */
export function backupDatabase(destDir = BACKUP_DIR): string {
  fs.mkdirSync(destDir, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, "-");
  const dest = path.join(destDir, `zenframe-${stamp}.db`);
  const db = getDb();
  db.prepare("VACUUM INTO ?").run(dest);
  return dest;
}

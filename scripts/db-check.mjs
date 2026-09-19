#!/usr/bin/env node
/**
 * Database health check: integrity, migration status, row counts and storage
 * footprint. Safe to run against a live database (read-only queries + pragma).
 *
 * Usage: npm run db:check
 */

import { DatabaseSync } from "node:sqlite"; // SQLite tooling — development only
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.ZENFRAME_DATA_DIR
  ? path.resolve(process.env.ZENFRAME_DATA_DIR)
  : path.resolve(process.cwd(), "data");
const dbFile = path.join(dataDir, "zenframe.db");

if (!fs.existsSync(dbFile)) {
  console.log(`• No database at ${dbFile} yet — it is created on first request.`);
  process.exit(0);
}

const db = new DatabaseSync(dbFile, { readOnly: true });
if (process.env.NODE_ENV === "production") {
  console.error(
    "[zenframe] db:check inspects the local SQLite file and is a development " +
      "tool. In production (Postgres) run database health checks against your " +
      "provider (e.g. `psql \"$DATABASE_URL\" -c \"SELECT 1\"`) instead."
  );
  process.exit(1);
}
const q = (sql) => {
  try {
    return db.prepare(sql).all();
  } catch (err) {
    return [{ error: err.message }];
  }
};

console.log(`ZenFrame database\n  file: ${dbFile}`);
console.log(`  size: ${(fs.statSync(dbFile).size / 1024).toFixed(1)} KB`);

const integrity = q("PRAGMA integrity_check")[0];
console.log(`  integrity: ${integrity?.integrity_check ?? JSON.stringify(integrity)}`);

const migrations = q("SELECT version, name, applied_at FROM schema_migrations ORDER BY version");
console.log(`  migrations applied: ${migrations.length}`);
for (const m of migrations) console.log(`    ${m.version}. ${m.name} — ${m.applied_at}`);

const tables = [
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
];
console.log("  rows:");
for (const t of tables) {
  const row = q(`SELECT COUNT(*) AS n FROM ${t}`)[0];
  console.log(`    ${t.padEnd(20)} ${row?.n ?? row?.error ?? "?"}`);
}

/* ------------------------------------------------------------------ */
/* Storage health                                                      */
/* ------------------------------------------------------------------ */

const uploadsDir = path.join(dataDir, "uploads");
const problems = [];

/** Every storage key referenced by a row, with its owner for context. */
const referenced = new Map();
for (const row of q("SELECT id, storage_path, thumb_path FROM creations")) {
  if (row.error) break;
  for (const key of [row.storage_path, row.thumb_path]) {
    if (!key) continue;
    referenced.set(key, row.id);
    // Keys are object keys, never filesystem paths: a backslash means the row
    // was written by a pre-migration Windows process and can no longer be read.
    if (key.includes("\\")) {
      problems.push(`creation ${row.id} has a Windows-style key: ${key}`);
    }
  }
}

const onDisk = new Set();
if (fs.existsSync(uploadsDir)) {
  const walk = (dir, prefix = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else onDisk.add(rel);
    }
  };
  walk(uploadsDir);
  console.log(`  stored image files: ${onDisk.size}`);
}

// Referenced but absent => a broken image somewhere in the product.
const missing = [...referenced.keys()].filter((k) => !onDisk.has(k));
for (const key of missing) {
  problems.push(`creation ${referenced.get(key)} references a missing file: ${key}`);
}

// Present but unreferenced => leaked storage that a delete missed.
const orphans = [...onDisk].filter((k) => !referenced.has(k) && !k.startsWith("avatars/"));

if (problems.length) {
  console.log(`\n  ✗ ${problems.length} storage problem(s):`);
  for (const p of problems.slice(0, 20)) console.log(`      ${p}`);
  if (problems.length > 20) console.log(`      … and ${problems.length - 20} more`);
} else {
  console.log("  storage references: all resolve ✓");
}
if (orphans.length) {
  console.log(`  orphaned files: ${orphans.length} (not referenced by any row)`);
}

db.close();

// A missing file is a real, actionable defect; orphans are informational.
process.exit(missing.length || problems.length ? 1 : 0);

#!/usr/bin/env node
/**
 * Backup the ZenFrame SQLite database.
 *
 * Uses SQLite's own `VACUUM INTO`, which is safe to run while the app is writing
 * (unlike copying the file, which can tear a WAL database). Uploaded images live
 * in `<DATA_DIR>/uploads` and should be snapshotted too — see README "Backup
 * strategy".
 *
 * Usage:  npm run db:backup            # → data/backups/zenframe-<timestamp>.db
 *         npm run db:backup -- --keep 7 --dir /mnt/backups
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dataDir = process.env.ZENFRAME_DATA_DIR
  ? path.resolve(process.env.ZENFRAME_DATA_DIR)
  : path.resolve(process.cwd(), "data");
const dbFile = path.join(dataDir, "zenframe.db");
const outDir = path.resolve(flag("dir", path.join(dataDir, "backups")));
const keep = Number(flag("keep", "10"));

if (!fs.existsSync(dbFile)) {
  console.error(`✗ No database found at ${dbFile} — nothing to back up.`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(outDir, `zenframe-${stamp}.db`);

const db = new DatabaseSync(dbFile, { readOnly: false });
try {
  db.prepare("VACUUM INTO ?").run(dest);
} finally {
  db.close();
}

const size = fs.statSync(dest).size;
console.log(`✓ Backup written: ${dest} (${(size / 1024).toFixed(1)} KB)`);

// Retention: keep the newest N backups.
const backups = fs
  .readdirSync(outDir)
  .filter((f) => f.startsWith("zenframe-") && f.endsWith(".db"))
  .sort()
  .reverse();
for (const old of backups.slice(keep)) {
  fs.unlinkSync(path.join(outDir, old));
  console.log(`  removed old backup ${old}`);
}
console.log(
  `  ${Math.min(backups.length, keep)} backup(s) retained in ${outDir}. ` +
    `Remember to snapshot ${path.join(dataDir, "uploads")} as well.`
);

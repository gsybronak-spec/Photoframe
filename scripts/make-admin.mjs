#!/usr/bin/env node
/**
 * Grant (or revoke) the admin role.
 *
 * There is no in-app path to the first admin on purpose — privilege escalation
 * should require filesystem access to the database, not a web request.
 *
 * Usage: npm run db:admin -- you@studio.com
 *        npm run db:admin -- someone@studio.com --revoke
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const [email, ...flags] = process.argv.slice(2);
if (!email) {
  console.error("Usage: npm run db:admin -- <email> [--revoke]");
  process.exit(1);
}

const dataDir = process.env.ZENFRAME_DATA_DIR
  ? path.resolve(process.env.ZENFRAME_DATA_DIR)
  : path.resolve(process.cwd(), "data");
const dbFile = path.join(dataDir, "zenframe.db");
if (!fs.existsSync(dbFile)) {
  console.error(`✗ No database at ${dbFile}. Start the app once so it can be created.`);
  process.exit(1);
}

const revoke = flags.includes("--revoke");
const role = revoke ? "user" : "admin";
const db = new DatabaseSync(dbFile);
const res = db
  .prepare("UPDATE users SET role = ?, updated_at = ? WHERE lower(email) = lower(?)")
  .run(role, new Date().toISOString(), email.trim());
db.close();

if (Number(res.changes) === 0) {
  console.error(`✗ No account found for ${email}.`);
  process.exit(1);
}
console.log(`✓ ${email} is now role=${role}.`);
if (revoke === false) {
  console.log("  If the last admin is being demoted, do it deliberately — the UI blocks it.");
}

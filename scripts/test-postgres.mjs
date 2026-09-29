/**
 * PostgreSQL integration test for the ZenFrame database adapter.
 *
 * Runs against a REAL PostgreSQL database when one is configured:
 *   TEST_DATABASE_URL  — preferred: a disposable/test database
 *   DATABASE_URL       — fallback (rows are namespaced `zenpgtest_*` and removed)
 *
 * Everything the test creates is prefixed `zenpgtest_` and deleted in the
 * cleanup phase, so no production data is ever touched or left behind.
 *
 * When no Postgres URL is configured the script exits 0 and prints:
 *   "PostgreSQL integration test not executed — DATABASE_URL not configured"
 * so CI stays green while never faking a pass.
 *
 * Usage:
 *   node scripts/test-postgres.mjs
 *   TEST_DATABASE_URL=postgres://… node scripts/test-postgres.mjs
 *
 * The adapter (src/server/db.ts) is TypeScript — loaded via Node's built-in
 * type stripping (Node >= 22.6). This mirrors how scripts/db-* work and avoids
 * a build step. The script sets DATABASE_DRIVER=postgres explicitly so the
 * deterministic driver selection targets the pg driver even outside production.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const URL_TO_USE =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";

if (!URL_TO_USE) {
  console.log(
    "PostgreSQL integration test not executed — DATABASE_URL not configured.\n" +
      "To run it: TEST_DATABASE_URL=postgres://… node scripts/test-postgres.mjs"
  );
  process.exit(0);
}

if (URL_TO_USE.includes("sslmode=disable") === false && !/localhost|127\.0\.0\.1|::1/.test(URL_TO_USE)) {
  // Managed providers (Neon etc.) need TLS; the adapter already handles this,
  // but a test DB should be disposable — warn loudly if it does not look like one.
  if (!/test|tmp|sandbox|dev/i.test(URL_TO_USE)) {
    console.warn(
      "[zenpg-test] WARNING: the target does not look like a disposable test " +
        "database. Rows are namespaced zenpgtest_ and removed, but double-check " +
        "TEST_DATABASE_URL points at a test database."
    );
  }
}

process.env.DATABASE_DRIVER = "postgres";
process.env.DATABASE_URL = URL_TO_USE;
process.env.NODE_ENV = process.env.NODE_ENV ?? "development";

// Import the REAL adapter after env is set (dynamic — env must be in place).
const { getDb, resolveDriver } = await import(
  `file://${path.join(ROOT, "src/server/db.ts").replace(/\\/g, "/")}`
);

const results = [];
let failed = 0;

function check(name, cond, extra = "") {
  const ok = Boolean(cond);
  results.push({ name, ok, extra });
  if (!ok) failed += 1;
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${extra ? ` — ${extra}` : ""}`);
}

const PREFIX = "zenpgtest_";
const TEST_EMAIL = `${PREFIX}user@example.com`;
const uid = `${PREFIX}u${Date.now().toString(36)}`;
const creationId = `${PREFIX}c${Date.now().toString(36)}`;
const sessionId = `${PREFIX}s${Date.now().toString(36)}`;
const tokenHash = `${PREFIX}t${Date.now().toString(36)}`;
const analyticsId = `${PREFIX}a${Date.now().toString(36)}`;
const deliveryId = `${PREFIX}d${Date.now().toString(36)}`;
const overrideFrame = `${PREFIX}frame`;
const settingsKey = `${PREFIX}setting`;

console.log(`\nPostgreSQL adapter integration test`);
console.log(`driver resolved: ${resolveDriver()}\n`);

const db = await getDb();

try {
  /* 1. create test user ------------------------------------------------- */
  await db.tx(async (tx) => {
    await tx
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, role, status, firebase_uid, created_at, updated_at)
         VALUES (?, ?, ?, '', 'user', 'active', ?, ?, ?)`
      )
      .run(uid, TEST_EMAIL, "PG Test User", `${PREFIX}firebase-uid`, new Date().toISOString(), new Date().toISOString());
    await tx
      .prepare("INSERT INTO profiles (user_id, bio, updated_at) VALUES (?, '', ?)")
      .run(uid, new Date().toISOString());
  });
  check("1. user + profile created (transaction)", true);

  /* 2. retrieve user ----------------------------------------------------- */
  const user = await db.prepare("SELECT id, email, name, role, status FROM users WHERE email = ?").get(TEST_EMAIL);
  check("2. user retrieved by email", user && user.id === uid && user.name === "PG Test User");

  /* 3. update Firebase UID ----------------------------------------------- */
  const newFb = `${PREFIX}firebase-uid-2`;
  const upd = await db.prepare("UPDATE users SET firebase_uid = ?, updated_at = ? WHERE id = ?").run(newFb, new Date().toISOString(), uid);
  check("3. firebase_uid updated (rowCount/changes)", (upd.changes ?? 0) === 1);
  const byFb = await db.prepare("SELECT id FROM users WHERE firebase_uid = ?").get(newFb);
  check("3b. user found by firebase_uid", byFb && byFb.id === uid);

  /* 4. profile read/update ------------------------------------------------ */
  await db.prepare(
    `INSERT INTO profiles (user_id, bio, studio, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET bio = excluded.bio, studio = excluded.studio, updated_at = excluded.updated_at`
  ).run(uid, "test bio", "Test Studio", new Date().toISOString());
  const profile = await db.prepare("SELECT bio, studio FROM profiles WHERE user_id = ?").get(uid);
  check("4. profile upsert + read", profile && profile.bio === "test bio" && profile.studio === "Test Studio");

  /* 5. session creation ---------------------------------------------------- */
  await db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, uid, tokenHash, new Date(Date.now() + 86400e3).toISOString(), new Date().toISOString());
  check("5. session created", true);

  /* 6. session retrieval (join + comparison operators) --------------------- */
  const sess = await db
    .prepare(
      `SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash, new Date().toISOString());
  check("6. session retrieved via JOIN + expires_at >", sess && sess.id === sessionId);

  /* 7. creation row -------------------------------------------------------- */
  await db.prepare(
    `INSERT INTO creations (id, user_id, frame_id, caption, storage_path, mime_type, bytes, thumb_bytes, visibility, share_show_caption, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'private', 1, ?, ?)`
  ).run(creationId, uid, "sunrise-flow", "test caption", `${PREFIX}full.png`, "image/png", 12345, 678, new Date().toISOString(), new Date().toISOString());
  const creation = await db.prepare("SELECT bytes, thumb_bytes FROM creations WHERE id = ?").get(creationId);
  check(
    "7. creation inserted; INTEGER types arrive as numbers",
    creation && typeof creation.bytes === "number" && creation.bytes === 12345 && creation.thumb_bytes === 678,
    `bytes=${typeof creation?.bytes}`
  );

  /* 8. creation retrieval + aggregates (COALESCE/SUM/COUNT) ----------------- */
  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes,
              COALESCE(SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END), 0) AS publicCount
       FROM creations WHERE user_id = ?`
    )
    .get(uid);
  check(
    "8. aggregate query (COUNT/SUM/CASE) numeric coercion",
    totals && totals.n === 1 && totals.bytes === 12345 && totals.publicCount === 0,
    `n=${typeof totals?.n}`
  );

  /* 9. saved frames insert/read/delete -------------------------------------- */
  await db.prepare("INSERT INTO saved_frames (user_id, frame_id, created_at) VALUES (?, ?, ?)").run(uid, "sunrise-flow", new Date().toISOString());
  const saved = await db.prepare("SELECT frame_id FROM saved_frames WHERE user_id = ?").all(uid);
  check("9. saved_frames insert/read", saved.length === 1 && saved[0].frame_id === "sunrise-flow");

  /* 10. activity insert/read ------------------------------------------------ */
  await db.prepare(
    "INSERT INTO activity (id, user_id, type, message, meta, created_at, actor_id) VALUES (?, ?, 'creation_saved', 'pg test', '{}', ?, ?)"
  ).run(`${PREFIX}act`, uid, new Date().toISOString(), uid);
  const act = await db.prepare("SELECT id, type FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(uid);
  check("10. activity insert/read", act && act.type === "creation_saved");

  /* 11. analytics insert ------------------------------------------------------ */
  await db.prepare(
    "INSERT INTO analytics_events (id, user_id, event, props, created_at) VALUES (?, ?, 'signup', '{}', ?)"
  ).run(analyticsId, uid, new Date().toISOString());
  const an = await db.prepare("SELECT event FROM analytics_events WHERE id = ?").get(analyticsId);
  check("11. analytics_events insert/read", an && an.event === "signup");

  /* 12. settings read/write (upsert) ------------------------------------------- */
  await db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(settingsKey, "hello", new Date().toISOString());
  const setting = await db.prepare("SELECT value FROM settings WHERE key = ?").get(settingsKey);
  check("12. settings upsert/read", setting && setting.value === "hello");

  /* 13. frame override read/write ----------------------------------------------- */
  await db.prepare(
    `INSERT INTO frame_overrides (frame_id, description, tags, featured, active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(frame_id) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at`
  ).run(overrideFrame, "PG test override", '["test"]', 1, 1, new Date().toISOString());
  const ov = await db.prepare("SELECT description, featured, active FROM frame_overrides WHERE frame_id = ?").get(overrideFrame);
  check("13. frame_overrides upsert/read", ov && ov.description === "PG test override" && ov.featured === 1);

  /* 14. subscription read/write --------------------------------------------------- */
  await db.prepare(
    `INSERT INTO subscriptions (user_id, plan_id, status, created_at, updated_at) VALUES (?, 'studio', 'active', ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET plan_id = excluded.plan_id, updated_at = excluded.updated_at`
  ).run(uid, new Date().toISOString(), new Date().toISOString());
  const sub = await db.prepare("SELECT plan_id, status FROM subscriptions WHERE user_id = ?").get(uid);
  check("14. subscriptions upsert/read", sub && sub.plan_id === "studio" && sub.status === "active");

  /* 15. transactional rollback behavior ---------------------------------------------- */
  let rolledBack = false;
  try {
    await db.tx(async (tx) => {
      await tx
        .prepare("INSERT INTO activity (id, user_id, type, message, meta, created_at) VALUES (?, ?, 'system', 'should rollback', '{}', ?)")
        .run(`${PREFIX}rollback`, uid, new Date().toISOString());
      throw new Error("intentional rollback");
    });
  } catch (err) {
    rolledBack = err instanceof Error && err.message === "intentional rollback";
  }
  const rbRow = await db.prepare("SELECT id FROM activity WHERE id = ?").get(`${PREFIX}rollback`);
  check("15. transaction rollback leaves no partial writes", rolledBack && !rbRow);

  /* 16. email delivery record (schema coverage) ----------------------------------------- */
  await db.prepare(
    "INSERT INTO email_deliveries (id, user_id, template, to_domain, provider, status, detail, created_at) VALUES (?, ?, 'verify_email', 'example.com', 'test', 'sent', NULL, ?)"
  ).run(deliveryId, uid, new Date().toISOString());
  const del = await db.prepare("SELECT template, status FROM email_deliveries WHERE id = ?").get(deliveryId);
  check("16. email_deliveries insert/read", del && del.template === "verify_email" && del.status === "sent");
} catch (err) {
  failed += 1;
  console.error("  ✘ UNEXPECTED ERROR:", err instanceof Error ? err.message : err);
} finally {
  /* cleanup — remove every namespaced row (order respects FKs) ------------- */
  try {
    const cleanup = [
      ["DELETE FROM analytics_events WHERE id = ?", [analyticsId]],
      ["DELETE FROM email_deliveries WHERE id = ?", [deliveryId]],
      ["DELETE FROM saved_frames WHERE user_id = ?", [uid]],
      ["DELETE FROM activity WHERE user_id = ? OR id = ?", [uid, `${PREFIX}rollback`]],
      ["DELETE FROM creations WHERE user_id = ?", [uid]],
      ["DELETE FROM sessions WHERE user_id = ?", [uid]],
      ["DELETE FROM subscriptions WHERE user_id = ?", [uid]],
      ["DELETE FROM verification_tokens WHERE user_id = ?", [uid]],
      ["DELETE FROM profiles WHERE user_id = ?", [uid]],
      ["DELETE FROM users WHERE id = ?", [uid]],
      ["DELETE FROM frame_overrides WHERE frame_id = ?", [overrideFrame]],
      ["DELETE FROM settings WHERE key = ?", [settingsKey]],
    ];
    for (const [sql, params] of cleanup) {
      await db.prepare(sql).run(...params);
    }
    console.log("\ncleanup: all zenpgtest_* rows removed");
  } catch (err) {
    console.error("cleanup FAILED — manual removal of zenpgtest_* rows required:", err instanceof Error ? err.message : err);
  }
}

/* ------------------------------------------------------------------ */
/* Baseline schema sanity + report                                      */
/* ------------------------------------------------------------------ */

// Verify every table the runtime contract requires exists in the test DB.
const REQUIRED = [
  "users", "profiles", "sessions", "verification_tokens", "creations",
  "saved_frames", "activity", "frame_overrides", "settings",
  "subscriptions", "analytics_events", "email_deliveries", "schema_migrations",
];
for (const t of REQUIRED) {
  const row = await db.prepare("SELECT to_regclass($1) AS present").get(`public.${t}`);
  check(`table present: ${t}`, Boolean(row?.present));
}

// If db/schema-postgres.sql is present, confirm it still matches the embedded
// baseline (drift guard — the embedded copy is what the runtime applies).
const sqlFile = path.join(ROOT, "db", "schema-postgres.sql");
if (fs.existsSync(sqlFile)) {
  const { POSTGRES_BASELINE_SCHEMA, POSTGRES_CAMPAIGNS_SCHEMA } = await import(
    `file://${path.join(ROOT, "src/server/db.ts").replace(/\\/g, "/")}`
  );
  const fileSql = fs.readFileSync(sqlFile, "utf8");
  const norm = (s) =>
    s
      .replace(/--.*$/gm, "") // strip line comments
      .replace(/\/\*[\s\S]*?\*\//g, "") // strip block comments
      .replace(/\s+/g, " ")
      .replace(/\s*([(),;])\s*/g, "$1")
      .trim();
  check(
    "schema-postgres.sql matches embedded baseline (no drift)",
    norm(fileSql) === norm(`${POSTGRES_BASELINE_SCHEMA}\n${POSTGRES_CAMPAIGNS_SCHEMA}`)
  );
}

await db.exec("SELECT 1").catch(() => {});

const passed = results.length - failed;
console.log(`\n${passed}/${results.length} checks passed`);

if (failed > 0) {
  console.error(`PostgreSQL integration test FAILED (${failed} failures)`);
  process.exit(1);
}
console.log("PostgreSQL integration test PASSED");
process.exit(0);

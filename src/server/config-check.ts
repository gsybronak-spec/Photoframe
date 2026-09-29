/**
 * Pre-launch configuration validation.
 *
 * Runs once when the server boots (via Next.js instrumentation). It performs
 * NO destructive action and never crashes the server: in production it logs a
 * loud, actionable warning for each critical misconfiguration so an operator
 * notices before real users do.
 *
 * Checked:
 *   - email provider configured (production must have Resend or SMTP)
 *   - dev mail logging must NOT be enabled in production
 *   - ZENFRAME_DATA_DIR present + writable + NOT on the ephemeral default in production
 *   - NEXT_PUBLIC_SITE_URL uses HTTPS in production
 *   - storage driver availability
 *   - rate-limit driver sanity (redis requested but not configured)
 */

import fs from "node:fs";
import path from "node:path";
import { validateFrameRegistry } from "@/lib/frames";

const isProd = process.env.NODE_ENV === "production";

function warn(msg: string) {
  console.warn(`\n⚠️  [zenframe:config] ${msg}\n`);
}

function info(msg: string) {
  console.log(`[zenframe:config] ${msg}`);
}

export function validateProductionConfig(): void {
  const problems: string[] = [];

  /* --- Email ------------------------------------------------------------- */
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
  const explicit = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();

  if (isProd && !hasResend && !hasSmtp) {
    problems.push(
      "No email provider configured. Password-reset and verification emails " +
        "WILL FAIL SILENTLY for users. Set RESEND_API_KEY (recommended) or " +
        "SMTP_HOST + SMTP_PORT before launch."
    );
  }
  if (explicit && !["resend", "smtp", "console"].includes(explicit)) {
    problems.push(`EMAIL_PROVIDER="${explicit}" is not one of: resend | smtp | console.`);
  }
  if (explicit === "resend" && !hasResend) {
    problems.push('EMAIL_PROVIDER=resend but RESEND_API_KEY is missing.');
  }
  if (explicit === "smtp" && !hasSmtp) {
    problems.push('EMAIL_PROVIDER=smtp but SMTP_HOST/SMTP_PORT are missing.');
  }
  if (explicit === "console" && isProd && process.env.ALLOW_DEV_MAIL_LOG !== "1") {
    problems.push(
      'EMAIL_PROVIDER=console in production has no effect: dev mail logging is ' +
        'disabled unless ALLOW_DEV_MAIL_LOG=1 — which you should NOT set in production.'
    );
  }
  if (process.env.ALLOW_DEV_MAIL_LOG === "1" && isProd) {
    problems.push(
      "ALLOW_DEV_MAIL_LOG=1 in production writes verification/reset links to a " +
        "plain file on disk. This is a security risk — remove it."
    );
  }

  /* --- Data directory ---------------------------------------------------- */
  const dataDir = process.env.ZENFRAME_DATA_DIR
    ? path.resolve(process.env.ZENFRAME_DATA_DIR)
    : path.resolve(process.cwd(), "data");

  if (isProd && !process.env.ZENFRAME_DATA_DIR) {
    problems.push(
      "ZENFRAME_DATA_DIR is not set. The local SQLite database and uploads default " +
        "to <project>/data, which is EPHEMERAL on most hosts. Production data lives " +
        "in PostgreSQL (DATABASE_URL) and Vercel Blob (STORAGE_DRIVER=blob); set " +
        "ZENFRAME_DATA_DIR only for local development."
    );
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
  } catch {
    problems.push(`Data directory ${dataDir} is not writable by this process.`);
  }

  /* --- Site URL ---------------------------------------------------------- */
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    problems.push(
      "NEXT_PUBLIC_SITE_URL is not set — canonical URLs, OG images, sitemap.xml " +
        "and email links will fall back to the default domain."
    );
  } else if (isProd && !siteUrl.startsWith("https://")) {
    problems.push(
      `NEXT_PUBLIC_SITE_URL="${siteUrl}" is not HTTPS. Session cookies are ` +
        `marked Secure in production and will NOT be sent over plain HTTP — ` +
        `sign-in will silently fail. Use https://.`
    );
  }

  /* --- Storage driver ---------------------------------------------------- */
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver === "blob" && !process.env.BLOB_READ_WRITE_TOKEN && isProd) {
    problems.push(
      'STORAGE_DRIVER=blob but BLOB_READ_WRITE_TOKEN is missing. Image uploads ' +
        'will fail at runtime. Connect a Vercel Blob store to the project so the ' +
        'token is injected, or set it manually.'
    );
  }
  if (driver !== "local" && driver !== "blob") {
    problems.push(
      `STORAGE_DRIVER="${driver}" is not implemented; uploads will throw at runtime. ` +
        `Use "local" (development) or "blob" (Vercel production).`
    );
  }

  /* --- Firebase Auth (production identity provider) ---------------------- */
  const hasFirebaseAdmin = Boolean(
    (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
  if (isProd && !hasFirebaseAdmin) {
    problems.push(
      "Firebase Admin credentials are missing — Firebase sign-in will be rejected " +
        "(FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). If you " +
        "intentionally run password-mode auth instead, ignore this warning."
    );
  }

  /* --- Database driver (deterministic; SQLite refused in production) ------ */
  const dbDriver = (process.env.DATABASE_DRIVER ?? "").trim().toLowerCase();
  if (dbDriver && !["sqlite", "postgres"].includes(dbDriver)) {
    problems.push(
      `DATABASE_DRIVER="${dbDriver}" is invalid — use "sqlite" (development) or "postgres" (production).`
    );
  }
  if (dbDriver === "sqlite" && isProd) {
    problems.push(
      'DATABASE_DRIVER=sqlite is not allowed in production. Set DATABASE_URL ' +
        '(Neon/managed Postgres) — SQLite is development-only.'
    );
  }
  if (isProd && !process.env.DATABASE_URL) {
    problems.push(
      "DATABASE_URL is not set. Production requires PostgreSQL (Neon/managed " +
        "Postgres) — the app refuses to boot SQLite in production, so requests " +
        "will fail. Apply db/schema-postgres.sql to the database first."
    );
  }
  if (!isProd && !process.env.DATABASE_URL && dbDriver !== "postgres") {
    info("database: local SQLite (development mode)");
  }

  /* --- Data directory (SQLite/uploads only — NOT the production DB) ------- */
  if (isProd && process.env.ZENFRAME_DATA_DIR &&
      /\/(var|tmp)\/|\/home\/|C:\\Users|vercel/i.test(process.env.ZENFRAME_DATA_DIR)) {
    problems.push(
      "ZENFRAME_DATA_DIR looks ephemeral. On Vercel the function filesystem does " +
        "not persist: run production against PostgreSQL (DATABASE_URL) and Vercel " +
        "Blob (STORAGE_DRIVER=blob)."
    );
  }

  /* --- Rate limiter ------------------------------------------------------ */
  if (
    (process.env.RATE_LIMIT_DRIVER ?? "").trim().toLowerCase() === "redis" &&
    !(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ) {
    problems.push(
      "RATE_LIMIT_DRIVER=redis but UPSTASH_REDIS_REST_URL/TOKEN are missing — " +
        "falling back to the in-memory limiter (single-instance only)."
    );
  }

  /* --- Frame registry validation ----------------------------------------- */
  const registryReport = validateFrameRegistry();
  for (const w of registryReport.warnings) {
    warn(`Frame registry warning: ${w}`);
  }
  if (!registryReport.valid) {
    problems.push(
      `Frame registry detected duplicate slugs/IDs: ${[
        ...registryReport.duplicateSlugs,
        ...registryReport.duplicateIds,
      ].join(", ")}`
    );
  } else {
    info(`frame registry: ${registryReport.total} frames verified & ready`);
  }

  /* --- Report ------------------------------------------------------------ */
  if (problems.length) {
    console.warn(
      `\n══════════════════════════════════════════════════════════\n` +
        `  ZenFrame production configuration problems (${problems.length})\n` +
        `══════════════════════════════════════════════════════════`
    );
    for (const p of problems) warn(p);
  } else {
    info(
      `configuration OK (NODE_ENV=${process.env.NODE_ENV}, dataDir=${dataDir}, ` +
        `email=${hasResend ? "resend" : hasSmtp ? "smtp" : isProd ? "MISSING" : "dev-console"})`
    );
  }
}

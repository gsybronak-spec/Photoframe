#!/usr/bin/env node
/**
 * ZenFrame API regression + security suite.
 *
 * Self-contained: it builds a throwaway database in `data-test/`, starts the
 * production server on a spare port, runs every check below against real HTTP,
 * then tears everything down. No mocks, no fixtures — the same code paths a real
 * user hits.
 *
 * Prerequisites: `npm run build` (the suite runs `next start`).
 * Usage:  npm run test:api
 *         SMOKE_PORT=3200 SMOKE_BASE=http://localhost:3000 npm run test:api -- --no-server
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data-test");
const DB_FILE = path.join(DATA_DIR, "zenframe.db");
const MAIL_FILE = path.join(DATA_DIR, ".mail");
const PORT = Number(process.env.SMOKE_PORT ?? 3100);
const BASE = process.env.SMOKE_BASE ?? `http://127.0.0.1:${PORT}`;
const USE_SERVER = !process.argv.includes("--no-server");

/* ------------------------------------------------------------------ */
/* Tiny test harness                                                   */
/* ------------------------------------------------------------------ */

const results = [];
let group = "";

function section(name) {
  group = name;
  console.log(`\n${name}`);
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ group, name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ group, name, ok: false, detail: err.message });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}
function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/* ------------------------------------------------------------------ */
/* HTTP helpers with a manual cookie jar                               */
/* ------------------------------------------------------------------ */

let jar = {};

async function req(
  pathname,
  { method = "GET", body, headers = {}, raw = false, origin } = {}
) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(origin === null ? {} : origin ? { Origin: origin } : {}),
      ...(Object.keys(jar).length
        ? { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") }
        : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    if (value === "" || /expires=Thu, 01 Jan 1970/i.test(cookie)) delete jar[name];
    else jar[name] = value;
  }

  const text = await res.text();
  let json = null;
  if (!raw) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text, headers: res.headers };
}

const useJar = (next) => {
  jar = next;
};
const freshJar = () => ({});
const cloneJar = () => ({ ...jar });

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const unique = () => Math.random().toString(36).slice(2, 10);

/** Recursive file count — used to prove no images are orphaned after deletion. */
function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const full = path.join(dir, entry.name);
    return sum + (entry.isDirectory() ? countFiles(full) : 1);
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Mail log reader (dev mailer writes to <DATA_DIR>/.mail)             */
/* ------------------------------------------------------------------ */

function tokenFromMail(email, kind) {
  if (!fs.existsSync(MAIL_FILE)) return null;
  const blocks = fs.readFileSync(MAIL_FILE, "utf8").split("\n---\n");
  const re = new RegExp(`/${kind}\\?token=([A-Za-z0-9_-]+)`);
  for (const block of blocks.reverse()) {
    if (!block.includes(`to=${email}`)) continue;
    const m = re.exec(block);
    if (m) return m[1];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Server lifecycle                                                    */
/* ------------------------------------------------------------------ */

let server = null;

async function waitForServer(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/auth/me`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startServer() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Run the Next CLI with the current Node binary — avoids shell/quoting issues.
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ZENFRAME_DATA_DIR: DATA_DIR,
      DATABASE_DRIVER: "sqlite", // test-only: suite runs against a throwaway SQLite DB
      ZENFRAME_ALLOW_TEST_SQLITE: "1", // test-only: bypasses the production Postgres guard
      ALLOW_DEV_MAIL_LOG: "1", // test-only: makes verification links readable
      NEXT_PUBLIC_SITE_URL: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => {
    const text = String(d);
    if (/Error|error:/.test(text)) process.stderr.write(`  [server] ${text}`);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stopServer() {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await Promise.race([exited, sleep(4000)]);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await Promise.race([exited, sleep(2000)]);
    }
  }
  if (process.argv.includes("--keep")) {
    console.log(`  (kept test data in ${DATA_DIR})`);
    return;
  }
  // The OS can hold the SQLite/WAL files briefly after exit (notably Windows),
  // so retry instead of failing the whole run during teardown.
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch (err) {
    console.warn(`  ⚠ could not remove ${DATA_DIR} (${err.code}) — delete it manually if needed.`);
  }
}

/* ------------------------------------------------------------------ */
/* Test data                                                           */
/* ------------------------------------------------------------------ */

const stamp = Date.now();
const userA = { email: `alice.${stamp}.${unique()}@example.com`, password: "Sunrise123", name: "Alice Flow" };
const userB = { email: `bob.${stamp}.${unique()}@example.com`, password: "Moonlight123", name: "Bob Calm" };
let creationA = null;
let shareSlugA = null;
let adminId = null;
let userBId = null;
let userBJar = null;

/* ------------------------------------------------------------------ */
/* The suite                                                           */
/* ------------------------------------------------------------------ */

async function run() {
  const health = await fetch(`${BASE}/api/auth/me`);
  assert(health.ok, `server not reachable at ${BASE}`);

  /* ---------------- public surface ---------------- */
  section("Public surface & SEO");

  await check("GET / serves the landing page", async () => {
    const res = await req("/", { raw: true });
    eq(res.status, 200, "status");
    assert(res.text.includes("ZenFrame"), "brand missing");
  });

  await check("robots.txt disallows private areas", async () => {
    const res = await req("/robots.txt", { raw: true });
    eq(res.status, 200, "status");
    assert(res.text.includes("Disallow: /api/"), "api not disallowed");
    assert(res.text.includes("/dashboard"), "dashboard not disallowed");
    assert(res.text.includes("Sitemap:"), "sitemap missing");
  });

  await check("sitemap.xml lists frames with absolute URLs", async () => {
    const res = await req("/sitemap.xml", { raw: true });
    eq(res.status, 200, "status");
    assert(res.text.includes("/frames/"), "no frame urls");
    assert(res.text.includes("https://") || res.text.includes(BASE), "urls not absolute");
  });

  await check("frame page carries canonical + OG metadata", async () => {
    const res = await req("/frames/sunrise-salutation", { raw: true });
    eq(res.status, 200, "status");
    assert(/rel="canonical"/.test(res.text), "no canonical");
    assert(/property="og:image"/.test(res.text), "no og:image");
    assert(/name="twitter:card"/.test(res.text), "no twitter card");
    assert(/application\/ld\+json/.test(res.text), "no JSON-LD");
  });

  await check("unknown frame 404s", async () => {
    const res = await req("/frames/not-a-frame", { raw: true });
    eq(res.status, 404, "status");
  });

  await check("private pages redirect anonymous visitors to /login", async () => {
    for (const path of ["/dashboard", "/settings", "/admin"]) {
      const res = await req(path, { raw: true });
      assert([307, 302].includes(res.status), `${path}: expected redirect, got ${res.status}`);
      assert(
        res.headers.get("location")?.includes("/login"),
        `${path}: no login redirect`
      );
    }
  });

  await check("a forged session cookie still cannot see protected data", async () => {
    const res = await req("/dashboard", {
      raw: true,
      headers: { Cookie: "zenframe_session=totally-made-up-token" },
    });
    // Either an immediate redirect or a streamed redirect — never studio content.
    assert(
      !res.text.includes("My creations") && !res.text.includes("Namaste,"),
      "forged cookie rendered the dashboard"
    );
    const me = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: "zenframe_session=totally-made-up-token" },
    });
    const payload = await me.json();
    eq(payload.user, null, "forged cookie authenticated");
  });

  /* ---------------- signup + verification ---------------- */
  section("Signup, verification & sessions");

  await check("signup creates an unverified account + session", async () => {
    useJar(freshJar());
    const res = await req("/api/auth/signup", { method: "POST", body: userA });
    eq(res.status, 201, "status");
    assert(res.json.user.emailVerified === false, "should start unverified");
    const me = await req("/api/auth/me");
    eq(me.json.user.email, userA.email, "email");
    eq(me.json.user.emailVerified, false, "emailVerified");
  });

  await check("duplicate email is rejected (409)", async () => {
    const res = await req("/api/auth/signup", { method: "POST", body: userA });
    eq(res.status, 409, "status");
  });

  await check("weak password is rejected", async () => {
    const res = await req("/api/auth/signup", {
      method: "POST",
      body: { name: "Nope", email: `weak.${unique()}@example.com`, password: "short" },
    });
    eq(res.status, 400, "status");
  });

  await check("unverified users cannot save creations (403 EMAIL_NOT_VERIFIED)", async () => {
    const res = await req("/api/creations", {
      method: "POST",
      body: { frameSlug: "sunrise-salutation", caption: "hi", imageDataUrl: PNG_DATA_URL },
    });
    eq(res.status, 403, "status");
    eq(res.json.code, "EMAIL_NOT_VERIFIED", "code");
  });

  await check("verification link works and is idempotent", async () => {
    const token = tokenFromMail(userA.email, "verify-email");
    assert(token, "no verification token in mail log");
    const first = await req(`/api/auth/verify-email?token=${token}&format=json`);
    eq(first.status, 200, "first status");
    eq(first.json.status, "verified", "first status field");
    const replay = await req(`/api/auth/verify-email?token=${token}&format=json`);
    eq(replay.status, 200, "replay status");
    eq(replay.json.status, "already", "replay should be idempotent");
  });

  await check("bogus verification token is rejected", async () => {
    const res = await req("/api/auth/verify-email?token=definitelynotreal&format=json");
    eq(res.status, 400, "status");
    eq(res.json.status, "invalid", "status field");
  });

  await check("resend reports already-verified instead of re-mailing", async () => {
    const res = await req("/api/auth/verify-email", { method: "POST" });
    eq(res.status, 200, "status");
    eq(res.json.alreadyVerified, true, "alreadyVerified");
  });

  await check("session persists across requests", async () => {
    const res = await req("/api/auth/me");
    eq(res.json.user.email, userA.email, "email");
    eq(res.json.user.emailVerified, true, "emailVerified after verification");
  });

  await check("logout clears the session", async () => {
    await req("/api/auth/logout", { method: "POST" });
    const me = await req("/api/auth/me");
    eq(me.json.user, null, "user after logout");
  });

  await check("login rejects wrong password generically", async () => {
    const res = await req("/api/auth/login", {
      method: "POST",
      body: { email: userA.email, password: "WrongPass123" },
    });
    eq(res.status, 401, "status");
    const unknown = await req("/api/auth/login", {
      method: "POST",
      body: { email: `ghost.${unique()}@example.com`, password: "WrongPass123" },
    });
    eq(unknown.status, 401, "unknown email status");
    eq(res.json.error, unknown.json.error, "messages must not differ (no enumeration)");
  });

  await check("login succeeds and issues a cookie session", async () => {
    useJar(freshJar());
    const res = await req("/api/auth/login", { method: "POST", body: userA });
    eq(res.status, 200, "status");
    assert(jar.zenframe_session, "no session cookie");
    const me = await req("/api/auth/me");
    eq(me.json.user.email, userA.email, "email");
  });

  /* ---------------- creations ---------------- */
  section("Creations, storage & image variants");

  await check("save persists a creation with a thumbnail", async () => {
    const res = await req("/api/creations", {
      method: "POST",
      body: {
        frameSlug: "sunrise-salutation",
        caption: "morning light",
        imageDataUrl: PNG_DATA_URL,
        thumbDataUrl: PNG_DATA_URL,
      },
    });
    eq(res.status, 201, "status");
    creationA = res.json.creation.id;
    eq(res.json.creation.visibility, "private", "defaults to private");
  });

  await check("unsupported file signature is rejected (magic bytes)", async () => {
    const fake = `data:image/png;base64,${Buffer.from("not an image at all").toString("base64")}`;
    const res = await req("/api/creations", {
      method: "POST",
      body: { frameSlug: "sunrise-salutation", imageDataUrl: fake },
    });
    eq(res.status, 415, "status");
  });

  await check("unknown frame slug is rejected", async () => {
    const res = await req("/api/creations", {
      method: "POST",
      body: { frameSlug: "does-not-exist", imageDataUrl: PNG_DATA_URL },
    });
    eq(res.status, 404, "status");
  });

  await check("listing returns the creation with a next cursor shape", async () => {
    const res = await req("/api/creations?limit=12");
    eq(res.status, 200, "status");
    assert(
      res.json.creations.some((c) => c.id === creationA),
      "creation missing from list"
    );
    assert("nextCursor" in res.json, "no nextCursor field");
    assert(res.json.totals.n >= 1, "totals missing");
  });

  await check("owner can read full + thumbnail with private cache headers", async () => {
    const full = await req(`/api/creations/${creationA}/image`, { raw: true });
    eq(full.status, 200, "full status");
    eq(full.headers.get("content-type"), "image/png", "content type");
    assert(/private/.test(full.headers.get("cache-control") ?? ""), "cache must be private");
    assert(full.headers.get("x-content-type-options") === "nosniff", "nosniff missing");

    const thumb = await req(`/api/creations/${creationA}/image?variant=thumb`, { raw: true });
    eq(thumb.status, 200, "thumb status");
  });

  await check("image ETag revalidation returns 304", async () => {
    const first = await req(`/api/creations/${creationA}/image`, { raw: true });
    const etag = first.headers.get("etag");
    assert(etag, "no etag");
    const second = await req(`/api/creations/${creationA}/image`, {
      raw: true,
      headers: { "If-None-Match": etag },
    });
    eq(second.status, 304, "status");
  });

  /* ---------------- second user + IDOR ---------------- */
  section("Authorization, IDOR & cross-user isolation");

  await check("second user signs up, verifies and gets their own identity", async () => {
    useJar(freshJar());
    const signup = await req("/api/auth/signup", { method: "POST", body: userB });
    eq(signup.status, 201, "signup status");
    userBId = signup.json.user.id;
    const token = tokenFromMail(userB.email, "verify-email");
    assert(token, "no token for user B");
    await req(`/api/auth/verify-email?token=${token}&format=json`);
    const me = await req("/api/auth/me");
    eq(me.json.user.email, userB.email, "B session");
    userBJar = cloneJar();
  });

  await check("user B cannot list user A's creations", async () => {
    const res = await req("/api/creations");
    eq(res.status, 200, "status");
    assert(
      !res.json.creations.some((c) => c.id === creationA),
      "B can see A's creation"
    );
  });

  await check("user B cannot read user A's image (403)", async () => {
    const res = await req(`/api/creations/${creationA}/image`, { raw: true });
    eq(res.status, 403, "status");
  });

  await check("user B cannot delete user A's creation (403, row intact)", async () => {
    const res = await req(`/api/creations/${creationA}`, { method: "DELETE" });
    eq(res.status, 403, "status");
    const db = new DatabaseSync(DB_FILE, { readOnly: true });
    const row = db.prepare("SELECT id FROM creations WHERE id = ?").get(creationA);
    db.close();
    assert(row, "creation was deleted despite 403");
  });

  await check("user B cannot publish or unpublish user A's creation", async () => {
    const res = await req(`/api/creations/${creationA}`, {
      method: "PATCH",
      body: { visibility: "public" },
    });
    eq(res.status, 403, "status");
  });

  await check("user B cannot see user A's creation detail page", async () => {
    const res = await req(`/creations/${creationA}`, { raw: true });
    eq(res.status, 404, "status");
  });

  await check("user B cannot reach admin APIs (403)", async () => {
    const res = await req("/api/admin/overview");
    eq(res.status, 403, "status");
    const users = await req("/api/admin/users");
    eq(users.status, 403, "users status");
    const frames = await req("/api/admin/frames");
    eq(frames.status, 403, "frames status");
  });

  await check("anonymous requests cannot reach admin APIs (401)", async () => {
    const saved = cloneJar();
    useJar(freshJar());
    const res = await req("/api/admin/overview");
    eq(res.status, 401, "status");
    useJar(saved);
  });

  /* ---------------- CSRF ---------------- */
  section("CSRF & request hardening");

  await check("cross-site Origin is rejected on mutations", async () => {
    const res = await req("/api/auth/login", {
      method: "POST",
      body: userA,
      origin: "https://evil.example",
    });
    eq(res.status, 403, "status");
  });

  await check("Sec-Fetch-Site: cross-site is rejected", async () => {
    const res = await req("/api/creations", {
      method: "POST",
      body: { frameSlug: "lotus-heart", imageDataUrl: PNG_DATA_URL },
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    eq(res.status, 403, "status");
  });

  /* ---------------- public sharing ---------------- */
  section("Public sharing & revocation");

  await check("owner can publish and receives a share slug", async () => {
    useJar(freshJar());
    await req("/api/auth/login", { method: "POST", body: userA });
    const res = await req(`/api/creations/${creationA}`, {
      method: "PATCH",
      body: { visibility: "public", shareShowCaption: true },
    });
    eq(res.status, 200, "status");
    eq(res.json.creation.visibility, "public", "visibility");
    shareSlugA = res.json.creation.shareSlug;
    assert(shareSlugA && shareSlugA.length >= 16, "slug too short to be unguessable");
  });

  await check("public image is served without auth and is publicly cacheable", async () => {
    const res = await req(`/api/public/creations/${shareSlugA}/image`, { raw: true });
    eq(res.status, 200, "status");
    const cc = res.headers.get("cache-control") ?? "";
    assert(/public/.test(cc), "cache not public");
    assert(/max-age=\d+/.test(cc), "no max-age");
    // Never `immutable`: revocation has to propagate through caches.
    assert(!/immutable/.test(cc), "public images must not be immutable (revocation)");
  });

  await check("public page exposes OG metadata but no account data", async () => {
    const res = await req(`/s/${shareSlugA}`, { raw: true });
    eq(res.status, 200, "status");
    assert(/og:image/.test(res.text), "no og:image");
    assert(!res.text.includes(userA.email), "LEAK: email rendered on public page");
    assert(res.text.includes("morning light"), "caption should render when enabled");
  });

  await check("unknown share slug 404s", async () => {
    const res = await req("/api/public/creations/nope-nope-nope/image", { raw: true });
    eq(res.status, 404, "status");
  });

  await check("revoking the link makes it inaccessible immediately", async () => {
    const revoke = await req(`/api/creations/${creationA}`, {
      method: "PATCH",
      body: { visibility: "private" },
    });
    eq(revoke.status, 200, "revoke status");
    eq(revoke.json.creation.shareSlug, null, "slug must be cleared");
    const image = await req(`/api/public/creations/${shareSlugA}/image`, { raw: true });
    eq(image.status, 404, "image after revoke");
    const page = await req(`/s/${shareSlugA}`, { raw: true });
    eq(page.status, 404, "page after revoke");
  });

  await check("free plan caps public share links at 3 (402 LIMIT_REACHED)", async () => {
    const ids = [];
    for (let i = 0; i < 4; i += 1) {
      const saved = await req("/api/creations", {
        method: "POST",
        body: {
          frameSlug: "lotus-heart",
          caption: `share ${i}`,
          imageDataUrl: PNG_DATA_URL,
          thumbDataUrl: PNG_DATA_URL,
        },
      });
      eq(saved.status, 201, `create ${i}`);
      ids.push(saved.json.creation.id);
    }
    const statuses = [];
    for (const id of ids) {
      const res = await req(`/api/creations/${id}`, {
        method: "PATCH",
        body: { visibility: "public" },
      });
      statuses.push(res.status);
    }
    assert(
      statuses[0] === 200 && statuses[1] === 200 && statuses[2] === 200,
      `first three publishes should succeed, got ${statuses.join(",")}`
    );
    eq(statuses[3], 402, `fourth publish should be capped, got ${statuses.join(",")}`);
  });

  /* ---------------- profile & sessions ---------------- */
  section("Profile, sessions & account lifecycle");

  await check("profile can be read and updated", async () => {
    const before = await req("/api/profile");
    eq(before.status, 200, "status");
    const patch = await req("/api/profile", {
      method: "PATCH",
      body: { name: "Alice Flow", bio: "Morning practitioner", studio: "Lotus Lane" },
    });
    eq(patch.status, 200, "patch status");
    const after = await req("/api/profile");
    eq(after.json.profile.bio, "Morning practitioner", "bio");
  });

  await check("avatar upload and private fetch work", async () => {
    const up = await req("/api/profile/avatar", {
      method: "POST",
      body: { imageDataUrl: PNG_DATA_URL },
    });
    eq(up.status, 200, "status");
    const img = await req("/api/profile/avatar", { raw: true });
    eq(img.status, 200, "image status");
    assert(/private/.test(img.headers.get("cache-control") ?? ""), "avatar cache must be private");
  });

  await check("session list shows devices without token hashes", async () => {
    const res = await req("/api/profile/sessions");
    eq(res.status, 200, "status");
    assert(Array.isArray(res.json.sessions), "no sessions array");
    assert(res.json.sessions.some((s) => s.current), "current session not flagged");
    assert(!JSON.stringify(res.json).includes("token_hash"), "token hash leaked");
  });

  await check("password change revokes other sessions", async () => {
    // second session for the same user
    const other = cloneJar();
    useJar(freshJar());
    await req("/api/auth/login", { method: "POST", body: userA });
    const otherJar = cloneJar();

    useJar(other);
    const change = await req("/api/profile/password", {
      method: "POST",
      body: { currentPassword: userA.password, newPassword: "NewSunrise456" },
    });
    eq(change.status, 200, "change status");
    userA.password = "NewSunrise456";

    useJar(otherJar);
    const stale = await req("/api/auth/me");
    eq(stale.json.user, null, "other session should be revoked");
  });

  await check("password reset by emailed token revokes all sessions", async () => {
    const forgot = await req("/api/auth/forgot-password", {
      method: "POST",
      body: { email: userA.email },
      origin: null,
    });
    eq(forgot.status, 200, "forgot status");
    const token = tokenFromMail(userA.email, "reset-password");
    assert(token, "no reset token in mail log");

    const reset = await req("/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "ResetFlow789" },
    });
    eq(reset.status, 200, "reset status");
    userA.password = "ResetFlow789";

    const me = await req("/api/auth/me");
    eq(me.json.user, null, "sessions should be revoked after reset");

    const replay = await req("/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "Another123" },
    });
    eq(replay.status, 400, "used reset token must be rejected");
  });

  await check("forgot-password never reveals whether an account exists", async () => {
    const known = await req("/api/auth/forgot-password", {
      method: "POST",
      body: { email: userA.email },
      origin: null,
    });
    const unknown = await req("/api/auth/forgot-password", {
      method: "POST",
      body: { email: `nobody.${unique()}@example.com` },
      origin: null,
    });
    eq(known.status, unknown.status, "status differs");
    eq(known.json.message, unknown.json.message, "message differs");
  });

  /* ---------------- admin ---------------- */
  section("Admin authorization & operations");

  await check("promoting a user is only possible out-of-band (then works)", async () => {
    const db = new DatabaseSync(DB_FILE);
    db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(userA.email);
    const row = db.prepare("SELECT id, role FROM users WHERE email = ?").get(userA.email);
    db.close();
    eq(row.role, "admin", "role");
    adminId = row.id;

    useJar(freshJar());
    const login = await req("/api/auth/login", { method: "POST", body: userA });
    eq(login.status, 200, "login status");
    const overview = await req("/api/admin/overview");
    eq(overview.status, 200, "overview status");
    assert(overview.json.stats.users >= 2, "stats missing users");
    assert(overview.json.email.provider, "email provider status missing");
  });

  await check("admin can search and page users", async () => {
    const res = await req(`/api/admin/users?q=${encodeURIComponent("Bob")}&page=1&limit=10`);
    eq(res.status, 200, "status");
    assert(res.json.users.some((u) => u.email === userB.email), "search missed user B");
    assert(typeof res.json.total === "number", "no total");
  });

  await check("admin frame metadata updates are persisted", async () => {
    const list = await req("/api/admin/frames");
    eq(list.status, 200, "list status");
    const res = await req("/api/admin/frames/lotus-heart", {
      method: "PATCH",
      body: { tags: ["heart", "bloom"], featured: true },
    });
    eq(res.status, 200, "patch status");
    eq(res.json.frame.featured, true, "featured");
    const after = await req("/api/admin/frames");
    const updated = after.json.frames.find((f) => f.slug === "lotus-heart");
    assert(updated.tags.includes("bloom"), "tags not saved");
    // restore
    await req("/api/admin/frames/lotus-heart", { method: "PATCH", body: { tags: [] } });
  });

  await check("admin content settings update", async () => {
    const res = await req("/api/admin/content", {
      method: "PATCH",
      body: { hero_tagline: "Breathe in, frame out" },
    });
    eq(res.status, 200, "status");
    eq(res.json.settings.hero_tagline, "Breathe in, frame out", "tagline");
  });

  await check("admin activity log is paged and filtered", async () => {
    const res = await req("/api/admin/activity?filter=admin&page=1&limit=10");
    eq(res.status, 200, "status");
    assert(res.json.events.some((e) => e.type === "admin_action"), "admin actions not logged");
  });

  await check("admin cannot suspend or demote their own account", async () => {
    const res = await req(`/api/admin/users/${adminId}`, {
      method: "PATCH",
      body: { status: "suspended" },
    });
    eq(res.status, 403, "status");
  });

  await check("suspending a user kills their sessions and blocks login", async () => {
    assert(userBJar, "user B session jar missing");
    const suspend = await req(`/api/admin/users/${userBId}`, {
      method: "PATCH",
      body: { status: "suspended" },
    });
    eq(suspend.status, 200, "suspend status");
    eq(suspend.json.user.status, "suspended", "status field");

    const adminJar = cloneJar();

    // B's existing cookie must stop working immediately.
    useJar(userBJar);
    const staleSession = await req("/api/auth/me");
    eq(staleSession.json.user, null, "suspended user's session still valid");

    useJar(freshJar());
    const blocked = await req("/api/auth/login", { method: "POST", body: userB });
    eq(blocked.status, 403, "suspended login status");

    useJar(adminJar);
    const reinstate = await req(`/api/admin/users/${userBId}`, {
      method: "PATCH",
      body: { status: "active" },
    });
    eq(reinstate.status, 200, "reinstate status");
  });

  await check("admin deletion of a creation is audited", async () => {
    const created = await req("/api/creations", {
      method: "POST",
      body: { frameSlug: "still-lake-meditation", imageDataUrl: PNG_DATA_URL },
    });
    const id = created.json.creation.id;
    const del = await req(`/api/creations/${id}`, { method: "DELETE" });
    eq(del.status, 200, "status");
    const log = await req("/api/admin/activity?filter=creation&page=1&limit=50");
    assert(
      log.json.events.some((e) => e.type === "creation_deleted"),
      "deletion not in activity log"
    );
  });

  /* ---------------- analytics ---------------- */
  section("Analytics");

  await check("known events are accepted, unknown dropped", async () => {
    const good = await req("/api/analytics", {
      method: "POST",
      body: { event: "frame_search", props: { results: 3, term_length: 5 } },
    });
    eq(good.status, 200, "status");
    eq(good.json.accepted, true, "accepted");
    const bad = await req("/api/analytics", {
      method: "POST",
      body: { event: "arbitrary_event", props: { secret: userA.email } },
    });
    eq(bad.json.accepted, false, "unknown event must be dropped");
  });

  /* ---------------- account deletion ---------------- */
  section("Account deletion");

  await check("deletion requires the password and typed confirmation", async () => {
    const noConfirm = await req("/api/profile", {
      method: "DELETE",
      body: { password: userA.password, confirm: "yes" },
    });
    eq(noConfirm.status, 400, "status without DELETE");
    const wrongPass = await req("/api/profile", {
      method: "DELETE",
      body: { password: "TotallyWrong123", confirm: "DELETE" },
    });
    eq(wrongPass.status, 403, "status with wrong password");
  });

  await check("account deletion removes user, creations, files and sessions", async () => {
    const dbBefore = new DatabaseSync(DB_FILE);
    const files = dbBefore
      .prepare(
        "SELECT storage_path, thumb_path FROM creations WHERE user_id = (SELECT id FROM users WHERE email = ?)"
      )
      .all(userA.email);
    dbBefore.close();
    assert(files.length > 0, "expected creations before deletion");

    const res = await req("/api/profile", {
      method: "DELETE",
      body: { password: userA.password, confirm: "DELETE" },
    });
    eq(res.status, 200, "status");

    const me = await req("/api/auth/me");
    eq(me.json.user, null, "session should be gone");

    const db = new DatabaseSync(DB_FILE);
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(userA.email);
    const creations = db
      .prepare("SELECT COUNT(*) AS n FROM creations WHERE user_id = ?")
      .get(adminId);
    const sessions = db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(adminId);
    db.close();
    eq(user, undefined, "user row should be deleted");
    eq(creations.n, 0, "creations should cascade");
    eq(sessions.n, 0, "sessions should be removed");

    assert(countFiles(path.join(DATA_DIR, "uploads", adminId)) === 0, "orphaned image files");
  });

  /* ---------------- rate limiting (last: it burns the window) ---------------- */
  section("Rate limiting");

  await check("sensitive endpoints rate limit with 429 + retryAfter", async () => {
    let sawLimit = false;
    for (let i = 0; i < 9; i += 1) {
      const res = await req("/api/auth/forgot-password", {
        method: "POST",
        body: { email: `nobody${i}.${unique()}@example.com` },
        origin: null,
      });
      if (res.status === 429) {
        sawLimit = true;
        assert(res.json.retryAfter >= 0, "retryAfter missing");
        break;
      }
    }
    assert(sawLimit, "no 429 after repeated forgot-password attempts");
  });

  await check("error responses never leak internals", async () => {
    const res = await req("/api/creations", {
      method: "POST",
      body: { frameSlug: "sunrise-salutation", imageDataUrl: "garbage" },
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    const payload = JSON.stringify(res.json);
    for (const leak of ["/home/", "C:\\", "node:sqlite", "SELECT ", "stack", "scrypt$"]) {
      assert(!payload.includes(leak), `leaked internals: ${leak}`);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

(async () => {
  if (USE_SERVER) {
    console.log(`Starting production server on ${BASE} with a throwaway database…`);
    startServer();
    const up = await waitForServer();
    if (!up) {
      await stopServer();
      console.error("✗ Server did not start. Run `npm run build` first.");
      process.exit(1);
    }
  } else {
    console.log(`Testing against existing server at ${BASE}`);
  }

  try {
    await run();
  } catch (err) {
    console.error(`\n✗ Suite aborted: ${err.message}`);
    results.push({ group: "suite", name: "completed without throwing", ok: false, detail: err.message });
  } finally {
    await stopServer();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? ` — ${failed.length} failed:` : " 🎉")
  );
  for (const f of failed) console.log(`  ✗ [${f.group}] ${f.name} — ${f.detail}`);

  process.exit(failed.length ? 1 : 0);
})();

/**
 * Session management: opaque bearer tokens in an HttpOnly, SameSite=Lax cookie
 * (Secure automatically over HTTPS). Only the SHA-256 hash of the token is
 * stored, so a database leak cannot be replayed as a login.
 *
 * Sessions are revocable individually and in bulk (password change, "sign out
 * everywhere", admin suspension, account deletion).
 */

import { cookies } from "next/headers";
import { getDb, nowIso } from "./db";
import { generateToken, sha256 } from "./passwords";
import { clientIp } from "./ratelimit";

export const SESSION_COOKIE = "zenframe_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface DbUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  email_verified_at: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  user_agent: string | null;
  token_hash: string;
}

/* ------------------------------------------------------------------ */
/* Privacy-safe device fingerprint                                     */
/* ------------------------------------------------------------------ */

/**
 * Session IPs are stored only as a salted hash. The salt is generated once and
 * kept in `settings`, so hashes are stable within a deployment but the raw
 * address never touches the database.
 */
async function sessionSalt(): Promise<string> {
  const db = await getDb();
  const row = (await db
    .prepare("SELECT value FROM settings WHERE key = 'session_ip_salt'")
    .get()) as { value: string } | undefined;
  if (row) return row.value;
  const salt = generateToken(24);
  // Portable upsert: works on SQLite (3.24+) and PostgreSQL alike.
  await db
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('session_ip_salt', ?, ?) ON CONFLICT(key) DO NOTHING"
    )
    .run(salt, nowIso());
  return salt;
}

export async function ipHash(req: Request): Promise<string> {
  const ip = clientIp(req);
  const salt = await sessionSalt();
  return sha256(`${salt}:${ip}`);
}

/* ------------------------------------------------------------------ */
/* Create / destroy                                                    */
/* ------------------------------------------------------------------ */

export async function createSession(userId: string, req?: Request): Promise<string> {
  const db = await getDb();
  const token = generateToken(32);
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent, ip_hash, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      generateToken(12),
      userId,
      sha256(token),
      new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      now,
      req ? (req.headers.get("user-agent") ?? "").slice(0, 200) || null : null,
      req ? await ipHash(req) : null,
      now
    );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const db = await getDb();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const db = await getDb();
  const res = await db
    .prepare("DELETE FROM sessions WHERE user_id = ?")
    .run(userId);
  return res.changes;
}

/** Revokes every session except the one making the request. */
export async function revokeOtherSessions(userId: string): Promise<number> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const res = token
    ? await db
        .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
        .run(userId, sha256(token))
    : await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return res.changes;
}

export async function revokeSessionById(
  userId: string,
  sessionId: string
): Promise<boolean> {
  // user_id in the WHERE clause makes cross-user revocation impossible (IDOR).
  const db = await getDb();
  const res = await db
    .prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?")
    .run(sessionId, userId);
  return res.changes > 0;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

const USER_SELECT = `SELECT u.id, u.email, u.name, u.role,
                            COALESCE(u.status, 'active') AS status,
                            u.email_verified_at, u.created_at
                     FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = ? AND s.expires_at > ?`;

export async function getUserBySessionToken(token: string): Promise<DbUser | null> {
  const db = await getDb();
  const row = (await db.prepare(USER_SELECT).get(sha256(token), nowIso())) as
    | DbUser
    | undefined;
  if (!row) return null;
  if (row.status === "suspended") return null; // suspension kills access at once
  return row;
}

let lastTouch = 0;

/** Request-scoped current user (reads the cookie jar). */
export async function getCurrentUser(): Promise<DbUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const user = await getUserBySessionToken(token);
  if (!user) return null;

  // Cheap activity tracking, throttled so it isn't a write per request.
  const now = Date.now();
  if (now - lastTouch > 5 * 60 * 1000) {
    lastTouch = now;
    try {
      const db = await getDb();
      await db
        .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
        .run(nowIso(), sha256(token));
    } catch {
      /* non-critical */
    }
  }
  return user;
}

export interface ActiveSession {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  user_agent: string | null;
  current: boolean;
}

/** Session list for the settings panel — never exposes token hashes. */
export async function listSessions(userId: string): Promise<ActiveSession[]> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const currentHash = token ? sha256(token) : "";
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT id, created_at, expires_at, last_seen_at, user_agent, token_hash
       FROM sessions WHERE user_id = ? AND expires_at > ?
       ORDER BY COALESCE(last_seen_at, created_at) DESC`
    )
    .all(userId, nowIso())) as SessionRow[];
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    expires_at: r.expires_at,
    last_seen_at: r.last_seen_at,
    user_agent: r.user_agent,
    current: r.token_hash === currentHash,
  }));
}

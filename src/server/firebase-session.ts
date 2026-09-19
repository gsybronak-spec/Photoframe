/**
 * Firebase ↔ ZenFrame session bridge.
 *
 * Flow: the browser signs in with the Firebase client SDK, POSTs the fresh
 * Firebase ID token to /api/auth/firebase-session, and the server:
 *
 *   1. verifies the token with the Admin SDK (revocation-aware) — identity is
 *      NEVER taken from a client-supplied UID;
 *   2. provisions/refreshes the application user record keyed by firebase_uid;
 *   3. issues the existing opaque app-session cookie (HttpOnly, Secure in
 *      production) so all current requireUser/requireAdmin authorization
 *      keeps working unchanged.
 *
 * Passwords never touch ZenFrame's database in this mode. The old
 * password_hash column is simply left empty for Firebase users.
 */

import { cookies } from "next/headers";
import { getDb, nowIso } from "./db";
import { generateToken, sha256 } from "./passwords";
import { logEvent } from "./activity";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./sessions";
import { verifyFirebaseIdToken, type VerifiedIdentity } from "./firebase-admin";

export const FIREBASE_TOKEN_COOKIE = "zenframe_fb_token";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  email_verified_at: string | null;
  firebase_uid: string | null;
}

const USER_COLS =
  "id, email, name, role, status, email_verified_at, firebase_uid";

/**
 * Find or create the application user for a verified Firebase identity.
 * Email is a unique column, so a pre-existing password-mode account with the
 * same email is linked (its firebase_uid is claimed) rather than duplicated.
 */
export async function upsertFirebaseUser(
  identity: VerifiedIdentity,
  displayName?: string
): Promise<UserRow> {
  const db = await getDb();
  const now = nowIso();

  const byUid = (await db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE firebase_uid = ?`)
    .get(identity.uid)) as UserRow | undefined;
  if (byUid) {
    // Keep the chosen display name fresh for returning users.
    const cleanName = (displayName ?? "").trim().slice(0, 60);
    if (cleanName && cleanName !== byUid.name) {
      await db
        .prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
        .run(cleanName, now, byUid.id);
      return { ...byUid, name: cleanName };
    }
    return byUid;
  }

  const email = (identity.email ?? "").toLowerCase();
  const byEmail = email
    ? ((await db
        .prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`)
        .get(email)) as UserRow | undefined)
    : undefined;

  if (byEmail) {
    await db
      .prepare("UPDATE users SET firebase_uid = ?, updated_at = ? WHERE id = ?")
      .run(identity.uid, now, byEmail.id);
    return { ...byEmail, firebase_uid: identity.uid };
  }

  const id = generateToken(12);
  const name =
    (displayName ?? "").trim().slice(0, 60) ||
    (email ? email.split("@")[0].slice(0, 60) : `yogi-${id}`);

  // User + profile are created together — one atomic unit on both engines.
  await db.tx(async (tx) => {
    await tx
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, role, status, firebase_uid, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, '', 'user', 'active', ?, ?, ?, ?)`
      )
      .run(
        id,
        email,
        name,
        identity.uid,
        identity.emailVerified ? now : null,
        now,
        now
      );
    await tx
      .prepare("INSERT INTO profiles (user_id, bio, updated_at) VALUES (?, '', ?)")
      .run(id, now);
  });

  return (await db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`)
    .get(id)) as UserRow;
}

/** Issues the standard app-session cookie for a verified Firebase identity. */
export async function createSessionForFirebaseUser(
  userId: string,
  req: Request
): Promise<void> {
  const db = await getDb();
  const token = generateToken(32);
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent, ip_hash, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(
      generateToken(12),
      userId,
      sha256(token),
      new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      now,
      (req.headers.get("user-agent") ?? "").slice(0, 200) || null,
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
}

/**
 * POST /api/auth/firebase-session body: { idToken }
 * Verifies the Firebase ID token and establishes the app session.
 */
export async function establishFirebaseSession(
  idToken: string,
  req: Request,
  displayName?: string
): Promise<{ ok: true; user: UserRow } | { ok: false; reason: string }> {
  const identity = await verifyFirebaseIdToken(idToken);
  if (!identity) return { ok: false, reason: "invalid_token" };

  const user = await upsertFirebaseUser(identity, displayName);
  if (user.status === "suspended") return { ok: false, reason: "suspended" };

  // Keep email_verified_at in step with Firebase's verification state.
  if (identity.emailVerified && !user.email_verified_at) {
    const db = await getDb();
    await db
      .prepare("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?")
      .run(nowIso(), nowIso(), user.id);
    await logEvent(user.id, "account_verified", "Email verified via Firebase");
  }

  await createSessionForFirebaseUser(user.id, req);
  await logEvent(user.id, "signin", "Signed in with Firebase");
  return { ok: true, user };
}

/** Revokes the app session and clears both cookies (session + Firebase token). */
export async function destroyFirebaseSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(FIREBASE_TOKEN_COOKIE);
}

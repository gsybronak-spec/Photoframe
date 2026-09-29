/**
 * Activity events — the append-only audit/feed table.
 *
 * Used for two distinct things:
 *  - the user-facing "Recent activity" rail on the dashboard
 *  - the admin activity log, which also records admin actions and auth events
 *
 * `meta` stays small (truncated) because it is rendered, not queried.
 */

import { getDb, nowIso } from "./db";
import { generateToken } from "./passwords";

export type ActivityType =
  | "account_created"
  | "account_verified"
  | "signin"
  | "signout"
  | "signin_blocked"
  | "password_changed"
  | "password_reset"
  | "creation_saved"
  | "creation_deleted"
  | "creation_shared"
  | "creation_unshared"
  | "frame_favorited"
  | "campaign_created"
  | "campaign_updated"
  | "campaign_deleted"
  | "frame_unfavorited"
  | "profile_updated"
  | "account_deleted"
  | "admin_action"
  | "system";

export interface ActivityRow {
  id: string;
  user_id: string | null;
  type: string;
  message: string;
  meta: string;
  created_at: string;
  actor_id?: string | null;
}

export async function logEvent(
  userId: string | null,
  type: ActivityType,
  message: string,
  meta: Record<string, unknown> = {},
  actorId: string | null = null
): Promise<void> {
  try {
    const db = await getDb();
    await db
      .prepare(
        `INSERT INTO activity (id, user_id, type, message, meta, created_at, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        generateToken(12),
        userId,
        type,
        message.slice(0, 200),
        JSON.stringify(meta).slice(0, 500),
        nowIso(),
        actorId
      );
  } catch (err) {
    // Never let audit logging break a user-facing request.
    console.error(
      "[activity] failed to record event:",
      err instanceof Error ? err.message : err
    );
  }
}

export async function recentActivity(userId: string, limit = 8): Promise<
  {
    id: string;
    type: string;
    message: string;
    created_at: string;
  }[]
> {
  const db = await getDb();
  return (await db
    .prepare(
      `SELECT id, type, message, created_at FROM activity
       WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, limit)) as {
    id: string;
    type: string;
    message: string;
    created_at: string;
  }[];
}

/** Platform-wide feed for the admin panel (actor + subject, newest first). */
export async function systemActivity(limit = 25, offset = 0): Promise<ActivityRow[]> {
  const db = await getDb();
  return (await db
    .prepare(
      `SELECT a.id, a.user_id, a.actor_id, a.type, a.message, a.meta, a.created_at
       FROM activity a
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset)) as ActivityRow[];
}

export async function activityCount(): Promise<number> {
  const db = await getDb();
  return ((await db.prepare("SELECT COUNT(*) AS n FROM activity").get()) as { n: number })
    .n;
}

export async function authActivityCount(): Promise<number> {
  const db = await getDb();
  return (
    (await db
      .prepare(
        `SELECT COUNT(*) AS n FROM activity
         WHERE type IN ('signin','signout','signin_blocked','password_changed','password_reset','account_created')`
      )
      .get()) as { n: number }
  ).n;
}

import { getDb, nowIso } from "@/server/db";
import { verifyPassword } from "@/server/passwords";
import { revokeAllSessions } from "@/server/sessions";
import { getEntitlements } from "@/server/entitlements";
import { deleteCreationObjects } from "@/server/storage";
import { logEvent } from "@/server/activity";
import { cleanMultiline, cleanText } from "@/server/validation";
import {
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  requireUser,
  serverError,
} from "@/server/api";

/** GET /api/profile — profile, plan and account summary for settings. */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const profile = getDb()
      .prepare("SELECT bio, avatar_url, studio FROM profiles WHERE user_id = ?")
      .get(user.id) as
      | { bio: string; avatar_url: string | null; studio: string | null }
      | undefined;
    const entitlements = getEntitlements(user.id);
    return ok({
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: Boolean(user.email_verified_at),
        createdAt: user.created_at,
        bio: profile?.bio ?? "",
        studio: profile?.studio ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      plan: {
        id: entitlements.planId,
        name: entitlements.plan.name,
        status: entitlements.status,
        limits: entitlements.plan.limits,
        usage: entitlements.usage,
      },
    });
  } catch (err) {
    return serverError("profile:get", err);
  }
}

/** PATCH /api/profile — display name and bio. Email changes need a re-verify flow. */
export async function PATCH(req: Request) {
  const limited = await guardRate(req, "profile-update", 20, 10 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireUser();
  if (error) return error;

  const body = await readJson<{ name?: string; bio?: string; studio?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  try {
    const name = cleanText(body.name, 60);
    if (body.name !== undefined && name.length < 2) {
      return fail("Please use at least 2 characters for your name.");
    }
    const bio = cleanMultiline(body.bio, 280);
    const studio = cleanText(body.studio, 80);
    const now = nowIso();
    const db = getDb();

    if (body.name !== undefined) {
      db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(
        name,
        now,
        user.id
      );
    }
    db.prepare(
      `INSERT INTO profiles (user_id, bio, studio, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET bio = excluded.bio,
         studio = excluded.studio, updated_at = excluded.updated_at`
    ).run(user.id, bio, studio || null, now);

    logEvent(user.id, "profile_updated", "Updated profile details");
    return ok({ profile: { name: body.name !== undefined ? name : user.name, bio, studio } });
  } catch (err) {
    return serverError("profile:patch", err);
  }
}

/**
 * DELETE /api/profile — delete the account.
 *
 * Requires the current password *and* an explicit typed confirmation, is rate
 * limited, and removes: session rows, creations (+ their stored images and
 * thumbnails), saved frames, tokens, analytics links and the user row. Nothing
 * is left orphaned in storage.
 */
export async function DELETE(req: Request) {
  const limited = await guardRate(req, "account-delete", 5, 15 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireUser();
  if (error) return error;

  const body = await readJson<{ password?: string; confirm?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");
  if (body.confirm !== "DELETE") {
    return fail('Type DELETE exactly to confirm account removal.', "BAD_REQUEST");
  }
  if (!body.password) return fail("Enter your password to confirm.", "BAD_REQUEST");

  try {
    const db = getDb();
    const row = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(user.id) as { password_hash: string } | undefined;
    if (!row) return fail("Account not found.", "NOT_FOUND");
    if (!(await verifyPassword(body.password, row.password_hash))) {
      return fail("That password is incorrect.", "FORBIDDEN");
    }

    const files = db
      .prepare(
        "SELECT storage_path, thumb_path FROM creations WHERE user_id = ?"
      )
      .all(user.id) as { storage_path: string; thumb_path: string | null }[];

    // Audit before the row disappears (activity.user_id cascades on delete).
    logEvent(
      null,
      "account_deleted",
      "Account deleted by the account owner",
      { userId: user.id, creations: files.length },
      user.id
    );

    db.prepare("DELETE FROM users WHERE id = ?").run(user.id); // cascades
    await revokeAllSessions(user.id);
    await deleteCreationObjects(
      files.flatMap((f) => [f.storage_path, f.thumb_path])
    );

    return ok({ deleted: true, filesRemoved: files.length });
  } catch (err) {
    return serverError("profile:delete", err);
  }
}

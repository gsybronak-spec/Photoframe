import { getDb, nowIso } from "@/server/db";
import { hashPassword, passwordProblems, verifyPassword } from "@/server/passwords";
import { revokeOtherSessions, listSessions } from "@/server/sessions";
import { sendTemplatedEmail } from "@/server/mailer";
import { logEvent } from "@/server/activity";
import {
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  requireUser,
  serverError,
} from "@/server/api";

/**
 * POST /api/profile/password — change password.
 * Requires the current password, keeps the requesting session signed in, signs
 * every other device out, and emails a security notice.
 */
export async function POST(req: Request) {
  const limited = await guardRate(req, "password-change", 10, 15 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireUser();
  if (error) return error;

  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  const current = body.currentPassword ?? "";
  const next = body.newPassword ?? "";
  if (!current || !next) return fail("Enter your current and new password.");

  const problems = passwordProblems(next);
  if (problems.length) return fail(`New password needs ${problems.join(", ")}.`);
  if (current === next) return fail("Choose a password you haven't used here before.");

  try {
    const db = getDb();
    const row = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(user.id) as { password_hash: string } | undefined;
    if (!row) return fail("Account not found.", "NOT_FOUND");
    if (!(await verifyPassword(current, row.password_hash))) {
      return fail("Your current password is incorrect.", "FORBIDDEN");
    }

    const now = nowIso();
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      await hashPassword(next),
      now,
      user.id
    );

    const revoked = await revokeOtherSessions(user.id);
    logEvent(
      user.id,
      "password_changed",
      revoked ? `Password changed — ${revoked} other session(s) signed out` : "Password changed"
    );

    await sendTemplatedEmail({
      template: "password_changed",
      to: user.email,
      userId: user.id,
      data: {
        name: user.name,
        when: new Date().toUTCString(),
        url: new URL("/forgot-password", req.url).toString(),
      },
    });

    const sessions = await listSessions(user.id);
    return ok({
      message: "Password updated. Other devices have been signed out.",
      revokedSessions: revoked,
      sessions: sessions.length,
    });
  } catch (err) {
    return serverError("profile:password", err);
  }
}

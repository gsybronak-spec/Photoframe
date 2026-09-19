import { getDb, nowIso } from "@/server/db";
import { hashPassword, sha256, passwordProblems } from "@/server/passwords";
import { revokeAllSessions } from "@/server/sessions";
import { sendTemplatedEmail } from "@/server/mailer";
import { logEvent } from "@/server/activity";
import { ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";

export async function POST(req: Request) {
  const limited = await guardRate(req, "reset", 10, 15 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const body = await readJson<{ token?: string; password?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  const token = body.token ?? "";
  const password = body.password ?? "";
  if (!token) return fail("This reset link is incomplete.");
  const problems = passwordProblems(password);
  if (problems.length) return fail(`Password needs ${problems.join(", ")}.`);

  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, user_id, expires_at, used_at FROM verification_tokens
         WHERE token_hash = ? AND kind = 'password_reset'`
      )
      .get(sha256(token)) as
      | { id: string; user_id: string; expires_at: string; used_at: string | null }
      | undefined;

    if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) {
      return fail(
        "This reset link is invalid or has expired. Request a new one.",
        "BAD_REQUEST"
      );
    }

    const now = nowIso();
    db.prepare("UPDATE verification_tokens SET used_at = ? WHERE id = ?").run(
      now,
      row.id
    );
    db.prepare(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?"
    ).run(await hashPassword(password), now, row.user_id);

    // A password change invalidates every session: an attacker holding a stolen
    // cookie loses access immediately.
    await revokeAllSessions(row.user_id);

    const user = db
      .prepare("SELECT email, name FROM users WHERE id = ?")
      .get(row.user_id) as { email: string; name: string } | undefined;

    logEvent(row.user_id, "password_reset", "Password reset via emailed link");

    if (user) {
      await sendTemplatedEmail({
        template: "password_changed",
        to: user.email,
        userId: row.user_id,
        data: {
          name: user.name,
          when: new Date().toUTCString(),
          url: new URL("/forgot-password", req.url).toString(),
        },
      });
    }

    return ok({ message: "Password updated. Sign in with your new password." });
  } catch (err) {
    return serverError("reset-password", err);
  }
}

import { getDb, nowIso } from "@/server/db";
import { generateToken, sha256 } from "@/server/passwords";
import { isEmail } from "@/server/validation";
import { sendTemplatedEmail } from "@/server/mailer";
import { ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";

const RESET_TTL_MINUTES = 60;

export async function POST(req: Request) {
  const limited = await guardRate(req, "forgot", 5, 15 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const body = await readJson<{ email?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  const email = (body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) return fail("Enter a valid email address.");

  const generic = {
    message: "If an account exists for that email, a reset link is on its way.",
  };

  try {
    const db = await getDb();
    const user = (await db
      .prepare("SELECT id, name FROM users WHERE email = ?")
      .get(email)) as { id: string; name: string } | undefined;

    // Always the same response shape and status, whether or not the account
    // exists — this endpoint must never be usable for account enumeration.
    if (!user) return ok(generic);

    // Invalidate previous outstanding reset links, then issue one.
    await db
      .prepare(
        `UPDATE verification_tokens SET used_at = ?
       WHERE user_id = ? AND kind = 'password_reset' AND used_at IS NULL`
      )
      .run(nowIso(), user.id);

    const token = generateToken(32);
    await db
      .prepare(
        `INSERT INTO verification_tokens (id, user_id, kind, token_hash, expires_at, created_at)
       VALUES (?, ?, 'password_reset', ?, ?, ?)`
      )
      .run(
        generateToken(12),
        user.id,
        sha256(token),
        new Date(Date.now() + RESET_TTL_MINUTES * 60e3).toISOString(),
        nowIso()
      );

    await sendTemplatedEmail({
      template: "password_reset",
      to: email,
      userId: user.id,
      data: {
        name: user.name,
        url: new URL(`/reset-password?token=${token}`, req.url).toString(),
        minutes: String(RESET_TTL_MINUTES),
      },
    });

    return ok(generic);
  } catch (err) {
    return serverError("forgot-password", err);
  }
}

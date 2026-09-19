import { getDb, nowIso } from "@/server/db";
import {
  hashPassword,
  generateToken,
  sha256,
  passwordProblems,
} from "@/server/passwords";
import { createSession } from "@/server/sessions";
import { isEmail, cleanText } from "@/server/validation";
import { sendTemplatedEmail } from "@/server/mailer";
import { logEvent } from "@/server/activity";
import { track } from "@/server/analytics";
import {
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  serverError,
} from "@/server/api";

/** Verification links are valid for 24 hours. */
export const VERIFY_TTL_HOURS = 24;

export async function POST(req: Request) {
  const limited = await guardRate(req, "signup", 10, 10 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const body = await readJson<{ name?: string; email?: string; password?: string }>(
    req
  );
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  const name = cleanText(body.name, 60);
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (name.length < 2) return fail("Please tell us your name (2+ characters).");
  if (!isEmail(email)) return fail("That email doesn't look right.");
  const problems = passwordProblems(password);
  if (problems.length) return fail(`Password needs ${problems.join(", ")}.`);

  try {
    const db = await getDb();
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return fail("An account with this email already exists.", "CONFLICT");

    const id = generateToken(12);
    const now = nowIso();
    const passwordHash = await hashPassword(password);
    const verifyToken = generateToken(32);

    // Account + profile + verification token land together or not at all.
    await db.tx(async (tx) => {
      await tx
        .prepare(
          `INSERT INTO users (id, email, name, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`
        )
        .run(id, email, name, passwordHash, now, now);
      await tx
        .prepare("INSERT INTO profiles (user_id, bio, updated_at) VALUES (?, '', ?)")
        .run(id, now);
      await tx
        .prepare(
          `INSERT INTO verification_tokens (id, user_id, kind, token_hash, expires_at, created_at)
       VALUES (?, ?, 'verify_email', ?, ?, ?)`
        )
        .run(
          generateToken(12),
          id,
          sha256(verifyToken),
          new Date(Date.now() + VERIFY_TTL_HOURS * 3600e3).toISOString(),
          now
        );
    });

    const origin = new URL(req.url).origin;
    const delivery = await sendTemplatedEmail({
      template: "verify_email",
      to: email,
      userId: id,
      data: {
        name,
        url: `${origin}/verify-email?token=${verifyToken}`,
        hours: String(VERIFY_TTL_HOURS),
      },
    });

    await logEvent(id, "account_created", "Welcome to ZenFrame — account created");
    track("signup", { userId: id, props: { plan: "free" } });
    await createSession(id, req);

    return ok(
      {
        user: { id, email, name, role: "user", emailVerified: false, plan: "free" },
        emailSent: delivery.ok,
        message: delivery.ok
          ? "Account created. Check your inbox to verify your email."
          : "Account created. We couldn't send the verification email — use Resend on your dashboard.",
      },
      { status: 201 }
    );
  } catch (err) {
    return serverError("signup", err);
  }
}

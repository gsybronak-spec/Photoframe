import { getDb, nowIso } from "@/server/db";
import { generateToken, sha256 } from "@/server/passwords";
import { getCurrentUser } from "@/server/sessions";
import { sendTemplatedEmail } from "@/server/mailer";
import { logEvent } from "@/server/activity";
import { ok, fail, assertSameOrigin, guardRate } from "@/server/api";
import { VERIFY_TTL_HOURS } from "../signup/route";

/** Minimum seconds between verification emails for the same account. */
const RESEND_COOLDOWN_SECONDS = 60;

const STATUS = {
  verified: "verified",
  already: "already",
  invalid: "invalid",
  expired: "expired",
  used: "used",
} as const;
type Status = (typeof STATUS)[keyof typeof STATUS];

function respond(req: Request, status: Status, okFlag: boolean) {
  const url = new URL(req.url);
  const wantsJson = url.searchParams.get("format") === "json";
  if (wantsJson) {
    const message: Record<Status, string> = {
      verified: "Email verified.",
      already: "Email was already verified.",
      invalid: "This verification link is invalid.",
      expired: "This verification link has expired.",
      used: "This verification link has already been used.",
    };
    return okFlag
      ? ok({ status, code: status.toUpperCase(), message: message[status] })
      : fail(message[status], "BAD_REQUEST", { status, code: status.toUpperCase() });
  }
  const target = new URL(`/verify-email?status=${status}`, url.origin);
  return Response.redirect(target, 303);
}

/**
 * GET /api/auth/verify-email?token=… — the emailed link.
 *
 * Idempotent by design: clicking the same link again after the address is
 * verified reports success instead of an error. Expired and already-used tokens
 * for an *unverified* account are rejected.
 */
export async function GET(req: Request) {
  const db = await getDb();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token || token.length > 200) return respond(req, STATUS.invalid, false);

  const row = (await db
    .prepare(
      `SELECT id, user_id, expires_at, used_at FROM verification_tokens
       WHERE token_hash = ? AND kind = 'verify_email'`
    )
    .get(sha256(token))) as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row) return respond(req, STATUS.invalid, false);

  const user = (await db
    .prepare("SELECT id, email, name, email_verified_at FROM users WHERE id = ?")
    .get(row.user_id)) as
    | { id: string; email: string; name: string; email_verified_at: string | null }
    | undefined;
  if (!user) return respond(req, STATUS.invalid, false);

  // --- idempotency: a re-clicked link for a verified account is a success ---
  if (row.used_at || user.email_verified_at) {
    return respond(
      req,
      user.email_verified_at ? STATUS.already : STATUS.used,
      Boolean(user.email_verified_at)
    );
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    return respond(req, STATUS.expired, false);
  }

  const now = nowIso();
  // Token consumption + verification + retiring stale links are one atomic unit.
  await db.tx(async (tx) => {
    await tx.prepare("UPDATE verification_tokens SET used_at = ? WHERE id = ?").run(
      now,
      row.id
    );
    await tx
      .prepare("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, user.id);
    await tx
      .prepare(
        `UPDATE verification_tokens SET used_at = ?
       WHERE user_id = ? AND kind = 'verify_email' AND used_at IS NULL`
      )
      .run(now, user.id);
  });

  await logEvent(user.id, "account_verified", "Email verified");
  await sendTemplatedEmail({
    template: "welcome",
    to: user.email,
    userId: user.id,
    data: { name: user.name, url: new URL("/frames", req.url).toString() },
  });

  return respond(req, STATUS.verified, true);
}

/**
 * POST /api/auth/verify-email — resend the verification link.
 * Rate limited per IP *and* throttled per account (cooldown), so it can't be
 * used to spam an inbox.
 */
export async function POST(req: Request) {
  const limited = await guardRate(req, "verify-resend", 5, 10 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const user = await getCurrentUser();
  if (!user) return fail("Sign in required", "UNAUTHORIZED");
  if (user.email_verified_at) return ok({ alreadyVerified: true });

  const db = await getDb();
  const last = (await db
    .prepare(
      `SELECT created_at FROM verification_tokens
       WHERE user_id = ? AND kind = 'verify_email'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(user.id)) as { created_at: string } | undefined;

  if (last) {
    const elapsed = (Date.now() - Date.parse(last.created_at)) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return fail(
        `Please wait ${Math.ceil(
          RESEND_COOLDOWN_SECONDS - elapsed
        )} seconds before requesting another email.`,
        "RATE_LIMITED",
        { retryAfter: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) }
      );
    }
  }

  const token = generateToken(32);
  await db
    .prepare(
      `INSERT INTO verification_tokens (id, user_id, kind, token_hash, expires_at, created_at)
       VALUES (?, ?, 'verify_email', ?, ?, ?)`
    )
    .run(
      generateToken(12),
      user.id,
      sha256(token),
      new Date(Date.now() + VERIFY_TTL_HOURS * 3600e3).toISOString(),
      nowIso()
    );

  const delivery = await sendTemplatedEmail({
    template: "verify_email",
    to: user.email,
    userId: user.id,
    data: {
      name: user.name,
      url: new URL(`/verify-email?token=${token}`, req.url).toString(),
      hours: String(VERIFY_TTL_HOURS),
    },
  });

  return ok({
    message: delivery.ok
      ? "Verification email sent — check your inbox."
      : "We couldn't send the email right now. Please try again in a moment.",
    emailSent: delivery.ok,
  });
}

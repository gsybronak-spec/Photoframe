import { ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";
import { establishFirebaseSession } from "@/server/firebase-session";
import { getEntitlements } from "@/server/entitlements";

/**
 * POST /api/auth/firebase-session  { idToken }
 *
 * The browser calls this right after a successful Firebase client sign-in.
 * The ID token is verified server-side (Admin SDK, revocation-aware); identity
 * is derived exclusively from the verified token.
 */
export async function POST(req: Request) {
  const limited = await guardRate(req, "fb-session", 30, 5 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const body = await readJson<{ idToken?: string; name?: string }>(req);
  const idToken = body?.idToken ?? "";
  if (!idToken || idToken.length > 4000) {
    return fail("Missing Firebase credential.", "UNAUTHORIZED");
  }

  try {
    const result = await establishFirebaseSession(
      idToken,
      req,
      typeof body?.name === "string" ? body.name : undefined
    );
    if (!result.ok) {
      return fail(
        result.reason === "suspended"
          ? "This account is suspended. Contact the studio team if you think this is a mistake."
          : "Authentication failed. Please sign in again.",
        result.reason === "suspended" ? "FORBIDDEN" : "UNAUTHORIZED"
      );
    }

    const entitlements = getEntitlements(result.user.id);
    return ok({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        emailVerified: Boolean(result.user.email_verified_at),
        plan: entitlements.planId,
      },
    });
  } catch (err) {
    return serverError("firebase-session", err);
  }
}

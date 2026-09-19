import { getDb } from "@/server/db";
import {
  destroySession,
  getCurrentUser,
  revokeAllSessions,
} from "@/server/sessions";
import { logEvent } from "@/server/activity";
import { track } from "@/server/analytics";
import { ok, assertSameOrigin, fail, serverError } from "@/server/api";

/**
 * POST /api/auth/logout            → revoke this session
 * POST /api/auth/logout?all=1      → revoke every session for this user
 */
export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");
  try {
    const user = await getCurrentUser();
    const all = new URL(req.url).searchParams.get("all") === "1";

    if (user) {
      logEvent(user.id, "signout", all ? "Signed out of all devices" : "Signed out");
      track("logout", { userId: user.id, props: { all } });
    }

    if (all && user) await revokeAllSessions(user.id);
    await destroySession(getDb());

    return ok({
      message: all ? "Signed out of all devices" : "Signed out",
      revokedAll: Boolean(all && user),
    });
  } catch (err) {
    return serverError("logout", err);
  }
}

import { listSessions, revokeAllSessions } from "@/server/sessions";
import { logEvent } from "@/server/activity";
import {
  ok,
  fail,
  assertSameOrigin,
  requireUser,
  serverError,
} from "@/server/api";

/** GET /api/profile/sessions — this user's active sessions (never token hashes). */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    return ok({ sessions: await listSessions(user.id) });
  } catch (err) {
    return serverError("sessions:list", err);
  }
}

/** DELETE /api/profile/sessions — sign out of every device (including this one). */
export async function DELETE(req: Request) {
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const revoked = await revokeAllSessions(user.id);
    logEvent(user.id, "signout", `Signed out of all devices (${revoked})`);
    return ok({ revoked });
  } catch (err) {
    return serverError("sessions:revoke-all", err);
  }
}

import { revokeSessionById } from "@/server/sessions";
import { cleanId } from "@/server/validation";
import { ok, fail, assertSameOrigin, requireUser, serverError } from "@/server/api";

/**
 * DELETE /api/profile/sessions/:id — revoke one device.
 * The query filters on `user_id = <you>`, so guessing another user's session id
 * can never revoke anything (IDOR-safe by construction).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");
  const { user, error } = await requireUser();
  if (error) return error;

  try {
    const { id } = await params;
    const safeId = cleanId(id);
    if (!safeId) return fail("Session not found.", "NOT_FOUND");

    const revoked = await revokeSessionById(user.id, safeId);
    if (!revoked) return fail("Session not found.", "NOT_FOUND");
    return ok({ revoked: safeId });
  } catch (err) {
    return serverError("sessions:revoke", err);
  }
}

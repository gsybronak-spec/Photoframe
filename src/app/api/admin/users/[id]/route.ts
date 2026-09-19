import { getDb, nowIso } from "@/server/db";
import { requireAdmin, ok, fail, assertSameOrigin, readJson, guardRate, serverError } from "@/server/api";
import { revokeAllSessions } from "@/server/sessions";
import { logEvent } from "@/server/activity";
import { cleanId } from "@/server/validation";

interface TargetRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string | null;
}

/**
 * PATCH /api/admin/users/:id — change role or suspend/reactivate an account.
 * Body: { role?: "user"|"admin", status?: "active"|"suspended" }
 *
 * Every mutation is role-checked server-side (the UI hiding a button is not
 * authorization), rate limited, audited, and cannot be used to lock yourself out
 * or to remove the last admin.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await guardRate(req, "admin-user-patch", 60, 10 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user: admin, error } = await requireAdmin();
  if (error) return error;

  const body = await readJson<{ role?: string; status?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  try {
    const { id } = await params;
    const targetId = cleanId(id);
    if (!targetId) return fail("User not found.", "NOT_FOUND");

    const db = getDb();
    const target = db
      .prepare(
        "SELECT id, email, name, role, COALESCE(status,'active') AS status FROM users WHERE id = ?"
      )
      .get(targetId) as TargetRow | undefined;
    if (!target) return fail("User not found.", "NOT_FOUND");

    const nextRole: "admin" | "user" | undefined =
      body.role === "admin" || body.role === "user" ? body.role : undefined;
    const nextStatus: "active" | "suspended" | undefined =
      body.status === "active" || body.status === "suspended"
        ? body.status
        : undefined;
    if (!nextRole && !nextStatus) {
      return fail("Nothing to update — send role and/or status.", "BAD_REQUEST");
    }

    // Self-protection: no admin can demote or suspend their own account.
    if (target.id === admin.id && (nextRole === "user" || nextStatus === "suspended")) {
      return fail(
        "You can't demote or suspend your own account. Ask another admin.",
        "FORBIDDEN"
      );
    }

    if (nextRole === "user" && target.role === "admin") {
      const admins = (
        db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as {
          n: number;
        }
      ).n;
      if (admins <= 1) return fail("At least one admin must remain.", "FORBIDDEN");
    }

    const now = nowIso();
    const changes: string[] = [];

    if (nextRole && nextRole !== target.role) {
      db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(
        nextRole,
        now,
        target.id
      );
      changes.push(`role ${target.role} → ${nextRole}`);
      logEvent(
        target.id,
        "admin_action",
        `Role changed to ${nextRole} by an admin`,
        { from: target.role, to: nextRole },
        admin.id
      );
    }

    if (nextStatus && nextStatus !== target.status) {
      db.prepare(
        "UPDATE users SET status = ?, disabled_at = ?, updated_at = ? WHERE id = ?"
      ).run(nextStatus, nextStatus === "suspended" ? now : null, now, target.id);
      changes.push(`status ${target.status} → ${nextStatus}`);

      if (nextStatus === "suspended") {
        // Suspension takes effect immediately — every device is signed out.
        await revokeAllSessions(target.id);
      }
      logEvent(
        target.id,
        "admin_action",
        `Account ${nextStatus === "suspended" ? "suspended" : "reactivated"} by an admin`,
        { to: nextStatus },
        admin.id
      );
    }

    const updated = db
      .prepare(
        "SELECT id, role, COALESCE(status,'active') AS status FROM users WHERE id = ?"
      )
      .get(target.id) as { id: string; role: string; status: string };

    return ok({
      user: { id: updated.id, role: updated.role, status: updated.status },
      changes,
    });
  } catch (err) {
    return serverError("admin:user-patch", err);
  }
}

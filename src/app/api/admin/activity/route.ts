import { requireAdmin, ok, serverError } from "@/server/api";
import { activityCount, systemActivity } from "@/server/activity";
import { parsePageParams } from "@/server/validation";

const AUTH_TYPES = new Set([
  "signin",
  "signout",
  "signin_blocked",
  "password_changed",
  "password_reset",
  "account_created",
  "account_verified",
  "account_deleted",
]);

/**
 * GET /api/admin/activity?limit=&page=&filter=all|auth|creation|admin
 * Role-gated system feed; paged so the log can grow without slowing the UI.
 */
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") ?? "all";
    const { limit } = parsePageParams(req.url, { defaultLimit: 30, maxLimit: 100 });
    const rawPage = Number(url.searchParams.get("page"));
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

    const rows = await systemActivity(200, 0); // recent window, then filter in memory
    const filtered = rows.filter((r) => {
      if (filter === "auth") return AUTH_TYPES.has(r.type);
      if (filter === "creation") return r.type.startsWith("creation");
      if (filter === "admin") return r.type === "admin_action";
      return true;
    });

    const start = (page - 1) * limit;
    return ok({
      events: filtered.slice(start, start + limit).map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        userId: r.user_id,
        actorId: r.actor_id ?? null,
        createdAt: r.created_at,
      })),
      page,
      limit,
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit)),
      totalLogged: await activityCount(),
      filter,
    });
  } catch (err) {
    return serverError("admin:activity", err);
  }
}

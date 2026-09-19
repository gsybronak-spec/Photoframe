import { getDb, nowIso } from "@/server/db";
import { requireAdmin, ok, serverError } from "@/server/api";
import { cleanText, parsePageParams } from "@/server/validation";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string | null;
  email_verified_at: string | null;
  created_at: string;
  creations: number;
  public_creations: number;
  plan_id: string | null;
  last_seen_at: string | null;
}

/**
 * GET /api/admin/users?q=&page=&limit=
 * Role-gated. Search matches name or email; results are paged server-side so the
 * admin UI never loads the whole table.
 */
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const url = new URL(req.url);
    const q = cleanText(url.searchParams.get("q"), 80);
    const { limit } = parsePageParams(req.url, { defaultLimit: 25, maxLimit: 100 });
    const rawPage = Number(url.searchParams.get("page"));
    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const offset = (page - 1) * limit;

    const db = getDb();
    const like = `%${q.toLowerCase()}%`;
    const where = q
      ? "WHERE lower(u.email) LIKE ? OR lower(u.name) LIKE ?"
      : "";
    const args: (string | number)[] = q ? [like, like] : [];

    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, COALESCE(u.status,'active') AS status,
                u.email_verified_at, u.created_at,
                (SELECT COUNT(*) FROM creations c WHERE c.user_id = u.id) AS creations,
                (SELECT COUNT(*) FROM creations c WHERE c.user_id = u.id AND c.visibility = 'public') AS public_creations,
                (SELECT s.plan_id FROM subscriptions s WHERE s.user_id = u.id) AS plan_id,
                (SELECT MAX(se.last_seen_at) FROM sessions se WHERE se.user_id = u.id) AS last_seen_at
         FROM users u ${where}
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...args, limit, offset) as UserRow[];

    const total = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM users u ${where}`)
        .get(...args) as { n: number }
    ).n;

    return ok({
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role === "admin" ? "admin" : "user",
        status: r.status === "suspended" ? "suspended" : "active",
        emailVerified: Boolean(r.email_verified_at),
        createdAt: r.created_at,
        creations: r.creations,
        publicCreations: r.public_creations,
        plan: r.plan_id ?? "free",
        lastSeenAt: r.last_seen_at,
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      query: q,
      generatedAt: nowIso(),
    });
  } catch (err) {
    return serverError("admin:users", err);
  }
}

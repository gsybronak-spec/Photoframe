import { getDb, nowIso } from "@/server/db";
import { requireAdmin, ok, serverError } from "@/server/api";
import { systemActivity, authActivityCount, activityCount } from "@/server/activity";
import { emailProviderStatus, recentEmailDeliveries } from "@/server/email";
import { planBreakdown } from "@/server/entitlements";
import { analyticsSummary, analyticsTotal } from "@/server/analytics";
import { getCatalog, getSettings } from "@/server/frame-catalog";

/** GET /api/admin/overview — role-gated platform snapshot. */
export async function GET() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    const db = await getDb();
    const count = async (
      sql: string,
      ...args: (string | number)[]
    ): Promise<number> => ((await db.prepare(sql).get(...args)) as { n: number }).n;

    const since7 = new Date(Date.now() - 7 * 86400e3).toISOString();
    const since30 = new Date(Date.now() - 30 * 86400e3).toISOString();

    const catalog = await getCatalog();
    const activity = {
      total: await activityCount(),
      authEvents: await authActivityCount(),
      recent: await systemActivity(8),
    };
    const plans = await planBreakdown();
    const analytics = {
      total: await analyticsTotal(),
      byEvent: await analyticsSummary(30),
    };
    const settings = await getSettings();
    const email = { ...emailProviderStatus(), recent: await recentEmailDeliveries(5) };

    return ok({
      admin: { id: user.id, name: user.name },
      stats: {
        users: await count("SELECT COUNT(*) AS n FROM users"),
        verifiedUsers: await count(
          "SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL"
        ),
        suspendedUsers: await count(
          "SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"
        ),
        newUsers7d: await count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", since7),
        newUsers30d: await count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", since30),
        creations: await count("SELECT COUNT(*) AS n FROM creations"),
        creations7d: await count(
          "SELECT COUNT(*) AS n FROM creations WHERE created_at >= ?",
          since7
        ),
        publicCreations: await count(
          "SELECT COUNT(*) AS n FROM creations WHERE visibility = 'public'"
        ),
        savedFrames: await count("SELECT COUNT(*) AS n FROM saved_frames"),
        activeSessions: await count(
          "SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?",
          nowIso()
        ),
        activeUsers7d: await count(
          "SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_seen_at >= ?",
          since7
        ),
        storageBytes: await count("SELECT COALESCE(SUM(bytes), 0) AS n FROM creations"),
      },
      frames: {
        total: catalog.length,
        active: catalog.filter((f) => f.active).length,
        featured: catalog.filter((f) => f.featured).length,
        overridden: catalog.filter((f) => f.overridden).length,
      },
      activity,
      plans,
      analytics,
      email,
      settings,
    });
  } catch (err) {
    return serverError("admin:overview", err);
  }
}

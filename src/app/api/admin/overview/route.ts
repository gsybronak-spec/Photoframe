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
    const db = getDb();
    const count = (sql: string, ...args: (string | number)[]): number =>
      (db.prepare(sql).get(...args) as { n: number }).n;

    const since7 = new Date(Date.now() - 7 * 86400e3).toISOString();
    const since30 = new Date(Date.now() - 30 * 86400e3).toISOString();

    const catalog = getCatalog();

    return ok({
      admin: { id: user.id, name: user.name },
      stats: {
        users: count("SELECT COUNT(*) AS n FROM users"),
        verifiedUsers: count(
          "SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL"
        ),
        suspendedUsers: count(
          "SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"
        ),
        newUsers7d: count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", since7),
        newUsers30d: count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", since30),
        creations: count("SELECT COUNT(*) AS n FROM creations"),
        creations7d: count(
          "SELECT COUNT(*) AS n FROM creations WHERE created_at >= ?",
          since7
        ),
        publicCreations: count(
          "SELECT COUNT(*) AS n FROM creations WHERE visibility = 'public'"
        ),
        savedFrames: count("SELECT COUNT(*) AS n FROM saved_frames"),
        activeSessions: count(
          "SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?",
          nowIso()
        ),
        activeUsers7d: count(
          "SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_seen_at >= ?",
          since7
        ),
        storageBytes: count("SELECT COALESCE(SUM(bytes), 0) AS n FROM creations"),
      },
      frames: {
        total: catalog.length,
        active: catalog.filter((f) => f.active).length,
        featured: catalog.filter((f) => f.featured).length,
        overridden: catalog.filter((f) => f.overridden).length,
      },
      activity: {
        total: activityCount(),
        authEvents: authActivityCount(),
        recent: systemActivity(8),
      },
      plans: planBreakdown(),
      analytics: { total: analyticsTotal(), byEvent: analyticsSummary(30) },
      email: { ...emailProviderStatus(), recent: recentEmailDeliveries(5) },
      settings: getSettings(),
    });
  } catch (err) {
    return serverError("admin:overview", err);
  }
}

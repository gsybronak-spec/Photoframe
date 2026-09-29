import { requireAdmin, ok, serverError } from "@/server/api";
import { campaignMetrics } from "@/server/campaigns";

/** GET /api/admin/campaigns/metrics — studio dashboard counters. */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    return ok({ metrics: await campaignMetrics() });
  } catch (err) {
    return serverError("admin:campaigns:metrics", err);
  }
}

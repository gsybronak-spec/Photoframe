import { requireAdmin, ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";
import { setCampaignStatus, CAMPAIGN_STATUSES, type CampaignStatus } from "@/server/campaigns";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/campaigns/:id/status — publish lifecycle control. */
export async function PATCH(req: Request, { params }: Params) {
  const limited = await guardRate(req, "admin:campaigns:status", 40, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await readJson<{ status?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");
  if (!body.status || !CAMPAIGN_STATUSES.includes(body.status as CampaignStatus)) {
    return fail("Invalid campaign status", "BAD_REQUEST");
  }

  try {
    const campaign = await setCampaignStatus(id, body.status as CampaignStatus);
    return ok({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("not found")) return fail(message, "NOT_FOUND");
    if (message.includes("Invalid")) return fail(message, "BAD_REQUEST");
    return serverError("admin:campaigns:status", err);
  }
}

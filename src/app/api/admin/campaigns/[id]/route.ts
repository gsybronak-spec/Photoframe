import {
  requireAdmin,
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  serverError,
} from "@/server/api";
import {
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  CAMPAIGN_STATUSES,
  type CampaignPhotoConfig,
  type CampaignNameConfig,
  type CampaignStatus,
} from "@/server/campaigns";
import { deleteCreationImage } from "@/server/storage";
import { logEvent } from "@/server/activity";

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/campaigns/:id — full composition (admin only). */
export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const campaign = await getCampaignById(id);
    if (!campaign) return fail("Campaign not found", "NOT_FOUND");
    return ok({ campaign });
  } catch (err) {
    return serverError("admin:campaigns:get", err);
  }
}

interface UpdateBody {
  name?: string;
  slug?: string;
  district?: string | null;
  description?: string;
  status?: string;
  canvas_width?: number;
  canvas_height?: number;
  art_x?: number;
  art_y?: number;
  art_w?: number;
  art_h?: number;
  art_rotation?: number;
  photoConfig?: CampaignPhotoConfig;
  nameConfig?: CampaignNameConfig;
}

/** PUT /api/admin/campaigns/:id — persist the full composition. */
export async function PUT(req: Request, { params }: Params) {
  const limited = await guardRate(req, "admin:campaigns:update", 60, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await readJson<UpdateBody>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");
  if (body.status !== undefined && !CAMPAIGN_STATUSES.includes(body.status as CampaignStatus)) {
    return fail("Invalid campaign status", "BAD_REQUEST");
  }

  try {
    const campaign = await updateCampaign(id, {
      ...body,
      status: body.status as CampaignStatus | undefined,
    });
    await logEvent(user.id, "campaign_updated", `Updated campaign “${campaign.name}”`, {
      campaignId: campaign.id,
    });
    return ok({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("not found")) return fail(message, "NOT_FOUND");
    if (message.includes("already taken")) return fail(message, "CONFLICT");
    if (message.includes("required") || message.includes("invalid") || message.includes("Invalid")) {
      return fail(message, "BAD_REQUEST");
    }
    return serverError("admin:campaigns:update", err);
  }
}

/** DELETE /api/admin/campaigns/:id — removes the row (configs/events cascade) and stored artwork. */
export async function DELETE(req: Request, { params }: Params) {
  const limited = await guardRate(req, "admin:campaigns:delete", 20, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const campaign = await getCampaignById(id);
    if (!campaign) return fail("Campaign not found", "NOT_FOUND");

    const artworkKey = await deleteCampaign(id);
    if (artworkKey) await deleteCreationImage(artworkKey);

    await logEvent(user.id, "campaign_deleted", `Deleted campaign “${campaign.name}”`, {
      campaignId: id,
    });
    return ok({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("not found")) return fail(message, "NOT_FOUND");
    return serverError("admin:campaigns:delete", err);
  }
}

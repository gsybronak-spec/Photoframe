import { requireAdmin, ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";
import {
  listCampaigns,
  createCampaign,
  distinctDistricts,
  CAMPAIGN_STATUSES,
  type CampaignPhotoConfig,
  type CampaignNameConfig,
  type CampaignStatus,
} from "@/server/campaigns";
import { logEvent } from "@/server/activity";

/**
 * GET /api/admin/campaigns — role-gated campaign list with pagination,
 * status filter and search (name/slug). Includes per-campaign anonymous
 * generate/share counts and the districts currently in use.
 */
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 12));
    const status = url.searchParams.get("status") ?? "all";
    const search = (url.searchParams.get("search") ?? "").slice(0, 80);

    const [{ items, total }, districts] = await Promise.all([
      listCampaigns({ status, search, limit, offset: (page - 1) * limit }),
      distinctDistricts(),
    ]);

    return ok({
      campaigns: items.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        district: c.district,
        description: c.description,
        status: c.status,
        hasArtwork: Boolean(c.artwork_key),
        canvas: { width: c.canvas_width, height: c.canvas_height },
        art: { x: c.art_x, y: c.art_y, width: c.art_w, height: c.art_h, rotation: c.art_rotation },
        photoConfig: c.photoConfig,
        nameConfig: c.nameConfig,
        frames: c.frames,
        shares: c.shares,
        activatedAt: c.activated_at,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      districts,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    return serverError("admin:campaigns:list", err);
  }
}

interface CreateBody {
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

/** POST /api/admin/campaigns — create a campaign (defaults to draft). */
export async function POST(req: Request) {
  const limited = await guardRate(req, "admin:campaigns:create", 30, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await readJson<CreateBody>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");
  if (!body.name || !body.name.trim()) {
    return fail("Campaign name is required", "BAD_REQUEST");
  }
  if (body.status !== undefined && !CAMPAIGN_STATUSES.includes(body.status as CampaignStatus)) {
    return fail("Invalid campaign status", "BAD_REQUEST");
  }

  try {
    const campaign = await createCampaign({
      name: body.name,
      slug: body.slug,
      district: body.district ?? null,
      description: body.description,
      status: body.status as CampaignStatus | undefined,
      canvas_width: body.canvas_width,
      canvas_height: body.canvas_height,
      art_x: body.art_x,
      art_y: body.art_y,
      art_w: body.art_w,
      art_h: body.art_h,
      art_rotation: body.art_rotation,
      photoConfig: body.photoConfig ?? null,
      nameConfig: body.nameConfig ?? null,
      createdBy: user.id,
    });
    await logEvent(user.id, "campaign_created", `Created campaign “${campaign.name}”`, {
      campaignId: campaign.id,
    });
    return ok({ campaign }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("already taken")) return fail(message, "CONFLICT");
    if (message.includes("required")) return fail(message, "BAD_REQUEST");
    return serverError("admin:campaigns:create", err);
  }
}

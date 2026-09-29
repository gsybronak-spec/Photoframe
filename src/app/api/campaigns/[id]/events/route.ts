import { fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";
import {
  getCampaignById,
  recordCampaignEvent,
  CAMPAIGN_EVENT_TYPES,
  type CampaignEventType,
} from "@/server/campaigns";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/campaigns/:id/events — anonymous aggregate analytics.
 *
 * Records ONLY a campaign id + event type. No user photo, no generated image,
 * no name, no IP, no PII — the composite never leaves the user's browser.
 * Rate-limited per IP like the reference implementation.
 */
export async function POST(req: Request, { params }: Params) {
  const limited = await guardRate(req, "campaigns:events", 60, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  try {
    const { id } = await params;
    const body = await readJson<{ eventType?: string }>(req);
    const eventType = (body?.eventType ?? "").toLowerCase() as CampaignEventType;
    if (!(CAMPAIGN_EVENT_TYPES as readonly string[]).includes(eventType)) {
      return fail(`Invalid event type: ${body?.eventType ?? ""}`, "BAD_REQUEST");
    }

    const campaign = await getCampaignById(id);
    if (!campaign || campaign.status !== "active") {
      return fail("Campaign not found", "NOT_FOUND");
    }

    await recordCampaignEvent(id, eventType);
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError("campaigns:events", err);
  }
}

import { fail, serverError } from "@/server/api";
import { getCampaignById } from "@/server/campaigns";
import { getStorage } from "@/server/storage";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/campaigns/:id/artwork — public artwork bytes for the user wizard.
 * Served only while the campaign is ACTIVE (draft/paused/archived → 404), and
 * always same-origin so the browser canvas can composite it without tainting.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = await getCampaignById(id);
    if (!campaign || campaign.status !== "active" || !campaign.artwork_key) {
      return fail("Artwork not found", "NOT_FOUND");
    }

    const buf = await getStorage().get(campaign.artwork_key);
    if (!buf) return fail("Artwork not found", "NOT_FOUND");

    const body = new Uint8Array(buf);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": campaign.artwork_mime ?? "image/png",
        "Content-Length": String(buf.length),
        // Short cache: re-uploaded artwork must propagate quickly.
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return serverError("campaigns:artwork", err);
  }
}

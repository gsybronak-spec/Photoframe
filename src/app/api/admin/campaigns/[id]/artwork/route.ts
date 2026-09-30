import { requireAdmin, fail, serverError } from "@/server/api";
import { getCampaignById, resolveCampaignArtwork } from "@/server/campaigns";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/campaigns/:id/artwork — artwork bytes for the studio editor.
 * Admin-only so drafts stay private; the public wizard uses the
 * active-campaign-gated route instead.
 */
export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const campaign = await getCampaignById(id);
    if (!campaign || !campaign.artwork_key) {
      return fail("Artwork not found", "NOT_FOUND");
    }

    const resolved = await resolveCampaignArtwork(campaign);
    if (!resolved) {
      return fail("Artwork not found", "NOT_FOUND");
    }

    const body = new Uint8Array(resolved.buf);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": resolved.mime,
        "Content-Length": String(resolved.buf.length),
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    return serverError("admin:campaigns:artwork", err);
  }
}

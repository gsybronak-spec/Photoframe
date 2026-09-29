import { requireAdmin, fail, serverError } from "@/server/api";
import { getCampaignById } from "@/server/campaigns";
import { getStorage } from "@/server/storage";
import { getDb, nowIso } from "@/server/db";

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

    const buf = await getStorage().get(campaign.artwork_key);
    if (!buf) {
      // Self-heal: if the stored object is gone (e.g. storage was rebuilt),
      // clear the dead reference so the admin sees an honest state.
      const db = await getDb();
      await db
        .prepare(
          `UPDATE campaigns SET artwork_key = NULL, artwork_mime = NULL, artwork_bytes = 0, updated_at = ? WHERE id = ?`
        )
        .run(nowIso(), id);
      return fail("Artwork not found", "NOT_FOUND");
    }

    const body = new Uint8Array(buf);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": campaign.artwork_mime ?? "image/png",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    return serverError("admin:campaigns:artwork", err);
  }
}

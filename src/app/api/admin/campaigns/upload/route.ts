import {
  requireAdmin,
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  serverError,
} from "@/server/api";
import { parseDataUrl, imageMime, extensionFor, contentTypeFor } from "@/server/validation";
import { putImage, deleteCreationImage } from "@/server/storage";
import { getCampaignById, createCampaign, campaignArtworkKey } from "@/server/campaigns";
import { getDb, nowIso } from "@/server/db";

const MAX_ARTWORK_BYTES = 8 * 1024 * 1024; // 8 MB artwork ceiling

/**
 * POST /api/admin/campaigns/upload — store campaign artwork.
 *
 * Body: { dataUrl, campaignId?, name? }
 * When campaignId is absent a draft campaign is created first, so the studio
 * supports the upload-first flow without ever writing outside the campaign's
 * own storage namespace. Images are validated by magic bytes (a renamed .exe
 * can never pass) and hard size-capped.
 */
export async function POST(req: Request) {
  const limited = await guardRate(req, "admin:campaigns:upload", 20, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await readJson<{ dataUrl?: string; campaignId?: string; name?: string }>(req);
  if (!body?.dataUrl) return fail("No artwork file provided", "BAD_REQUEST");

  try {
    const parsed = parseDataUrl(body.dataUrl, MAX_ARTWORK_BYTES);
    if (!parsed) {
      return fail("Artwork is too large (8 MB max) or not a valid image data URL.", "PAYLOAD_TOO_LARGE");
    }
    const mime = imageMime(parsed.buf);
    if (!mime) {
      return fail("Unsupported image format. PNG, JPEG or WebP only.", "UNSUPPORTED_MEDIA");
    }

    // Resolve or lazily create the owning campaign.
    let campaign = body.campaignId ? await getCampaignById(body.campaignId) : null;
    if (body.campaignId && !campaign) {
      return fail("Campaign not found", "NOT_FOUND");
    }
    if (!campaign) {
      campaign = await createCampaign({
        name: body.name?.trim() || "Untitled campaign",
        createdBy: user.id,
      });
    }

    const key = campaignArtworkKey(campaign.id, extensionFor(mime));
    const stored = await putImage(key, parsed.buf);

    const db = await getDb();
    const now = nowIso();
    try {
      await db
        .prepare(
          `UPDATE campaigns
              SET artwork_key = ?, artwork_mime = ?, artwork_bytes = ?, updated_at = ?
            WHERE id = ?`
        )
        .run(key, contentTypeFor(mime), stored.bytes, now, campaign.id);
    } catch (dbErr) {
      // Never leave orphaned objects behind when the row can't be updated.
      await deleteCreationImage(key);
      throw dbErr;
    }

    return ok({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
      },
      artwork: {
        key,
        bytes: stored.bytes,
        mime: contentTypeFor(mime),
        adminUrl: `/api/admin/campaigns/${campaign.id}/artwork`,
        publicUrl: `/api/campaigns/${campaign.id}/artwork`,
      },
    });
  } catch (err) {
    return serverError("admin:campaigns:upload", err);
  }
}

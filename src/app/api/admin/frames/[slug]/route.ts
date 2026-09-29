import { revalidatePath } from "next/cache";
import { requireAdmin, ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";
import { updateFrame, type FramePatch } from "@/server/frame-catalog";
import { logEvent } from "@/server/activity";
import { cleanSlug } from "@/server/validation";

/**
 * PATCH /api/admin/frames/:slug — manage frame metadata.
 * Body: { description?, category?, tags?, featured?, active? }
 *
 * Artwork can't be edited (it lives in code), only metadata — so a bad admin
 * edit can never break a frame's rendering.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limited = await guardRate(req, "admin-frame-patch", 120, 10 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user: admin, error } = await requireAdmin();
  if (error) return error;

  const body = await readJson<{
    description?: string;
    category?: string;
    tags?: unknown;
    featured?: boolean;
    active?: boolean;
  }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  try {
    const { slug } = await params;
    const safeSlug = cleanSlug(slug);
    if (!safeSlug) return fail("Unknown frame.", "NOT_FOUND");

    const patch: FramePatch = {};
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.category !== undefined) patch.category = String(body.category);
    if (body.featured !== undefined) patch.featured = Boolean(body.featured);
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.tags !== undefined) {
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t)).slice(0, 8)
        : String(body.tags)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 8);
      patch.tags = tags;
    }

    const updated = await updateFrame(safeSlug, patch, admin.id);
    if (!updated) return fail("Unknown frame.", "NOT_FOUND");

    try {
      revalidatePath("/");
      revalidatePath("/frames");
      revalidatePath(`/frames/${updated.slug}`);
    } catch {
      // Ignore if called outside static generation context
    }

    await logEvent(
      admin.id,
      "admin_action",
      `Updated frame “${updated.title}”`,
      { frame: updated.slug, fields: Object.keys(patch) },
      admin.id
    );

    return ok({
      frame: {
        slug: updated.slug,
        title: updated.title,
        description: updated.description,
        category: updated.category,
        tags: updated.tags,
        featured: updated.featured,
        active: updated.active,
        overridden: Boolean(updated.overridden),
      },
    });
  } catch (err) {
    return serverError("admin:frame-patch", err);
  }
}

import { revalidatePath } from "next/cache";
import { ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";
import { getCurrentUser } from "@/server/sessions";
import { findAnyFrame, getCatalog, updateFrame, type FramePatch } from "@/server/frame-catalog";
import { cleanSlug } from "@/server/validation";
import type { FrameNumericSettings } from "@/lib/frames";

/**
 * GET /api/frames/:slug/settings — returns the resolved frame settings (with DB overrides + code defaults)
 * and the full 24-frame selector list so Frame Settings never loses any frame.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const safeSlug = cleanSlug(slug);
    if (!safeSlug) return fail("Unknown frame.", "NOT_FOUND");

    const frame = await findAnyFrame(safeSlug);
    if (!frame) return fail("Unknown frame.", "NOT_FOUND");

    const catalog = await getCatalog();

    return ok({
      frame: {
        id: frame.id,
        slug: frame.slug,
        title: frame.title,
        occasion: frame.occasion,
        tagline: frame.tagline,
        art: frame.art,
        category: frame.category,
        description: frame.description,
        tags: frame.tags,
        active: frame.active,
        featured: frame.featured,
        settings: frame.settings,
        overridden: Boolean(frame.overridden),
        updatedAt: frame.updated_at ?? null,
      },
      frames: catalog.map((f) => ({
        id: f.id,
        slug: f.slug,
        title: f.title,
        occasion: f.occasion,
        category: f.category,
        active: f.active,
        featured: f.featured,
        settings: f.settings,
      })),
    });
  } catch (err) {
    return serverError("frames:settings-get", err);
  }
}

/**
 * PATCH /api/frames/:slug/settings — persists numerical & typography frame settings
 * to the database (`frame_overrides.settings_json`) so settings survive page refresh and re-opening.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limited = await guardRate(req, "frame-settings-patch", 120, 10 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const body = await readJson<{
    settings?: Partial<FrameNumericSettings>;
    font_family?: string;
    font_size?: number;
    line_height?: number;
    letter_spacing?: number;
    text_scale?: number;
    text_x?: number;
    text_y?: number;
    text_width?: number;
    text_opacity?: number;
    photo_scale?: number;
    border_opacity?: number;
  }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  try {
    const { slug } = await params;
    const safeSlug = cleanSlug(slug);
    if (!safeSlug) return fail("Unknown frame.", "NOT_FOUND");

    const user = await getCurrentUser();
    const patch: FramePatch = {};
    if (body.settings && typeof body.settings === "object") {
      patch.settings = body.settings;
    }
    if (body.font_family !== undefined) patch.font_family = body.font_family;
    if (body.font_size !== undefined) patch.font_size = body.font_size;
    if (body.line_height !== undefined) patch.line_height = body.line_height;
    if (body.letter_spacing !== undefined) patch.letter_spacing = body.letter_spacing;
    if (body.text_scale !== undefined) patch.text_scale = body.text_scale;
    if (body.text_x !== undefined) patch.text_x = body.text_x;
    if (body.text_y !== undefined) patch.text_y = body.text_y;
    if (body.text_width !== undefined) patch.text_width = body.text_width;
    if (body.text_opacity !== undefined) patch.text_opacity = body.text_opacity;
    if (body.photo_scale !== undefined) patch.photo_scale = body.photo_scale;
    if (body.border_opacity !== undefined) patch.border_opacity = body.border_opacity;

    const updated = await updateFrame(safeSlug, patch, user?.id ?? "editor");
    if (!updated) return fail("Unknown frame.", "NOT_FOUND");

    try {
      revalidatePath("/");
      revalidatePath("/frames");
      revalidatePath(`/frames/${updated.slug}`);
    } catch {
      // Ignore outside static generation context
    }

    return ok({
      frame: {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        settings: updated.settings,
        overridden: Boolean(updated.overridden),
        updatedAt: updated.updated_at ?? null,
      },
    });
  } catch (err) {
    return serverError("frames:settings-patch", err);
  }
}

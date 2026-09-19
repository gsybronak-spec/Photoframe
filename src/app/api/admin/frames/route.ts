import { requireAdmin, ok, serverError } from "@/server/api";
import { getCatalog, getSettings, featuredSlugs } from "@/server/frame-catalog";
import { OCCASIONS } from "@/lib/frames";

/** GET /api/admin/frames — the full catalogue, including inactive frames. */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const catalog = await getCatalog();
    return ok({
      frames: catalog.map((f) => ({
        slug: f.slug,
        title: f.title,
        occasion: f.occasion,
        tagline: f.tagline,
        art: f.art,
        category: f.category,
        description: f.description,
        tags: f.tags,
        active: f.active,
        featured: f.featured,
        overridden: Boolean(f.overridden),
        updatedAt: f.updated_at ?? null,
      })),
      categories: OCCASIONS,
      settings: await getSettings(),
      featured: await featuredSlugs(),
    });
  } catch (err) {
    return serverError("admin:frames", err);
  }
}

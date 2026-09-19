import { requireAdmin, ok, fail, assertSameOrigin, guardRate, readJson, serverError } from "@/server/api";
import { getSettings, setSettings, getCatalog } from "@/server/frame-catalog";
import { logEvent } from "@/server/activity";

/** GET /api/admin/content — homepage configuration + featured frames. */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const catalog = await getCatalog();
    return ok({
      settings: await getSettings(),
      featured: catalog
        .filter((f) => f.featured && f.active)
        .map((f) => ({ slug: f.slug, title: f.title })),
    });
  } catch (err) {
    return serverError("admin:content:get", err);
  }
}

/**
 * PATCH /api/admin/content — homepage tagline and featured rail size.
 * Body: { hero_tagline?, featured_limit? }
 */
export async function PATCH(req: Request) {
  const limited = await guardRate(req, "admin-content-patch", 60, 10 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user: admin, error } = await requireAdmin();
  if (error) return error;

  const body = await readJson<{ hero_tagline?: string; featured_limit?: number }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  try {
    const settings = await setSettings(
      {
        hero_tagline:
          body.hero_tagline === undefined ? undefined : String(body.hero_tagline),
        featured_limit:
          body.featured_limit === undefined ? undefined : Number(body.featured_limit),
      },
      admin.id
    );
    await logEvent(
      admin.id,
      "admin_action",
      "Updated homepage content",
      { ...settings },
      admin.id
    );
    return ok({ settings });
  } catch (err) {
    return serverError("admin:content:patch", err);
  }
}

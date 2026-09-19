import { getDb } from "@/server/db";
import { readCreationImage } from "@/server/storage";
import { fail, serverError } from "@/server/api";

interface PublicRow {
  id: string;
  mime_type: string;
  storage_path: string;
  bytes: number;
  published_at: string | null;
}

/**
 * GET /api/public/creations/:slug/image — the image behind a share link.
 *
 * Authorization rule: the creation must be `visibility = 'public'` AND still own
 * that exact slug. Revoking a share nulls the slug, so this 404s immediately and
 * no user, session or account detail is ever involved.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length > 64 || !/^[A-Za-z0-9_-]+$/.test(slug)) {
      return fail("Not found", "NOT_FOUND");
    }

    const row = getDb()
      .prepare(
        `SELECT id, mime_type, storage_path, bytes, published_at
         FROM creations WHERE share_slug = ? AND visibility = 'public'`
      )
      .get(slug) as PublicRow | undefined;

    if (!row) return fail("Not found", "NOT_FOUND");

    const buf = await readCreationImage(row.storage_path);
    if (!buf) return fail("Image missing", "NOT_FOUND");

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.mime_type,
        "Content-Length": String(buf.length),
        // Publicly cacheable, but deliberately NOT `immutable`: a revoked share
        // must stop resolving everywhere within an hour, so caches revalidate.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        ETag: `"pub-${row.id}-${row.bytes}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return serverError("public-creation-image", err);
  }
}

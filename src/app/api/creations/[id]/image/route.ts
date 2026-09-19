import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/sessions";
import { readCreationImage } from "@/server/storage";
import { cleanId } from "@/server/validation";
import { fail, serverError } from "@/server/api";

interface ImageRow {
  user_id: string;
  mime_type: string;
  storage_path: string;
  thumb_path: string | null;
  bytes: number;
  thumb_bytes: number | null;
  updated_at: string;
}

/**
 * GET /api/creations/:id/image[?variant=thumb|full][&download=1]
 *
 * Private by default: only the owner (or an admin) can read the bytes. The
 * dashboard requests `variant=thumb` so grids never pull full-size composites.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Sign in required", "UNAUTHORIZED");

    const { id } = await params;
    const safeId = cleanId(id);
    if (!safeId) return fail("Not found", "NOT_FOUND");

    const row = getDb()
      .prepare(
        `SELECT user_id, mime_type, storage_path, thumb_path, bytes, thumb_bytes, updated_at
         FROM creations WHERE id = ?`
      )
      .get(safeId) as ImageRow | undefined;

    if (!row) return fail("Not found", "NOT_FOUND");
    if (row.user_id !== user.id && user.role !== "admin") {
      return fail("Forbidden", "FORBIDDEN");
    }

    const url = new URL(req.url);
    const wantsThumb = url.searchParams.get("variant") === "thumb";
    const key = wantsThumb && row.thumb_path ? row.thumb_path : row.storage_path;
    const bytes = wantsThumb && row.thumb_path ? (row.thumb_bytes ?? 0) : row.bytes;
    const contentType =
      wantsThumb && row.thumb_path ? "image/jpeg" : row.mime_type;

    const etag = `W/"${safeId}-${wantsThumb && row.thumb_path ? "t" : "f"}-${bytes}-${row.updated_at}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    const buf = await readCreationImage(key);
    if (!buf) return fail("Image missing", "NOT_FOUND");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(buf.length),
      // Private: shared caches (CDNs/proxies) must not store a user's image.
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    };
    if (url.searchParams.get("download") === "1") {
      headers["Content-Disposition"] = `attachment; filename="zenframe-${safeId}.png"`;
    }

    return new Response(new Uint8Array(buf), { headers });
  } catch (err) {
    return serverError("creation-image", err);
  }
}

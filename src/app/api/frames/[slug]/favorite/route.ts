import { getDb, nowIso } from "@/server/db";
import { getCurrentUser } from "@/server/sessions";
import { findAnyFrame } from "@/server/frame-catalog";
import { logEvent } from "@/server/activity";
import { cleanSlug } from "@/server/validation";
import { ok, fail, assertSameOrigin, serverError } from "@/server/api";

/** POST /api/frames/:slug/favorite — toggle a bookmark (saved frame). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const user = await getCurrentUser();
  if (!user) return fail("Sign in required", "UNAUTHORIZED");

  try {
    const { slug } = await params;
    const safeSlug = cleanSlug(slug);
    const frame = safeSlug ? await findAnyFrame(safeSlug) : undefined;
    if (!frame) return fail("Unknown frame.", "NOT_FOUND");

    const db = await getDb();
    const existing = await db
      .prepare("SELECT 1 AS x FROM saved_frames WHERE user_id = ? AND frame_id = ?")
      .get(user.id, frame.slug);

    if (existing) {
      await db
        .prepare("DELETE FROM saved_frames WHERE user_id = ? AND frame_id = ?")
        .run(user.id, frame.slug);
      await logEvent(user.id, "frame_unfavorited", `Removed “${frame.title}” from saved frames`);
      return ok({ saved: false });
    }

    await db
      .prepare("INSERT INTO saved_frames (user_id, frame_id, created_at) VALUES (?, ?, ?)")
      .run(user.id, frame.slug, nowIso());
    await logEvent(user.id, "frame_favorited", `Saved “${frame.title}” to your frames`);
    return ok({ saved: true });
  } catch (err) {
    return serverError("frame:favorite", err);
  }
}
